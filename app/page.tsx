import type { Metadata } from "next";
import { ActFindOut } from "@/components/landing/sections/act-find-out";
import { ActLightsBack } from "@/components/landing/sections/act-lights-back";
import { ActLightsOut } from "@/components/landing/sections/act-lights-out";
import { ActOrbit } from "@/components/landing/sections/act-orbit";
import { ActStreet } from "@/components/landing/sections/act-street";
import { LandingFooter } from "@/components/landing/sections/landing-footer";
import { LandingNav } from "@/components/landing/sections/landing-nav";
import { SmoothScroll } from "@/components/landing/smooth-scroll";

export const metadata: Metadata = {
  title: "Dimspot: when the lights go out, find out if it's just you",
  description:
    "Power, internet and cell outages, reported by the people living them and confirmed on one live map. Find out whether it's your router or your whole street.",
};

/**
 * The landing page: one evening in six acts (see .design/brief.md). The live
 * map moved to /map.
 */
export default function LandingPage() {
  return (
    <div className="bg-dusk font-text text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-[12px] focus:bg-night focus:px-4 focus:py-2 focus:text-lamp"
      >
        Skip to content
      </a>
      <SmoothScroll />
      <LandingNav />
      <main id="main">
        <ActOrbit />
        <ActLightsOut />
        <ActFindOut />
        <ActStreet />
        <ActLightsBack />
      </main>
      <LandingFooter />
    </div>
  );
}
