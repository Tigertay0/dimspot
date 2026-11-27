"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  CircleUserRound,
  Clock,
  House,
  ListFilter,
  Loader2,
  MapPin,
  Navigation,
  Search,
  X,
} from "lucide-react";
import type { GeocodeResult } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Location search (PRD section 4.4).
 *
 * Suggestions come from a geocoder built for prefixes (see
 * lib/geocode/photon.ts), so they start on the second letter and are biased
 * towards wherever the map is looking. Debounced so a word typed at normal
 * speed is one or two requests, not one per key.
 */
const DEBOUNCE_MS = 180;
const RECENTS_KEY = "dimspot-recent-searches";
const MAX_RECENTS = 4;

interface Row {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string | null;
  /** A place to go to, or one of the two shortcuts. */
  action: GeocodeResult | "locate" | "home";
}

/** "Bethesda" and "Montgomery County, Maryland" from one geocoder label. */
function splitLabel(label: string): { title: string; detail: string | null } {
  const [title, ...rest] = label.split(",");
  const detail = rest.join(",").trim();
  return { title: title.trim(), detail: detail || null };
}

function readRecents(): GeocodeResult[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return stored
      .filter(
        (r): r is GeocodeResult =>
          typeof r?.label === "string" &&
          Number.isFinite(r?.latitude) &&
          Number.isFinite(r?.longitude) &&
          Number.isFinite(r?.zoom),
      )
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

async function geocode(params: URLSearchParams, signal?: AbortSignal) {
  const response = await fetch(`/api/geocode?${params}`, { signal });
  // Throw so a rate limit or upstream failure is not shown as "no matches".
  if (!response.ok) throw new Error(`Geocode failed: ${response.status}`);
  return ((await response.json()) as { results: GeocodeResult[] }).results;
}

export function SearchBar({
  onPick,
  onClear,
  onLocate,
  home,
  bias,
  onOpenFilters,
  onOpenSettings,
  onOpenChange,
  activeFilterCount,
  signedIn = false,
  className,
}: {
  onPick: (result: GeocodeResult) => void;
  /** The box was emptied: whatever marked the last result can go. */
  onClear?: () => void;
  /** "Use my location", offered before anything is typed. */
  onLocate?: () => void;
  /** The saved home, offered before anything is typed. */
  home?: { label: string; latitude: number; longitude: number } | null;
  /** Where the map is looking, so "Springfield" means the near one. */
  bias?: { latitude: number; longitude: number; zoom: number } | null;
  onOpenFilters: () => void;
  /** Home, providers, alerts and the account live behind this. */
  onOpenSettings: () => void;
  /** The suggestion list opened or closed, so the shell can clear what is under it. */
  onOpenChange?: (open: boolean) => void;
  activeFilterCount: number;
  signedIn?: boolean;
  className?: string;
}) {
  const listId = useId();
  const [value, setValue] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [resolving, setResolving] = useState(false);
  /** The text a submitted search found nothing for. */
  const [noMatch, setNoMatch] = useState<string | null>(null);
  const [recents, setRecents] = useState<GeocodeResult[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Read through a ref: the bias follows every pan of the map, and a pan must
  // not refetch suggestions for text that has not changed.
  const biasRef = useRef(bias);
  useEffect(() => {
    biasRef.current = bias;
  }, [bias]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);

  const suggestParams = useCallback((text: string) => {
    const params = new URLSearchParams({ q: text, suggest: "1" });
    const near = biasRef.current;
    if (near) {
      params.set("near_lat", near.latitude.toFixed(3));
      params.set("near_lng", near.longitude.toFixed(3));
      params.set("near_zoom", String(Math.round(near.zoom)));
    }
    return params;
  }, []);

  const canLocate = Boolean(onLocate);
  const typing = debounced.length >= 2;
  const { data: results = [], isFetching, isError } = useQuery({
    queryKey: ["geocode-suggest", debounced],
    enabled: typing,
    staleTime: 10 * 60 * 1000,
    // Keep the last list on screen while the next one loads, so the rows do
    // not blink out between keystrokes.
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => geocode(suggestParams(debounced), signal),
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

  const close = useCallback(() => {
    setOpen(false);
    setActive(-1);
    // Also puts the phone's keyboard away, which otherwise covers the map the
    // search just moved.
    inputRef.current?.blur();
  }, []);

  const choose = useCallback(
    (result: GeocodeResult) => {
      onPick(result);
      setValue(splitLabel(result.label).title);
      setNoMatch(null);
      close();

      setRecents((current) => {
        const next = [result, ...current.filter((r) => r.label !== result.label)].slice(
          0,
          MAX_RECENTS,
        );
        try {
          localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
        } catch {
          // Private mode or a full store: recents are a convenience.
        }
        return next;
      });
    },
    [onPick, close],
  );

  /**
   * Enter with nothing highlighted: go to the best match for what is typed
   * right now, not for whatever the debounce last fetched. Suggestions first;
   * if they have nothing (a full street address often is not in them), the
   * slower whole-address search.
   */
  async function submit() {
    const text = value.trim();
    if (text.length < 2 || resolving) return;

    if (text === debounced && !isFetching && results[0]) {
      choose(results[0]);
      return;
    }

    setResolving(true);
    try {
      const suggested = await geocode(suggestParams(text)).catch(() => []);
      const found = suggested[0] ?? (await geocode(new URLSearchParams({ q: text })))[0];
      if (found) choose(found);
      else setNoMatch(text);
    } catch {
      setNoMatch(text);
    } finally {
      setResolving(false);
    }
  }

  const rows = useMemo<Row[]>(() => {
    if (typing) {
      return results.map((result) => ({
        key: result.id,
        icon: MapPin,
        ...splitLabel(result.label),
        action: result,
      }));
    }

    // Before anything is typed: the two places most searches are for, then
    // the last few searches.
    const quick: Row[] = [];
    if (canLocate) {
      quick.push({ key: "locate", icon: Navigation, title: "Use my location", detail: null, action: "locate" });
    }
    if (home) {
      quick.push({ key: "home", icon: House, title: "Home", detail: home.label, action: "home" });
    }
    for (const recent of recents) {
      quick.push({ key: `recent-${recent.id}`, icon: Clock, ...splitLabel(recent.label), action: recent });
    }
    return quick;
  }, [typing, results, recents, home, canLocate]);

  function run(row: Row) {
    if (row.action === "locate") {
      onLocate?.();
      close();
    } else if (row.action === "home") {
      if (!home) return;
      onPick({
        id: "home",
        label: home.label,
        latitude: home.latitude,
        longitude: home.longitude,
        zoom: 13,
        city: null,
        state: null,
        zipCode: null,
      });
      close();
    } else {
      choose(row.action);
    }
  }

  const searching = resolving || (isFetching && typing);
  const listOpen = open && (typing || rows.length > 0);
  const stale = typing && noMatch !== null && noMatch === value.trim();

  useEffect(() => {
    onOpenChange?.(listOpen);
  }, [listOpen, onOpenChange]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* A real form, so Enter submits through the browser's own behaviour
          rather than a hand-rolled keydown handler. */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
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
          ref={inputRef}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setActive(-1);
            setNoMatch(null);
            setOpen(true);
          }}
          onFocus={(event) => {
            setRecents(readRecents());
            setOpen(true);
            // Typing over the last search should replace it, not append to it.
            event.target.select();
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              if (rows.length === 0) return;
              event.preventDefault();
              setOpen(true);
              const step = event.key === "ArrowDown" ? 1 : -1;
              // -1 is the text box itself, so the list wraps through it.
              setActive((current) => ((current + 1 + step + rows.length + 1) % (rows.length + 1)) - 1);
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (listOpen && rows[active]) run(rows[active]);
              else void submit();
            } else if (event.key === "Escape") {
              close();
            }
          }}
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={listOpen && active >= 0 ? `${listId}-${active}` : undefined}
          placeholder="Search address, city or ZIP"
          aria-label="Search for a location"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          // 16px: anything smaller and iOS Safari zooms the page on focus.
          className="h-full min-w-0 flex-1 truncate bg-transparent px-3 text-base font-medium tracking-[-0.01em] text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground"
        />

        {value.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setValue("");
              setDebounced("");
              setNoMatch(null);
              setActive(-1);
              onClear?.();
              inputRef.current?.focus();
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

      {listOpen && (
        <div className="panel absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl">
          {typing && rows.length === 0 && (
            <p className="flex items-center gap-2 px-4 py-3.5 text-sm text-muted-foreground">
              {searching ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Searching…
                </>
              ) : isError ? (
                "Search is unavailable right now. Try again shortly."
              ) : stale ? (
                `No places matched “${value.trim()}”.`
              ) : (
                "No suggestions. Press Enter to search the full address."
              )}
            </p>
          )}

          <ul id={listId} role="listbox" className="max-h-[50dvh] overflow-y-auto overscroll-contain py-1">
            {rows.map((row, index) => (
              <li key={row.key} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  // The input keeps focus, so the keyboard does not flicker
                  // closed and open as a row is tapped.
                  tabIndex={-1}
                  onPointerMove={() => setActive(index)}
                  onClick={() => run(row)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors focus-visible:outline-none",
                    index === active && "bg-secondary",
                  )}
                >
                  <span
                    aria-hidden
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground"
                  >
                    <row.icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{row.title}</span>
                    {row.detail && (
                      <span className="block truncate text-[13px] text-muted-foreground">
                        {row.detail}
                      </span>
                    )}
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
