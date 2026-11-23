import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AiJobsService, toJobView, type JobView } from '../ai-jobs/ai-jobs.service.js';
import { MAX_MODULES } from '../learning-paths/extend-path.handler.js';
import { LearningPathEntity } from '../learning-paths/entities/learning-path.entity.js';
import { PathLesson } from '../learning-paths/entities/path-lesson.entity.js';
import { LessonContentEntity } from './entities/lesson-content.entity.js';
import { LessonProgress } from './entities/lesson-progress.entity.js';
import { LessonResource } from './entities/lesson-resource.entity.js';
import { Quiz } from './entities/quiz.entity.js';
import { QuizAttempt } from './entities/quiz-attempt.entity.js';
import type { LessonContent } from './lesson-output.js';
import { StreakService, type StreakView } from './streak.service.js';

export type LessonStatus = 'not_started' | 'in_progress' | 'completed';
export type Neighbour = { id: string; title: string } | null;

export type LessonView = {
  id: string;
  title: string;
  status: LessonStatus;
  path: { id: string; title: string; status: 'draft' | 'active' };
  moduleTitle: string;
  previous: Neighbour;
  next: Neighbour;
  content: LessonContent | null;
  /** The latest content job while there is no content: queued/running = generating, failed = show retry. */
  contentJob: JobView | null;
  videos: {
    videoId: string;
    title: string;
    channel: string | null;
    thumbnailUrl: string | null;
  }[];
  /** Fallback when no verified video is stored: the app links to a YouTube search for it. */
  searchQuery: string;
  quiz: {
    id: string;
    questionCount: number;
    lastAttempt: { correct: number; total: number } | null;
  } | null;
  quizJob: JobView | null;
};

export type ProgressCount = { done: number; total: number };
export type CompleteView = {
  status: 'completed';
  pathProgress: ProgressCount;
  streak: StreakView;
};

/** A lesson the user owns, with its path context and siblings in learning order. */
export type OwnedLesson = {
  lesson: PathLesson;
  /** The lesson's shared content row (content, keywords; videos and quiz hang off its id). */
  content: LessonContentEntity;
  moduleTitle: string;
  path: LearningPathEntity;
  ordered: { id: string; title: string }[];
};

export const lessonNotFound = () =>
  new NotFoundException({
    statusCode: 404,
    code: 'LESSON_NOT_FOUND',
    message: 'Lesson not found.',
  });

/** Every lesson id/title of a path in learning order (module position, then lesson position). */
export async function orderedLessons(m: EntityManager, pathId: string): Promise<{ id: string; title: string }[]> {
  return m.query(
    `SELECT l.id, l.title FROM path_lessons l JOIN path_modules m ON m.id = l.module_id
     WHERE m.path_id = $1 ORDER BY m.position, l.position`,
    [pathId],
  );
}

/** Loads a lesson only if its path belongs to the user; otherwise 404 (no existence leak). */
export async function findOwnedLesson(m: EntityManager, userId: string, lessonId: string): Promise<OwnedLesson | null> {
  const lesson = await m.findOne(PathLesson, {
    where: { id: lessonId },
    relations: { module: { path: true }, contentRow: true },
  });
  const path = lesson?.module?.path;
  if (!lesson || !path || path.userId !== userId || path.hiddenAt) return null;
  return {
    lesson,
    content: lesson.contentRow!,
    moduleTitle: lesson.module!.title,
    path,
    ordered: await orderedLessons(m, path.id),
  };
}

@Injectable()
export class LessonsService {
  constructor(
    private readonly ds: DataSource,
    private readonly jobs: AiJobsService,
    private readonly streak: StreakService,
  ) {}

  async own(userId: string, lessonId: string): Promise<OwnedLesson> {
    const owned = await findOwnedLesson(this.ds.manager, userId, lessonId);
    if (!owned) throw lessonNotFound();
    return owned;
  }

  /** Opening a lesson marks it in progress (never downgrades a completed one) and makes it the resume target. */
  async open(userId: string, lessonId: string): Promise<LessonView> {
    const owned = await this.own(userId, lessonId);
    if (owned.path.status === 'active')
      await this.ds.query(
        `INSERT INTO lesson_progress (user_id, lesson_id) VALUES ($1, $2)
         ON CONFLICT (user_id, lesson_id) DO UPDATE SET updated_at = now()`,
        [userId, lessonId],
      );
    return this.view(userId, owned);
  }

  async view(userId: string, { lesson, content, moduleTitle, path, ordered }: OwnedLesson): Promise<LessonView> {
    const [progress, videos, quiz, contentJob, quizJob] = await Promise.all([
      this.ds.getRepository(LessonProgress).findOneBy({ userId, lessonId: lesson.id }),
      this.ds.getRepository(LessonResource).find({ where: { contentId: content.id }, order: { position: 'ASC' } }),
      this.ds.getRepository(Quiz).findOneBy({ contentId: content.id }),
      content.content ? null : this.jobs.latestForLesson(userId, 'generate_lesson', lesson.id),
      this.jobs.latestForLesson(userId, 'generate_quiz', lesson.id),
    ]);
    const last = quiz
      ? await this.ds.getRepository(QuizAttempt).findOne({
          where: { quizId: quiz.id, userId },
          order: { createdAt: 'DESC' },
        })
      : null;
    const i = ordered.findIndex((l) => l.id === lesson.id);
    return {
      id: lesson.id,
      title: lesson.title,
      status: progress?.status ?? 'not_started',
      path: { id: path.id, title: path.title, status: path.status },
      moduleTitle,
      previous: ordered[i - 1] ?? null,
      next: ordered[i + 1] ?? null,
      content: content.content,
      contentJob: contentJob ? toJobView(contentJob) : null,
      videos: videos.map((v) => ({
        videoId: v.externalId,
        title: v.title,
        channel: v.channel,
        thumbnailUrl: v.thumbnailUrl,
      })),
      searchQuery: content.searchKeywords?.[0] ?? `${lesson.title} ${path.title}`.slice(0, 200),
      quiz: quiz
        ? {
            id: quiz.id,
            questionCount: quiz.questions.length,
            lastAttempt: last ? { correct: last.correct, total: last.total } : null,
          }
        : null,
      quizJob: quiz || !quizJob ? null : toJobView(quizJob),
    };
  }

  /** Queues content generation; a lesson that already has content is answered by the handler without an AI call. */
  async generateContent(userId: string, lessonId: string): Promise<JobView> {
    await this.own(userId, lessonId);
    return toJobView(await this.jobs.enqueue(userId, 'generate_lesson', { lessonId }));
  }

  async generateQuiz(userId: string, lessonId: string): Promise<JobView> {
    const { content } = await this.own(userId, lessonId);
    if (!content.content)
      throw new ConflictException({
        statusCode: 409,
        code: 'LESSON_NOT_READY',
        message: 'Generate the lesson content first.',
      });
    return toJobView(await this.jobs.enqueue(userId, 'generate_quiz', { lessonId }));
  }

  /**
   * Idempotent: completing twice changes nothing. Only the first completion is a qualifying activity, recorded in
   * the same transaction so progress and streak can't disagree.
   */
  async complete(userId: string, lessonId: string): Promise<CompleteView> {
    const { path } = await this.own(userId, lessonId);
    if (path.status !== 'active')
      throw new ConflictException({
        statusCode: 409,
        code: 'PATH_NOT_STARTED',
        message: 'Start the learning path first.',
      });
    await this.ds.transaction(async (m) => {
      const [row] = await m.query(
        `INSERT INTO lesson_progress (user_id, lesson_id, status, completed_at) VALUES ($1, $2, 'completed', now())
         ON CONFLICT (user_id, lesson_id) DO UPDATE SET status = 'completed', completed_at = now(), updated_at = now()
           WHERE lesson_progress.status <> 'completed'
         RETURNING id`,
        [userId, lessonId],
      );
      if (row) await this.streak.record(m, userId);
    });
    await this.extendNearEnd(userId, path.id).catch(() => undefined); // best effort: never fails a completion
    return {
      status: 'completed',
      pathProgress: await this.pathProgress(userId, path.id),
      streak: await this.streak.view(userId),
    };
  }

  /** With ≤ 2 lessons left, queues the family's next chapters (one active job per family, see ExtendPathHandler). */
  private async extendNearEnd(userId: string, pathId: string): Promise<void> {
    const [r] = await this.ds.query(
      `SELECT root.id AS "rootId", root.outline_complete AS complete,
         (SELECT count(*)::int FROM path_modules m WHERE m.path_id = p.id) AS modules,
         (SELECT count(*)::int FROM path_lessons l JOIN path_modules m ON m.id = l.module_id
            LEFT JOIN lesson_progress pr ON pr.lesson_id = l.id AND pr.user_id = $1
          WHERE m.path_id = p.id AND pr.status IS DISTINCT FROM 'completed') AS remaining
       FROM learning_paths p JOIN learning_paths root ON root.id = coalesce(p.source_path_id, p.id)
       WHERE p.id = $2`,
      [userId, pathId],
    );
    if (!r || r.complete || r.remaining > 2 || r.modules >= MAX_MODULES) return;
    await this.jobs.enqueue(userId, 'extend_path', { rootId: r.rootId, afterModules: r.modules });
  }

  /** The most recently opened, unfinished lesson of an active path. */
  async lastOpened(userId: string): Promise<{ lessonId: string; lessonTitle: string; pathId: string } | null> {
    const [r] = await this.ds.query(
      `SELECT l.id AS "lessonId", l.title AS "lessonTitle", p.id AS "pathId"
       FROM lesson_progress pr JOIN path_lessons l ON l.id = pr.lesson_id
       JOIN path_modules m ON m.id = l.module_id JOIN learning_paths p ON p.id = m.path_id
       WHERE pr.user_id = $1 AND pr.status = 'in_progress' AND p.status = 'active' AND p.hidden_at IS NULL
       ORDER BY pr.updated_at DESC LIMIT 1`,
      [userId],
    );
    return r ?? null;
  }

  async totals(userId: string): Promise<{ completedLessons: number; quizAttempts: number }> {
    const [r] = await this.ds.query(
      `SELECT (SELECT count(*) FROM lesson_progress WHERE user_id = $1 AND status = 'completed')::int AS "completedLessons",
              (SELECT count(*) FROM quiz_attempts WHERE user_id = $1)::int AS "quizAttempts"`,
      [userId],
    );
    return r;
  }

  async pathProgress(userId: string, pathId: string): Promise<ProgressCount> {
    const [r] = await this.ds.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE p.status = 'completed')::int AS done
       FROM path_lessons l JOIN path_modules m ON m.id = l.module_id
       LEFT JOIN lesson_progress p ON p.lesson_id = l.id AND p.user_id = $1
       WHERE m.path_id = $2`,
      [userId, pathId],
    );
    return r;
  }
}
