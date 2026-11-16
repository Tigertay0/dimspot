"use client";

/**
 * A 1px ink hairline under the nav that fills with page scroll.
 * Adapted from "Scroll Progress" by cnippet-dev on 21st.dev (21st.dev/@cnippet-dev/components/scroll-progress):
 * kept the spring-smoothed scaleX on page scroll; restyled to the page ink at 1px, no percentage label,
 * and no spring under reduced motion.
 */

import { motion, useScroll, useSpring } from "motion/react";
import { usePrefersReducedMotion } from "@/lib/landing/use-prefers-reduced-motion";

export function ScrollProgress() {
  const reduce = usePrefersReducedMotion();
  const { scrollYProgress } = useScroll();
  const smooth = useSpring(scrollYProgress, { stiffness: 220, damping: 32, restDelta: 0.001 });
  return (
    <motion.div
      aria-hidden
      className="absolute inset-x-0 bottom-[-1px] h-px origin-left bg-[var(--m-ink)]"
      style={{ scaleX: reduce ? scrollYProgress : smooth }}
    />
  );
}
