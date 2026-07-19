/**
 * SSO (mock provider) integration tests — Phase 5. Require a live database.
 * Proves the mock flow: start -> callback -> JIT provisioning -> session,
 * plus flag gating and state validation. Real Azure/Google adapters are
 * inert without credentials and are not exercised here.
 */
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { AuthService } from '../src/auth/auth.service';
import { FeatureFlagService } from '../src/flags/feature-flag.service';
import { TenantResolverService } from '../src/tenant/tenant-resolver.service';
import { SsoService } from '../src/sso/sso.service';

const T = 'sso-tenant';

const prisma = new PrismaService();
const jwt = new JwtService({});
const config = new ConfigService({
  JWT_ACCESS_SECRET: 'test_access', JWT_REFRESH_SECRET: 'test_refresh',
  JWT_ACCESS_TTL: 900, JWT_REFRESH_TTL: 1000, PLATFORM_BASE_DOMAIN: 'meetnippon.test',
});
const audit = new AuditService(prisma);
const auth = new AuthService(prisma, jwt, config, audit, new TenantResolverService(prisma, config));
const flags = new FeatureFlagService(prisma, audit);
const resolver = new TenantResolverService(prisma, config);
const sso = new SsoService(prisma, jwt, config, audit, auth, flags, resolver);

async function wipe() {
  await prisma.tenantFeatureFlag.deleteMany({ where: { tenantId: T } });
  await prisma.user.deleteMany({ where: { tenantId: T } });
  await prisma.tenant.deleteMany({ where: { id: T } });
}

beforeAll(async () => {
  await prisma.$connect();
  await wipe();
  await prisma.tenant.create({ data: { id: T, name: 'SSO Co', slug: 'sso-co' } });
});
afterAll(async () => { await wipe(); await prisma.$disconnect(); });

async function enableMock() {
  await prisma.tenantFeatureFlag.deleteMany({ where: { tenantId: T, key: 'sso_microsoft' } });
  await prisma.tenantFeatureFlag.create({
    data: { tenantId: T, key: 'sso_microsoft', enabled: true, config: { mode: 'mock', autoProvision: true } as any },
  });
}

describe('SSO mock flow', () => {
  it('rejects start when the provider flag is disabled', async () => {
    await expect(sso.start('microsoft', 'sso-co')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('start returns a mock consent url + signed state', async () => {
    await enableMock();
    const res = await sso.start('microsoft', 'sso-co');
    expect(res.mode).toBe('mock');
    expect(res.url).toBe('mock:consent');
    expect(res.state.length).toBeGreaterThan(20);
  });

  it('callback JIT-provisions a new user and issues a session', async () => {
    await enableMock();
    const { state } = await sso.start('microsoft', 'sso-co');
    const res = await sso.callback('microsoft', 'alice@sso-co.com|Alice A', state);
    expect(res.user.email).toBe('alice@sso-co.com');
    expect(res.user.fullName).toBe('Alice A');
    expect(res.accessToken).toBeTruthy();

    const created = await prisma.user.findFirst({ where: { tenantId: T, email: 'alice@sso-co.com' } });
    expect(created?.role).toBe('EMPLOYEE');
    expect(created?.passwordHash).toBeNull(); // SSO-only account
  });

  it('callback reuses the existing user on a second sign-in', async () => {
    await enableMock();
    const { state } = await sso.start('microsoft', 'sso-co');
    const res = await sso.callback('microsoft', 'alice@sso-co.com', state);
    const count = await prisma.user.count({ where: { tenantId: T, email: 'alice@sso-co.com' } });
    expect(count).toBe(1);
    expect(res.user.email).toBe('alice@sso-co.com');
  });

  it('rejects a tampered state', async () => {
    await expect(sso.callback('microsoft', 'x@sso-co.com', 'not-a-valid-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
