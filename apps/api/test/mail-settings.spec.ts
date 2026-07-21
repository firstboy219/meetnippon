/**
 * Tenant mail settings. Live DB.
 *
 * The point of these tests is that a stored SMTP password is never readable
 * through the API and never crosses a tenant boundary.
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { MailSettingsService } from '../src/mail/mail-settings.service';
import { runWithTenant } from '../src/tenant/tenant-context';
import { resetSecretBoxKey } from '../src/common/secret-box';

const A = 'mail-tA';
const B = 'mail-tB';

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const settings = new MailSettingsService(prisma, audit);

const asA = <T>(fn: () => Promise<T>) =>
  runWithTenant({ tenantId: A, userId: 'mail-admin-a', role: 'ADMIN' }, fn);
const asB = <T>(fn: () => Promise<T>) =>
  runWithTenant({ tenantId: B, userId: 'mail-admin-b', role: 'ADMIN' }, fn);

async function wipe() {
  await prisma.tenantMailSetting.deleteMany({ where: { tenantId: { in: [A, B] } } });
  await prisma.auditLog.deleteMany({ where: { tenantId: { in: [A, B] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [A, B] } } });
}

beforeAll(async () => {
  process.env.MAIL_SECRET_KEY = 'k'.repeat(64);
  resetSecretBoxKey();
  await prisma.$connect();
  await wipe();
  for (const id of [A, B]) await prisma.tenant.create({ data: { id, name: id, slug: id } });
});
afterAll(async () => {
  await wipe();
  await prisma.$disconnect();
  delete process.env.MAIL_SECRET_KEY;
  resetSecretBoxKey();
});

describe('saving settings', () => {
  it('stores the password encrypted and never returns it', async () => {
    const view = await asA(() =>
      settings.update({
        host: 'smtp.example.com', port: 587,
        username: 'bot@example.com', password: 'app-password-1234',
        fromName: 'Acme', fromEmail: 'noreply@example.com',
      }),
    );
    expect(view.hasPassword).toBe(true);
    expect(JSON.stringify(view)).not.toContain('app-password-1234');
    expect(Object.keys(view)).not.toContain('password');
    expect(Object.keys(view)).not.toContain('passwordEnc');

    // and the column itself is ciphertext
    const row = await prisma.tenantMailSetting.findUnique({ where: { tenantId: A } });
    expect(row!.passwordEnc).not.toContain('app-password-1234');
    expect(row!.passwordEnc.startsWith('v1:')).toBe(true);
  });

  it('keeps the stored password when none is supplied', async () => {
    const before = await prisma.tenantMailSetting.findUnique({ where: { tenantId: A } });
    await asA(() => settings.update({ host: 'smtp.example.com', port: 465, username: 'bot@example.com' }));
    const after = await prisma.tenantMailSetting.findUnique({ where: { tenantId: A } });
    expect(after!.port).toBe(465);
    expect(after!.passwordEnc).toBe(before!.passwordEnc);
  });

  it('clears the password when an empty string is sent', async () => {
    await asA(() => settings.update({ host: 'smtp.example.com', username: '', password: '' }));
    const row = await prisma.tenantMailSetting.findUnique({ where: { tenantId: A } });
    expect(row!.passwordEnc).toBe('');
    const view = await asA(() => settings.get());
    expect(view!.hasPassword).toBe(false);
  });

  it('resets the verification verdict whenever settings change', async () => {
    await settings.recordVerification(A, true, '');
    expect((await prisma.tenantMailSetting.findUnique({ where: { tenantId: A } }))!.lastVerifiedAt).not.toBeNull();
    await asA(() => settings.update({ host: 'smtp.other.com', username: 'x@y.z', password: 'p' }));
    const row = await prisma.tenantMailSetting.findUnique({ where: { tenantId: A } });
    expect(row!.lastVerifiedAt).toBeNull();
    expect(row!.lastError).toBeNull();
  });

  it('does not write the credential into the audit log', async () => {
    await asA(() => settings.update({ host: 'smtp.audit.com', username: 'u@v.w', password: 'do-not-log-me' }));
    const logs = await prisma.auditLog.findMany({ where: { tenantId: A } });
    expect(JSON.stringify(logs)).not.toContain('do-not-log-me');
    expect(logs.some((l) => l.action === 'mail.settings.update')).toBe(true);
  });
});

describe('resolving for sending', () => {
  it('returns a usable config with the decrypted password', async () => {
    await asA(() => settings.update({
      host: 'smtp.send.com', port: 587, username: 'bot@send.com', password: 'secret-pw',
      fromName: 'Acme Co', fromEmail: 'hello@send.com',
    }));
    const cfg = await settings.resolveFor(A);
    expect(cfg).toMatchObject({
      host: 'smtp.send.com', port: 587, username: 'bot@send.com', password: 'secret-pw',
      from: 'Acme Co <hello@send.com>',
    });
  });

  it('falls back to the platform default when disabled', async () => {
    await asA(() => settings.update({ host: 'smtp.send.com', username: 'bot@send.com', password: 'p', enabled: false }));
    expect(await settings.resolveFor(A)).toBeNull();
  });

  it('refuses to send anonymously when the password will not decrypt', async () => {
    await asA(() => settings.update({ host: 'smtp.send.com', username: 'bot@send.com', password: 'p' }));
    // simulate a rotated key / tampered row
    await prisma.tenantMailSetting.update({
      where: { tenantId: A }, data: { passwordEnc: 'v1:AAAA:BBBB:CCCC' },
    });
    expect(await settings.resolveFor(A)).toBeNull();
  });

  it('has nothing to resolve for a tenant that never configured mail', async () => {
    expect(await settings.resolveFor(B)).toBeNull();
  });
});

describe('tenant isolation', () => {
  it('does not show one tenant the other tenant\'s settings', async () => {
    await asA(() => settings.update({ host: 'smtp.a.com', username: 'a@a.com', password: 'pw-a' }));
    await asB(() => settings.update({ host: 'smtp.b.com', username: 'b@b.com', password: 'pw-b' }));

    expect((await asA(() => settings.get()))!.host).toBe('smtp.a.com');
    expect((await asB(() => settings.get()))!.host).toBe('smtp.b.com');

    // and each resolves only its own credential
    expect((await settings.resolveFor(A))!.password).toBe('pw-a');
    expect((await settings.resolveFor(B))!.password).toBe('pw-b');
  });

  it('deleting one tenant\'s settings leaves the other intact', async () => {
    await asA(() => settings.remove());
    expect(await asA(() => settings.get())).toBeNull();
    expect((await asB(() => settings.get()))!.host).toBe('smtp.b.com');
  });
});
