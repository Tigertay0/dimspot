/**
 * The closed state of an outage card's map panel: a small street scene drawn
 * for each kind of outage, so the three example cards read differently before
 * anyone opens the real map.
 * - complete: four blocks dark inside a dashed boundary, the streets around still lit
 * - degraded: two weak spots pulsing on a normal street grid
 * - intermittent: one service line that flickers when the card is hovered
 */

import type { OutageCardProps } from "./outage-card";

const STREETS = ["M0 40 H360", "M0 90 H360", "M0 140 H360", "M60 0 V180", "M140 0 V180", "M220 0 V180", "M300 0 V180"];
const LAMPS: [number, number][] = [
  [20, 40], [100, 40], [340, 40], [20, 90], [100, 90], [340, 90], [20, 140], [100, 140], [340, 140], [60, 165], [300, 165],
];
const COMPLETE = "hsl(0 80% 68%)";
const DEGRADED = "hsl(24 90% 62%)";

function Streets({ lit }: { lit?: boolean }) {
  return (
    <>
      {STREETS.map((d) => (
        <path key={d} d={d} stroke={lit ? "#3a3420" : "#232c46"} strokeWidth={6} fill="none" />
      ))}
    </>
  );
}

function Complete() {
  return (
    <>
      <Streets lit />
      {LAMPS.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={3} fill="#ffd68c" />
      ))}
      {/* The four dark blocks. */}
      <rect x="128" y="28" width="184" height="124" rx="10" fill="#060912" fillOpacity="0.85" />
      <path d="M140 28 V152 M220 28 V152 M300 28 V152 M128 90 H312" stroke="#161c2c" strokeWidth={6} />
      <rect x="128" y="28" width="184" height="124" rx="10" fill="none" stroke={COMPLETE} strokeWidth={1.5} strokeDasharray="5 4" />
    </>
  );
}

function Degraded() {
  return (
    <>
      <Streets />
      {[
        [150, 90],
        [232, 62],
      ].map(([x, y]) => (
        <g key={x}>
          <circle cx={x} cy={y} r={16} fill={DEGRADED} fillOpacity={0.18} className="motion-safe:animate-pulse" />
          <circle cx={x} cy={y} r={5} fill={DEGRADED} stroke="#0c1222" strokeWidth={2} />
        </g>
      ))}
    </>
  );
}

function Intermittent() {
  return (
    <>
      <Streets />
      <path
        d="M0 112 C 60 104, 120 120, 180 110 S 300 100, 360 114"
        fill="none"
        stroke="#ffb21a"
        strokeWidth={2}
        strokeDasharray="14 10"
        className="motion-safe:group-hover:animate-[flicker_0.9s_steps(6)_1]"
      />
      <circle cx="180" cy="110" r="5" fill="#ffb21a" stroke="#0c1222" strokeWidth={2} />
    </>
  );
}

export function CardScene({ severity }: { severity: OutageCardProps["severity"] }) {
  return (
    <svg viewBox="0 0 360 180" preserveAspectRatio="xMidYMid slice" aria-hidden className="absolute inset-0 h-full w-full">
      <rect width="360" height="180" fill="#151c30" />
      {severity === "complete" ? <Complete /> : severity === "degraded" ? <Degraded /> : <Intermittent />}
    </svg>
  );
}
