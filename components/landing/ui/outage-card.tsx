"use client";

// Adapted from https://21st.dev/@dev.shejanmahamud/components/expanded-map
// Changes:
// - fixed size, so nothing animates width or height; the map is revealed with
//   a clip-path wipe instead
// - the real basemap is the app's own MapLibre + OpenFreeMap (the original's
//   carto/OSM tiles are outside the CSP and need attribution handling)
// - tilt capped at 6°, only for a fine pointer, off under reduced motion
// - a real <button> with aria-expanded; a severity chip and an "Example" label

import dynamic from "next/dynamic";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { usePrefersReducedMotion } from "@/lib/landing/use-prefers-reduced-motion";
import { Signal, Wifi, Zap } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

import { CardScene } from "./card-scene";

const MiniMap = dynamic(() => import("../mini-map"), { ssr: false });

export interface OutageCardProps {
  service: "Power" | "Internet" | "Cell";
  place: string;
  severity: "complete" | "degraded" | "intermittent";
  detail: string;
  confirmations: number;
  latitude: number;
  longitude: number;
}

// Icons are chosen here, not passed in: a server component cannot hand functions to a client one.
const SERVICE_ICON = { Power: Zap, Internet: Wifi, Cell: Signal };

const SEVERITY_LABEL = { complete: "Complete outage", degraded: "Degraded", intermittent: "Intermittent" };
// Lightened severity tones that hold 4.5:1 on the night-raised surface.
const SEVERITY_TONE = {
  complete: "bg-[hsl(0_80%_68%)]",
  degraded: "bg-[hsl(24_90%_62%)]",
  intermittent: "bg-[hsl(42_92%_60%)]",
};

export function OutageCard({ service, place, severity, detail, confirmations, latitude, longitude }: OutageCardProps) {
  const Icon = SERVICE_ICON[service];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const reduce = usePrefersReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateX = useSpring(useTransform(my, [-120, 120], [6, -6]), { stiffness: 260, damping: 30 });
  const rotateY = useSpring(useTransform(mx, [-160, 160], [-6, 6]), { stiffness: 260, damping: 30 });

  const onMove = (e: React.PointerEvent) => {
    if (reduce || e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    mx.set(e.clientX - (r.left + r.width / 2));
    my.set(e.clientY - (r.top + r.height / 2));
  };
  const onLeave = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <div style={{ perspective: 1000 }}>
      <motion.button
        ref={ref}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="group relative flex h-[340px] w-full flex-col overflow-hidden rounded-[20px] border border-lamp/10 bg-night-raised text-left transition-colors duration-200 hover:border-lamp/25 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-lamp"
      >
        {/* Map panel: a drawn street scene until opened, then the real map wipes in. */}
        <div className="relative h-[180px] w-full overflow-hidden border-b border-lamp/10">
          <CardScene severity={severity} />
          <motion.div
            className="absolute inset-0"
            initial={false}
            animate={{ clipPath: open ? "inset(0% 0% 0% 0%)" : "inset(0% 0% 100% 0%)" }}
            transition={{ duration: reduce ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            {open ? <MiniMap latitude={latitude} longitude={longitude} /> : null}
          </motion.div>
          <span className="absolute top-3 right-3 rounded-[8px] bg-night/80 px-2 py-1 text-[13px] font-medium text-lamp-soft">Example</span>
        </div>

        <div className="flex flex-1 flex-col gap-2 p-5">
          <div className="flex items-center gap-2 text-[14px] text-lamp-soft">
            <Icon className="size-5" />
            <span>{service}</span>
            <span className="ml-auto flex items-center gap-2 text-lamp">
              <span className={cn("size-2 rounded-full", SEVERITY_TONE[severity])} aria-hidden />
              {SEVERITY_LABEL[severity]}
            </span>
          </div>
          <p className="text-[22px] leading-[1.2] font-semibold tracking-[-0.01em] text-lamp">{place}</p>
          <p className="text-[15px] leading-[1.5] text-lamp-soft">{detail}</p>
          <p className="mt-auto text-[14px] tabular-nums text-lamp-soft">
            {confirmations} people confirmed · <span className="text-lamp underline-offset-4 group-hover:underline">{open ? "Hide map" : "Show on map"}</span>
          </p>
        </div>
      </motion.button>
    </div>
  );
}
