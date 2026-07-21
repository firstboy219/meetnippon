import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { FeatureFlagService } from '../flags/feature-flag.service';
import { getTenantStore } from '../tenant/tenant-context';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { PresenceService } from '../presence/presence.service';

/** Internal chat (BRD 7.12), gated by the `chat` feature flag. */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly flags: FeatureFlagService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly presence: PresenceService,
  ) {}

  private ctx() {
    const s = getTenantStore();
    return { tenantId: s?.tenantId as string, userId: s?.userId as string };
  }

  private async ensureEnabled() {
    const { tenantId } = this.ctx();
    if (!(await this.flags.isEnabled(tenantId, 'chat'))) {
      throw new ForbiddenException('Chat is not enabled for this workspace.');
    }
  }

  private async assertMember(conversationId: string) {
    const { userId } = this.ctx();
    const m = await this.prisma.scoped.chatMember.findFirst({ where: { conversationId, userId } });
    if (!m) throw new ForbiddenException('You are not a member of this conversation.');
  }

  async listConversations() {
    await this.ensureEnabled();
    const { userId } = this.ctx();
    const memberships = await this.prisma.scoped.chatMember.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true, fullName: true, email: true, department: true,
                    presence: true, lastSeenAt: true,
                  },
                },
              },
            },
            messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
    });

    // One grouped count for every conversation rather than a query per row.
    const unreadRows = await Promise.all(
      memberships.map(async (m) => ({
        id: m.conversationId,
        n: await this.prisma.scoped.chatMessage.count({
          where: {
            conversationId: m.conversationId,
            senderId: { not: userId },
            ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
          },
        }),
      })),
    );
    const unread = new Map(unreadRows.map((r) => [r.id, r.n]));

    // Decorate with derived presence: the stored column goes stale the moment
    // someone closes their laptop.
    const everyone = [...new Set(
      memberships.flatMap((m) => (m.conversation as any).members.map((x: any) => x.userId)),
    )] as string[];
    const presence = await this.presence.viewFor(everyone);
    const withPresence = (u: any) => ({
      ...u,
      presence: presence.get(u.id)?.presence ?? 'OFFLINE',
      presenceReason: presence.get(u.id)?.reason ?? null,
    });

    return memberships
      .map((m) => {
        const c = m.conversation as any;
        const others = c.members
          .filter((x: any) => x.userId !== userId)
          .map((x: any) => withPresence(x.user));
        return {
          id: c.id,
          isGroup: c.isGroup,
          name: c.isGroup ? c.name : others[0]?.fullName ?? 'Direct message',
          members: c.members.map((x: any) => withPresence(x.user)),
          others,
          lastMessage: c.messages[0] ?? null,
          unread: unread.get(c.id) ?? 0,
          muted: m.muted,
          updatedAt: c.updatedAt,
        };
      })
      // Most recently active first — a chat list ordered any other way is noise.
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  /** Mark everything up to now as read for the caller. */
  async markRead(conversationId: string) {
    await this.ensureEnabled();
    await this.assertMember(conversationId);
    const { userId } = this.ctx();
    const member = await this.prisma.scoped.chatMember.findFirst({
      where: { conversationId, userId },
    });
    if (!member) return { ok: false };
    await this.prisma.scoped.chatMember.update({
      where: { id: member.id },
      // Clearing the nudge timestamp too, so the next quiet period can email again.
      data: { lastReadAt: new Date(), lastNotifiedAt: null },
    });
    return { ok: true };
  }

  async setMuted(conversationId: string, muted: boolean) {
    await this.ensureEnabled();
    await this.assertMember(conversationId);
    const { userId } = this.ctx();
    const member = await this.prisma.scoped.chatMember.findFirst({ where: { conversationId, userId } });
    if (!member) throw new NotFoundException('Not a member.');
    await this.prisma.scoped.chatMember.update({ where: { id: member.id }, data: { muted } });
    return { muted };
  }

  /** Total unread across every conversation — drives the nav badge. */
  async unreadCount() {
    const { tenantId, userId } = this.ctx();
    if (!(await this.flags.isEnabled(tenantId, 'chat'))) return { count: 0 };
    const members = await this.prisma.scoped.chatMember.findMany({ where: { userId } });
    let count = 0;
    for (const m of members) {
      count += await this.prisma.scoped.chatMessage.count({
        where: {
          conversationId: m.conversationId,
          senderId: { not: userId },
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
      });
    }
    return { count };
  }

  async createDirect(otherUserId: string) {
    await this.ensureEnabled();
    const { userId } = this.ctx();
    if (otherUserId === userId) throw new BadRequestException('Cannot DM yourself.');
    const other = await this.prisma.scoped.user.findUnique({ where: { id: otherUserId } });
    if (!other) throw new NotFoundException('User not found.');

    // Reuse an existing 1:1 conversation if present.
    const mine = await this.prisma.scoped.chatMember.findMany({
      where: { userId },
      include: { conversation: { include: { members: true } } },
    });
    const existing = mine
      .map((m) => m.conversation as any)
      .find((c: any) => !c.isGroup && c.members.length === 2 && c.members.some((x: any) => x.userId === otherUserId));
    if (existing) return existing;

    const conv = await this.prisma.scoped.chatConversation.create({ data: { isGroup: false } as any });
    await this.prisma.scoped.chatMember.createMany({
      data: [
        { conversationId: conv.id, userId },
        { conversationId: conv.id, userId: otherUserId },
      ] as any,
    });
    return conv;
  }

  async createGroup(name: string, memberIds: string[]) {
    await this.ensureEnabled();
    const { userId } = this.ctx();
    const ids = Array.from(new Set([userId, ...memberIds]));
    const conv = await this.prisma.scoped.chatConversation.create({ data: { isGroup: true, name } as any });
    await this.prisma.scoped.chatMember.createMany({
      data: ids.map((uid) => ({ conversationId: conv.id, userId: uid })) as any,
    });
    return conv;
  }

  async getMessages(conversationId: string) {
    await this.ensureEnabled();
    await this.assertMember(conversationId);
    return this.prisma.scoped.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: { sender: { select: { id: true, fullName: true } } },
    });
  }

  async sendMessage(conversationId: string, body: string) {
    await this.ensureEnabled();
    await this.assertMember(conversationId);
    const { tenantId, userId } = this.ctx();
    const message = await this.prisma.scoped.chatMessage.create({
      data: { conversationId, senderId: userId, body } as any,
      include: { sender: { select: { id: true, fullName: true } } },
    });
    await this.prisma.scoped.chatConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

    const members = await this.prisma.scoped.chatMember.findMany({
      where: { conversationId },
      include: { user: { select: { id: true, fullName: true, email: true, presence: true, lastSeenAt: true } } },
    });
    const sender = members.find((m) => m.userId === userId)?.user;
    const recipients = members.filter((m) => m.userId !== userId);

    // In-app first: it is instant and free.
    await Promise.all(
      recipients.map((m) => this.notifications.notify(tenantId, m.userId, {
        type: 'mention',
        title: `${sender?.fullName ?? 'Someone'}: ${body.slice(0, 60)}`,
        deepLink: `/chat?c=${conversationId}`,
      })),
    );

    await this.emailAbsentRecipients(conversationId, recipients as any, sender?.fullName ?? 'A colleague', body);
    return message;
  }

  /**
   * Email people who are not around to see the message.
   *
   * Two rules keep this from becoming spam:
   *  - only when the recipient is actually away (presence OFFLINE, or no
   *    heartbeat for AWAY_AFTER_MIN);
   *  - at most one email per conversation per QUIET_MIN, so a burst of twenty
   *    messages produces one nudge, not twenty. `lastNotifiedAt` is cleared
   *    when they read the thread, so the next quiet period can nudge again.
   *
   * The body is deliberately not included — an email is a poor place for chat
   * content, and it may be read on a device the workspace does not control.
   */
  private async emailAbsentRecipients(
    conversationId: string,
    recipients: {
      id: string; userId: string; lastNotifiedAt: Date | null;
      muted: boolean;
      user: { fullName: string; email: string; presence: string; lastSeenAt: Date | null };
    }[],
    senderName: string,
    preview: string,
  ) {
    const AWAY_AFTER_MIN = 5;
    const QUIET_MIN = 15;
    const now = Date.now();
    const tenantId = getTenantStore()?.tenantId as string;

    for (const m of recipients) {
      if (m.muted) continue;
      const seen = m.user.lastSeenAt ? now - new Date(m.user.lastSeenAt).getTime() : Infinity;
      const away = m.user.presence === 'OFFLINE' || seen > AWAY_AFTER_MIN * 60_000;
      if (!away) continue;

      // Claim the nudge atomically. Reading `lastNotifiedAt` and then writing it
      // would let two messages sent in the same instant both see "no recent
      // nudge" and both send — the conditional updateMany makes exactly one win.
      const cutoff = new Date(now - QUIET_MIN * 60_000);
      const claimed = await this.prisma.scoped.chatMember.updateMany({
        where: {
          id: m.id,
          OR: [{ lastNotifiedAt: null }, { lastNotifiedAt: { lt: cutoff } }],
        },
        data: { lastNotifiedAt: new Date() },
      });
      if (claimed.count === 0) continue;

      this.mail.send({
        tenantId,
        to: m.user.email,
        subject: `${senderName} sent you a message`,
        text: [
          `Hi ${m.user.fullName},`,
          '',
          `${senderName} sent you a message on MeetNippon while you were away.`,
          '',
          `“${preview.slice(0, 140)}${preview.length > 140 ? '…' : ''}”`,
          '',
          'Open the chat to read it and reply.',
        ].join('\n'),
        action: {
          label: 'Open chat',
          url: `${this.config.get<string>('APP_BASE_URL') || 'https://meetnippon.cosger.online'}/chat?c=${conversationId}`,
        },
      });
    }
  }
}
