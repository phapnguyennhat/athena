import type { DataSource } from 'typeorm';
import { JobError } from '../ai-jobs/job-handlers.js';

export type ClaimColumn = 'generating_since' | 'quiz_generating_since';

// Only these two literals ever reach SQL; $2 is the stale age in ms.
const CLAIM_SQL: Record<ClaimColumn, string> = {
  generating_since: `UPDATE lesson_contents SET generating_since = now()
    WHERE id = $1 AND content IS NULL
      AND (generating_since IS NULL OR generating_since < now() - make_interval(secs => $2::float8 / 1000))
    RETURNING id`,
  quiz_generating_since: `UPDATE lesson_contents SET quiz_generating_since = now()
    WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM quizzes WHERE content_id = $1)
      AND (quiz_generating_since IS NULL OR quiz_generating_since < now() - make_interval(secs => $2::float8 / 1000))
    RETURNING id`,
};

/**
 * One generator per content row: claims the row, or waits until `ready()` (another job finished), retrying the claim
 * once it goes stale. Throws `JobError('LESSON_BUSY')` after `giveUpMs`.
 */
export async function claimOrWait(
  ds: DataSource,
  contentId: string,
  column: ClaimColumn,
  ready: () => Promise<boolean>,
  {
    pollMs = 1000,
    staleMs = 180_000,
    giveUpMs = 240_000,
  }: { pollMs?: number; staleMs?: number; giveUpMs?: number } = {},
): Promise<'claimed' | 'ready'> {
  const until = Date.now() + giveUpMs;
  for (;;) {
    // Postgres UPDATE through TypeORM's query() resolves to [rows, affectedCount].
    const [, affected] = (await ds.query(CLAIM_SQL[column], [contentId, staleMs])) as [unknown[], number];
    if (affected === 1) return 'claimed';
    if (await ready()) return 'ready';
    if (Date.now() >= until) throw new JobError('LESSON_BUSY');
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

export async function releaseClaim(ds: DataSource, contentId: string, column: ClaimColumn): Promise<void> {
  await ds.query(
    column === 'generating_since'
      ? `UPDATE lesson_contents SET generating_since = NULL WHERE id = $1`
      : `UPDATE lesson_contents SET quiz_generating_since = NULL WHERE id = $1`,
    [contentId],
  );
}
