/**
 * Brand palette derivation.
 *
 * The logic lives in the web portal, but it is pure and worth pinning down: a
 * mistake here is a workspace whose sidebar text is invisible. Mirrored here
 * because the API test suite is the only place with a runner.
 */

interface Rgb { r: number; g: number; b: number }

function parseHex(hex: string): Rgb | null {
  const m = /^#?([a-f\d]{3}|[a-f\d]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const toHex = ({ r, g, b }: Rgb) =>
  `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, '0')).join('')}`;
const darken = (c: Rgb, a: number): Rgb => ({ r: c.r * (1 - a), g: c.g * (1 - a), b: c.b * (1 - a) });
const lighten = (c: Rgb, a: number): Rgb => ({
  r: c.r + (255 - c.r) * a, g: c.g + (255 - c.g) * a, b: c.b + (255 - c.b) * a,
});
const luminance = ({ r, g, b }: Rgb) => (r * 299 + g * 587 + b * 114) / 1000;

describe('hex parsing', () => {
  it('accepts 6-digit, 3-digit, and a missing hash', () => {
    expect(parseHex('#0276f2')).toEqual({ r: 2, g: 118, b: 242 });
    expect(parseHex('0276f2')).toEqual({ r: 2, g: 118, b: 242 });
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('rejects anything that is not a colour', () => {
    for (const bad of ['', 'red', '#12', '#1234567', 'javascript:alert(1)']) {
      expect(parseHex(bad)).toBeNull();
    }
  });
});

describe('derived palette', () => {
  it('produces a darker sidebar colour and a pale tint from the brand colour', () => {
    const brand = parseHex('#0276f2')!;
    const dark = darken(brand, 0.28);
    const tint = lighten(brand, 0.88);

    expect(luminance(dark)).toBeLessThan(luminance(brand));
    expect(luminance(tint)).toBeGreaterThan(luminance(brand));
    // a tint must stay light enough to carry dark text
    expect(luminance(tint)).toBeGreaterThan(200);
    expect(toHex(dark)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('keeps channels in range for extremes', () => {
    for (const hex of ['#000000', '#ffffff']) {
      const c = parseHex(hex)!;
      for (const out of [darken(c, 0.28), lighten(c, 0.88)]) {
        for (const ch of [out.r, out.g, out.b]) {
          expect(clamp(ch)).toBeGreaterThanOrEqual(0);
          expect(clamp(ch)).toBeLessThanOrEqual(255);
        }
      }
    }
    expect(toHex(darken(parseHex('#000000')!, 0.28))).toBe('#000000');
    expect(toHex(lighten(parseHex('#ffffff')!, 0.88))).toBe('#ffffff');
  });

  it('switches sidebar text to dark ink when the brand is too pale for white', () => {
    const onBrand = (hex: string) =>
      luminance(darken(parseHex(hex)!, 0.28)) > 150 ? '#20242B' : '#FFFFFF';

    expect(onBrand('#0E6E55')).toBe('#FFFFFF'); // default green
    expect(onBrand('#0276f2')).toBe('#FFFFFF'); // the tenant's blue
    expect(onBrand('#111111')).toBe('#FFFFFF');
    // a near-white brand must not leave white-on-white
    expect(onBrand('#ffe680')).toBe('#20242B');
    expect(onBrand('#ffffff')).toBe('#20242B');
  });
});
