// Needs Postgres, Redis, RabbitMQ and Typesense from docker-compose.yml, migrated (`pnpm migration:run`).
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { Client } from 'typesense';
import { AppModule } from '../src/app.module.js';
import { LearningPathEntity } from '../src/modules/learning-paths/entities/learning-path.entity.js';
import { insertModules } from '../src/modules/learning-paths/learning-paths.service.js';
import { TYPESENSE, typesenseClient } from '../src/modules/search/search.constants.js';
import { SearchIndexService } from '../src/modules/search/search-index.service.js';
import { User } from '../src/modules/users/user.entity.js';

// A collection of its own, so the dev collection is never touched; dropped at the end.
const COLLECTION = `community_paths_e2e_${Date.now()}`;
process.env.TYPESENSE_COLLECTION = COLLECTION;

type Auth = { Authorization: string };
type Item = { id: string; category: { id: string; name: string } | null; copies: number; copiedPathId: string | null };

// Sign-ups hash passwords; several per test exceed the 5 s default on a loaded machine.
describe('Community API (e2e)', { timeout: 30_000 }, () => {
  let app: INestApplication<App>;
  let down: INestApplication<App>;
  let http: ReturnType<typeof request>;
  let ds: DataSource;
  let search: SearchIndexService;
  const run = randomUUID().slice(0, 8);
  const tag = `com-${run}`;
  const goal = `secret-goal-${run}`;
  let lapTrinh: string;
  // A authors; B learns (own lap-trinh path + a copy); C has no paths.
  let a: { id: string; auth: Auth };
  let b: { id: string; auth: Auth };
  let c: { id: string; auth: Auth };
  let p: { l1: string; l2: string; n1: string; hidden: string; draft: string; own: string; copy: string };

  const boot = async (typesenseUrl?: string) => {
    let builder = Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true });
    if (typesenseUrl) builder = builder.overrideProvider(TYPESENSE).useValue(typesenseClient(typesenseUrl, 'x'));
    const nest = (await builder.compile()).createNestApplication();
    await nest.init();
    return nest;
  };

  async function newUser() {
    const email = `community-${randomUUID()}@example.com`;
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
    o: { status?: 'draft' | 'active'; category?: string; title?: string } = {},
  ): Promise<string> {
    const [{ id: categoryId }] = await ds.query(`SELECT id FROM categories WHERE slug = $1`, [
      o.category ?? 'lap-trinh',
    ]);
    return ds.transaction(async (m) => {
      const path = await m.save(
        m.create(LearningPathEntity, {
          userId,
          status: o.status ?? 'active',
          title: o.title ?? `Khoá ${run}`,
          summary: 'Tóm tắt',
          preferences: { topic: 'x', level: 'beginner', goal },
          contentLanguage: 'vi',
          categoryId,
          tags: [tag],
        }),
      );
      await insertModules(m, path.id, [
        { title: 'M1', lessons: [{ title: 'A' }, { title: 'B' }] },
        { title: 'M2', lessons: [{ title: 'C' }] },
      ]);
      return path.id;
    });
  }

  beforeAll(async () => {
    app = await boot();
    http = request(app.getHttpServer());
    ds = app.get(DataSource);
    search = app.get(SearchIndexService);
    [{ id: lapTrinh }] = await ds.query(`SELECT id FROM categories WHERE slug = 'lap-trinh'`);
    [a, b, c] = [await newUser(), await newUser(), await newUser()];
    const l1 = await makePath(a.id, { title: `Lập trình một ${run}` });
    const l2 = await makePath(a.id);
    const n1 = await makePath(a.id, { category: 'ngoai-ngu' });
    const hidden = await makePath(a.id);
    const draft = await makePath(a.id, { status: 'draft' });
    const own = await makePath(b.id);
    await http.delete(`/learning-paths/${hidden}`).set(a.auth).expect(204);
    const { body } = await http.post(`/community/paths/${l2}/copy`).set(b.auth).expect(201);
    await http.post(`/community/paths/${n1}/copy`).set(c.auth).expect(201);
    p = { l1, l2, n1, hidden, draft, own, copy: body.id };
    for (const id of Object.values(p)) await search.sync(id);
    down = await boot('http://127.0.0.1:1');
  }, 180_000);

  afterAll(async () => {
    await app
      .get<Client>(TYPESENSE)
      .collections(COLLECTION)
      .delete()
      .catch(() => {});
    await down?.close();
    await app.close();
  });

  const list = (auth: Auth, query = `tag=${tag}`) => http.get(`/community/paths?${query}`).set(auth);
  const anonymous = (body: unknown) => {
    const s = JSON.stringify(body);
    for (const leak of [a.id, goal, '"userId"', '"goal"', '"conversationId"', '"preferences"'])
      expect(s).not.toContain(leak);
  };

  it('lists public paths in Typesense order, without own visible paths, drafts or copies', async () => {
    const { ids } = await search.search({ tag, limit: 50 });
    const { body } = await list(b.auth).expect(200);
    const got = (body.items as Item[]).map((i) => i.id);
    expect(got).toEqual(ids.filter((id) => id !== p.own));
    expect(new Set(got)).toEqual(new Set([p.l1, p.l2, p.n1, p.hidden]));
    anonymous(body);
    const l1 = (body.items as Item[]).find((i) => i.id === p.l1);
    expect(l1).toEqual({
      id: p.l1,
      title: `Lập trình một ${run}`,
      summary: 'Tóm tắt',
      category: { id: lapTrinh, name: 'Lập trình' },
      tags: [tag],
      level: 'beginner',
      moduleCount: 2,
      lessonCount: 3,
      copies: 0,
      copiedPathId: null,
      thumbnailUrl: null,
    });
    expect((body.items as Item[]).find((i) => i.id === p.l2)).toMatchObject({ copies: 1, copiedPathId: p.copy });
  });

  it("includes the owner's hidden original but not their visible ones", async () => {
    const { body } = await list(a.auth).expect(200);
    // B's path is not A's own.
    expect(new Set((body.items as Item[]).map((i) => i.id))).toEqual(new Set([p.hidden, p.own]));
    expect((body.items as Item[]).find((i) => i.id === p.hidden)?.copiedPathId).toBeNull();
  });

  it('searches and filters by category', async () => {
    const { body } = await list(b.auth, `q=${encodeURIComponent(`lap trinh mot ${run}`)}&tag=${tag}`).expect(200);
    expect((body.items as Item[]).map((i) => i.id)).toContain(p.l1);
    const [{ id: lang }] = await ds.query(`SELECT id FROM categories WHERE slug = 'ngoai-ngu'`);
    const inLang = await list(b.auth, `tag=${tag}&category=${lang}`).expect(200);
    expect((inLang.body.items as Item[]).map((i) => i.id)).toEqual([p.n1]);
    const one = await list(b.auth, `tag=${tag}&limit=1`).expect(200);
    expect(one.body.items).toHaveLength(1);
  });

  it('validates the query', async () => {
    await list(b.auth, `q=${'a'.repeat(101)}`).expect(400);
    await list(b.auth, 'limit=60').expect(400);
    await list(b.auth, 'limit=0').expect(400);
    await list(b.auth, 'category=nope').expect(400);
    await list(b.auth, 'extra=1').expect(400);
    await http.get('/community/recommendations?limit=21').set(b.auth).expect(400);
    await http.get('/community/paths?tag=x').expect(401);
  });

  it('shows the detail of a public path only', async () => {
    const { body } = await http.get(`/community/paths/${p.l1}`).set(b.auth).expect(200);
    expect(body).toMatchObject({ id: p.l1, lessonCount: 3, moduleCount: 2, copiedPathId: null });
    expect(body.modules).toEqual([
      { title: 'M1', lessons: [{ title: 'A' }, { title: 'B' }] },
      { title: 'M2', lessons: [{ title: 'C' }] },
    ]);
    anonymous(body);
    // The owner opens their own visible course rather than copying it; a hidden one is offered for copying again.
    expect((await http.get(`/community/paths/${p.l1}`).set(a.auth).expect(200)).body.copiedPathId).toBe(p.l1);
    expect((await http.get(`/community/paths/${p.hidden}`).set(a.auth).expect(200)).body.copiedPathId).toBeNull();
    for (const id of [p.draft, p.copy, randomUUID()]) {
      const res = await http.get(`/community/paths/${id}`).set(b.auth).expect(404);
      expect(res.body.code).toBe('COURSE_NOT_FOUND');
    }
    await http.get('/community/paths/not-a-uuid').set(b.auth).expect(400);
  });

  it("uses the first lesson's first video as the thumbnail", async () => {
    expect((await http.get(`/community/paths/${p.l1}`).set(b.auth).expect(200)).body.thumbnailUrl).toBeNull();
    const [first] = await ds.query(
      `SELECT l.content_id FROM path_lessons l JOIN path_modules m ON m.id = l.module_id
       WHERE m.path_id = $1 ORDER BY m.position, l.position LIMIT 1`,
      [p.l1],
    );
    await ds.query(
      `INSERT INTO lesson_resources (content_id, provider, external_id, title, thumbnail_url, position)
       VALUES ($1, 'youtube', 'v2', 'B', 'https://i.ytimg.com/vi/v2/hq.jpg', 1),
              ($1, 'youtube', 'v1', 'A', 'https://i.ytimg.com/vi/v1/hq.jpg', 0)`,
      [first.content_id],
    );
    const { body } = await http.get(`/community/paths/${p.l1}`).set(b.auth).expect(200);
    expect(body.thumbnailUrl).toBe('https://i.ytimg.com/vi/v1/hq.jpg');
  });

  it('copies with 201, then returns the same copy with 200', async () => {
    const src = await makePath(a.id);
    const first = await http.post(`/community/paths/${src}/copy`).set(c.auth).expect(201);
    expect(first.body).toEqual({ id: expect.any(String) });
    const again = await http.post(`/community/paths/${src}/copy`).set(c.auth).expect(200);
    expect(again.body).toEqual(first.body);
    await http.post(`/community/paths/${p.draft}/copy`).set(c.auth).expect(404);
    await http.post('/community/paths/not-a-uuid/copy').set(c.auth).expect(400);
    await search.sync(src);
    const { body } = await http.get(`/community/paths/${src}`).set(c.auth).expect(200);
    expect(body).toMatchObject({ copies: 1, copiedPathId: first.body.id });
  });

  it('counts categories from the index', async () => {
    const { body } = await http.get('/community/categories').set(b.auth).expect(200);
    const counts = (body as { count: number }[]).map((x) => x.count);
    expect(counts).toEqual([...counts].sort((x, y) => y - x));
    const lt = (body as { id: string; name: string; count: number }[]).find((x) => x.id === lapTrinh);
    expect(lt?.name).toBe('Lập trình');
    expect(lt?.count).toBeGreaterThanOrEqual(4);
  });

  it("recommends the caller's categories first, excluding own and copied paths", async () => {
    const { body } = await http.get('/community/recommendations?limit=20').set(b.auth).expect(200);
    const ids = (body as Item[]).map((i) => i.id);
    anonymous(body);
    expect(ids).not.toContain(p.own);
    expect(ids).not.toContain(p.l2);
    expect(ids).toContain(p.l1);
    expect(ids).toContain(p.n1);
    // B's paths are all Lập trình: every Lập trình course comes before the rest, even a more-copied one.
    const isLt = (body as Item[]).map((i) => i.category?.id === lapTrinh);
    expect(isLt).toEqual([...isLt].sort((x, y) => Number(y) - Number(x)));
    expect(ids.indexOf(p.l1)).toBeLessThan(ids.indexOf(p.n1));

    const own = await http.get('/community/recommendations').set(a.auth).expect(200);
    expect((own.body as Item[]).map((i) => i.id)).not.toContain(p.hidden);
  });

  it('recommends the most-copied courses to a user with no paths', async () => {
    const d = await newUser();
    const { body } = await http.get('/community/recommendations').set(d.auth).expect(200);
    expect(body.length).toBeLessThanOrEqual(10);
    const copies = (body as Item[]).map((i) => i.copies);
    expect(copies).toEqual([...copies].sort((x, y) => y - x));
  });

  it('answers 503 SEARCH_UNAVAILABLE when Typesense is down', async () => {
    const res = await request(down.getHttpServer()).get('/community/paths').set(b.auth).expect(503);
    expect(res.body).toMatchObject({ statusCode: 503, code: 'SEARCH_UNAVAILABLE' });
    await request(down.getHttpServer()).get('/community/categories').set(b.auth).expect(503);
    await request(down.getHttpServer()).get('/community/recommendations').set(b.auth).expect(200);
  });
});
