import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AiJob } from '../ai-jobs/ai-job.entity.js';
import { JobError, type JobHandler } from '../ai-jobs/job-handlers.js';
import { LessonContentEntity } from '../lessons/entities/lesson-content.entity.js';
import { SearchIndexService } from '../search/search-index.service.js';
import { validateExtendOutput } from './ai-output.js';
import type { ScopeArea } from './entities/learning-path.entity.js';
import { PathAi } from './path-ai.js';

/** Safety cap: a family stops growing at this many chapters even if the model never says "complete". */
export const MAX_MODULES = 20;

/**
 * Appends the next chapters to a course family (its root and every copy). One model call per extension: the job
 * is unique per root while active, and it does nothing when the outline already grew past `afterModules`.
 */
@Injectable()
export class ExtendPathHandler implements JobHandler {
  readonly type = 'extend_path' as const;

  constructor(
    private readonly ds: DataSource,
    private readonly ai: PathAi,
    private readonly search: SearchIndexService,
  ) {}

  async run(job: AiJob): Promise<string> {
    const { rootId, afterModules } = job.input as { rootId: string; afterModules: number };
    const [root] = await this.ds.query(
      `SELECT title, content_language, preferences->>'level' AS level, outline_complete, scope FROM learning_paths WHERE id = $1`,
      [rootId],
    );
    if (!root) throw new JobError('PATH_NOT_FOUND');
    const outline: { title: string; lessons: string[] }[] = await this.ds.query(
      `SELECT m.title, coalesce(array_agg(l.title ORDER BY l.position) FILTER (WHERE l.id IS NOT NULL), '{}') AS lessons
       FROM path_modules m LEFT JOIN path_lessons l ON l.module_id = m.id
       WHERE m.path_id = $1 GROUP BY m.id ORDER BY m.position`,
      [rootId],
    );
    if (root.outline_complete || outline.length !== afterModules) return rootId;
    const scope: ScopeArea[] | null = root.scope;
    // Every planned area is taught: the course is complete, no model call needed.
    if (scope?.every((a) => a.covered)) {
      await this.ds.query(`UPDATE learning_paths SET outline_complete = true WHERE id = $1`, [rootId]);
      return rootId;
    }

    // Model call outside the transaction: never hold the root lock across it.
    const out = validateExtendOutput(
      await this.ai.extend({
        language: root.content_language,
        level: root.level ?? undefined,
        title: root.title,
        modules: outline,
        ...(scope && { scope }),
      }),
    );

    const grew = await this.ds.transaction(async (m) => {
      // FOR UPDATE: copy() reads its source FOR SHARE, so a concurrent copy sees the old or the new outline, whole.
      const [live] = await m.query(`SELECT outline_complete FROM learning_paths WHERE id = $1 FOR UPDATE`, [rootId]);
      const [{ n }] = await m.query(`SELECT count(*)::int AS n FROM path_modules WHERE path_id = $1`, [rootId]);
      if (!live || live.outline_complete || n !== afterModules) return false;
      const modules = out.modules.slice(0, MAX_MODULES - n);
      if (modules.length) {
        const lessons = modules.flatMap((mod, i) =>
          mod.lessons.map((l, j) => ({ mi: i, position: j, title: l.title })),
        );
        // One content row per new lesson, shared by the whole family (generated once, like copies).
        const { identifiers } = await m.insert(
          LessonContentEntity,
          lessons.map(() => ({})),
        );
        const family: { id: string }[] = await m.query(
          `SELECT id FROM learning_paths WHERE id = $1 OR source_path_id = $1`,
          [rootId],
        );
        for (const { id: pathId } of family) {
          const rows: { id: string; position: number }[] = await m.query(
            `INSERT INTO path_modules (path_id, position, title)
             SELECT $1, $2 + i - 1, t FROM unnest($3::varchar[]) WITH ORDINALITY AS u(t, i) RETURNING id, position`,
            [pathId, n, modules.map((mod) => mod.title)],
          );
          // RETURNING order is not guaranteed: index by position.
          const saved = rows.sort((x, y) => x.position - y.position);
          await m.query(
            `INSERT INTO path_lessons (module_id, position, title, content_id)
             SELECT * FROM unnest($1::uuid[], $2::int[], $3::varchar[], $4::uuid[])`,
            [
              lessons.map((l) => saved[l.mi].id),
              lessons.map((l) => l.position),
              lessons.map((l) => l.title),
              identifiers.map((x) => x.id as string),
            ],
          );
        }
      }
      // With a plan, "complete" is decided here (every area taught), not by the model's judgement.
      const covered = scope?.map((a, i) => ({
        ...a,
        covered: a.covered || modules.some((mod) => mod.covers.includes(i)),
      }));
      const complete = covered ? covered.every((a) => a.covered) : out.complete;
      await m.query(
        `UPDATE learning_paths SET scope = coalesce($2::jsonb, scope), outline_complete = $3 WHERE id = $1`,
        [
          rootId,
          covered ? JSON.stringify(covered) : null,
          complete || !modules.length || n + modules.length >= MAX_MODULES,
        ],
      );
      return modules.length > 0;
    });
    if (grew) await this.search.publish(rootId); // lesson_count changed
    return rootId;
  }
}
