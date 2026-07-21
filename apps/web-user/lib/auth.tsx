'use client';
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, tokenStore } from './api';
import { setTenantTz } from './format';
import { applyBrandTheme } from './theme';
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [ready, setReady] = useState(false);

  /**
   * Sent authenticated when we have a token: on a shared-URL host the Host
   * header carries no tenant, so an anonymous request cannot be themed at all.
   */
  const loadBranding = useCallback(async () => {
    try {
      const b = tokenStore.access
        ? await api.get<Branding | { tenant: null }>('/tenant/branding')
        : await api.publicGet<Branding | { tenant: null }>('/tenant/branding');
      if (b && 'tenantId' in b) {
        setTenantTz(b.timezone);
        setBranding(b);
        applyBrandTheme(b);
      }
    } catch { /* branding is best-effort — never block the app on it */ }
  }, []);

  useEffect(() => {
    (async () => {
      await loadBranding();
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
  }, [loadBranding]);

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
    // Now that there is a token, branding can finally be resolved on a
    // shared-URL host — otherwise the workspace stays unthemed until a reload.
    await loadBranding();
  }, [loadBranding]);

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
