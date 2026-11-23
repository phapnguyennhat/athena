// Needs Postgres, Redis and RabbitMQ from docker-compose.yml, migrated (`pnpm migration:run`).
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { CommunityService } from '../src/modules/community/community.service.js';
import { LearningPathEntity } from '../src/modules/learning-paths/entities/learning-path.entity.js';
import { insertModules } from '../src/modules/learning-paths/learning-paths.service.js';
import { User } from '../src/modules/users/user.entity.js';

const MODULES = [
  { title: 'Cơ bản', lessons: [{ title: 'SELECT' }, { title: 'WHERE' }] },
  { title: 'Nâng cao', lessons: [{ title: 'JOIN' }] },
];

// Sign-ups hash passwords; several per test exceed the 5 s default on a loaded machine.
describe('Copying courses and hiding deleted originals (e2e)', { timeout: 30_000 }, () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  let ds: DataSource;
  let community: CommunityService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    http = request(app.getHttpServer());
    ds = app.get(DataSource);
    community = app.get(CommunityService);
  });

  afterAll(() => app.close());

  async function newUser() {
    const email = `copy-${randomUUID()}@example.com`;
    const password = 'correct horse battery';
    await http
      .post('/auth/sign-up')
      .send({ email, password, dateOfBirth: '2000-01-01', fullName: 'Test', timezone: 'Asia/Ho_Chi_Minh' })
      .expect(202);
    await ds.getRepository(User).update({ email }, { emailVerifiedAt: new Date() });
    const { id } = await ds.getRepository(User).findOneByOrFail({ email });
    const { body } = await http.post('/auth/sign-in').send({ email, password }).expect(200);
    const auth = { Authorization: `Bearer ${body.accessToken}` };
    return {
      id,
      get: (url: string) => http.get(url).set(auth),
      del: (url: string) => http.delete(url).set(auth),
      post: (url: string, body?: object) => http.post(url).set(auth).send(body),
    };
  }

  /** A path with generated-looking content on every lesson. */
  async function makePath(userId: string, status: 'draft' | 'active' = 'active'): Promise<string> {
    const [{ id: categoryId }] = await ds.query(`SELECT id FROM categories WHERE slug = 'lap-trinh'`);
    const id = await ds.transaction(async (m) => {
      const p = await m.save(
        m.create(LearningPathEntity, {
          userId,
          status,
          title: 'SQL cho người mới',
          summary: 'Truy vấn dữ liệu',
          preferences: { topic: 'SQL', level: 'beginner', goal: 'Đi làm' },
          contentLanguage: 'vi',
          categoryId,
          tags: ['sql', 'cơ sở dữ liệu'],
        }),
      );
      await insertModules(m, p.id, MODULES);
      return p.id;
    });
    await ds.query(`UPDATE lesson_contents SET content = '{"sections":[]}' WHERE id IN (${lessonsSql})`, [id]);
    return id;
  }

  const lessonsSql = `SELECT l.content_id FROM path_lessons l JOIN path_modules m ON m.id = l.module_id WHERE m.path_id = $1`;
  const lessons = (pathId: string): Promise<{ id: string; title: string; content_id: string }[]> =>
    ds.query(
      `SELECT l.id, l.title, l.content_id FROM path_lessons l JOIN path_modules m ON m.id = l.module_id
       WHERE m.path_id = $1 ORDER BY m.position, l.position`,
      [pathId],
    );
  const row = async (id: string) => (await ds.query(`SELECT * FROM learning_paths WHERE id = $1`, [id]))[0];
  const contentsExist = async (ids: string[]) =>
    (await ds.query(`SELECT count(*)::int AS n FROM lesson_contents WHERE id = ANY($1)`, [ids]))[0].n;
  /** A one-question quiz on a content row; the answer is option 0. */
  const makeQuiz = async (contentId: string): Promise<string> =>
    (
      await ds.query(`INSERT INTO quizzes (content_id, questions) VALUES ($1, $2::jsonb) RETURNING id`, [
        contentId,
        JSON.stringify([{ prompt: 'Q', options: ['a', 'b'], answer: 0, explanation: 'E' }]),
      ])
    )[0].id;
  const status = (p: Promise<unknown>) =>
    p.then(
      () => 200,
      (e: { status?: number; getStatus?: () => number }) => e.getStatus?.() ?? e.status,
    );

  it('copies an active original once, sharing content and dropping the goal', async () => {
    const [a, b] = [await newUser(), await newUser()];
    const src = await makePath(a.id);
    const first = await community.copy(b.id, src);
    expect(first.created).toBe(true);
    const copy = await row(first.id);
    const orig = await row(src);
    expect(copy).toMatchObject({
      user_id: b.id,
      status: 'active',
      source_path_id: src,
      title: orig.title,
      summary: orig.summary,
      category_id: orig.category_id,
      tags: orig.tags,
      content_language: orig.content_language,
      conversation_id: null,
      hidden_at: null,
    });
    expect(copy.preferences).toEqual({ topic: 'SQL', level: 'beginner' });
    const [ls, lc] = [await lessons(src), await lessons(first.id)];
    expect(lc.map((l) => [l.title, l.content_id])).toEqual(ls.map((l) => [l.title, l.content_id]));
    expect(lc.map((l) => l.id)).not.toEqual(ls.map((l) => l.id));
    expect(await community.copy(b.id, src)).toEqual({ id: first.id, created: false });
  });

  it('refuses own, draft, copied and already-learnt sources', async () => {
    const [a, b, c] = [await newUser(), await newUser(), await newUser()];
    const src = await makePath(a.id);
    expect(await status(community.copy(a.id, src))).toBe(404);
    expect(await status(community.copy(b.id, await makePath(a.id, 'draft')))).toBe(404);
    expect(await status(community.copy(b.id, randomUUID()))).toBe(404);
    const { id: copyB } = await community.copy(b.id, src);
    expect(await status(community.copy(c.id, copyB))).toBe(404);
    // c learns the same content through another path: a second lesson on it is refused.
    const other = await makePath(c.id);
    const [l] = await lessons(other);
    await ds.query(`UPDATE path_lessons SET content_id = $1 WHERE id = $2`, [(await lessons(src))[0].content_id, l.id]);
    const err = await community.copy(c.id, src).catch((e: { getStatus(): number; getResponse(): object }) => e);
    expect((err as { getStatus(): number }).getStatus()).toBe(409);
    expect((err as { getResponse(): object }).getResponse()).toMatchObject({ code: 'ALREADY_LEARNING', pathId: other });
  });

  it('deleting an active original hides it from its owner; copying it again un-hides it with progress', async () => {
    const [a, b] = [await newUser(), await newUser()];
    const src = await makePath(a.id);
    const [la] = await lessons(src);
    await a.get(`/lessons/${la.id}`).expect(200);
    const { id: copyB } = await community.copy(b.id, src);
    expect((await b.get('/learning-paths').expect(200)).body).toEqual([
      expect.objectContaining({ id: copyB, isCopy: true }),
    ]);
    expect((await b.get(`/learning-paths/${copyB}`).expect(200)).body.isCopy).toBe(true);

    await a.del(`/learning-paths/${src}`).expect(204);
    expect((await a.get('/learning-paths').expect(200)).body.map((p: { id: string }) => p.id)).not.toContain(src);
    await a.get(`/learning-paths/${src}`).expect(404);
    await a.get(`/lessons/${la.id}`).expect(404);
    expect((await a.get('/dashboard').expect(200)).body.continue).toBeNull();
    expect((await row(src)).hidden_at).not.toBeNull();
    const [lb] = await lessons(copyB);
    expect((await b.get(`/lessons/${lb.id}`).expect(200)).body.content).toEqual({ sections: [] });

    expect(await community.copy(a.id, src)).toEqual({ id: src, created: false });
    expect((await row(src)).hidden_at).toBeNull();
    expect((await a.get(`/lessons/${la.id}`).expect(200)).body.status).toBe('in_progress');
  });

  it('deleting a copy or a draft removes it and only the content nobody else uses', async () => {
    const [a, b] = [await newUser(), await newUser()];
    const src = await makePath(a.id);
    const { id: copyB } = await community.copy(b.id, src);
    const shared = (await lessons(src)).map((l) => l.content_id);
    await b.del(`/learning-paths/${copyB}`).expect(204);
    expect(await row(copyB)).toBeUndefined();
    expect(await contentsExist(shared)).toBe(shared.length);

    const draft = await makePath(a.id, 'draft');
    const own = (await lessons(draft)).map((l) => l.content_id);
    await a.del(`/learning-paths/${draft}`).expect(204);
    expect(await row(draft)).toBeUndefined();
    expect(await contentsExist(own)).toBe(0);
  });

  it("deleting a copy deletes the learner's quiz attempts on it", async () => {
    const [a, b] = [await newUser(), await newUser()];
    const src = await makePath(a.id);
    const { id: copyB } = await community.copy(b.id, src);
    const [lb] = await lessons(copyB);
    const quiz = await makeQuiz(lb.content_id);
    await b.post(`/quizzes/${quiz}/attempts`, { answers: [0] }).expect(201);
    expect((await b.get('/dashboard').expect(200)).body.totals.quizAttempts).toBe(1);

    await b.del(`/learning-paths/${copyB}`).expect(204);
    expect((await b.get('/dashboard').expect(200)).body.totals.quizAttempts).toBe(0);
    const { id: again } = await community.copy(b.id, src);
    const [lb2] = await lessons(again);
    expect((await b.get(`/lessons/${lb2.id}`).expect(200)).body.quiz).toMatchObject({ id: quiz, lastAttempt: null });
    expect((await b.get(`/lessons/${lb2.id}/quiz`).expect(200)).body).toMatchObject({ attempts: 0, best: null });
  });

  it('a hidden original cannot be started or have its quizzes submitted', async () => {
    const a = await newUser();
    const src = await makePath(a.id);
    const [la] = await lessons(src);
    const quiz = await makeQuiz(la.content_id);
    await a.del(`/learning-paths/${src}`).expect(204);
    await a.post(`/learning-paths/${src}/start`, {}).expect(404);
    const res = await a.post(`/quizzes/${quiz}/attempts`, { answers: [0] }).expect(404);
    expect(res.body.code).toBe('QUIZ_NOT_FOUND');
  });
});
