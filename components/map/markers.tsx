"use client";

import { CircleHelp, Signal, Wifi, Zap } from "lucide-react";
import { SEVERITY_META, dominantSeverity } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ServiceType, Severity } from "@/lib/types";

/** Service icons, shared by markers, filters and the detail sheet. */
export const SERVICE_ICONS = {
  power: Zap,
  internet: Wifi,
  cellular: Signal,
  other: CircleHelp,
} as const satisfies Record<ServiceType, React.ComponentType<{ className?: string }>>;

export function ServiceIcon({
  type,
  className,
}: {
  type: ServiceType;
  className?: string;
}) {
  const Icon = SERVICE_ICONS[type];
  return <Icon className={className} />;
}

/**
 * The service icon in a plain grey circle: list rows, the preview card and
 * sheet headers. Neutral on purpose. Severity is said in words with a dot
 * beside it, and the map's markers are the only coloured shapes.
 */
export function ServiceBadge({
  type,
  size = "md",
  className,
}: {
  type: ServiceType;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-secondary text-foreground",
        size === "lg" ? "size-12" : "size-10",
        className,
      )}
    >
      <ServiceIcon type={type} className={size === "lg" ? "size-[22px]" : "size-[18px]"} />
    </span>
  );
}

/** A severity dot and its name, for status lines. Colour is never the only signal. */
export function SeverityLabel({
  severity,
  resolved = false,
  short = false,
  className,
}: {
  severity: Severity;
  resolved?: boolean;
  /** "Outage" rather than "Complete outage", where a row is tight. */
  short?: boolean;
  className?: string;
}) {
  const label = resolved ? "Resolved" : SEVERITY_META[severity].label;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{
          backgroundColor: resolved ? "var(--severity-resolved)" : SEVERITY_META[severity].token,
        }}
      />
      {short && !resolved && severity === "complete" ? "Outage" : label}
    </span>
  );
}

/**
 * Marker design notes.
 *
 * Everything here is drawn against an unpredictable background — a basemap that
 * is pale in one theme and near-black in the other, under a marker layer that
 * can be dense. Three rules follow, and they are why the shapes look the way
 * they do:
 *
 *   1. Every mark carries its own contrast. A ring in the *surface* colour,
 *      not white, separates a marker from the map in both themes.
 *   2. Weight means something. Solid is confirmed, hollow is not; size means
 *      how many. Nothing is decorative.
 *   3. Colour is never the only signal, since roughly one man in twelve cannot
 *      separate the red and green ends of the severity ramp.
 */

/** Translucent halo in the marker's own colour — the glow, not a border. */
function halo(color: string, alpha: number) {
  return `color-mix(in oklab, ${color} ${Math.round(alpha * 100)}%, transparent)`;
}

/**
 * Cluster: a count in a white disc, the same surface as a single marker's
 * pill. A thin ring shows the severity mix of what it holds (one arc per
 * severity, in proportion), and the size is compressed so a 200-outage cluster
 * does not swamp a 3-outage one.
 */
export function ClusterMarker({
  count,
  severityCounts,
  onClick,
}: {
  count: number;
  severityCounts: Record<Severity, number>;
  onClick: () => void;
}) {
  const order: Severity[] = ["complete", "degraded", "intermittent"];
  const present = order.filter((s) => severityCounts[s] > 0);
  const worst = dominantSeverity(present.length > 0 ? present : ["intermittent"]);
  const color = SEVERITY_META[worst].token;

  const total = present.reduce((sum, s) => sum + severityCounts[s], 0) || 1;
  let turned = 0;
  const arcs = present.map((s) => {
    const from = turned;
    turned += (severityCounts[s] / total) * 360;
    return `${SEVERITY_META[s].token} ${from}deg ${turned}deg`;
  });
  const ring =
    arcs.length > 1 ? `conic-gradient(from -90deg, ${arcs.join(", ")})` : color;

  const size = Math.round(Math.min(52, 34 + Math.log2(count + 1) * 2.2));

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ width: size, height: size, background: ring, boxShadow: "var(--shadow-marker)" }}
      className={cn(
        "group relative flex items-center justify-center rounded-full p-[2px]",
        "transition-transform duration-150 ease-out hover:scale-105 active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
      aria-label={`${count} outages in this area. Zoom in to see them.`}
    >
      <span className="flex size-full items-center justify-center rounded-full bg-[var(--marker)] text-[13px] font-semibold tabular-nums text-foreground">
        {count > 999 ? `${Math.round(count / 100) / 10}k` : count}
      </span>
    </button>
  );
}

/**
 * Individual outage marker: a white pill, as the reference apps label a point.
 *
 * The service icon carries the severity colour, and the number is how many
 * customers are out (or how many people confirmed a report). The selected
 * marker turns ink, so the one the preview card describes is unmistakable. An
 * unconfirmed report has a dashed edge: same shape, visibly provisional.
 */
export function OutageMarker({
  serviceType,
  severity,
  label,
  isVerified,
  isResolved,
  isSelected,
  isFresh,
  onClick,
}: {
  serviceType: ServiceType;
  severity: Severity;
  /** Short figure shown beside the icon, when there is one. */
  label: string | null;
  isVerified: boolean;
  isResolved: boolean;
  isSelected: boolean;
  /** Reported in the last 15 minutes — worth drawing the eye to. */
  isFresh: boolean;
  onClick: () => void;
}) {
  const color = isResolved
    ? "var(--severity-resolved)"
    : SEVERITY_META[severity].token;

  const solid = isVerified || isResolved;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ boxShadow: "var(--shadow-marker)" }}
      className={cn(
        "tap-target group relative flex h-8 items-center justify-center gap-1 rounded-full border text-[13px] font-semibold tabular-nums",
        "transition-[transform,background-color,color] duration-150 ease-out hover:scale-105 active:scale-95",
        label ? "px-2.5" : "w-8",
        isSelected
          ? "z-10 scale-110 border-primary bg-primary text-primary-foreground"
          : // --marker and its edge are set per theme in globals.css: white
            // with a hairline on the light map, a lifted grey with a visible
            // edge on the dark one, where a card-coloured pill disappears.
            "border-[var(--marker-edge)] bg-[var(--marker)] text-foreground",
        !solid && !isSelected && "border-dashed border-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground",
        "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
      aria-label={`${SEVERITY_META[severity].label}: ${serviceType}${label ? `, ${label}` : ""}${
        solid ? "" : ", unconfirmed"
      }`}
    >
      {isFresh && !isResolved && !isSelected && (
        <span
          aria-hidden
          style={{ backgroundColor: halo(color, 0.3) }}
          className="absolute inset-0 -z-10 rounded-full animate-pulse-ring"
        />
      )}
      <span aria-hidden style={{ color: isSelected ? undefined : color }} className="flex">
        <ServiceIcon type={serviceType} className="size-3.5 stroke-[2.5]" />
      </span>
      {label}
    </button>
  );
}

/**
 * Hazard advisory: a storm warning rather than a reported outage.
 *
 * Deliberately a different shape — a rotated square, not a circle — so the two
 * layers are told apart without relying on colour, and drawn quieter than the
 * outages so it reads as the context it is.
 */
export function AdvisoryMarker({
  severity,
  onClick,
}: {
  severity: Severity;
  onClick: () => void;
}) {
  const color = SEVERITY_META[severity].token;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "tap-target group flex size-7 items-center justify-center rounded-full",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground",
        "focus-visible:ring-offset-1 focus-visible:ring-offset-background",
      )}
      aria-label={`Weather advisory: ${SEVERITY_META[severity].label}`}
    >
      <span
        aria-hidden
        style={{
          backgroundColor: halo(color, 0.5),
          borderColor: halo(color, 0.95),
          boxShadow: "0 0 0 1.5px var(--card)",
        }}
        className={cn(
          "size-[13px] rotate-45 rounded-[3px] border-[1.5px]",
          "transition-transform duration-150 ease-out",
          "group-hover:scale-125 group-focus-visible:scale-125",
        )}
      />
    </button>
  );
}
