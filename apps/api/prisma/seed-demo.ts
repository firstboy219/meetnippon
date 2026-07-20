/**
 * Rich demo seed for the pilot tenant (nipsea). Idempotent — every row uses a
 * deterministic id and upsert, so it can be re-run safely. Populates a realistic
 * workspace (users, rooms/desks, policies, bookings, approvals, chat, WFH,
 * notifications) and enables every feature flag so the whole product is visible.
 *
 * Run: docker run ... npx ts-node --transpile-only prisma/seed-demo.ts
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
const SLUG = 'nipsea';

// The demo tenant runs on Jakarta time; times below are WIB wall-clock so the
// seeded day looks like a real office day in the portal, not shifted by 7h.
const TZ = 'Asia/Jakarta';
const now = new Date();

/** Wall-clock field values of an instant as seen in TZ. */
function partsIn(instant: Date) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? '0');
  return { y: g('year'), mo: g('month'), d: g('day'), h: g('hour') % 24, mi: g('minute'), s: g('second') };
}

/** Offset (ms) to add to a UTC instant to reach the TZ wall clock. */
function offsetMs(instant: Date) {
  const p = partsIn(instant);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The UTC instant whose TZ wall clock is `h:m`, `dayOffset` days from today. */
const at = (dayOffset: number, h: number, m = 0) => {
  const p = partsIn(now);
  const target = Date.UTC(p.y, p.mo - 1, p.d + dayOffset, h, m, 0);
  const guess = new Date(target - offsetMs(now));
  return new Date(target - offsetMs(guess));
};

/** Local midnight in TZ, `dayOffset` days from today. */
const startOfDay = (dayOffset: number) => at(dayOffset, 0, 0);

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: SLUG }, update: { timezone: TZ },
    create: { name: 'PT Nipsea', slug: SLUG, isActive: true, timezone: TZ },
  });
  const T = tenant.id;
  const pw = await argon2.hash('Password123!', { type: argon2.argon2id });

  await prisma.tenantBranding.upsert({
    where: { tenantId: T }, update: { displayName: 'Nipsea Booking' },
    create: { tenantId: T, displayName: 'Nipsea Booking', subdomain: SLUG, accessMode: 'SHARED_URL' },
  });

  // ---- users ----
  const users = [
    { id: 'demo-u-dina', email: 'dina@nipsea.co.id', fullName: 'Dina Wijaya', role: 'APPROVER', department: 'Marketing', presence: 'AVAILABLE' },
    { id: 'demo-u-budi', email: 'budi@nipsea.co.id', fullName: 'Budi Santoso', role: 'EMPLOYEE', department: 'Engineering', presence: 'BUSY' },
    { id: 'demo-u-siti', email: 'siti@nipsea.co.id', fullName: 'Siti Rahayu', role: 'EMPLOYEE', department: 'Design', presence: 'AWAY' },
    { id: 'demo-u-eko', email: 'eko@nipsea.co.id', fullName: 'Eko Prasetyo', role: 'APPROVER', department: 'Facilities', presence: 'OFFLINE' },
  ] as const;
  for (const u of users) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: { fullName: u.fullName, role: u.role as any, department: u.department, presence: u.presence as any },
      create: { id: u.id, tenantId: T, email: u.email, fullName: u.fullName, role: u.role as any, department: u.department, languagePref: 'EN', presence: u.presence as any, passwordHash: pw, isActive: true },
    });
  }
  const admin = await prisma.user.findFirst({ where: { tenantId: T, role: 'ADMIN' } });
  const adminId = admin?.id ?? 'demo-u-dina';

  // ---- location hierarchy ----
  const office = await prisma.officeLocation.upsert({
    where: { id: `seed-office-${T}` }, update: { lat: -6.2088, lng: 106.8456, geofenceRadiusM: 200 },
    create: { id: `seed-office-${T}`, tenantId: T, name: 'HQ Jakarta', address: 'Jakarta, Indonesia', lat: -6.2088, lng: 106.8456, geofenceRadiusM: 200 },
  });
  const building = await prisma.building.upsert({
    where: { id: `seed-bldg-${T}` }, update: {},
    create: { id: `seed-bldg-${T}`, tenantId: T, officeLocationId: office.id, name: 'Main Tower' },
  });
  const floors: Record<string, string> = {};
  for (const [key, name] of [['l3', 'Level 3'], ['l4', 'Level 4'], ['l5', 'Level 5'], ['l8', 'Level 8']] as const) {
    const f = await prisma.floor.upsert({
      where: { id: `demo-floor-${key}-${T}` }, update: {},
      create: { id: `demo-floor-${key}-${T}`, tenantId: T, buildingId: building.id, name, siteContacts: [{ role: 'Reception', name: 'Front Desk', ext: '100' }] as any },
    });
    floors[key] = f.id;
  }

  // ---- resources ----
  const resources = [
    { id: 'demo-r-cempaka', floor: 'l5', type: 'ROOM', name: 'Cempaka', category: 'Standard Room', capacity: 8, facilities: ['Projector', 'Video Conference', 'Whiteboard'] },
    { id: 'demo-r-anggrek', floor: 'l3', type: 'ROOM', name: 'Anggrek', category: 'Standard Room', capacity: 6, facilities: ['TV Screen', 'Whiteboard'] },
    { id: 'demo-r-melati', floor: 'l3', type: 'ROOM', name: 'Melati', category: 'Standard Room', capacity: 4, facilities: ['Whiteboard'] },
    { id: 'demo-r-kenanga', floor: 'l8', type: 'ROOM', name: 'Kenanga (VIP)', category: 'VIP Room', capacity: 12, facilities: ['Projector', 'Video Conference', 'Catering'] },
    { id: 'demo-r-desk1', floor: 'l4', type: 'DESK', name: 'Hot Desk M-01', category: null, capacity: 1, facilities: ['Monitor'], zone: 'Zona Marketing' },
    { id: 'demo-r-desk2', floor: 'l4', type: 'DESK', name: 'Hot Desk M-02', category: null, capacity: 1, facilities: ['Monitor'], zone: 'Zona Marketing' },
    { id: 'demo-r-desk3', floor: 'l4', type: 'DESK', name: 'Hot Desk E-01', category: null, capacity: 1, facilities: [], zone: 'Zona Engineering' },
  ] as const;
  for (const r of resources) {
    await prisma.resource.upsert({
      where: { id: r.id },
      update: { name: r.name, category: r.category, capacity: r.capacity, facilities: r.facilities as any, status: 'ACTIVE' },
      create: { id: r.id, tenantId: T, floorId: floors[r.floor], type: r.type as any, name: r.name, category: r.category, capacity: r.capacity, facilities: r.facilities as any, zone: (r as any).zone ?? null, status: 'ACTIVE' },
    });
  }

  // ---- policies ----
  await prisma.bookingPolicy.upsert({
    where: { id: 'demo-pol-tenant' }, update: { rules: { maxDurationMinutes: 240, maxAdvanceDays: 60, bufferMinutes: 5 } as any },
    create: { id: 'demo-pol-tenant', tenantId: T, scope: 'TENANT', rules: { maxDurationMinutes: 240, maxAdvanceDays: 60, bufferMinutes: 5 } as any },
  });
  await prisma.bookingPolicy.upsert({
    where: { id: 'demo-pol-vip' }, update: { rules: { requiresApproval: true, approverIds: ['demo-u-dina', 'demo-u-eko'], checkInRequired: true } as any },
    create: { id: 'demo-pol-vip', tenantId: T, scope: 'CATEGORY', category: 'VIP Room', rules: { requiresApproval: true, approverIds: ['demo-u-dina', 'demo-u-eko'], checkInRequired: true } as any },
  });

  // ---- feature flags (all on, mock) ----
  const flags = [
    { key: 'chat', config: {} },
    { key: 'calendar_sync', config: { mode: 'mock' } },
    { key: 'recording', config: { mode: 'mock', retentionDays: 30 } },
    { key: 'whatsapp', config: { mode: 'mock' } },
    { key: 'sso_microsoft', config: { mode: 'mock', autoProvision: true } },
    { key: 'billing', config: { plan: 'PRO' } },
  ];
  for (const f of flags) {
    await prisma.tenantFeatureFlag.upsert({
      where: { tenantId_key: { tenantId: T, key: f.key } },
      update: { enabled: true, config: f.config as any },
      create: { tenantId: T, key: f.key, enabled: true, config: f.config as any },
    });
  }

  // ---- bookings ----
  const bookings = [
    { id: 'demo-bk-1', title: 'Sync Product Roadmap Q3', resourceId: 'demo-r-cempaka', principalId: adminId, start: at(0, 10), end: at(0, 11), status: 'APPROVED' },
    { id: 'demo-bk-2', title: 'Design Review', resourceId: 'demo-r-anggrek', principalId: 'demo-u-siti', start: at(0, 14), end: at(0, 15), status: 'APPROVED' },
    { id: 'demo-bk-3', title: 'Board Meeting', resourceId: 'demo-r-kenanga', principalId: adminId, start: at(1, 9), end: at(1, 11), status: 'PENDING' },
    { id: 'demo-bk-4', title: 'Standup', resourceId: 'demo-r-melati', principalId: 'demo-u-budi', start: at(1, 9, 30), end: at(1, 10), status: 'APPROVED' },
    { id: 'demo-bk-5', title: 'Retro (last week)', resourceId: 'demo-r-cempaka', principalId: 'demo-u-budi', start: at(-6, 15), end: at(-6, 16), status: 'COMPLETED' },
    { id: 'demo-bk-6', title: 'Hot desk — Marketing', resourceId: 'demo-r-desk1', principalId: 'demo-u-dina', start: at(2, 8, 30), end: at(2, 17), status: 'APPROVED' },
  ] as const;
  for (const b of bookings) {
    await prisma.booking.upsert({
      where: { id: b.id },
      update: { startTime: b.start, endTime: b.end, status: b.status as any },
      create: { id: b.id, tenantId: T, title: b.title, type: 'OFFLINE', resourceId: b.resourceId, principalId: b.principalId, bookerId: b.principalId, startTime: b.start, endTime: b.end, status: b.status as any },
    });
  }
  // approval step for the pending VIP booking
  await prisma.approvalStep.upsert({
    where: { id: 'demo-appr-1' }, update: { decision: 'PENDING' },
    create: { id: 'demo-appr-1', tenantId: T, bookingId: 'demo-bk-3', level: 1, approverId: 'demo-u-dina', decision: 'PENDING' },
  });

  // ---- approval hub tasks ----
  const tasks = [
    { id: 'demo-task-1', category: 'Pull Request', title: 'Approve deploy: api v1.4.2', body: 'Merge & deploy backend hotfix.', requesterName: 'Budi Santoso', sourcePlatform: 'GitHub', approverEmail: 'admin@nipsea.co.id' },
    { id: 'demo-task-2', category: 'Document', title: 'Sign-off: Q3 budget', body: 'Please review and approve the Q3 marketing budget.', requesterName: 'Dina Wijaya', sourcePlatform: 'Google Docs', approverEmail: 'admin@nipsea.co.id' },
  ];
  for (const t of tasks) {
    await prisma.externalApprovalTask.upsert({
      where: { id: t.id }, update: { decision: 'PENDING' },
      create: { id: t.id, tenantId: T, category: t.category, title: t.title, body: t.body, requesterName: t.requesterName, sourcePlatform: t.sourcePlatform, approverEmail: t.approverEmail, decision: 'PENDING', callbackStatus: 'NONE' },
    });
  }

  // ---- chat ----
  const dm = await prisma.chatConversation.upsert({
    where: { id: 'demo-conv-dm' }, update: {},
    create: { id: 'demo-conv-dm', tenantId: T, isGroup: false },
  });
  const grp = await prisma.chatConversation.upsert({
    where: { id: 'demo-conv-grp' }, update: { name: 'Marketing Team' },
    create: { id: 'demo-conv-grp', tenantId: T, isGroup: true, name: 'Marketing Team' },
  });
  const members = [
    { id: 'demo-m-1', conv: dm.id, user: adminId },
    { id: 'demo-m-2', conv: dm.id, user: 'demo-u-dina' },
    { id: 'demo-m-3', conv: grp.id, user: adminId },
    { id: 'demo-m-4', conv: grp.id, user: 'demo-u-dina' },
    { id: 'demo-m-5', conv: grp.id, user: 'demo-u-siti' },
  ];
  for (const m of members) {
    await prisma.chatMember.upsert({ where: { id: m.id }, update: {}, create: { id: m.id, tenantId: T, conversationId: m.conv, userId: m.user } });
  }
  const messages = [
    { id: 'demo-msg-1', conv: dm.id, sender: 'demo-u-dina', body: 'Hi! Are we still on for the roadmap sync at 10?' },
    { id: 'demo-msg-2', conv: dm.id, sender: adminId, body: 'Yes, Cempaka room. See you there.' },
    { id: 'demo-msg-3', conv: grp.id, sender: 'demo-u-siti', body: 'Uploaded the new mockups to the drive 🎨' },
    { id: 'demo-msg-4', conv: grp.id, sender: 'demo-u-dina', body: 'Great work! Let’s review in tomorrow’s standup.' },
  ];
  for (const m of messages) {
    await prisma.chatMessage.upsert({ where: { id: m.id }, update: {}, create: { id: m.id, tenantId: T, conversationId: m.conv, senderId: m.sender, body: m.body } });
  }

  // ---- notifications ----
  const notifs = [
    { id: 'demo-n-1', user: adminId, type: 'approval', title: '2 approval requests awaiting your decision', deepLink: '/hub' },
    { id: 'demo-n-2', user: adminId, type: 'reminder', title: 'Sync Product Roadmap Q3 starts in 1 hour', deepLink: '/bookings' },
    { id: 'demo-n-3', user: adminId, type: 'mention', title: 'Dina Wijaya sent you a message', deepLink: '/chat' },
  ];
  for (const n of notifs) {
    await prisma.notification.upsert({ where: { id: n.id }, update: {}, create: { id: n.id, tenantId: T, userId: n.user, type: n.type, title: n.title, deepLink: n.deepLink, isRead: false } });
  }

  // ---- WFH logs (today) ----
  const wfh = [
    { id: 'demo-wfh-1', user: adminId, location: 'OFFICE', officeName: 'HQ Jakarta' },
    { id: 'demo-wfh-2', user: 'demo-u-budi', location: 'WFH', officeName: null },
    { id: 'demo-wfh-3', user: 'demo-u-siti', location: 'WFH', officeName: null },
  ];
  const today = startOfDay(0);
  for (const w of wfh) {
    await prisma.workLocationLog.upsert({
      where: { userId_day: { userId: w.user, day: today } },
      update: { location: w.location as any, officeName: w.officeName },
      create: { id: w.id, tenantId: T, userId: w.user, day: today, location: w.location as any, officeName: w.officeName },
    });
  }

  console.log('✔ Demo data seeded for tenant', SLUG);
  console.log('  Admin:  admin@nipsea.co.id / ChangeMe123!');
  console.log('  Users:  dina@ / budi@ / siti@ / eko@ nipsea.co.id — all password: Password123!');
  console.log('  Flags on: chat, calendar_sync, recording, whatsapp, sso_microsoft; plan PRO');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
