import {
  Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
import { getTenantStore, runUnscoped } from '../tenant/tenant-context';
import { CreateExternalTaskDto, DecideExternalTaskDto } from './dto/approval-hub.dto';

/**
 * Universal Approval Hub (BRD 7.14): a single inbox for approval requests
 * pushed from other platforms (PR systems, doc sign-off, …). Decisions can
 * fire a callback webhook back to the source system.
 */
@Injectable()
export class ApprovalHubService {
  private readonly logger = new Logger(ApprovalHubService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  private async currentUser() {
    const userId = getTenantStore()?.userId as string;
    const user = await this.prisma.scoped.user.findUnique({ where: { id: userId } });
    if (!user) throw new ForbiddenException();
    return user;
  }

  async create(dto: CreateExternalTaskDto) {
    const tenantId = getTenantStore()?.tenantId as string;
    const approverEmail = dto.approverEmail.trim().toLowerCase();
    const task = await this.prisma.scoped.externalApprovalTask.create({
      data: {
        category: dto.category,
        title: dto.title,
        body: dto.body ?? null,
        requesterName: dto.requesterName ?? null,
        sourcePlatform: dto.sourcePlatform ?? null,
        approverEmail,
        callbackUrl: dto.callbackUrl ?? null,
        callbackStatus: dto.callbackUrl ? 'PENDING' : 'NONE',
      } as any,
    });

    // Notify the approver if they exist in this tenant.
    const approver = await runUnscoped(() =>
      this.prisma.user.findUnique({ where: { tenantId_email: { tenantId, email: approverEmail } } }),
    );
    if (approver) {
      await this.notifications.notify(tenantId, approver.id, {
        type: 'approval', title: `Approval requested: ${dto.title}`, deepLink: '/approvals',
      });
    }
    await this.audit.log({ action: 'approval_hub.create', entity: 'ExternalApprovalTask', entityId: task.id, metadata: { category: dto.category } });
    return task;
  }

  async listForApprover() {
    const user = await this.currentUser();
    return this.prisma.scoped.externalApprovalTask.findMany({
      where: { approverEmail: user.email },
      orderBy: { createdAt: 'desc' },
    });
  }

  async decide(id: string, dto: DecideExternalTaskDto) {
    const user = await this.currentUser();
    const task = await this.prisma.scoped.externalApprovalTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found.');
    if (task.decision !== 'PENDING') throw new BadRequestException('Already decided.');
    if (task.approverEmail !== user.email && user.role !== 'ADMIN') {
      throw new ForbiddenException('You are not the assigned approver.');
    }

    let callbackStatus = task.callbackStatus;
    let callbackAttempts = task.callbackAttempts;
    if (task.callbackUrl) {
      // Mock delivery (real HTTP POST wired when source-system creds/URLs are trusted).
      callbackAttempts += 1;
      callbackStatus = 'SENT';
      this.logger.log(`[callback:mock] ${task.callbackUrl} <- ${dto.decision}`);
    }

    const updated = await this.prisma.scoped.externalApprovalTask.update({
      where: { id },
      data: { decision: dto.decision, note: dto.note ?? null, decidedAt: new Date(), callbackStatus, callbackAttempts },
    });
    await this.audit.log({ action: `approval_hub.${dto.decision.toLowerCase()}`, entity: 'ExternalApprovalTask', entityId: id });
    return updated;
  }
}
