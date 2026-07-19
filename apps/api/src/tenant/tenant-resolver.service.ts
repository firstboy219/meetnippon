import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { runUnscoped } from './tenant-context';

export interface ResolvedTenant {
  tenantId: string;
  tenantName: string;
  isActive: boolean;
}

/**
 * Resolves the active tenant for an incoming request from its Host header.
 *
 * Two access modes coexist (BRD 6.4):
 *  - SUBDOMAIN:  `<sub>.meetnippon.cosger.online` -> TenantBranding.subdomain,
 *                honoring SubdomainRedirect (old -> new).
 *  - Custom domain: an exact, VERIFIED TenantDomain match.
 *  - SHARED_URL: the bare platform host (or localhost) -> no tenant; callers
 *                must supply an explicit tenant slug (login) instead.
 *
 * All lookups run UNSCOPED — there is no tenant in context yet.
 */
@Injectable()
export class TenantResolverService {
  private readonly logger = new Logger(TenantResolverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private baseDomain(): string {
    return (this.config.get<string>('PLATFORM_BASE_DOMAIN') ?? '').toLowerCase();
  }

  /** Strip port and lowercase. */
  private normalizeHost(host?: string): string {
    return (host ?? '').split(':')[0].trim().toLowerCase();
  }

  /** Returns the sub-label if host is `<sub>.<baseDomain>`, else null. */
  extractSubdomain(host?: string): string | null {
    const h = this.normalizeHost(host);
    const base = this.baseDomain();
    if (!h || !base) return null;
    if (h === base || h === `www.${base}`) return null;
    if (h.endsWith(`.${base}`)) {
      const sub = h.slice(0, h.length - base.length - 1);
      return sub.includes('.') ? null : sub; // no nested subdomains
    }
    return null;
  }

  async resolveFromHost(host?: string): Promise<ResolvedTenant | null> {
    const h = this.normalizeHost(host);
    if (!h || h === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return null;

    return runUnscoped(async () => {
      // 1) custom verified domain
      const domain = await this.prisma.tenantDomain.findFirst({
        where: { domain: h, status: 'VERIFIED' },
        select: { tenant: { select: { id: true, name: true, isActive: true } } },
      });
      if (domain?.tenant) {
        return {
          tenantId: domain.tenant.id,
          tenantName: domain.tenant.name,
          isActive: domain.tenant.isActive,
        };
      }

      // 2) platform subdomain (with redirect support)
      let sub = this.extractSubdomain(h);
      if (!sub) return null;

      const redirect = await this.prisma.subdomainRedirect.findUnique({
        where: { oldSubdomain: sub },
        select: { newSubdomain: true },
      });
      if (redirect) sub = redirect.newSubdomain;

      const branding = await this.prisma.tenantBranding.findUnique({
        where: { subdomain: sub },
        select: { tenant: { select: { id: true, name: true, isActive: true } } },
      });
      if (branding?.tenant) {
        return {
          tenantId: branding.tenant.id,
          tenantName: branding.tenant.name,
          isActive: branding.tenant.isActive,
        };
      }
      return null;
    });
  }

  /** Resolve a tenant by its internal slug (shared-URL login fallback). */
  async resolveBySlug(slug: string): Promise<ResolvedTenant | null> {
    const s = slug.trim().toLowerCase();
    if (!s) return null;
    return runUnscoped(async () => {
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug: s },
        select: { id: true, name: true, isActive: true },
      });
      return tenant
        ? { tenantId: tenant.id, tenantName: tenant.name, isActive: tenant.isActive }
        : null;
    });
  }
}
