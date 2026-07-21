/**
 * Secret encryption. No database — this is the primitive that decides whether
 * a tenant's SMTP password is safe at rest, so it is tested on its own.
 */
import { encryptSecret, decryptSecret, resetSecretBoxKey, secretEquals } from '../src/common/secret-box';

const KEY = 'a'.repeat(64);

beforeEach(() => {
  process.env.MAIL_SECRET_KEY = KEY;
  resetSecretBoxKey();
});
afterAll(() => {
  delete process.env.MAIL_SECRET_KEY;
  resetSecretBoxKey();
});

describe('encrypt / decrypt', () => {
  it('round-trips a value', () => {
    const secret = 'abcd efgh ijkl mnop';
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('never stores the plaintext', () => {
    const secret = 'super-secret-app-password';
    const box = encryptSecret(secret);
    expect(box).not.toContain(secret);
    expect(box.startsWith('v1:')).toBe(true);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encryptSecret('same');
    const b = encryptSecret('same');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('same');
    expect(decryptSecret(b)).toBe('same');
  });

  it('handles unicode and long values', () => {
    const s = 'pässwörd–日本語 '.repeat(20);
    expect(decryptSecret(encryptSecret(s))).toBe(s);
  });

  it('treats an empty secret as empty, not as an error', () => {
    expect(encryptSecret('')).toBe('');
    expect(decryptSecret('')).toBeNull();
  });
});

describe('tampering and wrong keys', () => {
  it('refuses a value whose ciphertext was altered', () => {
    const box = encryptSecret('original');
    const parts = box.split(':');
    // flip a character in the ciphertext segment
    parts[3] = (parts[3][0] === 'A' ? 'B' : 'A') + parts[3].slice(1);
    expect(decryptSecret(parts.join(':'))).toBeNull();
  });

  it('refuses a value whose auth tag was altered', () => {
    const parts = encryptSecret('original').split(':');
    parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
    expect(decryptSecret(parts.join(':'))).toBeNull();
  });

  it('returns null rather than throwing on malformed input', () => {
    for (const bad of ['nonsense', 'v1:only:three', 'v9:a:b:c', ':::']) {
      expect(decryptSecret(bad)).toBeNull();
    }
  });

  it('cannot be read with a different key', () => {
    const box = encryptSecret('secret');
    process.env.MAIL_SECRET_KEY = 'b'.repeat(64);
    resetSecretBoxKey();
    expect(decryptSecret(box)).toBeNull();
  });

  it('derives a key from JWT_ACCESS_SECRET when no explicit key is set', () => {
    delete process.env.MAIL_SECRET_KEY;
    process.env.JWT_ACCESS_SECRET = 'c'.repeat(64);
    resetSecretBoxKey();
    const box = encryptSecret('derived');
    expect(decryptSecret(box)).toBe('derived');
    // and that key is not interchangeable with the explicit one
    process.env.MAIL_SECRET_KEY = KEY;
    resetSecretBoxKey();
    expect(decryptSecret(box)).toBeNull();
  });
});

describe('constant-time compare', () => {
  it('matches equal values and rejects others', () => {
    expect(secretEquals('abc', 'abc')).toBe(true);
    expect(secretEquals('abc', 'abd')).toBe(false);
    expect(secretEquals('abc', 'abcd')).toBe(false);
    expect(secretEquals('', '')).toBe(true);
  });
});
