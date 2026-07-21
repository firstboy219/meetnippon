import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { MailService } from '../mail/mail.service';
import { runUnscoped } from '../tenant/tenant-context';
import { formatRange } from '../common/tz.util';

export interface ReminderSpec {
  /** Minutes before the start to fire. */
  offsetMinutes: number;
  /** 'app' writes a notification; 'email' also sends mail. */
  channel?: 'app' | 'email';
}

/** How often the dispatcher looks for work. */
const TICK_MS = 60_000;
/** Only consider bookings starting within this window — keeps the query small. */
const HORIZON_MIN = 24 * 60;

/**
 * Delivers booking reminders.
 *
 * Reminders were being persisted long before anything sent them, so a user who
 * asked for "15 minutes before" got nothing. This is the piece that makes the
 * setting mean something.
 *
 * A plain interval rather than a queue: the work is a single indexed query per
 * minute over one tenant-scoped table, and introducing a broker for that would
 * add an operational dependency this deployment does not otherwise need. If it
 * ever needs to survive multi-instance deployment, the claim below is the part
 * to move into Redis.
 */
@Injectable()
export class ReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    // Disabled in tests, where a background timer would leak between suites.
    if (process.env.REMINDERS_DISABLED === 'true') {
      this.logger.log('Reminder dispatcher disabled by REMINDERS_DISABLED.');
      return;
    }
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.logger.log(`Reminder dispatcher running every ${TICK_MS / 1000}s.`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * One pass. Public so a test can drive it deterministically instead of
   * waiting on wall-clock time.
   */
  async tick(now = new Date()): Promise<number> {
    // A slow pass must not overlap the next tick and double-send.
    if (this.running) return 0;
    this.running = true;
    try {
      const horizon = new Date(now.getTime() + HORIZON_MIN * 60_000);
      const due = await runUnscoped(() =>
        this.prisma.booking.findMany({
          where: {
            status: { in: ['APPROVED', 'PENDING'] },
            startTime: { gt: now, lte: horizon },
            NOT: { reminders: { equals: [] } },
          },
          select: {
            id: true, tenantId: true, title: true, startTime: true, endTime: true,
            reminders: true, remindersSent: true, principalId: true, resourceId: true,
            principal: { select: { email: true, fullName: true } },
            resource: { select: { name: true } },
            tenant: { select: { name: true, timezone: true } },
          },
        }),
      );

      let sent = 0;
      for (const b of due) {
        const specs = (b.reminders as unknown as ReminderSpec[]) ?? [];
        const already = new Set((b.remindersSent as unknown as number[]) ?? []);

        for (const spec of specs) {
          const offset = Number(spec?.offsetMinutes);
          if (!Number.isFinite(offset) || offset <= 0) continue;
          if (already.has(offset)) continue;

          const fireAt = b.startTime.getTime() - offset * 60_000;
          // Fire once the moment has passed. A missed tick still delivers on
          // the next one — late is better than never for a reminder.
          if (now.getTime() < fireAt) continue;

          await this.deliver(b, spec, offset);
          already.add(offset);
          sent += 1;
        }

        if (already.size !== ((b.remindersSent as unknown as number[]) ?? []).length) {
          await runUnscoped(() =>
            this.prisma.booking.update({
              where: { id: b.id },
              data: { remindersSent: [...already] as any },
            }),
          );
        }
      }
      if (sent) this.logger.log(`Delivered ${sent} reminder(s).`);
      return sent;
    } catch (err: any) {
      // A dispatcher that throws stops running; log and let the next tick retry.
      this.logger.error(`Reminder pass failed: ${err?.message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  private async deliver(b: any, spec: ReminderSpec, offset: number) {
    const tz = b.tenant?.timezone || 'UTC';
    const when = formatRange(b.startTime, b.endTime, tz);
    const where = b.resource?.name ?? 'Online';
    const human = offset >= 60 && offset % 60 === 0
      ? `${offset / 60} hour${offset === 60 ? '' : 's'}`
      : `${offset} minutes`;

    await this.notifications.notify(b.tenantId, b.principalId, {
      type: 'reminder',
      title: `In ${human}: ${b.title}`,
      deepLink: '/bookings',
    });

    if (spec.channel === 'email' && b.principal?.email) {
      this.mail.send({
        tenantId: b.tenantId,
        to: b.principal.email,
        subject: `Reminder: ${b.title} in ${human}`,
        text: [
          `Hi ${b.principal.fullName},`,
          '',
          `This is a reminder that your meeting starts in ${human}.`,
          '',
          `What:  ${b.title}`,
          `When:  ${when}`,
          `Where: ${where}`,
        ].join('\n'),
        action: {
          label: 'View my bookings',
          url: `${this.config.get<string>('APP_BASE_URL') || 'https://meetnippon.cosger.online'}/bookings`,
        },
      });
    }
  }
}
