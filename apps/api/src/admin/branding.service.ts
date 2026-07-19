import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { getTenantStore } from '../tenant/tenant-context';
import { validateSubdomain } from '../common/domain.util';
import { UpdateBrandingDto } from './dto/branding.dto';

@Injectable()
export class BrandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  get() {
    return this.prisma.scoped.tenantBranding.findFirst({});
  }

  async update(dto: UpdateBrandingDto) {
    const tenantId = getTenantStore()?.tenantId as string;

    if (dto.subdomain !== undefined) {
      const check = validateSubdomain(dto.subdomain);
      if (!check.ok) throw new BadRequestException(check.reason);
      // global uniqueness (unscoped) — subdomain must be unique across all tenants
      const taken = await this.prisma.tenantBranding.findFirst({
        where: { subdomain: dto.subdomain.toLowerCase(), NOT: { tenantId } },
      });
      if (taken) throw new BadRequestException('This subdomain is already in use.');
    }

    const existing = await this.prisma.scoped.tenantBranding.findFirst({});
    const data = {
      ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
      ...(dto.primaryColor !== undefined ? { primaryColor: dto.primaryColor } : {}),
      ...(dto.accentColor !== undefined ? { accentColor: dto.accentColor } : {}),
      ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
      ...(dto.loginBgUrl !== undefined ? { loginBgUrl: dto.loginBgUrl } : {}),
      ...(dto.accessMode !== undefined ? { accessMode: dto.accessMode } : {}),
      ...(dto.subdomain !== undefined ? { subdomain: dto.subdomain.toLowerCase() } : {}),
    };

    const saved = existing
      ? await this.prisma.scoped.tenantBranding.update({ where: { id: existing.id }, data })
      : await this.prisma.scoped.tenantBranding.create({ data: data as any });

    await this.audit.log({ action: 'branding.update', entity: 'TenantBranding', entityId: saved.id });
    return saved;
  }
}
