"use client";

import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/landing/use-prefers-reduced-motion";
import { BlurOutUp } from "./blur-out-up";
import { MinimalPhone } from "./phone";
import { Pill } from "./pill";
import { StatusDot } from "./status-dot";

/** CSS entrance: visible without JS, `both` fill, and the reduced-motion query in minimal.css skips it. */
const rise = (delayMs: number): React.CSSProperties => ({ animationDelay: `${delayMs}ms` });

const MAX_TILT_DEG = 4;

/**
 * Calm pointer tilt on the hero phone (transitions-dev "Card hover tilt" at 4 degrees): the pointer is
 * tracked on the flat hero wrapper, the rotation goes on a wrapper around the phone (never the video), and
 * it is off for touch-only pointers and reduced motion.
 */
function usePhoneTilt() {
  const area = useRef<HTMLElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const reduce = usePrefersReducedMotion();
  useEffect(() => {
    const el = area.current;
    const target = card.current;
    if (!el || !target || reduce || window.matchMedia("(hover: none)").matches) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        target.style.willChange = "transform";
        target.style.transition = "transform 120ms linear";
        target.style.setProperty("--ry", `${(x * MAX_TILT_DEG * 2).toFixed(2)}deg`);
        target.style.setProperty("--rx", `${(-y * MAX_TILT_DEG * 2).toFixed(2)}deg`);
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(frame);
      target.style.transition = "transform 400ms var(--m-ease)";
      target.style.setProperty("--rx", "0deg");
      target.style.setProperty("--ry", "0deg");
      target.style.willChange = "";
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [reduce]);
  return { area, card };
}

/**
 * Hero: headline left, the real app right, on a grid that spans the whole hero.
 * Grid adapted from "Grid Background" by meghtrix on 21st.dev (21st.dev/@meghtrix/components/grid-background):
 * the Vercel grid at 60px, ink at 9%, an elliptical mask instead of the demo's magenta orb, fading in once.
 * Spacing rhythm from Astryx's centered-hero frame: 12px headline→sub, 24px sub→CTAs, 12px between CTAs.
 */
export function Hero() {
  const { area, card } = usePhoneTilt();
  return (
    <section
      ref={area}
      className="relative mx-auto grid max-w-[1200px] items-center gap-10 overflow-x-clip px-6 pt-12 max-md:pb-0 md:min-h-[min(calc(100svh-64px),760px)] md:grid-cols-[1.15fr_0.85fr] md:gap-12 md:overflow-clip md:pt-16 md:pb-0"
    >
      <div
        aria-hidden
        className="m-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_60%_55%,black_30%,transparent_100%)]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(23 23 23 / 0.09) 1px, transparent 1px), linear-gradient(90deg, rgb(23 23 23 / 0.09) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      <div className="relative">
        <h1 className="text-[clamp(40px,5.6vw,72px)] leading-[1] font-medium tracking-[-0.04em]">
          <BlurOutUp>Is it just you, or the whole street?</BlurOutUp>
        </h1>
        <p style={rise(240)} className="m-rise mt-3 max-w-[520px] text-base leading-[1.55] text-[var(--m-ink-2)] md:text-lg">
          Dimspot puts power, internet and cellular outages on one live map, from reports by people near you. See
          what&rsquo;s down and when it started.
        </p>
        <div style={rise(320)} className="m-rise mt-6 flex flex-wrap gap-3 max-sm:flex-col">
          <Pill href="/map" arrow className="max-sm:w-full">
            Open the live map
          </Pill>
          <Pill href="#how" variant="secondary" className="max-sm:w-full">
            See how it works
          </Pill>
        </div>
        <div style={rise(400)} className="m-rise mt-6 text-sm text-[var(--m-muted)]">
          <StatusDot live label="Reports update live" />
        </div>
      </div>

      <div className="relative flex justify-center [perspective:1000px] md:self-end">
        <div style={rise(120)} className="m-rise-lg relative w-full max-md:max-h-[420px] max-md:overflow-clip md:translate-y-[8%]">
          <div ref={card} className="m-tilt">
            <MinimalPhone clip="confirm" className="max-w-[min(360px,calc((100svh-96px)*0.462))]" />
          </div>
        </div>
      </div>
    </section>
  );
}
