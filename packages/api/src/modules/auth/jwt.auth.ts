import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticationRegistry, JwtBearerProvider, type JwtClaims } from '@nestjs/authentication';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { User } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { AccessTokenDenylist } from './access-token-denylist.js';
import { JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER, JWT_TYPE } from './auth.constants.js';

declare module '@nestjs/authentication' {
  interface AuthenticationTypes {
    user: User;
  }
}

/** `Authorization: Bearer <access token>` on every route not marked `@Public()`. */
@Injectable()
export class JwtAuth extends JwtBearerProvider<User> {
  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    private readonly users: UsersService,
    private readonly denylist: AccessTokenDenylist,
    registry: AuthenticationRegistry,
  ) {
    super({
      key: config.get('JWT_SECRET', { infer: true }),
      // Pinned: a token whose header says `none`, HS512, RS256 (key confusion), … is rejected.
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      type: JWT_TYPE,
      required: ['exp', 'iat', 'sub', 'jti'],
    });
    registry.registerProvider(this);
  }

  protected async validate({ sub, jti }: JwtClaims): Promise<User | null> {
    if (!sub || !jti || (await this.denylist.isRevoked(jti))) return null;
    return this.users.findById(sub);
  }
}
