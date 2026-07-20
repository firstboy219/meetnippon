import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { startOfDayInTz } from '../common/tz.util';
import { tenantTimezone } from '../common/tenant-tz';

/** Read-only tenant analytics for the admin dashboard (BRD Phase 7). */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const since30 = new Date(Date.now() - 30 * 86400000);
    const today = startOfDayInTz(new Date(), await tenantTimezone(this.prisma));

    const [byStatus, byType, last30, topRaw, wfhToday] = await Promise.all([
      this.prisma.scoped.booking.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.scoped.booking.groupBy({ by: ['type'], _count: { _all: true } }),
      this.prisma.scoped.booking.count({ where: { createdAt: { gte: since30 } } }),
      this.prisma.scoped.booking.groupBy({
        by: ['resourceId'],
        where: { resourceId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { resourceId: 'desc' } },
        take: 8,
      }),
      this.prisma.scoped.workLocationLog.groupBy({ by: ['location'], where: { day: today }, _count: { _all: true } }),
    ]);

    // resolve resource names for the top list
    const ids = topRaw.map((r) => r.resourceId).filter(Boolean) as string[];
    const resources = ids.length
      ? await this.prisma.scoped.resource.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, type: true } })
      : [];
    const nameOf = new Map(resources.map((r) => [r.id, r]));

    const count = (rows: any[], key: string, val: string) =>
      rows.find((r) => r[key] === val)?._count?._all ?? 0;

    return {
      bookings: {
        total: byStatus.reduce((s, r) => s + r._count._all, 0),
        last30Days: last30,
        byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
        byType: Object.fromEntries(byType.map((r) => [r.type, r._count._all])),
        approvalRate: (() => {
          const approved = count(byStatus, 'status', 'APPROVED');
          const rejected = count(byStatus, 'status', 'REJECTED');
          const decided = approved + rejected;
          return decided ? Math.round((approved / decided) * 100) : null;
        })(),
      },
      topResources: topRaw.map((r) => ({
        resourceId: r.resourceId,
        name: nameOf.get(r.resourceId as string)?.name ?? 'Unknown',
        type: nameOf.get(r.resourceId as string)?.type ?? null,
        bookings: r._count._all,
      })),
      wfhToday: {
        office: count(wfhToday, 'location', 'OFFICE'),
        wfh: count(wfhToday, 'location', 'WFH'),
        unknown: count(wfhToday, 'location', 'UNKNOWN'),
      },
    };
  }
}
