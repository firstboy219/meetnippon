/**
 * Room allowlists, the booking horizon, and free slots (tester feedback #2/#3/#5).
 * Live DB.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { FeatureFlagService } from '../src/flags/feature-flag.service';
import { NotificationService } from '../src/notification/notification.service';
import { CalendarService } from '../src/calendar/calendar.service';
import { PolicyResolverService } from '../src/booking/policy/policy-resolver.service';
import { BookingService } from '../src/booking/booking.service';
import { ResourceService } from '../src/resource/resource.service';
import { TestMailService } from './helpers/test-mail';
import { runWithTenant } from '../src/tenant/tenant-context';

const T = 'rr-tenant';
const VIP = 'rr-vip';
const PLEB = 'rr-pleb';
const R = 'rr-board';

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const flags = new FeatureFlagService(prisma, audit);
const notifications = new NotificationService(prisma, flags);
const calendar = new CalendarService(prisma, flags);
const mail = new TestMailService();
const config = new ConfigService({ APP_BASE_URL: 'https://test.local' });
const resolver = new PolicyResolverService(prisma);
const bookings = new BookingService(prisma, audit, resolver, calendar, notifications, mail, config);
const resources = new ResourceService(prisma, resolver);

const asVip = <X>(fn: () => Promise<X>) =>
  runWithTenant({ tenantId: T, userId: VIP, role: 'EMPLOYEE' }, fn);
const asPleb = <X>(fn: () => Promise<X>) =>
  runWithTenant({ tenantId: T, userId: PLEB, role: 'EMPLOYEE' }, fn);

const D = new Date(Date.now() + 2 * 86400000);
const at = (h: number) =>
  new Date(Date.UTC(D.getUTCFullYear(), D.getUTCMonth(), D.getUTCDate(), h, 0, 0));
const daysOut = (n: number, h = 6) => {
  const d = new Date(Date.now() + n * 86400000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, 0, 0));
};

async function wipe() {
  await prisma.approvalStep.deleteMany({ where: { tenantId: T } });
  await prisma.notification.deleteMany({ where: { tenantId: T } });
  await prisma.booking.deleteMany({ where: { tenantId: T } });
  await prisma.bookingPolicy.deleteMany({ where: { tenantId: T } });
  await prisma.resource.deleteMany({ where: { tenantId: T } });
  await prisma.user.deleteMany({ where: { tenantId: T } });
  await prisma.tenant.deleteMany({ where: { id: T } });
}

beforeAll(async () => {
  await prisma.$connect();
  await wipe();
  await prisma.tenant.create({ data: { id: T, name: 'RR Co', slug: 'rr-co', timezone: 'UTC' } });
  await prisma.user.createMany({
    data: [
      { id: VIP, tenantId: T, email: 'vip@rr.co', fullName: 'Vip' },
      { id: PLEB, tenantId: T, email: 'pleb@rr.co', fullName: 'Pleb' },
    ],
  });
  await prisma.resource.create({ data: { id: R, tenantId: T, type: 'ROOM', name: 'Boardroom', status: 'ACTIVE' } });
});
afterAll(async () => { await wipe(); await prisma.$disconnect(); });
beforeEach(async () => {
  await prisma.approvalStep.deleteMany({ where: { tenantId: T } });
  await prisma.booking.deleteMany({ where: { tenantId: T } });
  await prisma.bookingPolicy.deleteMany({ where: { tenantId: T } });
});

const setRoomPolicy = (rules: Record<string, unknown>) =>
  prisma.bookingPolicy.create({
    data: { tenantId: T, scope: 'ROOM', resourceId: R, rules: rules as any },
  });

describe('room allowlist (admin-set)', () => {
  it('blocks a user not on the list, allows one on it', async () => {
    await setRoomPolicy({ allowedUserIds: [VIP] });

    await expect(asPleb(() => bookings.create({
      title: 'Sneak in', resourceId: R,
      startTime: at(2).toISOString(), endTime: at(3).toISOString(),
    } as any))).rejects.toBeInstanceOf(ForbiddenException);

    const ok = await asVip(() => bookings.create({
      title: 'Allowed', resourceId: R,
      startTime: at(2).toISOString(), endTime: at(3).toISOString(),
    } as any));
    expect(ok.status).toBe('APPROVED');
  });

  it('the room stays visible; the verdict is per-caller and the list is never sent', async () => {
    await setRoomPolicy({ allowedUserIds: [VIP] });

    const forPleb = await asPleb(() => resources.list({}));
    const room = forPleb.find((r) => r.id === R)!;
    expect(room).toBeDefined();                    // visible
    expect(room.policy.restricted).toBe(true);
    expect(room.policy.canBook).toBe(false);       // but not bookable
    expect((room.policy as any).allowedUserIds).toBeUndefined(); // no leak

    const forVip = await asVip(() => resources.list({}));
    expect(forVip.find((r) => r.id === R)!.policy.canBook).toBe(true);
  });
});

describe('booking horizon (admin-set)', () => {
  it('defaults to one month and refuses beyond it', async () => {
    await expect(asVip(() => bookings.create({
      title: 'Far future', resourceId: R,
      startTime: daysOut(40).toISOString(),
      endTime: daysOut(40, 7).toISOString(),
    } as any))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('over the horizon goes through approval when the admin says so', async () => {
    await setRoomPolicy({ maxAdvanceDays: 7, overAdvanceRequiresApproval: true });

    const near = await asVip(() => bookings.create({
      title: 'Inside horizon', resourceId: R,
      startTime: at(2).toISOString(), endTime: at(3).toISOString(),
    } as any));
    expect(near.status).toBe('APPROVED'); // unchanged for normal bookings

    const far = await asVip(() => bookings.create({
      title: 'Beyond horizon', resourceId: R,
      startTime: daysOut(20).toISOString(),
      endTime: daysOut(20, 7).toISOString(),
    } as any));
    expect(far.status).toBe('PENDING');
    expect(await prisma.approvalStep.count({ where: { bookingId: far.id } })).toBe(1);
  });
});

describe('free slots', () => {
  it('offers only what is open, and drops booked stretches', async () => {
    const dayKey = D.toISOString().slice(0, 10);
    await asVip(() => bookings.create({
      title: 'Taken', resourceId: R,
      startTime: at(9).toISOString(), endTime: at(10).toISOString(),
    } as any));

    const res = await asVip(() => bookings.freeSlots(R, dayKey, 60));
    const labels = res.slots.map((s) => s.label);
    expect(labels).not.toContain('09:00'); // occupied
    expect(labels).not.toContain('08:30'); // 60min from 08:30 overlaps 09:00
    expect(labels).toContain('10:00');     // right after is fine
    // Every offered slot really is bookable-shaped: aligned and inside the day.
    expect(res.slots.every((s) =>
      new Date(s.endTime).getTime() - new Date(s.startTime).getTime() === 60 * 60000)).toBe(true);
  });

  it('respects business hours from the admin policy', async () => {
    await setRoomPolicy({ businessHours: { start: '08:00', end: '12:00', days: [1, 2, 3, 4, 5, 6, 7] } });
    const dayKey = D.toISOString().slice(0, 10);
    const res = await asVip(() => bookings.freeSlots(R, dayKey, 60));
    const labels = res.slots.map((s) => s.label);
    expect(labels[0]).toBe('08:00');
    expect(labels).toContain('11:00'); // last 60-min start inside 08–12
    expect(labels).not.toContain('11:30');
    expect(labels).not.toContain('13:00');
  });
});

describe('free windows (drives both start and end times)', () => {
  const asMs = (iso: string) => new Date(iso).getTime();

  it('returns the gaps around a booking, so an end time can run up to the next one', async () => {
    await setRoomPolicy({ businessHours: { start: '08:00', end: '18:00', days: [1, 2, 3, 4, 5, 6, 7] } });
    const dayKey = D.toISOString().slice(0, 10);
    await asVip(() => bookings.create({
      title: 'Midday', resourceId: R,
      startTime: at(12).toISOString(), endTime: at(13).toISOString(),
    } as any));

    const fw = await asVip(() => bookings.freeWindows(R, dayKey));
    expect(fw.windows.length).toBe(2);
    // Morning window ends exactly where the booking starts — the end-time
    // picker can offer anything up to 12:00 but no further.
    expect(asMs(fw.windows[0].end)).toBe(at(12).getTime());
    expect(asMs(fw.windows[1].start)).toBe(at(13).getTime());
    expect(asMs(fw.windows[1].end)).toBe(at(18).getTime());
    // dayWindow spans the whole business day (for online meetings).
    expect(asMs(fw.dayWindow!.start)).toBe(at(8).getTime());
    expect(asMs(fw.dayWindow!.end)).toBe(at(18).getTime());
    expect(fw.minDurationMinutes).toBeGreaterThan(0);
  });

  it('a buffer widens the busy gap on both sides', async () => {
    await setRoomPolicy({
      bufferMinutes: 15,
      businessHours: { start: '08:00', end: '18:00', days: [1, 2, 3, 4, 5, 6, 7] },
    });
    const dayKey = D.toISOString().slice(0, 10);
    await asVip(() => bookings.create({
      title: 'Buffered', resourceId: R,
      startTime: at(12).toISOString(), endTime: at(13).toISOString(),
    } as any));
    const fw = await asVip(() => bookings.freeWindows(R, dayKey));
    // Morning free-window now ends 15 min before the booking, afternoon starts
    // 15 min after it.
    expect(asMs(fw.windows[0].end)).toBe(at(12).getTime() - 15 * 60000);
    expect(asMs(fw.windows[1].start)).toBe(at(13).getTime() + 15 * 60000);
  });

  it('an unavailable weekday yields no windows', async () => {
    // Restrict to a weekday the probe day is not.
    const wd = new Date(`${D.toISOString().slice(0, 10)}T12:00:00Z`).getUTCDay() || 7;
    const others = [1, 2, 3, 4, 5, 6, 7].filter((d) => d !== wd);
    await setRoomPolicy({ businessHours: { start: '08:00', end: '18:00', days: others } });
    const fw = await asVip(() => bookings.freeWindows(R, D.toISOString().slice(0, 10)));
    expect(fw.windows).toHaveLength(0);
    expect(fw.dayWindow).toBeNull();
  });
});
