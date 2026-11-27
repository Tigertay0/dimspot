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
 * The service icon on a quiet severity-tinted tile: list rows and sheet
 * headers. Tint and coloured icon rather than a solid fill, so a list of them
 * reads as a list and the map's markers stay the loudest thing on screen.
 */
export function ServiceBadge({
  type,
  severity,
  resolved = false,
  size = "md",
  className,
}: {
  type: ServiceType;
  severity: Severity;
  resolved?: boolean;
  size?: "md" | "lg";
  className?: string;
}) {
  const color = resolved ? "var(--severity-resolved)" : SEVERITY_META[severity].token;
  return (
    <span
      aria-hidden
      style={{ color, backgroundColor: halo(color, 0.12) }}
      className={cn(
        "flex shrink-0 items-center justify-center",
        size === "lg" ? "size-10 rounded-lg" : "size-8 rounded-md",
        className,
      )}
    >
      <ServiceIcon type={type} className={size === "lg" ? "size-5" : "size-4"} />
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
 * Cluster: a count inside a ring that shows the severity mix of what it holds.
 *
 * The ring is a conic gradient, one arc per severity in proportion, so a
 * cluster of forty complete outages and one of forty flickers no longer look
 * the same. The disc inside is the page surface, which keeps the number
 * legible on either basemap. Size is compressed (a log scale) so a
 * 200-outage cluster does not swamp the map next to a 3-outage one.
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

  const size = Math.round(Math.min(52, 30 + Math.log2(count + 1) * 4));

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: size,
        height: size,
        background: ring,
        // A ring in the page colour and a short shadow lift it off the map.
        boxShadow: "0 0 0 2px var(--background), 0 2px 6px rgb(0 0 0 / 0.35)",
      }}
      className={cn(
        "group relative flex items-center justify-center rounded-full p-[3px]",
        "transition-transform duration-150 ease-out hover:scale-105 active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
      aria-label={`${count} outages in this area. Zoom in to see them.`}
    >
      <span
        className="flex size-full items-center justify-center rounded-full bg-card font-mono font-medium text-foreground"
        style={{ fontSize: size > 46 ? 13 : 12, letterSpacing: "-0.02em" }}
      >
        {count > 999 ? `${Math.round(count / 100) / 10}k` : count}
      </span>
    </button>
  );
}

/**
 * Individual outage marker.
 *
 * Solid fill means the outage is confirmed — by the crowd, or by the utility
 * that reported it. Unconfirmed reports are drawn hollow: the same shape and
 * colour, filled with the page surface instead. That reads as provisional at a
 * glance and survives being small on a phone. The service icon is large enough
 * to read (power, internet and cellular are different questions), and a ring
 * in the page colour lifts the marker off whatever the basemap has under it.
 */
export function OutageMarker({
  serviceType,
  severity,
  isVerified,
  isResolved,
  isSelected,
  isFresh,
  onClick,
}: {
  serviceType: ServiceType;
  severity: Severity;
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
      className={cn(
        "tap-target group relative flex size-8 items-center justify-center rounded-full",
        // A ring on the button itself, not just the scale-up on the dot inside:
        // over a busy map a size change alone is not a focus indicator.
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground",
        "focus-visible:ring-offset-1 focus-visible:ring-offset-background",
      )}
      aria-label={`${SEVERITY_META[severity].label}: ${serviceType}${
        solid ? "" : ", unconfirmed"
      }`}
    >
      {isFresh && !isResolved && (
        <span
          aria-hidden
          style={{ backgroundColor: halo(color, 0.4) }}
          className="absolute inset-0 rounded-full animate-pulse-ring"
        />
      )}

      <span
        aria-hidden
        style={{
          backgroundColor: solid ? color : "var(--background)",
          borderColor: color,
          // Lucide strokes with currentColor, so the icon follows the fill and
          // stays legible whether the marker is solid or hollow.
          color: solid ? "var(--background)" : color,
          // A ring in the page colour separates it from the map; the selected
          // marker gets a second ring in the text colour.
          boxShadow: isSelected
            ? "0 0 0 2px var(--background), 0 0 0 4px var(--foreground)"
            : "0 0 0 2px var(--background), 0 1px 4px rgb(0 0 0 / 0.35)",
        }}
        className={cn(
          "relative flex size-6 items-center justify-center rounded-full",
          "border-2 transition-transform duration-150 ease-out",
          "group-hover:scale-110 group-focus-visible:scale-110 group-active:scale-95",
          isSelected && "scale-[1.18]",
        )}
      >
        <ServiceIcon type={serviceType} className="size-3" />
      </span>
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
          boxShadow: "0 0 0 1.5px var(--background)",
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

/** The map legend. Wide screens only, so it never fights the map on a phone. */
export function MapLegend({ className }: { className?: string }) {
  const rows: Array<[Severity, string]> = [
    ["complete", "Complete outage"],
    ["degraded", "Degraded"],
    ["intermittent", "Intermittent"],
  ];

  return (
    <div className={cn("panel rounded-lg p-3 text-xs", className)}>
      <ul className="space-y-2">
        {rows.map(([severity, label]) => (
          <li key={severity} className="flex items-center gap-2.5">
            <span
              aria-hidden
              style={{ backgroundColor: SEVERITY_META[severity].token }}
              className="size-2.5 rounded-full"
            />
            <span className="text-muted-foreground">{label}</span>
          </li>
        ))}
        <li className="flex items-center gap-2.5 border-t pt-2">
          <span
            aria-hidden
            style={{ borderColor: SEVERITY_META.complete.token }}
            className="size-2.5 rounded-full border-2 bg-background"
          />
          <span className="text-muted-foreground">Unconfirmed report</span>
        </li>
        <li className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="size-2.5 rotate-45 rounded-[2px] bg-muted-foreground/50"
          />
          <span className="text-muted-foreground">Storm warning</span>
        </li>
        <li className="flex items-center gap-2.5 border-t pt-2">
          <span
            aria-hidden
            className="h-2.5 w-6 rounded-full"
            style={{
              background:
                "linear-gradient(90deg, rgba(255,178,26,0.5), rgba(249,115,22,0.8), rgba(239,68,68,0.95))",
            }}
          />
          <span className="text-muted-foreground">Density. Zoom in for detail</span>
        </li>
      </ul>
    </div>
  );
}
