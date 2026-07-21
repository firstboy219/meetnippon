import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { PublicBranding } from '@meetnippon/shared';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantStore, runUnscoped } from './tenant-context';
import { TenantResolverService } from './tenant-resolver.service';

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
   * Branding for the current tenant.
   *
   * Resolved from the Host header first, because the login screen has to theme
   * itself before anyone has signed in. On a shared-URL deployment the host
   * carries no tenant, so a signed-in caller falls back to their own tenant —
   * without this the portal silently kept the default palette no matter what
   * an admin configured.
   */
  @Get('branding')
  async branding(@Req() req: Request): Promise<PublicBranding | { tenant: null }> {
    const host = req.headers['host'];
    let resolved = await this.resolver.resolveFromHost(host);

    if (!resolved || !resolved.isActive) {
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
      } as typeof resolved;
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
}
