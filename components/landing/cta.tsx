import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Adapted from https://21st.dev/@hyperiux/components/arrow-fill-button (picked by the user in edit mode).
// Changes: fixed pixel sizes from the 4px grid instead of vw, Dimspot sodium and night, the project
// easing, two sizes that share one anatomy, :active drives the fill on touch, no mount-time hiding.

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-current";
const MOTION = "duration-500 ease-lights motion-reduce:transition-none";

const SIZES = {
  md: { h: "h-12 text-[16px] pl-6", chip: 36, gap: 6, icon: "size-4" },
  sm: { h: "h-9 text-[14px] pl-4", chip: 28, gap: 4, icon: "size-3.5" },
} as const;

/**
 * The primary action: a sodium pill with a night chip at its end. On hover (or press on touch) the
 * chip grows to fill the whole pill, the label turns sodium on night, and the arrow slides through.
 */
export function OpenMapButton({
  className,
  label = "Open the live map",
  href = "/map",
  size = "md",
}: {
  className?: string;
  label?: string;
  href?: string;
  size?: keyof typeof SIZES;
}) {
  const s = SIZES[size];
  const vars = {
    "--chip": `${s.chip}px`,
    "--gap": `${s.gap}px`,
    "--chip-y": "calc((100% - var(--chip)) / 2)",
  } as CSSProperties;
  // The fill starts as the chip's own circle and grows to cover the pill.
  const chipInset = "inset-[var(--chip-y)_var(--gap)_var(--chip-y)_calc(100%-var(--gap)-var(--chip))]";
  const labelPad = "pr-[calc(var(--chip)+var(--gap)+16px)]";

  return (
    <Link
      href={href}
      style={vars}
      className={cn(
        "group/cta relative isolate inline-flex shrink-0 items-center overflow-hidden rounded-full bg-sodium font-semibold tracking-[-0.01em] whitespace-nowrap text-night",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_1px_2px_rgba(12,18,34,0.2)] transition-transform duration-150 active:scale-[0.98]",
        s.h,
        labelPad,
        FOCUS,
        className,
      )}
    >
      <span className="relative z-[1]">{label}</span>

      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute z-[2] rounded-full bg-night transition-[inset]",
          MOTION,
          chipInset,
          "group-hover/cta:inset-0 group-focus-visible/cta:inset-0 group-active/cta:inset-0",
        )}
      />

      {/* The label again, in sodium, revealed by the same shape as the fill. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-[2] flex items-center text-sodium transition-[clip-path]",
          MOTION,
          s.h,
          labelPad,
          "[clip-path:inset(var(--chip-y)_var(--gap)_var(--chip-y)_calc(100%-var(--gap)-var(--chip))_round_999px)]",
          "group-hover/cta:[clip-path:inset(0_0_0_0_round_999px)] group-focus-visible/cta:[clip-path:inset(0_0_0_0_round_999px)] group-active/cta:[clip-path:inset(0_0_0_0_round_999px)]",
        )}
      >
        {label}
      </span>

      <span aria-hidden className="pointer-events-none absolute top-1/2 right-[var(--gap)] z-[3] flex size-[var(--chip)] -translate-y-1/2 items-center justify-center overflow-hidden rounded-full text-sodium">
        <ArrowRight className={cn(s.icon, "absolute transition-transform", MOTION, "group-hover/cta:translate-x-[180%] group-active/cta:translate-x-[180%]")} strokeWidth={2} />
        <ArrowRight className={cn(s.icon, "absolute -translate-x-[180%] transition-transform", MOTION, "group-hover/cta:translate-x-0 group-active/cta:translate-x-0")} strokeWidth={2} />
      </span>
    </Link>
  );
}

/**
 * Secondary action, same family: same heights, radius and weight as the primary, but an outline in
 * the text colour of wherever it sits, so it never competes with the sodium button beside it.
 */
export function QuietLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      className={cn(
        "inline-flex h-12 items-center rounded-full border border-current/25 px-6 text-[16px] font-semibold tracking-[-0.01em]",
        "transition-[background-color,border-color,transform] duration-300 ease-lights hover:border-current/40 hover:bg-current/[0.08] active:scale-[0.98]",
        FOCUS,
        className,
      )}
    >
      {children}
    </a>
  );
}
