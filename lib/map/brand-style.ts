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
 *   - neutral greys, like the rest of the app, so severity is the only colour;
 *   - land and water are told apart by lightness, water darker at night;
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

const NIGHT_LAND = "#121212";
const NIGHT_HALO = "rgba(17, 17, 17, 0.92)";

const DARK: Rule[] = [
  { match: /^background$/, color: NIGHT_LAND },
  { match: /^water$/, color: "#090a0b" },
  { match: /^waterway/, color: "#0d0e10" },
  { match: /^water_name/, color: "#454d57", halo: "#090a0b" },
  { match: /landcover_(ice|glacier)/, color: "#181818" },
  { match: /landuse_residential/, color: "#151515" },
  { match: /landcover_wood|landuse_park|^park$/, color: "#141714" },
  { match: /^building/, color: "#191919", outline: "#202020" },
  { match: /^aeroway/, color: "#1a1a1a" },
  { match: /^road_.*pier/, color: NIGHT_LAND },
  { match: /highway_path/, color: "#1b1b1b" },
  { match: /highway_minor/, color: "#1e1e1e" },
  { match: /highway_major_casing/, color: "#0c0c0c" },
  { match: /highway_major_inner/, color: "#292929" },
  { match: /highway_major_subtle/, color: "#222222" },
  { match: /highway_motorway_casing/, color: "#0c0c0c" },
  { match: /highway_motorway_inner/, color: "#383838" },
  { match: /highway_motorway_subtle/, color: "#262626" },
  { match: /railway.*dashline/, color: NIGHT_LAND },
  { match: /^railway/, color: "#202020" },
  // The dark source style sets every label in capitals; the light one does
  // not. Mixed case in both, so switching theme changes colours, not the map.
  { match: /highway_name/, color: "#666666", halo: NIGHT_HALO, layout: { "text-transform": "none" } },
  { match: /boundary_state/, color: "#363636", paint: { "line-dasharray": [3, 2], "line-width": 0.9 } },
  { match: /boundary_country/, color: "#525252" },
  {
    match: /place_city/,
    color: "#c4c4c4",
    halo: NIGHT_HALO,
    paint: { "text-halo-width": 1.4 },
    layout: { "text-transform": "none" },
  },
  {
    match: /place_(town|village|suburb|other)/,
    color: "#858585",
    halo: NIGHT_HALO,
    paint: { "text-halo-width": 1.2 },
    layout: { "text-transform": "none" },
  },
  {
    match: /place_state/,
    color: "#636363",
    halo: NIGHT_HALO,
    paint: { "text-halo-width": 1 },
    layout: { "text-transform": "uppercase", "text-letter-spacing": 0.14, "text-size": 10.5 },
  },
  {
    match: /place_country/,
    color: "#8c8c8c",
    halo: NIGHT_HALO,
    layout: { "text-letter-spacing": 0.08, "text-transform": "none" },
  },
];

const DAY_LAND = "#f4f4f2";
const DAY_HALO = "rgba(250, 250, 250, 0.92)";

const LIGHT: Rule[] = [
  { match: /^background$/, color: DAY_LAND },
  { match: /^park$|landcover_wood|landuse_park/, color: "#e5ebdf" },
  { match: /^water$/, color: "#d5e0e8" },
  { match: /^waterway$/, color: "#d5e0e8" },
  { match: /landcover_(ice|glacier)/, color: "#fbfbfa" },
  { match: /landuse_residential/, color: "#efefec" },
  { match: /^building/, color: "#e9e9e6", outline: "#dededa" },
  { match: /^aeroway-(area|runway)$/, color: "#fbfbfa" },
  { match: /^aeroway/, color: "#e6e6e3" },
  { match: /^road_.*pier/, color: DAY_LAND },
  { match: /highway_path/, color: "#e8e8e5" },
  { match: /highway_minor/, color: "#ffffff" },
  { match: /(highway_major|motorway.*)_casing/, color: "#d9d9d5" },
  { match: /highway_major_inner/, color: "#ffffff" },
  { match: /highway_major_subtle/, color: "#e3e3e0" },
  { match: /motorway.*_inner/, color: "#ffffff" },
  { match: /highway_motorway_subtle/, color: "#dcdcd8" },
  { match: /railway.*dashline/, color: DAY_LAND },
  { match: /^railway/, color: "#d6d6d2" },
  { match: /^boundary/, color: "#b5b5b0" },
  { match: /waterway_line_label|water_name/, color: "#5f7d94", halo: DAY_HALO },
  { match: /highway-name|^airport$/, color: "#7a7a7a", halo: DAY_HALO },
  { match: /label_other/, color: "#666666", halo: DAY_HALO },
  { match: /label_(village|town)/, color: "#4d4d4d", halo: DAY_HALO },
  {
    match: /label_state/,
    color: "#8f8f8f",
    halo: DAY_HALO,
    layout: { "text-transform": "uppercase", "text-letter-spacing": 0.14, "text-size": 10.5 },
  },
  { match: /label_city/, color: "#171717", halo: DAY_HALO, paint: { "text-halo-width": 1.4 } },
  { match: /label_country/, color: "#555555", halo: DAY_HALO, layout: { "text-letter-spacing": 0.08 } },
];

/** For layers no rule names: keep the style's own greys, nudged onto ours. */
const FALLBACK: Record<Theme, { tint: Tint; overrides: TintOverride[] }> = {
  dark: {
    tint: { hue: 0, saturation: 0, lightness: (l) => 3 + l },
    overrides: [],
  },
  light: {
    tint: { hue: 60, saturation: 0, lightness: (l) => l * 0.985 },
    overrides: [],
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
