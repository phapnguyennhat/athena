// Needs Postgres from docker-compose.yml, migrated (`pnpm migration:run`).
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../src/database/database.options.js';
import { backfillCategories } from '../src/modules/learning-paths/backfill-categories.js';
import type { CategorizeInput } from '../src/modules/learning-paths/path-ai.js';
import { FakePathAi } from './fake-path-ai.js';

class FlakyAi extends FakePathAi {
  failTitle = '';
  seen: CategorizeInput[] = [];
  override async categorize(input?: CategorizeInput) {
    if (input) this.seen.push(input);
    if (input?.title === this.failTitle) throw new Error('model down');
    return super.categorize();
  }
}

describe('Category backfill (e2e)', () => {
  let ds: DataSource;
  let userId: string;

  beforeAll(async () => {
    if (existsSync('.env')) process.loadEnvFile('.env');
    ds = await new DataSource({ ...databaseOptions(process.env), migrations: [] }).initialize();
    [{ id: userId }] = await ds.query(
      `INSERT INTO users (email, password_hash, date_of_birth, full_name, timezone)
       VALUES ($1, 'x', '2000-01-01', 'Backfill', 'Asia/Ho_Chi_Minh') RETURNING id`,
      [`backfill-${randomUUID()}@example.com`],
    );
  });
  afterAll(async () => {
    await ds.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await ds.destroy();
  });

  const insertPath = async (title: string, status: 'active' | 'draft') => {
    const [{ id }] = await ds.query(
      `INSERT INTO learning_paths (user_id, status, title, summary) VALUES ($1, $2, $3, 'Tóm tắt') RETURNING id`,
      [userId, status, title],
    );
    await ds.query(`INSERT INTO path_modules (path_id, position, title) VALUES ($1, 0, 'Nền tảng')`, [id]);
    return id as string;
  };
  const categoryOf = async (id: string) =>
    (
      await ds.query(
        `SELECT c.name, p.tags FROM learning_paths p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = $1`,
        [id],
      )
    )[0] as { name: string | null; tags: string[] };

  it('categorizes active paths, skips drafts, logs a failure and picks it up on the next run', async () => {
    const ai = new FlakyAi();
    ai.failTitle = `fail-${randomUUID()}`;
    const good = await insertPath(`ok-${randomUUID()}`, 'active');
    const failing = await insertPath(ai.failTitle, 'active');
    const draft = await insertPath(`draft-${randomUUID()}`, 'draft');
    const logs: string[] = [];

    const first = await backfillCategories(ds, ai, (m) => logs.push(m), { userId });
    expect(first.failed).toBe(1);
    expect(first.done).toBe(1);
    expect(logs.some((l) => l.includes(failing))).toBe(true);
    expect(await categoryOf(good)).toEqual({ name: 'Lập trình', tags: ['sql', 'cơ sở dữ liệu'] });
    expect(ai.seen.find((s) => s.title.startsWith('ok-'))).toMatchObject({ summary: 'Tóm tắt', modules: ['Nền tảng'] });
    expect((await categoryOf(failing)).name).toBeNull();
    expect((await categoryOf(draft)).name).toBeNull();

    ai.failTitle = '';
    await backfillCategories(ds, ai, () => {}, { userId });
    expect((await categoryOf(failing)).name).toBe('Lập trình');
  });
});
