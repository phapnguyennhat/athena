// Needs Postgres, Redis and RabbitMQ from docker-compose.yml, migrated (`pnpm migration:run`).
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module.js';
import { aiJobsConsumerOptions } from '../src/modules/ai-jobs/ai-jobs.constants.js';
import { PathConversation } from '../src/modules/learning-paths/entities/path-conversation.entity.js';
import { PathAi } from '../src/modules/learning-paths/path-ai.js';
import { FakePathAi } from './fake-path-ai.js';
import { User } from '../src/modules/users/user.entity.js';

describe('Events gateway (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  let ds: DataSource;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(PathAi)
      .useValue(new FakePathAi())
      .compile();
    app = moduleRef.createNestApplication();
    app.connectMicroservice<MicroserviceOptions>(
      { transport: Transport.RMQ, options: aiJobsConsumerOptions(process.env.RABBITMQ_URL!) },
      { inheritAppConfig: true },
    );
    await app.startAllMicroservices();
    await app.listen(0);
    http = request(app.getHttpServer());
    ds = app.get(DataSource);
    url = `http://127.0.0.1:${((app.getHttpServer() as unknown as Server).address() as AddressInfo).port}/events`;
  });

  afterEach(() => {
    for (const s of sockets.splice(0)) s.disconnect();
  });
  afterAll(() => app.close());

  async function newUser() {
    const email = `ev-${randomUUID()}@example.com`;
    const password = 'correct horse battery';
    await http
      .post('/auth/sign-up')
      .send({ email, password, dateOfBirth: '2000-01-01', fullName: 'Test', timezone: 'Asia/Ho_Chi_Minh' })
      .expect(202);
    await ds.getRepository(User).update({ email }, { emailVerifiedAt: new Date() });
    const { body } = await http.post('/auth/sign-in').send({ email, password }).expect(200);
    return { accessToken: body.accessToken as string, refreshToken: body.refreshToken as string };
  }

  function connect(auth: Record<string, unknown>) {
    const s = io(url, { auth, transports: ['websocket'], reconnection: false });
    sockets.push(s);
    return s;
  }

  /** Resolves 'connected' if the socket stays up, or 'auth_error' once the server emits it and disconnects. */
  function outcome(s: Socket): Promise<'connected' | 'auth_error'> {
    return new Promise((resolve, reject) => {
      let authError = false;
      s.on('auth_error', () => (authError = true));
      s.on('disconnect', () => (authError ? resolve('auth_error') : reject(new Error('disconnected without auth_error'))));
      s.on('connect_error', reject);
      s.on('connect', () => setTimeout(() => s.connected && resolve('connected'), 300));
    });
  }

  async function generate(accessToken: string) {
    const auth = { Authorization: `Bearer ${accessToken}` };
    const { id } = (await http.post('/learning-paths/conversations').set(auth).expect(201)).body;
    await ds
      .getRepository(PathConversation)
      .update(id, { ready: true, preferences: { topic: 'SQL căn bản', level: 'beginner' } });
    return (await http.post(`/learning-paths/conversations/${id}/generate`).set(auth).expect(202)).body as { id: string };
  }

  it('connects with a valid access token', async () => {
    const { accessToken } = await newUser();
    expect(await outcome(connect({ token: accessToken }))).toBe('connected');
  });

  it('is disconnected with a forged token', async () => {
    const { accessToken } = await newUser();
    const [h, p] = accessToken.split('.');
    expect(await outcome(connect({ token: `${h}.${p}.forged-signature` }))).toBe('auth_error');
  });

  it('is disconnected without a string token', async () => {
    expect(await outcome(connect({}))).toBe('auth_error');
    expect(await outcome(connect({ token: 42 }))).toBe('auth_error');
    expect(await outcome(connect({ token: '' }))).toBe('auth_error');
  });

  it('is disconnected with a revoked (signed-out) token', async () => {
    const { accessToken, refreshToken } = await newUser();
    await http.post('/auth/sign-out').set({ Authorization: `Bearer ${accessToken}` }).send({ refreshToken }).expect((r) => {
      expect(r.status).toBeLessThan(300);
    });
    expect(await outcome(connect({ token: accessToken }))).toBe('auth_error');
  });

  it('receives job.updated running then succeeded for its own job', async () => {
    const { accessToken } = await newUser();
    const s = connect({ token: accessToken });
    expect(await outcome(s)).toBe('connected');
    const events: Record<string, unknown>[] = [];
    const done = new Promise<void>((resolve) =>
      s.on('job.updated', (e: Record<string, unknown>) => {
        events.push(e);
        if (e.status === 'succeeded' || e.status === 'failed') resolve();
      }),
    );
    const job = await generate(accessToken);
    await done;
    expect(events.map((e) => e.status)).toEqual(['running', 'succeeded']);
    expect(events[0]).toEqual({ jobId: job.id, type: 'generate_path', status: 'running', resultId: null, errorCode: null });
    expect(events[1]).toEqual({ jobId: job.id, type: 'generate_path', status: 'succeeded', resultId: expect.any(String), errorCode: null });
  });

  it("does not receive another user's job.updated", async () => {
    const a = await newUser();
    const b = await newUser();
    const sa = connect({ token: a.accessToken });
    const sb = connect({ token: b.accessToken });
    expect(await Promise.all([outcome(sa), outcome(sb)])).toEqual(['connected', 'connected']);
    const received: unknown[] = [];
    sb.on('job.updated', (e) => received.push(e));
    const done = new Promise<void>((resolve) => sa.on('job.updated', (e: { status: string }) => e.status === 'succeeded' && resolve()));
    await generate(a.accessToken);
    await done;
    await new Promise((r) => setTimeout(r, 100));
    expect(received).toEqual([]);
  });
});
