"use client";

import { useSyncExternalStore } from "react";

/**
 * Hydration-safe media query. The server snapshot is `false`, so the first
 * client render matches the server HTML; React then re-renders with the real
 * value. Use this (not motion's useReducedMotion, which is null on the server)
 * whenever a query changes which tree or layout renders.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

/** Phone layout: matches Tailwind's max-[640px] breakpoint. */
export function useIsPhone(): boolean {
  return useMediaQuery("(max-width: 640px)");
}
