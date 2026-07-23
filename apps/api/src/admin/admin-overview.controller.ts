import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { pageParams, toPage } from '../common/pagination';
import { AdminBookingsQueryDto, AuditQueryDto } from './dto/overview-query.dto';

/**
 * Read-only admin overviews: all bookings + the audit trail (tenant-scoped).
 *
 * Both are paged. They used to return a bare `take` slice — 200 bookings, 100
 * audit rows — so anything older was unreachable with no indication that it
 * had been cut off.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard)
@Roles('ADMIN')
export class AdminOverviewController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('bookings')
  async bookings(@Query() q: AdminBookingsQueryDto) {
    const { skip, take, page, pageSize } = pageParams(q);
    const where: Prisma.BookingWhereInput = {
      ...(q.status ? { status: q.status as any } : {}),
      ...(q.q ? { title: { contains: q.q, mode: 'insensitive' as const } } : {}),
      // The no-show report (tester feedback #1): booked, ended, never checked in.
      ...(q.noShow === 'true' ? { noShowAt: { not: null } } : {}),
      ...(q.from || q.to
        ? {
          startTime: {
            ...(q.from ? { gte: new Date(q.from) } : {}),
            ...(q.to ? { lt: new Date(q.to) } : {}),
          },
        }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.scoped.booking.findMany({
        where,
        orderBy: { startTime: 'desc' },
        skip,
        take,
        include: {
          resource: { select: { name: true, type: true } },
          approvalSteps: { select: { decision: true, level: true } },
          principal: { select: { fullName: true, email: true } },
        },
      }),
      this.prisma.scoped.booking.count({ where }),
    ]);
    return toPage(items, total, page, pageSize);
  }

  @Get('audit')
  async audit(@Query() q: AuditQueryDto) {
    const { skip, take, page, pageSize } = pageParams(q);
    const where: Prisma.AuditLogWhereInput = {
      ...(q.action ? { action: { contains: q.action, mode: 'insensitive' as const } } : {}),
      ...(q.entity ? { entity: { contains: q.entity, mode: 'insensitive' as const } } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.from || q.to
        ? {
          createdAt: {
            ...(q.from ? { gte: new Date(q.from) } : {}),
            ...(q.to ? { lt: new Date(q.to) } : {}),
          },
        }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.scoped.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.scoped.auditLog.count({ where }),
    ]);
    return toPage(items, total, page, pageSize);
  }

  @Get('stats')
  async stats() {
    const [rooms, desks, users, pending] = await Promise.all([
      this.prisma.scoped.resource.count({ where: { type: 'ROOM' } }),
      this.prisma.scoped.resource.count({ where: { type: 'DESK' } }),
      this.prisma.scoped.user.count({ where: { isActive: true } }),
      this.prisma.scoped.booking.count({ where: { status: 'PENDING' } }),
    ]);
    return { rooms, desks, users, pendingBookings: pending };
  }
}
