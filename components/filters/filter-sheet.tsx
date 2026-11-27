"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { SERVICE_META, SEVERITY_META } from "@/lib/constants";
import { useProviders } from "@/lib/hooks/use-outages";
import { useFilters } from "@/lib/store/filters";
import { SERVICE_TYPES, SEVERITIES } from "@/lib/types";
import type { Provider, ServiceType } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ServiceIcon } from "@/components/map/markers";

/**
 * Filter menu (PRD section 4.2).
 *
 * Two levels: service-type groups, then individual providers grouped under the
 * type they belong to. Providers are stored as an allow-list that is empty by
 * default, which means "all" — so a provider added later shows up for everyone
 * instead of being silently excluded by a stale saved list.
 */
export function FilterSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: providers = [], isError: providersFailed } = useProviders();

  const severities = useFilters((s) => s.severities);
  const providerIds = useFilters((s) => s.providerIds);
  const resolvedHours = useFilters((s) => s.resolvedHours);
  const toggleSeverity = useFilters((s) => s.toggleSeverity);
  const toggleProvider = useFilters((s) => s.toggleProvider);
  const setProviders = useFilters((s) => s.setProviders);
  const setResolvedHours = useFilters((s) => s.setResolvedHours);
  const showAdvisories = useFilters((s) => s.showAdvisories);
  const setShowAdvisories = useFilters((s) => s.setShowAdvisories);
  const selectAll = useFilters((s) => s.selectAll);

  const byService = useMemo(() => {
    const grouped = new Map<ServiceType, Provider[]>();
    for (const type of SERVICE_TYPES) grouped.set(type, []);
    for (const provider of providers) {
      grouped.get(provider.serviceType)?.push(provider);
    }
    return grouped;
  }, [providers]);

  const allSelected = providerIds.length === 0;

  // The provider list is over a hundred long: groups start closed, and a
  // search opens whichever ones hold a match.
  const [providerQuery, setProviderQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<ServiceType[]>([]);
  const needle = providerQuery.trim().toLowerCase();

  /** Selecting every provider in a group is the same as clearing that group. */
  function toggleGroup(type: ServiceType) {
    const group = byService.get(type) ?? [];
    const ids = group.map((p) => p.id);
    const anySelected = ids.some((id) => providerIds.includes(id));

    setProviders(
      anySelected
        ? providerIds.filter((id) => !ids.includes(id))
        : [...providerIds, ...ids],
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        
      >
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription className="sr-only">
            Choose what appears on the map.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-6 pb-4 pt-1">
          {/* Service type is not here: the tabs under the search bar are that
              filter, and two controls for one choice disagree sooner or later. */}
          <section className="pb-2">
            <h3 className="mb-1 text-[13px] font-medium text-muted-foreground">Severity</h3>
            <ul>
              {SEVERITIES.map((severity) => (
                <li key={severity}>
                  <Label className="flex min-h-12 cursor-pointer items-center gap-3">
                    <Checkbox
                      checked={severities.includes(severity)}
                      onCheckedChange={() => toggleSeverity(severity)}
                    />
                    <span
                      aria-hidden
                      style={{ backgroundColor: SEVERITY_META[severity].token }}
                      className="size-2 shrink-0 rounded-full"
                    />
                    <span className="text-[15px] font-medium">
                      {SEVERITY_META[severity].label}
                    </span>
                  </Label>
                </li>
              ))}
            </ul>
          </section>

          <section className="border-t py-2">
            <Label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 py-2">
              <span>
                <span className="block text-[15px] font-medium">
                  Show recently resolved
                </span>
                <span className="mt-1 block text-[13px] font-normal leading-snug text-muted-foreground">
                  Outages fixed in the last 6 hours
                </span>
              </span>
              <Switch
                checked={resolvedHours > 0}
                onCheckedChange={(checked) => setResolvedHours(checked ? 6 : 0)}
              />
            </Label>

            <Label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 py-2">
              <span>
                <span className="block text-[15px] font-medium">Storm warnings</span>
                <span className="mt-1 block text-[13px] font-normal leading-snug text-muted-foreground">
                  Weather that tends to cause outages, from the National Weather
                  Service
                </span>
              </span>
              <Switch
                checked={showAdvisories}
                onCheckedChange={(checked) => setShowAdvisories(Boolean(checked))}
              />
            </Label>
          </section>
          <section className="border-t pt-4">
            <div className="mb-2.5 flex h-6 items-center justify-between">
              <h3 className="text-[13px] font-medium text-muted-foreground">
                Providers
              </h3>
              {allSelected ? (
                <Badge variant="muted">All providers</Badge>
              ) : (
                <button
                  type="button"
                  onClick={() => setProviders([])}
                  className="tap-target text-[13px] font-medium underline underline-offset-4 hover:text-foreground"
                >
                  Show all
                </button>
              )}
            </div>

            {/* Otherwise a failed fetch looks identical to "this deployment
                has no providers", and the whole section just goes missing. */}
            {providersFailed && providers.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Could not load the provider list. Every provider is included
                until it loads.
              </p>
            )}

            {providers.length > 0 && (
              <div className="relative mb-2">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  value={providerQuery}
                  onChange={(event) => setProviderQuery(event.target.value)}
                  placeholder={`Search ${providers.length} providers`}
                  aria-label="Search providers"
                  autoComplete="off"
                  enterKeyHint="search"
                  // 16px, or iOS Safari zooms the page when the field is focused.
                  className="h-11 w-full rounded-full border border-input bg-card pr-9 pl-10 text-base outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15"
                />
                {providerQuery && (
                  <button
                    type="button"
                    onClick={() => setProviderQuery("")}
                    aria-label="Clear provider search"
                    className="tap-target absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            )}

            <div className="divide-y">
              {SERVICE_TYPES.map((type) => {
                const group = byService.get(type) ?? [];
                if (group.length === 0) return null;

                const matches = needle
                  ? group.filter((p) => p.name.toLowerCase().includes(needle))
                  : group;
                if (needle && matches.length === 0) return null;

                const expanded = needle !== "" || openGroups.includes(type);
                const picked = allSelected
                  ? group.length
                  : group.filter((p) => providerIds.includes(p.id)).length;

                return (
                  <div key={type}>
                    <div className="flex items-center gap-3">
                      <Checkbox
                        aria-label={`All ${SERVICE_META[type].label} providers`}
                        checked={
                          picked === group.length
                            ? true
                            : picked === 0
                              ? false
                              : "indeterminate"
                        }
                        onCheckedChange={() => {
                          // Leaving "all" means materialising the list first.
                          if (allSelected) {
                            const ids = new Set(group.map((p) => p.id));
                            setProviders(
                              providers.map((p) => p.id).filter((id) => !ids.has(id)),
                            );
                          } else {
                            toggleGroup(type);
                          }
                        }}
                      />
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() =>
                          setOpenGroups((open) =>
                            open.includes(type)
                              ? open.filter((t) => t !== type)
                              : [...open, type],
                          )
                        }
                        className="flex h-12 min-w-0 flex-1 items-center gap-2 text-left text-[15px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        <ServiceIcon type={type} className="size-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{SERVICE_META[type].label}</span>
                        <span className="text-xs font-normal tabular-nums text-muted-foreground">
                          {allSelected ? group.length : `${picked} of ${group.length}`}
                        </span>
                        <ChevronDown
                          className={cn(
                            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                            expanded && "rotate-180",
                          )}
                        />
                      </button>
                    </div>

                    {expanded && (
                      <ul className="pb-2 pl-[34px]">
                        {matches.map((provider) => {
                          const checked =
                            allSelected || providerIds.includes(provider.id);
                          return (
                            <li key={provider.id}>
                              <Label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-accent">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => {
                                    // Leaving "all" means materialising the list
                                    // first, minus the one just unchecked.
                                    if (allSelected) {
                                      setProviders(
                                        providers
                                          .map((p) => p.id)
                                          .filter((id) => id !== provider.id),
                                      );
                                    } else {
                                      toggleProvider(provider.id);
                                    }
                                  }}
                                />
                                <span className="text-sm font-normal leading-snug">
                                  {provider.name}
                                </span>
                              </Label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

        </div>

        {/* One row rather than the stacked default: three full-width buttons
            would eat most of a phone screen that is already short on room. */}
        <SheetFooter className="flex-row gap-2">
          <Button
            variant="ghost"
            onClick={() => selectAll(providers.map((p) => p.id))}
            className="px-4"
          >
            Reset
          </Button>
          <Button onClick={() => onOpenChange(false)} className="flex-1">
            Done
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
