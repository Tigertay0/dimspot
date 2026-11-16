"use client";

/**
 * A film played by the scroll position instead of a clock: forward as the page
 * goes down, backward as it goes up, and held as a still whenever it stops.
 *
 * - The poster is the first frame of the exact clip beside it, and stays up
 *   until the video has painted a real frame, so nothing flashes or jumps.
 * - The clip is fetched once, when the section is close, and played from memory
 *   (a blob URL), so a seek never waits on the network. The clips are encoded
 *   with a keyframe every few frames, which keeps backward seeks cheap too.
 * - Seeks are coalesced: while one is in flight the newest target waits, then
 *   goes out alone. Nothing per-frame passes through React state.
 * - On a failed download, or with Save-Data on, the poster simply stays.
 *
 * Reduced motion is the caller's job: do not render this at all, show a still.
 */

import { type MotionValue, useMotionValueEvent } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type ScrollFilmSource, filmTimeFor, needsSeek } from "@/lib/landing/scroll-film";
import { useIsPhone } from "@/lib/landing/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

/** Matches useIsPhone and Tailwind's max-[640px]. */
const PHONE_QUERY = "(max-width: 640px)";

interface ScrollFilmProps {
  /** 0 = first frame, 1 = last frame. */
  progress: MotionValue<number>;
  source: ScrollFilmSource;
  className?: string;
}

/** Events that count as a user gesture, for browsers that refuse to play without one. */
const PRIMING_GESTURES = ["pointerup", "touchend"] as const;

/** Start downloading when the film is within this distance of the viewport. */
const NEAR_MARGIN = "150% 0px";

function prefersLessData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

export function ScrollFilm({ progress, source, className }: ScrollFilmProps) {
  const isPhone = useIsPhone();
  const clip = isPhone ? source.mobileClip : source.clip;

  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  // The clip whose first real frame is on screen; the poster shows for any other.
  const [paintedClip, setPaintedClip] = useState<string | null>(null);

  /** Move the film to where the scroll is, unless a seek is already in flight. */
  const seek = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.seeking || video.readyState < HTMLMediaElement.HAVE_METADATA) return;
    const target = filmTimeFor(progress.get(), video.duration);
    if (needsSeek(video.currentTime, target)) video.currentTime = target;
  }, [progress]);

  useMotionValueEvent(progress, "change", seek);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setNear(true);
      },
      { rootMargin: NEAR_MARGIN },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !near || prefersLessData()) return;

    const abort = new AbortController();
    let objectUrl: string | null = null;

    const onSeeked = () => {
      setPaintedClip(clip);
      seek(); // the scroll may have moved on while this seek was in flight
    };
    // Mobile Safari decodes nothing until the element has played once. Muted
    // inline playback is allowed without a tap; if it is refused (Low Power
    // Mode, for one), the next tap primes it instead. Until then the poster stays.
    let primed = false;
    const prime = () => {
      if (primed) return;
      video
        .play()
        .then(() => {
          primed = true;
          video.pause();
          seek(); // playing moved the playhead a little; put it back on the scroll
        })
        .catch(() => {
          // Only the end of a touch or click counts as a user gesture; pointerdown does not on touch screens.
          for (const gesture of PRIMING_GESTURES) window.addEventListener(gesture, prime, { once: true, signal: abort.signal });
        });
    };
    const onMetadata = () => {
      prime();
      // Seeking to the frame it is already on fires no "seeked" in some
      // browsers, so the first frame is requested slightly off zero.
      video.currentTime = Math.max(filmTimeFor(progress.get(), video.duration), 0.001);
    };

    video.addEventListener("seeked", onSeeked, { signal: abort.signal });
    video.addEventListener("loadedmetadata", onMetadata, { signal: abort.signal });

    fetch(clip, { signal: abort.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${clip}`);
        return response.blob();
      })
      .then((blob) => {
        if (abort.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        video.src = objectUrl;
        video.load();
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted) return;
        // The poster stays on screen, so the story still reads; say why the film is missing.
        console.error("[scroll-film] could not load the film, keeping the poster", error);
      });

    return () => {
      abort.abort();
      video.removeAttribute("src");
      video.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [near, clip, progress, seek]);

  const painted = paintedClip === clip;

  return (
    <div ref={frameRef} className={cn("absolute inset-0 overflow-hidden", className)}>
      <picture>
        <source media={PHONE_QUERY} srcSet={source.mobilePoster} />
        {/* A plain img, not next/image: this must be the exact first frame of the clip, not a resized copy. */}
        <img src={source.poster} alt={source.alt} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      </picture>
      <video
        ref={videoRef}
        muted
        playsInline
        preload="none"
        disablePictureInPicture
        aria-hidden
        tabIndex={-1}
        className={cn("absolute inset-0 h-full w-full object-cover", painted ? "opacity-100" : "opacity-0")}
      />
    </div>
  );
}
