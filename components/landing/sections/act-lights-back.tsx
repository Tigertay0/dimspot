"use client";

/**
 * Act 6: relief. The section pins on the same night map with the outage still dark;
 * the lights come back block by block from the edge of the outage in, the dashed
 * boundary shrinking until your street is lit again. The closing line and the action
 * arrive once it is. Under reduced motion it is the lit map with the words.
 */

import { motion, useMotionValue, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/landing/use-prefers-reduced-motion";
import { OpenMapButton, QuietLink } from "../cta";
import { StreetGrid } from "../street-grid";

function Close() {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 max-[640px]:px-4">
      <h2 className="max-w-3xl font-display text-[clamp(36px,5vw,72px)] leading-[1.02] font-semibold tracking-[-0.04em] text-lamp">
        It&apos;s back on. Help your street know first
      </h2>
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-lamp">
        <OpenMapButton />
        <QuietLink href="#how">How reports work</QuietLink>
      </div>
    </div>
  );
}

function Scrim() {
  return <div aria-hidden className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-night/90 via-night/55 to-transparent" />;
}

export function ActLightsBack() {
  const reduce = usePrefersReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });

  const relit = useTransform(scrollYProgress, [0.05, 0.6], [0, 1]);
  const marker = useTransform(scrollYProgress, [0, 0.08, 0.45, 0.6], [0, 1, 1, 0]);
  const wordsIn = useTransform(scrollYProgress, [0.5, 0.64], [0, 1]);
  const wordsY = useTransform(scrollYProgress, [0.5, 0.64], [24, 0]);
  const fullyLit = useMotionValue(1);

  if (reduce) {
    return (
      <section data-tone="night" aria-label="The lights come back on" className="relative h-[100dvh] min-h-[640px] overflow-hidden bg-night">
        <StreetGrid amount={fullyLit} mode="back" />
        <Scrim />
        <div className="absolute inset-x-0 bottom-0 pb-16">
          <Close />
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} data-tone="night" aria-label="The lights come back on" className="relative h-[200vh] bg-night">
      <div className="sticky top-0 h-[100dvh] overflow-hidden">
        <StreetGrid amount={relit} mode="back" marker={marker} />
        <div aria-hidden className="absolute inset-x-0 top-0 h-40 bg-gradient-to-t from-transparent to-night" />
        <Scrim />
        <motion.div style={{ opacity: wordsIn, y: wordsY }} className="absolute inset-x-0 bottom-0 pb-16 max-[640px]:pb-12">
          <Close />
        </motion.div>
      </div>
    </section>
  );
}
