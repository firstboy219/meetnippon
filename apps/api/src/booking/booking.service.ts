import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { nanoid } from 'nanoid';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CalendarService } from '../calendar/calendar.service';
import { NotificationService } from '../notification/notification.service';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { formatRange } from '../common/tz.util';
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
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { addLocalDays, startOfDayInTz } from '../common/tz.util';
import { tenantTimezone } from '../common/tenant-tz';

const ACTIVE_STATES = ['PENDING', 'APPROVED', 'WAITLIST'] as const;

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly resolver: PolicyResolverService,
    private readonly calendar: CalendarService,
    private readonly notifications: NotificationService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private caller() {
    const store = getTenantStore();
    return { userId: store?.userId as string, role: store?.role ?? 'EMPLOYEE' };
  }

  /** The tenant's wall clock — all rule evaluation and day boundaries use it. */
  private tenantTz(): Promise<string> {
    return tenantTimezone(this.prisma);
  }

  /**
   * Tell colleagues they were invited, or that a meeting they are on has moved.
   *
   * Only participants who are users of this tenant can be reached: an in-app
   * notification has nowhere to land for an external email address. Those are
   * stored on the booking and wait on outbound email (needs SMTP), so this
   * deliberately reports how many it could not reach rather than pretending.
   */
  private async notifyParticipants(
    booking: { id: string; title: string; startTime: Date; endTime: Date; resourceId?: string | null },
    participants: { userId?: string; email: string }[],
    kind: 'invited' | 'moved',
  ): Promise<{ notified: number; emailQueued: number }> {
    const tenantId = getTenantStore()?.tenantId;
    const callerId = this.caller().userId;
    if (!tenantId || participants.length === 0) {
      return { notified: 0, emailQueued: 0 };
    }

    const emails = participants.map((p) => p.email).filter(Boolean);
    const ids = participants.map((p) => p.userId).filter(Boolean) as string[];
    const users = await this.prisma.scoped.user.findMany({
      where: { OR: [{ id: { in: ids } }, { email: { in: emails } }], isActive: true },
      select: { id: true, email: true },
    });

    const targets = users.filter((u) => u.id !== callerId);
    for (const u of targets) {
      await this.notifications.notify(tenantId, u.id, {
        type: 'calendar',
        title:
          kind === 'invited'
            ? `You were invited to "${booking.title}"`
            : `"${booking.title}" was rescheduled`,
        deepLink: '/calendar',
      });
    }

    // Email reaches everyone on the list, including guests outside the
    // workspace who have no in-app inbox. The organiser is left out — they
    // just performed the action.
    const organiser = users.find((u) => u.id === callerId)?.email;
    const recipients = [...new Set(emails)].filter((e) => e !== organiser);
    if (recipients.length) {
      const [tenant, resource] = await Promise.all([
        this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, timezone: true } }),
        booking.resourceId
          ? this.prisma.scoped.resource.findUnique({
            where: { id: booking.resourceId }, select: { name: true },
          })
          : Promise.resolve(null),
      ]);
      const tz = tenant?.timezone || 'UTC';
      const when = formatRange(booking.startTime, booking.endTime, tz);
      const where = resource?.name ?? 'Online';
      this.mail.send({
        tenantId,
        to: recipients,
        subject: kind === 'invited'
          ? `Invitation: ${booking.title}`
          : `Rescheduled: ${booking.title}`,
        text: [
          kind === 'invited'
            ? `You have been invited to a meeting at ${tenant?.name ?? 'MeetNippon'}.`
            : `A meeting you are attending at ${tenant?.name ?? 'MeetNippon'} has been moved.`,
          '',
          `What:  ${booking.title}`,
          `When:  ${when}`,
          `Where: ${where}`,
        ].join('\n'),
        action: { label: 'Open calendar', url: `${this.appBaseUrl()}/calendar` },
      });
    }

    // Queued, not delivered: sending is fire-and-forget so a booking is never
    // held up by a mail server. Delivery success lives in the logs and in the
    // admin mail-status probe — do not let the UI claim more than this.
    return {
      notified: targets.length,
      emailQueued: this.mail.isEnabled() ? recipients.length : 0,
    };
  }

  private appBaseUrl(): string {
    return this.config.get<string>('APP_BASE_URL') || 'https://meetnippon.cosger.online';
  }

  /** Any active booking whose (buffered) window overlaps the given slot. */
  private async hasConflict(
    resourceId: string,
    slot: Slot,
    bufferMinutes: number,
    excludeBookingId?: string,
  ): Promise<boolean> {
    const bufMs = bufferMinutes * 60000;
    const start = new Date(slot.start.getTime() - bufMs);
    const end = new Date(slot.end.getTime() + bufMs);
    const count = await this.prisma.scoped.booking.count({
      where: {
        resourceId,
        status: { in: ACTIVE_STATES as any },
        // An edit must not collide with the booking being edited.
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
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
    const tz = await this.tenantTz();

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
    const occurrences = generateOccurrences(base, dto.recurrence, tz);

    // 1) pure per-slot validation (duration / advance / business hours)
    for (const slot of occurrences) {
      const err = validateSlot(slot, rules, now, tz);
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
        const dayStart = startOfDayInTz(slot.start, tz);
        const dayEnd = addLocalDays(dayStart, 1, tz);
        const existing = await this.prisma.scoped.booking.count({
          where: {
            principalId,
            status: { in: [...ACTIVE_STATES, 'COMPLETED'] as any },
            startTime: { gte: dayStart, lt: dayEnd },
          },
        });
        const sameDayInBatch = occurrences.filter(
          (o) => startOfDayInTz(o.start, tz).getTime() === dayStart.getTime(),
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

    const invites = dto.notify === false
      ? { notified: 0, emailQueued: 0 }
      : await this.notifyParticipants(
        created[0],
        (dto.participants ?? []) as { userId?: string; email: string }[],
        'invited',
      );

    return dto.recurrence
      ? { groupId, count: created.length, bookings: created, invites }
      : { ...created[0], invites };
  }

  listMine(q: ListBookingsQueryDto = {}) {
    const { userId } = this.caller();
    const now = new Date();

    const where: Prisma.BookingWhereInput = {
      OR: [{ principalId: userId }, { bookerId: userId }],
    };
    if (q.status) where.status = q.status as any;
    // The window is measured against endTime so a meeting in progress is still
    // "upcoming" — it has not happened yet from the attendee's point of view.
    if (q.scope === 'upcoming') where.endTime = { gte: now };
    else if (q.scope === 'past') where.endTime = { lt: now };

    if (q.from || q.to) {
      where.startTime = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lt: new Date(q.to) } : {}),
      };
    }

    return this.prisma.scoped.booking.findMany({
      where,
      // Upcoming reads forwards (soonest first); everything else reads backwards
      // from the most recent, which is how a history list is scanned.
      orderBy: { startTime: q.scope === 'upcoming' ? 'asc' : 'desc' },
      ...(q.take !== undefined ? { take: q.take } : {}),
      ...(q.skip ? { skip: q.skip } : {}),
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

  /**
   * Edit an existing booking. Re-runs the same policy gate as create, because
   * an edit can move a slot anywhere a create could have put it.
   */
  async update(id: string, dto: UpdateBookingDto) {
    const caller = this.caller();
    const booking = await this.prisma.scoped.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found.');

    const isOwner =
      booking.principalId === caller.userId || booking.bookerId === caller.userId;
    if (!isOwner && caller.role !== 'ADMIN') {
      throw new ForbiddenException('You can only edit your own bookings.');
    }
    if (!ACTIVE_STATES.includes(booking.status as any)) {
      throw new BadRequestException(
        `A ${booking.status.toLowerCase()} booking can no longer be edited.`,
      );
    }

    const now = new Date();
    // Once a meeting has finished there is nothing left to arrange; a booking
    // already under way may still have its details corrected, but not its time.
    if (booking.endTime <= now) {
      throw new BadRequestException('This booking has already ended.');
    }

    const movingTime = dto.startTime !== undefined || dto.endTime !== undefined;
    const movingRoom = dto.resourceId !== undefined && dto.resourceId !== booking.resourceId;
    if (movingTime && (dto.startTime === undefined || dto.endTime === undefined)) {
      throw new BadRequestException('Send startTime and endTime together.');
    }
    if ((movingTime || movingRoom) && booking.startTime <= now) {
      throw new BadRequestException('This booking has already started; its time cannot be changed.');
    }

    const tz = await this.tenantTz();
    const resourceId = dto.resourceId ?? booking.resourceId;
    let resource: { id: string; category: string | null } | null = null;
    if (resourceId) {
      const r = await this.prisma.scoped.resource.findUnique({ where: { id: resourceId } });
      if (!r) throw new NotFoundException('Resource not found.');
      if (r.status !== 'ACTIVE') throw new BadRequestException('Resource is not active.');
      resource = { id: r.id, category: r.category };
    }
    const rules: PolicyRules = resource
      ? await this.resolver.resolveForResource(resource)
      : DEFAULT_RULES;

    if (!rules.allowExternalParticipants && (dto.participants ?? []).some((p) => p.external)) {
      throw new BadRequestException('External participants are not allowed for this resource.');
    }

    const slot: Slot = {
      start: dto.startTime ? new Date(dto.startTime) : booking.startTime,
      end: dto.endTime ? new Date(dto.endTime) : booking.endTime,
    };

    if (movingTime || movingRoom) {
      const err = validateSlot(slot, rules, now, tz);
      if (err) throw new BadRequestException(err);
      if (resource && await this.hasConflict(resource.id, slot, rules.bufferMinutes, id)) {
        throw new ConflictException('Time slot conflicts with an existing booking.');
      }
    }

    // Moving a booking into a room that requires approval — or moving an
    // already-approved one to a new time — invalidates the decision that was
    // made about the old slot, so it goes back through approval.
    const needsReapproval =
      rules.requiresApproval && (movingTime || movingRoom) && booking.status === 'APPROVED';

    const updated = await this.prisma.scoped.booking.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.meetingLink !== undefined ? { meetingLink: dto.meetingLink } : {}),
        ...(dto.participants !== undefined ? { participants: dto.participants as any } : {}),
        ...(dto.resourceId !== undefined ? { resourceId: dto.resourceId } : {}),
        ...(movingTime ? { startTime: slot.start, endTime: slot.end } : {}),
        ...(needsReapproval ? { status: 'PENDING' as any } : {}),
      },
    });

    if (needsReapproval) {
      await this.prisma.scoped.approvalStep.deleteMany({ where: { bookingId: id } });
      await this.createApprovalSteps(id, rules.approverIds);
    }

    await this.audit.log({
      action: 'booking.update',
      entity: 'Booking',
      entityId: id,
      metadata: {
        movedTime: movingTime,
        movedRoom: movingRoom,
        reapproval: needsReapproval,
      },
    });

    // Whoever is on the booking now — the edited list if one was sent, the
    // stored one otherwise — is told when the meeting actually moves.
    const audience = (dto.participants ?? updated.participants ?? []) as {
      userId?: string; email: string;
    }[];
    const invites = (movingTime || movingRoom) && dto.notify !== false
      ? await this.notifyParticipants(updated, audience, 'moved')
      : { notified: 0, emailQueued: 0 };

    return { ...updated, invites };
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

  async checkIn(id: string, token?: string) {
    const caller = this.caller();
    const booking = await this.prisma.scoped.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found.');

    /*
     * Two ways in, and they authorise differently:
     *
     *  - with a token: whoever scanned the code at the room proves presence,
     *    so the token itself is the credential and must match exactly;
     *  - without one: the person who owns the booking checks in from the app.
     *    They are already authenticated and it is their own booking, so no
     *    second secret is needed — requiring one would make the button in the
     *    portal impossible to use, since nobody can see the token.
     *
     * A wrong token is always refused, even from the owner.
     */
    if (token !== undefined) {
      if (!booking.checkInToken || booking.checkInToken !== token) {
        throw new BadRequestException('Invalid check-in token.');
      }
    } else {
      const isOwner =
        booking.principalId === caller.userId || booking.bookerId === caller.userId;
      if (!isOwner && caller.role !== 'ADMIN') {
        throw new ForbiddenException('You can only check in to your own booking.');
      }
    }

    if (booking.checkedInAt) {
      throw new BadRequestException('This booking is already checked in.');
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
