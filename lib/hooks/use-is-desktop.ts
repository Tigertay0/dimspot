"use client";

import { useSyncExternalStore } from "react";

/** The width from which the list sits beside the map instead of under it. */
const QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * Whether the two-column layout is in use.
 *
 * False on the server and during hydration, so the first paint is the phone
 * layout; the map is client-only anyway, so nothing visible reflows.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
