/**
 * Chat integration tests (Phase 6b). Require a live database.
 * Covers DM creation, messaging, membership guard, and flag gating.
 */
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { FeatureFlagService } from '../src/flags/feature-flag.service';
import { NotificationService } from '../src/notification/notification.service';
import { ChatService } from '../src/chat/chat.service';
import { runWithTenant } from '../src/tenant/tenant-context';

const T = 'chat-tenant';
const U1 = 'chat-u1', U2 = 'chat-u2', U3 = 'chat-u3';

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const flags = new FeatureFlagService(prisma, audit);
const notifications = new NotificationService(prisma, flags);
const chat = new ChatService(prisma, notifications, flags);

const as = <R>(uid: string, fn: () => Promise<R>) =>
  runWithTenant({ tenantId: T, userId: uid, role: 'EMPLOYEE' }, fn);

async function wipe() {
  await prisma.chatMessage.deleteMany({ where: { tenantId: T } });
  await prisma.chatMember.deleteMany({ where: { tenantId: T } });
  await prisma.chatConversation.deleteMany({ where: { tenantId: T } });
  await prisma.notification.deleteMany({ where: { tenantId: T } });
  await prisma.tenantFeatureFlag.deleteMany({ where: { tenantId: T } });
  await prisma.user.deleteMany({ where: { tenantId: T } });
  await prisma.tenant.deleteMany({ where: { id: T } });
}

beforeAll(async () => {
  await prisma.$connect();
  await wipe();
  await prisma.tenant.create({ data: { id: T, name: 'Chat Co', slug: 'chat-co' } });
  await prisma.user.createMany({
    data: [
      { id: U1, tenantId: T, email: 'u1@c.co', fullName: 'User One', role: 'EMPLOYEE' },
      { id: U2, tenantId: T, email: 'u2@c.co', fullName: 'User Two', role: 'EMPLOYEE' },
      { id: U3, tenantId: T, email: 'u3@c.co', fullName: 'User Three', role: 'EMPLOYEE' },
    ],
  });
});
afterAll(async () => { await wipe(); await prisma.$disconnect(); });

async function enableChat() {
  await prisma.tenantFeatureFlag.deleteMany({ where: { tenantId: T, key: 'chat' } });
  await prisma.tenantFeatureFlag.create({ data: { tenantId: T, key: 'chat', enabled: true, config: {} as any } });
}

describe('chat', () => {
  let convId = '';

  it('blocks chat when the flag is disabled', async () => {
    await expect(as(U1, () => chat.listConversations())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates a direct conversation and reuses it', async () => {
    await enableChat();
    const conv: any = await as(U1, () => chat.createDirect(U2));
    convId = conv.id;
    const again: any = await as(U1, () => chat.createDirect(U2));
    expect(again.id).toBe(convId); // reused, not duplicated
  });

  it('sends a message and notifies the other member', async () => {
    const msg: any = await as(U1, () => chat.sendMessage(convId, 'Hello there'));
    expect(msg.body).toBe('Hello there');
    expect(msg.sender.id).toBe(U1);
    const notif = await prisma.notification.findFirst({ where: { tenantId: T, userId: U2, type: 'mention' } });
    expect(notif).not.toBeNull();
  });

  it('lists conversations with the last message', async () => {
    const list: any[] = await as(U2, () => chat.listConversations());
    const conv = list.find((c) => c.id === convId);
    expect(conv).toBeTruthy();
    expect(conv.lastMessage?.body).toBe('Hello there');
  });

  it('forbids a non-member from reading messages', async () => {
    await expect(as(U3, () => chat.getMessages(convId))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
