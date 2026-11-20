import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ChatReply,
  LearningPath,
  PreferencesDto,
} from './dto/learning-path.dto.js';
import type { ChatRequestDto } from './dto/learning-path.dto.js';
import { serverReady } from './ai-output.js';
import { PathAi } from './path-ai.js';

@Injectable()
export class LearningPathsService {
  // shortcut: in-memory per instance, lost on restart; move to a TypeORM entity when persistence is built.
  private readonly paths = new Map<string, LearningPath & { userId: string }>();

  constructor(private readonly ai: PathAi) {}

  async chat({ messages, preferences }: ChatRequestDto): Promise<ChatReply> {
    const out = await this.ai.chat({
      history: messages,
      preferences: preferences ?? {},
    });
    return {
      reply: out.reply,
      quickReplies: out.quickReplies,
      preferences: out.preferences,
      ready: serverReady(out),
    };
  }

  async generate(
    userId: string,
    preferences: PreferencesDto,
  ): Promise<LearningPath> {
    if (!preferences.topic || !preferences.level)
      throw new BadRequestException('topic and level are required');
    const path = {
      ...(await this.ai.generate(preferences)),
      id: randomUUID(),
      status: 'draft' as const,
      userId,
    };
    this.paths.set(path.id, path);
    return this.view(path);
  }

  start(
    userId: string,
    id: string,
    modules?: LearningPath['modules'],
  ): LearningPath {
    const path = this.paths.get(id);
    if (!path || path.userId !== userId) throw new NotFoundException();
    // Review edits only apply to a draft; an active path keeps its structure.
    if (modules && path.status === 'draft')
      path.modules = modules.map((m) => ({
        title: m.title,
        lessons: m.lessons.map((l) => ({ title: l.title })),
      }));
    path.status = 'active';
    return this.view(path);
  }

  private view({
    userId: _userId,
    ...path
  }: LearningPath & { userId: string }): LearningPath {
    return path;
  }
}
