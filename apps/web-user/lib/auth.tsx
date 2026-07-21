'use client';
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, tokenStore } from './api';
import { setTenantTz } from './format';
import { applyBrandTheme } from './theme';
import type { AuthUser, Branding } from './types';

/** Remembered so a returning user sees their own workspace, already themed. */
const LAST_WORKSPACE = 'mn_workspace';

interface AuthCtx {
  user: AuthUser | null;
  branding: Branding | null;
  ready: boolean;
  login: (email: string, password: string, tenantSlug?: string) => Promise<void>;
  logout: () => void;
  /** Theme the page for a workspace slug typed on the login screen. */
  previewWorkspace: (slug: string) => Promise<boolean>;
}

const Ctx = createContext<AuthCtx>({
  user: null, branding: null, ready: false,
  login: async () => {}, logout: () => {}, previewWorkspace: async () => false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [ready, setReady] = useState(false);

  /**
   * Resolve and apply a workspace's branding.
   *
   * `workspace` is the slug typed on the login screen — on a shared-URL host it
   * is the only thing identifying the tenant before sign-in. Once a token
   * exists the request is sent authenticated instead, so the session's own
   * workspace wins.
   */
  const loadBranding = useCallback(async (workspace?: string) => {
    const path = workspace
      ? `/tenant/branding?workspace=${encodeURIComponent(workspace)}`
      : '/tenant/branding';
    try {
      const b = tokenStore.access && !workspace
        ? await api.get<Branding | { tenant: null }>(path)
        : await api.publicGet<Branding | { tenant: null }>(path);
      if (b && 'tenantId' in b) {
        setTenantTz(b.timezone);
        setBranding(b);
        applyBrandTheme(b);
        return true;
      }
    } catch { /* branding is best-effort — never block the app on it */ }
    return false;
  }, []);

  useEffect(() => {
    (async () => {
      // Signed in: the session's tenant decides. Signed out: fall back to the
      // workspace this browser last used, so the login screen is already in the
      // right colours before anything is typed.
      const remembered = tokenStore.access ? undefined : (localStorage.getItem(LAST_WORKSPACE) ?? undefined);
      await loadBranding(remembered);
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
    if (tenantSlug) localStorage.setItem(LAST_WORKSPACE, tenantSlug.trim().toLowerCase());
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

  const previewWorkspace = useCallback(
    (slug: string) => loadBranding(slug.trim().toLowerCase()),
    [loadBranding],
  );

  return (
    <Ctx.Provider value={{ user, branding, ready, login, logout, previewWorkspace }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
