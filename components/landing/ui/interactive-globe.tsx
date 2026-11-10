"use client";

// Adapted from https://21st.dev/@dev.yadhakim/components/interactive-globe
// Changes:
// - recoloured to the Lights Out palette (ink dots on dusk, sodium markers);
//   no blue glow, no arcs
// - an outage tour: the globe turns to a city, zooms in, shows what is out there
//   ("Internet outage · Palo Alto, CA"), zooms back out and moves on
// - camera zoom is a 2D scale after projection, so perspective never blows up
// - pauses offscreen, when the tab is hidden, and while being dragged; under
//   reduced motion it is one still frame facing the US with every spot marked
// - stops are examples (the page says so); no live data is claimed

import { Signal, Wifi, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LAND_DOTS } from "@/lib/landing/land-dots";
import { cn } from "@/lib/utils";

type Service = "Power" | "Internet" | "Cell";

interface TourStop {
  lat: number;
  lng: number;
  place: string;
  service: Service;
}

/** Example outages the hero tours through. */
const STOPS: TourStop[] = [
  { lat: 37.44, lng: -122.14, place: "Palo Alto, CA", service: "Internet" },
  { lat: 30.27, lng: -97.74, place: "Austin, TX", service: "Power" },
  { lat: 41.88, lng: -87.63, place: "Chicago, IL", service: "Cell" },
  { lat: 40.68, lng: -73.94, place: "Brooklyn, NY", service: "Power" },
  { lat: 25.76, lng: -80.19, place: "Miami, FL", service: "Internet" },
  { lat: 39.74, lng: -104.99, place: "Denver, CO", service: "Power" },
];

/** Other example spots that stay lit on the globe between stops. */
const SPOTS = [
  ...STOPS,
  { lat: 47.61, lng: -122.33 },
  { lat: 34.05, lng: -118.24 },
  { lat: 29.76, lng: -95.37 },
  { lat: 33.45, lng: -112.07 },
  { lat: 44.98, lng: -93.27 },
  { lat: 35.15, lng: -90.05 },
  { lat: 38.25, lng: -85.76 },
  { lat: 42.36, lng: -71.06 },
];

const SERVICE_ICON = { Power: Zap, Internet: Wifi, Cell: Signal };

const FOV = 600;
const DOT = "22, 26, 38";
const SODIUM = "255, 178, 26";
/** Seconds per phase of each stop. */
const PHASES = [
  { name: "travel", seconds: 1.8, zoom: 1.08 },
  { name: "in", seconds: 1.3, zoom: 2.6 },
  { name: "hold", seconds: 2.6, zoom: 2.6 },
  { name: "out", seconds: 1.1, zoom: 1 },
] as const;
/** How fast the camera follows its target (higher is snappier). */
const FOLLOW = 3.2;
const RESUME_AFTER_DRAG_MS = 2500;

function latLngToXYZ(lat: number, lng: number): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return [-(Math.sin(phi) * Math.cos(theta)), Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
}

/** Rotation (turn about the pole, then tilt) that puts a place at the centre, facing the viewer. */
function facing(lat: number, lng: number): { ry: number; rx: number } {
  const [x, y, z] = latLngToXYZ(lat, lng);
  return { ry: Math.atan2(x, -z), rx: Math.atan2(-y, Math.hypot(x, z)) };
}

function rotate(p: [number, number, number], ry: number, rx: number): [number, number, number] {
  const [x, y, z] = p;
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  return [x1, y * cx - z1 * sx, y * sx + z1 * cx];
}

/** The world's land as dots (Natural Earth), so zooming in shows real coastlines. */
function landPoints(): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < LAND_DOTS.length; i += 2) out.push(latLngToXYZ(LAND_DOTS[i] / 10, LAND_DOTS[i + 1] / 10));
  return out;
}

/** Nearest equivalent of `target` to `current`, so the globe never spins the long way round. */
function nearestAngle(current: number, target: number): number {
  const turn = Math.PI * 2;
  return target + Math.round((current - target) / turn) * turn;
}

/** A few report dots scattered around a stop, fixed per stop. */
function nearbyReports(stop: TourStop): [number, number][] {
  return Array.from({ length: 9 }, (_, i) => {
    const a = (i * 2.399) % (Math.PI * 2);
    const d = 0.35 + ((i * 37) % 10) / 10;
    return [stop.lat + Math.sin(a) * d, stop.lng + Math.cos(a) * d * 1.3];
  });
}

interface Camera {
  ry: number;
  rx: number;
  zoom: number;
}

export function InteractiveGlobe({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dots = useRef<[number, number, number][] | null>(null);
  const camera = useRef<Camera>({ ...facing(39, -98), zoom: 1 });
  const tour = useRef({ stop: 0, phase: 0, elapsed: 0 });
  const drag = useRef({ active: false, x: 0, y: 0, ry: 0, rx: 0, until: 0 });
  const time = useRef(0);
  const [label, setLabel] = useState<TourStop>(STOPS[0]);
  const [labelShown, setLabelShown] = useState(false);

  const draw = useCallback((canvas: HTMLCanvasElement, animate: boolean) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { ry, rx, zoom } = camera.current;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.42;
    const t = time.current;
    // Project, then zoom like a camera (a 2D scale about the centre).
    const toScreen = (p: [number, number, number]): [number, number, number] => {
      const [x, y, z] = rotate(p, ry, rx);
      const s = FOV / (FOV + z * radius);
      // Screen y grows downward and the model's y points north: turn the view 180°
      // (flip both axes, which keeps east on the right).
      return [cx - x * radius * s * zoom, cy - y * radius * s * zoom, z];
    };

    // The sphere: a faint disc and rim at the projected silhouette.
    let silhouette = radius;
    for (let k = 0; k <= 1; k += 0.02) silhouette = Math.max(silhouette, (radius * Math.sqrt(1 - k * k) * FOV) / (FOV - k * radius));
    ctx.beginPath();
    ctx.arc(cx, cy, silhouette * zoom, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${DOT}, 0.06)`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${DOT}, 0.22)`;
    ctx.lineWidth = 1;
    ctx.stroke();

    dots.current ??= landPoints();
    ctx.fillStyle = `rgb(${DOT})`;
    const dotSize = 0.8 + Math.sqrt(zoom) * 0.7;
    for (const d of dots.current) {
      const [sx, sy, z] = toScreen(d);
      if (z > 0 || sx < -4 || sx > w + 4 || sy < -4 || sy > h + 4) continue;
      // Dots near the rim fade, so the sphere reads as round.
      const depth = Math.min(1, -z * 1.6);
      ctx.globalAlpha = 0.25 + depth * 0.6;
      ctx.fillRect(sx - dotSize / 2, sy - dotSize / 2, dotSize, dotSize);
    }
    ctx.globalAlpha = 1;

    // Reports around the current stop, visible once the camera is close.
    const near = Math.min(1, Math.max(0, (zoom - 1.6) / 0.8));
    const current = STOPS[tour.current.stop];
    if (near > 0 && current) {
      for (const [lat, lng] of nearbyReports(current)) {
        const [sx, sy, z] = toScreen(latLngToXYZ(lat, lng));
        if (z > 0) continue;
        ctx.beginPath();
        ctx.arc(sx, sy, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${SODIUM}, ${(0.85 * near).toFixed(2)})`;
        ctx.fill();
      }
    }

    for (const s of SPOTS) {
      const [sx, sy, z] = toScreen(latLngToXYZ(s.lat, s.lng));
      if (z > 0.1) continue;
      const active = current && s.lat === current.lat && s.lng === current.lng;
      const pulse = animate ? Math.sin(t * 1.6 + s.lat) * 0.5 + 0.5 : 0.5;
      const ring = active ? 10 + pulse * 18 : 6 + pulse * 10;
      ctx.beginPath();
      ctx.arc(sx, sy, ring, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${SODIUM}, ${(0.45 * (1 - pulse) + 0.1).toFixed(2)})`;
      ctx.lineWidth = active ? 1.6 : 1.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy, active ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${SODIUM})`;
      ctx.fill();
      if (active) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#0c1222";
        ctx.stroke();
      }
    }
  }, []);

  /** Advance the tour and ease the camera toward its target. */
  const step = useCallback((dt: number) => {
    const cam = camera.current;
    if (drag.current.active || performance.now() < drag.current.until) return;
    const tr = tour.current;
    tr.elapsed += dt;
    const phase = PHASES[tr.phase];
    if (tr.elapsed >= phase.seconds) {
      tr.elapsed = 0;
      tr.phase = (tr.phase + 1) % PHASES.length;
      if (tr.phase === 0) tr.stop = (tr.stop + 1) % STOPS.length;
      const holding = PHASES[tr.phase].name === "hold";
      if (holding) setLabel(STOPS[tr.stop]);
      setLabelShown(holding);
    }
    const stop = STOPS[tr.stop];
    const target = facing(stop.lat, stop.lng);
    const k = 1 - Math.exp(-dt * FOLLOW);
    cam.ry += (nearestAngle(cam.ry, target.ry) - cam.ry) * k;
    cam.rx += (target.rx - cam.rx) * k;
    cam.zoom += (PHASES[tr.phase].zoom - cam.zoom) * k;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let visible = true;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      time.current += dt;
      step(dt);
      draw(canvas, true);
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (reduce || frame || !visible || document.hidden) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(canvas);
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    const ro = new ResizeObserver(() => draw(canvas, !reduce));
    ro.observe(canvas);

    draw(canvas, false);
    start();
    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [draw, step]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drag.current = { ...drag.current, active: true, x: e.clientX, y: e.clientY, ry: camera.current.ry, rx: camera.current.rx };
    setLabelShown(false);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current.active) return;
    const per = 0.005 / camera.current.zoom;
    camera.current.ry = drag.current.ry + (e.clientX - drag.current.x) * per;
    camera.current.rx = Math.max(-1.3, Math.min(1.3, drag.current.rx + (drag.current.y - e.clientY) * per));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches && canvasRef.current) draw(canvasRef.current, false);
  };
  const onPointerUp = () => {
    drag.current = { ...drag.current, active: false, until: performance.now() + RESUME_AFTER_DRAG_MS };
  };

  const Icon = SERVICE_ICON[label.service];

  return (
    <div className={cn("relative aspect-square w-full", className)}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="A globe that turns from city to city, zooming in on example outages such as an internet outage in Palo Alto"
        className="size-full cursor-grab touch-pan-y active:cursor-grabbing [mask-image:radial-gradient(circle,#000_64%,transparent_72%)]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {/* The stop's label, beside the marker at the centre. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 left-1/2 ml-6 -mt-[72px] flex items-center gap-3 rounded-[14px] border border-lamp/10 bg-night/90 px-3.5 py-2.5 text-lamp shadow-[0_12px_32px_-12px_rgba(12,18,34,0.6)] backdrop-blur-md",
          "transition-[opacity,transform] duration-500 ease-lights",
          labelShown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
      >
        <span className="flex size-8 items-center justify-center rounded-[10px] bg-sodium/15 text-sodium">
          <Icon className="size-[18px]" />
        </span>
        <span className="flex flex-col">
          <span className="text-[14px] leading-tight font-semibold tracking-[-0.01em] whitespace-nowrap">{label.service} outage</span>
          <span className="text-[13px] leading-tight whitespace-nowrap text-lamp-soft">{label.place}</span>
        </span>
      </div>
    </div>
  );
}
