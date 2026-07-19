import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FeatureFlagService } from '../flags/feature-flag.service';
import { NotificationService } from '../notification/notification.service';
import { getTenantStore } from '../tenant/tenant-context';

/**
 * Meeting recording (BRD 7.8). Flag-gated by `recording`. In mock mode a
 * recording is produced immediately with a placeholder transcript so the flow
 * is exercisable; live mode (real media + Speech-to-Text) is a Phase 6
 * escalation pending STT credentials.
 */
@Injectable()
export class RecordingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly flags: FeatureFlagService,
    private readonly notifications: NotificationService,
  ) {}

  async request(bookingId: string) {
    const tenantId = getTenantStore()?.tenantId as string;
    if (!(await this.flags.isEnabled(tenantId, 'recording'))) {
      throw new BadRequestException('Recording is not enabled for this workspace.');
    }
    const booking = await this.prisma.scoped.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found.');

    const cfg = await this.flags.configFor(tenantId, 'recording');
    const live = cfg.mode === 'live';
    const retentionDays = Number(cfg.retentionDays) > 0 ? Number(cfg.retentionDays) : 30;
    const retentionUntil = new Date(Date.now() + retentionDays * 86400000);

    const data = live
      ? { status: 'PROCESSING' as const, mediaUrl: null, transcript: null, retentionUntil }
      : {
          status: 'READY' as const,
          mediaUrl: `mock://recordings/${bookingId}.mp4`,
          transcript: `[mock transcript] Notes for "${booking.title}". Replace with Speech-to-Text output in live mode.`,
          retentionUntil,
        };

    const existing = await this.prisma.scoped.recording.findFirst({ where: { bookingId } });
    const rec = existing
      ? await this.prisma.scoped.recording.update({ where: { id: existing.id }, data })
      : await this.prisma.scoped.recording.create({ data: { bookingId, ...data } as any });

    await this.prisma.scoped.booking.update({ where: { id: bookingId }, data: { recordingRequested: true } });
    if (!live) {
      await this.notifications.notify(tenantId, booking.principalId, {
        type: 'recording_ready', title: `Recording ready: ${booking.title}`, deepLink: '/bookings',
      });
    }
    await this.audit.log({ action: 'recording.request', entity: 'Recording', entityId: rec.id, metadata: { mode: live ? 'live' : 'mock' } });
    return rec;
  }

  async get(bookingId: string) {
    const rec = await this.prisma.scoped.recording.findFirst({ where: { bookingId } });
    if (!rec) throw new NotFoundException('No recording for this booking.');
    return rec;
  }
}
