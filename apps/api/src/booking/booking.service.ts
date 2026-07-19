import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { nanoid } from 'nanoid';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CalendarService } from '../calendar/calendar.service';
import { getTenantStore } from '../tenant/tenant-context';
import { PolicyResolverService } from './policy/policy-resolver.service';
import { DEFAULT_RULES, PolicyRules } from './policy/policy.types';
import {
  Slot,
  generateOccurrences,
  validateSlot,
} from './booking.rules';
import { CreateBookingDto } from './dto/create-booking.dto';
import { AvailabilityQueryDto } from './dto/availability-query.dto';

const ACTIVE_STATES = ['PENDING', 'APPROVED', 'WAITLIST'] as const;

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly resolver: PolicyResolverService,
    private readonly calendar: CalendarService,
  ) {}

  private caller() {
    const store = getTenantStore();
    return { userId: store?.userId as string, role: store?.role ?? 'EMPLOYEE' };
  }

  /** Any active booking whose (buffered) window overlaps the given slot. */
  private async hasConflict(
    resourceId: string,
    slot: Slot,
    bufferMinutes: number,
  ): Promise<boolean> {
    const bufMs = bufferMinutes * 60000;
    const start = new Date(slot.start.getTime() - bufMs);
    const end = new Date(slot.end.getTime() + bufMs);
    const count = await this.prisma.scoped.booking.count({
      where: {
        resourceId,
        status: { in: ACTIVE_STATES as any },
        startTime: { lt: end },
        endTime: { gt: start },
      },
    });
    return count > 0;
  }

  private async createApprovalSteps(bookingId: string, approverIds: string[]) {
    if (approverIds.length === 0) {
      await this.prisma.scoped.approvalStep.create({
        data: { bookingId, level: 1, decision: 'PENDING' } as any,
      });
      return;
    }
    let level = 1;
    for (const approverId of approverIds) {
      await this.prisma.scoped.approvalStep.create({
        data: { bookingId, level: level++, approverId, decision: 'PENDING' } as any,
      });
    }
  }

  async create(dto: CreateBookingDto) {
    const caller = this.caller();
    const principalId = dto.principalId ?? caller.userId;
    if (principalId !== caller.userId && caller.role !== 'ADMIN') {
      throw new ForbiddenException('Only an admin may book on behalf of others.');
    }
    const type = dto.type ?? 'OFFLINE';
    const now = new Date();

    const principal = await this.prisma.scoped.user.findUnique({
      where: { id: principalId },
    });
    if (!principal) throw new BadRequestException('Principal user not found.');

    let resource: { id: string; category: string | null } | null = null;
    if (type !== 'ONLINE') {
      if (!dto.resourceId) {
        throw new BadRequestException('resourceId is required for OFFLINE/HYBRID bookings.');
      }
      const r = await this.prisma.scoped.resource.findUnique({
        where: { id: dto.resourceId },
      });
      if (!r) throw new NotFoundException('Resource not found.');
      if (r.status !== 'ACTIVE') throw new BadRequestException('Resource is not active.');
      resource = { id: r.id, category: r.category };
    }

    const rules: PolicyRules = resource
      ? await this.resolver.resolveForResource(resource)
      : DEFAULT_RULES;

    if (
      !rules.allowExternalParticipants &&
      (dto.participants ?? []).some((p) => p.external)
    ) {
      throw new BadRequestException('External participants are not allowed for this resource.');
    }
    if (dto.recurrence && !rules.allowRecurring) {
      throw new BadRequestException('Recurring bookings are not allowed for this resource.');
    }

    const base: Slot = { start: new Date(dto.startTime), end: new Date(dto.endTime) };
    const occurrences = generateOccurrences(base, dto.recurrence);

    // 1) pure per-slot validation (duration / advance / business hours)
    for (const slot of occurrences) {
      const err = validateSlot(slot, rules, now);
      if (err) throw new BadRequestException(err);
    }

    // 2) DB checks: conflicts + per-user daily quota
    for (const slot of occurrences) {
      if (resource) {
        if (await this.hasConflict(resource.id, slot, rules.bufferMinutes)) {
          throw new ConflictException(
            `Time slot conflicts with an existing booking (${slot.start.toISOString()}).`,
          );
        }
      }
      if (rules.maxBookingsPerUserPerDay > 0) {
        const dayStart = startOfUtcDay(slot.start);
        const dayEnd = new Date(dayStart.getTime() + 86400000);
        const existing = await this.prisma.scoped.booking.count({
          where: {
            principalId,
            status: { in: [...ACTIVE_STATES, 'COMPLETED'] as any },
            startTime: { gte: dayStart, lt: dayEnd },
          },
        });
        const sameDayInBatch = occurrences.filter(
          (o) => startOfUtcDay(o.start).getTime() === dayStart.getTime(),
        ).length;
        if (existing + sameDayInBatch > rules.maxBookingsPerUserPerDay) {
          throw new BadRequestException(
            `Exceeds the daily booking limit (${rules.maxBookingsPerUserPerDay}).`,
          );
        }
      }
    }

    // 3) persist
    const status = rules.requiresApproval ? 'PENDING' : 'APPROVED';
    const groupId = dto.recurrence ? nanoid(16) : null;
    const created: any[] = [];
    for (const slot of occurrences) {
      const booking = await this.prisma.scoped.booking.create({
        data: {
          title: dto.title,
          description: dto.description ?? null,
          type,
          meetingLink: dto.meetingLink ?? null,
          resourceId: resource?.id ?? null,
          principalId,
          bookerId: caller.userId,
          startTime: slot.start,
          endTime: slot.end,
          status,
          participants: (dto.participants ?? []) as any,
          reminders: (dto.reminders ?? []) as any,
          recordingRequested: dto.recordingRequested ?? false,
          recurringGroupId: groupId,
          checkInToken: rules.checkInRequired ? nanoid(24) : null,
        } as any,
      });
      if (rules.requiresApproval) {
        await this.createApprovalSteps(booking.id, rules.approverIds);
      }
      created.push(booking);
    }

    await this.audit.log({
      action: 'booking.create',
      entity: 'Booking',
      entityId: created[0].id,
      metadata: { count: created.length, status, resourceId: resource?.id ?? null },
    });

    const tid = caller ? getTenantStore()?.tenantId : null;
    if (tid) {
      await this.calendar.onBookingCreated(tid, {
        bookingId: created[0].id,
        title: dto.title,
        startTime: occurrences[0].start,
        endTime: occurrences[0].end,
        organizerId: principalId,
      });
    }

    return dto.recurrence ? { groupId, count: created.length, bookings: created } : created[0];
  }

  listMine() {
    const { userId } = this.caller();
    return this.prisma.scoped.booking.findMany({
      where: { OR: [{ principalId: userId }, { bookerId: userId }] },
      orderBy: { startTime: 'desc' },
      include: { approvalSteps: true, resource: { select: { name: true, type: true } } },
    });
  }

  async getOne(id: string) {
    const booking = await this.prisma.scoped.booking.findUnique({
      where: { id },
      include: { approvalSteps: true, resource: true },
    });
    if (!booking) throw new NotFoundException('Booking not found.');
    return booking;
  }

  async cancel(id: string, reason?: string) {
    const caller = this.caller();
    const booking = await this.prisma.scoped.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found.');

    const isOwner =
      booking.principalId === caller.userId || booking.bookerId === caller.userId;
    if (!isOwner && caller.role !== 'ADMIN') {
      throw new ForbiddenException('Not allowed to cancel this booking.');
    }
    if (!(ACTIVE_STATES as readonly string[]).includes(booking.status)) {
      throw new BadRequestException(`Cannot cancel a ${booking.status} booking.`);
    }

    const updated = await this.prisma.scoped.booking.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    await this.audit.log({
      action: 'booking.cancel',
      entity: 'Booking',
      entityId: id,
      metadata: { reason: reason ?? null },
    });
    return updated;
  }

  async checkIn(id: string, token: string) {
    const booking = await this.prisma.scoped.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found.');
    if (!booking.checkInToken || booking.checkInToken !== token) {
      throw new BadRequestException('Invalid check-in token.');
    }
    if (booking.status !== 'APPROVED') {
      throw new BadRequestException('Only approved bookings can be checked in.');
    }
    const now = new Date();
    const graceMs = 15 * 60000;
    if (now.getTime() < booking.startTime.getTime() - graceMs) {
      throw new BadRequestException('Too early to check in.');
    }
    if (now.getTime() > booking.endTime.getTime()) {
      throw new BadRequestException('Booking has already ended.');
    }
    const updated = await this.prisma.scoped.booking.update({
      where: { id },
      data: { checkedInAt: now },
    });
    await this.audit.log({
      action: 'booking.checkin',
      entity: 'Booking',
      entityId: id,
    });
    return updated;
  }

  async availability(q: AvailabilityQueryDto) {
    const resource = await this.prisma.scoped.resource.findUnique({
      where: { id: q.resourceId },
    });
    if (!resource) throw new NotFoundException('Resource not found.');

    const from = q.from ? new Date(q.from) : new Date();
    const to = q.to ? new Date(q.to) : new Date(from.getTime() + 86400000);

    const busy = await this.prisma.scoped.booking.findMany({
      where: {
        resourceId: q.resourceId,
        status: { in: ACTIVE_STATES as any },
        startTime: { lt: to },
        endTime: { gt: from },
      },
      select: { id: true, startTime: true, endTime: true, status: true, title: true },
      orderBy: { startTime: 'asc' },
    });

    return { resourceId: q.resourceId, from, to, busy };
  }
}
