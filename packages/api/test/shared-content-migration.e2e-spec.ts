// Needs Postgres, Redis and RabbitMQ from docker-compose.yml, migrated (`pnpm migration:run`).
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { insertModules } from '../src/modules/learning-paths/learning-paths.service.js';

describe('Shared lesson content (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let userId: string;

  beforeAll(async () => {
    app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    [{ id: userId }] = await ds.query(
      `INSERT INTO users (email, password_hash, date_of_birth, full_name, timezone)
       VALUES ($1, 'x', '2000-01-01', 'Content', 'Asia/Ho_Chi_Minh') RETURNING id`,
      [`content-${randomUUID()}@example.com`],
    );
  });
  afterAll(async () => {
    await ds.query(`DELETE FROM learning_paths WHERE user_id = $1`, [userId]);
    await ds.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await app.close();
  });

  it('gives every new lesson its own content row and keeps no content on path_lessons', async () => {
    const [{ id: pathId }] = await ds.query(
      `INSERT INTO learning_paths (user_id, status, title, summary) VALUES ($1, 'draft', 'SQL', 'Tóm tắt') RETURNING id`,
      [userId],
    );
    await ds.transaction((m) =>
      insertModules(m, pathId, [{ title: 'Nền tảng', lessons: [{ title: 'Một' }, { title: 'Hai' }] }]),
    );
    const rows: { content_id: string; found: string | null; content: unknown }[] = await ds.query(
      `SELECT l.content_id, c.id AS found, c.content FROM path_lessons l
       JOIN path_modules m ON m.id = l.module_id LEFT JOIN lesson_contents c ON c.id = l.content_id
       WHERE m.path_id = $1`,
      [pathId],
    );
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r).toEqual({ content_id: r.found, found: expect.any(String), content: null });
    expect(new Set(rows.map((r) => r.content_id)).size).toBe(2);

    const cols: { column_name: string }[] = await ds.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'path_lessons'`,
    );
    expect(cols.map((c) => c.column_name)).not.toContain('content');
  });
});
