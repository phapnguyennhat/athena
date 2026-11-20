import { apiFetch, authFetch } from '@/lib/api';

// Mirrors AuthController in packages/api/src/modules/auth/auth.controller.ts.
export const AUTH_ENDPOINTS = {
  signUp: '/auth/sign-up',
  signIn: '/auth/sign-in',
  verifyEmail: '/auth/verify-email',
  resendVerification: '/auth/resend-verification',
  refresh: '/auth/refresh',
  signOut: '/auth/sign-out',
  me: '/auth/me',
} as const;

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type SignUpBody = {
  email: string;
  password: string;
  fullName: string;
  dateOfBirth: string;
  timezone: string;
};

export type SignInBody = Pick<SignUpBody, 'email' | 'password'>;
export type ResendVerificationBody = Pick<SignUpBody, 'email'>;
export type VerifyEmailBody = ResendVerificationBody & { code: string };
export type RefreshTokenBody = Pick<TokenPair, 'refreshToken'>;

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  dateOfBirth: string;
  timezone: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function signUp(body: SignUpBody) {
  return apiFetch<void>(AUTH_ENDPOINTS.signUp, { method: 'POST', json: body });
}

export function signIn(body: SignInBody) {
  return apiFetch<TokenPair>(AUTH_ENDPOINTS.signIn, { method: 'POST', json: body });
}

export function verifyEmail(body: VerifyEmailBody) {
  return apiFetch<void>(AUTH_ENDPOINTS.verifyEmail, { method: 'POST', json: body });
}

export function resendVerification(body: ResendVerificationBody) {
  return apiFetch<void>(AUTH_ENDPOINTS.resendVerification, { method: 'POST', json: body });
}

export function refreshSession(body: RefreshTokenBody) {
  return apiFetch<TokenPair>(AUTH_ENDPOINTS.refresh, { method: 'POST', json: body });
}

export function signOut(body: RefreshTokenBody) {
  return authFetch<void>(AUTH_ENDPOINTS.signOut, { method: 'POST', json: body });
}

export function getMe() {
  return authFetch<AuthUser>(AUTH_ENDPOINTS.me);
}
