import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { runUnscoped } from '../tenant/tenant-context';
import { hashPassword } from '../auth/password.util';
import {
  validateSubdomain, extractEmailDomain, isPublicEmailDomain,
} from '../common/domain.util';
import { RegisterWorkspaceDto } from './dto/register.dto';

/**
 * Self-service onboarding (Phase 10). Creates a brand-new tenant with its first
 * ADMIN. Runs unscoped (no tenant context yet); slug doubles as the subdomain.
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async register(dto: RegisterWorkspaceDto) {
    const slug = dto.slug.trim().toLowerCase();
    const check = validateSubdomain(slug);
    if (!check.ok) throw new BadRequestException(check.reason);

    const email = dto.adminEmail.trim().toLowerCase();
    const domain = extractEmailDomain(email);
    // PUBLIC_EMAIL_DOMAINS may arrive as a comma-string (process.env) or an array.
    const rawList = this.config.get('PUBLIC_EMAIL_DOMAINS') as string | string[] | undefined;
    const publicList = Array.isArray(rawList)
      ? rawList
      : String(rawList ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!domain || isPublicEmailDomain(domain, publicList)) {
      throw new BadRequestException('Please register with your company email (public email domains are not allowed).');
    }

    const created = await runUnscoped(async () => {
      const slugTaken = await this.prisma.tenant.findUnique({ where: { slug } });
      if (slugTaken) throw new BadRequestException('This workspace address is already taken.');
      const subTaken = await this.prisma.tenantBranding.findFirst({ where: { subdomain: slug } });
      if (subTaken) throw new BadRequestException('This workspace address is already taken.');

      const tenant = await this.prisma.tenant.create({
        data: { name: dto.orgName.trim(), slug, isActive: true },
      });
      await this.prisma.tenantBranding.create({
        data: { tenantId: tenant.id, displayName: dto.orgName.trim(), subdomain: slug, accessMode: 'SHARED_URL' },
      });
      const admin = await this.prisma.user.create({
        data: {
          tenantId: tenant.id, email, fullName: dto.adminFullName.trim(),
          role: 'ADMIN', languagePref: 'EN', passwordHash: await hashPassword(dto.password), isActive: true,
        },
      });
      // Sensible starter defaults: a tenant-baseline booking policy.
      await this.prisma.bookingPolicy.create({
        data: { tenantId: tenant.id, scope: 'TENANT', rules: { maxDurationMinutes: 240, maxAdvanceDays: 60 } as any },
      });
      return { tenant, admin };
    });

    await this.audit.log({
      tenantId: created.tenant.id, actorId: created.admin.id,
      action: 'tenant.register', entity: 'Tenant', entityId: created.tenant.id, metadata: { slug },
    });

    const base = this.config.get<string>('PLATFORM_BASE_DOMAIN');
    return {
      tenantSlug: slug,
      adminEmail: email,
      loginUrl: `https://${base}/login`,
      workspace: slug,
    };
  }
}
