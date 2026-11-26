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
import type { Advisory, BoundingBox, Outage } from "@/lib/types";
import { FALLBACK_STYLE } from "./basemap";
import { MARKERS_MIN_ZOOM, glowLayer, heatLayer, outagesToGeoJSON } from "./heat-layer";
import { AdvisoryMarker, ClusterMarker, OutageMarker } from "./markers";
import { useClusters, type ClusterProperties, type PointProperties } from "./use-clusters";
import { useTintedBasemap } from "./use-tinted-basemap";

/** Reported within this many minutes counts as "fresh" and gets a pulse ring. */
const FRESH_MINUTES = 15;

/**
 * Inset that keeps fitted content clear of the floating chrome — the search bar
 * on top, the list panel and report button below.
 *
 * Proportional rather than fixed: fixed pixel padding is most of the map on a
 * short viewport, which pushes a fitBounds out to hemisphere zoom.
 */
function chromePadding(map: Pick<MapRef, "getContainer"> | null | undefined) {
  const height = map?.getContainer().clientHeight ?? 800;
  const width = map?.getContainer().clientWidth ?? 400;

  return {
    top: Math.min(90, height * 0.12),
    bottom: Math.min(130, height * 0.16),
    left: Math.min(48, width * 0.08),
    right: Math.min(48, width * 0.08),
  };
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
  /** The device refused or failed to give a position. */
  onLocateError?: (message: string) => void;
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
  onLocateError,
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

  // Which of the two representations is live. Before the first viewport sync
  // the map is at DEFAULT_VIEW, which is country zoom, so heat is the correct
  // assumption rather than a flash of pins.
  const showMarkers = (viewport?.zoom ?? DEFAULT_VIEW.zoom) >= MARKERS_MIN_ZOOM;

  const heatData = useMemo(() => outagesToGeoJSON(outages), [outages]);
  const glow = useMemo(() => glowLayer(theme), [theme]);

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

  const tinted = useTintedBasemap(theme);
  const mapStyle = styleFailed ? FALLBACK_STYLE : tinted;

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
      }}
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
        onError={(event) =>
          onLocateError?.(
            event.code === 1
              ? "Location access is blocked for this site. Allow it in your browser settings, or search for an address."
              : "Could not get your location. Try again, or search for an address.",
          )
        }
      />

      {/* Density first, underneath everything: at country zoom this is the whole
          picture, and by the time markers appear it has faded to nothing. */}
      {!picking && (
        <Source id="outage-heat-source" type="geojson" data={heatData}>
          <Layer {...heatLayer} />
          <Layer {...glow} />
        </Source>
      )}

      {/* Advisories render first so outage markers sit above them: a report of
          actual lost service outranks a forecast of possible lost service.
          They also follow the same zoom gate: scattered over the heat map at
          country zoom they read as the louder layer, which inverts what they
          are — weather that might cause an outage, not one that happened. */}
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
