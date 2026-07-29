/**
 * "Recently invited" suggestions (derived from the caller's own bookings).
 * Live DB. The point: re-inviting the same people — external guests above all —
 * should be one tap, ranked by how often they were invited.
 */
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { FeatureFlagService } from '../src/flags/feature-flag.service';
import { NotificationService } from '../src/notification/notification.service';
import { CalendarService } from '../src/calendar/calendar.service';
import { PolicyResolverService } from '../src/booking/policy/policy-resolver.service';
import { BookingService } from '../src/booking/booking.service';
import { TestMailService } from './helpers/test-mail';
import { runWithTenant } from '../src/tenant/tenant-context';

const T = 'rp-tenant';
const OWNER = 'rp-owner';
const PEER = 'rp-peer';
const R = 'rp-room';

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const flags = new FeatureFlagService(prisma, audit);
const notifications = new NotificationService(prisma, flags);
const calendar = new CalendarService(prisma, flags);
const mail = new TestMailService();
const resolver = new PolicyResolverService(prisma);
const bookings = new BookingService(prisma, audit, resolver, calendar, notifications, mail,
  new ConfigService({ APP_BASE_URL: 'https://test.local' }));

const asOwner = <X>(fn: () => Promise<X>) =>
  runWithTenant({ tenantId: T, userId: OWNER, role: 'EMPLOYEE' }, fn);

const D = new Date(Date.now() + 2 * 86400000);
const at = (h: number) =>
  new Date(Date.UTC(D.getUTCFullYear(), D.getUTCMonth(), D.getUTCDate(), h, 0, 0));

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
  await prisma.tenant.create({ data: { id: T, name: 'RP Co', slug: 'rp-co', timezone: 'UTC' } });
  await prisma.user.createMany({
    data: [
      { id: OWNER, tenantId: T, email: 'owner@rp.co', fullName: 'Owner' },
      { id: PEER, tenantId: T, email: 'peer@rp.co', fullName: 'Peer Person' },
    ],
  });
  await prisma.resource.create({ data: { id: R, tenantId: T, type: 'ROOM', name: 'RP Room', status: 'ACTIVE' } });
});
afterAll(async () => { await wipe(); await prisma.$disconnect(); });
beforeEach(() => prisma.booking.deleteMany({ where: { tenantId: T } }));

const book = (hour: number, participants: any[]) => asOwner(() => bookings.create({
  title: `M${hour}`, resourceId: R,
  startTime: at(hour).toISOString(), endTime: at(hour + 1).toISOString(),
  participants, notify: false,
} as any));

describe('recent participants', () => {
  it('ranks by how often invited, and resolves internal names', async () => {
    // Guest invited twice, colleague once.
    await book(2, [{ email: 'guest@vendor.com', external: true }, { userId: PEER, email: 'peer@rp.co' }]);
    await book(4, [{ email: 'guest@vendor.com', external: true }]);

    const recent = await asOwner(() => bookings.recentParticipants());
    const emails = recent.map((r) => r.email);
    expect(emails[0]).toBe('guest@vendor.com'); // most-invited first
    expect(emails).toContain('peer@rp.co');

    const guest = recent.find((r) => r.email === 'guest@vendor.com')!;
    expect(guest.count).toBe(2);
    expect(guest.external).toBe(true);   // not in the directory
    expect(guest.name).toBeNull();

    const peer = recent.find((r) => r.email === 'peer@rp.co')!;
    expect(peer.external).toBe(false);   // a directory member
    expect(peer.name).toBe('Peer Person'); // resolved from the current directory
    expect(peer.userId).toBe(PEER);
  });

  it('never suggests the caller themselves', async () => {
    await book(2, [{ userId: OWNER, email: 'owner@rp.co' }, { email: 'guest@vendor.com', external: true }]);
    const recent = await asOwner(() => bookings.recentParticipants());
    expect(recent.map((r) => r.email)).not.toContain('owner@rp.co');
  });
});

describe('invitation email carries a calendar attachment', () => {
  it('attaches an .ics file and a Google Calendar quick-add button', async () => {
    mail.reset();
    await asOwner(() => bookings.create({
      title: 'Sync with Peer', resourceId: R,
      startTime: at(8).toISOString(), endTime: at(9).toISOString(),
      participants: [{ userId: PEER, email: 'peer@rp.co' }],
    } as any));

    expect(mail.sent).toHaveLength(1);
    const msg = mail.sent[0];
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments![0].filename).toBe('meeting.ics');
    expect(msg.attachments![0].contentType).toContain('text/calendar');
    expect(msg.attachments![0].content).toContain('BEGIN:VEVENT');
    expect(msg.attachments![0].content).toContain('SUMMARY:Sync with Peer');
    expect(msg.attachments![0].content).toContain('ATTENDEE');
    expect(msg.buttons?.some((b) => b.label === 'Add to Google Calendar')).toBe(true);
  });
});
