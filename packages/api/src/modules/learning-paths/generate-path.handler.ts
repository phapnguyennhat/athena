import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AiJob } from '../ai-jobs/ai-job.entity.js';
import { JobError, type JobHandler } from '../ai-jobs/job-handlers.js';
import { validatePathOutput } from './ai-output.js';
import { LearningPathEntity } from './entities/learning-path.entity.js';
import { PathConversation } from './entities/path-conversation.entity.js';
import { insertModules } from './learning-paths.service.js';
import { PathAi } from './path-ai.js';

/** Generates a draft path from the conversation's preferences; replaces that conversation's previous draft. */
@Injectable()
export class GeneratePathHandler implements JobHandler {
  readonly type = 'generate_path' as const;

  constructor(
    private readonly ds: DataSource,
    private readonly ai: PathAi,
  ) {}

  async run(job: AiJob): Promise<string> {
    const conversationId = job.input.conversationId as string;
    const conv = await this.ds.getRepository(PathConversation).findOneBy({ id: conversationId, userId: job.userId });
    if (conv?.status !== 'open') throw new JobError('CONVERSATION_CLOSED');

    // Model call outside the transaction: never hold the row lock across it.
    const out = validatePathOutput(await this.ai.generate(conv.preferences));

    return this.ds.transaction(async (m) => {
      // Start-over or start may have closed the conversation while the model was working.
      const live = await m.findOne(PathConversation, { where: { id: conversationId }, lock: { mode: 'pessimistic_write' } });
      if (live?.status !== 'open') throw new JobError('CONVERSATION_CLOSED');
      await m.delete(LearningPathEntity, { conversationId, status: 'draft' });
      const path = await m.save(
        m.create(LearningPathEntity, { userId: job.userId, conversationId, status: 'draft', title: out.title, summary: out.summary }),
      );
      await insertModules(m, path.id, out.modules);
      return path.id;
    });
  }
}
