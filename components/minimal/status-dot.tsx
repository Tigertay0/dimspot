"use client";

/**
 * Live status dot with a visible label (Astryx rule: never colour alone).
 * Adapted from "Status Dot" by edwinvakayil on 21st.dev (21st.dev/@edwinvakayil/components/status-dot):
 * kept the two-ring ripple and reduced-motion stop, dropped the 40-variable theme class for our tokens,
 * and pause the ripple while offscreen so it is the page's only ambient loop.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Tone = "up" | "degraded" | "down";
const COLOR: Record<Tone, string> = { up: "var(--m-up)", degraded: "var(--m-degraded)", down: "var(--m-down)" };

export function StatusDot({
  tone = "up",
  label,
  live = false,
  className,
}: {
  tone?: Tone;
  label: string;
  live?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [onScreen, setOnScreen] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || !live) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, [live]);

  return (
    <span ref={ref} className={cn("inline-flex items-center gap-2", className)}>
      <span aria-hidden className="relative inline-flex size-3.5 items-center justify-center">
        <span
          className={cn("size-2 rounded-full", live && "m-dot-ripple")}
          data-paused={!onScreen}
          style={{ backgroundColor: COLOR[tone], ["--dot" as string]: COLOR[tone] }}
        />
      </span>
      <span>{label}</span>
    </span>
  );
}
