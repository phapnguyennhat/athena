import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AiJob } from '../ai-jobs/ai-job.entity.js';
import { JobError, type JobHandler } from '../ai-jobs/job-handlers.js';
import { PathAi } from '../learning-paths/path-ai.js';
import { Quiz } from './entities/quiz.entity.js';
import { findOwnedLesson } from './lessons.service.js';

/** Generates the lesson's single quiz from its stored content (grounded). Returns the quiz id. */
@Injectable()
export class GenerateQuizHandler implements JobHandler {
  readonly type = 'generate_quiz' as const;

  constructor(
    private readonly ds: DataSource,
    private readonly ai: PathAi,
  ) {}

  async run(job: AiJob): Promise<string> {
    const lessonId = job.input.lessonId as string;
    const owned = await findOwnedLesson(this.ds.manager, job.userId, lessonId);
    if (!owned) throw new JobError('LESSON_NOT_FOUND');
    const { lesson, path } = owned;
    if (!lesson.content) throw new JobError('LESSON_NOT_READY');
    const repo = this.ds.getRepository(Quiz);
    const existing = await repo.findOneBy({ lessonId });
    if (existing) return existing.id;

    const { questions } = await this.ai.quiz({
      language: path.contentLanguage,
      level: path.preferences.level,
      lessonTitle: lesson.title,
      content: lesson.content,
    });
    // The unique lesson_id keeps the first quiz if two runs race; the lesson may also have been deleted meanwhile.
    try {
      await repo
        .createQueryBuilder()
        .insert()
        .values({ lessonId, questions })
        .orIgnore()
        .execute();
    } catch (e) {
      if (
        (e as { driverError?: { code?: string } }).driverError?.code === '23503'
      )
        throw new JobError('LESSON_NOT_FOUND');
      throw e;
    }
    const quiz = await repo.findOneBy({ lessonId });
    if (!quiz) throw new JobError('LESSON_NOT_FOUND');
    return quiz.id;
  }
}
