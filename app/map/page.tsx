import type { Viewport } from "next";
import { MapShell } from "@/components/layout/map-shell";

/**
 * The map draws edge to edge, so it takes the whole screen (viewport-fit) and
 * pads its own chrome by the safe-area insets: the search bar under the status
 * bar, the sheets and the list bar above the home indicator. The browser bars
 * take the app's own page colour.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#111111" },
  ],
};

export default function MapPage() {
  return <MapShell />;
}
