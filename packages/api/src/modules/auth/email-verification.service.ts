import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { MailService } from '../../mail/mail.service.js';
import { REDIS } from '../../redis/redis.module.js';
import type { User } from '../users/user.entity.js';

const CODE_TTL_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

const codeKey = (userId: string) => `auth:email-otp:${userId}`;
const cooldownKey = (userId: string) => `auth:email-otp-cooldown:${userId}`;

/** 6-digit email codes in Redis: one live code per user, 10 minutes, 5 guesses. */
@Injectable()
export class EmailVerificationService {
  private readonly secret: string;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly mail: MailService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.secret = config.get('JWT_SECRET', { infer: true });
  }

  /** Emails a new code, replacing the previous one. Does nothing within the resend cooldown. */
  async sendCode(user: Pick<User, 'id' | 'email' | 'fullName'>): Promise<void> {
    const allowed = await this.redis.set(cooldownKey(user.id), '1', 'EX', RESEND_COOLDOWN_SECONDS, 'NX');
    if (!allowed) return;

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.redis
      .multi()
      .del(codeKey(user.id))
      .hset(codeKey(user.id), { hash: this.hash(user.id, code), attempts: 0 })
      .expire(codeKey(user.id), CODE_TTL_SECONDS)
      .exec();

    try {
      await this.mail.send({
        to: user.email,
        subject: `${code} là mã xác minh Athena của bạn`,
        template: 'verify-email',
        context: { fullName: user.fullName, code, expiresInMinutes: CODE_TTL_SECONDS / 60 },
        text: `Xin chào ${user.fullName},\n\nMã xác minh Athena của bạn là ${code}. Mã có hiệu lực trong ${CODE_TTL_SECONDS / 60} phút. Tuyệt đối không chia sẻ mã này với bất kỳ ai.\n\nNếu bạn không đăng ký tài khoản Athena, hãy bỏ qua email này.`,
      });
    } catch (error) {
      // Not delivered: let the user ask again right away.
      await this.redis.del(cooldownKey(user.id));
      throw error;
    }
  }

  /** `true` once for the right code; the code is then spent. Wrong guesses past the limit kill it. */
  async verifyCode(userId: string, code: string): Promise<boolean> {
    const key = codeKey(userId);
    const hash = await this.redis.hget(key, 'hash');
    if (!hash) return false;
    // Counted before comparing, atomically, so parallel guesses can't exceed the limit.
    if ((await this.redis.hincrby(key, 'attempts', 1)) > MAX_ATTEMPTS) {
      await this.redis.del(key);
      return false;
    }
    if (!timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(this.hash(userId, code), 'hex'))) return false;
    // Only one of two parallel correct guesses gets to spend it.
    return (await this.redis.del(key)) === 1;
  }

  // Keyed hash: a Redis dump doesn't reveal live codes (a plain hash of 6 digits is trivial to reverse).
  private hash(userId: string, code: string): string {
    return createHmac('sha256', this.secret).update(`email-otp:${userId}:${code}`).digest('hex');
  }
}
