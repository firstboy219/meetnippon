import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { PublicBranding } from '@meetnippon/shared';
import { PrismaService } from '../prisma/prisma.service';
import { runUnscoped } from './tenant-context';
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

  /** Branding for the tenant resolved from the request Host header. */
  @Get('branding')
  async branding(@Req() req: Request): Promise<PublicBranding | { tenant: null }> {
    const host = req.headers['host'];
    const resolved = await this.resolver.resolveFromHost(host);
    if (!resolved || !resolved.isActive) return { tenant: null };

    const branding = await runUnscoped(() =>
      this.prisma.tenantBranding.findUnique({
        where: { tenantId: resolved.tenantId },
      }),
    );

    return {
      tenantId: resolved.tenantId,
      tenantName: resolved.tenantName,
      timezone: resolved.timezone,
      displayName: branding?.displayName ?? null,
      primaryColor: branding?.primaryColor ?? '#0E6E55',
      accentColor: branding?.accentColor ?? '#E4572E',
      logoUrl: branding?.logoUrl ?? null,
      loginBgUrl: branding?.loginBgUrl ?? null,
      accessMode: branding?.accessMode ?? 'SHARED_URL',
    };
  }
}
