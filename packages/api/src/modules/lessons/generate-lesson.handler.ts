import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AiJob } from '../ai-jobs/ai-job.entity.js';
import { JobError, type JobHandler } from '../ai-jobs/job-handlers.js';
import { PathAi } from '../learning-paths/path-ai.js';
import { claimOrWait, releaseClaim } from './content-claim.js';
import { LessonContentEntity } from './entities/lesson-content.entity.js';
import { LessonResource } from './entities/lesson-resource.entity.js';
import { findOwnedLesson, type OwnedLesson } from './lessons.service.js';
import { YouTubeService } from './youtube.service.js';

/** Generates a lesson's content once, then looks up verified videos for it. Returns the lesson id. */
@Injectable()
export class GenerateLessonHandler implements JobHandler {
  readonly type = 'generate_lesson' as const;
  private readonly log = new Logger(GenerateLessonHandler.name);

  constructor(
    private readonly ds: DataSource,
    private readonly ai: PathAi,
    private readonly youtube: YouTubeService,
  ) {}

  async run(job: AiJob): Promise<string> {
    const lessonId = job.input.lessonId as string;
    const owned = await findOwnedLesson(this.ds.manager, job.userId, lessonId);
    // The path was deleted while the job waited: nothing to write to.
    if (!owned) throw new JobError('LESSON_NOT_FOUND');
    const { lesson, content: row } = owned;
    const ready = async () => {
      const live = await this.ds.getRepository(LessonContentEntity).findOneBy({ id: row.id });
      if (!live) throw new JobError('LESSON_NOT_FOUND');
      return !!live.content;
    };
    if ((await claimOrWait(this.ds, row.id, 'generating_since', ready)) === 'ready') return lesson.id;

    try {
      return await this.generate(owned);
    } catch (e) {
      // Free the row so a retry or another learner can claim it.
      await releaseClaim(this.ds, row.id, 'generating_since');
      throw e;
    }
  }

  private async generate({ lesson, content: row, path, moduleTitle, ordered }: OwnedLesson): Promise<string> {
    const lessonId = lesson.id;
    const i = ordered.findIndex((l) => l.id === lesson.id);
    const out = await this.ai.lesson({
      language: path.contentLanguage,
      level: path.preferences.level,
      pathTitle: path.title,
      moduleTitle,
      lessonTitle: lesson.title,
      previousLesson: ordered[i - 1]?.title,
      nextLesson: ordered[i + 1]?.title,
    });
    // A failed search never fails the lesson: the app falls back to a search link.
    const videos = await this.youtube.search(out.keywords[0] ?? lesson.title, path.contentLanguage);
    if (this.youtube.enabled && !videos.length) this.log.warn(`no videos for lesson ${lesson.id}`);

    const { keywords, ...content } = out;
    return this.ds.transaction(async (m) => {
      const live = await m.findOne(LessonContentEntity, {
        where: { id: row.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!live) throw new JobError('LESSON_NOT_FOUND');
      if (live.content) return lessonId; // a run that took over our stale claim won; keep its content
      await m.update(LessonContentEntity, row.id, {
        content,
        searchKeywords: keywords,
        generatedAt: new Date(),
        generatingSince: null,
      });
      if (videos.length)
        await m.insert(
          LessonResource,
          videos.map((v, position) => ({
            contentId: row.id,
            provider: 'youtube' as const,
            externalId: v.id,
            title: v.title,
            channel: v.channel,
            thumbnailUrl: v.thumbnailUrl,
            position,
          })),
        );
      return lessonId;
    });
  }
}
