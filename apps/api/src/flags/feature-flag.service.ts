import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { runUnscoped } from '../tenant/tenant-context';
import { encryptSecret } from '../common/secret-box';

export interface FlagView {
  key: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

/**
 * Config keys the admin console submits in the clear but that must never be
 * stored or returned in the clear. Each is encrypted into `<key>Enc`.
 */
const SECRET_FIELDS = ['clientSecret'] as const;
const encName = (f: string) => `${f}Enc`;

/**
 * Per-tenant feature flags (TenantFeatureFlag). Gates Phase 5/6 integrations
 * (SSO, calendar sync, chat, …). `config` carries provider settings such as
 * `{ mode: 'mock' | 'live', clientId, authority, autoProvision }`.
 */
@Injectable()
export class FeatureFlagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Strip stored secrets before a config leaves the API.
   *
   * The admin console renders whatever it receives, so an encrypted secret sent
   * back would sit in the browser (and in any HAR/devtools capture) for no
   * reason. It only needs to know whether one is set.
   */
  private redact(config: Record<string, any> | null | undefined): Record<string, unknown> {
    const out: Record<string, any> = { ...(config ?? {}) };
    for (const f of SECRET_FIELDS) {
      const stored = out[encName(f)];
      delete out[encName(f)];
      delete out[f]; // never echo a plaintext value either
      out[`has${f[0].toUpperCase()}${f.slice(1)}`] = Boolean(stored);
    }
    return out;
  }

  async list(): Promise<FlagView[]> {
    const rows = await this.prisma.scoped.tenantFeatureFlag.findMany({ orderBy: { key: 'asc' } });
    return rows.map((f) => ({
      key: f.key,
      enabled: f.enabled,
      config: this.redact(f.config as Record<string, any>),
    }));
  }

  async get(key: string): Promise<FlagView | null> {
    const f = await this.prisma.scoped.tenantFeatureFlag.findFirst({ where: { key } });
    if (!f) return null;
    return { key: f.key, enabled: f.enabled, config: this.redact(f.config as Record<string, any>) };
  }

  /** Cheap enabled-check for a given tenant (used off the request path too). */
  async isEnabled(tenantId: string, key: string): Promise<boolean> {
    return runUnscoped(async () => {
      const f = await this.prisma.tenantFeatureFlag.findUnique({
        where: { tenantId_key: { tenantId, key } },
      });
      return !!f?.enabled;
    });
  }

  async configFor(tenantId: string, key: string): Promise<Record<string, any>> {
    return runUnscoped(async () => {
      const f = await this.prisma.tenantFeatureFlag.findUnique({
        where: { tenantId_key: { tenantId, key } },
      });
      return (f?.enabled ? (f.config as Record<string, any>) : {}) ?? {};
    });
  }

  async upsert(key: string, enabled: boolean, config: Record<string, unknown>) {
    const existing = await this.prisma.scoped.tenantFeatureFlag.findFirst({ where: { key } });

    // Encrypt any secret the admin just typed; when the field comes back empty
    // (the console never receives the stored value, so it submits blank on an
    // unrelated edit) keep what is already saved rather than wiping it.
    const prev = (existing?.config as Record<string, any>) ?? {};
    const next: Record<string, any> = { ...config };
    for (const f of SECRET_FIELDS) {
      const typed = typeof next[f] === 'string' ? (next[f] as string).trim() : '';
      delete next[f];
      delete next[`has${f[0].toUpperCase()}${f.slice(1)}`]; // view-only marker
      if (typed) next[encName(f)] = encryptSecret(typed);
      else if (prev[encName(f)]) next[encName(f)] = prev[encName(f)];
    }
    config = next;

    const saved = existing
      ? await this.prisma.scoped.tenantFeatureFlag.update({
          where: { id: existing.id },
          data: { enabled, config: config as any },
        })
      : await this.prisma.scoped.tenantFeatureFlag.create({
          data: { key, enabled, config: config as any } as any,
        });
    await this.audit.log({ action: 'feature_flag.update', entity: 'TenantFeatureFlag', entityId: saved.id, metadata: { key, enabled } });
    return saved;
  }
}
