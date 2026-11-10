"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/utils";
import { Pill } from "./pill";
import { ScrollProgress } from "./scroll-progress";

const NAV_LINK =
  "-mx-1 hidden min-h-8 items-center rounded-[6px] px-1 text-sm text-[var(--m-ink-2)] underline-offset-[3px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--m-ink)] sm:inline-flex";

/** 64px bar; the translucent blur appears only once the page scrolls under it. */
export function MinimalNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const sentinel = document.getElementById("minimal-top");
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-[background-color,border-color] duration-200 ease-[var(--m-ease)]",
        scrolled ? "border-[var(--m-line)] bg-[var(--m-bg)]/85 backdrop-blur-md" : "border-transparent bg-[var(--m-bg)]",
      )}
    >
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-[6px] text-base font-medium tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-ink)]"
        >
          <BrandMark className="h-5 text-[var(--m-ink)]" />
          Dimspot
        </Link>
        <div className="flex items-center gap-6">
          <a
            href="#how"
            className={NAV_LINK}
          >
            How it works
          </a>
          <a
            href="#street"
            className={NAV_LINK}
          >
            Your street
          </a>
          <Pill href="/map" tier="nav">
            Open the map
          </Pill>
        </div>
      </nav>
      <ScrollProgress />
    </header>
  );
}
