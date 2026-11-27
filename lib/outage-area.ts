import { boundsOf, decodePolyline, ringsToGeometry, type Position } from "@/lib/polyline";
import type { OutageArea } from "@/lib/types";

/**
 * Turning a stored outage into something to draw when it is selected.
 *
 * Utility maps report an area (a ZIP code or a county) and say how many of its
 * customers are out, so for those the app draws the area itself. Every other
 * source gives one point. For those the honest picture is a soft circle whose
 * size follows what is known (customers out, or households reporting) and
 * which the app labels as approximate. It never stands in for an outline.
 */

/**
 * Customers per square kilometre, used only to size an estimate. Utility
 * customers are mostly households, and this is a suburban density: in a city
 * the circle is too big, in the country too small. It answers "a few streets
 * or a few towns?", which is all a circle around one point can say.
 */
const CUSTOMERS_PER_KM2 = 250;
const MIN_RADIUS_M = 250;
const MAX_RADIUS_M = 12_000;

export function estimateRadius(input: {
  customersAffected: number | null;
  origin: "official" | "crowdsourced";
  verificationCount: number;
}): { radiusMeters: number; basis: "customers" | "reports" | "default" } {
  const customers = input.customersAffected;
  if (customers !== null && customers > 0) {
    const km = Math.sqrt(customers / (Math.PI * CUSTOMERS_PER_KM2));
    return {
      radiusMeters: Math.round(Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, km * 1000))),
      basis: "customers",
    };
  }
  if (input.origin === "crowdsourced") {
    // One household is a street; each more household from another network
    // widens it, up to a neighbourhood.
    const reports = Math.max(1, input.verificationCount);
    return { radiusMeters: Math.min(1500, 300 + 200 * (reports - 1)), basis: "reports" };
  }
  return { radiusMeters: 500, basis: "default" };
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export interface StoredOutageArea {
  latitude: number;
  longitude: number;
  origin: "official" | "crowdsourced";
  verificationCount: number;
  /** From metadata, as stored: not trusted to be well formed. */
  area: unknown;
  customersAffected: unknown;
  customersServed: unknown;
}

export function buildOutageArea(stored: StoredOutageArea): OutageArea {
  const customersAffected = count(stored.customersAffected);

  if (Array.isArray(stored.area) && stored.area.length > 0) {
    const rings: Position[][] = [];
    for (const encoded of stored.area) {
      if (typeof encoded !== "string") continue;
      const ring = decodePolyline(encoded);
      if (ring && ring.length >= 4) rings.push(ring);
    }
    const geometry = ringsToGeometry(rings);
    if (geometry) {
      const served = count(stored.customersServed);
      return {
        kind: "outline",
        geometry,
        bounds: boundsOf(geometry),
        customersAffected,
        // A total below the count out is a feed error, not a share to show.
        customersServed:
          served !== null && (customersAffected === null || served >= customersAffected)
            ? served
            : null,
      };
    }
  }

  return {
    kind: "estimate",
    latitude: stored.latitude,
    longitude: stored.longitude,
    ...estimateRadius({
      customersAffected,
      origin: stored.origin,
      verificationCount: stored.verificationCount,
    }),
  };
}
