import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticationModule } from '@nestjs/authentication';
import { ThrottlerModule, minutes } from '@nestjs/throttler';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { UsersModule } from '../users/users.module.js';
import { AccessTokenDenylist } from './access-token-denylist.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import {
  ACCESS_TOKEN_TTL,
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_ISSUER,
  JWT_TYPE,
  REFRESH_FAMILY_TTL,
  REFRESH_TOKEN_TTL,
} from './auth.constants.js';
import { EmailVerificationService } from './email-verification.service.js';
import { JwtAuth } from './jwt.auth.js';
import { RedisRefreshTokenStore } from './redis-refresh-token.store.js';

@Module({
  imports: [
    UsersModule,
    // Registers a global guard: every route needs a valid bearer token unless marked @Public().
    AuthenticationModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        accessToken: {
          key: config.get('JWT_SECRET', { infer: true }),
          alg: JWT_ALGORITHM,
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          type: JWT_TYPE,
          ttl: ACCESS_TOKEN_TTL,
        },
        refreshToken: { ttl: REFRESH_TOKEN_TTL, absoluteTtl: REFRESH_FAMILY_TTL },
      }),
    }),
    // Brute-force limit for the public auth routes, per client IP.
    // shortcut: in-memory counters, per instance; move to Redis storage when running more than one instance.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: minutes(1), limit: 10 }] }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuth, RedisRefreshTokenStore, AccessTokenDenylist, EmailVerificationService],
})
export class AuthModule {}
