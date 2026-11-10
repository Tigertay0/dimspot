"use client";

import { cn } from "@/lib/utils";
import { Ticker } from "./ticker";
import { useShown } from "./use-shown";

/** 41 report dots inside a 400 m ring, at fixed (deterministic) positions so server and client match. */
function reportDots(count: number) {
  let seed = 41;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  return Array.from({ length: count }, () => {
    const angle = rand() * Math.PI * 2;
    const r = 18 + Math.sqrt(rand()) * 118;
    return { x: Math.round((160 + Math.cos(angle) * r) * 10) / 10, y: Math.round((160 + Math.sin(angle) * r) * 10) / 10 };
  });
}
const DOTS = reportDots(41);

/**
 * The one dark band: a clip-path wipe (CSS, observed on the unclipped section), then a drawn proof visual:
 * a 400 m ring, 41 report dots fading in on a 12ms stagger, the amber pin with its ring growing once, and the
 * "41" counting up. Fallbacks for reduced motion and no scripting live in minimal.css.
 */
export function RouterBand() {
  const { ref, shown } = useShown<HTMLElement>(0.35);
  return (
    <section ref={ref} aria-labelledby="router-title">
      <div className={cn("m-band bg-[var(--m-dark)] px-6 py-24 md:py-32", shown && "is-shown")}>
        <div className="mx-auto grid max-w-[1200px] items-center gap-12 md:grid-cols-2">
          <div>
            <h2
              id="router-title"
              className="text-[clamp(28px,3.2vw,40px)] leading-[1.1] font-medium tracking-[-0.03em] text-[var(--m-dark-ink)]"
            >
              Is it your router or the whole street?
            </h2>
            <p className="mt-4 max-w-[520px] text-base leading-[1.55] text-[var(--m-dark-ink-2)] md:text-lg">
              If your neighbours report the same outage, it isn&rsquo;t your setup. Dimspot shows you in one look,
              before you restart anything.
            </p>
            <p className="mt-8 font-mono text-base text-[var(--m-dark-ink)] tabular-nums">
              <Ticker target={41} start={shown} /> reports within 400&nbsp;m
              <span className="max-sm:hidden"> · </span>
              <br className="sm:hidden" />
              last 20&nbsp;min
            </p>
            <p className="mt-1 text-sm text-[var(--m-dark-ink-2)]">Example</p>
          </div>

          <svg
            viewBox="0 0 320 320"
            className="mx-auto w-full max-w-[320px]"
            role="img"
            aria-label="Example: 41 outage reports within 400 metres of you"
          >
            <circle cx="160" cy="160" r="140" fill="none" stroke="var(--m-dark-line)" />
            <circle cx="160" cy="160" r="70" fill="none" stroke="var(--m-dark-line)" strokeDasharray="2 4" />
            <text x="160" y="14" textAnchor="middle" fontSize="11" className="fill-[var(--m-dark-ink-2)] font-mono">
              400 m
            </text>
            {DOTS.map((d, i) => (
              <circle
                key={i}
                cx={d.x}
                cy={d.y}
                r="2"
                className="m-band-dot fill-[var(--m-dark-ink)]"
                style={{ transitionDelay: `${400 + i * 12}ms` }}
              />
            ))}
            <circle cx="160" cy="160" r="24" fill="none" stroke="var(--m-amber)" className="m-band-ring" />
            <circle cx="160" cy="160" r="8" fill="var(--m-amber)" />
          </svg>
        </div>
      </div>
    </section>
  );
}
