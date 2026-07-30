import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
import { MailService } from '../mail/mail.service';
import { BookingService } from './booking.service';
import { getTenantStore, runWithTenant } from '../tenant/tenant-context';
import { formatRange } from '../common/tz.util';

const ACTIVE_STATES = ['PENDING', 'APPROVED', 'WAITLIST'] as const;

export interface ChangeRequestParticipant {
  userId?: string;
  email: string;
  external?: boolean;
}

export interface ChangeRequestDraft {
  title: string;
  description?: string;
  type?: 'OFFLINE' | 'ONLINE' | 'HYBRID';
  meetingLink?: string;
  startTime: string;
  endTime: string;
  participants?: ChangeRequestParticipant[];
  notify?: boolean;
}

export interface CreateChangeRequestInput {
  requestedStartTime: string;
  requestedEndTime: string;
  draft: ChangeRequestDraft;
  note?: string;
}

/**
 * A colleague asking to carve a slice out of someone else's booking so their
 * own meeting can exist too (tester feedback #4, extended).
 *
 * Nothing is booked for either side up front. The calendar changes only when
 * the author decides, and every booking this produces — the author's moved
 * meeting, the requester's — goes through BookingService's normal
 * create/update gate, same policy/conflict checks as any booking.
 */
@Injectable()
export class ChangeRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly mail: MailService,
    private readonly bookings: BookingService,
    private readonly config: ConfigService,
  ) {}

  private me() {
    const store = getTenantStore();
    return { userId: store?.userId as string, tenantId: store?.tenantId as string };
  }

  private appBaseUrl(): string {
    return this.config.get<string>('APP_BASE_URL') || 'https://meetnippon.cosger.online';
  }

  async create(bookingId: string, input: CreateChangeRequestInput) {
    const { userId, tenantId } = this.me();
    const booking = await this.prisma.scoped.booking.findUnique({
      where: { id: bookingId },
      include: {
        principal: { select: { id: true, email: true, fullName: true } },
        resource: { select: { id: true, name: true } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found.');
    if (booking.principalId === userId || booking.bookerId === userId) {
      throw new BadRequestException('This is your own booking — edit it directly.');
    }
    if (!(ACTIVE_STATES as readonly string[]).includes(booking.status)) {
      throw new BadRequestException(`A ${booking.status.toLowerCase()} booking cannot be changed.`);
    }
    if (booking.endTime <= new Date()) {
      throw new BadRequestException('This booking has already ended.');
    }
    if (!booking.resourceId) {
      throw new BadRequestException('This booking has no room to negotiate over.');
    }

    const reqStart = new Date(input.requestedStartTime);
    const reqEnd = new Date(input.requestedEndTime);
    if (Number.isNaN(reqStart.getTime()) || Number.isNaN(reqEnd.getTime()) || reqEnd <= reqStart) {
      throw new BadRequestException('Requested end must be after the requested start.');
    }
    if (reqStart < booking.startTime || reqEnd > booking.endTime) {
      throw new BadRequestException('The requested window must fall within the existing booking.');
    }

    const d = input.draft;
    if (!d?.title?.trim()) throw new BadRequestException('Your meeting needs a title.');
    const draftStart = new Date(d.startTime);
    const draftEnd = new Date(d.endTime);
    if (Number.isNaN(draftStart.getTime()) || Number.isNaN(draftEnd.getTime()) || draftEnd <= draftStart) {
      throw new BadRequestException("Your meeting's end must be after its start.");
    }
    if (reqStart >= draftEnd || reqEnd <= draftStart) {
      throw new BadRequestException('The requested window must overlap your own meeting.');
    }
    // Must land on one edge of the requester's own wanted range — otherwise a
    // decline could not shrink it down to a single contiguous fallback.
    const touchesStart = reqStart.getTime() === draftStart.getTime();
    const touchesEnd = reqEnd.getTime() === draftEnd.getTime();
    if (!touchesStart && !touchesEnd) {
      throw new BadRequestException(
        'The requested window must start from, or run to, the edge of your own meeting.',
      );
    }

    // One open request per requester per booking — resubmitting while the
    // author has not answered would just stack duplicates in their queue.
    const open = await this.prisma.scoped.bookingChangeRequest.count({
      where: { bookingId, requesterId: userId, status: 'PENDING' },
    });
    if (open > 0) {
      throw new BadRequestException('You already have a pending request on this booking.');
    }

    const created = await this.prisma.scoped.bookingChangeRequest.create({
      data: {
        bookingId,
        requesterId: userId,
        requestedStartTime: reqStart,
        requestedEndTime: reqEnd,
        draftTitle: d.title.trim(),
        draftDescription: d.description?.trim() || null,
        draftType: (d.type ?? 'OFFLINE') as any,
        draftMeetingLink: d.meetingLink?.trim() || null,
        draftStartTime: draftStart,
        draftEndTime: draftEnd,
        draftParticipants: (d.participants ?? []) as any,
        draftNotify: d.notify !== false,
        note: (input.note ?? '').trim() || null,
      } as any,
    });

    await this.audit.log({
      action: 'booking.change_request',
      entity: 'BookingChangeRequest',
      entityId: created.id,
      metadata: {
        bookingId,
        requestedStart: reqStart.toISOString(),
        requestedEnd: reqEnd.toISOString(),
      },
    });

    // Tell the author (and the delegate who booked it, when different).
    const requester = await this.prisma.scoped.user.findUnique({
      where: { id: userId }, select: { fullName: true, email: true },
    });
    const authorIds = [...new Set([booking.principalId, booking.bookerId])];
    for (const uid of authorIds) {
      await this.notifications.notify(tenantId, uid, {
        type: 'approval',
        title: `${requester?.fullName ?? 'A colleague'} requested part of "${booking.title}"`,
        deepLink: '/approvals',
      });
    }
    if (booking.principal?.email) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId }, select: { name: true, timezone: true },
      });
      const tz = tenant?.timezone || 'UTC';
      this.mail.send({
        tenantId,
        to: booking.principal.email,
        subject: `Room requested: ${booking.title}`,
        text: [
          `${requester?.fullName ?? 'A colleague'} needs part of your meeting's room time for "${d.title.trim()}".`,
          '',
          `Your meeting:  ${booking.title}`,
          `Current:       ${formatRange(booking.startTime, booking.endTime, tz)}`,
          `They need:     ${formatRange(reqStart, reqEnd, tz)}`,
          ...(created.note ? ['', `Note: ${created.note}`] : []),
          '',
          'Approve to move your own meeting to a new time and free that window up,',
          'or decline to keep your meeting where it is.',
        ].join('\n'),
        action: { label: 'Review the request', url: `${this.appBaseUrl()}/approvals` },
      });
    }

    return created;
  }

  /** Pending requests on bookings the caller owns — their queue to decide. */
  listIncoming() {
    const { userId } = this.me();
    return this.prisma.scoped.bookingChangeRequest.findMany({
      where: {
        status: 'PENDING',
        booking: { OR: [{ principalId: userId }, { bookerId: userId }] },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        booking: {
          select: {
            id: true, title: true, startTime: true, endTime: true, status: true,
            resourceId: true,
            resource: { select: { name: true } },
          },
        },
        requester: { select: { fullName: true, email: true } },
      },
    });
  }

  /** The caller's own requests, so they can see what happened to them. */
  listMine() {
    const { userId } = this.me();
    return this.prisma.scoped.bookingChangeRequest.findMany({
      where: { requesterId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        booking: { select: { id: true, title: true, startTime: true, endTime: true } },
      },
    });
  }

  async decide(
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    note?: string,
    ownerNewStartTime?: string,
    ownerNewEndTime?: string,
  ) {
    const { userId, tenantId } = this.me();
    const req = await this.prisma.scoped.bookingChangeRequest.findUnique({
      where: { id },
      include: {
        booking: {
          select: { id: true, title: true, principalId: true, bookerId: true, resourceId: true },
        },
      },
    });
    if (!req) throw new NotFoundException('Change request not found.');
    if (req.booking.principalId !== userId && req.booking.bookerId !== userId) {
      throw new ForbiddenException('Only the booking author can decide this request.');
    }
    if (req.status !== 'PENDING') {
      throw new BadRequestException('This request has already been decided.');
    }

    const requester = await this.prisma.scoped.user.findUnique({
      where: { id: req.requesterId },
      select: { id: true, role: true },
    });
    if (!requester) throw new NotFoundException('The requester no longer exists.');

    const draftInput = {
      title: req.draftTitle,
      description: req.draftDescription ?? undefined,
      type: req.draftType as any,
      meetingLink: req.draftMeetingLink ?? undefined,
      resourceId: req.booking.resourceId ?? undefined,
      participants: (req.draftParticipants as any) ?? [],
      notify: req.draftNotify,
    };
    const asRequester = <T>(fn: () => Promise<T>) =>
      runWithTenant({ tenantId, userId: requester.id, role: requester.role }, fn);

    let autoBooked: { start: Date; end: Date } | null = null;
    let autoBookFailure: string | null = null;

    // Apply first, record second: if a new time no longer fits (a conflict
    // has appeared since, the meeting ended, policy changed), the author
    // sees the real reason and the request stays PENDING rather than being
    // marked decided with nothing actually applied.
    if (decision === 'APPROVED') {
      if (!ownerNewStartTime || !ownerNewEndTime) {
        throw new BadRequestException('Pick a new time for your own meeting to approve this request.');
      }
      const newStart = new Date(ownerNewStartTime);
      const newEnd = new Date(ownerNewEndTime);
      if (Number.isNaN(newStart.getTime()) || Number.isNaN(newEnd.getTime()) || newEnd <= newStart) {
        throw new BadRequestException('New end must be after the new start.');
      }
      // The requester's future booking does not exist yet, so the normal
      // conflict check inside bookings.update() cannot see the window being
      // granted — guard it explicitly.
      if (newStart < req.requestedEndTime && newEnd > req.requestedStartTime) {
        throw new BadRequestException('That time still overlaps the window you are granting.');
      }

      await this.bookings.update(req.booking.id, {
        startTime: newStart.toISOString(),
        endTime: newEnd.toISOString(),
      });

      await asRequester(() => this.bookings.create({
        ...draftInput,
        startTime: req.draftStartTime.toISOString(),
        endTime: req.draftEndTime.toISOString(),
      } as any));
      autoBooked = { start: req.draftStartTime, end: req.draftEndTime };
    } else {
      // Declined: the requester's meeting is created automatically at the
      // fallback range — their wanted range with the granted slice trimmed
      // off the edge it touched.
      const touchesStart = req.requestedStartTime.getTime() === req.draftStartTime.getTime();
      const fallbackStart = touchesStart ? req.requestedEndTime : req.draftStartTime;
      const fallbackEnd = touchesStart ? req.draftEndTime : req.requestedStartTime;

      if (fallbackEnd > fallbackStart) {
        try {
          await asRequester(() => this.bookings.create({
            ...draftInput,
            startTime: fallbackStart.toISOString(),
            endTime: fallbackEnd.toISOString(),
          } as any));
          autoBooked = { start: fallbackStart, end: fallbackEnd };
        } catch (err: any) {
          autoBookFailure = err?.message ?? 'Could not book the remaining time.';
        }
      }
    }

    const updated = await this.prisma.scoped.bookingChangeRequest.update({
      where: { id },
      data: {
        status: decision,
        decisionNote: (note ?? '').trim() || null,
        decidedAt: new Date(),
      },
    });

    await this.audit.log({
      action: `booking.change_request.${decision.toLowerCase()}`,
      entity: 'BookingChangeRequest',
      entityId: id,
      metadata: {
        bookingId: req.booking.id,
        autoBooked: autoBooked
          ? { start: autoBooked.start.toISOString(), end: autoBooked.end.toISOString() }
          : null,
        autoBookFailure,
      },
    });

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId }, select: { timezone: true },
    });
    const tz = tenant?.timezone || 'UTC';
    let title: string;
    if (decision === 'APPROVED') {
      title = `Approved — "${req.draftTitle}" is booked for ${formatRange(autoBooked!.start, autoBooked!.end, tz)}`;
    } else if (autoBooked) {
      title = `Declined — "${req.draftTitle}" was booked for ${formatRange(autoBooked.start, autoBooked.end, tz)} instead`;
    } else if (autoBookFailure) {
      title = `Declined — "${req.draftTitle}" could not be booked automatically (${autoBookFailure})`;
    } else {
      title = `Declined — "${req.booking.title}" request`;
    }
    await this.notifications.notify(tenantId, req.requesterId, {
      type: 'approval',
      title,
      deepLink: '/calendar',
    });

    return updated;
  }
}
