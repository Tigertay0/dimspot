/**
 * Re-tints a MapLibre style so the basemap belongs to the app's palette: every
 * colour keeps its lightness (so roads, water and labels keep their contrast)
 * but moves onto one hue, e.g. the night navy or the dusk cream. Colours that
 * are already more saturated than the tint keep their own saturation, so parks
 * and water still read as different things.
 */

export interface Tint {
  /** Target hue, 0-360. */
  hue: number;
  /** Minimum saturation, 0-1. */
  saturation: number;
  /** Optional remap of lightness (0-100 in, 0-100 out). */
  lightness?: (l: number) => number;
}

interface Hsla {
  h: number;
  s: number;
  l: number;
  a: number | null;
}

function rgbToHsl(r: number, g: number, b: number, a: number | null): Hsla {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100, a };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100, a };
}

function parseColor(input: string): Hsla | null {
  const css = input.trim().toLowerCase();

  const hex = /^#([0-9a-f]{3,8})$/.exec(css);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) digits = [...digits].map((c) => c + c).join("");
    if (digits.length !== 6 && digits.length !== 8) return null;
    const n = (i: number) => parseInt(digits.slice(i, i + 2), 16);
    return rgbToHsl(n(0), n(2), n(4), digits.length === 8 ? n(6) / 255 : null);
  }

  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(css);
  if (!fn) return null;
  const parts = fn[2]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map((p) => p.trim());
  if (parts.length < 3) return null;
  const num = (p: string) => parseFloat(p);
  const alpha = parts[3] !== undefined ? (parts[3].endsWith("%") ? num(parts[3]) / 100 : num(parts[3])) : null;
  if (parts.slice(0, 3).some((p) => Number.isNaN(num(p)))) return null;

  if (fn[1].startsWith("rgb")) return rgbToHsl(num(parts[0]), num(parts[1]), num(parts[2]), alpha);
  return { h: num(parts[0]), s: num(parts[1]), l: num(parts[2]), a: alpha };
}

/** Returns the colour moved onto the tint, or null when `css` is not a colour. */
export function tintColor(css: string, tint: Tint): string | null {
  const c = parseColor(css);
  if (!c) return null;
  const s = Math.round(Math.max(c.s, tint.saturation * 100));
  const lRaw = tint.lightness ? tint.lightness(c.l) : c.l;
  const l = Math.round(Math.min(100, Math.max(0, lRaw)));
  const base = `hsl(${tint.hue} ${s}% ${l}%`;
  return c.a === null || c.a === 1 ? `${base})` : `${base} / ${+c.a.toFixed(3)})`;
}

function tintValue(value: unknown, tint: Tint): unknown {
  if (typeof value === "string") return tintColor(value, tint) ?? value;
  if (Array.isArray(value)) return value.map((v) => tintValue(v, tint));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, tintValue(v, tint)]));
  }
  return value;
}

interface StyleLike {
  layers: { id?: string; paint?: Record<string, unknown> }[];
}

/** A different tint for layers whose id matches, e.g. water. */
export interface TintOverride {
  match: RegExp;
  tint: Tint;
}

/** A copy of the style with every paint colour tinted. Layout (fonts, icons) is untouched. */
export function tintStyle<T extends StyleLike>(style: T, tint: Tint, overrides: TintOverride[] = []): T {
  return {
    ...style,
    layers: style.layers.map((layer) => {
      if (!layer.paint) return layer;
      const own = overrides.find((o) => o.match.test(layer.id ?? ""))?.tint ?? tint;
      return {
        ...layer,
        paint: Object.fromEntries(
          Object.entries(layer.paint).map(([key, value]) => [key, key.endsWith("color") ? tintValue(value, own) : value]),
        ),
      };
    }),
  };
}
