"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { FALLBACK_PROVIDER_SLUGS } from "@/lib/data/provider-catalog";
import { US_STATE_NAMES } from "@/lib/us-states";
import type { Provider } from "@/lib/types";
import { Chip } from "@/components/ui/chip";

/**
 * Choosing a provider from a list that is now over a hundred long.
 *
 * Nobody scrolls a hundred chips, so the default view is short: the providers
 * that operate where the pin is (plus the nationwide ones), and a search box
 * for anything else. The "not listed" catch-alls sort last however the list is
 * filtered, so they are a fallback rather than the first thing someone taps.
 */
export function ProviderPicker({
  providers,
  stateCode,
  value,
  onChange,
}: {
  /** Already narrowed to one service type. */
  providers: Provider[];
  /** Where the pin is, as a two-letter code, once known. */
  stateCode: string | null;
  value: string | null;
  onChange: (providerId: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const { shown, total } = useMemo(() => {
    const fallbackLast = (a: Provider, b: Provider) =>
      Number(FALLBACK_PROVIDER_SLUGS.has(a.id)) - Number(FALLBACK_PROVIDER_SLUGS.has(b.id)) ||
      a.name.localeCompare(b.name);

    const matches = needle
      ? providers.filter(
          (p) => p.name.toLowerCase().includes(needle) || p.id.includes(needle),
        )
      : providers.filter(
          (p) =>
            p.id === value ||
            p.regions.length === 0 ||
            (stateCode !== null && p.regions.includes(stateCode)),
        );

    return { shown: [...matches].sort(fallbackLast).slice(0, 24), total: matches.length };
  }, [providers, needle, stateCode, value]);

  // Only worth a search box when the short list is hiding something.
  const searchable = providers.length > 12;
  const hidden = providers.length - (needle ? 0 : total);
  const regional = providers.some((p) => p.regions.length > 0);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-muted-foreground">
          Provider <span className="font-normal">(optional)</span>
        </span>
        {!needle && regional && stateCode && (
          <span className="truncate text-xs text-muted-foreground">
            Serving {US_STATE_NAMES[stateCode] ?? stateCode}
          </span>
        )}
      </div>

      {searchable && (
        <div className="relative mb-2.5">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${providers.length} providers`}
            aria-label="Search providers"
            autoComplete="off"
            enterKeyHint="search"
            // 16px, or iOS Safari zooms the page when the field is focused.
            className="h-11 w-full rounded-xl border border-input bg-background/60 pr-10 pl-10 text-base outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear provider search"
              className="tap-target absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      )}

      {shown.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {shown.map((provider) => (
            <Chip
              key={provider.id}
              active={value === provider.id}
              onClick={() => onChange(value === provider.id ? null : provider.id)}
            >
              {provider.name}
            </Chip>
          ))}
        </div>
      ) : (
        <p className="py-1 text-sm text-muted-foreground">
          No provider matches “{query.trim()}”. You can send the report without
          one.
        </p>
      )}

      {needle && total > shown.length && (
        <p className="pt-2 text-xs text-muted-foreground">
          Showing {shown.length} of {total}. Keep typing to narrow it down.
        </p>
      )}
      {!needle && searchable && hidden > 0 && (
        <p className="pt-2 text-xs text-muted-foreground">
          {stateCode || !regional
            ? `Not here? Search all ${providers.length}.`
            : `Search to find yours among ${providers.length}.`}
        </p>
      )}
    </div>
  );
}
