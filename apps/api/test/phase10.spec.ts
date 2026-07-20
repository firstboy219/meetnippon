/**
 * Phase 10 tests: self-service onboarding + billing plan limits. Live DB.
 */
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { FeatureFlagService } from '../src/flags/feature-flag.service';
import { PlanService } from '../src/billing/plan.service';
import { OnboardingService } from '../src/onboarding/onboarding.service';
import { runWithTenant } from '../src/tenant/tenant-context';
import { TestMailService } from './helpers/test-mail';

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const flags = new FeatureFlagService(prisma, audit);
const plan = new PlanService(prisma, flags);
const config = new ConfigService({ PUBLIC_EMAIL_DOMAINS: ['gmail.com'], PLATFORM_BASE_DOMAIN: 'meetnippon.test' });
const mail = new TestMailService();
const onboarding = new OnboardingService(prisma, config, audit, mail);

const SLUG = 'acme10';
const BILL = 'bill10-tenant';

async function wipe() {
  for (const s of [SLUG]) {
    const t = await prisma.tenant.findUnique({ where: { slug: s } });
    if (t) {
      await prisma.bookingPolicy.deleteMany({ where: { tenantId: t.id } });
      await prisma.user.deleteMany({ where: { tenantId: t.id } });
      await prisma.tenantBranding.deleteMany({ where: { tenantId: t.id } });
      await prisma.tenant.delete({ where: { id: t.id } });
    }
  }
  await prisma.resource.deleteMany({ where: { tenantId: BILL } });
  await prisma.tenantFeatureFlag.deleteMany({ where: { tenantId: BILL } });
  await prisma.user.deleteMany({ where: { tenantId: BILL } });
  await prisma.tenant.deleteMany({ where: { id: BILL } });
}

beforeAll(async () => { await prisma.$connect(); await wipe(); });
afterAll(async () => { await wipe(); await prisma.$disconnect(); });

describe('self-service onboarding', () => {
  it('registers a new workspace + admin', async () => {
    const res = await onboarding.register({
      orgName: 'Acme Co', slug: SLUG, adminFullName: 'Ada Admin', adminEmail: 'ada@acme10.co', password: 'Secret123!',
    });
    expect(res.tenantSlug).toBe(SLUG);
    const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG } });
    expect(tenant).not.toBeNull();
    const admin = await prisma.user.findFirst({ where: { tenantId: tenant!.id, role: 'ADMIN' } });
    expect(admin?.email).toBe('ada@acme10.co');
  });

  it('rejects a duplicate slug', async () => {
    await expect(onboarding.register({ orgName: 'Dup', slug: SLUG, adminFullName: 'X', adminEmail: 'x@dup.co', password: 'Secret123!' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a reserved slug and public email', async () => {
    await expect(onboarding.register({ orgName: 'R', slug: 'admin', adminFullName: 'X', adminEmail: 'x@r.co', password: 'Secret123!' }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(onboarding.register({ orgName: 'G', slug: 'gmailorg10', adminFullName: 'X', adminEmail: 'x@gmail.com', password: 'Secret123!' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('billing plan limits', () => {
  beforeAll(async () => {
    await prisma.tenant.create({ data: { id: BILL, name: 'Bill', slug: 'bill10' } });
    // FREE limit is 5 resources — create exactly 5.
    for (let i = 0; i < 5; i++) {
      await prisma.resource.create({ data: { tenantId: BILL, type: 'ROOM', name: `R${i}` } });
    }
  });

  it('defaults to FREE and blocks exceeding the resource limit', async () => {
    expect(await plan.getPlan(BILL)).toBe('FREE');
    await expect(plan.assertCanAddResource(BILL)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('upgrading to PRO raises the limit', async () => {
    await runWithTenant({ tenantId: BILL, userId: 'x', role: 'ADMIN' }, () => plan.setPlan(BILL, 'PRO'));
    expect(await plan.getPlan(BILL)).toBe('PRO');
    await expect(plan.assertCanAddResource(BILL)).resolves.toBeUndefined();
  });

  it('reports a billing summary', async () => {
    const s = await plan.billingSummary(BILL);
    expect(s.plan).toBe('PRO');
    expect(s.usage.resources).toBe(5);
    expect(s.limits.maxResources).toBe(100);
  });
});
