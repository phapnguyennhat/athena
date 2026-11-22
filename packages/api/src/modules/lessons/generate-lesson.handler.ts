import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AiJob } from '../ai-jobs/ai-job.entity.js';
import { JobError, type JobHandler } from '../ai-jobs/job-handlers.js';
import { PathLesson } from '../learning-paths/entities/path-lesson.entity.js';
import { PathAi } from '../learning-paths/path-ai.js';
import { LessonResource } from './entities/lesson-resource.entity.js';
import { findOwnedLesson } from './lessons.service.js';
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
    const { lesson, path, moduleTitle, ordered } = owned;
    if (lesson.content) return lesson.id;

    const i = ordered.findIndex((l) => l.id === lesson.id);
    const out = await this.ai.lesson({
      language: path.contentLanguage,
      level: path.preferences.level,
      goal: path.preferences.goal,
      pathTitle: path.title,
      moduleTitle,
      lessonTitle: lesson.title,
      previousLesson: ordered[i - 1]?.title,
      nextLesson: ordered[i + 1]?.title,
    });
    // A failed search never fails the lesson: the app falls back to a search link.
    const videos = await this.youtube.search(
      out.keywords[0] ?? lesson.title,
      path.contentLanguage,
    );
    if (this.youtube.enabled && !videos.length)
      this.log.warn(`no videos for lesson ${lesson.id}`);

    const { keywords, ...content } = out;
    return this.ds.transaction(async (m) => {
      const live = await m.findOne(PathLesson, {
        where: { id: lessonId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!live) throw new JobError('LESSON_NOT_FOUND');
      if (live.content) return live.id; // a concurrent run won; keep its content
      await m.update(PathLesson, lessonId, {
        content,
        searchKeywords: keywords,
        contentGeneratedAt: new Date(),
      });
      if (videos.length)
        await m.insert(
          LessonResource,
          videos.map((v, position) => ({
            lessonId,
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
