"use client";

/**
 * Smooth, eased wheel scrolling for the landing page only (the map keeps native
 * scrolling). Lenis drives the real window scroll, so motion's useScroll and the
 * sticky sections keep working. Off under reduced motion; in-page links (#how)
 * glide instead of jumping.
 */

import Lenis from "lenis";
import { useEffect } from "react";
import { usePrefersReducedMotion } from "@/lib/landing/use-prefers-reduced-motion";

export function SmoothScroll() {
  const reduce = usePrefersReducedMotion();

  useEffect(() => {
    if (reduce) return;
    const lenis = new Lenis({ lerp: 0.09, smoothWheel: true, anchors: { offset: -72 } });
    let frame = requestAnimationFrame(function loop(time) {
      lenis.raf(time);
      frame = requestAnimationFrame(loop);
    });
    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, [reduce]);

  return null;
}
