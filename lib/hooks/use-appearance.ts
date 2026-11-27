"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * "dusk" is light (the default), "night" is dark, "system" follows the OS. The
 * stored names predate the current design and are kept so saved choices hold.
 */
export type Appearance = "night" | "dusk" | "system";

const KEY = "dimspot-appearance";
const DEFAULT: Appearance = "dusk";
const QUERY = "(prefers-color-scheme: dark)";
const listeners = new Set<() => void>();

function read(): Appearance {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "night" || value === "dusk" || value === "system" ? value : DEFAULT;
  } catch {
    // Storage can be blocked (private mode, site data off); the default still works.
    return DEFAULT;
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    mq.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
  };
}

function resolve(appearance: Appearance, systemDark: boolean): "dark" | "light" {
  if (appearance === "system") return systemDark ? "dark" : "light";
  return appearance === "night" ? "dark" : "light";
}

/**
 * The chosen appearance and the theme it resolves to. The server renders the
 * default (light); the pre-paint script in the root layout sets the class on
 * <html> before anything is drawn, so there is no flash of the other palette.
 */
export function useAppearance(): {
  appearance: Appearance;
  theme: "dark" | "light";
  setAppearance: (next: Appearance) => void;
} {
  const appearance = useSyncExternalStore(subscribe, read, () => DEFAULT);
  const systemDark = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );

  const setAppearance = useCallback((next: Appearance) => {
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Not saved, but still applied for this visit below.
    }
    for (const notify of listeners) notify();
  }, []);

  return { appearance, theme: resolve(appearance, systemDark), setAppearance };
}
