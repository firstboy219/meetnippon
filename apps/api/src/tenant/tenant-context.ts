import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantStore {
  tenantId: string | null;
  userId?: string | null;
  role?: string | null;
  /** when true, the tenant-scoping Prisma extension is bypassed (system/seed/auth-lookup) */
  bypassTenantScope?: boolean;
}

/**
 * Request-scoped tenant context backed by AsyncLocalStorage.
 * The Prisma extension reads this to inject tenantId on every query,
 * guaranteeing cross-tenant isolation (BRD 6.1, roadmap NON-NEGOTIABLE).
 */
export const tenantStorage = new AsyncLocalStorage<TenantStore>();

export function getTenantStore(): TenantStore | undefined {
  return tenantStorage.getStore();
}

export function getTenantId(): string | null {
  return tenantStorage.getStore()?.tenantId ?? null;
}

export function runWithTenant<T>(store: TenantStore, fn: () => T): T {
  return tenantStorage.run(store, fn);
}

/** Run a function with tenant scoping disabled (auth lookups, seeds, cross-tenant admin ops). */
export function runUnscoped<T>(fn: () => T): T {
  const current = tenantStorage.getStore();
  return tenantStorage.run(
    { ...(current ?? { tenantId: null }), bypassTenantScope: true },
    fn,
  );
}
