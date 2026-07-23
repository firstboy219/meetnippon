/**
 * No-show detection (tester feedback #1). Live DB.
 *
 * The properties worth proving: a finished booking with no check-in is marked
 * and its owner warned exactly once; a checked-in booking and a roomless
 * (online) booking are never touched.
 */
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { FeatureFlagService } from '../src/flags/feature-flag.service';
import { NotificationService } from '../src/notification/notification.service';
import { NoShowService } from '../src/booking/no-show.service';
import { TestMailService } from './helpers/test-mail';

const T = 'ns-tenant';
const U = 'ns-user';
const R = 'ns-room';

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const flags = new FeatureFlagService(prisma, audit);
const notifications = new NotificationService(prisma, flags);
const mail = new TestMailService();
const sweep = new NoShowService(prisma, notifications, mail,
  new ConfigService({ APP_BASE_URL: 'https://test.local' }));

const agoMin = (m: number) => new Date(Date.now() - m * 60_000);

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
  await prisma.tenant.create({ data: { id: T, name: 'NS Co', slug: 'ns-co', timezone: 'Asia/Jakarta' } });
  await prisma.user.create({ data: { id: U, tenantId: T, email: 'ns@x.co', fullName: 'NS User' } });
  await prisma.resource.create({ data: { id: R, tenantId: T, type: 'ROOM', name: 'NS Room', status: 'ACTIVE' } });
});
afterAll(async () => { await wipe(); await prisma.$disconnect(); });
beforeEach(async () => {
  await prisma.notification.deleteMany({ where: { tenantId: T } });
  await prisma.booking.deleteMany({ where: { tenantId: T } });
  mail.reset();
});

const makeBooking = (over: Partial<Parameters<typeof prisma.booking.create>[0]['data']> = {}) =>
  prisma.booking.create({
    data: {
      tenantId: T, title: 'Ghost meeting', type: 'OFFLINE', resourceId: R,
      principalId: U, bookerId: U,
      startTime: agoMin(90), endTime: agoMin(30),
      status: 'APPROVED',
      ...over,
    } as any,
  });

describe('no-show sweep', () => {
  it('marks a finished, never-checked-in booking and warns the owner once', async () => {
    const b = await makeBooking();
    expect(await sweep.tick()).toBe(1);

    const after = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(after!.noShowAt).not.toBeNull();

    const notes = await prisma.notification.findMany({ where: { tenantId: T, userId: U } });
    expect(notes).toHaveLength(1);
    expect(notes[0].type).toBe('warning');
    expect(mail.recipients()).toEqual(['ns@x.co']);

    // Re-running must not warn again — noShowAt is the once-only marker.
    expect(await sweep.tick()).toBe(0);
    expect(await prisma.notification.count({ where: { tenantId: T } })).toBe(1);
    expect(mail.sent).toHaveLength(1);
  });

  it('leaves a checked-in booking alone', async () => {
    await makeBooking({ checkedInAt: agoMin(80) });
    expect(await sweep.tick()).toBe(0);
    expect(await prisma.notification.count({ where: { tenantId: T } })).toBe(0);
  });

  it('ignores online bookings — they occupy no room', async () => {
    await makeBooking({ resourceId: null, type: 'ONLINE' });
    expect(await sweep.tick()).toBe(0);
  });

  it('ignores bookings still in progress or cancelled', async () => {
    await makeBooking({ endTime: new Date(Date.now() + 30 * 60_000) }); // ongoing
    await makeBooking({ status: 'CANCELLED' });
    expect(await sweep.tick()).toBe(0);
  });
});
