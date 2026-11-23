// Needs Postgres, Redis, RabbitMQ and Typesense from docker-compose.yml, migrated (`pnpm migration:run`).
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { aiJobsConsumerOptions } from '../src/modules/ai-jobs/ai-jobs.constants.js';
import { AiJobsService } from '../src/modules/ai-jobs/ai-jobs.service.js';
import { LearningPathEntity } from '../src/modules/learning-paths/entities/learning-path.entity.js';
import { insertModules } from '../src/modules/learning-paths/learning-paths.service.js';
import { PathAi, type ExtendInput, type ExtendOutput } from '../src/modules/learning-paths/path-ai.js';
import { User } from '../src/modules/users/user.entity.js';
import { FakePathAi } from './fake-path-ai.js';

class CountingAi extends FakePathAi {
  extendCalls = 0;
  override async extend(input: ExtendInput): Promise<ExtendOutput> {
    this.extendCalls++;
    await new Promise((r) => setTimeout(r, 300));
    return super.extend(input);
  }
}

describe('Path extension (e2e)', { timeout: 60_000 }, () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  let ds: DataSource;
  let jobs: AiJobsService;
  const ai = new CountingAi();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
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
    jobs = app.get(AiJobsService);
  });
  afterAll(() => app.close());
  beforeEach(() => {
    ai.extendCalls = 0;
    ai.extendComplete = false;
  });

  async function newUser() {
    const email = `extend-${randomUUID()}@example.com`;
    const password = 'correct horse battery';
    await http
      .post('/auth/sign-up')
      .send({ email, password, dateOfBirth: '2000-01-01', fullName: 'Test', timezone: 'Asia/Ho_Chi_Minh' })
      .expect(202);
    await ds.getRepository(User).update({ email }, { emailVerifiedAt: new Date() });
    const { body } = await http.post('/auth/sign-in').send({ email, password }).expect(200);
    const [{ id }] = await ds.query(`SELECT id FROM users WHERE email = $1`, [email]);
    const auth = { Authorization: `Bearer ${body.accessToken}` };
    return {
      id: id as string,
      path: (pathId: string) => http.get(`/learning-paths/${pathId}`).set(auth),
      complete: (lessonId: string) => http.post(`/lessons/${lessonId}/complete`).set(auth),
      copy: (pathId: string) => http.post(`/community/paths/${pathId}/copy`).set(auth),
    };
  }

  /** An active original: 2 modules, 3 lessons. */
  const makePath = (userId: string) =>
    ds.transaction(async (m) => {
      const p = await m.save(
        m.create(LearningPathEntity, {
          userId,
          status: 'active',
          title: 'SQL',
          summary: 'Tóm tắt',
          preferences: { topic: 'SQL', level: 'beginner' },
          contentLanguage: 'vi',
        }),
      );
      await insertModules(m, p.id, [
        { title: 'M1', lessons: [{ title: 'A' }, { title: 'B' }] },
        { title: 'M2', lessons: [{ title: 'C' }] },
      ]);
      return p.id as string;
    });

  const lessonIds = async (u: Awaited<ReturnType<typeof newUser>>, pathId: string): Promise<string[]> =>
    (await u.path(pathId).expect(200)).body.modules.flatMap((m: { lessons: { id: string }[] }) =>
      m.lessons.map((l) => l.id),
    );

  /** Waits until no extend job for this root is queued or running. */
  async function settle(rootId: string) {
    const until = Date.now() + 20_000;
    for (;;) {
      const [{ n }] = await ds.query(
        `SELECT count(*)::int AS n FROM ai_jobs WHERE type = 'extend_path' AND input->>'rootId' = $1
           AND status IN ('queued', 'running')`,
        [rootId],
      );
      if (!n) return;
      if (Date.now() > until) throw new Error('extend job still active');
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  it('extends the original and its copies with shared chapters, calling the model once', async () => {
    const [a, b] = [await newUser(), await newUser()];
    const root = await makePath(a.id);
    const { body: copy } = await b.copy(root).expect(201);
    expect((await a.path(root).expect(200)).body.extension).toBe('idle');

    // Both learners near the end at the same moment.
    const [la, lb] = [await lessonIds(a, root), await lessonIds(b, copy.id)];
    await Promise.all([a.complete(la[0]).expect(200), b.complete(lb[0]).expect(200)]);
    await settle(root);

    expect(ai.extendCalls).toBe(1);
    const [pa, pb] = [(await a.path(root).expect(200)).body, (await b.path(copy.id).expect(200)).body];
    expect(pa.modules.map((m: { title: string }) => m.title)).toEqual(['M1', 'M2', 'Mở rộng 3']);
    expect(pb.modules.map((m: { title: string }) => m.title)).toEqual(['M1', 'M2', 'Mở rộng 3']);
    const content = (pathId: string) =>
      ds.query(
        `SELECT l.content_id FROM path_lessons l JOIN path_modules m ON m.id = l.module_id
         WHERE m.path_id = $1 AND m.position = 2 ORDER BY l.position`,
        [pathId],
      );
    const [ca, cb] = [await content(root), await content(copy.id)];
    expect(ca).toHaveLength(2);
    expect(cb).toEqual(ca);
    expect(pa.extension).toBe('idle');
    // A copy made after the extension gets the new chapter too.
    const c = await newUser();
    const { body: late } = await c.copy(root).expect(201);
    expect((await c.path(late.id).expect(200)).body.modules).toHaveLength(3);
  });

  it('skips the model when the outline already grew past the job', async () => {
    const a = await newUser();
    const root = await makePath(a.id);
    await jobs.enqueue(a.id, 'extend_path', { rootId: root, afterModules: 1 });
    await settle(root);
    expect(ai.extendCalls).toBe(0);
    expect((await a.path(root).expect(200)).body.modules).toHaveLength(2);
  });

  it('marks the course complete when the model says so, and stops extending', async () => {
    ai.extendComplete = true;
    const a = await newUser();
    const root = await makePath(a.id);
    const ids = await lessonIds(a, root);
    await a.complete(ids[0]).expect(200);
    await settle(root);
    expect(ai.extendCalls).toBe(1);
    const { body } = await a.path(root).expect(200);
    expect(body.extension).toBe('complete');
    expect(body.modules).toHaveLength(2);
    await a.complete(ids[1]).expect(200);
    await settle(root);
    expect(ai.extendCalls).toBe(1);
  });

  it('does not extend while more than two lessons remain', async () => {
    const a = await newUser();
    const root = await ds.transaction(async (m) => {
      const p = await m.save(
        m.create(LearningPathEntity, {
          userId: a.id,
          status: 'active',
          title: 'Dài',
          summary: 'S',
          preferences: { topic: 'x', level: 'beginner' },
          contentLanguage: 'vi',
        }),
      );
      await insertModules(m, p.id, [
        { title: 'M1', lessons: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] },
        { title: 'M2', lessons: [{ title: 'D' }, { title: 'E' }] },
      ]);
      return p.id as string;
    });
    await a.complete((await lessonIds(a, root))[0]).expect(200);
    await settle(root);
    expect(ai.extendCalls).toBe(0);
  });
});
