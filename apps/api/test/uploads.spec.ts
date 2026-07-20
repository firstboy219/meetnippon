/**
 * Upload validation. Pure filesystem + buffer logic, no database needed.
 * The interesting cases are the ones an attacker picks: a lying mimetype,
 * an executable document, and a path that tries to escape the upload root.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { UploadsService } from '../src/uploads/uploads.service';
import { runWithTenant } from '../src/tenant/tenant-context';

const T = 'up-tenant-A';
let root: string;
let svc: UploadsService;

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

const file = (buffer: Buffer, extra: Record<string, unknown> = {}) =>
  ({ buffer, size: buffer.length, mimetype: 'image/png', originalname: 'x.png', ...extra } as any);

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'mn-uploads-'));
  process.env.UPLOAD_DIR = root;
  svc = new UploadsService();
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

const asTenant = <R>(fn: () => Promise<R>) =>
  runWithTenant({ tenantId: T, userId: 'u1', role: 'ADMIN' }, fn);

describe('upload validation', () => {
  it('stores a real PNG under the tenant, with a random name', async () => {
    const { url } = await asTenant(() => svc.save(file(PNG)));
    expect(url).toMatch(new RegExp(`^/api/uploads/${T}/[a-f0-9]{32}\\.png$`));
    // the client's filename must not survive into storage
    expect(url).not.toContain('x.png');
    expect(readdirSync(join(root, T))).toHaveLength(1);
  });

  it('keys the extension off the content, not the declared mimetype', async () => {
    // JPEG bytes arriving labelled image/png must be stored as .jpg
    const { url } = await asTenant(() => svc.save(file(JPEG, { mimetype: 'image/png' })));
    expect(url).toMatch(/\.jpg$/);
  });

  it('rejects SVG even when it claims to be an image', async () => {
    await expect(asTenant(() => svc.save(file(SVG, { mimetype: 'image/svg+xml' }))))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a non-image whose mimetype lies', async () => {
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    await expect(asTenant(() => svc.save(file(html, { mimetype: 'image/png' }))))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an oversized file', async () => {
    await expect(asTenant(() => svc.save(file(PNG, { size: 6 * 1024 * 1024 }))))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to store without a tenant in context', async () => {
    await expect(svc.save(file(PNG))).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('serving stored files', () => {
  it('locates a file it just stored', async () => {
    const { url } = await asTenant(() => svc.save(file(PNG)));
    const name = url.split('/').pop()!;
    const found = await svc.locate(T, name);
    expect(existsSync(found.path)).toBe(true);
    expect(found.mime).toBe('image/png');
  });

  it('does not escape the upload root via traversal', async () => {
    for (const bad of ['../../etc/passwd', '..%2f..%2fetc%2fpasswd', 'a/../../x.png']) {
      await expect(svc.locate(T, bad)).rejects.toBeInstanceOf(NotFoundException);
    }
    await expect(svc.locate('../..', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects names that do not match the stored pattern', async () => {
    for (const bad of ['short.png', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.exe', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.svg']) {
      await expect(svc.locate(T, bad)).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it('404s a well-formed name that was never stored', async () => {
    await expect(svc.locate(T, 'b'.repeat(32) + '.png')).rejects.toBeInstanceOf(NotFoundException);
  });
});
