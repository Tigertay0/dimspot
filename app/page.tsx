import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { Hero } from "@/components/minimal/hero";
import { HowItWorks } from "@/components/minimal/how-it-works";
import { MinimalNav } from "@/components/minimal/nav";
import { Pill } from "@/components/minimal/pill";
import { RouterBand } from "@/components/minimal/router-band";
import { DrawHeading, StaggerHeading, WipeHeading } from "@/components/minimal/reveal-heading";
import { StreetStatus } from "@/components/minimal/street-status";
import "@/components/minimal/minimal.css";

export const metadata: Metadata = {
  title: "Dimspot: is it just you, or the whole street?",
  description:
    "Power, internet and cellular outages on one live map, from reports by people near you. See what is down and when it started.",
  openGraph: {
    title: "Dimspot: is it just you, or the whole street?",
    images: [{ url: "/landing/minimal-og.jpg", width: 1200, height: 630 }],
  },
};

export const viewport = { themeColor: "#fafafa" };

const FOOT_LINK =
  "-mx-1 inline-flex min-h-11 items-center rounded-[6px] px-1 hover:text-[var(--m-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--m-ink)] sm:min-h-8";

/** The Dimspot homepage: the minimal, Vercel-style design from the studio-loop run in .design/minimal/. */
export default function Home() {
  return (
    <div className="minimal-root min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-[6px] bg-[var(--m-ink)] px-3 py-2 text-sm text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <div id="minimal-top" aria-hidden className="h-px" />
      <MinimalNav />
      <main id="main">
        <Hero />

        <section id="street" aria-labelledby="street-title" className="scroll-mt-20 py-24 md:py-32">
          <div className="mx-auto max-w-[1200px] px-6">
            <StaggerHeading
              id="street-title"
              title="See the hour it went down, not just that it did"
              line="This is how a street’s outage history could read: the day, the hours, and how many people reported it."
            />
            <div className="mt-12">
              <StreetStatus />
            </div>
          </div>
        </section>

        <section id="how" aria-labelledby="how-title" className="scroll-mt-20 pb-24 md:pb-32">
          <div className="mx-auto max-w-[1200px] px-6">
            <WipeHeading id="how-title" className="mb-12">
              How it works
            </WipeHeading>
            <HowItWorks />
          </div>
        </section>

        <RouterBand />

        <section aria-labelledby="close-title" className="py-24 md:py-32">
          <div className="mx-auto flex max-w-[1200px] flex-col items-start gap-6 px-6">
            <div className="flex flex-col gap-3">
              <DrawHeading id="close-title" lead="Check your street" word="now" />
              <p className="text-base text-[var(--m-ink-2)] md:text-lg">Free, and no account needed to look at the map.</p>
            </div>
            <div className="flex w-full flex-wrap gap-3 max-sm:flex-col">
              <Pill href="/map" arrow className="max-sm:w-full">
                Open the live map
              </Pill>
              <Pill href="#how" variant="secondary" className="max-sm:w-full">
                See how it works
              </Pill>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--m-line)]">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6 text-sm text-[var(--m-muted)]">
          <span className="inline-flex items-center gap-2">
            <BrandMark className="h-4 text-[var(--m-ink-2)]" />
            Dimspot
          </span>
          <nav aria-label="Footer" className="flex gap-6">
            <Link href="/map" className={FOOT_LINK}>
              Open the map
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
