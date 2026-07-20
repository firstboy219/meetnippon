import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { mkdir, writeFile, stat } from 'fs/promises';
import { join, resolve, sep } from 'path';
import { getTenantStore } from '../tenant/tenant-context';

/** The subset of a multer file this service needs — avoids a @types/multer dep. */
export interface UploadedFileLike {
  originalname?: string;
  mimetype?: string;
  size: number;
  buffer: Buffer;
}

/**
 * Image kinds accepted for floor plans and branding.
 *
 * SVG is deliberately absent: it is an executable document, and serving one
 * from the platform's own origin would let an uploader run script against the
 * console's session. Raster only.
 */
const SIGNATURES: { ext: string; mime: string; match: (b: Buffer) => boolean }[] = [
  { ext: 'png', mime: 'image/png', match: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'jpg', mime: 'image/jpeg', match: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'gif', mime: 'image/gif', match: (b) => b.length > 6 && b.subarray(0, 6).toString('latin1').startsWith('GIF8') },
  { ext: 'webp', mime: 'image/webp', match: (b) => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Stored name: 32 hex chars + a known-good extension. Never the client's name. */
const STORED_NAME = /^[a-f0-9]{32}\.(png|jpg|gif|webp)$/;
const TENANT_DIR = /^[a-zA-Z0-9_-]{1,64}$/;

@Injectable()
export class UploadsService {
  /** Mounted as a docker volume in prod so images survive a container replace. */
  private readonly root = resolve(process.env.UPLOAD_DIR ?? '/app/uploads');

  private tenantId(): string {
    const id = getTenantStore()?.tenantId;
    if (!id) throw new BadRequestException('Tenant context required.');
    return id;
  }

  async save(file: UploadedFileLike): Promise<{ url: string; bytes: number }> {
    if (!file?.buffer?.length) throw new BadRequestException('No file received.');
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('Image must be 5 MB or smaller.');
    }

    // The declared mimetype is client-supplied and proves nothing; the leading
    // bytes are what decide whether this is really an image we will serve.
    const kind = SIGNATURES.find((s) => s.match(file.buffer));
    if (!kind) {
      throw new BadRequestException('Only PNG, JPEG, GIF or WebP images are accepted.');
    }

    const tenantId = this.tenantId();
    const dir = join(this.root, tenantId);
    await mkdir(dir, { recursive: true });

    const name = `${randomBytes(16).toString('hex')}.${kind.ext}`;
    await writeFile(join(dir, name), file.buffer);

    // Served back through the API's own route, so no nginx rule is needed.
    return { url: `/api/uploads/${tenantId}/${name}`, bytes: file.size };
  }

  /**
   * Resolve a stored file for streaming. Both segments are pattern-checked and
   * the final path is confirmed to sit inside the upload root, so a crafted
   * `..` segment cannot reach anything else on the filesystem.
   */
  async locate(tenantDir: string, fileName: string): Promise<{ path: string; mime: string }> {
    if (!TENANT_DIR.test(tenantDir) || !STORED_NAME.test(fileName)) {
      throw new NotFoundException('Not found.');
    }
    const path = resolve(join(this.root, tenantDir, fileName));
    if (path !== join(this.root, tenantDir, fileName) || !path.startsWith(this.root + sep)) {
      throw new NotFoundException('Not found.');
    }
    try {
      await stat(path);
    } catch {
      throw new NotFoundException('Not found.');
    }
    const ext = fileName.split('.').pop()!;
    const mime = SIGNATURES.find((s) => s.ext === ext)!.mime;
    return { path, mime };
  }
}
