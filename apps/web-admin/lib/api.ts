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

async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (auth && tokenStore.access) headers['Authorization'] = `Bearer ${tokenStore.access}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (body && (body.message || body.error)) || `Request failed (${res.status})`;
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : msg);
  }
  return body as T;
}

export const api = {
  get: <T>(p: string) => request<T>(p, { method: 'GET' }),
  post: <T>(p: string, d?: unknown, auth = true) => request<T>(p, { method: 'POST', body: JSON.stringify(d ?? {}) }, auth),
  put: <T>(p: string, d?: unknown) => request<T>(p, { method: 'PUT', body: JSON.stringify(d ?? {}) }),
  del: <T>(p: string) => request<T>(p, { method: 'DELETE' }),
};
