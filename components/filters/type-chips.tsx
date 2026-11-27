"use client";

import { Info, LayoutGrid } from "lucide-react";
import { SERVICE_COVERAGE, SERVICE_META } from "@/lib/constants";
import { useFilters } from "@/lib/store/filters";
import { SERVICE_TYPES } from "@/lib/types";
import type { ServiceType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ServiceIcon } from "@/components/map/markers";

/**
 * Service type, as a row of icon tabs under the search bar.
 *
 * The same toggles exist in the filter sheet, grouped with providers and
 * severities. That is the right home for the full set, and the wrong one for
 * the question people arrive with: "show me the power cuts, not everything".
 * This is that question, as one tap.
 *
 * "All" is the cleared state, not a fifth filter: with every type selected the
 * map is unfiltered, so a service type added later appears for everyone
 * instead of being excluded by a stale saved selection.
 */
export function TypeTabs({ className }: { className?: string }) {
  const serviceTypes = useFilters((s) => s.serviceTypes);
  const setServiceTypes = useFilters((s) => s.setServiceTypes);

  const allSelected = serviceTypes.length === SERVICE_TYPES.length;

  /**
   * Tapping a type selects only that type, the common case. Tapping the type
   * that is already alone returns to everything, so the control is its own undo.
   */
  function pick(type: ServiceType) {
    const isOnlyOne = serviceTypes.length === 1 && serviceTypes[0] === type;
    setServiceTypes(isOnlyOne ? [...SERVICE_TYPES] : [type]);
  }

  return (
    <div
      role="group"
      aria-label="Filter by service type"
      className={cn("flex items-stretch justify-between", className)}
    >
      <Tab
        label="All"
        active={allSelected}
        onClick={() => setServiceTypes([...SERVICE_TYPES])}
      >
        <LayoutGrid />
      </Tab>
      {SERVICE_TYPES.map((type) => (
        <Tab
          key={type}
          label={SERVICE_META[type].shortLabel}
          active={!allSelected && serviceTypes.includes(type)}
          onClick={() => pick(type)}
        >
          <ServiceIcon type={type} />
        </Tab>
      ))}
    </div>
  );
}

function Tab({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-w-14 flex-col items-center gap-1.5 border-b-2 px-1 pb-2.5 pt-3 text-xs font-medium leading-none",
        "transition-colors duration-150 [&_svg]:size-[22px] [&_svg]:stroke-[1.75]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:border-input hover:text-foreground",
      )}
    >
      {children}
      {label}
    </button>
  );
}

/**
 * What a layer can and cannot see, shown when one type is selected alone.
 *
 * Without it, filtering to a thinly covered type shows an empty map that looks
 * identical to a broken one. Saying what feeds exist is worth one line.
 */
export function CoverageNote() {
  const serviceTypes = useFilters((s) => s.serviceTypes);
  // With everything on, the map is the sum of every feed and no one note
  // describes it. With nothing on, there is no layer to describe.
  if (serviceTypes.length !== 1) return null;

  return (
    <p className="panel pointer-events-auto flex items-start gap-2 rounded-xl px-3 py-2.5 text-[13px] leading-snug text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{SERVICE_COVERAGE[serviceTypes[0]].note}</span>
    </p>
  );
}
