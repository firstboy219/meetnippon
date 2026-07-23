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
import { getTenantStore } from '../tenant/tenant-context';
import { formatRange } from '../common/tz.util';

const ACTIVE_STATES = ['PENDING', 'APPROVED', 'WAITLIST'] as const;

export interface CreateChangeRequestInput {
  proposedStartTime?: string;
  proposedEndTime?: string;
  note?: string;
}

/**
 * A colleague's proposal to move someone else's meeting (tester feedback #4).
 *
 * Deliberately NOT an edit path: the requester never touches the booking. The
 * calendar changes only when the author approves, and the approved move goes
 * through BookingService.update() — the same policy/conflict gate as any edit —
 * with the author as the acting user.
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
        resource: { select: { name: true } },
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

    const hasStart = input.proposedStartTime !== undefined;
    const hasEnd = input.proposedEndTime !== undefined;
    if (hasStart !== hasEnd) {
      throw new BadRequestException('Send proposedStartTime and proposedEndTime together.');
    }
    if (!hasStart && !(input.note ?? '').trim()) {
      throw new BadRequestException('Propose a new time, a note, or both.');
    }
    if (hasStart && new Date(input.proposedEndTime!) <= new Date(input.proposedStartTime!)) {
      throw new BadRequestException('Proposed end must be after the proposed start.');
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
        proposedStartTime: hasStart ? new Date(input.proposedStartTime!) : null,
        proposedEndTime: hasEnd ? new Date(input.proposedEndTime!) : null,
        note: (input.note ?? '').trim() || null,
      } as any,
    });

    await this.audit.log({
      action: 'booking.change_request',
      entity: 'BookingChangeRequest',
      entityId: created.id,
      metadata: { bookingId, proposedTime: hasStart },
    });

    // Tell the author (and the delegate who booked it, when different).
    const requester = await this.prisma.scoped.user.findUnique({
      where: { id: userId }, select: { fullName: true, email: true },
    });
    const authorIds = [...new Set([booking.principalId, booking.bookerId])];
    for (const uid of authorIds) {
      await this.notifications.notify(tenantId, uid, {
        type: 'approval',
        title: `${requester?.fullName ?? 'A colleague'} requested a change to "${booking.title}"`,
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
        subject: `Change requested: ${booking.title}`,
        text: [
          `${requester?.fullName ?? 'A colleague'} has asked to change your meeting.`,
          '',
          `Meeting:  ${booking.title}`,
          `Current:  ${formatRange(booking.startTime, booking.endTime, tz)}`,
          ...(created.proposedStartTime
            ? [`Proposed: ${formatRange(created.proposedStartTime, created.proposedEndTime!, tz)}`]
            : []),
          ...(created.note ? ['', `Note: ${created.note}`] : []),
          '',
          'Nothing changes until you approve or decline it.',
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

  async decide(id: string, decision: 'APPROVED' | 'REJECTED', note?: string) {
    const { userId, tenantId } = this.me();
    const req = await this.prisma.scoped.bookingChangeRequest.findUnique({
      where: { id },
      include: { booking: { select: { id: true, title: true, principalId: true, bookerId: true } } },
    });
    if (!req) throw new NotFoundException('Change request not found.');
    if (req.booking.principalId !== userId && req.booking.bookerId !== userId) {
      throw new ForbiddenException('Only the booking author can decide this request.');
    }
    if (req.status !== 'PENDING') {
      throw new BadRequestException('This request has already been decided.');
    }

    // Apply first, record second: if the proposed slot no longer fits (a
    // conflict has appeared since, the meeting ended, policy changed), the
    // author sees the real reason and the request stays PENDING rather than
    // being marked approved with nothing applied.
    if (decision === 'APPROVED' && req.proposedStartTime && req.proposedEndTime) {
      await this.bookings.update(req.booking.id, {
        startTime: req.proposedStartTime.toISOString(),
        endTime: req.proposedEndTime.toISOString(),
      });
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
      metadata: { bookingId: req.booking.id },
    });

    await this.notifications.notify(tenantId, req.requesterId, {
      type: 'approval',
      title: decision === 'APPROVED'
        ? `Your change request for "${req.booking.title}" was approved`
        : `Your change request for "${req.booking.title}" was declined`,
      deepLink: '/calendar',
    });

    return updated;
  }
}
