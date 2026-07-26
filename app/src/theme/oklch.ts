/**
 * OKLCH -> sRGB hex conversion (Björn Ottosson's public-domain OKLab reference matrices).
 * React Native has no CSS oklch() support, so every oklch(...) value in the design spec is
 * converted here at module-load time instead of being hand-eyeballed into approximate hex.
 */
function srgbGamma(x: number): number {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
}

function toHexByte(x: number): string {
  const byte = Math.round(Math.min(1, Math.max(0, x)) * 255);
  return byte.toString(16).padStart(2, "0");
}

/** l: 0-1 lightness, c: chroma, hDeg: hue in degrees. */
export function oklchToHex(l: number, c: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  const rLin = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const gLin = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bLin = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  const r = srgbGamma(rLin);
  const g = srgbGamma(gLin);
  const bl = srgbGamma(bLin);

  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(bl)}`;
}
