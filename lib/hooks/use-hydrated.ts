"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * False during server render and the hydration pass, true after. Use it to
 * hold off on work that must see client-only values (localStorage, matchMedia)
 * rather than the server's defaults.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
