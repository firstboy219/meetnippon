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
import { ConfigService } from '@nestjs/config';
import { TestMailService } from './helpers/test-mail';

const T = 'chat-tenant';
const U1 = 'chat-u1', U2 = 'chat-u2', U3 = 'chat-u3';

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const flags = new FeatureFlagService(prisma, audit);
const notifications = new NotificationService(prisma, flags);
const mail = new TestMailService();
const chat = new ChatService(prisma, notifications, flags, mail,
  new ConfigService({ APP_BASE_URL: 'https://test.local' }));

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

  it('counts unread for the recipient and clears it on read', async () => {
    // U1 already sent one message; add two more.
    await as(U1, () => chat.sendMessage(convId, 'Second'));
    await as(U1, () => chat.sendMessage(convId, 'Third'));

    const forU2: any[] = await as(U2, () => chat.listConversations());
    expect(forU2.find((c) => c.id === convId).unread).toBe(3);
    expect((await as(U2, () => chat.unreadCount())).count).toBe(3);

    // the sender never has unread of their own messages
    const forU1: any[] = await as(U1, () => chat.listConversations());
    expect(forU1.find((c) => c.id === convId).unread).toBe(0);

    await as(U2, () => chat.markRead(convId));
    expect((await as(U2, () => chat.unreadCount())).count).toBe(0);

    // a message arriving after the read counts again
    await as(U1, () => chat.sendMessage(convId, 'Fourth'));
    expect((await as(U2, () => chat.unreadCount())).count).toBe(1);
  });

  it('emails an away recipient once per burst, not once per message', async () => {
    await as(U2, () => chat.markRead(convId));
    await prisma.user.update({
      where: { id: U2 },
      data: { presence: 'OFFLINE' as any, lastSeenAt: new Date(Date.now() - 60 * 60_000) },
    });
    await prisma.chatMember.updateMany({
      where: { conversationId: convId, userId: U2 }, data: { lastNotifiedAt: null },
    });
    mail.reset();

    // Fired concurrently on purpose: the debounce must hold under a burst, not
    // merely when messages arrive politely one at a time.
    await Promise.all(
      ['one', 'two', 'three', 'four', 'five'].map((b) => as(U1, () => chat.sendMessage(convId, b))),
    );
    expect(mail.sent).toHaveLength(1);
    expect(mail.recipients()).toEqual(['u2@c.co']);
    expect(mail.sent[0].subject).toContain('sent you a message');
    // the thread link, not a bare domain
    expect(mail.sent[0].action?.url).toContain(convId);
  });

  it('does not email someone who is online', async () => {
    await prisma.user.update({
      where: { id: U2 }, data: { presence: 'AVAILABLE' as any, lastSeenAt: new Date() },
    });
    await prisma.chatMember.updateMany({
      where: { conversationId: convId, userId: U2 }, data: { lastNotifiedAt: null },
    });
    mail.reset();
    await as(U1, () => chat.sendMessage(convId, 'you are here'));
    expect(mail.sent).toHaveLength(0);
  });

  it('does not email a muted thread even when away', async () => {
    await prisma.user.update({
      where: { id: U2 },
      data: { presence: 'OFFLINE' as any, lastSeenAt: new Date(Date.now() - 60 * 60_000) },
    });
    await prisma.chatMember.updateMany({
      where: { conversationId: convId, userId: U2 },
      data: { muted: true, lastNotifiedAt: null },
    });
    mail.reset();
    await as(U1, () => chat.sendMessage(convId, 'muted please'));
    expect(mail.sent).toHaveLength(0);
    await prisma.chatMember.updateMany({
      where: { conversationId: convId, userId: U2 }, data: { muted: false },
    });
  });

  it('creates a group and reports its members', async () => {
    const g: any = await as(U1, () => chat.createGroup('Marketing weekly', [U2, U3]));
    const list: any[] = await as(U3, () => chat.listConversations());
    const found = list.find((c) => c.id === g.id);
    expect(found).toBeTruthy();
    expect(found.isGroup).toBe(true);
    expect(found.name).toBe('Marketing weekly');
    expect(found.members).toHaveLength(3);
  });
});
