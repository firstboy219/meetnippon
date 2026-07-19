import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlagService } from '../flags/feature-flag.service';
import { getTenantStore, runUnscoped } from '../tenant/tenant-context';

export interface NotifyInput {
  type: string; // reminder | approval | mention | recording_ready | ops | calendar | wfh
  title: string;
  deepLink?: string;
}

/**
 * Central notification writer. Always creates an in-app notification; when the
 * tenant's `whatsapp` flag is enabled it also dispatches over the WhatsApp
 * channel (mock until Business API creds arrive — Phase 6 escalation).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagService,
  ) {}

  async notify(tenantId: string, userId: string, input: NotifyInput): Promise<void> {
    await runUnscoped(() =>
      this.prisma.notification.create({
        data: { tenantId, userId, type: input.type, title: input.title, deepLink: input.deepLink ?? null },
      }),
    );
    if (await this.flags.isEnabled(tenantId, 'whatsapp')) {
      await this.dispatchWhatsApp(tenantId, userId, input);
    }
  }

  private async dispatchWhatsApp(tenantId: string, userId: string, input: NotifyInput) {
    const cfg = await this.flags.configFor(tenantId, 'whatsapp');
    if (cfg.mode === 'live') {
      // TODO: WhatsApp Business API send (needs phone-number id + token).
      this.logger.warn(`whatsapp live mode not yet wired (user ${userId}).`);
      return;
    }
    this.logger.log(`[wa:mock] -> ${userId}: ${input.title}`);
  }

  // ---- current-user surface (tenant-scoped) ----
  list() {
    const userId = getTenantStore()?.userId as string;
    return this.prisma.scoped.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async unreadCount() {
    const userId = getTenantStore()?.userId as string;
    const count = await this.prisma.scoped.notification.count({ where: { userId, isRead: false } });
    return { count };
  }

  async markRead(id: string) {
    const found = await this.prisma.scoped.notification.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Notification not found.');
    await this.prisma.scoped.notification.update({ where: { id }, data: { isRead: true } });
    return { updated: true };
  }

  async markAllRead() {
    const userId = getTenantStore()?.userId as string;
    await this.prisma.scoped.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
    return { updated: true };
  }
}
