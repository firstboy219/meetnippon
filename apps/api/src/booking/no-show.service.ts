import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { MailService } from '../mail/mail.service';
import { runUnscoped } from '../tenant/tenant-context';
import { formatRange } from '../common/tz.util';

/** How often the sweep looks for finished-but-unused bookings. */
const TICK_MS = 5 * 60_000;
/**
 * Only look this far back. Anything older was either already marked or
 * predates the feature — flooding long-gone bookings with warnings on the
 * first deploy would punish people retroactively.
 */
const LOOKBACK_MS = 72 * 3600_000;

/**
 * No-show detection (tester feedback #1): a room was booked, the meeting time
 * passed, and nobody ever checked in — the room sat blocked for nothing.
 *
 * Check-in (from the portal or the QR sticker on the door) is the only usage
 * signal this system has, so "unused" means "never checked in". The sweep
 * stamps `noShowAt` once, warns the booking's owner once, and the admin
 * console filters on the stamp. Same single-instance interval pattern as
 * ReminderService, and disabled by the same env switch in tests.
 */
@Injectable()
export class NoShowService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NoShowService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (process.env.REMINDERS_DISABLED === 'true') {
      this.logger.log('No-show sweep disabled by REMINDERS_DISABLED.');
      return;
    }
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.logger.log(`No-show sweep running every ${TICK_MS / 1000}s.`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass; public so tests drive it directly. Returns bookings marked. */
  async tick(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const candidates = await runUnscoped(() =>
        this.prisma.booking.findMany({
          where: {
            status: 'APPROVED',
            resourceId: { not: null }, // online meetings occupy no room
            endTime: { lt: now, gt: new Date(now.getTime() - LOOKBACK_MS) },
            checkedInAt: null,
            noShowAt: null,
          },
          select: {
            id: true, tenantId: true, title: true, startTime: true, endTime: true,
            principalId: true,
            principal: { select: { email: true, fullName: true } },
            resource: { select: { name: true } },
            tenant: { select: { name: true, timezone: true } },
          },
        }),
      );

      let marked = 0;
      for (const b of candidates) {
        // Conditional update is the claim: if another instance (or a check-in
        // racing the sweep) got here first, skip the warning.
        const claimed = await runUnscoped(() =>
          this.prisma.booking.updateMany({
            where: { id: b.id, noShowAt: null, checkedInAt: null },
            data: { noShowAt: now },
          }),
        );
        if (claimed.count === 0) continue;
        marked += 1;

        await this.notifications.notify(b.tenantId, b.principalId, {
          type: 'warning',
          title: `Room "${b.resource?.name ?? ''}" was booked but never used: ${b.title}`,
          deepLink: '/history',
        });

        if (b.principal?.email) {
          const tz = b.tenant?.timezone || 'UTC';
          this.mail.send({
            tenantId: b.tenantId,
            to: b.principal.email,
            subject: `Unused booking: ${b.title}`,
            text: [
              `Hi ${b.principal.fullName},`,
              '',
              `Your booking ended without anyone checking in, so the room stayed`,
              `blocked while others may have needed it.`,
              '',
              `What:  ${b.title}`,
              `When:  ${formatRange(b.startTime, b.endTime, tz)}`,
              `Where: ${b.resource?.name ?? ''}`,
              '',
              `Please cancel bookings you no longer need, and check in when you`,
              `use a room — repeated no-shows are reported to the admin.`,
            ].join('\n'),
            action: {
              label: 'My booking history',
              url: `${this.config.get<string>('APP_BASE_URL') || 'https://meetnippon.cosger.online'}/history`,
            },
          });
        }
      }
      if (marked) this.logger.log(`Marked ${marked} no-show(s).`);
      return marked;
    } catch (err: any) {
      this.logger.error(`No-show pass failed: ${err?.message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }
}
