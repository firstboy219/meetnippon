import { Controller, Get, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { PublicBranding } from '@meetnippon/shared';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantStore, runUnscoped } from './tenant-context';
import { ResolvedTenant, TenantResolverService } from './tenant-resolver.service';

/** Same shape the registration flow enforces: [a-z0-9-], 3–30 chars. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

/**
 * Public, unauthenticated tenant surface used by the login screen to theme
 * itself before any user has signed in (BRD 7.1 / 6.4).
 */
@Controller('tenant')
export class TenantController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: TenantResolverService,
  ) {}

  /**
   * Branding for a workspace.
   *
   * Resolution order, most specific first:
   *  1. `?workspace=<slug>` — what the login screen types into the workspace
   *     box. On a shared URL this is the only thing that identifies the tenant
   *     before anyone has signed in.
   *  2. the Host header — subdomain deployments.
   *  3. the caller's own tenant, for an already-signed-in session.
   *
   * The slug lookup is intentionally unauthenticated: a login page has to be
   * able to theme itself for a workspace nobody has proven membership of yet.
   * It returns only what a login screen displays — name, colours, logo — and
   * nothing about who belongs to the workspace. Guessing slugs therefore
   * reveals no more than attempting a sign-in already does, and the global
   * throttle applies.
   */
  @Get('branding')
  async branding(
    @Req() req: Request,
    @Query('workspace') workspace?: string,
  ): Promise<PublicBranding | { tenant: null }> {
    let resolved: ResolvedTenant | null = await this.resolveBySlug(workspace);

    if (!resolved) {
      const fromHost = await this.resolver.resolveFromHost(req.headers['host']);
      if (fromHost?.isActive) resolved = fromHost;
    }

    if (!resolved) {
      const tenantId = getTenantStore()?.tenantId;
      if (!tenantId) return { tenant: null };
      const tenant = await runUnscoped(() =>
        this.prisma.tenant.findUnique({ where: { id: tenantId } }),
      );
      if (!tenant?.isActive) return { tenant: null };
      resolved = {
        tenantId: tenant.id,
        tenantName: tenant.name,
        timezone: tenant.timezone,
        isActive: tenant.isActive,
      };
    }

    const branding = await runUnscoped(() =>
      this.prisma.tenantBranding.findUnique({
        where: { tenantId: resolved!.tenantId },
      }),
    );

    return {
      tenantId: resolved!.tenantId,
      tenantName: resolved!.tenantName,
      timezone: resolved!.timezone,
      displayName: branding?.displayName ?? null,
      primaryColor: branding?.primaryColor ?? '#0E6E55',
      accentColor: branding?.accentColor ?? '#E4572E',
      logoUrl: branding?.logoUrl ?? null,
      loginBgUrl: branding?.loginBgUrl ?? null,
      accessMode: branding?.accessMode ?? 'SHARED_URL',
    };
  }

  /**
   * Look a workspace up by the slug typed on the login screen.
   *
   * The slug is validated against the same character set the registration flow
   * enforces before it reaches the database, so a hostile value cannot become
   * a wildcard or an expensive scan.
   */
  private async resolveBySlug(workspace?: string): Promise<ResolvedTenant | null> {
    const slug = workspace?.trim().toLowerCase();
    if (!slug || !SLUG_RE.test(slug)) return null;

    const tenant = await runUnscoped(() =>
      this.prisma.tenant.findUnique({ where: { slug } }),
    );
    if (!tenant?.isActive) return null;
    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      timezone: tenant.timezone,
      isActive: tenant.isActive,
    };
  }
}
