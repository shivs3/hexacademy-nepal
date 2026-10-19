/**
 * WCAG contrast of white text on a hex colour. Used only to give editors live
 * feedback; the backend (sanitize.validate_brand_color) enforces the limits.
 */
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function channel(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function contrastWithWhite(hex: string): number | null {
  if (!HEX_COLOR.test(hex)) return null;
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  return 1.05 / (lum + 0.05);
}
