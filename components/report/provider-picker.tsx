"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { suggestProviders } from "@/lib/provider-suggestions";
import { US_STATE_NAMES } from "@/lib/us-states";
import type { Provider } from "@/lib/types";
import { Chip } from "@/components/ui/chip";

/**
 * Choosing a provider from a list that is over a hundred long.
 *
 * Three views of the same list:
 *
 *   - Suggested (the default): the providers that operate where the pin is,
 *     then the nationwide ones, largest first. With no state to go on, the
 *     biggest names in the country instead, so the list never opens on a lone
 *     "Local power company".
 *   - Search: anything in the list, by name.
 *   - All: every provider, for someone who would rather scroll than type.
 *
 * The person's own saved provider leads whichever view is showing, and the
 * "not listed" catch-alls sort last, so they are a fallback rather than the
 * first thing someone taps.
 */
export function ProviderPicker({
  providers,
  stateCode,
  value,
  onChange,
  preferred = null,
  label = "Provider",
}: {
  /** Already narrowed to one service type. */
  providers: Provider[];
  /** Where the pin (or home) is, as a two-letter code, once known. */
  stateCode: string | null;
  value: string | null;
  onChange: (providerId: string | null) => void;
  /** The provider saved in the person's settings for this service. */
  preferred?: string | null;
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const needle = query.trim().toLowerCase();

  const { shown, local } = useMemo(
    () =>
      suggestProviders(providers, {
        stateCode,
        query,
        all: showAll,
        selected: value,
        preferred,
      }),
    [providers, query, showAll, stateCode, value, preferred],
  );
  const total = providers.length;

  // Only worth the extra controls when the suggestions are hiding something.
  const expandable = providers.length > shown.length || showAll;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-muted-foreground">
          {label} <span className="font-normal">(optional)</span>
        </span>
        {!needle && !showAll && local > 0 && stateCode && (
          <span className="truncate text-xs text-muted-foreground">
            Serving {US_STATE_NAMES[stateCode] ?? stateCode}
          </span>
        )}
      </div>

      {providers.length > 12 && (
        <div className="relative mb-2.5">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${total} providers`}
            aria-label={`Search ${label.toLowerCase()}s`}
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
        <div
          className={
            showAll && !needle
              ? "-mr-2 flex max-h-56 flex-wrap gap-2 overflow-y-auto overscroll-contain pr-2"
              : "flex flex-wrap gap-2"
          }
        >
          {shown.map((provider) => (
            <Chip
              key={provider.id}
              active={value === provider.id}
              onClick={() => onChange(value === provider.id ? null : provider.id)}
            >
              {provider.name}
              {provider.id === preferred && (
                <span className="text-[11px] font-normal text-muted-foreground">Yours</span>
              )}
            </Chip>
          ))}
        </div>
      ) : (
        <p className="py-1 text-sm text-muted-foreground">
          No provider matches “{query.trim()}”. You can carry on without one.
        </p>
      )}

      {!needle && expandable && (
        <button
          type="button"
          onClick={() => setShowAll((all) => !all)}
          className="tap-target mt-3 text-[13px] font-medium text-foreground underline underline-offset-4"
        >
          {showAll ? "Show suggestions only" : `Show all ${total} providers`}
        </button>
      )}
    </div>
  );
}
