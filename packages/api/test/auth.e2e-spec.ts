// Needs Postgres, Redis, Mailpit and LocalStack from docker-compose.yml, migrated (`pnpm migration:run`).
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
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

// Mailpit's API (docker-compose.yml): the newest message sent to `to`.
interface MailpitMessage {
  Subject: string;
  HTML: string;
  Text: string;
  From: { Address: string };
}
async function latestMail(to: string): Promise<MailpitMessage> {
  const api = `http://localhost:${process.env.MAILPIT_UI_PORT ?? 8025}/api/v1`;
  for (let i = 0; i < 50; i++) {
    const { messages } = (await (await fetch(`${api}/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json()) as {
      messages: { ID: string }[];
    };
    if (messages.length > 0) return (await (await fetch(`${api}/message/${messages[0].ID}`)).json()) as MailpitMessage;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No mail to ${to}`);
}
const codeOf = (mail: MailpitMessage) => /^(\d{6}) /.exec(mail.Subject)![1];

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  const email = `user-${randomUUID()}@example.com`;
  const password = 'correct horse battery';
  const profile = { fullName: 'Nguyễn Văn A', timezone: 'Asia/Ho_Chi_Minh' };

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
  const signUp = (body: Record<string, unknown>) =>
    http.post('/auth/sign-up').send({ password, dateOfBirth: '2000-01-01', ...profile, ...body });

  it('signs up without tokens and emails a 6-digit code through Mailpit', async () => {
    const res = await signUp({ email: email.toUpperCase(), dateOfBirth: '2000-02-29' }).expect(202);
    expect(res.body).toEqual({});

    const mail = await latestMail(email);
    expect(mail.From.Address).toBe('no-reply@athena.local');
    expect(mail.Subject).toMatch(/^\d{6} là mã xác minh Athena của bạn$/);
    expect(mail.HTML).toContain('Xin chào Nguyễn Văn A,');
    expect(mail.HTML).toContain(codeOf(mail));
    expect(mail.Text).toContain(codeOf(mail));
  });

  it('refuses sign-in until the email is verified', async () => {
    const res = await signIn().expect(403);
    expect(res.body).toMatchObject({ code: 'email_unverified' });
  });

  it('rejects a wrong code, verifies with the emailed one without issuing tokens, then signs in', async () => {
    const code = codeOf(await latestMail(email));
    const wrong = code === '000000' ? '111111' : '000000';
    await http.post('/auth/verify-email').send({ email, code: wrong }).expect(400);

    const verified = await http.post('/auth/verify-email').send({ email, code }).expect(204);
    expect(verified.body).toEqual({});

    const res = await signIn().expect(200);
    expect(res.body).toEqual({ accessToken: expect.any(String), refreshToken: expect.any(String), expiresIn: 900 });
    expect(JSON.parse(Buffer.from(res.body.accessToken.split('.')[0], 'base64url').toString())).toMatchObject({
      alg: 'HS256',
      typ: 'at+jwt',
    });
    // Spent: the same code can't be used twice.
    await http.post('/auth/verify-email').send({ email, code }).expect(400);
  });

  it('kills a code after 5 wrong attempts', async () => {
    const other = `user-${randomUUID()}@example.com`;
    await signUp({ email: other }).expect(202);
    const code = codeOf(await latestMail(other));
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await http.post('/auth/verify-email').send({ email: other, code: wrong }).expect(400);
    await http.post('/auth/verify-email').send({ email: other, code }).expect(400);
  });

  it('HTML-escapes user input in the email', async () => {
    const other = `user-${randomUUID()}@example.com`;
    await signUp({ email: other, fullName: '<img src=x onerror=alert(1)>' }).expect(202);
    const mail = await latestMail(other);
    expect(mail.HTML).not.toContain('<img src=x');
    expect(mail.HTML).toContain('&lt;img src&#x3D;x onerror&#x3D;alert(1)&gt;');
  });

  it('answers resend-verification the same for unknown and verified emails', async () => {
    await http.post('/auth/resend-verification').send({ email: 'nobody@example.com' }).expect(202);
    await http.post('/auth/resend-verification').send({ email }).expect(202);
    await http.post('/auth/verify-email').send({ email: 'nobody@example.com', code: '123456' }).expect(400);
  });

  it('rejects a second sign-up with the same email', () => signUp({ email }).expect(409));

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
      fullName: 'Nguyễn Văn A',
      timezone: 'Asia/Ho_Chi_Minh',
      emailVerifiedAt: expect.any(String),
    });
    expect(res.body).not.toHaveProperty('passwordHash');
    await http.get('/auth/me').expect(401);
  });

  it('sets the avatar from a direct S3 upload and serves it through a signed URL', async () => {
    const { body: tokens } = await signIn().expect(200);
    const auth = `Bearer ${tokens.accessToken}`;
    const setAvatar = (key: string) => http.put('/auth/me/avatar').set('Authorization', auth).send({ key });
    const upload = async (body: Buffer) => {
      const { body: ticket } = await http.post('/auth/me/avatar/upload-url').set('Authorization', auth).expect(200);
      const headers = { 'Content-Type': 'image/jpeg' };
      const put = await fetch(ticket.uploadUrl, { method: 'PUT', headers, body: new Uint8Array(body) });
      expect(put.ok).toBe(true);
      return setAvatar(ticket.key);
    };
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(64)]);

    expect((await upload(Buffer.from('not an image'))).status).toBe(400);
    await setAvatar(`avatars/${randomUUID()}/${randomUUID()}.jpg`).expect(400);
    const { status, body } = await upload(jpeg);
    expect(status).toBe(200);
    expect(body).not.toHaveProperty('avatarKey');
    const photo = await fetch(body.avatarUrl);
    expect(Buffer.from(await photo.arrayBuffer())).toEqual(jpeg);
    expect((await me(tokens.accessToken).expect(200)).body.avatarUrl).toMatch(/^http/);
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

  /** A fresh signed-up, verified account and its tokens. */
  async function newAccount(address = `user-${randomUUID()}@example.com`) {
    await signUp({ email: address }).expect(202);
    await http
      .post('/auth/verify-email')
      .send({ email: address, code: codeOf(await latestMail(address)) })
      .expect(204);
    const { body } = await http.post('/auth/sign-in').send({ email: address, password }).expect(200);
    return { address, tokens: body as { accessToken: string; refreshToken: string } };
  }

  it('changes the password: the old one and every old refresh token stop working', async () => {
    const { address, tokens } = await newAccount();
    const change = (body: Record<string, unknown>) =>
      http.put('/auth/me/password').set('Authorization', `Bearer ${tokens.accessToken}`).send(body);

    expect(
      (await change({ currentPassword: 'wrong password', newPassword: 'another password' }).expect(403)).body,
    ).toMatchObject({
      code: 'WRONG_PASSWORD',
    });
    await change({ currentPassword: password, newPassword: 'short' }).expect(400);
    const { body: fresh } = await change({ currentPassword: password, newPassword: 'another password' }).expect(200);

    await http.post('/auth/refresh').send({ refreshToken: tokens.refreshToken }).expect(401);
    await http.post('/auth/refresh').send({ refreshToken: fresh.refreshToken }).expect(200);
    await http.post('/auth/sign-in').send({ email: address, password }).expect(401);
    await http.post('/auth/sign-in').send({ email: address, password: 'another password' }).expect(200);
  });

  it('soft-deletes the account: tokens die, sign-in fails, and the email can sign up again', async () => {
    const { address, tokens } = await newAccount();
    const other = (await http.post('/auth/sign-in').send({ email: address, password }).expect(200)).body;
    const del = (body: Record<string, unknown>) =>
      http.delete('/auth/me').set('Authorization', `Bearer ${tokens.accessToken}`).send(body);

    await del({ password: 'wrong password' }).expect(403);
    await del({ password }).expect(204);

    await me(tokens.accessToken).expect(401);
    await me(other.accessToken).expect(401);
    await http.post('/auth/refresh').send({ refreshToken: other.refreshToken }).expect(401);
    await http.post('/auth/sign-in').send({ email: address, password }).expect(401);

    // Same email, new account with a new id; the deleted row stays.
    const again = await newAccount(address);
    const { body } = await me(again.tokens.accessToken).expect(200);
    expect(body.email).toBe(address);
    expect(body).not.toHaveProperty('deletedAt');
    await signUp({ email: address }).expect(409);
    // Two sign-ups and a dozen password hashes.
  }, 20_000);

  it('edits the full name and date of birth with the sign-up rules', async () => {
    const { tokens } = await newAccount();
    const patch = (body: Record<string, unknown>) =>
      http.patch('/auth/me').set('Authorization', `Bearer ${tokens.accessToken}`).send(body);

    for (const bad of [
      { fullName: '  ' },
      { fullName: 'x'.repeat(101) },
      { dateOfBirth: '2999-01-01' },
      { dateOfBirth: '2001-02-29' },
      { email: 'x@example.com' },
    ]) {
      await patch(bad).expect(400);
    }
    const { body } = await patch({ fullName: '  Trần Thị B ', dateOfBirth: '1995-06-15' }).expect(200);
    expect(body).toMatchObject({ fullName: 'Trần Thị B', dateOfBirth: '1995-06-15', timezone: 'Asia/Ho_Chi_Minh' });
    expect((await patch({}).expect(200)).body).toMatchObject({ fullName: 'Trần Thị B' });
  }, 15_000);

  describe('RedisRefreshTokenStore contract', () => {
    const cases = authenticationStoreContract(
      () => ({ refreshTokens: new RedisRefreshTokenStore(app.get<Redis>(REDIS), new AuthenticationStorage()) }),
      { contracts: ['refreshTokens'], concurrent: true },
    );
    it.each(cases.map((c) => [c.name, c]))('%s', (_, c) => c.run());
  });
});
