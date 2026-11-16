/**
 * Maths for a film that is scrubbed by scroll (see components/landing/ui/scroll-film.tsx).
 * Kept apart from the component so it can be tested without a browser.
 */

/** One film in two encodes. Each poster is the first frame of the clip beside it. */
export interface ScrollFilmSource {
  clip: string;
  poster: string;
  mobileClip: string;
  mobilePoster: string;
  /** What the film shows, for people who cannot see it. */
  alt: string;
}

/** Stay this far from the very end: seeking to `duration` exactly shows a blank frame in some browsers. */
export const FILM_END_GUARD_S = 0.05;

/** Seeks closer than this to the current time are skipped: under half a frame of the 24fps clips. */
export const FILM_SEEK_EPSILON_S = 1 / 60;

/** Scroll progress (0-1) to a time in the film, in seconds. Bad input lands on the first frame. */
export function filmTimeFor(progress: number, duration: number): number {
  if (!Number.isFinite(progress) || !Number.isFinite(duration) || duration <= 0) return 0;
  const clamped = Math.min(1, Math.max(0, progress));
  return clamped * Math.max(0, duration - FILM_END_GUARD_S);
}

/** True when the film should jump to `target`; false when it is already showing that frame. */
export function needsSeek(current: number, target: number): boolean {
  return Math.abs(current - target) > FILM_SEEK_EPSILON_S;
}
