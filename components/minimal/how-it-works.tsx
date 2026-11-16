"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { usePrefersReducedMotion } from "@/lib/landing/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";
import { type Clip, MinimalPhone } from "./phone";

const STEPS: { clip: Clip; short: string; title: string; body: string }[] = [
  { clip: "report", short: "Report", title: "Report what’s down", body: "Tap the service that dropped and place a pin. It takes about ten seconds." },
  { clip: "confirm", short: "Confirm", title: "Confirm what others report", body: "One tap tells your neighbours it isn’t just them, so the map stays honest." },
  { clip: "alerts", short: "Alerts", title: "Get an alert for your places", body: "Save home and work, and Dimspot tells you when something nearby goes down." },
];
const CLIPS = STEPS.map((s) => s.clip);

/** Steps as rows (dense content in rows, not cards); the active row picks the phone's real recording. */
export function HowItWorks() {
  const [active, setActive] = useState(0);
  const reduce = usePrefersReducedMotion();
  const slide = reduce ? { duration: 0 } : { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const };
  return (
    <div className="grid gap-10 md:grid-cols-[0.9fr_1.1fr] md:items-center md:gap-16">
      <div>
        <div role="group" aria-label="How Dimspot works" className="grid grid-cols-3 gap-1 rounded-[6px] bg-[var(--m-surface-2)] p-1 md:hidden">
          {STEPS.map((s, i) => (
            <button
              key={s.clip}
              type="button"
              aria-pressed={active === i}
              onClick={() => setActive(i)}
              className={cn(
                "relative min-h-11 rounded-[4px] px-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-ink)]",
                active === i ? "text-[var(--m-ink)]" : "text-[var(--m-muted)]",
              )}
            >
              {active === i ? (
                <motion.span
                  layoutId="m-seg"
                  transition={slide}
                  className="absolute inset-0 rounded-[4px] border border-[var(--m-line)] bg-[var(--m-surface)] shadow-[var(--m-shadow-btn)]"
                />
              ) : null}
              <span className="relative">{s.short}</span>
            </button>
          ))}
        </div>
        <p className="mt-4 text-base leading-[1.55] text-[var(--m-ink-2)] md:hidden">
          <span className="block text-lg font-medium text-[var(--m-ink)]">{STEPS[active].title}</span>
          {STEPS[active].body}
        </p>
        <div role="group" aria-label="How Dimspot works" className="hidden flex-col md:flex md:self-center">
          {STEPS.map((s, i) => (
            <button
              key={s.clip}
              type="button"
              aria-pressed={active === i}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              className={cn(
                "relative min-h-[72px] border-t border-[var(--m-line)] px-4 py-6 text-left outline-none last:border-b",
                "transition-colors duration-150 ease-[var(--m-ease)] focus-visible:ring-2 focus-visible:ring-[var(--m-ink)] focus-visible:ring-offset-2",
                active === i ? "text-[var(--m-ink)]" : "text-[var(--m-ink-2)] hover:text-[var(--m-ink)]",
              )}
            >
              {active === i ? (
                <motion.span
                  layoutId="m-row"
                  transition={slide}
                  aria-hidden
                  className="absolute inset-0 rounded-[6px] bg-[var(--m-surface-2)]"
                />
              ) : null}
              <span className="relative block text-lg font-medium tracking-[-0.01em] md:text-xl">{s.title}</span>
              <span className="relative mt-2 block text-base leading-[1.55]">{s.body}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="md:sticky md:top-24 md:self-start">
        <MinimalPhone
          clip={STEPS[active].clip}
          clips={CLIPS}
          className="max-w-[min(280px,calc((100svh-200px)*0.462))]"
        />
      </div>
    </div>
  );
}
