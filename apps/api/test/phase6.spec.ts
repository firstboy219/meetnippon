/**
 * Phase 6a integration + unit tests: geofence, approval hub, WFH, notifications.
 * Requires a live database (except the pure geo unit block).
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { haversineMeters, classifyLocation } from '../src/work-location/geo.util';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { FeatureFlagService } from '../src/flags/feature-flag.service';
import { NotificationService } from '../src/notification/notification.service';
import { ApprovalHubService } from '../src/approval-hub/approval-hub.service';
import { WorkLocationService } from '../src/work-location/work-location.service';
import { runWithTenant } from '../src/tenant/tenant-context';

describe('geo.util (pure)', () => {
  it('haversine ~111km for 1° at the equator', () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
    expect(d).toBeGreaterThan(110000);
    expect(d).toBeLessThan(112000);
  });
  it('classifies inside vs outside a geofence', () => {
    const offices = [{ name: 'HQ', lat: 0, lng: 0, geofenceRadiusM: 150 }];
    expect(classifyLocation({ lat: 0.0005, lng: 0 }, offices)).toEqual({ location: 'OFFICE', officeName: 'HQ' });
    expect(classifyLocation({ lat: 0.01, lng: 0 }, offices).location).toBe('WFH');
  });
});

const T = 'p6-tenant';
const REQ = 'p6-req';
const APPR = 'p6-appr';

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const flags = new FeatureFlagService(prisma, audit);
const notifications = new NotificationService(prisma, flags);
const hub = new ApprovalHubService(prisma, audit, notifications);
const wl = new WorkLocationService(prisma, audit);

const asReq = <R>(fn: () => Promise<R>) => runWithTenant({ tenantId: T, userId: REQ, role: 'EMPLOYEE' }, fn);
const asAppr = <R>(fn: () => Promise<R>) => runWithTenant({ tenantId: T, userId: APPR, role: 'APPROVER' }, fn);

async function wipe() {
  await prisma.externalApprovalTask.deleteMany({ where: { tenantId: T } });
  await prisma.workLocationLog.deleteMany({ where: { tenantId: T } });
  await prisma.notification.deleteMany({ where: { tenantId: T } });
  await prisma.officeLocation.deleteMany({ where: { tenantId: T } });
  await prisma.user.deleteMany({ where: { tenantId: T } });
  await prisma.tenant.deleteMany({ where: { id: T } });
}

beforeAll(async () => {
  await prisma.$connect();
  await wipe();
  await prisma.tenant.create({ data: { id: T, name: 'P6', slug: 'p6' } });
  await prisma.user.createMany({
    data: [
      { id: REQ, tenantId: T, email: 'req@p6.co', fullName: 'Req', role: 'EMPLOYEE' },
      { id: APPR, tenantId: T, email: 'appr@p6.co', fullName: 'Appr', role: 'APPROVER' },
    ],
  });
  await prisma.officeLocation.create({
    data: { id: 'p6-office', tenantId: T, name: 'HQ', lat: 0, lng: 0, geofenceRadiusM: 150 },
  });
});
afterAll(async () => { await wipe(); await prisma.$disconnect(); });

describe('approval hub', () => {
  let taskId = '';
  it('creates a task and notifies the approver', async () => {
    const task: any = await asReq(() => hub.create({
      category: 'PR', title: 'Approve PR #12', approverEmail: 'appr@p6.co', callbackUrl: 'https://example.com/cb',
    }));
    taskId = task.id;
    expect(task.decision).toBe('PENDING');
    expect(task.callbackStatus).toBe('PENDING');
    const notif = await prisma.notification.findFirst({ where: { tenantId: T, userId: APPR, type: 'approval' } });
    expect(notif).not.toBeNull();
  });
  it('lists for the assigned approver', async () => {
    const rows: any[] = await asAppr(() => hub.listForApprover());
    expect(rows.some((r) => r.id === taskId)).toBe(true);
  });
  it('forbids a non-approver from deciding', async () => {
    await expect(asReq(() => hub.decide(taskId, { decision: 'APPROVED' }))).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('approver decides; callback marked SENT; second decide rejected', async () => {
    const res: any = await asAppr(() => hub.decide(taskId, { decision: 'APPROVED' }));
    expect(res.decision).toBe('APPROVED');
    expect(res.callbackStatus).toBe('SENT');
    await expect(asAppr(() => hub.decide(taskId, { decision: 'REJECTED' }))).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('WFH detection', () => {
  it('detects OFFICE inside the geofence and WFH outside', async () => {
    const office: any = await asReq(() => wl.report({ lat: 0.0005, lng: 0 }));
    expect(office.location).toBe('OFFICE');
    expect(office.officeName).toBe('HQ');
    const home: any = await asReq(() => wl.report({ lat: 0.02, lng: 0 }));
    expect(home.location).toBe('WFH');
  });
  it('accepts a manual override and reads it back', async () => {
    await asReq(() => wl.report({ location: 'WFH' }));
    const today: any = await asReq(() => wl.today());
    expect(today.location).toBe('WFH');
  });
  it('requires coordinates or a manual value', async () => {
    await expect(asReq(() => wl.report({}))).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('notifications', () => {
  it('lists the current user notifications', async () => {
    const list: any[] = await asAppr(async () => notifications.list());
    expect(Array.isArray(list)).toBe(true);
    expect(list.some((n) => n.type === 'approval')).toBe(true);
  });
});
