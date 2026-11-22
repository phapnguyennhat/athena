import type { TokenPair } from '@/lib/auth-api';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080').replace(/\/$/, '');

export type ApiErrorBody = {
  statusCode?: number;
  message?: string | string[];
  error?: string;
  code?: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    const message = Array.isArray(body.message) ? body.message.join('\n') : (body.message ?? `HTTP ${status}`);
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.body = body;
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : null),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const body = text ? (JSON.parse(text) as ApiErrorBody) : {};

  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

type SessionSource = {
  get(): { accessToken: string; refreshToken: string } | null;
  save(pair: TokenPair): Promise<void>;
  signOut(): Promise<void>;
};

let source: SessionSource | null = null;
let refreshing: Promise<string> | null = null;

export function registerSession(next: SessionSource | null) {
  source = next;
}

// Refresh tokens rotate, so concurrent 401s must share one call.
function refreshAccessToken(): Promise<string> {
  refreshing ??= (async () => {
    const current = source?.get();
    if (!current) throw new ApiError(401, { message: 'Not signed in' });
    // Plain apiFetch (not authFetch) so a 401 here cannot recurse.
    let pair: TokenPair;
    try {
      pair = await apiFetch<TokenPair>('/auth/refresh', {
        method: 'POST',
        json: { refreshToken: current.refreshToken },
      });
    } catch (err) {
      // Only a rejected refresh token ends the session; 429/5xx/network keep it.
      if (err instanceof ApiError && err.status === 401 && source?.get()?.refreshToken === current.refreshToken) {
        await source.signOut();
      }
      throw err;
    }
    // Signed out or re-signed-in meanwhile: do not resurrect or overwrite that session.
    if (source?.get()?.refreshToken !== current.refreshToken) {
      throw new ApiError(401, { message: 'Session changed during refresh' });
    }
    await source.save(pair);
    return pair.accessToken;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function currentAccessToken(): Promise<string | null> {
  if (refreshing) await refreshing.catch(() => undefined);
  return source?.get()?.accessToken ?? null;
}

export async function authFetch<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const send = (token: string) =>
    apiFetch<T>(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });

  const token = source?.get()?.accessToken;
  if (!token) throw new ApiError(401, { message: 'Not signed in' });

  try {
    return await send(token);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;
    // Another request may already have refreshed while this one was in flight.
    const latest = source?.get()?.accessToken;
    let fresh: string;
    if (latest && latest !== token) fresh = latest;
    else {
      try {
        fresh = await refreshAccessToken();
      } catch (refreshErr) {
        // Refresh rejected (401): the session is over and the app is already signing out, so surface the
        // original 401, which screens never toast. Network/5xx: surface that, the session is still valid.
        throw refreshErr instanceof ApiError && refreshErr.status === 401 ? err : refreshErr;
      }
    }
    return send(fresh);
  }
}
