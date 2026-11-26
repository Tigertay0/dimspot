"use client";

import { Info } from "lucide-react";
import { SERVICE_COVERAGE, SERVICE_META } from "@/lib/constants";
import { useFilters } from "@/lib/store/filters";
import { SERVICE_TYPES } from "@/lib/types";
import type { ServiceType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Chip } from "@/components/ui/chip";
import { ServiceIcon } from "@/components/map/markers";

/**
 * Service-type filter, on the map rather than inside the filter sheet.
 *
 * The same toggles exist in the sheet, two taps and a scroll away, grouped with
 * providers and severities. That is the right home for the full set, and the
 * wrong one for the question people actually arrive with — "show me the power
 * cuts, not everything". This is that question, as one tap.
 *
 * "All" is the cleared state, not a fourth filter: with every type selected the
 * map is unfiltered, so a service type added later appears for everyone instead
 * of being excluded by a stale saved selection.
 */
export function TypeChips({ className }: { className?: string }) {
  const serviceTypes = useFilters((s) => s.serviceTypes);
  const setServiceTypes = useFilters((s) => s.setServiceTypes);

  const allSelected = serviceTypes.length === SERVICE_TYPES.length;
  // Reachable from "Clear all" in the filter sheet. The map is then correctly
  // empty, which is indistinguishable from "nothing is broken near you" unless
  // the control says which it is.
  const noneSelected = serviceTypes.length === 0;

  /**
   * Tapping a type selects only that type — the common case, and one tap
   * instead of three deselections. Tapping the type that is already alone
   * returns to everything, so the control is its own undo.
   */
  function pick(type: ServiceType) {
    const isOnlyOne = serviceTypes.length === 1 && serviceTypes[0] === type;
    setServiceTypes(isOnlyOne ? [...SERVICE_TYPES] : [type]);
  }

  // Only when a single type is selected: with everything on, the map is the
  // sum of every feed and no one note describes it.
  const lone = serviceTypes.length === 1 ? serviceTypes[0] : null;

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className={cn(
          // Bleeds to the screen edge so a row that scrolls does so under the
          // edge, not under an invisible wall 12px in from it.
          "-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 py-1",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
        role="group"
        aria-label="Filter by service type"
      >
        <Chip
          floating
          tone="solid"
          active={allSelected}
          onClick={() => setServiceTypes([...SERVICE_TYPES])}
          className={cn(
            noneSelected && "border-primary/70 text-foreground ring-2 ring-primary/30",
          )}
        >
          {noneSelected ? "Show all" : "All"}
        </Chip>

        {SERVICE_TYPES.map((type) => (
          <Chip
            key={type}
            floating
            tone="solid"
            active={!allSelected && serviceTypes.includes(type)}
            onClick={() => pick(type)}
          >
            <ServiceIcon type={type} />
            {SERVICE_META[type].shortLabel}
          </Chip>
        ))}
      </div>

      {lone && <CoverageNote type={lone} />}
    </div>
  );
}

/**
 * What this layer can and cannot see.
 *
 * Without it, filtering to a thinly covered type shows an empty map that looks
 * identical to a broken one. Saying what feeds exist is worth one line of text
 * rather than leaving someone to guess.
 */
function CoverageNote({ type }: { type: ServiceType }) {
  const coverage = SERVICE_COVERAGE[type];

  return (
    <p className="glass flex items-start gap-2 rounded-[14px] px-3 py-2 text-xs leading-snug text-muted-foreground">
      <Info className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{coverage.note}</span>
    </p>
  );
}
