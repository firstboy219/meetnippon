/**
 * Own-profile management. Live DB.
 *
 * The password path carries the weight here: it must prove the old password,
 * must never leak the hash, and must not let one account's personal address
 * shadow another account's login.
 */
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { ProfileService } from '../src/profile/profile.service';
import { runWithTenant } from '../src/tenant/tenant-context';
import { hashPassword, verifyPassword } from '../src/auth/password.util';
import { TestMailService } from './helpers/test-mail';

const T = 'prof-tenant';
const ME = 'prof-me';
const OTHER = 'prof-other';
const SSO = 'prof-sso';
const PASS = 'OriginalPass1!';

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const mail = new TestMailService();
const profile = new ProfileService(prisma, audit, mail);

const as = <R>(uid: string, fn: () => Promise<R>) =>
  runWithTenant({ tenantId: T, userId: uid, role: 'EMPLOYEE' }, fn);

async function wipe() {
  await prisma.auditLog.deleteMany({ where: { tenantId: T } });
  await prisma.user.deleteMany({ where: { tenantId: T } });
  await prisma.tenant.deleteMany({ where: { id: T } });
}

beforeAll(async () => {
  await prisma.$connect();
  await wipe();
  await prisma.tenant.create({ data: { id: T, name: 'Prof Co', slug: 'prof-co' } });
  await prisma.user.createMany({
    data: [
      { id: ME, tenantId: T, email: 'me@p.co', fullName: 'Me Myself', passwordHash: await hashPassword(PASS) },
      { id: OTHER, tenantId: T, email: 'other@p.co', fullName: 'Other Person' },
      { id: SSO, tenantId: T, email: 'sso@p.co', fullName: 'Sso User' }, // no passwordHash
    ],
  });
});
afterAll(async () => { await wipe(); await prisma.$disconnect(); });

describe('reading the profile', () => {
  it('returns the caller and never the password hash', async () => {
    const me: any = await as(ME, () => profile.get());
    expect(me.email).toBe('me@p.co');
    expect(me).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(me)).not.toContain('$argon2');
  });
});

describe('updating details', () => {
  it('changes name, department and personal email', async () => {
    const me: any = await as(ME, () => profile.update({
      fullName: '  Renamed Person ', department: ' Marketing ', personalEmail: 'ME@Gmail.com',
    }));
    expect(me.fullName).toBe('Renamed Person');   // trimmed
    expect(me.department).toBe('Marketing');
    expect(me.personalEmail).toBe('me@gmail.com'); // normalised
  });

  it('clears department and personal email with an empty string', async () => {
    const me: any = await as(ME, () => profile.update({ department: '', personalEmail: '' as any }));
    expect(me.department).toBeNull();
    expect(me.personalEmail).toBeNull();
  });

  it('refuses a personal address that is another account\'s login', async () => {
    await expect(as(ME, () => profile.update({ personalEmail: 'other@p.co' })))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('only ever edits the caller, never an id from the request', async () => {
    await as(ME, () => profile.update({ fullName: 'Only Me' }));
    const other = await prisma.user.findUnique({ where: { id: OTHER } });
    expect(other!.fullName).toBe('Other Person');
  });

  it('records the change without writing the values into the audit log', async () => {
    await as(ME, () => profile.update({ personalEmail: 'secret.address@gmail.com' }));
    const logs = await prisma.auditLog.findMany({ where: { tenantId: T, action: 'profile.update' } });
    expect(logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toContain('secret.address@gmail.com');
  });
});

describe('changing the password', () => {
  it('rejects a wrong current password', async () => {
    await expect(as(ME, () => profile.changePassword({
      currentPassword: 'notTheOne', newPassword: 'BrandNewPass1!',
    }))).rejects.toBeInstanceOf(BadRequestException);

    // and the stored password is untouched
    const u = await prisma.user.findUnique({ where: { id: ME } });
    expect(await verifyPassword(u!.passwordHash!, PASS)).toBe(true);
  });

  it('rejects reusing the current password', async () => {
    await expect(as(ME, () => profile.changePassword({
      currentPassword: PASS, newPassword: PASS,
    }))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('changes it when the current password is right, and emails a warning', async () => {
    mail.reset();
    const next = 'BrandNewPass1!';
    await as(ME, () => profile.changePassword({ currentPassword: PASS, newPassword: next }));

    const u = await prisma.user.findUnique({ where: { id: ME } });
    expect(await verifyPassword(u!.passwordHash!, next)).toBe(true);
    expect(await verifyPassword(u!.passwordHash!, PASS)).toBe(false);

    // the notice goes to the *work* address, which is the one under the
    // workspace's control
    expect(mail.recipients()).toEqual(['me@p.co']);
    expect(mail.sent[0].subject).toContain('password was changed');
    // and never contains either password
    expect(mail.sent[0].text).not.toContain(next);
    expect(mail.sent[0].text).not.toContain(PASS);
  });

  it('tells an SSO account there is no password to change', async () => {
    await expect(as(SSO, () => profile.changePassword({
      currentPassword: 'anything', newPassword: 'Whatever123!',
    }))).rejects.toBeInstanceOf(BadRequestException);
  });
});
