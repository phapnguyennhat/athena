import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AiJobsService } from '../ai-jobs/ai-jobs.service.js';
import { orderedLessons } from '../lessons/lessons.service.js';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository, type FindOptionsWhere } from 'typeorm';
import type { LearningPath } from './dto/learning-path.dto.js';
import { LearningPathEntity } from './entities/learning-path.entity.js';
import { PathConversation } from './entities/path-conversation.entity.js';
import { PathLesson } from './entities/path-lesson.entity.js';
import { PathModule } from './entities/path-module.entity.js';
import { LessonContentEntity } from '../lessons/entities/lesson-content.entity.js';
import { SearchIndexService } from '../search/search-index.service.js';

export type LessonStatus = 'not_started' | 'in_progress' | 'completed';

export type PathCategory = { id: string; name: string };

/** The app's `LearningPath` shape, plus ids and the user's per-lesson status. */
export type LearningPathView = {
  id: string;
  status: 'draft' | 'active';
  title: string;
  summary: string;
  category: PathCategory | null;
  tags: string[];
  /** Copied from a Community course. Deleting an active original only hides it. */
  isCopy: boolean;
  /** AI chapter extension of the course family: `generating` while a job runs, `complete` once the AI said so. */
  extension: 'idle' | 'generating' | 'complete';
  progress: { done: number; total: number };
  modules: {
    id: string;
    title: string;
    lessons: { id: string; title: string; status: LessonStatus }[];
  }[];
};

/** One row of "my paths": active paths with progress and the next lesson to study. */
export type PathSummary = {
  id: string;
  title: string;
  summary: string;
  category: PathCategory | null;
  tags: string[];
  done: number;
  total: number;
  next: { id: string; title: string } | null;
  lastActiveAt: string;
  /** Copied from a Community course (deleting it removes it; deleting an original only hides it). */
  isCopy: boolean;
};

const notFound = () =>
  new NotFoundException({
    statusCode: 404,
    code: 'PATH_NOT_FOUND',
    message: 'Learning path not found.',
  });
const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;

/** Inserts modules and their lessons for a path, positions following array order. */
export async function insertModules(m: EntityManager, pathId: string, modules: LearningPath['modules']): Promise<void> {
  const saved = await m.save(
    PathModule,
    modules.map((mod, i) => ({ pathId, position: i, title: mod.title })),
  );
  const lessons = saved.flatMap((s, i) =>
    modules[i].lessons.map((l, j) => ({
      moduleId: s.id,
      position: j,
      title: l.title,
    })),
  );
  if (!lessons.length) return;
  // Each new lesson starts with its own empty content row.
  const { identifiers } = await m.insert(
    LessonContentEntity,
    lessons.map(() => ({})),
  );
  await m.insert(
    PathLesson,
    lessons.map((l, i) => ({ ...l, contentId: identifiers[i].id as string })),
  );
}

/** Content row ids of every lesson in these paths; collect before deleting lessons, then `pruneContents`. */
async function contentIdsOf(m: EntityManager, pathIds: string[]): Promise<string[]> {
  const rows: { content_id: string }[] = await m.query(
    `SELECT l.content_id FROM path_lessons l JOIN path_modules pm ON pm.id = l.module_id WHERE pm.path_id = ANY($1)`,
    [pathIds],
  );
  return rows.map((r) => r.content_id);
}

/** Deletes those content rows (cascading videos, quiz, attempts) that no lesson points at any more. */
async function pruneContents(m: EntityManager, ids: string[]): Promise<void> {
  if (ids.length)
    await m.query(
      `DELETE FROM lesson_contents c WHERE c.id = ANY($1)
       AND NOT EXISTS (SELECT 1 FROM path_lessons l WHERE l.content_id = c.id)`,
      [ids],
    );
}

/** Deletes matching paths (cascading modules, lessons, progress) and their now unreferenced lesson content. */
export async function deletePaths(m: EntityManager, where: FindOptionsWhere<LearningPathEntity>): Promise<number> {
  const ids = (await m.find(LearningPathEntity, { where, select: { id: true } })).map((p) => p.id);
  if (!ids.length) return 0;
  const contentIds = await contentIdsOf(m, ids);
  const res = await m.delete(LearningPathEntity, ids);
  await pruneContents(m, contentIds);
  return res.affected ?? 0;
}

@Injectable()
export class LearningPathsService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(LearningPathEntity)
    private readonly paths: Repository<LearningPathEntity>,
    private readonly search: SearchIndexService,
    @Inject(forwardRef(() => AiJobsService)) private readonly jobs: AiJobsService,
  ) {}

  async get(userId: string, id: string): Promise<LearningPathView> {
    const path = await this.paths.findOne({
      where: { id, userId, hiddenAt: IsNull() },
      relations: { modules: { lessons: true }, category: true },
    });
    if (!path) throw notFound();
    const rows: { lesson_id: string; status: LessonStatus }[] = await this.ds.query(
      `SELECT p.lesson_id, p.status FROM lesson_progress p
       JOIN path_lessons l ON l.id = p.lesson_id JOIN path_modules m ON m.id = l.module_id
       WHERE p.user_id = $1 AND m.path_id = $2`,
      [userId, id],
    );
    const status = new Map(rows.map((r) => [r.lesson_id, r.status]));
    const modules = [...path.modules].sort(byPosition).map((mod) => ({
      id: mod.id,
      title: mod.title,
      lessons: [...mod.lessons].sort(byPosition).map((l) => ({
        id: l.id,
        title: l.title,
        status: status.get(l.id) ?? 'not_started',
      })),
    }));
    const lessons = modules.flatMap((m) => m.lessons);
    const [ext] = await this.ds.query(
      `SELECT r.outline_complete AS complete, EXISTS (SELECT 1 FROM ai_jobs j WHERE j.type = 'extend_path'
         AND j.input->>'rootId' = r.id::text AND j.status IN ('queued', 'running')) AS generating
       FROM learning_paths r WHERE r.id = $1`,
      [path.sourcePathId ?? path.id],
    );
    return {
      id: path.id,
      status: path.status,
      title: path.title,
      summary: path.summary,
      category: path.category ? { id: path.category.id, name: path.category.name } : null,
      tags: path.tags,
      isCopy: Boolean(path.sourcePathId),
      extension: ext?.complete ? 'complete' : ext?.generating ? 'generating' : 'idle',
      progress: {
        done: lessons.filter((l) => l.status === 'completed').length,
        total: lessons.length,
      },
      modules,
    };
  }

  /**
   * The user's active paths, most recently studied first.
   * shortcut: unpaginated, one query; fine for tens of paths per user, paginate if users keep hundreds.
   */
  async list(userId: string): Promise<PathSummary[]> {
    const rows = await this.ds.query(
      `WITH l AS (
         SELECT m.path_id, l.id, l.title, m.position AS mp, l.position AS lp, pr.status, pr.updated_at
         FROM learning_paths p
         JOIN path_modules m ON m.path_id = p.id
         JOIN path_lessons l ON l.module_id = m.id
         LEFT JOIN lesson_progress pr ON pr.lesson_id = l.id AND pr.user_id = $1
         WHERE p.user_id = $1 AND p.status = 'active' AND p.hidden_at IS NULL)
       SELECT p.id, p.title, p.summary, p.tags, p.source_path_id IS NOT NULL AS "isCopy",
         CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object('id', c.id, 'name', c.name) END AS category,
         (SELECT count(*) FROM l WHERE l.path_id = p.id)::int AS total,
         (SELECT count(*) FROM l WHERE l.path_id = p.id AND l.status = 'completed')::int AS done,
         (SELECT json_build_object('id', l.id, 'title', l.title) FROM l
            WHERE l.path_id = p.id AND l.status IS DISTINCT FROM 'completed' ORDER BY l.mp, l.lp LIMIT 1) AS next,
         GREATEST(p.updated_at, (SELECT max(l.updated_at) FROM l WHERE l.path_id = p.id)) AS "lastActiveAt"
       FROM learning_paths p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.user_id = $1 AND p.status = 'active' AND p.hidden_at IS NULL
       ORDER BY "lastActiveAt" DESC`,
      [userId],
    );
    return rows.map((r: PathSummary & { lastActiveAt: Date }) => ({
      ...r,
      lastActiveAt: new Date(r.lastActiveAt).toISOString(),
    }));
  }

  /**
   * An active original is only hidden (it stays public in Community, progress kept). A copy or a draft is deleted
   * with its modules, lessons, progress, the caller's quiz attempts on it and the content no other lesson uses.
   * Learning days stay.
   */
  async remove(userId: string, id: string): Promise<void> {
    const { affected, sourcePathId } = await this.ds.transaction(async (m) => {
      const hidden = await m.update(
        LearningPathEntity,
        { id, userId, status: 'active', sourcePathId: IsNull(), hiddenAt: IsNull() },
        { hiddenAt: () => 'now()' },
      );
      if (hidden.affected) return { affected: hidden.affected, sourcePathId: null };
      const path = await m.findOneBy(LearningPathEntity, { id, userId, hiddenAt: IsNull() });
      // Attempts hang off the content, which a copy shares with its source. The copy guard means no other lesson of
      // this user uses these rows.
      if (path)
        await m.query(
          `DELETE FROM quiz_attempts a USING quizzes q
           WHERE a.quiz_id = q.id AND a.user_id = $1 AND q.content_id = ANY($2)`,
          [userId, await contentIdsOf(m, [id])],
        );
      return { affected: await deletePaths(m, { id, userId, hiddenAt: IsNull() }), sourcePathId: path?.sourcePathId };
    });
    if (!affected) throw notFound();
    // The source's `copies` dropped.
    if (sourcePathId) await this.search.publish(sourcePathId);
  }

  /** Accepts the reviewed draft: applies edits (draft only), activates it and closes its conversation. */
  async start(userId: string, id: string, modules?: LearningPath['modules']): Promise<LearningPathView> {
    await this.ds.transaction(async (m) => {
      // Lock order everywhere: conversation, then its paths (the generate handler and start-over do the same).
      const pre = await m.findOneBy(LearningPathEntity, { id, userId, hiddenAt: IsNull() });
      if (!pre) throw notFound();
      if (pre.conversationId)
        await m.findOne(PathConversation, {
          where: { id: pre.conversationId },
          lock: { mode: 'pessimistic_write' },
        });
      // Re-read under lock: a regenerate may have replaced this draft meanwhile.
      const path = await m.findOne(LearningPathEntity, {
        where: { id, userId, hiddenAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!path) throw notFound();
      // Review edits only apply to a draft; an active path keeps its structure.
      if (modules && path.status === 'draft') {
        const contentIds = await contentIdsOf(m, [id]);
        await m.delete(PathModule, { pathId: id });
        await pruneContents(m, contentIds);
        await insertModules(m, id, modules);
      }
      await m.update(LearningPathEntity, id, { status: 'active' });
      if (path.conversationId)
        await m.update(PathConversation, path.conversationId, {
          status: 'closed',
        });
    });
    await this.search.publish(id);
    // Generate lesson 1 up front: the learner opens it next, and its video becomes the course thumbnail.
    const [first] = await orderedLessons(this.ds.manager, id);
    if (first) await this.jobs.enqueue(userId, 'generate_lesson', { lessonId: first.id }).catch(() => undefined);
    return this.get(userId, id);
  }
}
