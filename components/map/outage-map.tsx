"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import type { GeolocateControl as GeolocateControlInstance } from "maplibre-gl";
import Map, {
  AttributionControl,
  GeolocateControl,
  Layer,
  Marker,
  Source,
  type MapRef,
  type ViewStateChangeEvent,
} from "react-map-gl/maplibre";
import "./maplibre-worker";
import { DEFAULT_VIEW, HOME_BOUNDS, MARKER_ZOOM } from "@/lib/constants";
import { useNow } from "@/lib/hooks/use-now";
import type { Advisory, BoundingBox, Outage, OutageArea } from "@/lib/types";
import { AreaLayer, ESTIMATE_MIN_PX, areaBounds, zoomToShow } from "./area-layer";
import { FALLBACK_STYLE } from "./basemap";
import { MARKERS_MIN_ZOOM, heatLayer, outagesToGeoJSON } from "./heat-layer";
import { AdvisoryMarker, ClusterMarker, OutageMarker } from "./markers";
import { useClusters, type ClusterProperties, type PointProperties } from "./use-clusters";
import { useTintedBasemap } from "./use-tinted-basemap";

/** Wide enough for the list to sit beside the map (see use-is-desktop.ts). */
const isWide = () => window.matchMedia("(min-width: 1024px)").matches;

/** Reported within this many minutes counts as "fresh" and gets a pulse ring. */
const FRESH_MINUTES = 15;

/**
 * Inset that keeps fitted content clear of what floats over the map: the alert
 * pill and controls along the top, the list bar and report button below.
 *
 * Proportional rather than fixed: fixed pixel padding is most of the map on a
 * short viewport, which pushes a fitBounds out to hemisphere zoom.
 */
function chromePadding(map: Pick<MapRef, "getContainer"> | null | undefined) {
  const height = map?.getContainer().clientHeight ?? 800;
  const width = map?.getContainer().clientWidth ?? 400;

  return {
    // The pill and controls are about 60px; the list bar and the report
    // button take about 130px at the bottom of a phone, and nothing sits
    // there when the list is a column beside the map.
    top: Math.min(72, height * 0.12),
    bottom: isWide() ? 32 : Math.min(140, height * 0.18),
    left: Math.min(48, width * 0.08),
    right: Math.min(48, width * 0.08),
  };
}

/** "1.2k" for customers out, or the confirmation count on a report; else nothing. */
function markerLabel(outage: Outage): string | null {
  const customers = outage.customersAffected;
  if (customers !== null && customers > 0) {
    return customers >= 10_000
      ? `${Math.round(customers / 1000)}k`
      : customers >= 1000
        ? `${Math.round(customers / 100) / 10}k`
        : String(customers);
  }
  return outage.verificationCount > 1 ? String(outage.verificationCount) : null;
}

export interface MapView {
  latitude: number;
  longitude: number;
  zoom: number;
}

/**
 * What the shell's own buttons can ask of the map. MapLibre's stock controls
 * are not used: they are 29px squares styled for a light map, and they sat
 * under the search bar on a phone. The shell draws its own and calls these.
 */
export interface MapControls {
  zoomBy: (delta: number) => void;
  /** Centre on the device's position and keep showing it. */
  locate: () => void;
}

interface OutageMapProps {
  outages: Outage[];
  advisories: Advisory[];
  onSelectAdvisory: (advisory: Advisory) => void;
  selectedId: string | null;
  onSelect: (outage: Outage) => void;
  onBoundsChange: (bounds: BoundingBox, zoom: number) => void;
  /** Imperative fly-to target: search results, "use my location", deep links. */
  flyTo: MapView | null;
  /** Report mode: the crosshair in the centre picks the location. */
  picking: boolean;
  onPickMove?: (center: { latitude: number; longitude: number }) => void;
  theme: "light" | "dark";
  controls?: Ref<MapControls>;
  /** A tap on the map itself, not on a marker. */
  onBackgroundClick?: () => void;
  /** The device refused or failed to give a position. */
  onLocateError?: (message: string, denied: boolean) => void;
  /** The device gave a position. */
  onLocated?: () => void;
  /** The map has loaded and its controls answer. */
  onReady?: () => void;
  /** The place a search landed on, when it is a street or an address. */
  searchPin?: { latitude: number; longitude: number } | null;
  /** The selected outage as an area: its reported outline, or an estimate. */
  selectedArea?: OutageArea | null;
}

export function OutageMap({
  outages,
  advisories,
  onSelectAdvisory,
  selectedId,
  onSelect,
  onBoundsChange,
  flyTo,
  picking,
  onPickMove,
  theme,
  controls,
  onBackgroundClick,
  onLocateError,
  onLocated,
  onReady,
  searchPin,
  selectedArea,
}: OutageMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const geolocateRef = useRef<GeolocateControlInstance | null>(null);

  useImperativeHandle(
    controls,
    () => ({
      zoomBy: (delta) => {
        const map = mapRef.current;
        if (!map) return;
        map.easeTo({ zoom: map.getZoom() + delta, duration: 250 });
      },
      locate: () => {
        geolocateRef.current?.trigger();
      },
    }),
    [],
  );
  const [viewport, setViewport] = useState<{
    bounds: [number, number, number, number];
    zoom: number;
  } | null>(null);
  const [styleFailed, setStyleFailed] = useState(false);

  const { clusters, expansionZoom, leaves } = useClusters(outages, viewport);

  // Which of the two representations is live. Zoomed out, the map is a heat
  // map of where service is out; counted discs at that scale were tried and
  // read as two giant numbers on a continent. Markers take over once they can
  // stand apart. Before the first viewport sync the map is at DEFAULT_VIEW,
  // which is country zoom, so heat is the right assumption.
  const showMarkers = (viewport?.zoom ?? DEFAULT_VIEW.zoom) >= MARKERS_MIN_ZOOM;

  const heatData = useMemo(() => outagesToGeoJSON(outages), [outages]);

  /**
   * Reveal a cluster's contents.
   *
   * Zooming to Supercluster's expansion zoom alone lands on the cluster's
   * centroid, which for a spread-out cluster can be an empty street with every
   * member off-screen. Fitting the members' own bounding box always shows them.
   * Members sharing one location have a degenerate box, so that case falls back
   * to the expansion zoom.
   */
  const revealCluster = useCallback(
    (clusterId: number, longitude: number, latitude: number) => {
      const map = mapRef.current;
      if (!map) return;

      const members = leaves(clusterId, 100);
      const lngs = members.map((o) => o.longitude);
      const lats = members.map((o) => o.latitude);

      const west = Math.min(...lngs);
      const east = Math.max(...lngs);
      const south = Math.min(...lats);
      const north = Math.max(...lats);

      const degenerate = east - west < 0.0005 && north - south < 0.0005;

      if (members.length === 0 || degenerate) {
        map.flyTo({
          center: [longitude, latitude],
          zoom: Math.max(expansionZoom(clusterId), MARKER_ZOOM),
          duration: 700,
        });
        return;
      }

      map.fitBounds(
        [west, south, east, north],
        // maxZoom stops a tight pair of outages from slamming to building level.
        { padding: chromePadding(map), maxZoom: 15, duration: 700 },
      );
    },
    [leaves, expansionZoom],
  );

  /**
   * Publish the map's viewport upward.
   *
   * Takes the map explicitly rather than reading `mapRef.current`. React assigns
   * refs after commit, so a `load` event arriving inside that window would find
   * the ref unset and this would return silently — and since nothing else calls
   * it until the user pans, the app would then fetch nothing at all. Every
   * MapLibre event carries the map as `target`, so there is no reason to depend
   * on the ref's timing. The parameter is optional for callers that have neither.
   */
  const syncViewport = useCallback(
    (mapInstance?: Pick<MapRef, "getBounds" | "getZoom">) => {
      const map = mapInstance ?? mapRef.current;
      if (!map) return;

      const bounds = map.getBounds();
      const zoom = map.getZoom();

      setViewport({
        bounds: [
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth(),
        ],
        zoom,
      });

      onBoundsChange(
        {
          minLng: bounds.getWest(),
          minLat: bounds.getSouth(),
          maxLng: bounds.getEast(),
          maxLat: bounds.getNorth(),
        },
        zoom,
      );
    },
    [onBoundsChange],
  );

  // Clustering keys off the rounded zoom, so recomputing on every animation
  // frame is wasted work; moveend is enough for the marker layer. Report mode
  // is the exception — its crosshair has to track the map continuously.
  const handleMove = useCallback(
    (event: ViewStateChangeEvent) => {
      if (picking && onPickMove) {
        onPickMove({
          latitude: event.viewState.latitude,
          longitude: event.viewState.longitude,
        });
      }
    },
    [picking, onPickMove],
  );

  useEffect(() => {
    if (!flyTo || !mapRef.current) return;

    mapRef.current.flyTo({
      center: [flyTo.longitude, flyTo.latitude],
      zoom: flyTo.zoom,
      duration: 1200,
      essential: true,
    });
  }, [flyTo]);

  // An area larger than the view is zoomed out to, never in: the reader
  // chose the zoom, and the point is to see the whole of what is affected.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedArea) return;

    // An estimate smaller than its own marker is invisible: zoom in, on it,
    // until it is a readable size, but not past street level.
    const closer = selectedArea.kind === "estimate" ? zoomToShow(selectedArea, ESTIMATE_MIN_PX) : null;
    if (selectedArea.kind === "estimate" && closer !== null && closer > map.getZoom()) {
      map.easeTo({
        center: [selectedArea.longitude, selectedArea.latitude],
        zoom: Math.min(closer, 15),
        padding: chromePadding(map),
        duration: 600,
      });
      return;
    }

    const [west, south, east, north] = areaBounds(selectedArea);
    const view = map.getBounds();
    const inView =
      view.getWest() <= west && view.getEast() >= east &&
      view.getSouth() <= south && view.getNorth() >= north;
    if (inView) return;
    map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: chromePadding(map), maxZoom: map.getZoom(), duration: 600 },
    );
  }, [selectedArea]);

  const tinted = useTintedBasemap(theme);
  const mapStyle = styleFailed ? FALLBACK_STYLE : tinted;

  // The heat map goes under the place names, so a hot region does not bury
  // the labels that say where it is.
  const firstLabelLayer = useMemo(() => {
    if (!mapStyle || typeof mapStyle === "string") return undefined;
    return mapStyle.layers.find(
      (layer) => layer.type === "symbol" && /^(place|label)/.test(layer.id),
    )?.id;
  }, [mapStyle]);

  /**
   * While a report location is being picked on a phone, the sheet covers the
   * lower part of the map. Padding the map by that much moves its centre (and
   * the pin the shell draws there) into the part that is still visible, and the
   * centre the map reports stays the point under the pin. On a wide screen the
   * sheet is beside the map and covers nothing.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const sheet =
      picking && !isWide() ? Math.min(280, map.getContainer().clientHeight * 0.5) : 0;
    map.easeTo({ padding: { top: 0, right: 0, left: 0, bottom: sheet }, duration: 250 });
  }, [picking]);

  // Ticks once a minute rather than being read during render, so marker
  // freshness is stable state instead of an impure read.
  const now = useNow(60_000);

  // Wait for the tinted style so the map is created once, with its final look.
  if (!mapStyle) return <div aria-hidden className="absolute inset-0 bg-background" />;

  return (
    <Map
      ref={mapRef}
      mapStyle={mapStyle}
      initialViewState={DEFAULT_VIEW}
      minZoom={2}
      maxZoom={19}
      // Rotation adds nothing to an outage map and makes one-handed panning
      // fiddly, so both gestures are off.
      dragRotate={false}
      touchZoomRotate
      pitchWithRotate={false}
      onLoad={(event) => {
        // Use the map the event carries rather than the ref: the ref may not be
        // assigned yet when `load` fires, and every read here would no-op.
        const map = event.target;

        // MapLibre opens the compact attribution until the first drag, which
        // on a phone lays a strip of text across the report button. Start it
        // closed; the (i) button still opens it.
        const attribution = map.getContainer().querySelector(".maplibregl-ctrl-attrib");
        attribution?.classList.remove("maplibregl-compact-show");
        attribution?.removeAttribute("open");

        // Fit the country to whatever viewport this actually is, then report
        // the resulting bounds. Padding keeps markers clear of the search bar
        // above and the list panel below.
        // A flyTo that arrived before the map existed was skipped by the effect
        // above (no ref yet), so apply it here instead of losing it.
        if (flyTo) {
          map.jumpTo({
            center: [flyTo.longitude, flyTo.latitude],
            zoom: flyTo.zoom,
          });
        } else {
          map.fitBounds(HOME_BOUNDS, {
            padding: chromePadding(map),
            duration: 0,
          });
        }

        syncViewport(map);
        onReady?.();
      }}
      onClick={() => onBackgroundClick?.()}
      onMove={handleMove}
      onMoveEnd={(event) => syncViewport(event.target)}
      onError={(event) => {
        // A tile-host failure should degrade to the blank style, not a blank page.
        if (String(event.error?.message ?? "").includes("style")) {
          setStyleFailed(true);
        }
      }}
      reuseMaps
      attributionControl={false}
      style={{ position: "absolute", inset: 0 }}
    >
      {/* Bottom-left, where globals.css lifts it clear of the list bar. */}
      <AttributionControl compact position="bottom-left" />
      {/* Kept for what it does (the position dot, accuracy ring, tracking), with
          its own button hidden: the shell's locate button calls trigger(). */}
      <GeolocateControl
        ref={geolocateRef}
        position="top-right"
        style={{ display: "none" }}
        trackUserLocation
        showAccuracyCircle
        positionOptions={{ enableHighAccuracy: true, timeout: 10_000 }}
        fitBoundsOptions={{ maxZoom: 13 }}
        onGeolocate={() => onLocated?.()}
        onError={(event) =>
          onLocateError?.(
            event.code === 1
              ? "Location access is blocked for this site. Allow it in your browser settings, or search for an address."
              : "Could not get your location. Try again, or search for an address.",
            event.code === 1,
          )
        }
      />

      {/* Where the last search landed. Not interactive: it marks a spot, and
          the outages around it are the things to tap. */}
      {searchPin && !picking && (
        <Marker longitude={searchPin.longitude} latitude={searchPin.latitude} style={{ pointerEvents: "none" }}>
          <span
            aria-hidden
            className="block size-4 rounded-full border-[3px] border-card bg-foreground shadow-[var(--shadow-marker)]"
          />
        </Marker>
      )}

      {/* Density first, underneath everything: at country zoom this is the whole
          picture, and by the time markers appear it has faded to nothing. */}
      {!picking && (
        <Source id="outage-heat-source" type="geojson" data={heatData}>
          <Layer {...heatLayer} beforeId={firstLabelLayer} />
        </Source>
      )}

      {/* The selected outage's area, under the labels so place names stay
          readable through it. Markers are HTML and always sit above. */}
      {!picking && selectedArea && (
        // Keyed by kind, and each kind has its own source and layer ids: reusing
        // one id across the switch left the map with neither drawn.
        <AreaLayer key={selectedArea.kind} area={selectedArea} beforeId={firstLabelLayer} />
      )}

      {/* Advisories render first so outage markers sit above them: a report of
          actual lost service outranks a forecast of possible lost service.
          They follow the same zoom gate as the markers. */}
      {!picking &&
        showMarkers &&
        advisories.map((advisory) => (
          <Marker
            key={`advisory-${advisory.id}`}
            longitude={advisory.longitude}
            latitude={advisory.latitude}
            onClick={(event) => {
              event.originalEvent.stopPropagation();
              onSelectAdvisory(advisory);
            }}
          >
            <AdvisoryMarker
              severity={advisory.severity}
              onClick={() => onSelectAdvisory(advisory)}
            />
          </Marker>
        ))}

      {!picking &&
        showMarkers &&
        clusters.map((feature) => {
          const [longitude, latitude] = feature.geometry.coordinates;
          const props = feature.properties;

          if (props.cluster) {
            const cluster = props as ClusterProperties;
            return (
              <Marker
                key={`cluster-${cluster.cluster_id}`}
                longitude={longitude}
                latitude={latitude}
              >
                <ClusterMarker
                  count={cluster.point_count}
                  severityCounts={cluster.severityCounts}
                  onClick={() =>
                    revealCluster(cluster.cluster_id, longitude, latitude)
                  }
                />
              </Marker>
            );
          }

          const { outage } = props as PointProperties;
          // now === 0 until the first tick; treat that as "not fresh yet".
          const ageMinutes = now ? (now - Date.parse(outage.reportedAt)) / 60_000 : Infinity;

          return (
            <Marker
              key={outage.id}
              longitude={longitude}
              latitude={latitude}
              onClick={(event) => {
                // Otherwise the map treats it as a background click.
                event.originalEvent.stopPropagation();
                onSelect(outage);
              }}
            >
              <OutageMarker
                serviceType={outage.serviceType}
                severity={outage.severity}
                label={markerLabel(outage)}
                // A utility's own report needs no crowd confirmation; drawing it
                // dashed like an unverified guess would misstate it.
                isVerified={outage.isVerified || outage.origin === "official"}
                isResolved={outage.status === "resolved"}
                isSelected={outage.id === selectedId}
                isFresh={ageMinutes <= FRESH_MINUTES}
                onClick={() => onSelect(outage)}
              />
            </Marker>
          );
        })}
    </Map>
  );
}
