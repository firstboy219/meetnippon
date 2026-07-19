import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { runUnscoped } from '../tenant/tenant-context';

export interface FlagView {
  key: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

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

  list(): Promise<FlagView[]> {
    return this.prisma.scoped.tenantFeatureFlag.findMany({ orderBy: { key: 'asc' } }) as any;
  }

  async get(key: string): Promise<FlagView | null> {
    const f = await this.prisma.scoped.tenantFeatureFlag.findFirst({ where: { key } });
    return f as FlagView | null;
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
