import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { runUnscoped } from '../tenant/tenant-context';
import { addLocalDays, localDateKey, startOfDayInTz } from '../common/tz.util';

/**
 * The door sticker's landing page, readable without signing in.
 *
 * A QR code on a meeting-room door has to work for whoever is standing there —
 * a visitor, a contractor, someone whose session expired. So this is public.
 *
 * What it deliberately does NOT return: who booked the room, the meeting title,
 * or anything about the people involved. Those are visible only through the
 * authenticated route, to colleagues in the same workspace. A stranger with a
 * phone learns whether the room is free; they do not learn that Finance is
 * meeting the auditors at 14:00.
 *
 * Access rests on the room id in the sticker, which is a cuid — the same
 * bargain as an unguessable file URL. Nothing sensitive is behind it.
 */
@Controller('public/rooms')
export class PublicRoomController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id/schedule')
  async schedule(@Param('id') id: string, @Query('day') day?: string) {
    // Unscoped by necessity: there is no tenant context on an anonymous
    // request. The room id is what selects the tenant, and only non-personal
    // fields are ever returned.
    const resource = await runUnscoped(() =>
      this.prisma.resource.findUnique({
        where: { id },
        select: {
          id: true, name: true, type: true, capacity: true, status: true,
          facilities: true, tenantId: true,
          floor: { select: { name: true, building: { select: { name: true } } } },
          tenant: { select: { name: true, timezone: true, isActive: true } },
        },
      }),
    );
    if (!resource || !resource.tenant?.isActive) throw new NotFoundException('Room not found.');

    const tz = resource.tenant.timezone || 'UTC';
    const base = day && /^\d{4}-\d{2}-\d{2}$/.test(day)
      ? new Date(`${day}T12:00:00.000Z`)
      : new Date();
    const dayStart = startOfDayInTz(base, tz);
    const dayEnd = addLocalDays(dayStart, 1, tz);

    const bookings = await runUnscoped(() =>
      this.prisma.booking.findMany({
        where: {
          tenantId: resource.tenantId,
          resourceId: id,
          status: { in: ['PENDING', 'APPROVED', 'WAITLIST'] },
          startTime: { lt: dayEnd },
          endTime: { gt: dayStart },
        },
        orderBy: { startTime: 'asc' },
        // Times only. No title, no organiser, no participants.
        select: { id: true, startTime: true, endTime: true },
      }),
    );

    const now = new Date();
    const current = bookings.find((b) => b.startTime <= now && b.endTime > now) ?? null;
    const next = bookings.find((b) => b.startTime > now) ?? null;

    return {
      room: {
        id: resource.id,
        name: resource.name,
        type: resource.type,
        capacity: resource.capacity,
        status: resource.status,
        facilities: resource.facilities,
        floor: resource.floor,
      },
      workspace: resource.tenant.name,
      timezone: tz,
      day: localDateKey(dayStart, tz),
      isToday: localDateKey(now, tz) === localDateKey(dayStart, tz),
      busyNow: Boolean(current),
      busyUntil: current?.endTime ?? null,
      nextFrom: next?.startTime ?? null,
      /** Occupied stretches, with no indication of who or what. */
      busy: bookings.map((b) => ({ id: b.id, startTime: b.startTime, endTime: b.endTime })),
    };
  }
}
