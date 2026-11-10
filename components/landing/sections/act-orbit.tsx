"use client";

import { motion } from "motion/react";
import { OpenMapButton, QuietLink } from "../cta";
import { InteractiveGlobe } from "../ui/interactive-globe";
import { VerticalCutReveal } from "../ui/vertical-cut-reveal";

// Film grain over the dusk sky, as a tiny SVG noise tile.
const GRAIN = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>',
)}")`;
const EASE = [0.16, 1, 0.3, 1] as const;

/** Act 1: a slow globe at dusk; outage spots glow like streetlights. */
export function ActOrbit() {
  return (
    <section
      data-tone="dusk"
      className="relative isolate overflow-hidden bg-[linear-gradient(180deg,#6e5a8a_0%,#e7a39a_58%,#f4e9dc_100%)]"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-[0.05]" style={{ backgroundImage: GRAIN }} />
      <div className="mx-auto grid min-h-[100dvh] max-w-[1200px] items-center gap-x-12 gap-y-10 px-6 pt-28 pb-16 max-[640px]:px-4 max-[640px]:pt-24 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div>
          <h1 className="font-display text-[clamp(44px,5.6vw,84px)] leading-[0.98] font-semibold tracking-[-0.045em] text-ink">
            <VerticalCutReveal onMount stagger={0.045}>
              When the lights go out, find out if it&apos;s just you
            </VerticalCutReveal>
          </h1>
          <motion.p
            className="mt-6 max-w-[30rem] text-[19px] leading-[1.5] text-ink max-[640px]:text-[17px]"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.55 }}
          >
            Power, internet and cell outages, reported by the people living them and confirmed on one live map
          </motion.p>
          <motion.div
            className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.7 }}
          >
            <OpenMapButton />
            <QuietLink href="#how">How it works</QuietLink>
          </motion.div>
        </div>
        <motion.div
          className="relative mx-auto w-full max-w-[320px] sm:max-w-[440px] lg:max-w-[600px]"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.1, ease: EASE, delay: 0.15 }}
        >
          {/* The one warm accent: a soft sodium glow where the outage spots sit. */}
          <div
            aria-hidden
            className="absolute inset-[26%] -z-10 rounded-full bg-sodium/40 blur-[60px] motion-safe:animate-[breathe_6s_ease-in-out_infinite]"
          />
          <InteractiveGlobe />
        </motion.div>
      </div>
    </section>
  );
}
