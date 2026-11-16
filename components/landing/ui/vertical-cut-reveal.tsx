"use client";

// Adapted from https://21st.dev/@cnippet-dev/components/vertical-cut-reveal
// Changes: starts when scrolled into view (once) instead of on mount; the
// project's easing replaces the spring; word split only; under reduced motion
// the words are simply there. The clip-path cut reads as lights cutting out.

import { motion, useInView } from "motion/react";
import { usePrefersReducedMotion } from "@/lib/landing/use-prefers-reduced-motion";
import { useRef } from "react";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

interface VerticalCutRevealProps {
  children: string;
  className?: string;
  /** Seconds between words. */
  stagger?: number;
  /** Start delay in seconds. */
  delay?: number;
  /** Reveal on mount (the hero) instead of when scrolled into view. */
  onMount?: boolean;
}

export function VerticalCutReveal({
  children,
  className,
  stagger = 0.04,
  delay = 0,
  onMount = false,
}: VerticalCutRevealProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = usePrefersReducedMotion();
  const show = onMount || inView;
  const words = children.split(" ");

  return (
    <span ref={ref} className={cn("inline", className)}>
      <span className="sr-only">{children}</span>
      {words.map((word, i) => (
        <span key={`${word}-${i}`} aria-hidden="true" className="inline-flex overflow-hidden pb-[0.08em] align-bottom">
          <motion.span
            className="inline-block"
            initial={reduce ? false : { y: "105%" }}
            animate={reduce || show ? { y: "0%" } : { y: "105%" }}
            transition={{ duration: 0.6, ease: EASE, delay: delay + i * stagger }}
          >
            {word}
          </motion.span>
          {i < words.length - 1 ? <span>&nbsp;</span> : null}
        </span>
      ))}
    </span>
  );
}
