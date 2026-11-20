// Needs Postgres and Redis from docker-compose.yml, migrated (`pnpm migration:run`).
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { AiError } from '../src/modules/learning-paths/ai-output.js';
import { GREETING } from '../src/modules/learning-paths/conversations.service.js';
import { PathConversation } from '../src/modules/learning-paths/entities/path-conversation.entity.js';
import { PathMessage } from '../src/modules/learning-paths/entities/path-message.entity.js';
import { PathAi } from '../src/modules/learning-paths/path-ai.js';
import { StubPathAi } from '../src/modules/learning-paths/stub-path-ai.js';
import { User } from '../src/modules/users/user.entity.js';

// Stub with a test-controlled delay and failure.
class ControlledAi extends StubPathAi {
  delayMs = 0;
  fail = false;
  override async chat(input: Parameters<StubPathAi['chat']>[0]) {
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.fail) throw new AiError('AI_UNAVAILABLE', true);
    return super.chat(input);
  }
}

describe('Conversations (e2e)', () => {
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
    await app.init();
    http = request(app.getHttpServer());
    ds = app.get(DataSource);
  });

  afterAll(() => app.close());
  beforeEach(() => {
    ai.delayMs = 0;
    ai.fail = false;
  });

  async function newUser() {
    const email = `conv-${randomUUID()}@example.com`;
    const password = 'correct horse battery';
    await http
      .post('/auth/sign-up')
      .send({ email, password, dateOfBirth: '2000-01-01', fullName: 'Test', timezone: 'Asia/Ho_Chi_Minh' })
      .expect(202);
    await ds.getRepository(User).update({ email }, { emailVerifiedAt: new Date() });
    const { body } = await http.post('/auth/sign-in').send({ email, password }).expect(200);
    const auth = { Authorization: `Bearer ${body.accessToken}` };
    return {
      current: () => http.get('/learning-paths/conversations/current').set(auth),
      start: () => http.post('/learning-paths/conversations').set(auth),
      send: (id: string, content: unknown) =>
        http.post(`/learning-paths/conversations/${id}/messages`).set(auth).send({ content }),
    };
  }

  it('current returns 404, then POST creates a conversation with the greeting as first message', async () => {
    const u = await newUser();
    await u.current().expect(404);
    const { body } = await u.start().expect(201);
    expect(body).toMatchObject({ ready: false, activeJob: null, draftPathId: null, preferences: {} });
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]).toMatchObject({ role: 'assistant', content: GREETING });
    expect((await u.current().expect(200)).body.id).toBe(body.id);
  });

  it('a full stub conversation reaches ready only after the goal answer', async () => {
    const u = await newUser();
    const { id } = (await u.start()).body;
    const readies: boolean[] = [];
    for (const text of ['SQL căn bản', 'Cơ bản', '30 phút', 'Làm báo cáo']) {
      const { body } = await u.send(id, text).expect(200);
      readies.push(body.ready);
    }
    expect(readies).toEqual([false, false, false, true]);
    const view = (await u.current()).body;
    expect(view.ready).toBe(true);
    expect(view.preferences).toMatchObject({ topic: 'SQL căn bản', level: 'beginner', dailyMinutes: 30 });
    expect(view.messages.map((m: { role: string }) => m.role)).toEqual([
      'assistant', 'user', 'assistant', 'user', 'assistant', 'user', 'assistant', 'user', 'assistant',
    ]);
  });

  it('POST conversations again closes the old one and returns a fresh one', async () => {
    const u = await newUser();
    const first = (await u.start()).body;
    const second = (await u.start().expect(201)).body;
    expect(second.id).not.toBe(first.id);
    const old = await ds.getRepository(PathConversation).findOneByOrFail({ id: first.id });
    expect(old.status).toBe('closed');
    await u.send(first.id, 'hi').expect(409);
  });

  it('concurrent turns: the second gets 409 TURN_IN_PROGRESS and history holds exactly one user message', async () => {
    const u = await newUser();
    const { id } = (await u.start()).body;
    ai.delayMs = 300;
    const [a, b] = await Promise.all([u.send(id, 'SQL'), u.send(id, 'Python')]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body).toMatchObject({ statusCode: 409, code: 'TURN_IN_PROGRESS' });
    const users = await ds.getRepository(PathMessage).countBy({ conversationId: id, role: 'user' });
    expect(users).toBe(1);
  });

  it('the 21st user turn gets 409 CONVERSATION_LIMIT', async () => {
    const u = await newUser();
    const { id } = (await u.start()).body;
    await ds.getRepository(PathConversation).update(id, { userTurns: 20 });
    const res = await u.send(id, 'one more').expect(409);
    expect(res.body).toMatchObject({ code: 'CONVERSATION_LIMIT' });
  });

  it('content of 501 chars gets 400', async () => {
    const u = await newUser();
    const { id } = (await u.start()).body;
    await u.send(id, 'x'.repeat(501)).expect(400);
    await u.send(id, '   ').expect(400);
    await u.send(id, 'x'.repeat(500)).expect(200);
  });

  it('when the AI throws AI_UNAVAILABLE the turn returns 503 and the user message is not stored', async () => {
    const u = await newUser();
    const { id } = (await u.start()).body;
    ai.fail = true;
    const res = await u.send(id, 'SQL').expect(503);
    expect(res.body).toMatchObject({ statusCode: 503, code: 'AI_UNAVAILABLE' });
    expect(await ds.getRepository(PathMessage).countBy({ conversationId: id, role: 'user' })).toBe(0);
    ai.fail = false;
    await u.send(id, 'SQL').expect(200); // the lock was released
  });

  it("another user's conversation id returns 404", async () => {
    const [a, b] = [await newUser(), await newUser()];
    const { id } = (await a.start()).body;
    await b.send(id, 'hi').expect(404);
    await b.send(randomUUID(), 'hi').expect(404);
  });

  it('throttles messages at 20 a minute per user, not per IP', async () => {
    const [a, b] = [await newUser(), await newUser()];
    const ida = (await a.start()).body.id;
    const idb = (await b.start()).body.id;
    await ds.getRepository(PathConversation).update([ida, idb], { userTurns: 20 });
    for (let i = 0; i < 20; i++) await a.send(ida, 'x').expect(409);
    await a.send(ida, 'x').expect(429);
    await b.send(idb, 'x').expect(409);
  });
});
