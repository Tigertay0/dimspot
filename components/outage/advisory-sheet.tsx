"use client";

import { CloudAlert, ExternalLink, MapPin } from "lucide-react";
import { SEVERITY_META } from "@/lib/constants";
import { dayAndTime } from "@/lib/format";
import type { Advisory } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Detail for a hazard advisory.
 *
 * Kept visibly distinct from the outage sheet — no confirm button, no comment
 * box, no verification count. There is nothing for a visitor to corroborate:
 * this is an official forecast, not a neighbour's report, and offering the same
 * controls would imply otherwise.
 */
export function AdvisorySheet({
  advisory,
  onOpenChange,
}: {
  advisory: Advisory | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={advisory !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        
      >
        {advisory && (
          <>
            <SheetHeader className="pr-14">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  style={{
                    backgroundColor: SEVERITY_META[advisory.severity].token,
                  }}
                  className="flex size-12 shrink-0 items-center justify-center rounded-lg text-background"
                >
                  <CloudAlert className="size-[22px]" />
                </span>

                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate">{advisory.kind}</SheetTitle>
                  <SheetDescription className="truncate">
                    Weather advisory, not a reported outage
                  </SheetDescription>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline">
                  {advisory.sourceName === "nws"
                    ? "National Weather Service"
                    : advisory.sourceName}
                </Badge>
                {advisory.endsAt && (
                  <Badge variant="secondary">
                    Until {dayAndTime(advisory.endsAt)}
                  </Badge>
                )}
              </div>
            </SheetHeader>

            <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 pb-4 pt-1">
              {advisory.headline && (
                <p className="text-sm font-medium">{advisory.headline}</p>
              )}

              {advisory.areaDescription && (
                <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {advisory.areaDescription}
                </p>
              )}

              {advisory.description && (
                // NWS descriptions are pre-wrapped plain text; keep the breaks.
                <p className="whitespace-pre-line text-sm text-muted-foreground">
                  {advisory.description}
                </p>
              )}

              {advisory.url && (
                <a
                  href={advisory.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium underline underline-offset-4"
                >
                  Full alert
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>

            <div className="border-t px-5 py-3">
              <p className="text-xs leading-snug text-muted-foreground">
                {advisory.startsAt
                  ? `In effect from ${dayAndTime(advisory.startsAt)}`
                  : "Currently in effect"}
                . Conditions like this often cause outages — if yours is out,
                report it.
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
