import { Inject, Injectable } from '@nestjs/common';
import { AuthenticationStorage, type RefreshTokenRecord, type RefreshTokenStore } from '@nestjs/authentication';
import type { Redis } from 'ioredis';
import { REDIS } from '../../redis/redis.module.js';
import { REFRESH_FAMILY_TTL_MS } from './auth.constants.js';

// `{id}` is a hash tag: a token and its `used` flag live on one cluster slot, so the Lua script may touch both.
const tokenKey = (id: string) => `auth:rt:{${id}}`;
const usedKey = (id: string) => `auth:rt:{${id}}:used`;
const familyRevokedKey = (familyId: string) => `auth:rt-family-revoked:${familyId}`;
const userFamiliesKey = (userId: string) => `auth:rt-user-families:${userId}`;

// One atomic compare-and-set: of concurrent calls, exactly one gets 1.
const MARK_USED = `
local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then return 0 end
if redis.call('SET', KEYS[2], ARGV[1], 'NX', 'PX', ttl) then return 1 end
return 0`;

type StoredRecord = Omit<RefreshTokenRecord, 'createdAt' | 'expiresAt' | 'familyExpiresAt' | 'usedAt'> & {
  createdAt: number;
  expiresAt: number;
  familyExpiresAt: number;
};

/** Refresh tokens (stored as SHA-256 ids by TokenService) and their family revocations, in Redis. */
@Injectable()
export class RedisRefreshTokenStore implements RefreshTokenStore {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    storage: AuthenticationStorage,
  ) {
    storage.registerSource({ refreshTokens: this });
  }

  async getRefreshToken(id: string): Promise<RefreshTokenRecord | undefined> {
    const [raw, usedAt] = await this.redis.mget(tokenKey(id), usedKey(id));
    if (!raw) return undefined;
    const { createdAt, expiresAt, familyExpiresAt, ...rest } = JSON.parse(raw) as StoredRecord;
    const record: RefreshTokenRecord = {
      ...rest,
      createdAt: new Date(createdAt),
      expiresAt: new Date(expiresAt),
      familyExpiresAt: new Date(familyExpiresAt),
    };
    if (usedAt) record.usedAt = new Date(Number(usedAt));
    return record;
  }

  async saveRefreshToken(record: RefreshTokenRecord): Promise<void> {
    const stored: StoredRecord = {
      id: record.id,
      familyId: record.familyId,
      userId: record.userId,
      createdAt: record.createdAt.getTime(),
      expiresAt: record.expiresAt.getTime(),
      familyExpiresAt: record.familyExpiresAt.getTime(),
      ...(record.claims && { claims: record.claims }),
    };
    // Kept (used or not) until the family ends, so a reused token is still recognised; Redis then drops it.
    const keepFor = Math.max(record.familyExpiresAt.getTime() - Date.now(), 1000);
    const tx = this.redis.multi().set(tokenKey(record.id), JSON.stringify(stored), 'PX', keepFor);
    if (record.usedAt) tx.set(usedKey(record.id), record.usedAt.getTime(), 'PX', keepFor);
    await tx
      .sadd(userFamiliesKey(record.userId), record.familyId)
      // No family outlives REFRESH_FAMILY_TTL from its start, so this outlives every family listed.
      .pexpire(userFamiliesKey(record.userId), REFRESH_FAMILY_TTL_MS)
      .exec();
  }

  async markRefreshTokenUsed(id: string, at: Date): Promise<boolean> {
    return (await this.redis.eval(MARK_USED, 2, tokenKey(id), usedKey(id), at.getTime())) === 1;
  }

  async revokeRefreshTokenFamily(familyId: string): Promise<void> {
    // Covers tokens of the family saved later, for as long as any family can live.
    await this.redis.set(familyRevokedKey(familyId), '1', 'PX', REFRESH_FAMILY_TTL_MS);
  }

  async isRefreshTokenFamilyRevoked(familyId: string): Promise<boolean> {
    return (await this.redis.exists(familyRevokedKey(familyId))) === 1;
  }

  async revokeUserRefreshTokens(userId: string): Promise<void> {
    const families = await this.redis.smembers(userFamiliesKey(userId));
    if (families.length === 0) return;
    const pipeline = this.redis.pipeline();
    for (const familyId of families) pipeline.set(familyRevokedKey(familyId), '1', 'PX', REFRESH_FAMILY_TTL_MS);
    await pipeline.exec();
  }
}
