import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  UpsertOfficeLocationDto,
  UpsertBuildingDto,
  UpsertFloorDto,
  UpsertFloorPlanDto,
  FloorPlanPinDto,
} from './dto/location.dto';

/** Admin CRUD for the location hierarchy (BRD 7.2): Office → Building → Floor. */
@Injectable()
export class LocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---- Office locations ----
  listOffices() {
    return this.prisma.scoped.officeLocation.findMany({
      orderBy: { name: 'asc' },
      include: { buildings: { select: { id: true, name: true } } },
    });
  }

  async createOffice(dto: UpsertOfficeLocationDto) {
    const office = await this.prisma.scoped.officeLocation.create({ data: { ...dto } as any });
    await this.audit.log({ action: 'office.create', entity: 'OfficeLocation', entityId: office.id });
    return office;
  }

  async updateOffice(id: string, dto: UpsertOfficeLocationDto) {
    await this.mustExist('officeLocation', id);
    const office = await this.prisma.scoped.officeLocation.update({ where: { id }, data: { ...dto } });
    await this.audit.log({ action: 'office.update', entity: 'OfficeLocation', entityId: id });
    return office;
  }

  async removeOffice(id: string) {
    await this.mustExist('officeLocation', id);
    await this.prisma.scoped.officeLocation.delete({ where: { id } });
    await this.audit.log({ action: 'office.delete', entity: 'OfficeLocation', entityId: id });
    return { deleted: true };
  }

  // ---- Buildings ----
  listBuildings() {
    return this.prisma.scoped.building.findMany({
      orderBy: { name: 'asc' },
      include: { floors: { select: { id: true, name: true } } },
    });
  }

  async createBuilding(dto: UpsertBuildingDto) {
    const b = await this.prisma.scoped.building.create({ data: { ...dto } as any });
    await this.audit.log({ action: 'building.create', entity: 'Building', entityId: b.id });
    return b;
  }

  async updateBuilding(id: string, dto: UpsertBuildingDto) {
    await this.mustExist('building', id);
    const b = await this.prisma.scoped.building.update({ where: { id }, data: { ...dto } });
    await this.audit.log({ action: 'building.update', entity: 'Building', entityId: id });
    return b;
  }

  async removeBuilding(id: string) {
    await this.mustExist('building', id);
    await this.prisma.scoped.building.delete({ where: { id } });
    await this.audit.log({ action: 'building.delete', entity: 'Building', entityId: id });
    return { deleted: true };
  }

  // ---- Floors ----
  listFloors() {
    return this.prisma.scoped.floor.findMany({
      orderBy: { name: 'asc' },
      include: {
        building: { select: { id: true, name: true } },
        // Lets the UI show which floors are mapped and how full they are
        // without a request per row.
        floorPlan: { select: { imageUrl: true } },
        _count: { select: { resources: true } },
      },
    });
  }

  async createFloor(dto: UpsertFloorDto) {
    const f = await this.prisma.scoped.floor.create({
      data: { name: dto.name, buildingId: dto.buildingId, siteContacts: (dto.siteContacts ?? []) as any } as any,
    });
    await this.audit.log({ action: 'floor.create', entity: 'Floor', entityId: f.id });
    return f;
  }

  async updateFloor(id: string, dto: UpsertFloorDto) {
    await this.mustExist('floor', id);
    const f = await this.prisma.scoped.floor.update({
      where: { id },
      data: { name: dto.name, buildingId: dto.buildingId, siteContacts: (dto.siteContacts ?? []) as any },
    });
    await this.audit.log({ action: 'floor.update', entity: 'Floor', entityId: id });
    return f;
  }

  async removeFloor(id: string) {
    await this.mustExist('floor', id);
    await this.prisma.scoped.floor.delete({ where: { id } });
    await this.audit.log({ action: 'floor.delete', entity: 'Floor', entityId: id });
    return { deleted: true };
  }

  // ---- Floor plans (BRD 7.2 Denah) ----
  /** The plan for a floor, plus the resources that may be pinned onto it. */
  async getFloorPlan(floorId: string) {
    await this.mustExist('floor', floorId);
    const [plan, resources] = await Promise.all([
      this.prisma.scoped.floorPlan.findUnique({ where: { floorId } }),
      this.prisma.scoped.resource.findMany({
        where: { floorId },
        select: { id: true, name: true, type: true, status: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return {
      floorId,
      imageUrl: plan?.imageUrl ?? null,
      pins: (plan?.pins as unknown as FloorPlanPinDto[]) ?? [],
      resources,
    };
  }

  async saveFloorPlan(floorId: string, dto: UpsertFloorPlanDto) {
    await this.mustExist('floor', floorId);
    const pins = dto.pins ?? [];

    // A pin may only point at a resource that is actually on this floor.
    // Without this a stale or hand-crafted payload could plant another floor's
    // desk — or another tenant's id — onto the plan.
    if (pins.length) {
      const ids = [...new Set(pins.map((p) => p.resourceId))];
      const onFloor = await this.prisma.scoped.resource.findMany({
        where: { id: { in: ids }, floorId },
        select: { id: true },
      });
      const valid = new Set(onFloor.map((r) => r.id));
      const stray = ids.filter((id) => !valid.has(id));
      if (stray.length) {
        throw new BadRequestException(
          `Not on this floor: ${stray.join(', ')}`,
        );
      }
      if (ids.length !== pins.length) {
        throw new BadRequestException('A resource can only be pinned once.');
      }
    }

    const data = {
      ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
      ...(dto.pins !== undefined ? { pins: pins as any } : {}),
    };
    const plan = await this.prisma.scoped.floorPlan.upsert({
      where: { floorId },
      // tenantId is stamped by the scoping extension at run time, so the
      // literal cannot satisfy FloorPlanUncheckedCreateInput on its own.
      create: { floorId, imageUrl: dto.imageUrl ?? null, pins: pins as any } as any,
      update: data,
    });
    await this.audit.log({ action: 'floorplan.update', entity: 'FloorPlan', entityId: plan.id });
    return this.getFloorPlan(floorId);
  }

  private async mustExist(model: 'officeLocation' | 'building' | 'floor', id: string) {
    const row = await (this.prisma.scoped as any)[model].findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`${model} not found.`);
  }
}
