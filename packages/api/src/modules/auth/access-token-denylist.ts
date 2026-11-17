import { Inject, Injectable } from '@nestjs/common';
import type { JwtClaims } from '@nestjs/authentication';
import type { Redis } from 'ioredis';
import { REDIS } from '../../redis/redis.module.js';

const revokedKey = (jti: string) => `auth:at-revoked:${jti}`;

/** Revoked access tokens by `jti`, kept in Redis only until the token would have expired anyway. */
@Injectable()
export class AccessTokenDenylist {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async revoke({ jti, exp }: JwtClaims): Promise<void> {
    if (!jti || !exp) return;
    const ttl = exp * 1000 - Date.now();
    if (ttl > 0) await this.redis.set(revokedKey(jti), '1', 'PX', ttl);
  }

  async isRevoked(jti: string): Promise<boolean> {
    return (await this.redis.exists(revokedKey(jti))) === 1;
  }
}
