"use client";

/**
 * Counts up to a value once `start` is true. The server HTML shows the final value, so the figure is right
 * without scripting; the count replays from 0 only after hydration.
 * Adapted from "Number Ticker" by danielpetho on 21st.dev (21st.dev/@danielpetho/components/basic-number-ticker).
 */

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/landing/use-prefers-reduced-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

export function Ticker({ target, start, decimals = 0 }: { target: number; start: boolean; decimals?: number }) {
  const reduce = usePrefersReducedMotion();
  const value = useMotionValue(target);
  const text = useTransform(value, (v) => v.toFixed(decimals));
  const played = useRef(false);
  useEffect(() => {
    if (reduce || !start || played.current) return;
    played.current = true;
    value.set(0);
    const controls = animate(value, target, { duration: 0.9, ease: EASE });
    return () => controls.stop();
  }, [start, reduce, target, value]);
  return <motion.span>{text}</motion.span>;
}
