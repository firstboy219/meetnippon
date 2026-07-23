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
  exceedsMaxAdvance,
  generateOccurrences,
  minutesBetween,
  validateSlot,
  withinBusinessHours,
} from './booking.rules';
import { CreateBookingDto } from './dto/create-booking.dto';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import {
  addLocalDays,
  isoWeekdayInTz,
  localDateKey,
  startOfDayInTz,
  tzOffsetMs,
  zonedParts,
} from '../common/tz.util';
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
    booking: {
      id: string; title: string; startTime: Date; endTime: Date;
      resourceId?: string | null; meetingLink?: string | null; description?: string | null;
    },
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
      const [tenant, resource, organiserUser] = await Promise.all([
        this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: {
            name: true, timezone: true,
            branding: { select: { primaryColor: true, displayName: true, logoUrl: true } },
          },
        }),
        booking.resourceId
          ? this.prisma.scoped.resource.findUnique({
            where: { id: booking.resourceId },
            select: { name: true, floor: { select: { name: true, building: { select: { name: true } } } } },
          })
          : Promise.resolve(null),
        this.prisma.scoped.user.findUnique({ where: { id: callerId }, select: { fullName: true } }),
      ]);
      const tz = tenant?.timezone || 'UTC';
      const brandName = tenant?.branding?.displayName || tenant?.name || 'MeetNippon';
      const link = (booking.meetingLink ?? '').trim();
      const where = resource
        ? [resource.name, resource.floor?.building?.name, resource.floor?.name].filter(Boolean).join(' · ')
        : 'Online meeting';

      // Structured details, so the meeting link is actually in the email — the
      // whole point of an invitation — alongside a clean when/where/organiser.
      const details = [
        { label: 'Meeting', value: booking.title },
        { label: 'When', value: formatRange(booking.startTime, booking.endTime, tz) },
        { label: 'Where', value: where },
        ...(link ? [{ label: 'Join link', value: link, href: link }] : []),
        ...(organiserUser?.fullName ? [{ label: 'Organiser', value: organiserUser.fullName }] : []),
        ...(booking.description?.trim()
          ? [{ label: 'Notes', value: booking.description.trim() }]
          : []),
      ];

      const buttons = [
        ...(link ? [{ label: 'Join meeting', url: link, primary: true }] : []),
        { label: 'Open in calendar', url: `${this.appBaseUrl()}/calendar`, primary: !link },
      ];

      this.mail.send({
        tenantId,
        to: recipients,
        subject: kind === 'invited'
          ? `Invitation: ${booking.title}`
          : `Rescheduled: ${booking.title}`,
        eyebrow: kind === 'invited' ? 'New invitation' : 'Meeting updated',
        heading: kind === 'invited' ? booking.title : `Rescheduled: ${booking.title}`,
        intro: kind === 'invited'
          ? `You've been invited to a meeting at ${brandName}. The details are below — add it to your calendar or join with one tap.`
          : `A meeting you're attending at ${brandName} has moved. Here are the new details.`,
        details,
        buttons,
        brand: {
          name: brandName,
          color: tenant?.branding?.primaryColor,
          logoUrl: this.absoluteUrl(tenant?.branding?.logoUrl),
        },
        footerNote: 'Please let the organiser know if you can’t make it.',
        // Plain-text fallback mirrors the details for text-only clients.
        text: [
          kind === 'invited'
            ? `You have been invited to a meeting at ${brandName}.`
            : `A meeting you are attending at ${brandName} has moved.`,
          '',
          `What:  ${booking.title}`,
          `When:  ${formatRange(booking.startTime, booking.endTime, tz)}`,
          `Where: ${where}`,
          ...(link ? [`Link:  ${link}`] : []),
          ...(organiserUser?.fullName ? [`Organiser: ${organiserUser.fullName}`] : []),
        ].join('\n'),
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

  /** Absolutise a possibly-relative logo path for use in an email. */
  private absoluteUrl(url?: string | null): string | undefined {
    if (!url) return undefined;
    if (/^https?:\/\//i.test(url)) return url;
    return `${this.appBaseUrl()}${url.startsWith('/') ? '' : '/'}${url}`;
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

  /** Throws when the resolved policy has an allowlist that excludes the user. */
  private assertAllowed(rules: PolicyRules, principalId: string) {
    const allow = rules.allowedUserIds ?? [];
    if (allow.length > 0 && !allow.includes(principalId)) {
      throw new ForbiddenException(
        'This room is restricted; you are not on its allowed list.',
      );
    }
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

    // Room allowlist (tester feedback #3): checked on the principal — the
    // person the room is booked *for* — so an admin booking on behalf of an
    // allowed user passes, and booking on behalf of a blocked one does not.
    this.assertAllowed(rules, principalId);

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

    // Beyond the booking horizon: refused by default, but the admin can elect
    // (per policy) to accept it and route it through approval instead.
    const overAdvance = occurrences.some((s) => exceedsMaxAdvance(s, rules, now));

    // 1) pure per-slot validation (duration / advance / business hours)
    for (const slot of occurrences) {
      const err = validateSlot(slot, rules, now, tz, {
        allowOverAdvance: rules.overAdvanceRequiresApproval,
      });
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
    const needsApproval = rules.requiresApproval || (overAdvance && rules.overAdvanceRequiresApproval);
    const status = needsApproval ? 'PENDING' : 'APPROVED';
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
      if (needsApproval) {
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
   * Schedule assistant (BRD 7.4.6): who among these people already has
   * something in the proposed slot.
   *
   * Reports only *that* someone is busy and the clashing time — not what the
   * clashing meeting is. Colleagues need enough to pick another slot; they do
   * not need to read each other's calendars.
   */
  async participantAvailability(emails: string[], startTime: string, endTime: string) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (!(start < end)) throw new BadRequestException('End must be after start.');

    const cleaned = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
    if (cleaned.length === 0) return { checked: 0, people: [] };

    const users = await this.prisma.scoped.user.findMany({
      where: { email: { in: cleaned }, isActive: true },
      select: { id: true, email: true, fullName: true },
    });

    const clashes = await this.prisma.scoped.booking.findMany({
      where: {
        principalId: { in: users.map((u) => u.id) },
        status: { in: ACTIVE_STATES as any },
        startTime: { lt: end },
        endTime: { gt: start },
      },
      select: { principalId: true, startTime: true, endTime: true },
      orderBy: { startTime: 'asc' },
    });

    const byUser = new Map<string, typeof clashes>();
    for (const c of clashes) {
      const l = byUser.get(c.principalId) ?? [];
      l.push(c);
      byUser.set(c.principalId, l);
    }

    const known = new Set(users.map((u) => u.email));
    return {
      checked: users.length,
      people: [
        ...users.map((u) => {
          const busy = byUser.get(u.id) ?? [];
          return {
            email: u.email,
            fullName: u.fullName,
            // 'unknown' is honest for guests we cannot see a calendar for.
            status: busy.length ? ('busy' as const) : ('free' as const),
            busy: busy.map((b) => ({ startTime: b.startTime, endTime: b.endTime })),
          };
        }),
        // External addresses have no calendar here; say so rather than
        // implying they are free.
        ...cleaned.filter((e) => !known.has(e)).map((email) => ({
          email, fullName: null, status: 'unknown' as const, busy: [],
        })),
      ],
    };
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
    const started = booking.startTime <= now;
    const startUnchanged =
      dto.startTime === undefined ||
      new Date(dto.startTime).getTime() === booking.startTime.getTime();
    // A meeting under way can still be extended or cut short (tester feedback
    // #4 — "change a running meeting"), but its start already happened and its
    // room is already occupied, so neither of those can move any more.
    if ((movingTime || movingRoom) && started && (movingRoom || !startUnchanged)) {
      throw new BadRequestException(
        'This booking has already started; only its end time can still be changed.',
      );
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

    // Moving into a room with an allowlist re-checks the booking's principal,
    // same as create would.
    if (movingRoom) this.assertAllowed(rules, booking.principalId);

    if ((movingTime || movingRoom) && started) {
      // In-progress: only the end is moving. validateSlot() would refuse a
      // start in the past, so this path checks what still matters — the new
      // end is in the future, the total stays within the duration cap, and
      // any *extension* does not run into the next booking.
      if (slot.end <= now) {
        throw new BadRequestException('The new end time must be in the future.');
      }
      if (minutesBetween(slot.start, slot.end) > rules.maxDurationMinutes) {
        throw new BadRequestException(
          `Duration must not exceed ${rules.maxDurationMinutes} minutes.`,
        );
      }
      if (!withinBusinessHours(slot, rules, tz)) {
        throw new BadRequestException('Outside allowed business hours.');
      }
      if (
        resource &&
        slot.end > booking.endTime &&
        await this.hasConflict(
          resource.id,
          { start: booking.endTime, end: slot.end },
          rules.bufferMinutes,
          id,
        )
      ) {
        throw new ConflictException('The extension conflicts with the next booking.');
      }
    } else if (movingTime || movingRoom) {
      const err = validateSlot(slot, rules, now, tz, {
        allowOverAdvance: rules.overAdvanceRequiresApproval,
      });
      if (err) throw new BadRequestException(err);
      if (resource && await this.hasConflict(resource.id, slot, rules.bufferMinutes, id)) {
        throw new ConflictException('Time slot conflicts with an existing booking.');
      }
    }

    // Moving a booking into a room that requires approval — or moving an
    // already-approved one to a new time, or beyond the booking horizon when
    // the admin routes that through approval — invalidates the decision that
    // was made about the old slot, so it goes back through approval. An
    // in-progress end-time tweak is exempt: a meeting cannot go back to
    // PENDING while it is happening.
    const movedBeyondHorizon =
      rules.overAdvanceRequiresApproval && exceedsMaxAdvance(slot, rules, now);
    const needsReapproval =
      (rules.requiresApproval || movedBeyondHorizon) &&
      (movingTime || movingRoom) && !started &&
      booking.status === 'APPROVED';

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

  /** The step the booking grid snaps to, in minutes. */
  private static readonly SLOT_STEP_MIN = 30;

  /**
   * Contiguous windows a room is actually free on a given day — the primitive
   * the booking form derives BOTH start and end options from (so a user can
   * pick a start and then see how far it can run), with a manual duration.
   *
   * Everything comes from the admin-set policy: business hours bound the day,
   * buffers widen each existing booking, min-advance trims the near edge, and
   * the horizon trims the far edge — unless the admin routes over-horizon
   * bookings through approval, in which case the far edge stays and the day is
   * flagged as needing approval instead.
   */
  async freeWindows(resourceId: string, day: string) {
    const resource = await this.prisma.scoped.resource.findUnique({ where: { id: resourceId } });
    if (!resource) throw new NotFoundException('Resource not found.');
    if (resource.status !== 'ACTIVE') throw new BadRequestException('Resource is not active.');

    const rules = await this.resolver.resolveForResource({
      id: resource.id, category: resource.category,
    });
    const tz = await this.tenantTz();
    const now = new Date();

    const base = /^\d{4}-\d{2}-\d{2}$/.test(day)
      ? new Date(`${day}T12:00:00.000Z`)
      : new Date();
    const dayStart = startOfDayInTz(base, tz);
    const dayEnd = addLocalDays(dayStart, 1, tz);

    // Local wall-clock minutes-past-midnight -> real instant, DST-safe (same
    // two-pass correction as startOfDayInTz).
    const wall = (minutes: number): number => {
      const p = zonedParts(dayStart, tz);
      const target = Date.UTC(p.year, p.month - 1, p.day, 0, minutes);
      const guess = new Date(target - tzOffsetMs(dayStart, tz));
      return target - tzOffsetMs(guess, tz);
    };
    const parseHHMM = (s: string) => {
      const [h, m] = s.split(':').map(Number);
      return h * 60 + m;
    };

    const bh = rules.businessHours ?? { start: '00:00', end: '23:59', days: [1, 2, 3, 4, 5, 6, 7] };
    const open = bh.days.includes(isoWeekdayInTz(new Date(dayStart.getTime() + 12 * 3600_000), tz));

    const minMs = rules.minDurationMinutes * 60000;
    const horizonMs = now.getTime() + rules.maxAdvanceDays * 86400_000;
    // Near edge: must be in the future and past the min-advance lead.
    // Far edge: business close, trimmed to the horizon unless approval covers it.
    let segStart = Math.max(wall(parseHHMM(bh.start)), now.getTime() + rules.minAdvanceMinutes * 60000);
    let segEnd = wall(parseHHMM(bh.end));
    if (!rules.overAdvanceRequiresApproval) segEnd = Math.min(segEnd, horizonMs);
    // Whole day past the horizon while approval covers it → still bookable, but
    // every slot will queue for approval.
    const overHorizon = rules.overAdvanceRequiresApproval && wall(parseHHMM(bh.end)) > horizonMs;

    const bufMs = rules.bufferMinutes * 60000;
    const busyRows = await this.prisma.scoped.booking.findMany({
      where: {
        resourceId,
        status: { in: ACTIVE_STATES as any },
        startTime: { lt: new Date(dayEnd.getTime() + bufMs) },
        endTime: { gt: new Date(dayStart.getTime() - bufMs) },
      },
      select: { startTime: true, endTime: true },
      orderBy: { startTime: 'asc' },
    });
    // Buffer-pad then merge overlapping busy stretches into disjoint intervals.
    const merged: { start: number; end: number }[] = [];
    for (const b of busyRows) {
      const s = b.startTime.getTime() - bufMs;
      const e = b.endTime.getTime() + bufMs;
      const last = merged[merged.length - 1];
      if (last && s <= last.end) last.end = Math.max(last.end, e);
      else merged.push({ start: s, end: e });
    }

    // Free = [segStart, segEnd] minus busy, each piece long enough to hold the
    // shortest allowed meeting.
    const windows: { start: string; end: string }[] = [];
    if (open && segEnd - segStart >= minMs) {
      let cursor = segStart;
      for (const b of merged) {
        if (b.end <= cursor) continue;
        if (b.start >= segEnd) break;
        const gapEnd = Math.min(b.start, segEnd);
        if (gapEnd - cursor >= minMs) {
          windows.push({ start: new Date(cursor).toISOString(), end: new Date(gapEnd).toISOString() });
        }
        cursor = Math.max(cursor, b.end);
        if (cursor >= segEnd) break;
      }
      if (segEnd - cursor >= minMs) {
        windows.push({ start: new Date(cursor).toISOString(), end: new Date(segEnd).toISOString() });
      }
    }

    return {
      resourceId,
      day: localDateKey(dayStart, tz),
      timezone: tz,
      now: now.toISOString(),
      // Local-midnight instant: the grid the client snaps start/end times to,
      // so both sides agree on where :00/:30 falls.
      gridAnchor: dayStart.toISOString(),
      slotStepMinutes: BookingService.SLOT_STEP_MIN,
      minDurationMinutes: rules.minDurationMinutes,
      maxDurationMinutes: rules.maxDurationMinutes,
      requiresApproval: rules.requiresApproval || overHorizon,
      maxAdvanceDays: rules.maxAdvanceDays,
      allowExternalParticipants: rules.allowExternalParticipants,
      allowRecurring: rules.allowRecurring,
      // The whole business-hours block (future/horizon-clipped), ignoring the
      // room's own bookings — for ONLINE meetings that occupy no room.
      dayWindow: open && segEnd > segStart
        ? { start: new Date(segStart).toISOString(), end: new Date(segEnd).toISOString() }
        : null,
      windows,
    };
  }

  /**
   * Start times open for a specific duration. Kept as a thin projection of
   * freeWindows so existing callers/tests keep working; the richer form uses
   * freeWindows directly and derives end times too.
   */
  async freeSlots(resourceId: string, day: string, durationMinutes: number) {
    const fw = await this.freeWindows(resourceId, day);
    if (durationMinutes < fw.minDurationMinutes || durationMinutes > fw.maxDurationMinutes) {
      throw new BadRequestException(
        `Duration must be between ${fw.minDurationMinutes} and ${fw.maxDurationMinutes} minutes.`,
      );
    }
    const stepMs = fw.slotStepMinutes * 60000;
    const durMs = durationMinutes * 60000;
    const anchor = new Date(fw.gridAnchor).getTime();
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: fw.timezone, hour: '2-digit', minute: '2-digit', hour12: false,
    });

    const slots: { startTime: string; endTime: string; label: string }[] = [];
    for (const w of fw.windows) {
      const ws = new Date(w.start).getTime();
      const we = new Date(w.end).getTime();
      // First grid point at or after the window start.
      let t = anchor + Math.ceil((ws - anchor) / stepMs) * stepMs;
      for (; t + durMs <= we; t += stepMs) {
        slots.push({
          startTime: new Date(t).toISOString(),
          endTime: new Date(t + durMs).toISOString(),
          label: fmt.format(new Date(t)),
        });
      }
    }

    return {
      resourceId,
      day: fw.day,
      timezone: fw.timezone,
      durationMinutes,
      requiresApproval: fw.requiresApproval,
      maxAdvanceDays: fw.maxAdvanceDays,
      slots,
    };
  }
}
