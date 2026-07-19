import {
  isValidDomain,
  extractEmailDomain,
  isPublicEmailDomain,
  validateSubdomain,
} from '../src/common/domain.util';

describe('domain.util', () => {
  it('validates domains', () => {
    expect(isValidDomain('nipsea.co.id')).toBe(true);
    expect(isValidDomain('sub.example.com')).toBe(true);
    expect(isValidDomain('not a domain')).toBe(false);
    expect(isValidDomain('http://x.com')).toBe(false);
  });

  it('extracts email domain', () => {
    expect(extractEmailDomain('a.b@Nipsea.co.id')).toBe('nipsea.co.id');
    expect(extractEmailDomain('bad')).toBeNull();
  });

  it('flags public email domains', () => {
    const list = ['gmail.com', 'yahoo.com'];
    expect(isPublicEmailDomain('GMAIL.com', list)).toBe(true);
    expect(isPublicEmailDomain('nipsea.co.id', list)).toBe(false);
  });

  it('validates subdomains per BRD 6.4.1', () => {
    expect(validateSubdomain('nipsea').ok).toBe(true);
    expect(validateSubdomain('ab').ok).toBe(false); // too short
    expect(validateSubdomain('-lead').ok).toBe(false);
    expect(validateSubdomain('has_underscore').ok).toBe(false);
    expect(validateSubdomain('admin').ok).toBe(false); // reserved
  });
});
