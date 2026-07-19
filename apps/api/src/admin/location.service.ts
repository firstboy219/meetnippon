import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  UpsertOfficeLocationDto,
  UpsertBuildingDto,
  UpsertFloorDto,
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
    return this.prisma.scoped.floor.findMany({ orderBy: { name: 'asc' } });
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

  private async mustExist(model: 'officeLocation' | 'building' | 'floor', id: string) {
    const row = await (this.prisma.scoped as any)[model].findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`${model} not found.`);
  }
}
