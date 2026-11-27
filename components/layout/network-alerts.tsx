"use client";

import { ChevronRight, RadioTower } from "lucide-react";
import { SERVICE_META } from "@/lib/constants";
import type { Outage } from "@/lib/types";

/**
 * Outages of a whole network, shown as a strip over the map.
 *
 * A carrier failing nationwide has no location to pin, and pinning it to the
 * middle of the country would hide it from everyone not looking at Kansas. It
 * sits here instead, as one small pill in every viewport, and opens the same
 * detail sheet as a marker. With several, the pill counts them and opens the
 * list, which has them all.
 */
export function NetworkAlerts({
  alerts,
  onSelect,
  onShowAll,
}: {
  alerts: Outage[];
  onSelect: (outage: Outage) => void;
  onShowAll: () => void;
}) {
  if (alerts.length === 0) return null;

  const [first, ...rest] = alerts;
  const kind = SERVICE_META[first.serviceType].shortLabel.toLowerCase();

  return (
    <button
      type="button"
      onClick={() => (rest.length > 0 ? onShowAll() : onSelect(first))}
      className="panel pointer-events-auto flex h-10 max-w-full items-center gap-2 rounded-full pr-3 pl-3.5 text-left text-sm font-semibold transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <RadioTower aria-hidden className="size-4 shrink-0 text-severity-degraded" />
      <span className="truncate">
        {rest.length > 0
          ? `${alerts.length} network alerts`
          : `${first.providerName ?? "A US network"}: ${kind} trouble`}
      </span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
