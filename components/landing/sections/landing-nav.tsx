"use client";

// Adapted from https://21st.dev/@preetsuthar17/components/navbar-1 (picked by the user in edit mode).
// Changes: Dimspot's mark, links and lamp/night colours; the CTA is the site's own arrow-fill button
// at the small size; the pill lifts a little once you scroll; the mobile menu is a real dialog
// (Escape closes, focus moves in and back, the page stops scrolling) and respects reduced motion.

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { usePrefersReducedMotion } from "@/lib/landing/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";
import { OpenMapButton } from "../cta";

const LIFT_AFTER_PX = 24;
const EASE = [0.16, 1, 0.3, 1] as const;

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "/map?action=report", label: "Report an outage" },
];
// "Live map" lives only on the Open map button, so the nav never offers one action twice.

function MobileMenu({ onClose }: { onClose: () => void }) {
  const reduce = usePrefersReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <motion.div
      id="mobile-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      className="pointer-events-auto fixed inset-0 z-50 bg-lamp px-6 pt-24 text-night md:hidden"
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: "100%" }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: "100%" }}
      transition={reduce ? { duration: 0.15 } : { type: "spring", damping: 28, stiffness: 300 }}
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close menu"
        className="absolute top-5 right-5 flex size-11 items-center justify-center rounded-full transition-colors hover:bg-night/[0.06] focus-visible:outline-2 focus-visible:outline-current"
      >
        <X className="size-6" aria-hidden />
      </button>
      <ul className="flex flex-col gap-2">
        {LINKS.map((l, i) => (
          <motion.li
            key={l.href}
            initial={reduce ? false : { opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.08, duration: 0.4, ease: EASE }}
          >
            <a href={l.href} onClick={onClose} className="block py-3 text-[28px] leading-[1.15] font-semibold tracking-[-0.03em]">
              {l.label}
            </a>
          </motion.li>
        ))}
      </ul>
      <motion.div
        className="pt-8"
        initial={reduce ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4, ease: EASE }}
      >
        <OpenMapButton label="Open the live map" />
      </motion.div>
    </motion.div>
  );
}

export function LandingNav() {
  const reduce = usePrefersReducedMotion();
  const { scrollY } = useScroll();
  const [lifted, setLifted] = useState(false);
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useMotionValueEvent(scrollY, "change", (y) => setLifted(y > LIFT_AFTER_PX));

  const close = () => {
    setOpen(false);
    menuButton.current?.focus();
  };

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4 max-[640px]:px-3 max-[640px]:pt-3">
      <nav
        aria-label="Main"
        className={cn(
          "pointer-events-auto relative z-10 flex h-14 w-full max-w-3xl items-center justify-between rounded-full bg-lamp pr-2 pl-5 text-night",
          "shadow-[0_8px_24px_-12px_rgba(12,18,34,0.45),inset_0_0_0_1px_rgba(12,18,34,0.06)] transition-shadow duration-300 ease-lights",
          lifted && "shadow-[0_18px_40px_-16px_rgba(12,18,34,0.6),inset_0_0_0_1px_rgba(12,18,34,0.06)]",
        )}
      >
        <Link href="/" className="flex items-center gap-2 rounded-full text-[16px] font-semibold tracking-[-0.025em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current">
          <motion.span
            className="flex"
            initial={reduce ? false : { scale: 0.8 }}
            animate={{ scale: 1 }}
            whileHover={reduce ? undefined : { rotate: 10 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <BrandMark />
          </motion.span>
          Dimspot
        </Link>

        <ul className="flex items-center gap-1 max-md:hidden">
          {LINKS.map((l, i) => (
            <motion.li
              key={l.href}
              initial={reduce ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 * i, ease: EASE }}
            >
              <a
                href={l.href}
                className="flex h-9 items-center rounded-full px-3 text-[14px] font-semibold tracking-[-0.01em] text-night/75 transition-[color,background-color] duration-150 hover:bg-night/[0.06] hover:text-night focus-visible:outline-2 focus-visible:outline-current"
              >
                {l.label}
              </a>
            </motion.li>
          ))}
        </ul>

        <OpenMapButton size="sm" label="Open map" className="max-md:hidden" />

        <button
          ref={menuButton}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="mobile-menu"
          className="flex size-11 items-center justify-center rounded-full transition-colors hover:bg-night/[0.06] focus-visible:outline-2 focus-visible:outline-current md:hidden"
        >
          <Menu className="size-6" aria-hidden />
        </button>
      </nav>

      <AnimatePresence>{open && <MobileMenu onClose={close} />}</AnimatePresence>
    </header>
  );
}
