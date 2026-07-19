import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { getTenantStore } from '../tenant/tenant-context';
import { classifyLocation, OfficeGeo } from './geo.util';
import { ReportLocationDto } from './dto/report-location.dto';

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * WFH detection (BRD 7.13). Detects OFFICE vs WFH by matching the device point
 * against tenant office geofences, or accepts a manual override. Persists only
 * the category + matched office name for the day — never raw coordinates.
 */
@Injectable()
export class WorkLocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private userId() {
    return getTenantStore()?.userId as string;
  }

  async report(dto: ReportLocationDto) {
    let location: 'OFFICE' | 'WFH' | 'UNKNOWN';
    let officeName: string | null = null;

    if (dto.location) {
      location = dto.location;
    } else if (dto.lat != null && dto.lng != null) {
      const offices = await this.prisma.scoped.officeLocation.findMany({ where: { isActive: true } });
      const geos: OfficeGeo[] = offices.map((o) => ({ name: o.name, lat: o.lat, lng: o.lng, geofenceRadiusM: o.geofenceRadiusM }));
      const c = classifyLocation({ lat: dto.lat, lng: dto.lng }, geos);
      location = c.location;
      officeName = c.officeName;
    } else {
      throw new BadRequestException('Provide coordinates or a manual location.');
    }

    const userId = this.userId();
    const day = startOfUtcDay(new Date());
    const existing = await this.prisma.scoped.workLocationLog.findFirst({ where: { userId, day } });
    const saved = existing
      ? await this.prisma.scoped.workLocationLog.update({ where: { id: existing.id }, data: { location, officeName } })
      : await this.prisma.scoped.workLocationLog.create({ data: { userId, day, location, officeName } as any });

    await this.audit.log({ action: 'work_location.report', entity: 'WorkLocationLog', entityId: saved.id, metadata: { location } });
    return { location: saved.location, officeName: saved.officeName, day: saved.day };
  }

  async today() {
    const userId = this.userId();
    const day = startOfUtcDay(new Date());
    const log = await this.prisma.scoped.workLocationLog.findFirst({ where: { userId, day } });
    return log ?? { location: 'UNKNOWN', officeName: null, day };
  }
}
