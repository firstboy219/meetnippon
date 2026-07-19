import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlagService } from '../flags/feature-flag.service';
import { runUnscoped } from '../tenant/tenant-context';

interface CalendarEvent {
  bookingId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  organizerId: string;
}

/**
 * Calendar sync scaffold (BRD Phase 5). Gated per-tenant by the `calendar_sync`
 * feature flag. A mock adapter records intent (notification + audit) so the flow
 * is exercisable now; real Microsoft Graph / Google Calendar adapters plug in
 * here once credentials arrive (config.mode === 'live').
 */
@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagService,
  ) {}

  async onBookingCreated(tenantId: string, ev: CalendarEvent): Promise<void> {
    await this.sync(tenantId, 'create', ev);
  }

  async onBookingCancelled(tenantId: string, bookingId: string, organizerId: string): Promise<void> {
    if (!(await this.flags.isEnabled(tenantId, 'calendar_sync'))) return;
    await this.recordIntent(tenantId, organizerId, `Calendar event removed for booking ${bookingId}.`);
  }

  private async sync(tenantId: string, action: 'create', ev: CalendarEvent): Promise<void> {
    if (!(await this.flags.isEnabled(tenantId, 'calendar_sync'))) return;
    const cfg = await this.flags.configFor(tenantId, 'calendar_sync');

    if (cfg.mode === 'live') {
      // TODO: dispatch to Microsoft Graph / Google Calendar adapter (needs creds).
      this.logger.warn(`calendar_sync live mode not yet wired (booking ${ev.bookingId}).`);
      return;
    }
    // mock: record a notification so the effect is observable in-product.
    await this.recordIntent(tenantId, ev.organizerId, `Calendar invite prepared: "${ev.title}".`);
  }

  private async recordIntent(tenantId: string, userId: string, title: string): Promise<void> {
    await runUnscoped(() =>
      this.prisma.notification.create({
        data: { tenantId, userId, type: 'calendar', title },
      }),
    ).catch((e) => this.logger.warn(`calendar intent failed: ${e?.message}`));
  }
}
