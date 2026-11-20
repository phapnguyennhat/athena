import type { TokenPair } from '@/lib/auth-api';

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080').replace(/\/$/, '');

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
    const pair = await apiFetch<TokenPair>('/auth/refresh', {
      method: 'POST',
      json: { refreshToken: current.refreshToken },
    });
    await source?.save(pair);
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
        // Only a server rejection ends the session; a network blip keeps it.
        if (refreshErr instanceof ApiError) await source?.signOut();
        throw err;
      }
    }
    return send(fresh);
  }
}
