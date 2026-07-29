const BASE = process.env.NEXT_PUBLIC_API_URL || '/api';
const ACCESS_KEY = 'mn_admin_access';
const REFRESH_KEY = 'mn_admin_refresh';

export const tokenStore = {
  get access() { return typeof window === 'undefined' ? null : localStorage.getItem(ACCESS_KEY); },
  set(a: string, r: string) { localStorage.setItem(ACCESS_KEY, a); localStorage.setItem(REFRESH_KEY, r); },
  clear() { localStorage.removeItem(ACCESS_KEY); localStorage.removeItem(REFRESH_KEY); },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/**
 * The most recent request failure, with the technical detail a toast's
 * message string alone doesn't carry (endpoint, method, HTTP status, stack).
 * Not threaded through every `catch (e) { push(e?.message, 'error') }` call
 * site — the toast layer reads this snapshot when it shows an error instead,
 * which lines up in practice since the catch runs synchronously right after
 * the throw. `at` lets a stale read be told apart from a fresh one.
 */
export interface LastApiError {
  status: number; message: string; endpoint: string; method: string; stack?: string; at: number;
}
let lastError: LastApiError | null = null;
export function getLastApiError(): LastApiError | null {
  return lastError;
}

async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (auth && tokenStore.access) headers['Authorization'] = `Bearer ${tokenStore.access}`;
  const method = init.method || 'GET';
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch (networkErr: any) {
    const err = new ApiError(0, networkErr?.message || 'Network error — check your connection.');
    lastError = { status: 0, message: err.message, endpoint: path, method, stack: err.stack, at: Date.now() };
    throw err;
  }
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (body && (body.message || body.error)) || `Request failed (${res.status})`;
    const err = new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : msg);
    lastError = { status: res.status, message: err.message, endpoint: path, method, stack: err.stack, at: Date.now() };
    throw err;
  }
  return body as T;
}

/**
 * Multipart POST. The Content-Type header is deliberately omitted so the
 * browser can set it with the multipart boundary — forcing application/json
 * here would make the body unparseable on the server.
 */
async function upload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const headers: Record<string, string> = {};
  if (tokenStore.access) headers['Authorization'] = `Bearer ${tokenStore.access}`;
  const res = await fetch(`${BASE}${path}`, { method: 'POST', body: form, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (body && (body.message || body.error)) || `Upload failed (${res.status})`;
    const err = new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : msg);
    lastError = { status: res.status, message: err.message, endpoint: path, method: 'POST', stack: err.stack, at: Date.now() };
    throw err;
  }
  return body as T;
}

export const api = {
  upload,
  get: <T>(p: string) => request<T>(p, { method: 'GET' }),
  post: <T>(p: string, d?: unknown, auth = true) => request<T>(p, { method: 'POST', body: JSON.stringify(d ?? {}) }, auth),
  put: <T>(p: string, d?: unknown) => request<T>(p, { method: 'PUT', body: JSON.stringify(d ?? {}) }),
  del: <T>(p: string) => request<T>(p, { method: 'DELETE' }),
};
