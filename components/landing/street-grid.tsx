"use client";

/**
 * A city at night seen from above, drawn like Dimspot's own map: navy blocks, streets,
 * a river, a park, sodium streetlights and lit windows. Driven by a scroll value:
 * - mode "out": lights go out block by block around "Your street", with a short
 *   flicker as each one dies, and the outage area is traced with the app's dashed
 *   boundary along the street lines.
 * - mode "back": the same area relights from its edges in, ending on your street.
 * Lights outside the outage never change, so the darkness reads as one district,
 * not a blob. Drawn on canvas; the static city is rendered once per size.
 */

import { type MotionValue, useMotionValueEvent } from "motion/react";
import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Mode = "out" | "back";

interface StreetGridProps {
  amount: MotionValue<number>;
  marker?: MotionValue<number>;
  mode: Mode;
  className?: string;
}

const C = {
  ground: "#0c1222",
  block: "#121a2f",
  park: "#11231f",
  water: "#0a1630",
  street: "#1c2542",
  avenue: "#243052",
  lamp: "255,186,84",
  window: "255,214,150",
  boundary: "#e7a39a",
  sodium: "#ffb21a",
  label: "#151c30",
  text: "#fff6e5",
};

const LAMP_STEP = 26;
const WINDOW_STEP = 7;
const WINDOW_ODDS = 0.1;
const OUTAGE_CELLS = 3.1; // outage radius at full amount, in blocks
const FLICKER_SPAN = 0.035;
const GLOW_R = 13;

interface Light {
  x: number;
  y: number;
  kind: "lamp" | "window";
  a: number; // brightness 0-1
  cell: number;
  t: number; // when it goes out, 0-1 (relative to the outage)
}

interface City {
  w: number;
  h: number;
  cell: number;
  cols: number;
  rows: number;
  epicenter: { x: number; y: number };
  threshold: Float32Array; // per cell: when it goes dark (Infinity = never)
  base: HTMLCanvasElement; // static city with the always-on lights
  dynamic: Light[];
  glow: HTMLCanvasElement;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeGlow(dpr: number) {
  const size = GLOW_R * 2 * dpr;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) return c;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${C.lamp},0.8)`);
  grad.addColorStop(0.3, `rgba(${C.lamp},0.24)`);
  grad.addColorStop(1, `rgba(${C.lamp},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

function drawLight(ctx: CanvasRenderingContext2D, l: Light, glow: HTMLCanvasElement, alpha: number) {
  if (l.kind === "lamp") {
    ctx.globalAlpha = alpha * l.a;
    ctx.drawImage(glow, l.x - GLOW_R, l.y - GLOW_R, GLOW_R * 2, GLOW_R * 2);
    ctx.fillStyle = `rgba(255,228,170,${alpha})`;
    ctx.fillRect(l.x - 1, l.y - 1, 2, 2);
  } else {
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(${C.window},${alpha * l.a})`;
    ctx.fillRect(l.x, l.y, 2, 2);
  }
}

function buildCity(w: number, h: number, dpr: number): City {
  const phone = w < 640;
  const cell = phone ? Math.max(64, w / 5.2) : Math.max(84, Math.min(124, w / 13));
  const cols = Math.ceil(w / cell) + 1;
  const rows = Math.ceil(h / cell) + 1;
  // "Your street" sits on a vertical street, away from where the headline lands (bottom left).
  const ex = Math.round((w * (phone ? 0.5 : 0.62)) / cell) * cell;
  const ey = h * (phone ? 0.34 : 0.4);
  const random = rng(7);

  // When each block goes dark: distance from your street in blocks, roughened so the edge
  // follows blocks unevenly, the way a real feeder line does.
  const threshold = new Float32Array(cols * rows).fill(Infinity);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const cx = (i + 0.5) * cell;
      const cy = (j + 0.5) * cell;
      const d = Math.hypot(cx - ex, (cy - ey) * 1.15) / cell + random() * 0.9;
      if (d < OUTAGE_CELLS) threshold[j * cols + i] = d / OUTAGE_CELLS;
    }
  }
  const cellOf = (x: number, y: number) => {
    const i = Math.min(cols - 1, Math.max(0, Math.floor(x / cell)));
    const j = Math.min(rows - 1, Math.max(0, Math.floor(y / cell)));
    return j * cols + i;
  };

  const base = document.createElement("canvas");
  base.width = Math.round(w * dpr);
  base.height = Math.round(h * dpr);
  const ctx = base.getContext("2d");
  const glow = makeGlow(dpr);
  const dynamic: Light[] = [];
  const fixed: Light[] = []; // always-on lights, drawn once on top of the streets
  if (!ctx) return { w, h, cell, cols, rows, epicenter: { x: ex, y: ey }, threshold, base, dynamic, glow };
  ctx.scale(dpr, dpr);

  ctx.fillStyle = C.ground;
  ctx.fillRect(0, 0, w, h);

  // Blocks, one park, and a river along one edge.
  const riverX = -1; // no river: a flat band read as a layout glitch
  const parkCell = -1; // no park: a lone green block read as a rendering bug in review
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i * cell;
      const y = j * cell;
      if (riverX > 0 && x + cell > riverX) continue;
      const index = j * cols + i;
      ctx.fillStyle = index === parkCell ? C.park : C.block;
      ctx.beginPath();
      ctx.roundRect(x + 5, y + 5, cell - 10, cell - 10, 4);
      ctx.fill();
      if (index === parkCell) continue;
      // Lit windows: a few warm dots per block.
      for (let wy = y + 10; wy < y + cell - 12; wy += WINDOW_STEP) {
        for (let wx = x + 10; wx < x + cell - 12; wx += WINDOW_STEP) {
          if (random() > WINDOW_ODDS) continue;
          const light: Light = { x: wx, y: wy, kind: "window", a: 0.35 + random() * 0.5, cell: index, t: 0 };
          const tc = threshold[index];
          if (Number.isFinite(tc)) dynamic.push({ ...light, t: Math.min(1, tc + random() * 0.05) });
          else fixed.push(light);
        }
      }
    }
  }
  if (riverX > 0) {
    ctx.fillStyle = C.water;
    ctx.fillRect(riverX, 0, w - riverX, h);
  }

  // Streets: every fourth one is an avenue, plus one diagonal across town.
  const street = (x1: number, y1: number, x2: number, y2: number, wide: boolean) => {
    ctx.strokeStyle = wide ? C.avenue : C.street;
    ctx.lineWidth = wide ? 9 : 5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const len = Math.hypot(x2 - x1, y2 - y1);
    const nx = (y2 - y1) / len;
    const ny = -(x2 - x1) / len;
    const side = wide ? 6 : 4;
    for (let s = LAMP_STEP / 2; s < len; s += LAMP_STEP) {
      const k = Math.round(s / LAMP_STEP) % 2 === 0 ? 1 : -1;
      const x = x1 + ((x2 - x1) * s) / len + nx * side * k;
      const y = y1 + ((y2 - y1) * s) / len + ny * side * k;
      if (riverX > 0 && x > riverX) continue;
      const index = cellOf(x, y);
      const light: Light = { x, y, kind: "lamp", a: 0.75 + random() * 0.25, cell: index, t: 0 };
      const tc = threshold[index];
      if (Number.isFinite(tc)) dynamic.push({ ...light, t: Math.min(1, tc + random() * 0.05) });
      else fixed.push(light);
    }
  };
  ctx.lineCap = "round";
  const right = riverX > 0 ? riverX : w;
  for (let i = 0; i <= cols; i++) street(i * cell, 0, i * cell, h, i % 4 === 1);
  for (let j = 0; j <= rows; j++) street(0, j * cell, right, j * cell, j % 4 === 2);
  street(0, h * 0.95, right * 0.72, -cell * 0.2, true);
  for (const light of fixed) drawLight(ctx, light, glow, 1);
  ctx.globalAlpha = 1;

  return { w, h, cell, cols, rows, epicenter: { x: ex, y: ey }, threshold, base, dynamic, glow };
}

/** 0 = lit, 1 = out. `cut` is how far the outage has spread (0-1). */
function darkness(t: number, cut: number) {
  if (cut <= t) return 0;
  const since = cut - t;
  if (since > FLICKER_SPAN) return 1;
  // A dying light stutters once or twice before it goes.
  return Math.sin((since / FLICKER_SPAN) * Math.PI * 3) > 0 ? 1 : 0.15;
}

function drawFrame(canvas: HTMLCanvasElement, city: City, dpr: number, amount: number, marker: number, mode: Mode) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(city.base, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // "out": the cut spreads outwards with amount. "back": the cut shrinks from the edges in.
  const cut = mode === "out" ? amount : 1 - amount;
  for (const l of city.dynamic) {
    const off = mode === "out" ? darkness(l.t, cut) : cut > l.t ? 1 : 0;
    if (off < 1) drawLight(ctx, l, city.glow, 1 - off);
  }
  ctx.globalAlpha = 1;

  // The outage boundary, along the street lines between dark and lit blocks.
  const { cols, rows, cell, threshold } = city;
  const dark = (i: number, j: number) => i >= 0 && j >= 0 && i < cols && j < rows && threshold[j * cols + i] < cut;
  if (cut > 0.02) {
    // The outage reads darker than the lit city around it.
    ctx.fillStyle = "rgba(4,7,15,0.5)";
    ctx.beginPath();
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (dark(i, j)) ctx.rect(i * cell, j * cell, cell, cell);
    ctx.fill();
    ctx.strokeStyle = C.boundary;
    ctx.globalAlpha = Math.min(1, cut * 4) * 0.9;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        if (!dark(i, j)) continue;
        const x = i * cell;
        const y = j * cell;
        const edge = (x1: number, y1: number, x2: number, y2: number) => {
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
        };
        if (!dark(i, j - 1)) edge(x, y, x + cell, y);
        if (!dark(i, j + 1)) edge(x, y + cell, x + cell, y + cell);
        if (!dark(i - 1, j)) edge(x, y, x, y + cell);
        if (!dark(i + 1, j)) edge(x + cell, y, x + cell, y + cell);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // "Your street": the app's marker plus a small label.
  if (marker > 0.01) {
    const { x, y } = city.epicenter;
    const s = 0.6 + 0.4 * marker;
    ctx.globalAlpha = marker;
    ctx.fillStyle = "rgba(255,178,26,0.2)";
    ctx.beginPath();
    ctx.arc(x, y, 18 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.sodium;
    ctx.strokeStyle = C.ground;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 7.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const font = getComputedStyle(canvas).fontFamily || "sans-serif";
    ctx.font = `600 13px ${font}`;
    const text = "Your street";
    const tw = ctx.measureText(text).width;
    const lx = x + 16;
    const ly = y - 34;
    ctx.fillStyle = C.label;
    ctx.beginPath();
    ctx.roundRect(lx, ly, tw + 20, 26, 13);
    ctx.fill();
    ctx.fillStyle = C.text;
    ctx.textBaseline = "middle";
    ctx.fillText(text, lx + 10, ly + 13.5);
    ctx.globalAlpha = 1;
  }
}

export function StreetGrid({ amount, marker, mode, className }: StreetGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cityRef = useRef<{ city: City; dpr: number } | null>(null);
  const frame = useRef(0);

  const draw = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      const built = cityRef.current;
      if (!canvas || !built) return;
      drawFrame(canvas, built.city, built.dpr, amount.get(), marker?.get() ?? 0, mode);
    });
  }, [amount, marker, mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rebuild = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (width < 1 || height < 1) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      cityRef.current = { city: buildCity(width, height, dpr), dpr };
      draw();
    };
    const observer = new ResizeObserver(rebuild);
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, [draw]);

  useMotionValueEvent(amount, "change", draw);
  useMotionValueEvent(marker ?? amount, "change", draw);

  return <canvas ref={canvasRef} aria-hidden className={cn("absolute inset-0 h-full w-full", className)} />;
}
