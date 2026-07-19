import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { getTenantStore } from '../tenant/tenant-context';
import { PlanService } from '../billing/plan.service';
import { CreateResourceDto, UpdateResourceDto } from './dto/resource-admin.dto';

/** Admin CRUD for bookable resources (rooms & desks). Includes inactive ones. */
@Injectable()
export class ResourceAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly plan: PlanService,
  ) {}

  listAll() {
    return this.prisma.scoped.resource.findMany({
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: { floor: { select: { name: true } } },
    });
  }

  async create(dto: CreateResourceDto) {
    await this.plan.assertCanAddResource(getTenantStore()?.tenantId as string);
    const r = await this.prisma.scoped.resource.create({
      data: {
        type: dto.type,
        name: dto.name,
        category: dto.category ?? null,
        capacity: dto.capacity ?? 1,
        facilities: (dto.facilities ?? []) as any,
        zone: dto.zone ?? null,
        floorId: dto.floorId ?? null,
      } as any,
    });
    await this.audit.log({ action: 'resource.create', entity: 'Resource', entityId: r.id, metadata: { type: dto.type } });
    return r;
  }

  async update(id: string, dto: UpdateResourceDto) {
    const existing = await this.prisma.scoped.resource.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Resource not found.');
    const r = await this.prisma.scoped.resource.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.facilities !== undefined ? { facilities: dto.facilities as any } : {}),
        ...(dto.zone !== undefined ? { zone: dto.zone } : {}),
        ...(dto.floorId !== undefined ? { floorId: dto.floorId } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    await this.audit.log({ action: 'resource.update', entity: 'Resource', entityId: id });
    return r;
  }

  async remove(id: string) {
    const existing = await this.prisma.scoped.resource.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Resource not found.');
    await this.prisma.scoped.resource.delete({ where: { id } });
    await this.audit.log({ action: 'resource.delete', entity: 'Resource', entityId: id });
    return { deleted: true };
  }
}
