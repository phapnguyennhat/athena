import type { DataSource } from 'typeorm';
import { categoryNames, resolveCategory } from './categories.js';
import type { PathAi } from './path-ai.js';

/**
 * Asks the model for a category and tags for every active path that has none. Sequential, one model call per
 * path; a failure is logged and skipped, so a re-run picks it up. `userId` limits the run to one user's paths.
 */
export async function backfillCategories(
  ds: DataSource,
  ai: PathAi,
  log: (msg: string) => void = console.log,
  opts: { userId?: string } = {},
): Promise<{ done: number; failed: number }> {
  const paths: { id: string; title: string; summary: string }[] = await ds.query(
    `SELECT id, title, summary FROM learning_paths
     WHERE status = 'active' AND category_id IS NULL AND ($1::uuid IS NULL OR user_id = $1)
     ORDER BY created_at`,
    [opts.userId ?? null],
  );
  let done = 0;
  let failed = 0;
  for (const p of paths) {
    try {
      const modules: { title: string }[] = await ds.query(
        `SELECT title FROM path_modules WHERE path_id = $1 ORDER BY position`,
        [p.id],
      );
      // Reloaded per path so a category created for one path is offered to the next.
      const out = await ai.categorize(
        { title: p.title, summary: p.summary, modules: modules.map((m) => m.title) },
        await categoryNames(ds),
      );
      await ds.transaction(async (m) => {
        const categoryId = await resolveCategory(m, out.category);
        await m.query(`UPDATE learning_paths SET category_id = $2, tags = $3 WHERE id = $1 AND category_id IS NULL`, [
          p.id,
          categoryId,
          out.tags,
        ]);
      });
      done++;
      log(`categorized ${p.id}: ${out.category}`);
    } catch (e) {
      failed++;
      log(`failed ${p.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { done, failed };
}
