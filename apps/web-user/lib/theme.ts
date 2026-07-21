/**
 * Turns the two branding colours into the full palette the stylesheet uses.
 *
 * The CSS is built on families, not single colours: the sidebar is
 * `--teal-dark`, hovers and selected states are `--teal-tint`, badges are
 * `--coral-tint`. Setting only `--teal` and `--coral` left the sidebar and every
 * tint at the original green, so a rebranded workspace came out half-changed.
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

/** Mix toward black. amount 0..1 */
const darken = (c: Rgb, amount: number): Rgb => ({
  r: c.r * (1 - amount), g: c.g * (1 - amount), b: c.b * (1 - amount),
});

/** Mix toward white. amount 0..1 */
const lighten = (c: Rgb, amount: number): Rgb => ({
  r: c.r + (255 - c.r) * amount,
  g: c.g + (255 - c.g) * amount,
  b: c.b + (255 - c.b) * amount,
});

/**
 * Perceived brightness (ITU-R BT.601). Used to keep text legible on a brand
 * colour an admin may have chosen without thinking about contrast.
 */
const luminance = ({ r, g, b }: Rgb) => (r * 299 + g * 587 + b * 114) / 1000;

export interface BrandColors {
  primaryColor?: string | null;
  accentColor?: string | null;
}

/**
 * Apply a tenant's colours to the document.
 *
 * Safe to call repeatedly; passing nothing leaves the stylesheet defaults in
 * place rather than writing empty values.
 */
export function applyBrandTheme(b: BrandColors | null | undefined): void {
  if (typeof document === 'undefined' || !b) return;
  const root = document.documentElement;

  const primary = b.primaryColor ? parseHex(b.primaryColor) : null;
  if (primary) {
    root.style.setProperty('--teal', toHex(primary));
    root.style.setProperty('--teal-dark', toHex(darken(primary, 0.28)));
    root.style.setProperty('--teal-tint', toHex(lighten(primary, 0.88)));
    // The sidebar paints its text on --teal-dark. A pale brand colour would
    // leave white-on-white, so flip to dark ink when the dark variant is still
    // bright.
    const onDark = luminance(darken(primary, 0.28)) > 150 ? '#20242B' : '#FFFFFF';
    root.style.setProperty('--on-brand', onDark);
  }

  const accent = b.accentColor ? parseHex(b.accentColor) : null;
  if (accent) {
    root.style.setProperty('--coral', toHex(accent));
    root.style.setProperty('--coral-tint', toHex(lighten(accent, 0.88)));
  }
}
