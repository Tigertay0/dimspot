"use client";

import { Layer, Source } from "react-map-gl/maplibre";
import type { OutageArea } from "@/lib/types";

/**
 * The selected outage drawn as an area instead of a pin.
 *
 * Two looks, so the map never presents a guess as a measurement:
 *
 *   - An outline the utility reported (a ZIP code, a county) is filled and
 *     edged. The fill deepens with the share of the area's customers who are
 *     out: a pale wash for a few streets, a strong red when most of it is dark.
 *   - An estimate around a single point is a soft glow with no edge: warm at
 *     the centre, fading to nothing, sized in metres so it holds its ground
 *     size at every zoom.
 *
 * Colours are fixed hex for the same reason as the heat layer's: MapLibre
 * cannot read the theme's CSS variables. Both hold up on light and dark maps.
 */

const FILL_RAMP = [
  "interpolate",
  ["linear"],
  ["get", "share"],
  0,
  "#fbbf24",
  0.15,
  "#f97316",
  0.5,
  "#ef4444",
  1,
  "#dc2626",
] as const;

/** World size in pixels at zoom 0 for MapLibre's 512px tiles, per metre at the equator. */
const PIXELS_PER_METRE_Z0 = 512 / 40_075_016.686;

export function AreaLayer({ area, beforeId }: { area: OutageArea; beforeId?: string }) {
  if (area.kind === "outline") {
    const share =
      area.customersServed && area.customersAffected !== null
        ? Math.min(1, area.customersAffected / area.customersServed)
        : 0.15;

    return (
      <Source
        id="outage-outline-source"
        type="geojson"
        data={{ type: "Feature", geometry: area.geometry, properties: { share } }}
      >
        <Layer
          id="outage-outline-fill"
          type="fill"
          beforeId={beforeId}
          paint={{
            // MapLibre's expression type is stricter than a readonly tuple.
            "fill-color": FILL_RAMP as unknown as string,
            "fill-opacity": ["interpolate", ["linear"], ["get", "share"], 0, 0.18, 0.5, 0.34, 1, 0.42],
          }}
        />
        <Layer
          id="outage-outline-edge"
          type="line"
          beforeId={beforeId}
          paint={{
            "line-color": FILL_RAMP as unknown as string,
            "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.25, 14, 2.5],
            "line-opacity": 0.9,
          }}
        />
      </Source>
    );
  }

  // Ground metres to screen pixels at this latitude, doubling with each zoom
  // level, so the glow covers the same streets whatever the zoom.
  const pixelsAtZ0 =
    (area.radiusMeters * PIXELS_PER_METRE_Z0) / Math.cos((area.latitude * Math.PI) / 180);

  return (
    <>
      {/* The extent: a faint wash with a dashed edge. Dashed, like an
          unconfirmed marker, because it is a guess at the reach, not a line
          anyone drew. */}
      <Source
        id="outage-estimate-source"
        type="geojson"
        data={{
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [circleRing(area)] },
          properties: {},
        }}
      >
        <Layer
          id="outage-estimate-fill"
          type="fill"
          beforeId={beforeId}
          paint={{ "fill-color": "#f97316", "fill-opacity": 0.1 }}
        />
        <Layer
          id="outage-estimate-edge"
          type="line"
          beforeId={beforeId}
          paint={{
            "line-color": "#f97316",
            "line-width": 1.75,
            "line-opacity": 0.85,
            "line-dasharray": [2, 2],
          }}
        />
      </Source>
      {/* The likely centre: warm where the report is, fading outwards. */}
      <Source
        id="outage-estimate-glow-source"
        type="geojson"
        data={{
          type: "Feature",
          geometry: { type: "Point", coordinates: [area.longitude, area.latitude] },
          properties: {},
        }}
      >
        <Layer
          id="outage-estimate-glow"
          type="circle"
          beforeId={beforeId}
          paint={{
            "circle-radius": [
              "interpolate",
              ["exponential", 2],
              ["zoom"],
              0,
              pixelsAtZ0,
              22,
              pixelsAtZ0 * 2 ** 22,
            ],
            "circle-color": "#f97316",
            "circle-opacity": 0.5,
            // 1 fades from the centre all the way to the rim.
            "circle-blur": 1,
            "circle-pitch-alignment": "map",
          }}
        />
      </Source>
    </>
  );
}

/** Radius, in screen pixels, below which an estimate hides under its marker. */
export const ESTIMATE_MIN_PX = 56;

/** The zoom at which an estimate's radius is `pixels` on screen. */
export function zoomToShow(area: { latitude: number; radiusMeters: number }, pixels: number): number {
  const pixelsAtZ0 =
    (area.radiusMeters * PIXELS_PER_METRE_Z0) / Math.cos((area.latitude * Math.PI) / 180);
  return Math.log2(pixels / pixelsAtZ0);
}

const EARTH_RADIUS_M = 6_371_000;

/** A circle of `radiusMeters` around the point, as a closed ring of 64 points. */
export function circleRing(area: { latitude: number; longitude: number; radiusMeters: number }) {
  const angular = area.radiusMeters / EARTH_RADIUS_M;
  const cosLat = Math.cos((area.latitude * Math.PI) / 180);
  const ring: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const theta = (i / 64) * 2 * Math.PI;
    ring.push([
      area.longitude + ((angular * Math.sin(theta)) / cosLat) * (180 / Math.PI),
      area.latitude + angular * Math.cos(theta) * (180 / Math.PI),
    ]);
  }
  return ring;
}

/** [west, south, east, north] of what the area layer draws. */
export function areaBounds(area: OutageArea): [number, number, number, number] {
  if (area.kind === "outline") return area.bounds;
  const ring = circleRing(area);
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * One short line saying what the shaded area is, for the card over the map.
 * Short enough not to be cut off on a phone; the detail sheet has the total.
 */
export function areaNote(area: OutageArea | undefined | null): string | null {
  if (!area) return null;
  if (area.kind === "outline") {
    const { customersAffected: out, customersServed: total } = area;
    if (out !== null && total) return `${sharePercent(out / total)} of customers here are out`;
    return "Area reported by the utility";
  }
  return "Shaded area is approximate";
}

export function sharePercent(share: number): string {
  return share < 0.01 ? "Under 1%" : `${Math.round(Math.min(1, share) * 100)}%`;
}
