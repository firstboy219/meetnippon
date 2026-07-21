import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantStore, runUnscoped } from '../tenant/tenant-context';
import {
  Presence, PresenceView, effectivePresence, parsePresenceChoice,
} from './presence.util';

const ACTIVE_BOOKING_STATES = ['APPROVED', 'PENDING'] as const;

@Injectable()
export class PresenceService {
  constructor(private readonly prisma: PrismaService) {}

  private ctx() {
    const s = getTenantStore();
    return { tenantId: s?.tenantId as string, userId: s?.userId as string };
  }

  /**
   * Record that the caller is active. Called on a timer by the portal.
   *
   * Only touches `lastSeenAt` — the visible status is derived on read, so a
   * heartbeat never has to guess whether it should overwrite someone's choice.
   */
  async heartbeat(): Promise<PresenceView> {
    const { userId } = this.ctx();
    await this.prisma.scoped.user.update({
      where: { id: userId },
      data: { lastSeenAt: new Date() },
    });
    return this.mine();
  }

  /** The caller's own effective status. */
  async mine(): Promise<PresenceView & { stored: Presence }> {
    const { userId } = this.ctx();
    const user = await this.prisma.scoped.user.findUnique({
      where: { id: userId },
      select: { id: true, presence: true, presenceManual: true, presenceLocked: true, lastSeenAt: true },
    });
    if (!user) throw new BadRequestException('User not found.');
    const busy = await this.inMeeting([userId]);
    return {
      stored: user.presence as Presence,
      ...effectivePresence({
        stored: user.presence as Presence,
        manual: user.presenceManual,
        locked: user.presenceLocked,
        lastSeenAt: user.lastSeenAt,
        inMeeting: busy.has(userId),
      }),
    };
  }

  /**
   * Set — or clear — a manual status.
   *
   * `AUTO` hands control back to activity detection rather than storing yet
   * another value, which is what the "back to automatic" item does.
   */
  async setMine(choice: string): Promise<PresenceView & { stored: Presence }> {
    const { userId } = this.ctx();
    const parsed = parsePresenceChoice(choice);
    if (!parsed) throw new BadRequestException('Unknown status.');

    const current = await this.prisma.scoped.user.findUnique({
      where: { id: userId },
      select: { presenceLocked: true },
    });
    if (current?.presenceLocked) {
      throw new BadRequestException('Your status is managed by an administrator.');
    }

    await this.prisma.scoped.user.update({
      where: { id: userId },
      data: parsed === 'AUTO'
        ? { presenceManual: false, lastSeenAt: new Date() }
        : { presence: parsed, presenceManual: true, lastSeenAt: new Date() },
    });
    return this.mine();
  }

  /**
   * Which of these users are in a meeting right now.
   *
   * One query for the whole set — this runs on every chat list and directory
   * render, so a per-user lookup would not survive contact with a real tenant.
   */
  async inMeeting(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const now = new Date();
    const rows = await this.prisma.scoped.booking.findMany({
      where: {
        principalId: { in: userIds },
        status: { in: ACTIVE_BOOKING_STATES as any },
        startTime: { lte: now },
        endTime: { gt: now },
      },
      select: { principalId: true },
    });
    return new Set(rows.map((r) => r.principalId));
  }

  /**
   * Effective presence for a set of users, ready to attach to a list.
   * Runs unscoped so it can be used off the request path too.
   */
  async viewFor(userIds: string[]): Promise<Map<string, PresenceView>> {
    const out = new Map<string, PresenceView>();
    if (userIds.length === 0) return out;

    const tenantId = getTenantStore()?.tenantId;
    const users = await runUnscoped(() =>
      this.prisma.user.findMany({
        where: { id: { in: userIds }, ...(tenantId ? { tenantId } : {}) },
        select: {
          id: true, presence: true, presenceManual: true,
          presenceLocked: true, lastSeenAt: true,
        },
      }),
    );
    const busy = await this.inMeeting(users.map((u) => u.id));
    for (const u of users) {
      out.set(u.id, effectivePresence({
        stored: u.presence as Presence,
        manual: u.presenceManual,
        locked: u.presenceLocked,
        lastSeenAt: u.lastSeenAt,
        inMeeting: busy.has(u.id),
      }));
    }
    return out;
  }
}
