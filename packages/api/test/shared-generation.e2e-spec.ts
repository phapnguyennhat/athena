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
import { aiJobsConsumerOptions } from '../src/modules/ai-jobs/ai-jobs.constants.js';
import { AiError } from '../src/modules/learning-paths/ai-output.js';
import { PathConversation } from '../src/modules/learning-paths/entities/path-conversation.entity.js';
import { PathAi } from '../src/modules/learning-paths/path-ai.js';
import type { LessonInput, LessonOutput, QuizInput, QuizOutput } from '../src/modules/lessons/lesson-output.js';
import { claimOrWait, releaseClaim } from '../src/modules/lessons/content-claim.js';
import { User } from '../src/modules/users/user.entity.js';
import { FakePathAi } from './fake-path-ai.js';

class CountingAi extends FakePathAi {
  lessonCalls = 0;
  quizCalls = 0;
  failLesson = false;
  lastLessonInput?: LessonInput;
  override async lesson(input: LessonInput): Promise<LessonOutput> {
    this.lessonCalls++;
    this.lastLessonInput = input;
    await new Promise((r) => setTimeout(r, 500));
    if (this.failLesson) throw new AiError('AI_UNAVAILABLE', false);
    return super.lesson(input);
  }
  override async quiz(input: QuizInput): Promise<QuizOutput> {
    this.quizCalls++;
    await new Promise((r) => setTimeout(r, 500));
    return super.quiz(input);
  }
}

describe('Shared lesson content is generated once (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  let ds: DataSource;
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
  });

  afterAll(() => app.close());
  beforeEach(() => {
    ai.failLesson = false;
  });

  async function newUser() {
    const email = `shared-${randomUUID()}@example.com`;
    const password = 'correct horse battery';
    await http
      .post('/auth/sign-up')
      .send({ email, password, dateOfBirth: '2000-01-01', fullName: 'Test', timezone: 'Asia/Ho_Chi_Minh' })
      .expect(202);
    await ds.getRepository(User).update({ email }, { emailVerifiedAt: new Date() });
    const { body } = await http.post('/auth/sign-in').send({ email, password }).expect(200);
    const auth = { Authorization: `Bearer ${body.accessToken}` };
    const get = (url: string) => http.get(url).set(auth);
    const post = (url: string, body?: object) => http.post(url).set(auth).send(body);
    const settle = async (jobId: string) => {
      const until = Date.now() + 8000;
      for (;;) {
        const { body: job } = await get(`/jobs/${jobId}`).expect(200);
        if (job.status === 'succeeded' || job.status === 'failed') return job;
        if (Date.now() > until) throw new Error(`job ${jobId} still ${job.status}`);
        await new Promise((r) => setTimeout(r, 100));
      }
    };
    /** The first lesson id of a fresh active path (with a goal, which lessons must not see). */
    const firstLesson = async (): Promise<string> => {
      const { id } = (await post('/learning-paths/conversations').expect(201)).body;
      await ds
        .getRepository(PathConversation)
        .update(id, { ready: true, preferences: { topic: 'SQL', level: 'beginner', goal: 'Đi làm' } });
      const job = await settle((await post(`/learning-paths/conversations/${id}/generate`).expect(202)).body.id);
      await post(`/learning-paths/${job.resultId}/start`, {}).expect(200);
      return (await get(`/learning-paths/${job.resultId}`).expect(200)).body.modules[0].lessons[0].id;
    };
    return { get, post, settle, firstLesson };
  }

  /** Two learners whose first lessons share one content row. */
  async function sharedPair() {
    const [a, b] = [await newUser(), await newUser()];
    const [la, lb] = [await a.firstLesson(), await b.firstLesson()];
    await ds.query(
      `UPDATE path_lessons SET content_id = (SELECT content_id FROM path_lessons WHERE id = $1) WHERE id = $2`,
      [la, lb],
    );
    const [{ content_id: contentId }] = await ds.query(`SELECT content_id FROM path_lessons WHERE id = $1`, [la]);
    return { a, b, la, lb, contentId: contentId as string };
  }

  const claims = async (contentId: string) =>
    (
      await ds.query(`SELECT generating_since, quiz_generating_since FROM lesson_contents WHERE id = $1`, [contentId])
    )[0];

  it('two learners opening one shared lesson at once: one model call, same content, then one quiz', async () => {
    const { a, b, la, lb, contentId } = await sharedPair();
    const calls = ai.lessonCalls;
    const [ja, jb] = await Promise.all([
      a.post(`/lessons/${la}/generate-content`).expect(202),
      b.post(`/lessons/${lb}/generate-content`).expect(202),
    ]);
    const [da, db] = await Promise.all([a.settle(ja.body.id), b.settle(jb.body.id)]);
    expect([da.status, db.status]).toEqual(['succeeded', 'succeeded']);
    expect([da.resultId, db.resultId]).toEqual([la, lb]);
    expect(ai.lessonCalls).toBe(calls + 1);
    const [va, vb] = [
      (await a.get(`/lessons/${la}`).expect(200)).body,
      (await b.get(`/lessons/${lb}`).expect(200)).body,
    ];
    expect(va.content).not.toBeNull();
    expect(vb.content).toEqual(va.content);
    expect(await claims(contentId)).toEqual({ generating_since: null, quiz_generating_since: null });

    const quizCalls = ai.quizCalls;
    const [qa, qb] = await Promise.all([
      a.post(`/lessons/${la}/quiz/generate`).expect(202),
      b.post(`/lessons/${lb}/quiz/generate`).expect(202),
    ]);
    const [qda, qdb] = await Promise.all([a.settle(qa.body.id), b.settle(qb.body.id)]);
    expect([qda.status, qdb.status]).toEqual(['succeeded', 'succeeded']);
    expect(ai.quizCalls).toBe(quizCalls + 1);
    expect(qdb.resultId).toBe(qda.resultId);
    expect((await b.get(`/lessons/${lb}/quiz`).expect(200)).body.id).toBe(qda.resultId);
    expect(await claims(contentId)).toEqual({ generating_since: null, quiz_generating_since: null });
  }, 30_000);

  it('a stale claim (4 min old) is taken over and the lesson is generated', async () => {
    const u = await newUser();
    const lessonId = await u.firstLesson();
    const [{ content_id: contentId }] = await ds.query(`SELECT content_id FROM path_lessons WHERE id = $1`, [lessonId]);
    await ds.query(`UPDATE lesson_contents SET generating_since = now() - interval '4 minutes' WHERE id = $1`, [
      contentId,
    ]);
    const calls = ai.lessonCalls;
    const job = await u.settle((await u.post(`/lessons/${lessonId}/generate-content`).expect(202)).body.id);
    expect(job).toMatchObject({ status: 'succeeded', resultId: lessonId });
    expect(ai.lessonCalls).toBe(calls + 1);
    expect((await claims(contentId)).generating_since).toBeNull();
  }, 20_000);

  it('a failed model call releases the claim', async () => {
    const u = await newUser();
    const lessonId = await u.firstLesson();
    const [{ content_id: contentId }] = await ds.query(`SELECT content_id FROM path_lessons WHERE id = $1`, [lessonId]);
    ai.failLesson = true;
    const job = await u.settle((await u.post(`/lessons/${lessonId}/generate-content`).expect(202)).body.id);
    expect(job).toMatchObject({ status: 'failed', errorCode: 'AI_UNAVAILABLE' });
    expect((await claims(contentId)).generating_since).toBeNull();
  }, 20_000);

  it("a stale holder's release keeps the newer claim", async () => {
    const u = await newUser();
    const lessonId = await u.firstLesson();
    const [{ content_id: contentId }] = await ds.query(`SELECT content_id FROM path_lessons WHERE id = $1`, [lessonId]);
    for (const column of ['generating_since', 'quiz_generating_since'] as const) {
      const ready = async () => false;
      // staleMs 0: the second claim takes the first over.
      const first = await claimOrWait(ds, contentId, column, ready, { staleMs: 0 });
      const second = await claimOrWait(ds, contentId, column, ready, { staleMs: 0 });
      expect(first).not.toBe(second);
      await releaseClaim(ds, contentId, column, first!);
      expect((await claims(contentId))[column]).not.toBeNull();
      await releaseClaim(ds, contentId, column, second!);
      expect((await claims(contentId))[column]).toBeNull();
    }
  }, 20_000);

  it('lesson input carries no goal', async () => {
    const u = await newUser();
    const lessonId = await u.firstLesson();
    await u.settle((await u.post(`/lessons/${lessonId}/generate-content`).expect(202)).body.id);
    expect(ai.lastLessonInput).toBeDefined();
    expect(ai.lastLessonInput).not.toHaveProperty('goal');
  }, 20_000);
});
