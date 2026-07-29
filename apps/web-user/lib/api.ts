const BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

const ACCESS_KEY = 'mn_access';
const REFRESH_KEY = 'mn_refresh';

export const tokenStore = {
  get access() {
    return typeof window === 'undefined' ? null : localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return typeof window === 'undefined' ? null : localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * The most recent request failure, with the technical detail a toast's
 * message string alone doesn't carry (endpoint, method, HTTP status, stack).
 *
 * Deliberately not threaded through every one of this app's `catch (e) {
 * push(e?.message, 'error') }` call sites — that would mean touching dozens
 * of files for one feature. Instead the toast layer reads this snapshot at
 * the moment it shows an error, which lines up in practice: a catch block
 * runs synchronously right after the throw, so nothing else has had a
 * chance to overwrite it yet. `at` lets a stale read (e.g. a client-side
 * validation message with no request behind it) be told apart from a fresh
 * one instead of attaching an unrelated old error's detail to it.
 */
export interface LastApiError {
  status: number; message: string; endpoint: string; method: string; stack?: string; at: number;
}
let lastError: LastApiError | null = null;
export function getLastApiError(): LastApiError | null {
  return lastError;
}

/**
 * Renew the access token, at most once at a time.
 *
 * Without this the portal signed people out the moment the short-lived access
 * token expired, even though a valid refresh token was sitting unused in
 * storage. The in-flight promise is shared so a burst of parallel 401s (a
 * dashboard fires several requests at once) performs one renewal, not five.
 */
let renewal: Promise<boolean> | null = null;

function renewAccess(): Promise<boolean> {
  if (renewal) return renewal;
  const refreshToken = tokenStore.refresh;
  if (!refreshToken) return Promise.resolve(false);

  renewal = fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (res) => {
      if (!res.ok) return false;
      const body = await res.json();
      if (!body?.accessToken) return false;
      // The server rotates both tokens, so the refresh window slides forward
      // while the app is in use rather than expiring at a fixed wall-clock time.
      tokenStore.set(body.accessToken, body.refreshToken ?? refreshToken);
      return true;
    })
    .catch(() => false)
    .finally(() => { renewal = null; });

  return renewal;
}

async function request<T>(path: string, init: RequestInit = {}, auth = true, retry = true): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (auth && tokenStore.access) {
    headers['Authorization'] = `Bearer ${tokenStore.access}`;
  }
  const method = init.method || 'GET';
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch (networkErr: any) {
    const err = new ApiError(0, networkErr?.message || 'Network error — check your connection.');
    lastError = { status: 0, message: err.message, endpoint: path, method, stack: err.stack, at: Date.now() };
    throw err;
  }

  // An expired access token is recoverable: renew once and replay. `retry`
  // guards against a loop when the refresh token is dead too.
  if (res.status === 401 && auth && retry && tokenStore.refresh) {
    if (await renewAccess()) return request<T>(path, init, auth, false);
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
 * Multipart POST. Content-Type is deliberately omitted so the browser sets it
 * with the multipart boundary; forcing application/json makes the body
 * unparseable on the server.
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
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, data?: unknown, auth = true) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data ?? {}) }, auth),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data ?? {}) }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(data ?? {}) }),
  publicGet: <T>(path: string) => request<T>(path, { method: 'GET' }, false),
};
