import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { FeatureFlagService } from '../flags/feature-flag.service';
import { getTenantStore } from '../tenant/tenant-context';

/** Internal chat (BRD 7.12), gated by the `chat` feature flag. */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly flags: FeatureFlagService,
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
            members: { include: { user: { select: { id: true, fullName: true, presence: true } } } },
            messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
    });
    return memberships.map((m) => {
      const c = m.conversation as any;
      const others = c.members.filter((x: any) => x.userId !== userId).map((x: any) => x.user);
      return {
        id: c.id,
        isGroup: c.isGroup,
        name: c.isGroup ? c.name : others[0]?.fullName ?? 'Direct message',
        members: c.members.map((x: any) => x.user),
        lastMessage: c.messages[0] ?? null,
        updatedAt: c.updatedAt,
      };
    });
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

    // Notify the other members (in-app; WhatsApp if enabled).
    const members = await this.prisma.scoped.chatMember.findMany({ where: { conversationId } });
    await Promise.all(
      members
        .filter((m) => m.userId !== userId)
        .map((m) => this.notifications.notify(tenantId, m.userId, {
          type: 'mention', title: 'New message', deepLink: `/chat/${conversationId}`,
        })),
    );
    return message;
  }
}
