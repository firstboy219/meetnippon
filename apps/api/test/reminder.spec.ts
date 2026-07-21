/**
 * Reminder delivery. Live DB.
 *
 * The thing worth proving is that a reminder fires **once** — the dispatcher
 * runs every minute, so anything that fires per-tick would spam.
 */
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { FeatureFlagService } from '../src/flags/feature-flag.service';
import { NotificationService } from '../src/notification/notification.service';
import { ReminderService } from '../src/reminder/reminder.service';
import { TestMailService } from './helpers/test-mail';

const T = 'rem-tenant';
const U = 'rem-user';
const R = 'rem-room';

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const flags = new FeatureFlagService(prisma, audit);
const notifications = new NotificationService(prisma, flags);
const mail = new TestMailService();
const reminders = new ReminderService(prisma, notifications, mail,
  new ConfigService({ APP_BASE_URL: 'https://test.local' }));

const inMin = (m: number) => new Date(Date.now() + m * 60_000);

async function wipe() {
  await prisma.notification.deleteMany({ where: { tenantId: T } });
  await prisma.booking.deleteMany({ where: { tenantId: T } });
  await prisma.resource.deleteMany({ where: { tenantId: T } });
  await prisma.user.deleteMany({ where: { tenantId: T } });
  await prisma.tenant.deleteMany({ where: { id: T } });
}

beforeAll(async () => {
  await prisma.$connect();
  await wipe();
  await prisma.tenant.create({ data: { id: T, name: 'Rem Co', slug: 'rem-co', timezone: 'Asia/Jakarta' } });
  await prisma.user.create({ data: { id: U, tenantId: T, email: 'rem@x.co', fullName: 'Rem User' } });
  await prisma.resource.create({ data: { id: R, tenantId: T, type: 'ROOM', name: 'Rem Room', status: 'ACTIVE' } });
});
afterAll(async () => { await wipe(); await prisma.$disconnect(); });
beforeEach(async () => {
  await prisma.notification.deleteMany({ where: { tenantId: T } });
  await prisma.booking.deleteMany({ where: { tenantId: T } });
  mail.reset();
});

const makeBooking = (startsInMin: number, reminderSpecs: any[]) =>
  prisma.booking.create({
    data: {
      tenantId: T, title: 'Standup', type: 'OFFLINE', resourceId: R,
      principalId: U, bookerId: U,
      startTime: inMin(startsInMin), endTime: inMin(startsInMin + 30),
      status: 'APPROVED', reminders: reminderSpecs as any,
    },
  });

describe('reminder dispatch', () => {
  it('fires when the offset is reached', async () => {
    await makeBooking(10, [{ offsetMinutes: 15, channel: 'app' }]);
    expect(await reminders.tick()).toBe(1);
    const n = await prisma.notification.findMany({ where: { tenantId: T, userId: U } });
    expect(n).toHaveLength(1);
    expect(n[0].type).toBe('reminder');
    expect(n[0].title).toContain('Standup');
  });

  it('does NOT fire before the offset is reached', async () => {
    await makeBooking(120, [{ offsetMinutes: 15, channel: 'app' }]);
    expect(await reminders.tick()).toBe(0);
    expect(await prisma.notification.count({ where: { tenantId: T } })).toBe(0);
  });

  it('fires exactly once no matter how many times the dispatcher runs', async () => {
    const b = await makeBooking(10, [{ offsetMinutes: 15, channel: 'app' }]);
    for (let i = 0; i < 5; i++) await reminders.tick();
    expect(await prisma.notification.count({ where: { tenantId: T } })).toBe(1);
    const after = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(after!.remindersSent).toEqual([15]);
  });

  it('handles several offsets independently', async () => {
    // 60-min reminder is due (starts in 10), 5-min one is not.
    await makeBooking(10, [
      { offsetMinutes: 60, channel: 'app' },
      { offsetMinutes: 5, channel: 'app' },
    ]);
    expect(await reminders.tick()).toBe(1);
    expect(await prisma.notification.count({ where: { tenantId: T } })).toBe(1);
  });

  it('emails only when the channel asks for it', async () => {
    await makeBooking(10, [{ offsetMinutes: 15, channel: 'email' }]);
    await reminders.tick();
    expect(mail.recipients()).toEqual(['rem@x.co']);
    expect(mail.sent[0].subject).toContain('Reminder');

    mail.reset();
    await prisma.booking.deleteMany({ where: { tenantId: T } });
    await makeBooking(10, [{ offsetMinutes: 15, channel: 'app' }]);
    await reminders.tick();
    expect(mail.sent).toHaveLength(0);
  });

  it('ignores bookings with no reminders, and past or cancelled ones', async () => {
    await makeBooking(10, []);
    const past = await makeBooking(-60, [{ offsetMinutes: 15, channel: 'app' }]);
    await prisma.booking.update({ where: { id: past.id }, data: { startTime: inMin(-60), endTime: inMin(-30) } });
    const cancelled = await makeBooking(10, [{ offsetMinutes: 15, channel: 'app' }]);
    await prisma.booking.update({ where: { id: cancelled.id }, data: { status: 'CANCELLED' } });

    expect(await reminders.tick()).toBe(0);
    expect(await prisma.notification.count({ where: { tenantId: T } })).toBe(0);
  });

  it('ignores malformed reminder entries rather than throwing', async () => {
    await makeBooking(10, [
      { offsetMinutes: 'soon' }, { offsetMinutes: -5 }, { offsetMinutes: 0 }, {},
    ]);
    expect(await reminders.tick()).toBe(0);
  });
});
