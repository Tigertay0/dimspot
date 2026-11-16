/**
 * Landing imagery. Every picture and the descent film were generated for
 * Dimspot (no stock photography), graded to the dusk, night and sodium palette.
 * The untouched source files live in .design/generated; the files served from
 * public/landing are the compressed copies.
 */
import type { ScrollFilmSource } from "@/lib/landing/scroll-film";

export interface LandingImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}

/** Act 5 background: one lamp still lit under a pylon. */
export const PYLON: LandingImage = {
  src: "/landing/generated/pylon-dusk.webp",
  alt: "A power line tower over a quiet street at dusk, with a single streetlamp lit",
  width: 1792,
  height: 2400,
};

/** The first view of the descent, as a still (reduced motion, and the film's opening frame). */
export const SKYLINE: LandingImage = {
  src: "/landing/generated/skyline-dusk.webp",
  alt: "A city from above at dusk, its streets traced by amber streetlights",
  width: 2400,
  height: 1340,
};

/** Act 2: the camera comes down from the dusk sky to one street, scrubbed by the scroll. */
export const DESCENT: ScrollFilmSource = {
  clip: "/landing/descent/descent.mp4",
  poster: "/landing/descent/descent-poster.jpg",
  mobileClip: "/landing/descent/descent-mobile.mp4",
  mobilePoster: "/landing/descent/descent-mobile-poster.jpg",
  alt: "The view descends from high above a city at dusk until it looks straight down on one neighbourhood's streets",
};
