"use client";

/**
 * "Your street, last 30 days": a status-page day history for one (example) street.
 * Bars adapted from "Status Bar" by openstatusHQ on 21st.dev (21st.dev/@openstatusHQ/components/status-bar):
 * kept the per-day segments, the day card on hover/focus/click and arrow-key navigation; replaced the Radix
 * hover-card with an inline card (no new dependency) and used our semantic hues.
 * Figure adapted from "Number Ticker" by danielpetho on 21st.dev (21st.dev/@danielpetho/components/basic-number-ticker).
 */

import { motion, useInView } from "motion/react";
import { useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/landing/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";
import { StatusDot } from "./status-dot";
import { Ticker } from "./ticker";

type Status = "up" | "degraded" | "down";
interface Day {
  label: string;
  segments: { status: Status; pct: number }[];
  note?: string;
}

const STATUS_TEXT: Record<Status, string> = { up: "No outage", degraded: "Brownouts reported", down: "Power out" };
const STATUS_VAR: Record<Status, string> = { up: "var(--m-up)", degraded: "var(--m-degraded)", down: "var(--m-down)" };
const DAYS_SHOWN = 30;
/** Phones show the last 12 days so each bar keeps a 24px+ hit target. */
const MOBILE_FROM = 18;
/** The card rests on the example outage, so the story reads without hovering. */
const OUTAGE_DAY = 21;
const EASE = [0.16, 1, 0.3, 1] as const;

/** Example data, labelled as such on the card. Fixed dates keep server and client output identical. */
function exampleDays(): Day[] {
  const start = Date.UTC(2026, 9, 11);
  return Array.from({ length: DAYS_SHOWN }, (_, i) => {
    const label = new Date(start + i * 86_400_000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    if (i === 21)
      return {
        label,
        segments: [
          { status: "up", pct: 81 },
          { status: "down", pct: 19 },
        ],
        note: "2:14 PM to 6:40 PM · 41 reports",
      };
    if (i === 26)
      return {
        label,
        segments: [
          { status: "up", pct: 95 },
          { status: "degraded", pct: 5 },
        ],
        note: "9 reports",
      };
    return { label, segments: [{ status: "up", pct: 100 }] };
  });
}

const DAYS = exampleDays();

function worst(day: Day): Status {
  return day.segments.some((s) => s.status === "down")
    ? "down"
    : day.segments.some((s) => s.status === "degraded")
      ? "degraded"
      : "up";
}

export function StreetStatus() {
  const reduce = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const [active, setActive] = useState<number>(OUTAGE_DAY);
  const [pinned, setPinned] = useState(false);
  // Announce day changes only for keyboard and click, not on every hover.
  const [announce, setAnnounce] = useState(false);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const step = e.key === "ArrowRight" ? 1 : -1;
      let next = i;
      // Skip days hidden on phones (display: none has no offsetParent).
      for (let tries = 0; tries < DAYS.length; tries++) {
        next = (next + step + DAYS.length) % DAYS.length;
        if (buttons.current[next]?.offsetParent) break;
      }
      buttons.current[next]?.focus();
    } else if (e.key === "Escape") {
      setActive(OUTAGE_DAY);
      setPinned(false);
      buttons.current[i]?.blur();
    }
  };

  const day = DAYS[active];

  return (
    <div
      ref={ref}
      className="rounded-xl border border-[var(--m-line)] bg-[var(--m-surface)] p-6 shadow-[var(--m-shadow)] md:p-8"
    >
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-base font-medium">Example: Elm St · Power</p>
          <StatusDot className="mt-2 text-sm text-[var(--m-ink-2)]" label="Up now" />
        </div>
        <p className="tabular-nums">
          <span className="text-[40px] leading-none font-medium tracking-[-0.02em] md:text-5xl">
            <Ticker target={99.2} start={inView} decimals={1} />
          </span>
          <span className="ml-1 text-sm text-[var(--m-muted)]">% over 30 days</span>
        </p>
      </div>

      <div
        role="toolbar"
        aria-label="Daily power status by day. Use the arrow keys to move between days."
        className="group/bars mt-8 flex h-12 items-end gap-0.5 [&>button>span:first-child]:overflow-hidden [&>button>span:first-child]:rounded-[4px]"
        onMouseLeave={() => !pinned && setActive(OUTAGE_DAY)}
      >
        {DAYS.map((d, i) => (
          <button
            key={d.label}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            aria-label={`${d.label}: ${STATUS_TEXT[worst(d)]}${d.note ? `, ${d.note}` : ""}`}
            aria-pressed={pinned && active === i}
            tabIndex={i === active ? 0 : -1}
            onMouseEnter={() => !pinned && setActive(i)}
            onFocus={() => {
              setActive(i);
              setAnnounce(true);
            }}
            onClick={() => {
              setAnnounce(true);
              setPinned((p) => !(p && active === i));
              setActive(i);
            }}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "group relative flex h-full min-w-0 flex-1 cursor-pointer",
              i < MOBILE_FROM && "max-sm:hidden",
              " flex-col overflow-visible rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-ink)] focus-visible:ring-offset-2",
            )}
          >
            <motion.span
              className={cn(
                "m-bar flex h-full w-full origin-bottom flex-col transition-opacity duration-150",
                i !== active && "group-hover/bars:opacity-55 group-focus-within/bars:opacity-55",
              )}
              initial={{ scaleY: 0 }}
              animate={reduce || inView ? { scaleY: 1 } : undefined}
              transition={reduce ? { duration: 0 } : { delay: i * 0.012, duration: 0.4, ease: EASE }}
            >
              {d.segments.map((s, j) => (
                <span key={j} style={{ height: `${s.pct}%`, backgroundColor: STATUS_VAR[s.status] }} className="w-full" />
              ))}
            </motion.span>
            {i === active ? (
              <motion.span
                layoutId="m-day-tick"
                aria-hidden
                className="absolute inset-x-0 -bottom-2 h-0.5 rounded-full bg-[var(--m-ink)]"
                transition={reduce ? { duration: 0 } : { duration: 0.25, ease: EASE }}
              />
            ) : null}
          </button>
        ))}
      </div>

      <div className="mt-3 flex justify-between text-sm text-[var(--m-muted)]">
        <span className="max-sm:hidden">{DAYS[0].label}</span>
        <span className="sm:hidden">{DAYS[MOBILE_FROM].label}</span>
        <span>Today</span>
      </div>

      <div
        aria-live={announce ? "polite" : "off"}
        className="mt-6 min-h-[72px] overflow-hidden rounded-[6px] bg-[var(--m-surface-2)] px-4 py-3 text-sm"
      >
        <div key={active} className="m-swap">
        <p className="text-[var(--m-ink-2)]">{day.label}</p>
        <StatusDot
          tone={worst(day)}
          className="mt-1 font-medium"
          label={`${STATUS_TEXT[worst(day)]}${day.note ? `, ${day.note}` : ""}`}
        />
        </div>
      </div>

      <p className={cn("mt-4 text-sm text-[var(--m-muted)]")}>
        Example data. Open the map to see each outage&rsquo;s timeline.
      </p>
    </div>
  );
}
