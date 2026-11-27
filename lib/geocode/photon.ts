import { z } from "zod";
import type { GeocodeResult } from "@/lib/types";

/**
 * Search-as-you-type suggestions, from Photon (komoot's geocoder over
 * OpenStreetMap data).
 *
 * Nominatim, which the app used for this before, matches whole words only and
 * its usage policy forbids autocomplete: typing "beth" found nothing until the
 * word was finished. Photon is built for prefixes, takes a point to bias
 * towards, and needs no key. Nominatim still answers a submitted search and
 * the reverse lookup, where its house-number data for the US is better.
 */
export const PHOTON_BASE = process.env.PHOTON_BASE_URL ?? "https://photon.komoot.io";

/** West, south, east, north: the fifty states and Puerto Rico. */
const US_BBOX = "-179.2,17.6,-64.5,71.6";

const featureSchema = z.object({
  geometry: z.object({
    coordinates: z.tuple([z.number().finite(), z.number().finite()]),
  }),
  properties: z.object({
    osm_type: z.string().optional(),
    osm_id: z.union([z.number(), z.string()]).optional(),
    osm_key: z.string().optional(),
    osm_value: z.string().optional(),
    type: z.string().optional(),
    name: z.string().optional(),
    housenumber: z.string().optional(),
    street: z.string().optional(),
    locality: z.string().optional(),
    district: z.string().optional(),
    city: z.string().optional(),
    county: z.string().optional(),
    state: z.string().optional(),
    postcode: z.string().optional(),
    countrycode: z.string().optional(),
  }),
});

export type PhotonFeature = z.infer<typeof featureSchema>;

/**
 * OSM keys that are places someone would search an outage map for. Photon also
 * indexes every shop, church and bus stop, which is noise here: "beth" should
 * offer Bethesda, not three congregations.
 */
const PLACE_KEYS = new Set(["place", "boundary", "highway", "building", "landuse"]);

/** Road-side furniture is tagged `highway` too; only real ways are places. */
const NOT_A_ROAD = new Set(["bus_stop", "traffic_signals", "crossing", "stop", "street_lamp"]);

/** A query with a house number in it is an address being typed. */
const looksLikeAddress = (query: string) => /\d/.test(query);

function isPlace(feature: PhotonFeature, query: string): boolean {
  const { osm_key: key, osm_value: value, type, housenumber } = feature.properties;
  if (type === "house") {
    // A numbered building answers an address, whatever is in it. Without a
    // number in the query the match was on a business's name, which is not a
    // place to look for outages.
    return Boolean(housenumber) && looksLikeAddress(query);
  }
  if (!key || !PLACE_KEYS.has(key)) return false;
  if (key === "highway" && value && NOT_A_ROAD.has(value)) return false;
  return true;
}

function zoomFor(feature: PhotonFeature): number {
  const { type, osm_value: value } = feature.properties;
  if (value === "postcode") return 13;
  switch (type) {
    case "house":
      return 16;
    case "street":
      return 15;
    case "locality":
    case "district":
      return 13;
    case "city":
      // A hamlet and a metropolis are both "city" to Photon.
      return value === "city" ? 11 : 12;
    case "county":
      return 9;
    case "state":
      return 6;
    default:
      return 12;
  }
}

/** "Montgomery" in the data, "Montgomery County" to a reader. */
function countyName(county: string | undefined): string | null {
  if (!county) return null;
  return /(county|parish|borough|municipality|census area)$/i.test(county)
    ? county
    : `${county} County`;
}

/**
 * The first line names the thing, the second says where it is. Joined with
 * ", " into `label`, which is the form the search box and the report sheet
 * already split on.
 */
function describe(feature: PhotonFeature): { title: string; context: string[] } {
  const p = feature.properties;

  if (p.type === "house" && p.housenumber && p.street) {
    return { title: `${p.housenumber} ${p.street}`, context: [p.city, p.state].filter(isText) };
  }
  if (p.osm_value === "postcode" && p.name) {
    return {
      title: p.name,
      context: [p.city ?? countyName(p.county), p.state].filter(isText),
    };
  }

  if (p.type === "state" && p.name) return { title: p.name, context: ["State"] };
  if (p.type === "county" && p.name) {
    return { title: countyName(p.name) ?? p.name, context: [p.state].filter(isText) };
  }

  const title = p.name ?? p.street ?? p.city ?? p.county ?? p.state ?? "";
  const context: Array<string | null | undefined> = [];
  if (p.type === "street" || p.type === "locality" || p.type === "district" || p.type === "house") {
    context.push(p.city ?? countyName(p.county));
  } else if (p.type === "city" || p.type === "other") {
    context.push(p.city && p.city !== title ? p.city : null);
  }
  if (p.state && p.state !== title) context.push(p.state);

  return { title, context: context.filter(isText) };
}

function isText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Photon's answer as suggestions: places only, inside the allowed countries,
 * one row per distinct label (a city is in OSM as a node and as a boundary).
 */
export function toSuggestions(
  body: unknown,
  { query, countries, limit = 6 }: { query: string; countries: string[]; limit?: number },
): GeocodeResult[] {
  const features = z.object({ features: z.array(z.unknown()) }).safeParse(body);
  if (!features.success) throw new Error("Photon did not return a feature list");

  const zipQuery = /^\d{5}$/.test(query.trim());
  const seen = new Set<string>();
  const results: GeocodeResult[] = [];
  const zips: GeocodeResult[] = [];

  for (const raw of features.data.features) {
    // One malformed feature drops that suggestion, not the list.
    const parsed = featureSchema.safeParse(raw);
    if (!parsed.success) continue;
    const feature = parsed.data;
    const p = feature.properties;

    if (p.countrycode && !countries.includes(p.countrycode.toLowerCase())) continue;
    if (!isPlace(feature, query)) continue;

    const { title, context } = describe(feature);
    if (!title) continue;
    const label = [title, ...context].join(", ");
    if (seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());

    const [longitude, latitude] = feature.geometry.coordinates;
    const result: GeocodeResult = {
      id: `photon-${p.osm_type ?? "x"}${p.osm_id ?? `${latitude},${longitude}`}`,
      label,
      latitude,
      longitude,
      zoom: zoomFor(feature),
      city: p.city ?? (p.type === "city" ? (p.name ?? null) : null),
      state: p.state ?? null,
      zipCode: p.osm_value === "postcode" ? (p.name ?? null) : (p.postcode ?? null),
    };

    if (p.osm_value === "postcode") zips.push(result);
    results.push(result);
  }

  // Five digits is a ZIP code: a street that happens to contain them is not
  // what was asked for.
  return (zipQuery && zips.length > 0 ? zips : results).slice(0, limit);
}

/**
 * Photon matches the words as written, and OSM spells street types out:
 * "bradley blvd" finds nothing, "bradley boulevard" finds the road. Only a
 * word after the first is expanded, so "St Louis" and "Dr Phillips" survive.
 */
const STREET_TYPES: Record<string, string> = {
  ave: "avenue",
  av: "avenue",
  blvd: "boulevard",
  cir: "circle",
  ct: "court",
  dr: "drive",
  hwy: "highway",
  ln: "lane",
  pkwy: "parkway",
  pl: "place",
  rd: "road",
  sq: "square",
  st: "street",
  ter: "terrace",
  trl: "trail",
};

const STREET_WORD = new RegExp(`\\b(${[...new Set(Object.values(STREET_TYPES)), "way"].join("|")})\\b`, "i");

export function expandStreetTypes(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .map((word, index) => {
      const bare = word.toLowerCase().replace(/[.,]$/, "");
      return index > 0 && STREET_TYPES[bare] ? STREET_TYPES[bare] : word;
    })
    .join(" ");
}

/** The Photon request for a prefix, biased towards where the map is looking. */
export function suggestUrl(
  query: string,
  bias: { latitude: number; longitude: number; zoom: number } | null,
): string {
  const params = new URLSearchParams({
    q: expandStreetTypes(query),
    // More than are shown: duplicates (a road is many segments) are merged.
    limit: "15",
    lang: "en",
    bbox: US_BBOX,
  });
  const expanded = params.get("q") ?? query;
  const zip = /^\d{3,5}$/.test(query.trim());
  // A road or an address is a local thing: the nearest Main Street is wanted,
  // not the most famous one.
  const local = looksLikeAddress(query) || STREET_WORD.test(expanded);

  // Places, not the shops and bus stops Photon also indexes. Buildings only
  // once a house number is being typed. A ZIP code is in none of these layers,
  // so digits alone search everything and toSuggestions keeps the postcodes.
  if (!zip) {
    for (const layer of ["city", "district", "locality", "street", "county", "state"]) {
      params.append("layer", layer);
    }
    if (looksLikeAddress(query)) params.append("layer", "house");
  }

  if (bias) {
    params.set("lat", bias.latitude.toFixed(3));
    params.set("lon", bias.longitude.toFixed(3));
    // Photon's zoom is the reach of the bias, and the scale is how much a
    // place's prominence counts against its distance. For a place name: two
    // levels wider than the map and prominence weighted high, so "beth" over
    // Maryland leads with Bethesda while "chica" still finds Chicago. For a
    // road: the map's own reach, and distance first.
    const zoom = local ? Math.min(14, Math.max(8, bias.zoom)) : Math.min(9, Math.max(4, bias.zoom - 2));
    params.set("zoom", String(Math.round(zoom)));
    params.set("location_bias_scale", local ? "0.2" : "0.8");
  }
  return `${PHOTON_BASE}/api/?${params}`;
}

/** The Photon request for "what address is at this point". */
export function reverseUrl(latitude: number, longitude: number): string {
  const params = new URLSearchParams({
    lat: latitude.toFixed(5),
    lon: longitude.toFixed(5),
    lang: "en",
    limit: "1",
    // Kilometres. Past that the nearest building is not where the pin is.
    radius: "1",
  });
  // An address or the road, not the nearest shop's name.
  params.append("layer", "house");
  params.append("layer", "street");
  return `${PHOTON_BASE}/reverse?${params}`;
}

/**
 * The address at a point, from Photon's reverse answer, or null when it has
 * none nearby (the caller then asks Nominatim).
 *
 * Built from the address fields only. The nearest object is often a business,
 * and "Pescadeli" is not where someone's power is out; "4960 Bethesda Avenue"
 * is.
 */
export function toReversePlace(
  body: unknown,
  { countries }: { countries: string[] },
): GeocodeResult | null {
  const features = z.object({ features: z.array(z.unknown()) }).safeParse(body);
  if (!features.success) throw new Error("Photon did not return a feature list");

  const parsed = featureSchema.safeParse(features.data.features[0]);
  if (!parsed.success) return null;
  const p = parsed.data.properties;
  if (p.countrycode && !countries.includes(p.countrycode.toLowerCase())) return null;

  const road = p.street ?? (p.type === "street" ? p.name : undefined);
  const title = road ? (p.housenumber ? `${p.housenumber} ${road}` : road) : p.name;
  if (!title) return null;

  const [longitude, latitude] = parsed.data.geometry.coordinates;
  return {
    id: `photon-${p.osm_type ?? "x"}${p.osm_id ?? `${latitude},${longitude}`}`,
    label: [title, p.city ?? countyName(p.county), p.state].filter(isText).join(", "),
    latitude,
    longitude,
    zoom: 16,
    city: p.city ?? null,
    state: p.state ?? null,
    zipCode: p.postcode ?? null,
  };
}
