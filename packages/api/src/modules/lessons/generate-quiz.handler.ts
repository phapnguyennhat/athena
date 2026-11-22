import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AiJob } from '../ai-jobs/ai-job.entity.js';
import { JobError, type JobHandler } from '../ai-jobs/job-handlers.js';
import { PathAi } from '../learning-paths/path-ai.js';
import { claimOrWait, releaseClaim } from './content-claim.js';
import { LessonContentEntity } from './entities/lesson-content.entity.js';
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
    const { lesson, content: row, path } = owned;
    if (!row.content) throw new JobError('LESSON_NOT_READY');
    const contentId = row.id;
    const repo = this.ds.getRepository(Quiz);
    const ready = async () => !!(await repo.existsBy({ contentId }));
    if ((await claimOrWait(this.ds, contentId, 'quiz_generating_since', ready)) === 'claimed') {
      try {
        const { questions } = await this.ai.quiz({
          language: path.contentLanguage,
          level: path.preferences.level,
          lessonTitle: lesson.title,
          content: row.content,
        });
        // The unique content_id stays a last guard if a stale claim was taken over; the content may also be gone.
        await this.ds.transaction(async (m) => {
          await m.createQueryBuilder().insert().into(Quiz).values({ contentId, questions }).orIgnore().execute();
          await m.update(LessonContentEntity, contentId, { quizGeneratingSince: null });
        });
      } catch (e) {
        await releaseClaim(this.ds, contentId, 'quiz_generating_since');
        if ((e as { driverError?: { code?: string } }).driverError?.code === '23503')
          throw new JobError('LESSON_NOT_FOUND');
        throw e;
      }
    }
    const quiz = await repo.findOneBy({ contentId });
    if (!quiz) throw new JobError('LESSON_NOT_FOUND');
    return quiz.id;
  }
}
