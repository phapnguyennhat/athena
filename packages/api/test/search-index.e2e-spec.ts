// Needs Postgres, Redis, RabbitMQ and Typesense from docker-compose.yml, migrated (`pnpm migration:run`).
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { Client } from 'typesense';
import { AppModule } from '../src/app.module.js';
import { CommunityService } from '../src/modules/community/community.service.js';
import { LearningPathEntity } from '../src/modules/learning-paths/entities/learning-path.entity.js';
import { insertModules } from '../src/modules/learning-paths/learning-paths.service.js';
import { searchConsumerOptions, TYPESENSE } from '../src/modules/search/search.constants.js';
import { SearchIndexService } from '../src/modules/search/search-index.service.js';
import { User } from '../src/modules/users/user.entity.js';

// A collection of its own, so the dev collection is never touched; dropped at the end.
const COLLECTION = `community_paths_e2e_${Date.now()}`;
process.env.TYPESENSE_COLLECTION = COLLECTION;

// Sign-ups hash passwords; several per test exceed the 5 s default on a loaded machine.
describe('Typesense index of community courses (e2e)', { timeout: 30_000 }, () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  let ds: DataSource;
  let search: SearchIndexService;
  let community: CommunityService;
  const run = randomUUID().slice(0, 8);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.connectMicroservice<MicroserviceOptions>(
      { transport: Transport.RMQ, options: searchConsumerOptions(process.env.RABBITMQ_URL!) },
      { inheritAppConfig: true },
    );
    await app.startAllMicroservices();
    await app.init();
    http = request(app.getHttpServer());
    ds = app.get(DataSource);
    search = app.get(SearchIndexService);
    community = app.get(CommunityService);
    // Boot adds the embedding in the background; search results are unreliable until that alter finishes.
    await search.ensureCollection();
  });

  afterAll(async () => {
    await app
      .get<Client>(TYPESENSE)
      .collections(COLLECTION)
      .delete()
      .catch(() => {});
    await app.close();
  });

  async function newUser() {
    const email = `search-${randomUUID()}@example.com`;
    const password = 'correct horse battery';
    await http
      .post('/auth/sign-up')
      .send({ email, password, dateOfBirth: '2000-01-01', fullName: 'Test', timezone: 'Asia/Ho_Chi_Minh' })
      .expect(202);
    await ds.getRepository(User).update({ email }, { emailVerifiedAt: new Date() });
    const { id } = await ds.getRepository(User).findOneByOrFail({ email });
    const { body } = await http.post('/auth/sign-in').send({ email, password }).expect(200);
    return { id, auth: { Authorization: `Bearer ${body.accessToken}` } };
  }

  async function makePath(
    userId: string,
    o: {
      title?: string;
      summary?: string;
      tags?: string[];
      status?: 'draft' | 'active';
      category?: string;
    } = {},
  ): Promise<string> {
    const [{ id: categoryId }] = await ds.query(`SELECT id FROM categories WHERE slug = $1`, [
      o.category ?? 'lap-trinh',
    ]);
    return ds.transaction(async (m) => {
      const p = await m.save(
        m.create(LearningPathEntity, {
          userId,
          status: o.status ?? 'active',
          title: o.title ?? `Khoá ${run}`,
          summary: o.summary ?? 'Tóm tắt',
          preferences: { topic: 'x', level: 'beginner' },
          contentLanguage: 'vi',
          categoryId,
          tags: o.tags ?? [`t-${run}`],
        }),
      );
      await insertModules(m, p.id, [{ title: 'M', lessons: [{ title: 'A' }, { title: 'B' }] }]);
      return p.id;
    });
  }

  it('upserts a public path once and deletes drafts and copies', async () => {
    const [a, b] = [await newUser(), await newUser()];
    const tag = `once-${run}`;
    const pub = await makePath(a.id, { tags: [tag] });
    expect(await search.sync(pub)).toBe('upserted');
    expect(await search.sync(pub)).toBe('upserted');
    expect((await search.search({ tag, limit: 10 })).ids).toEqual([pub]);

    const draft = await makePath(a.id, { tags: [tag], status: 'draft' });
    expect(await search.sync(draft)).toBe('deleted');
    const { id: copy } = await community.copy(b.id, pub);
    expect(await search.sync(copy)).toBe('deleted');
    expect((await search.search({ tag, limit: 10 })).ids).toEqual([pub]);
  });

  it('matches Vietnamese without diacritics, including đ', async () => {
    const a = await newUser();
    const id = await makePath(a.id, { title: `Nấu ăn món Việt đường phố ${run}` });
    await search.sync(id);
    expect((await search.search({ q: `nau an ${run}`, limit: 10 })).ids).toContain(id);
    expect((await search.search({ q: `duong pho ${run}`, limit: 10 })).ids).toContain(id);
  });

  it('filters by tag and category and orders by copies', async () => {
    const [a, b, c] = [await newUser(), await newUser(), await newUser()];
    const tag = `sql-${run}`;
    const few = await makePath(a.id, { tags: [tag, 'sql'] });
    const many = await makePath(a.id, { tags: [tag], category: 'ngoai-ngu' });
    const other = await makePath(a.id, { tags: [`other-${run}`] });
    await community.copy(b.id, many);
    await community.copy(c.id, many);
    await community.copy(b.id, few);
    for (const id of [few, many, other]) await search.sync(id);

    expect((await search.search({ tag, limit: 10 })).ids).toEqual([many, few]);
    const sql = (await search.search({ tag: 'sql', limit: 250 })).ids;
    expect(sql).toContain(few);
    expect(sql).not.toContain(many);
    const [{ id: lang }] = await ds.query(`SELECT id FROM categories WHERE slug = 'ngoai-ngu'`);
    const inLang = (await search.search({ categoryId: lang, limit: 250 })).ids;
    expect(inLang).toContain(many);
    expect(inLang).not.toContain(few);
    expect((await search.categoryFacets()).find((f) => f.id === lang)?.count).toBeGreaterThanOrEqual(1);
  });

  it('indexes a path started over HTTP through the search.index queue', async () => {
    const a = await newUser();
    const tag = `queue-${run}`;
    const id = await makePath(a.id, { tags: [tag], status: 'draft' });
    await http.post(`/learning-paths/${id}/start`).set(a.auth).send({}).expect(200);
    const until = Date.now() + 5000;
    let ids: string[] = [];
    while (Date.now() < until && !ids.length) {
      ids = (await search.search({ tag, limit: 10 })).ids;
      if (!ids.length) await new Promise((r) => setTimeout(r, 200));
    }
    expect(ids).toEqual([id]);
  });

  it('re-indexes the source when a copy is deleted over HTTP', async () => {
    const [a, b] = [await newUser(), await newUser()];
    const src = await makePath(a.id);
    const { id: copy } = await community.copy(b.id, src);
    const indexed = app.get<Client>(TYPESENSE).collections(COLLECTION).documents(src);
    const copies = async () => ((await indexed.retrieve()) as { copies: number }).copies;
    await search.sync(src);
    expect(await copies()).toBe(1);
    await http.delete(`/learning-paths/${copy}`).set(b.auth).expect(204);
    const until = Date.now() + 5000;
    while (Date.now() < until && (await copies()) !== 0) await new Promise((r) => setTimeout(r, 200));
    expect(await copies()).toBe(0);
  });

  it('reindexAll indexes every public path and drops stale documents', async () => {
    const ts = app.get<Client>(TYPESENSE);
    await ts
      .collections(COLLECTION)
      .documents()
      .upsert({
        id: randomUUID(),
        title: `stale ${run}`,
        title_plain: `stale ${run}`,
        tags_plain: [],
        summary: '',
        tags: [`stale-${run}`],
        lesson_count: 0,
        copies: 0,
        created_at: 0,
      });
    expect((await search.search({ tag: `stale-${run}`, limit: 10 })).ids).toHaveLength(1);
    const [{ n }] = await ds.query(
      `SELECT count(*)::int AS n FROM learning_paths p WHERE p.status = 'active' AND p.source_path_id IS NULL`,
    );
    // A listed document that a consumer deleted meanwhile must not abort the rebuild.
    const proto = Object.getPrototypeOf(ts.collections(COLLECTION).documents()) as { export: () => Promise<string> };
    const real = proto.export;
    const spy = vi.spyOn(proto, 'export').mockImplementation(async function (this: unknown, ...args: unknown[]) {
      return `${await real.apply(this, args as [])}\n{"id":"${randomUUID()}"}`;
    });
    try {
      expect(await search.reindexAll()).toBe(n);
    } finally {
      spy.mockRestore();
    }
    expect((await search.search({ tag: `stale-${run}`, limit: 10 })).ids).toEqual([]);
  });

  describe('similar', () => {
    let sqlPath: string;

    beforeAll(async () => {
      const a = await newUser();
      sqlPath = await makePath(a.id, {
        title: `SQL truy vấn để phân tích dữ liệu ${run}`,
        summary: 'Viết câu truy vấn SELECT, JOIN, GROUP BY để tổng hợp số liệu và làm báo cáo.',
        tags: ['sql', 'phân tích dữ liệu'],
      });
      await search.sync(sqlPath);
    });

    it('finds a paraphrased course at the same level', async () => {
      const { ids } = await search.similar({ q: 'học SQL để làm báo cáo số liệu', level: 'beginner', limit: 50 });
      expect(ids).toContain(sqlPath);
    });

    it('filters by level', async () => {
      const { ids } = await search.similar({ q: 'học SQL để làm báo cáo số liệu', level: 'advanced', limit: 3 });
      expect(ids).not.toContain(sqlPath);
    });

    it('returns nothing for an unrelated topic', async () => {
      const { ids } = await search.similar({ q: 'Nấu phở bò truyền thống', level: 'beginner', limit: 3 });
      expect(ids).not.toContain(sqlPath);
    });

    it('ignores word overlap with a different subject', async () => {
      // Shares "lập trình", "cơ bản"-style syllables with programming courses but not the subject.
      const { ids } = await search.similar({ q: 'Lập trình Java cơ bản', level: 'beginner', limit: 3 });
      expect(ids).not.toContain(sqlPath);
    });
  });

  it('keeps the collection and keyword search when the embedding model cannot load', async () => {
    const ts = app.get<Client>(TYPESENSE);
    const name = `${COLLECTION}_nomodel`;
    process.env.TYPESENSE_COLLECTION = name;
    const proto = Object.getPrototypeOf(ts.collections(name)) as { update: () => Promise<unknown> };
    const spy = vi.spyOn(proto, 'update').mockRejectedValue(new Error('model download failed'));
    try {
      const svc = new SearchIndexService(ds, ts, undefined as never);
      await expect(svc.ensureCollection()).resolves.toBeUndefined();
      expect((await svc.search({ limit: 1 })).ids).toEqual([]);
    } finally {
      spy.mockRestore();
      process.env.TYPESENSE_COLLECTION = COLLECTION;
      await ts
        .collections(name)
        .delete()
        .catch(() => {});
    }
  });

  it('ensureCollection adds the embedding field to an old collection', async () => {
    const ts = app.get<Client>(TYPESENSE);
    const old = `${COLLECTION}_old`;
    await ts.collections().create({
      name: old,
      fields: [
        { name: 'title', type: 'string' },
        { name: 'summary', type: 'string' },
        { name: 'tags', type: 'string[]' },
      ],
    });
    process.env.TYPESENSE_COLLECTION = old;
    try {
      const svc = new SearchIndexService(ds, ts, undefined as never);
      await svc.ensureCollection();
      const { fields } = await ts.collections(old).retrieve();
      expect(fields.map((f) => f.name)).toContain('embedding');
    } finally {
      process.env.TYPESENSE_COLLECTION = COLLECTION;
      await ts
        .collections(old)
        .delete()
        .catch(() => {});
    }
  }, 120_000);
  // Last: it drops the collection.
  it('recreates a missing collection on sync and search', async () => {
    const a = await newUser();
    const tag = `gone-${run}`;
    const id = await makePath(a.id, { tags: [tag] });
    await app.get<Client>(TYPESENSE).collections(COLLECTION).delete();
    expect(await search.sync(id)).toBe('upserted');
    expect((await search.search({ tag, limit: 10 })).ids).toEqual([id]);
    await app.get<Client>(TYPESENSE).collections(COLLECTION).delete();
    expect((await search.search({ tag, limit: 10 })).ids).toEqual([]);
  });
});
