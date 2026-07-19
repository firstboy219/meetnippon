import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PolicyResolverService } from './policy-resolver.service';
import { UpsertPolicyDto } from './dto/upsert-policy.dto';

@Injectable()
export class PolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly resolver: PolicyResolverService,
  ) {}

  list() {
    return this.prisma.scoped.bookingPolicy.findMany({
      orderBy: [{ scope: 'asc' }],
    });
  }

  async upsert(dto: UpsertPolicyDto) {
    const category = dto.scope === 'CATEGORY' ? dto.category : null;
    const resourceId = dto.scope === 'ROOM' ? dto.resourceId : null;

    if (dto.scope === 'CATEGORY' && !category) {
      throw new BadRequestException('category is required for CATEGORY scope.');
    }
    if (dto.scope === 'ROOM' && !resourceId) {
      throw new BadRequestException('resourceId is required for ROOM scope.');
    }
    if (resourceId) {
      const res = await this.prisma.scoped.resource.findUnique({
        where: { id: resourceId },
      });
      if (!res) throw new NotFoundException('Resource not found.');
    }

    // Unique key is (tenantId, scope, category, resourceId). The tenant-scoping
    // extension stamps tenantId on create and scopes the where on update.
    const existing = await this.prisma.scoped.bookingPolicy.findFirst({
      where: { scope: dto.scope, category, resourceId },
    });

    const saved = existing
      ? await this.prisma.scoped.bookingPolicy.update({
          where: { id: existing.id },
          data: { rules: dto.rules as any },
        })
      : await this.prisma.scoped.bookingPolicy.create({
          data: { scope: dto.scope, category, resourceId, rules: dto.rules } as any,
        });

    await this.audit.log({
      action: existing ? 'policy.update' : 'policy.create',
      entity: 'BookingPolicy',
      entityId: saved.id,
      metadata: { scope: dto.scope, category, resourceId },
    });
    return saved;
  }

  async remove(id: string) {
    const existing = await this.prisma.scoped.bookingPolicy.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Policy not found.');
    await this.prisma.scoped.bookingPolicy.delete({ where: { id } });
    await this.audit.log({
      action: 'policy.delete',
      entity: 'BookingPolicy',
      entityId: id,
    });
    return { deleted: true };
  }

  /** Effective, merged rules for a resource (admin preview / debugging). */
  async effectiveForResource(resourceId: string) {
    const res = await this.prisma.scoped.resource.findUnique({
      where: { id: resourceId },
    });
    if (!res) throw new NotFoundException('Resource not found.');
    return this.resolver.resolveForResource({ id: res.id, category: res.category });
  }
}
