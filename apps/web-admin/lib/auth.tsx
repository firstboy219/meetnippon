'use client';
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, tokenStore } from './api';
import { setTenantTz } from './format';
import type { AuthUser } from './types';

interface Ctx {
  user: AuthUser | null;
  ready: boolean;
  login: (email: string, password: string, tenantSlug?: string) => Promise<void>;
  logout: () => void;
}
const C = createContext<Ctx>({ user: null, ready: false, login: async () => {}, logout: () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      if (tokenStore.access) {
        try {
          const me = await api.get<AuthUser>('/auth/me');
          // Times across the console render on the tenant's wall clock.
          setTenantTz(me.timezone);
          setUser(me);
        }
        catch { tokenStore.clear(); }
      }
      setReady(true);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string, tenantSlug?: string) => {
    const res = await api.post<{ accessToken: string; refreshToken: string; user: AuthUser }>(
      '/auth/login', { email, password, ...(tenantSlug ? { tenantSlug } : {}) }, false,
    );
    if (res.user.role !== 'ADMIN') {
      throw new Error('This portal is for administrators only.');
    }
    tokenStore.set(res.accessToken, res.refreshToken);
    try {
      const me = await api.get<AuthUser>('/auth/me');
      setTenantTz(me.timezone);
      setUser(me);
    } catch {
      setUser(res.user);
    }
  }, []);

  const logout = useCallback(() => { tokenStore.clear(); setUser(null); window.location.href = '/login'; }, []);

  return <C.Provider value={{ user, ready, login, logout }}>{children}</C.Provider>;
}
export const useAuth = () => useContext(C);
