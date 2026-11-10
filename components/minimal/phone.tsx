"use client";

/**
 * The real app in a light phone frame: screen recordings of Dimspot made with studio-loop's
 * record-flow.mjs (public/landing/footage). Plays only while on screen; reduced motion shows the poster.
 */

import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/landing/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

export type Clip = "report" | "confirm" | "alerts";

/**
 * Each clip plays only its populated window (frames checked every 0.5s with ffmpeg); the poster is the
 * window's first frame (footage/minimal/*-start.jpg). confirm: the 123-outage heatmap before it zooms into
 * an empty county; report: the report sheet steps; alerts: the settings sheet.
 */
const WINDOW: Record<Clip, { start: number; end: number }> = {
  confirm: { start: 1.5, end: 4.6 },
  report: { start: 1.5, end: 11.0 },
  alerts: { start: 1.5, end: 2.5 },
};

export const CLIP_LABEL: Record<Clip, string> = {
  report: "Recording of Dimspot: tapping Report outage, choosing Power, then placing the pin",
  confirm: "Recording of Dimspot: searching a county, seeing the outages there, and opening one",
  alerts: "Recording of Dimspot: the settings sheet with alerts and saved places",
};

function Video({ clip, active }: { clip: Clip; active: boolean }) {
  const reduce = usePrefersReducedMotion();
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || reduce) return;
    if (!active) {
      video.pause();
      return;
    }
    const { start, end } = WINDOW[clip];
    if (video.currentTime < start || video.currentTime > end) video.currentTime = start;
    // Loop inside the window; a short opacity dip hides the seam.
    const onTime = () => {
      if (video.currentTime < end) return;
      video.style.opacity = "0.85";
      video.currentTime = start;
      video.play().catch(() => {});
      window.setTimeout(() => (video.style.opacity = ""), 120);
    };
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("ended", onTime);
    const observer = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? video.play().catch(() => {}) : video.pause()),
      { threshold: 0.4 },
    );
    observer.observe(video);
    return () => {
      observer.disconnect();
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("ended", onTime);
    };
  }, [reduce, active, clip]);

  const poster = `/landing/footage/minimal/${clip}-start.jpg`;
  return (
    <video
      ref={ref}
      src={reduce ? undefined : `/landing/footage/${clip}.mp4#t=${WINDOW[clip].start}`}
      poster={poster}
      muted
      playsInline
      preload="metadata"
      aria-label={CLIP_LABEL[clip]}
      aria-hidden={!active}
      className={cn(
        "absolute inset-0 h-full w-full object-cover object-top transition-[opacity,transform,filter] duration-300 ease-[var(--m-ease)] motion-reduce:transition-none",
        active ? "scale-100 opacity-100 blur-0" : "scale-[0.98] opacity-0 blur-[2px]",
      )}
    />
  );
}

/** One phone; `clip` picks the visible recording, others stay mounted so swaps crossfade. */
export function MinimalPhone({ clip, clips = [clip], className }: { clip: Clip; clips?: Clip[]; className?: string }) {
  return (
    <div
      className={cn(
        "relative mx-auto aspect-[390/844] w-full rounded-[40px] border border-[var(--m-line)] bg-[var(--m-surface)] p-2 shadow-[var(--m-shadow)]",
        className,
      )}
    >
      <div className="relative h-full overflow-hidden rounded-[32px] bg-[var(--m-surface-2)]">
        {clips.map((c) => (
          <Video key={c} clip={c} active={c === clip} />
        ))}
      </div>
    </div>
  );
}
