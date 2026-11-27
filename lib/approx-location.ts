import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface ApproxLocation {
  latitude: number;
  longitude: number;
  /** ISO 3166-1 alpha-2, as Cloudflare reports it. */
  country: string | null;
}

/** What Cloudflare attaches to a request about where it came from. */
export function readApproxLocation(cf: unknown): ApproxLocation | null {
  if (!cf || typeof cf !== "object") return null;
  const { latitude, longitude, country } = cf as Record<string, unknown>;

  const lat = Number(latitude);
  const lng = Number(longitude);
  if (latitude == null || longitude == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  return {
    // City-level is all this is good for, and all the map needs to open on
    // the right metro area. Rounded so nothing finer is ever sent back.
    latitude: Math.round(lat * 10) / 10,
    longitude: Math.round(lng * 10) / 10,
    country: typeof country === "string" ? country : null,
  };
}

/**
 * Roughly where this request came from, from the network address alone.
 *
 * Cloudflare works it out at the edge for every request; nothing is asked of
 * the browser, so there is no permission prompt, and nothing is stored. It lets
 * the map open on the visitor's region instead of the whole country. Null
 * anywhere but on Cloudflare (local development, tests).
 */
export function approxLocation(): ApproxLocation | null {
  try {
    return readApproxLocation((getCloudflareContext() as { cf?: unknown }).cf);
  } catch {
    return null;
  }
}
