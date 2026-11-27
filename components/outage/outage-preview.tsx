"use client";

import { X } from "lucide-react";
import { areaNote } from "@/components/map/area-layer";
import { locationLabel, outageDuration, timeAgo } from "@/lib/format";
import { useOutageArea } from "@/lib/hooks/use-outages";
import type { Outage } from "@/lib/types";
import { ServiceBadge, SeverityLabel } from "@/components/map/markers";

/**
 * The card that appears over the map when a marker is tapped.
 *
 * A marker answers "something is here"; this answers "what", without covering
 * the map the way the full sheet does. Tapping the card opens the sheet.
 * Tapping the map or the close button puts it away.
 */
export function OutagePreview({
  outage,
  onOpen,
  onClose,
}: {
  outage: Outage;
  onOpen: () => void;
  onClose: () => void;
}) {
  const resolved = outage.status === "resolved";
  // Same query the map draws from, so this is a cache read, not a second fetch.
  const note = areaNote(useOutageArea(outage.id).data);

  const figure =
    outage.customersAffected !== null
      ? `${outage.customersAffected.toLocaleString()} ${outage.customersAffected === 1 ? "customer" : "customers"}`
      : outage.origin === "crowdsourced"
        ? `${outage.verificationCount} confirmed`
        : null;

  const time = resolved
    ? `lasted ${outageDuration(outage)}`
    : outage.startKnown
      ? `out for ${outageDuration(outage)}`
      : `first seen ${timeAgo(outage.reportedAt)}`;

  return (
    // Rises into place rather than appearing (tailwindcss-animate), and simply
    // appears for anyone who has asked for less motion.
    <div className="panel pointer-events-auto relative rounded-2xl animate-in fade-in-0 slide-in-from-bottom-3 duration-200 ease-out motion-reduce:animate-none">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-2xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ServiceBadge type={outage.serviceType} size="lg" />
        <span className="min-w-0 flex-1">
          <span className="block truncate pr-9 text-[17px] font-semibold tracking-[-0.01em]">
            {outage.providerName ?? "Unknown provider"}
          </span>
          <span className="mt-0.5 block truncate pr-9 text-sm text-muted-foreground">
            {locationLabel(outage)}
          </span>
          {note && (
            <span className="mt-0.5 block truncate pr-9 text-[13px] text-muted-foreground">{note}</span>
          )}
          <span className="mt-2 flex items-center justify-between gap-3 text-sm">
            <SeverityLabel severity={outage.severity} resolved={resolved} className="font-medium" />
            <span className="shrink-0 font-semibold tabular-nums">{figure ?? time}</span>
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        className="tap-target absolute right-3 top-3 flex size-7 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-3.5" strokeWidth={2.5} />
      </button>
    </div>
  );
}
