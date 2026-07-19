import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { getTenantStore } from '../tenant/tenant-context';

@Injectable()
export class ApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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

    return { stepId, decision, bookingStatus };
  }
}
