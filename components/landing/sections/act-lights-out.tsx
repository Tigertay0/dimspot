"use client";

/**
 * Acts 2 and 3 as one pinned camera move, so there is never a cut:
 * 1. The descent: a rounded window opens on the city at dusk, seen from the air.
 *    The scroll plays a film of the camera coming down until it looks straight
 *    down on one neighbourhood, which dissolves into the same view drawn like
 *    Dimspot's map. "Somewhere down there, a street is about to go quiet."
 * 2. The peak: a marker lands on one street and the streetlights and windows go out
 *    block by block around it, traced by the app's dashed outage boundary.
 *    "Your street just went dark."
 * Under reduced motion: the dusk view as a still, then before/after stills of
 * the map. No film is downloaded.
 */

import { motion, useMotionTemplate, useMotionValue, useScroll, useTransform } from "motion/react";
import Image from "next/image";
import { useRef } from "react";
import { DESCENT, SKYLINE } from "@/lib/landing/photos";
import { usePrefersReducedMotion } from "@/lib/landing/use-prefers-reduced-motion";
import { StreetGrid } from "../street-grid";
import { ScrollFilm } from "../ui/scroll-film";

const HEADLINE = "font-display text-[clamp(36px,5vw,72px)] leading-[1.02] font-semibold tracking-[-0.04em] text-lamp";
// Scroll progress through the act (0-1) at which the film starts to fade and at which it ends.
const DISSOLVE_START = 0.34;
const FILM_END = 0.43;
const CAPTION = "Somewhere down there, a street is about to go quiet";

function Scrim() {
  return <div aria-hidden className="absolute inset-x-0 bottom-0 h-[50%] bg-gradient-to-t from-night/85 via-night/45 to-transparent" />;
}

function StillFrames() {
  const before = useMotionValue(0);
  const after = useMotionValue(1);
  const shown = useMotionValue(1);
  return (
    <div className="mx-auto max-w-[1200px] px-6 py-32 max-[640px]:px-4">
      <figure className="relative mb-12 aspect-[16/9] overflow-hidden rounded-[20px]">
        <Image src={SKYLINE.src} alt={SKYLINE.alt} fill sizes="(min-width: 1248px) 1152px, 100vw" className="object-cover" />
      </figure>
      <p className="max-w-2xl text-[clamp(24px,3vw,36px)] leading-[1.15] font-semibold tracking-[-0.03em] text-lamp-soft">{CAPTION}</p>
      <h2 className={`mt-16 ${HEADLINE}`}>Your street just went dark</h2>
      <div className="mt-12 grid gap-6">
        {[
          { label: "Before", amount: before },
          { label: "After", amount: after },
        ].map((f) => (
          <figure key={f.label} className="relative aspect-[16/9] overflow-hidden rounded-[20px]">
            <StreetGrid amount={f.amount} mode="out" marker={f.label === "After" ? shown : undefined} />
            <figcaption className="absolute bottom-3 left-3 rounded-[8px] bg-night/80 px-2 py-1 text-[14px] text-lamp">{f.label}</figcaption>
          </figure>
        ))}
      </div>
      <p className="mt-8 max-w-xl text-[20px] leading-[1.5] text-lamp">Is it the whole block, or just your router?</p>
    </div>
  );
}

export function ActLightsOut() {
  const reduce = usePrefersReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] });

  // 1. The window opens on the film, and the scroll flies the camera down.
  const insetY = useTransform(p, [0, 0.16], [18, 0]);
  const insetX = useTransform(p, [0, 0.16], [16, 0]);
  const radius = useTransform(p, [0, 0.16], [28, 0]);
  const clipPath = useMotionTemplate`inset(${insetY}% ${insetX}% ${insetY}% ${insetX}% round ${radius}px)`;
  const film = useTransform(p, [0.02, FILM_END], [0, 1]);
  const scrim = useTransform(p, [0.13, 0.2], [0, 1]);
  const caption = useTransform(p, [0.15, 0.21, 0.3, 0.36], [0, 1, 1, 0]);
  const captionY = useTransform(p, [0.15, 0.21], [16, 0]);

  // 2. The film dissolves into the map. It is still descending as it fades, and the
  //    map underneath holds still, so the camera never appears to pull back.
  const filmOpacity = useTransform(p, [DISSOLVE_START, FILM_END], [1, 0]);

  // 3. The blackout spreads from one street.
  const marker = useTransform(p, [0.46, 0.52], [0, 1]);
  const dark = useTransform(p, [0.5, 0.86], [0, 1]);
  const headline = useTransform(p, [0.5, 0.58, 0.95, 1], [0, 1, 1, 0]);
  const headlineY = useTransform(p, [0.5, 0.58, 0.95, 1], [20, 0, 0, -24]);
  const line = useTransform(p, [0.8, 0.87], [0, 1]);
  const lineY = useTransform(p, [0.8, 0.87], [12, 0]);

  if (reduce) {
    return (
      <section ref={ref} data-tone="night" aria-label="A night map of the city, then the blackout" className="bg-night">
        <StillFrames />
      </section>
    );
  }

  return (
    <section ref={ref} data-tone="night" aria-label="A night map of the city, then the blackout" className="relative h-[460vh] bg-dusk">
      <div className="sticky top-0 h-[100dvh] overflow-hidden bg-dusk">
        <motion.div style={{ clipPath }} className="absolute inset-0 overflow-hidden bg-night will-change-[clip-path]">
          <StreetGrid amount={dark} mode="out" marker={marker} />
          <motion.div style={{ opacity: filmOpacity }} className="absolute inset-0">
            <ScrollFilm progress={film} source={DESCENT} />
          </motion.div>
          <motion.div style={{ opacity: scrim }}>
            <Scrim />
          </motion.div>
          {/* The map fades into the night ground, so there is no seam where the next section begins. */}
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-night" />
        </motion.div>

        <motion.p
          style={{ opacity: caption, y: captionY }}
          className="absolute inset-x-6 bottom-[14vh] mx-auto max-w-2xl text-center font-display text-[clamp(28px,4vw,52px)] leading-[1.08] font-semibold tracking-[-0.035em] text-lamp"
        >
          {CAPTION}
        </motion.p>

        <motion.div style={{ opacity: headline, y: headlineY }} className="absolute inset-x-0 bottom-0 mx-auto max-w-[1200px] px-6 pb-16 max-[640px]:px-4 max-[640px]:pb-12">
          <h2 className={`max-w-3xl ${HEADLINE}`}>Your street just went dark</h2>
          <motion.p style={{ opacity: line, y: lineY }} className="mt-4 max-w-xl text-[20px] leading-[1.5] text-lamp max-[640px]:text-[18px]">
            Is it the whole block, or just your router?
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}
