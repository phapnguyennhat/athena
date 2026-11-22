// Needs Postgres, Redis and RabbitMQ from docker-compose.yml, migrated (`pnpm migration:run`).
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { AiJob } from '../src/modules/ai-jobs/ai-job.entity.js';
import { aiJobsConsumerOptions } from '../src/modules/ai-jobs/ai-jobs.constants.js';
import { LearningPathEntity } from '../src/modules/learning-paths/entities/learning-path.entity.js';
import { PathConversation } from '../src/modules/learning-paths/entities/path-conversation.entity.js';
import { PathAi } from '../src/modules/learning-paths/path-ai.js';
import { FakePathAi } from './fake-path-ai.js';
import type { Preferences } from '../src/modules/learning-paths/dto/learning-path.dto.js';
import { User } from '../src/modules/users/user.entity.js';

class ControlledAi extends FakePathAi {
  delayMs = 0;
  nineModules = false;
  override async generate(p: Preferences) {
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    const out = await super.generate(p);
    if (this.nineModules) out.modules = Array.from({ length: 9 }, () => out.modules[0]);
    return out;
  }
}

describe('Path generation (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  let ds: DataSource;
  const ai = new ControlledAi();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard) // auth routes only; UserThrottlerGuard stays real
      .useValue({ canActivate: () => true })
      .overrideProvider(PathAi)
      .useValue(ai)
      .compile();
    app = moduleRef.createNestApplication();
    app.connectMicroservice<MicroserviceOptions>(
      { transport: Transport.RMQ, options: aiJobsConsumerOptions(process.env.RABBITMQ_URL!) },
      { inheritAppConfig: true },
    );
    await app.startAllMicroservices();
    await app.init();
    http = request(app.getHttpServer());
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    await ds.query(`DELETE FROM categories WHERE slug LIKE 'e2e-%'`);
    await app.close();
  });
  beforeEach(() => {
    ai.delayMs = 0;
    ai.nineModules = false;
    ai.category = 'Lập Trình';
  });

  async function newUser() {
    const email = `gen-${randomUUID()}@example.com`;
    const password = 'correct horse battery';
    await http
      .post('/auth/sign-up')
      .send({ email, password, dateOfBirth: '2000-01-01', fullName: 'Test', timezone: 'Asia/Ho_Chi_Minh' })
      .expect(202);
    await ds.getRepository(User).update({ email }, { emailVerifiedAt: new Date() });
    const { body } = await http.post('/auth/sign-in').send({ email, password }).expect(200);
    const auth = { Authorization: `Bearer ${body.accessToken}` };
    const u = {
      start: () => http.post('/learning-paths/conversations').set(auth),
      current: () => http.get('/learning-paths/conversations/current').set(auth),
      send: (id: string, content: string) =>
        http.post(`/learning-paths/conversations/${id}/messages`).set(auth).send({ content }),
      generate: (id: string) => http.post(`/learning-paths/conversations/${id}/generate`).set(auth),
      job: (id: string) => http.get(`/jobs/${id}`).set(auth),
      path: (id: string) => http.get(`/learning-paths/${id}`).set(auth),
      list: () => http.get('/learning-paths').set(auth),
      startPath: (id: string, body: object = {}) => http.post(`/learning-paths/${id}/start`).set(auth).send(body),
      /** Polls the job until it leaves queued/running. */
      async settle(jobId: string, timeoutMs = 5000) {
        const until = Date.now() + timeoutMs;
        for (;;) {
          const { body } = await u.job(jobId).expect(200);
          if (body.status === 'succeeded' || body.status === 'failed') return body;
          if (Date.now() > until) throw new Error(`job ${jobId} still ${body.status}`);
          await new Promise((r) => setTimeout(r, 100));
        }
      },
      /** An open conversation that is ready to generate. */
      async readyConversation(): Promise<string> {
        const { id } = (await u.start().expect(201)).body;
        await ds
          .getRepository(PathConversation)
          .update(id, { ready: true, preferences: { topic: 'SQL căn bản', level: 'beginner' } });
        return id;
      },
    };
    return u;
  }

  it('generate before ready returns 409 NOT_READY', async () => {
    const u = await newUser();
    const { id } = (await u.start()).body;
    const res = await u.generate(id).expect(409);
    expect(res.body).toMatchObject({ statusCode: 409, code: 'NOT_READY' });
  });

  it('generate returns 202, the job reaches succeeded, GET /learning-paths/:resultId returns 3+ modules', async () => {
    const u = await newUser();
    const id = await u.readyConversation();
    const { body: job } = await u.generate(id).expect(202);
    expect(job).toMatchObject({ type: 'generate_path', status: 'queued', resultId: null, errorCode: null });
    const done = await u.settle(job.id);
    expect(done).toMatchObject({ status: 'succeeded', errorCode: null });
    const { body: path } = await u.path(done.resultId).expect(200);
    expect(path).toMatchObject({ id: done.resultId, status: 'draft' });
    expect(path.modules.length).toBeGreaterThanOrEqual(3);
    expect(path.modules[0]).toEqual({ id: expect.any(String), title: 'Nền tảng', lessons: expect.any(Array) });
    expect(path.modules[0].lessons[0]).toEqual({
      id: expect.any(String),
      title: expect.stringContaining('(bài 1)'),
      status: 'not_started',
    });
    expect(path.progress).toEqual({ done: 0, total: 12 });
    expect((await u.current()).body).toMatchObject({ activeJob: null, draftPathId: done.resultId });
  });

  it('regenerating replaces the draft: the first path id now 404s', async () => {
    const u = await newUser();
    const id = await u.readyConversation();
    const first = await u.settle((await u.generate(id).expect(202)).body.id);
    const second = await u.settle((await u.generate(id).expect(202)).body.id);
    expect(second.status).toBe('succeeded');
    expect(second.resultId).not.toBe(first.resultId);
    await u.path(first.resultId).expect(404);
    await u.path(second.resultId).expect(200);
  });

  it('generating twice quickly returns the same jobId', async () => {
    const u = await newUser();
    const id = await u.readyConversation();
    ai.delayMs = 500;
    const [a, b] = await Promise.all([u.generate(id), u.generate(id)]);
    expect([a.status, b.status]).toEqual([202, 202]);
    expect(a.body.id).toBe(b.body.id);
    expect((await u.current()).body.activeJob).toMatchObject({ id: a.body.id });
    await u.settle(a.body.id);
  });

  it('a stub that returns 9 modules fails the job with AI_INVALID_OUTPUT and keeps the previous draft', async () => {
    const u = await newUser();
    const id = await u.readyConversation();
    const first = await u.settle((await u.generate(id)).body.id);
    ai.nineModules = true;
    const bad = await u.settle((await u.generate(id).expect(202)).body.id, 8000);
    expect(bad).toMatchObject({ status: 'failed', errorCode: 'AI_INVALID_OUTPUT', resultId: null });
    expect((await ds.getRepository(AiJob).findOneByOrFail({ id: bad.id })).attempts).toBe(2); // retried once
    await u.path(first.resultId).expect(200);
    expect((await u.current()).body.draftPathId).toBe(first.resultId);
  }, 15_000);

  it('start closes the conversation; a new turn then gets 409 CONVERSATION_CLOSED', async () => {
    const u = await newUser();
    const id = await u.readyConversation();
    const done = await u.settle((await u.generate(id)).body.id);
    const edited = [{ title: 'Chỉ một chương', lessons: [{ title: 'Một bài' }] }];
    const { body } = await u.startPath(done.resultId, { modules: edited }).expect(200);
    expect(body).toMatchObject({ id: done.resultId, status: 'active', modules: edited });
    const res = await u.send(id, 'thêm nữa').expect(409);
    expect(res.body).toMatchObject({ code: 'CONVERSATION_CLOSED' });
    await u.generate(id).expect(409);
    await u.current().expect(404);
  });

  it('start-over while the job is generating: new view has no activeJob, the job fails CONVERSATION_CLOSED, nothing saved', async () => {
    const u = await newUser();
    const id = await u.readyConversation();
    ai.delayMs = 800;
    const jobId = (await u.generate(id).expect(202)).body.id;
    for (let i = 0; i < 50 && (await u.job(jobId)).body.status !== 'running'; i++)
      await new Promise((r) => setTimeout(r, 20));
    await new Promise((r) => setTimeout(r, 100));
    const fresh = (await u.start().expect(201)).body;
    expect(fresh.activeJob).toBeNull(); // the old conversation's job is still running here
    expect(await u.settle(jobId)).toMatchObject({ status: 'failed', errorCode: 'CONVERSATION_CLOSED', resultId: null });
    expect(await ds.getRepository(LearningPathEntity).countBy({ conversationId: id })).toBe(0);
  });

  it("another user's job and path return 404", async () => {
    const [a, b] = [await newUser(), await newUser()];
    const id = await a.readyConversation();
    const done = await a.settle((await a.generate(id)).body.id);
    await b.job(done.id).expect(404);
    await b.path(done.resultId).expect(404);
    await b.generate(id).expect(404);
  });

  it('saves the matching seeded category and the tags on the generated path', async () => {
    const u = await newUser();
    const done = await u.settle((await u.generate(await u.readyConversation()).expect(202)).body.id);
    const { body: path } = await u.path(done.resultId).expect(200);
    // The fake answers "Lập Trình": matched by slug, the seeded name is kept.
    expect(path.category).toEqual({ id: expect.any(String), name: 'Lập trình' });
    expect(path.tags).toEqual(['sql', 'cơ sở dữ liệu']);
    await u.startPath(done.resultId).expect(200);
    const { body: rows } = await u.list().expect(200);
    expect(rows[0]).toMatchObject({ id: done.resultId, category: path.category, tags: path.tags });
  });

  it('creates a new category once and reuses it for later paths', async () => {
    ai.category = `E2E Nấu ăn ${randomUUID()}`;
    const ids: string[] = [];
    for (const u of [await newUser(), await newUser()]) {
      const done = await u.settle((await u.generate(await u.readyConversation()).expect(202)).body.id);
      const { body } = await u.path(done.resultId).expect(200);
      expect(body.category.name).toBe(ai.category);
      ids.push(body.category.id);
    }
    expect(ids[0]).toBe(ids[1]);
  });
});
