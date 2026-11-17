// The only algorithm signed and accepted: never read from the token header.
export const JWT_ALGORITHM = 'HS256';
export const JWT_ISSUER = 'athena-api';
export const JWT_AUDIENCE = 'athena-app';
// RFC 9068 `typ`: other JWTs signed with the same key are not access tokens.
export const JWT_TYPE = 'at+jwt';

export const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_TTL = '30d';
export const REFRESH_FAMILY_TTL = '90d';
export const REFRESH_FAMILY_TTL_MS = 90 * 24 * 60 * 60 * 1000;
