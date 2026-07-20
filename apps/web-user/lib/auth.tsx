'use client';
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, tokenStore } from './api';
import { setTenantTz } from './format';
import type { AuthUser, Branding } from './types';

interface AuthCtx {
  user: AuthUser | null;
  branding: Branding | null;
  ready: boolean;
  login: (email: string, password: string, tenantSlug?: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>({
  user: null, branding: null, ready: false,
  login: async () => {}, logout: () => {},
});

function applyTheme(b: Branding | null) {
  if (!b) return;
  const root = document.documentElement;
  if (b.primaryColor) root.style.setProperty('--teal', b.primaryColor);
  if (b.accentColor) root.style.setProperty('--coral', b.accentColor);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const b = await api.publicGet<Branding | { tenant: null }>('/tenant/branding');
        if (b && 'tenantId' in b) { setTenantTz(b.timezone); setBranding(b); applyTheme(b); }
      } catch { /* branding is best-effort */ }
      if (tokenStore.access) {
        try {
          const me = await api.get<AuthUser>('/auth/me');
          // Authoritative: branding resolves no tenant on shared-URL hosts.
          setTenantTz(me.timezone);
          setUser(me);
        } catch { tokenStore.clear(); }
      }
      setReady(true);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string, tenantSlug?: string) => {
    const res = await api.post<{ accessToken: string; refreshToken: string; user: AuthUser }>(
      '/auth/login', { email, password, ...(tenantSlug ? { tenantSlug } : {}) }, false,
    );
    tokenStore.set(res.accessToken, res.refreshToken);
    // /auth/me carries the tenant clock; without it the session would render
    // in UTC until the next full page load.
    try {
      const me = await api.get<AuthUser>('/auth/me');
      setTenantTz(me.timezone);
      setUser(me);
    } catch {
      setUser(res.user);
    }
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    window.location.href = '/login';
  }, []);

  return (
    <Ctx.Provider value={{ user, branding, ready, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
