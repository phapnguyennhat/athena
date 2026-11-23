import type { DataSource } from 'typeorm';
import { JobError } from '../ai-jobs/job-handlers.js';
import { claimOrWait } from './content-claim.js';

const fakeDs = (affected: number[]) => {
  const query = vi.fn(async () => (affected.shift() ? [[{ since: 'ts' }], 1] : [[], 0]));
  return { ds: { query } as unknown as DataSource, query };
};
const opts = { pollMs: 5, staleMs: 1000, giveUpMs: 50 };

describe('claimOrWait', () => {
  it('returns the claim token when the update hits the row', async () => {
    const { ds } = fakeDs([1]);
    await expect(claimOrWait(ds, 'c', 'generating_since', async () => false, opts)).resolves.toBe('ts');
  });

  it('returns null once another job finished', async () => {
    let n = 0;
    const { ds } = fakeDs([]);
    await expect(claimOrWait(ds, 'c', 'generating_since', async () => ++n === 3, opts)).resolves.toBeNull();
  });

  it('retries the claim while waiting (a stale claim is taken over)', async () => {
    const { ds, query } = fakeDs([0, 0, 1]);
    await expect(claimOrWait(ds, 'c', 'quiz_generating_since', async () => false, opts)).resolves.toBe('ts');
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0]).toEqual([expect.stringContaining('quiz_generating_since'), ['c', 1000]]);
  });

  it('gives up with LESSON_BUSY', async () => {
    const { ds } = fakeDs([]);
    const err = await claimOrWait(ds, 'c', 'generating_since', async () => false, opts).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JobError);
    expect((err as JobError).code).toBe('LESSON_BUSY');
  });
});
