import type { TokenPair } from '@nestjs/authentication';

export class TokenPairDto implements TokenPair {
  /** HS256 JWT. Send it as `Authorization: Bearer <accessToken>`. */
  accessToken: string;

  /** Opaque and single use: exchange it at `POST /auth/refresh` for a new pair. */
  refreshToken: string;

  /** Seconds until the access token expires. */
  expiresIn: number;
}
