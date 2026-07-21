import {
  createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual,
} from 'crypto';

/**
 * Authenticated encryption for secrets we must be able to read back — today
 * only tenant SMTP passwords, which the mail transport needs in cleartext.
 *
 * AES-256-GCM, so tampering is detected rather than silently decrypting to
 * garbage. Format is `v1:<iv>:<tag>:<ciphertext>`, all base64url; the version
 * prefix leaves room to rotate the scheme without guessing at old rows.
 *
 * This is NOT for passwords we only ever need to compare — those are hashed
 * with argon2 and must stay one-way.
 */

const VERSION = 'v1';
const IV_BYTES = 12; // GCM standard nonce length
const KEY_BYTES = 32;

let cachedKey: Buffer | null = null;

/**
 * The encryption key.
 *
 * Prefers an explicit MAIL_SECRET_KEY. Falls back to deriving one from
 * JWT_ACCESS_SECRET — which is already required, so existing deployments keep
 * working — via scrypt with a purpose-specific salt, giving a key that is
 * independent of the signing key rather than a reuse of it.
 */
function key(): Buffer {
  if (cachedKey) return cachedKey;

  const explicit = process.env.MAIL_SECRET_KEY;
  if (explicit && explicit.length >= 32) {
    cachedKey = scryptSync(explicit, 'meetnippon/secret-box/v1', KEY_BYTES);
    return cachedKey;
  }

  const fallback = process.env.JWT_ACCESS_SECRET;
  if (!fallback) {
    throw new Error(
      'Cannot encrypt secrets: set MAIL_SECRET_KEY (or JWT_ACCESS_SECRET).',
    );
  }
  cachedKey = scryptSync(fallback, 'meetnippon/secret-box/derived/v1', KEY_BYTES);
  return cachedKey;
}

/** Test seam — the key is cached, so a changed env needs an explicit reset. */
export function resetSecretBoxKey(): void {
  cachedKey = null;
}

export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    data.toString('base64url'),
  ].join(':');
}

/**
 * Returns null for anything that does not decrypt cleanly — a wrong key, a
 * truncated value, or a tampered one. Callers treat that as "no secret
 * available" rather than crashing a request path.
 */
export function decryptSecret(stored: string): string | null {
  if (!stored) return null;
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const data = Buffer.from(parts[3], 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== 16) return null;
    const decipher = createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Constant-time equality, for comparing secrets without leaking length/prefix. */
export function secretEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
