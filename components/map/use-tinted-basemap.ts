"use client";

import type { StyleSpecification } from "maplibre-gl";
import { useEffect, useState } from "react";
import { type Tint, type TintOverride, tintStyle } from "@/lib/map/tint-style";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { basemapUrl } from "./basemap";

type Theme = "light" | "dark";

/**
 * The basemap in the app's palette (the same night navy and dusk cream as the
 * landing page). OpenFreeMap's greyscale styles are fetched once and every
 * colour is moved onto the palette's hue; roads, water and labels keep their
 * lightness, so the map reads exactly as before, just in the brand's light.
 */
const TINTS: Record<Theme, { tint: Tint; overrides: TintOverride[] }> = {
  dark: {
    tint: { hue: 224, saturation: 0.4, lightness: (l) => 4 + l * 1.05 },
    overrides: [{ match: /water/, tint: { hue: 228, saturation: 0.45, lightness: (l) => 2 + l * 0.7 } }],
  },
  light: {
    tint: { hue: 32, saturation: 0.35, lightness: (l) => l * 0.965 },
    overrides: [{ match: /water/, tint: { hue: 212, saturation: 0.3, lightness: (l) => l * 0.97 } }],
  },
};

const cache = new Map<Theme, StyleSpecification>();
const OTHER: Record<Theme, Theme> = { dark: "light", light: "dark" };

function fetchTinted(theme: Theme, signal?: AbortSignal): Promise<StyleSpecification> {
  return fetch(basemapUrl(theme), { signal })
    .then((res) => {
      if (!res.ok) throw new Error(`basemap style ${res.status}`);
      return res.json() as Promise<StyleSpecification>;
    })
    .then((raw) => {
      const { tint, overrides } = TINTS[theme];
      const tinted = tintStyle(raw, tint, overrides);
      cache.set(theme, tinted);
      return tinted;
    });
}

/**
 * Returns the tinted style for `theme`, or the plain style URL if the style
 * cannot be fetched. `null` only before the very first answer, so the map is
 * created once with its final style (a style swap before MapLibre's `load`
 * stops `onLoad`). After that a theme switch keeps showing the previous style
 * until the new one arrives, so the map never unmounts and keeps its view; the
 * other theme is prefetched so a switch is usually instant.
 */
export function useTintedBasemap(theme: Theme): StyleSpecification | string | null {
  // Answers that arrived after mount, per theme; the module cache covers the rest.
  const [loaded, setLoaded] = useState<Partial<Record<Theme, StyleSpecification | string>>>({});
  // Until hydration ends, `theme` is the server's default, not the saved choice:
  // waiting means the map is created with the style it will keep.
  const hydrated = useHydrated();

  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    const prefetchOther = () => {
      const other = OTHER[theme];
      if (!cache.has(other)) fetchTinted(other).catch(() => undefined); // best effort
    };
    if (cache.has(theme)) {
      prefetchOther();
      return () => controller.abort();
    }
    const url = basemapUrl(theme);
    fetchTinted(theme, controller.signal)
      .then((tinted) => {
        setLoaded((prev) => ({ ...prev, [theme]: tinted }));
        prefetchOther();
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        // The untinted style still works; the map just keeps its greyscale look.
        console.warn("Could not tint the basemap, using the plain style", error);
        setLoaded((prev) => ({ ...prev, [theme]: url }));
      });
    return () => controller.abort();
  }, [theme, hydrated]);

  if (!hydrated) return null;
  const other = OTHER[theme];
  return cache.get(theme) ?? loaded[theme] ?? cache.get(other) ?? loaded[other] ?? null;
}
