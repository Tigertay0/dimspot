"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleUserRound, ListFilter, Loader2, MapPin, Search, X } from "lucide-react";
import type { GeocodeResult } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Location search (PRD section 4.4).
 *
 * Debounced at 350ms: Nominatim's usage policy is roughly one request per
 * second, and firing on every keystroke would blow through that on a normal
 * typing speed while returning results nobody reads.
 */
const DEBOUNCE_MS = 350;

export function SearchBar({
  onPick,
  onOpenFilters,
  onOpenSettings,
  activeFilterCount,
  signedIn = false,
  className,
}: {
  onPick: (result: GeocodeResult) => void;
  onOpenFilters: () => void;
  /** Home, providers, alerts and the account live behind this. */
  onOpenSettings: () => void;
  activeFilterCount: number;
  signedIn?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);

  const { data: results = [], isFetching, isError } = useQuery({
    queryKey: ["geocode", debounced],
    enabled: debounced.length >= 2,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const response = await fetch(
        `/api/geocode?q=${encodeURIComponent(debounced)}`,
      );
      // Throw so a rate limit or upstream failure is not shown as "no matches".
      if (!response.ok) throw new Error(`Geocode failed: ${response.status}`);
      const body = (await response.json()) as { results: GeocodeResult[] };
      return body.results;
    },
  });

  // Close the suggestion list on an outside tap, the way a native picker would.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function choose(result: GeocodeResult) {
    onPick(result);
    // Keep the short form in the box; the full display_name is unreadable.
    setValue(result.label.split(",").slice(0, 2).join(",").trim());
    setOpen(false);
  }

  const searching = isFetching && debounced.length >= 2;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* A real form, so Enter picks the top suggestion through the browser's
          own submit behaviour rather than a hand-rolled keydown handler. */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (results[0]) choose(results[0]);
        }}
        className={cn(
          "flex h-14 items-center rounded-full border bg-card pr-2 pl-5 shadow-[0_2px_8px_rgb(0_0_0/0.08)]",
          "transition-[border-color,box-shadow] duration-150 focus-within:border-input focus-within:shadow-[0_2px_12px_rgb(0_0_0/0.12)]",
        )}
      >
        {searching ? (
          <Loader2 aria-hidden className="size-[18px] shrink-0 animate-spin text-foreground" />
        ) : (
          <Search aria-hidden className="size-[18px] shrink-0 text-foreground" strokeWidth={2.5} />
        )}

        <input
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            // The form has no submit button, so implicit submission is not
            // guaranteed — handle Enter here as well and let the form's
            // onSubmit be the fallback.
            if (event.key === "Enter") {
              event.preventDefault();
              if (results[0]) choose(results[0]);
            }
            if (event.key === "Escape") setOpen(false);
          }}
          placeholder="Search address, city or ZIP"
          aria-label="Search for a location"
          autoComplete="off"
          enterKeyHint="search"
          // 16px: anything smaller and iOS Safari zooms the page on focus.
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-base font-medium tracking-[-0.01em] text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground"
        />

        {value.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setValue("");
              setOpen(false);
            }}
            aria-label="Clear search"
            className="tap-target mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" />
          </button>
        )}


        <button
          type="button"
          onClick={onOpenFilters}
          aria-label={
            activeFilterCount > 0
              ? `Filters, ${activeFilterCount} active`
              : "Filters"
          }
          className={cn(
            "tap-target relative flex size-10 shrink-0 items-center justify-center rounded-full border text-foreground transition-colors",
            "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            activeFilterCount > 0 && "border-foreground shadow-[inset_0_0_0_1px_var(--foreground)]",
          )}
        >
          <ListFilter className="size-4" />
          {activeFilterCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] tabular-nums font-medium leading-none text-background">
              {activeFilterCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          aria-label={signedIn ? "Settings and account, signed in" : "Settings and account"}
          title="Settings"
          className="tap-target relative ml-1.5 flex size-10 shrink-0 items-center justify-center rounded-full border text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CircleUserRound className="size-[18px]" />
          {signedIn && (
            <span
              aria-hidden
              className="absolute right-0 top-0 size-2.5 rounded-full border-2 border-card bg-severity-resolved"
            />
          )}
        </button>
      </form>

      {open && debounced.length >= 2 && (
        <div className="panel absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl">
          {isFetching && results.length === 0 && (
            <p className="flex items-center gap-2 px-4 py-3.5 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Searching…
            </p>
          )}

          {!isFetching && isError && (
            <p className="px-4 py-3.5 text-sm text-muted-foreground">
              Search is unavailable right now. Try again shortly.
            </p>
          )}

          {!isFetching && !isError && results.length === 0 && (
            <p className="px-4 py-3.5 text-sm text-muted-foreground">
              No places matched “{debounced}”.
            </p>
          )}

          <ul className="max-h-[50dvh] divide-y overflow-y-auto overscroll-contain">
            {results.map((result) => (
              <li key={result.id}>
                <button
                  type="button"
                  onClick={() => choose(result)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  <span
                    aria-hidden
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground"
                  >
                    <MapPin className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">
                      {result.label.split(",")[0]}
                    </span>
                    <span className="block truncate text-[13px] text-muted-foreground">
                      {result.label.split(",").slice(1).join(",").trim()}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
