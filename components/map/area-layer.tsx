"use client";

import { useEffect, useMemo, useRef } from "react";
import type { GeoJSONSource, Map as MaplibreMap } from "maplibre-gl";
import { Layer, Source, useMap } from "react-map-gl/maplibre";
import { clipToCircle, reachOf, type Position } from "@/lib/polyline";
import type { OutageArea } from "@/lib/types";

/**
 * The selected outage drawn as an area instead of a pin.
 *
 * Two looks, so the map never presents a guess as a measurement:
 *
 *   - An outline the utility reported (a ZIP code, a county) is filled and
 *     edged. The fill deepens with the share of the area's customers who are
 *     out: a pale wash for a few streets, a strong red when most of it is dark.
 *   - An estimate around a single point is a soft glow with a dashed edge:
 *     warm at the centre, fading outwards, sized in metres so it holds its
 *     ground size at every zoom.
 *
 * Either one spreads out from the pin when it appears (useSpread), quickly.
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

/** How long the area takes to spread out from the pin. Quick: it is a cue, not a show. */
const SPREAD_MS = 480;

const easeOut = (t: number) => 1 - (1 - t) ** 3;

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Runs `frame` with eased progress from 0 to 1 over SPREAD_MS, then once more
 * at exactly 1. Cancelled when the area changes or goes away, so a quick
 * second tap never leaves a half-spread shape behind.
 */
function useSpread(key: unknown, frame: (progress: number, map: MaplibreMap) => void) {
  const { current: ref } = useMap();
  const latest = useRef(frame);
  useEffect(() => {
    latest.current = frame;
  });

  useEffect(() => {
    // The underlying MapLibre map: react-map-gl's ref leaves out the setters.
    const map = ref?.getMap();
    if (!map) return;
    if (prefersReducedMotion()) {
      latest.current(1, map);
      return;
    }
    let handle = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / SPREAD_MS);
      latest.current(easeOut(t), map);
      if (t < 1) handle = requestAnimationFrame(step);
    };
    handle = requestAnimationFrame(step);
    return () => cancelAnimationFrame(handle);
  }, [ref, key]);
}

function glowRadius(pixelsAtZ0: number) {
  return ["interpolate", ["exponential", 2], ["zoom"], 0, pixelsAtZ0, 22, pixelsAtZ0 * 2 ** 22];
}

export function AreaLayer({
  area,
  origin,
  beforeId,
}: {
  area: OutageArea;
  /** Where the spread starts: the selected outage's pin. */
  origin: { latitude: number; longitude: number } | null;
  beforeId?: string;
}) {
  return area.kind === "outline" ? (
    <OutlineArea area={area} origin={origin} beforeId={beforeId} />
  ) : (
    <EstimateArea area={area} beforeId={beforeId} />
  );
}

function OutlineArea({
  area,
  origin,
  beforeId,
}: {
  area: Extract<OutageArea, { kind: "outline" }>;
  origin: { latitude: number; longitude: number } | null;
  beforeId?: string;
}) {
  const share =
    area.customersServed && area.customersAffected !== null
      ? Math.min(1, area.customersAffected / area.customersServed)
      : 0.15;

  const [west, south, east, north] = area.bounds;
  const center: Position = origin
    ? [origin.longitude, origin.latitude]
    : [(west + east) / 2, (south + north) / 2];
  const reach = reachOf(area.bounds, center);

  useSpread(area, (progress, map) => {
    const source = map.getSource("outage-outline-source") as GeoJSONSource | undefined;
    if (!source) return;
    const geometry = progress >= 1 ? area.geometry : clipToCircle(area.geometry, center, reach * progress);
    source.setData(geometry ? { type: "Feature", geometry, properties: { share } } : EMPTY);
    // The edge arrives in the last stretch, once the fill has nearly reached it.
    if (map.getLayer("outage-outline-edge")) {
      map.setPaintProperty("outage-outline-edge", "line-opacity", Math.max(0, (progress - 0.6) / 0.4) * 0.9);
    }
  });

  return (
    // Starts empty with the edge hidden; the spread fills it in. With reduced
    // motion the first frame is the last, so it simply appears.
    <Source id="outage-outline-source" type="geojson" data={EMPTY}>
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
          "line-opacity": 0,
        }}
      />
    </Source>
  );
}

function EstimateArea({
  area,
  beforeId,
}: {
  area: Extract<OutageArea, { kind: "estimate" }>;
  beforeId?: string;
}) {
  // Ground metres to screen pixels at this latitude, doubling with each zoom
  // level, so the glow covers the same streets whatever the zoom.
  const pixelsAtZ0 =
    (area.radiusMeters * PIXELS_PER_METRE_Z0) / Math.cos((area.latitude * Math.PI) / 180);

  const point = useMemo(
    () => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [area.longitude, area.latitude] },
      properties: {},
    }),
    [area.longitude, area.latitude],
  );

  // Grows from the pin: the extent ring and the glow widen together.
  useSpread(area, (progress, map) => {
    const source = map.getSource("outage-estimate-source") as GeoJSONSource | undefined;
    if (!source) return;
    const radiusMeters = area.radiusMeters * Math.max(progress, 0.001);
    source.setData({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [circleRing({ ...area, radiusMeters })] },
      properties: {},
    });
    if (map.getLayer("outage-estimate-glow")) {
      map.setPaintProperty(
        "outage-estimate-glow",
        "circle-radius",
        glowRadius(pixelsAtZ0 * Math.max(progress, 0.001)) as never,
      );
    }
  });

  return (
    <>
      {/* The extent: a faint wash with a dashed edge. Dashed, like an
          unconfirmed marker, because it is a guess at the reach, not a line
          anyone drew. */}
      <Source id="outage-estimate-source" type="geojson" data={EMPTY}>
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
      <Source id="outage-estimate-glow-source" type="geojson" data={point}>
        <Layer
          id="outage-estimate-glow"
          type="circle"
          beforeId={beforeId}
          paint={{
            // Starts at nothing; the spread sets the real radius.
            "circle-radius": 0,
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
