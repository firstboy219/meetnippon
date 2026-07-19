import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';

/** Read-only admin overviews: all bookings + the audit trail (tenant-scoped). */
@Controller('admin')
@UseGuards(JwtAuthGuard)
@Roles('ADMIN')
export class AdminOverviewController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('bookings')
  bookings(@Query('status') status?: string) {
    return this.prisma.scoped.booking.findMany({
      where: status ? { status: status as any } : {},
      orderBy: { startTime: 'desc' },
      take: 200,
      include: {
        resource: { select: { name: true, type: true } },
        approvalSteps: { select: { decision: true, level: true } },
      },
    });
  }

  @Get('audit')
  audit() {
    return this.prisma.scoped.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
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
