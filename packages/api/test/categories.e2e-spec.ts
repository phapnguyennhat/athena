// Needs Postgres from docker-compose.yml, migrated (`pnpm migration:run`).
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../src/database/database.options.js';
import { resolveCategory, slugify } from '../src/modules/learning-paths/categories.js';

describe('Categories (e2e)', () => {
  let ds: DataSource;

  beforeAll(async () => {
    if (existsSync('.env')) process.loadEnvFile('.env');
    ds = await new DataSource({ ...databaseOptions(process.env), migrations: [] }).initialize();
  });
  afterAll(async () => {
    await ds.query(`DELETE FROM categories WHERE slug LIKE 'e2e-%'`);
    await ds.destroy();
  });

  const count = async () => (await ds.query(`SELECT count(*)::int AS n FROM categories`))[0].n as number;

  it('reuses the seeded category when the name differs only in case, accents or spacing', async () => {
    const [seeded] = await ds.query(`SELECT id FROM categories WHERE slug = 'lap-trinh'`);
    const before = await count();
    expect(await ds.transaction((m) => resolveCategory(m, 'lập  TRÌNH'))).toBe(seeded.id);
    expect(await ds.transaction((m) => resolveCategory(m, 'Lap trinh'))).toBe(seeded.id);
    expect(await count()).toBe(before);
  });

  it('creates one row when two transactions add the same new category at once', async () => {
    const name = `E2E Nấu ăn ${randomUUID()}`;
    const [a, b] = await Promise.all([
      ds.transaction((m) => resolveCategory(m, name)),
      ds.transaction((m) => resolveCategory(m, name.toUpperCase())),
    ]);
    expect(a).toBe(b);
    const rows = await ds.query(`SELECT name FROM categories WHERE slug = $1`, [slugify(name)]);
    expect(rows).toHaveLength(1);
  });

  it('falls back to Khác for a name with no letters or digits', async () => {
    const [khac] = await ds.query(`SELECT id FROM categories WHERE slug = 'khac'`);
    expect(await ds.transaction((m) => resolveCategory(m, '!!!'))).toBe(khac.id);
  });
});
