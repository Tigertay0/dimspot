import { type Tint, type TintOverride, tintStyle } from "./tint-style";

/**
 * The basemap drawn in Dimspot's own palette.
 *
 * OpenFreeMap's "dark" and "positron" styles are greyscale. A blanket hue
 * shift (tint-style.ts) puts them in the right colour family but keeps their
 * contrast decisions, which were made for a map that is the subject. Here the
 * map is the backdrop and outages are the subject, so each group of layers
 * gets a colour chosen for that job:
 *
 *   - land and water are told apart by lightness alone, water darker at night;
 *   - roads form a quiet lattice, motorways one step brighter;
 *   - place names step down from city to town to state, so a zoomed-out map
 *     reads as geography rather than as a page of text;
 *   - state borders are visible, because most live feeds report by county or
 *     state and the eye needs the frame.
 *
 * Rules match OpenFreeMap's layer ids. A layer no rule matches keeps the
 * blanket tint, so a custom style URL (NEXT_PUBLIC_MAP_STYLE_URL) still lands
 * in the palette, just without the per-layer care.
 */

type Theme = "light" | "dark";

interface Rule {
  match: RegExp;
  /** Main colour: fill, line, text or background, by layer type. */
  color?: string;
  /** Fill outline. */
  outline?: string;
  /** Text halo. */
  halo?: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
}

interface LayerLike {
  id?: string;
  type?: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
}

const NIGHT_LAND = "#0e1528";
const NIGHT_HALO = "rgba(12, 18, 34, 0.92)";

const DARK: Rule[] = [
  { match: /^background$/, color: NIGHT_LAND },
  { match: /^water$/, color: "#060b18" },
  { match: /^waterway/, color: "#0a1124" },
  { match: /^water_name/, color: "#3a4874", halo: "#060b18" },
  { match: /landcover_(ice|glacier)/, color: "#131b33" },
  { match: /landuse_residential/, color: "#111a31" },
  { match: /landcover_wood|landuse_park|^park$/, color: "#0f1f2c", paint: { "fill-opacity": 0.85 } },
  { match: /^building/, color: "#151e39", outline: "#1c2748" },
  { match: /^aeroway/, color: "#151d36" },
  { match: /^road_.*pier/, color: NIGHT_LAND },
  { match: /highway_path/, color: "#172142" },
  { match: /highway_minor/, color: "#19234a" },
  { match: /highway_major_casing/, color: "#0a1021" },
  { match: /highway_major_inner/, color: "#222e58" },
  { match: /highway_major_subtle/, color: "#1b2650" },
  { match: /highway_motorway_casing/, color: "#0a1021" },
  { match: /highway_motorway_inner/, color: "#2f3d72" },
  { match: /highway_motorway_subtle/, color: "#1e2a55" },
  { match: /railway.*dashline/, color: NIGHT_LAND },
  { match: /^railway/, color: "#1b2547" },
  { match: /highway_name/, color: "#5a6590", halo: NIGHT_HALO },
  { match: /boundary_state/, color: "#2c3862", paint: { "line-dasharray": [3, 2], "line-width": 0.9 } },
  { match: /boundary_country/, color: "#45548a" },
  {
    match: /place_city/,
    color: "#c9ccd9",
    halo: NIGHT_HALO,
    paint: { "text-halo-width": 1.4 },
  },
  { match: /place_(town|village|suburb|other)/, color: "#8990aa", halo: NIGHT_HALO, paint: { "text-halo-width": 1.2 } },
  {
    match: /place_state/,
    color: "#5d6890",
    halo: NIGHT_HALO,
    paint: { "text-halo-width": 1 },
    layout: { "text-transform": "uppercase", "text-letter-spacing": 0.14, "text-size": 10.5 },
  },
  { match: /place_country/, color: "#8089ad", halo: NIGHT_HALO, layout: { "text-letter-spacing": 0.08 } },
];

const DUSK_LAND = "#f3e8da";
const DUSK_HALO = "rgba(244, 233, 220, 0.92)";

const LIGHT: Rule[] = [
  { match: /^background$/, color: DUSK_LAND },
  { match: /^park$|landcover_wood|landuse_park/, color: "#e1e6d0" },
  { match: /^water$/, color: "#c6d6e3" },
  { match: /^waterway$/, color: "#c6d6e3" },
  { match: /landcover_(ice|glacier)/, color: "#faf5ee" },
  { match: /landuse_residential/, color: "#efe3d3" },
  { match: /^building/, color: "#e9dbc9", outline: "#dfcfb9" },
  { match: /^aeroway-(area|runway)$/, color: "#fbf4e9" },
  { match: /^aeroway/, color: "#e5d7c3" },
  { match: /^road_.*pier/, color: DUSK_LAND },
  { match: /highway_path/, color: "#eadfce" },
  { match: /highway_minor/, color: "#fbf4e8" },
  { match: /(highway_major|motorway.*)_casing/, color: "#d9c8b0" },
  { match: /highway_major_inner/, color: "#fffaf1" },
  { match: /highway_major_subtle/, color: "#e6d8c4" },
  { match: /motorway.*_inner/, color: "#fff7ea" },
  { match: /highway_motorway_subtle/, color: "#e1d2bb" },
  { match: /railway.*dashline/, color: DUSK_LAND },
  { match: /^railway/, color: "#d9cab5" },
  { match: /^boundary/, color: "#b7a68f" },
  { match: /waterway_line_label|water_name/, color: "#56738f", halo: DUSK_HALO },
  { match: /highway-name|^airport$/, color: "#7d7669", halo: DUSK_HALO },
  { match: /label_other/, color: "#5f6170", halo: DUSK_HALO },
  { match: /label_(village|town)/, color: "#3f4350", halo: DUSK_HALO },
  {
    match: /label_state/,
    color: "#8d8676",
    halo: DUSK_HALO,
    layout: { "text-transform": "uppercase", "text-letter-spacing": 0.14, "text-size": 10.5 },
  },
  { match: /label_city/, color: "#161a26", halo: DUSK_HALO, paint: { "text-halo-width": 1.4 } },
  { match: /label_country/, color: "#4a4f5e", halo: DUSK_HALO, layout: { "text-letter-spacing": 0.08 } },
];

/** The blanket tint for layers no rule names. */
const FALLBACK: Record<Theme, { tint: Tint; overrides: TintOverride[] }> = {
  dark: {
    tint: { hue: 224, saturation: 0.4, lightness: (l) => 4 + l * 1.05 },
    overrides: [{ match: /water/, tint: { hue: 228, saturation: 0.45, lightness: (l) => 2 + l * 0.7 } }],
  },
  light: {
    tint: { hue: 32, saturation: 0.35, lightness: (l) => l * 0.965 },
    overrides: [{ match: /water/, tint: { hue: 212, saturation: 0.3, lightness: (l) => l * 0.97 } }],
  },
};

const COLOR_KEY: Record<string, string> = {
  background: "background-color",
  fill: "fill-color",
  line: "line-color",
  symbol: "text-color",
};

function applyRule<L extends LayerLike>(layer: L, rule: Rule): L {
  const paint: Record<string, unknown> = { ...layer.paint };
  const key = layer.type ? COLOR_KEY[layer.type] : undefined;

  if (rule.color && key) paint[key] = rule.color;
  if (rule.outline && layer.type === "fill") paint["fill-outline-color"] = rule.outline;
  if (rule.halo && layer.type === "symbol") paint["text-halo-color"] = rule.halo;
  Object.assign(paint, rule.paint);

  return {
    ...layer,
    paint,
    ...(rule.layout ? { layout: { ...layer.layout, ...rule.layout } } : {}),
  };
}

/** A copy of `style` in the app's palette for `theme`. */
export function brandStyle<T extends { layers: LayerLike[] }>(style: T, theme: Theme): T {
  const rules = theme === "dark" ? DARK : LIGHT;
  const { tint, overrides } = FALLBACK[theme];
  const tinted = tintStyle(style, tint, overrides);

  return {
    ...tinted,
    layers: tinted.layers.map((layer, index) => {
      const rule = rules.find((r) => r.match.test(layer.id ?? ""));
      // Rules start from the untinted layer: their colours are final values,
      // and the tint has nothing to add to them.
      return rule ? applyRule(style.layers[index], rule) : layer;
    }),
  };
}
