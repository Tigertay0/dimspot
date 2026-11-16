"use client";

/**
 * The real app in a phone frame: screen recordings of Dimspot itself (made with
 * studio-loop's record-flow.mjs from the live /map app, data and all). Each clip
 * plays only while it is on screen; under reduced motion it shows its last frame.
 */

import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/landing/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

export type PhoneClip = "report" | "confirm" | "alerts";

const LABELS: Record<PhoneClip, string> = {
  report: "Recording of Dimspot: tapping Report outage, choosing Power, then placing the pin",
  confirm: "Recording of Dimspot: searching a county, seeing the two outages there, and opening one",
  alerts: "Recording of Dimspot: the settings sheet with alerts and saved places",
};

const VISIBLE_THRESHOLD = 0.4;

function Clip({ clip }: { clip: PhoneClip }) {
  const reduce = usePrefersReducedMotion();
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || reduce) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: VISIBLE_THRESHOLD },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [reduce]);

  const poster = `/landing/footage/${clip}.jpg`;
  if (reduce) {
    // eslint-disable-next-line @next/next/no-img-element -- a fixed-size poster frame inside the phone
    return <img src={poster} alt={LABELS[clip]} width={780} height={1688} className="h-full w-full object-cover object-top" />;
  }
  return (
    <video
      ref={ref}
      src={`/landing/footage/${clip}.mp4`}
      poster={poster}
      muted
      loop
      playsInline
      preload="metadata"
      aria-label={LABELS[clip]}
      className="h-full w-full object-cover object-top"
    />
  );
}

export function Phone({ clip, className }: { clip: PhoneClip; className?: string }) {
  // Width is capped by the screen height too (390/844 = 0.462), so the whole phone always fits
  // beside the sticky story with room above and below, never clipped at the bottom.
  return (
    <div
      className={cn(
        "relative mx-auto aspect-[390/844] w-full max-w-[min(300px,calc((100dvh-11rem)*0.462))] rounded-[44px] border border-lamp/15 bg-night-high p-2.5 lg:max-w-[min(340px,calc((100dvh-11rem)*0.462))]",
        className,
      )}
    >
      <div className="relative h-full overflow-hidden rounded-[36px] bg-night">
        <Clip clip={clip} />
      </div>
    </div>
  );
}
