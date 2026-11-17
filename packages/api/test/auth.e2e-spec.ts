// Needs Postgres and Redis from docker-compose.yml, migrated (`pnpm migration:run`).
import { createHmac, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthenticationStorage } from '@nestjs/authentication';
import { authenticationStoreContract } from '@nestjs/authentication/testing';
import type { Redis } from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { REDIS } from '../src/redis/redis.module.js';
import { RedisRefreshTokenStore } from '../src/modules/auth/redis-refresh-token.store.js';

const b64url = (data: string | Buffer) => Buffer.from(data).toString('base64url');

/** A JWT with the given header, signed with HMAC-SHA256/512 (or unsigned). */
function forge(header: Record<string, unknown>, claims: Record<string, unknown>, sign?: { hash: string; key: string }) {
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = sign ? createHmac(sign.hash, sign.key).update(input).digest('base64url') : '';
  return `${input}.${signature}`;
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  const email = `user-${randomUUID()}@example.com`;
  const password = 'correct horse battery';
  const profile = { fullName: 'Nguyen Van A', timezone: 'Asia/Ho_Chi_Minh' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(() => app.close());

  const signIn = () => http.post('/auth/sign-in').send({ email, password });
  const me = (token: string) => http.get('/auth/me').set('Authorization', `Bearer ${token}`);

  it('signs up and returns a token pair', async () => {
    const res = await http
      .post('/auth/sign-up')
      .send({ email: email.toUpperCase(), password, dateOfBirth: '2000-02-29', ...profile })
      .expect(201);
    expect(res.body).toEqual({ accessToken: expect.any(String), refreshToken: expect.any(String), expiresIn: 900 });
    expect(JSON.parse(Buffer.from(res.body.accessToken.split('.')[0], 'base64url').toString())).toMatchObject({
      alg: 'HS256',
      typ: 'at+jwt',
    });
  });

  it('rejects a second sign-up with the same email', () =>
    http.post('/auth/sign-up').send({ email, password, dateOfBirth: '2000-01-01', ...profile }).expect(409));

  const valid = { email: 'a@example.com', password, dateOfBirth: '2000-01-01', ...profile };
  it.each([
    [{ ...valid, email: 'not-an-email' }],
    [{ ...valid, password: 'short' }],
    [{ ...valid, dateOfBirth: '01/01/2000' }],
    [{ ...valid, dateOfBirth: '2000-02-30' }],
    [{ ...valid, dateOfBirth: '2999-01-01' }],
    [{ ...valid, fullName: '   ' }],
    [{ ...valid, fullName: undefined }],
    [{ ...valid, timezone: 'Mars/Olympus_Mons' }],
    [{ ...valid, timezone: undefined }],
    [{ ...valid, preferredLanguage: 'fr' }],
    [{ ...valid, isAdmin: true }],
  ])('rejects an invalid sign-up body %#', async (body) => {
    await http.post('/auth/sign-up').send(body).expect(400);
  });

  it('rejects a wrong password and an unknown email the same way', async () => {
    const wrong = await http.post('/auth/sign-in').send({ email, password: 'wrong password' }).expect(401);
    const unknown = await http.post('/auth/sign-in').send({ email: 'nobody@example.com', password }).expect(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('authenticates with the bearer access token, never exposing the password hash', async () => {
    const { body } = await signIn().expect(200);
    const res = await me(body.accessToken).expect(200);
    expect(res.body).toMatchObject({
      email,
      dateOfBirth: '2000-02-29',
      fullName: 'Nguyen Van A',
      timezone: 'Asia/Ho_Chi_Minh',
      preferredLanguage: 'en',
    });
    expect(res.body).not.toHaveProperty('passwordHash');
    await http.get('/auth/me').expect(401);
  });

  it('accepts only HS256 access tokens it signed', async () => {
    const { body } = await signIn().expect(200);
    const [, payload] = body.accessToken.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const key = process.env.JWT_SECRET!;

    await me(forge({ alg: 'none', typ: 'at+jwt' }, claims)).expect(401);
    await me(forge({ alg: 'HS512', typ: 'at+jwt' }, claims, { hash: 'sha512', key })).expect(401);
    await me(forge({ alg: 'HS256', typ: 'at+jwt' }, claims, { hash: 'sha256', key: 'x'.repeat(32) })).expect(401);
    await me(forge({ alg: 'HS256', typ: 'JWT' }, claims, { hash: 'sha256', key })).expect(401);
    // Same key and algorithm, so this one is genuine: the checks above failed on alg, key and typ alone.
    await me(forge({ alg: 'HS256', typ: 'at+jwt' }, claims, { hash: 'sha256', key })).expect(200);
  });

  it('rotates refresh tokens and revokes the family when a spent one is reused', async () => {
    const first = (await signIn().expect(200)).body;
    const second = (await http.post('/auth/refresh').send({ refreshToken: first.refreshToken }).expect(200)).body;
    expect(second.refreshToken).not.toBe(first.refreshToken);

    await http.post('/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
    await http.post('/auth/refresh').send({ refreshToken: second.refreshToken }).expect(401);
  });

  it('signs out: the access and refresh tokens stop working', async () => {
    const { body } = await signIn().expect(200);
    await http
      .post('/auth/sign-out')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .send({ refreshToken: body.refreshToken })
      .expect(204);

    await me(body.accessToken).expect(401);
    await http.post('/auth/refresh').send({ refreshToken: body.refreshToken }).expect(401);
  });

  describe('RedisRefreshTokenStore contract', () => {
    const cases = authenticationStoreContract(
      () => ({ refreshTokens: new RedisRefreshTokenStore(app.get<Redis>(REDIS), new AuthenticationStorage()) }),
      { contracts: ['refreshTokens'], concurrent: true },
    );
    it.each(cases.map((c) => [c.name, c]))('%s', (_, c) => c.run());
  });
});
