"use client";

/**
 * A small, non-interactive MapLibre view on the app's own basemap (OpenFreeMap,
 * no token, already allowed by the CSP). Loaded only when a card is opened.
 */

import Map from "react-map-gl/maplibre";
import { basemapUrl } from "@/components/map/basemap";

export default function MiniMap({ latitude, longitude }: { latitude: number; longitude: number }) {
  return (
    <Map
      initialViewState={{ latitude, longitude, zoom: 13.5 }}
      mapStyle={basemapUrl("dark")}
      interactive={false}
      attributionControl={false}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
