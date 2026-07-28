const BASE = process.env.NEXT_PUBLIC_API_URL || '/api';
const ACCESS_KEY = 'mn_admin_access';
const REFRESH_KEY = 'mn_admin_refresh';

export const tokenStore = {
  get access() { return typeof window === 'undefined' ? null : localStorage.getItem(ACCESS_KEY); },
  get refresh() { return typeof window === 'undefined' ? null : localStorage.getItem(REFRESH_KEY); },
  set(a: string, r: string) { localStorage.setItem(ACCESS_KEY, a); localStorage.setItem(REFRESH_KEY, r); },
  clear() { localStorage.removeItem(ACCESS_KEY); localStorage.removeItem(REFRESH_KEY); },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/**
 * Renew the access token, at most once at a time.
 *
 * Without this the console signed admins out as soon as the short-lived access
 * token expired, even though a valid refresh token was sitting unused. The
 * in-flight promise is shared so parallel 401s trigger one renewal, not many.
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
  if (auth && tokenStore.access) headers['Authorization'] = `Bearer ${tokenStore.access}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  // An expired access token is recoverable: renew once and replay.
  if (res.status === 401 && auth && retry && tokenStore.refresh) {
    if (await renewAccess()) return request<T>(path, init, auth, false);
  }

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (body && (body.message || body.error)) || `Request failed (${res.status})`;
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : msg);
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
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : msg);
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
