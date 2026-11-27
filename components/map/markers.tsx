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

/** "1.2k", "14k": short enough for a marker, exact below a thousand. */
export function shortCount(value: number): string {
  if (value >= 10_000) return `${Math.round(value / 1000)}k`;
  if (value >= 1000) return `${Math.round(value / 100) / 10}k`;
  return String(value);
}

/**
 * Several outages too close to tell apart at this zoom.
 *
 * The same white pill as a single outage, so the map speaks one visual
 * language, with a second pill's edge showing behind it: a stack, not a
 * badge. It gives the customers out across the group (what a reader wants to
 * know), or how many reports when none of them says. Tapping zooms in to
 * pull the stack apart.
 */
export function ClusterMarker({
  count,
  severityCounts,
  serviceCounts,
  customers,
  onClick,
}: {
  count: number;
  severityCounts: Record<Severity, number>;
  serviceCounts: Record<ServiceType, number>;
  customers: number;
  onClick: () => void;
}) {
  const order: Severity[] = ["complete", "degraded", "intermittent"];
  const present = order.filter((s) => severityCounts[s] > 0);
  const worst = dominantSeverity(present.length > 0 ? present : ["intermittent"]);
  const color = SEVERITY_META[worst].token;

  const service = (Object.keys(serviceCounts) as ServiceType[]).reduce((a, b) =>
    serviceCounts[b] > serviceCounts[a] ? b : a,
  );

  const label = customers > 0 ? shortCount(customers) : `${count} reports`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "tap-target group relative flex h-8 animate-marker-in items-center",
        "transition-transform duration-150 ease-out hover:scale-105 active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground",
        "focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-full",
      )}
      aria-label={`${count} outages here${
        customers > 0 ? `, ${customers.toLocaleString("en-US")} customers out` : ""
      }. Zoom in to see them.`}
    >
      {/* The pill behind: offset down and right, so the edge reads as a stack. */}
      <span
        aria-hidden
        className="absolute inset-0 translate-x-[3px] translate-y-[3px] rounded-full border border-[var(--marker-edge)] bg-[var(--marker)]"
        style={{ boxShadow: "var(--shadow-marker)" }}
      />
      <span
        className="relative flex h-8 items-center gap-1 rounded-full border border-[var(--marker-edge)] bg-[var(--marker)] px-2.5 text-[13px] font-semibold tabular-nums text-foreground"
        style={{ boxShadow: "var(--shadow-marker)" }}
      >
        <span aria-hidden style={{ color }} className="flex">
          <ServiceIcon type={service} className="size-3.5 stroke-[2.5]" />
        </span>
        {label}
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
        "tap-target group relative flex h-8 animate-marker-in items-center justify-center gap-1 rounded-full border text-[13px] font-semibold tabular-nums",
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
