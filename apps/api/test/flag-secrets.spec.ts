/**
 * SSO client secrets stored via the admin console. Live DB.
 *
 * The properties that matter: the secret is encrypted at rest, it never leaves
 * the API in readable form, and an unrelated edit does not silently wipe it
 * (the console submits a blank box because it never received the value).
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { FeatureFlagService } from '../src/flags/feature-flag.service';
import { decryptSecret, resetSecretBoxKey } from '../src/common/secret-box';
import { runWithTenant } from '../src/tenant/tenant-context';

// The suite runs without the server env; give the box a deterministic key.
process.env.MAIL_SECRET_KEY = 'b'.repeat(64);
resetSecretBoxKey();

const T = 'fs-tenant';
const prisma = new PrismaService();
const audit = new AuditService(prisma);
const flags = new FeatureFlagService(prisma, audit);

const asAdmin = <X>(fn: () => Promise<X>) =>
  runWithTenant({ tenantId: T, userId: 'fs-admin', role: 'ADMIN' }, fn);

async function wipe() {
  await prisma.tenantFeatureFlag.deleteMany({ where: { tenantId: T } });
  await prisma.auditLog.deleteMany({ where: { tenantId: T } });
  await prisma.user.deleteMany({ where: { tenantId: T } });
  await prisma.tenant.deleteMany({ where: { id: T } });
}

beforeAll(async () => {
  await prisma.$connect();
  await wipe();
  await prisma.tenant.create({ data: { id: T, name: 'FS Co', slug: 'fs-co' } });
  await prisma.user.create({
    data: { id: 'fs-admin', tenantId: T, email: 'a@fs.co', fullName: 'A', role: 'ADMIN' },
  });
});
afterAll(async () => {
  await wipe();
  await prisma.$disconnect();
  delete process.env.MAIL_SECRET_KEY;
  resetSecretBoxKey();
});
beforeEach(() => prisma.tenantFeatureFlag.deleteMany({ where: { tenantId: T } }));

const SECRET = 'super-secret-value-123';

describe('SSO client secret handling', () => {
  it('encrypts at rest and never returns it to the console', async () => {
    await asAdmin(() => flags.upsert('sso_microsoft', true, {
      mode: 'live', clientId: 'abc', clientSecret: SECRET,
    }));

    // At rest: encrypted, and the plaintext key is gone.
    const row = await prisma.tenantFeatureFlag.findFirst({ where: { tenantId: T, key: 'sso_microsoft' } });
    const stored = row!.config as Record<string, any>;
    expect(stored.clientSecret).toBeUndefined();
    expect(stored.clientSecretEnc).toBeTruthy();
    expect(stored.clientSecretEnc).not.toContain(SECRET);
    expect(decryptSecret(stored.clientSecretEnc)).toBe(SECRET); // the API can still use it

    // On the way out: no secret in any form, just a marker.
    const [view] = await asAdmin(() => flags.list());
    expect(JSON.stringify(view)).not.toContain(SECRET);
    expect(view.config).not.toHaveProperty('clientSecretEnc');
    expect(view.config).not.toHaveProperty('clientSecret');
    expect(view.config.hasClientSecret).toBe(true);
    expect(view.config.clientId).toBe('abc'); // non-secret config still visible
  });

  it('keeps the saved secret when the console submits a blank box', async () => {
    await asAdmin(() => flags.upsert('sso_microsoft', true, { clientId: 'abc', clientSecret: SECRET }));
    // A later save that only toggles autoProvision — secret field left empty.
    await asAdmin(() => flags.upsert('sso_microsoft', true, {
      clientId: 'abc', clientSecret: '', autoProvision: false,
    }));

    const row = await prisma.tenantFeatureFlag.findFirst({ where: { tenantId: T, key: 'sso_microsoft' } });
    const stored = row!.config as Record<string, any>;
    expect(decryptSecret(stored.clientSecretEnc)).toBe(SECRET); // survived
    expect(stored.autoProvision).toBe(false);                    // the edit applied
  });

  it('replaces the secret when a new one is typed', async () => {
    await asAdmin(() => flags.upsert('sso_microsoft', true, { clientId: 'abc', clientSecret: SECRET }));
    await asAdmin(() => flags.upsert('sso_microsoft', true, { clientId: 'abc', clientSecret: 'rotated-999' }));

    const row = await prisma.tenantFeatureFlag.findFirst({ where: { tenantId: T, key: 'sso_microsoft' } });
    expect(decryptSecret((row!.config as any).clientSecretEnc)).toBe('rotated-999');
  });

  it('configFor still exposes the encrypted value so providers can decrypt it', async () => {
    await asAdmin(() => flags.upsert('sso_microsoft', true, { clientId: 'abc', clientSecret: SECRET }));
    const cfg = await flags.configFor(T, 'sso_microsoft');
    expect(decryptSecret(cfg.clientSecretEnc)).toBe(SECRET);
  });
});
