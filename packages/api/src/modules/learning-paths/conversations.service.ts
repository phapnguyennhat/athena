import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';
import { DataSource, In, Repository } from 'typeorm';
import { REDIS } from '../../redis/redis.module.js';
import { AiJob } from '../ai-jobs/ai-job.entity.js';
import { AiError, serverReady, validateChatOutput } from './ai-output.js';
import type { Preferences } from './dto/learning-path.dto.js';
import { LearningPathEntity } from './entities/learning-path.entity.js';
import { PathConversation } from './entities/path-conversation.entity.js';
import { PathMessage } from './entities/path-message.entity.js';
import { PathAi } from './path-ai.js';

export const GREETING = 'Chào bạn! Bạn muốn học chủ đề gì? Cứ nói tự nhiên, mình sẽ hỏi thêm vài điều để soạn lộ trình.';
export const GREETING_QUICK_REPLIES = ['SQL căn bản', 'Tiếng Anh giao tiếp', 'Tài chính cá nhân'];

const MAX_USER_TURNS = 20;
const LOCK_TTL_SECONDS = 45;
const HISTORY_STORED = 11;

export type ConversationView = {
  id: string;
  messages: { role: 'user' | 'assistant'; content: string; quickReplies: string[] | null }[];
  preferences: Preferences;
  ready: boolean;
  activeJob: { id: string; status: string } | null;
  draftPathId: string | null;
};

const err = (Ex: typeof ConflictException, statusCode: number, code: string, message: string) =>
  new Ex({ statusCode, code, message });

@Injectable()
export class ConversationsService {
  private readonly log = new Logger(ConversationsService.name);

  constructor(
    private readonly ds: DataSource,
    @InjectRepository(PathConversation) private readonly convs: Repository<PathConversation>,
    @InjectRepository(PathMessage) private readonly msgs: Repository<PathMessage>,
    @InjectRepository(LearningPathEntity) private readonly paths: Repository<LearningPathEntity>,
    @InjectRepository(AiJob) private readonly jobs: Repository<AiJob>,
    private readonly ai: PathAi,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async current(userId: string): Promise<ConversationView | null> {
    const conv = await this.convs.findOneBy({ userId, status: 'open' });
    return conv ? this.view(conv) : null;
  }

  /** Closes the user's open conversation (and its draft path), then opens a fresh one with the greeting. */
  async startOver(userId: string): Promise<ConversationView> {
    const conv = await this.ds.transaction(async (m) => {
      const old = await m.findOneBy(PathConversation, { userId, status: 'open' });
      if (old) {
        await m.delete(LearningPathEntity, { conversationId: old.id, status: 'draft' });
        await m.update(PathConversation, old.id, { status: 'closed' });
      }
      const fresh = await m.save(m.create(PathConversation, { userId }));
      await m.save(
        m.create(PathMessage, { conversationId: fresh.id, role: 'assistant', content: GREETING, quickReplies: GREETING_QUICK_REPLIES }),
      );
      return fresh;
    });
    return this.view(conv);
  }

  async getOpenForUser(userId: string, id: string): Promise<PathConversation> {
    const conv = await this.convs.findOneBy({ id, userId });
    if (!conv) throw err(NotFoundException, 404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
    if (conv.status !== 'open') throw err(ConflictException, 409, 'CONVERSATION_CLOSED', 'Conversation is closed.');
    return conv;
  }

  async sendMessage(userId: string, conversationId: string, content: string) {
    const conv = await this.getOpenForUser(userId, conversationId);
    if (conv.userTurns >= MAX_USER_TURNS)
      throw err(ConflictException, 409, 'CONVERSATION_LIMIT', 'This conversation reached its turn limit. Start a new one.');

    const key = `chat:${conv.id}`;
    if ((await this.redis.set(key, '1', 'EX', LOCK_TTL_SECONDS, 'NX')) !== 'OK')
      throw err(ConflictException, 409, 'TURN_IN_PROGRESS', 'The previous message is still being answered.');

    try {
      const stored = await this.msgs.find({
        where: { conversationId: conv.id },
        order: { createdAt: 'DESC' },
        take: HISTORY_STORED,
      });
      const history = [
        ...stored.reverse().map(({ role, content }) => ({ role, content })),
        { role: 'user' as const, content },
      ];

      let out;
      try {
        out = validateChatOutput(await this.ai.chat({ history, preferences: conv.preferences }));
      } catch (e) {
        if (e instanceof AiError) {
          this.log.warn(`chat failed for user ${userId}: ${e.code}`);
          throw err(ServiceUnavailableException, 503, 'AI_UNAVAILABLE', 'The assistant is unavailable. Try again shortly.');
        }
        throw e;
      }
      if (out.offTopic) this.log.log(`off-topic turn from user ${userId}`);

      // Never let a null/undefined from the model wipe a collected field.
      const preferences = { ...conv.preferences };
      for (const [k, v] of Object.entries(out.preferences)) if (v != null) (preferences as Record<string, unknown>)[k] = v;
      const ready = serverReady({ ...out, preferences });

      // Explicit, distinct timestamps: now() is transaction-start time, so same-transaction rows would tie.
      const at = new Date();
      await this.ds.transaction(async (m) => {
        await m.save(m.create(PathMessage, { conversationId: conv.id, role: 'user', content, quickReplies: null, createdAt: at }));
        await m.save(
          m.create(PathMessage, {
            conversationId: conv.id,
            role: 'assistant',
            content: out.reply,
            quickReplies: out.quickReplies,
            createdAt: new Date(at.getTime() + 1),
          }),
        );
        await m.update(PathConversation, conv.id, { preferences, ready, userTurns: conv.userTurns + 1 });
      });
      return { reply: out.reply, quickReplies: out.quickReplies, preferences, ready };
    } finally {
      await this.redis.del(key);
    }
  }

  private async view(conv: PathConversation): Promise<ConversationView> {
    const [messages, job, draft] = await Promise.all([
      this.msgs.find({ where: { conversationId: conv.id }, order: { createdAt: 'ASC', role: 'DESC' } }),
      this.jobs.findOne({ where: { userId: conv.userId, status: In(['queued', 'running']) }, order: { createdAt: 'DESC' } }),
      this.paths.findOneBy({ conversationId: conv.id, status: 'draft' }),
    ]);
    return {
      id: conv.id,
      messages: messages.map(({ role, content, quickReplies }) => ({ role, content, quickReplies })),
      preferences: conv.preferences,
      ready: conv.ready,
      activeJob: job ? { id: job.id, status: job.status } : null,
      draftPathId: draft?.id ?? null,
    };
  }
}
