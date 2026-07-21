import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { getTenantStore } from '../tenant/tenant-context';
import { MailService } from '../mail/mail.service';
import { NotificationService } from '../notification/notification.service';
import { formatRange } from '../common/tz.util';

@Injectable()
export class ApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly notifications: NotificationService,
    private readonly config: ConfigService,
  ) {}

  private caller() {
    const store = getTenantStore();
    return { userId: store?.userId as string, role: store?.role ?? 'EMPLOYEE' };
  }

  /** Pending steps the caller may act on. */
  listPending() {
    const { userId, role } = this.caller();
    const canSeeUnassigned = role === 'ADMIN' || role === 'APPROVER';
    return this.prisma.scoped.approvalStep.findMany({
      where: {
        decision: 'PENDING',
        ...(canSeeUnassigned
          ? { OR: [{ approverId: userId }, { approverId: null }] }
          : { approverId: userId }),
      },
      include: {
        booking: {
          select: {
            id: true,
            title: true,
            startTime: true,
            endTime: true,
            principalId: true,
            resourceId: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async decide(stepId: string, decision: 'APPROVED' | 'REJECTED', note?: string) {
    const { userId, role } = this.caller();
    const step = await this.prisma.scoped.approvalStep.findUnique({
      where: { id: stepId },
    });
    if (!step) throw new NotFoundException('Approval step not found.');
    if (step.decision !== 'PENDING') {
      throw new BadRequestException('This step has already been decided.');
    }
    const allowed =
      step.approverId === userId ||
      (step.approverId === null && (role === 'ADMIN' || role === 'APPROVER'));
    if (!allowed) {
      throw new ForbiddenException('You are not an approver for this step.');
    }

    await this.prisma.scoped.approvalStep.update({
      where: { id: stepId },
      data: { decision, note: note ?? null, approverId: userId, decidedAt: new Date() },
    });

    // Recompute the booking's status from all of its steps.
    const steps = await this.prisma.scoped.approvalStep.findMany({
      where: { bookingId: step.bookingId },
    });
    let bookingStatus: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING';
    if (steps.some((s) => s.decision === 'REJECTED')) {
      bookingStatus = 'REJECTED';
    } else if (steps.every((s) => s.decision === 'APPROVED')) {
      bookingStatus = 'APPROVED';
    }
    if (bookingStatus !== 'PENDING') {
      await this.prisma.scoped.booking.update({
        where: { id: step.bookingId },
        data: { status: bookingStatus },
      });
    }

    await this.audit.log({
      action: `booking.approval.${decision.toLowerCase()}`,
      entity: 'Booking',
      entityId: step.bookingId,
      metadata: { stepId, level: step.level },
    });

    // Tell the requester once the outcome is final; a booking still waiting on
    // a later level has nothing to report yet.
    if (bookingStatus !== 'PENDING') {
      await this.announceDecision(step.bookingId, bookingStatus, note);
    }

    return { stepId, decision, bookingStatus };
  }

  private async announceDecision(
    bookingId: string,
    status: 'APPROVED' | 'REJECTED',
    note?: string,
  ) {
    const booking = await this.prisma.scoped.booking.findUnique({
      where: { id: bookingId },
      include: {
        resource: { select: { name: true } },
        principal: { select: { email: true, fullName: true } },
      },
    });
    if (!booking?.principal?.email) return;

    const tenantId = getTenantStore()?.tenantId as string;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, timezone: true },
    });
    const when = formatRange(booking.startTime, booking.endTime, tenant?.timezone || 'UTC');
    const approved = status === 'APPROVED';

    await this.notifications.notify(tenantId, booking.principalId, {
      type: 'approval',
      title: approved
        ? `"${booking.title}" was approved`
        : `"${booking.title}" was rejected`,
      deepLink: '/bookings',
    });

    this.mail.send({
      tenantId,
      to: booking.principal.email,
      subject: `${approved ? 'Approved' : 'Rejected'}: ${booking.title}`,
      text: [
        `Hi ${booking.principal.fullName},`,
        '',
        approved
          ? 'Your booking request has been approved.'
          : 'Your booking request was not approved.',
        '',
        `What:  ${booking.title}`,
        `When:  ${when}`,
        `Where: ${booking.resource?.name ?? 'Online'}`,
        ...(note ? ['', `Note from the approver: ${note}`] : []),
      ].join('\n'),
      action: {
        label: 'View my bookings',
        url: `${this.config.get<string>('APP_BASE_URL') || 'https://meetnippon.cosger.online'}/bookings`,
      },
    });
  }
}
