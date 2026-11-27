"use client";

import { ChevronRight, RadioTower } from "lucide-react";
import { SERVICE_META } from "@/lib/constants";
import type { Outage } from "@/lib/types";

/**
 * Outages of a whole network, shown as a strip over the map.
 *
 * A carrier failing nationwide has no location to pin, and pinning it to the
 * middle of the country would hide it from everyone not looking at Kansas. It
 * sits here instead, in every viewport, and opens the same detail sheet as a
 * marker. With several, the strip names the first and counts the rest; the
 * list panel has them all.
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
      className="panel flex min-h-11 w-full items-center gap-2.5 rounded-lg py-1.5 pr-2 pl-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-md bg-severity-degraded/12 text-severity-degraded"
      >
        <RadioTower className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium leading-tight">
          {first.providerName ?? "A US network"}: {kind} trouble nationwide
        </span>
        <span className="block truncate text-xs leading-tight text-muted-foreground">
          {rest.length > 0
            ? `and ${rest.length} more network ${rest.length === 1 ? "alert" : "alerts"}`
            : "Network-wide signal, not a location"}
        </span>
      </span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
