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
