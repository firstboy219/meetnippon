/** Domain & subdomain validation helpers — BRD 7.1.1 and 6.4.1. */

const DOMAIN_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

// Reserved subdomains blocked from tenant use (BRD 6.4.1).
export const RESERVED_SUBDOMAINS = new Set([
  'admin',
  'www',
  'api',
  'app',
  'login',
  'mail',
  'support',
  'dashboard',
  'cdn',
  'static',
]);

export function normalizeDomain(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidDomain(input: string): boolean {
  const d = normalizeDomain(input);
  return DOMAIN_RE.test(d);
}

export function extractEmailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  const d = normalizeDomain(email.slice(at + 1));
  return d.length ? d : null;
}

export function isPublicEmailDomain(
  domain: string,
  publicList: string[],
): boolean {
  return publicList.map(normalizeDomain).includes(normalizeDomain(domain));
}

export interface SubdomainCheck {
  ok: boolean;
  reason?: string;
}

/** Validate a tenant subdomain per BRD 6.4.1 (does not check global uniqueness — DB does). */
export function validateSubdomain(input: string): SubdomainCheck {
  const s = normalizeDomain(input);
  if (s.length < 3 || s.length > 30) {
    return { ok: false, reason: 'Subdomain must be 3–30 characters.' };
  }
  if (!/^[a-z0-9-]+$/.test(s)) {
    return {
      ok: false,
      reason: 'Only lowercase letters, digits, and hyphens are allowed.',
    };
  }
  if (s.startsWith('-') || s.endsWith('-')) {
    return { ok: false, reason: 'Cannot start or end with a hyphen.' };
  }
  if (RESERVED_SUBDOMAINS.has(s)) {
    return { ok: false, reason: 'This subdomain is reserved.' };
  }
  return { ok: true };
}
