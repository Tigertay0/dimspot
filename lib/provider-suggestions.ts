import {
  FALLBACK_PROVIDER_SLUGS,
  POPULAR_POWER_SLUGS,
  providerRank,
} from "@/lib/data/provider-catalog";
import type { Provider } from "@/lib/types";

/**
 * Which providers a picker shows, and in what order.
 *
 *   - `query`: anything in the list whose name matches.
 *   - `all`: every provider.
 *   - otherwise, suggestions: the providers that operate in `stateCode`, then
 *     the nationwide ones. With no state to go on (or none that serve it), the
 *     largest utilities in the country stand in, so the list never opens on a
 *     lone "Local power company".
 *
 * In every view the person's own provider leads, the "not listed" catch-alls
 * come last, and the rest run largest first.
 */
export function suggestProviders(
  providers: Provider[],
  {
    stateCode = null,
    query = "",
    all = false,
    selected = null,
    preferred = null,
    limit = 18,
  }: {
    stateCode?: string | null;
    query?: string;
    all?: boolean;
    selected?: string | null;
    preferred?: string | null;
    /** Cap on suggestions; a search or "all" is never cut. */
    limit?: number;
  } = {},
): { shown: Provider[]; local: number } {
  const needle = query.trim().toLowerCase();
  const here = stateCode ? providers.filter((p) => p.regions.includes(stateCode)) : [];

  let matches: Provider[];
  if (needle) {
    matches = providers.filter(
      (p) => p.name.toLowerCase().includes(needle) || p.id.includes(needle),
    );
  } else if (all) {
    matches = providers;
  } else {
    const nationwide = providers.filter((p) => p.regions.length === 0);
    // Regional providers elsewhere are noise once the state is known.
    const famous = here.length > 0 ? [] : providers.filter((p) => POPULAR_POWER_SLUGS.has(p.id));
    const pinned = providers.filter((p) => p.id === selected || p.id === preferred);
    matches = [...new Set([...pinned, ...here, ...famous, ...nationwide])];
  }

  const sorted = [...matches].sort(
    (a, b) =>
      Number(b.id === preferred) - Number(a.id === preferred) ||
      Number(FALLBACK_PROVIDER_SLUGS.has(a.id)) - Number(FALLBACK_PROVIDER_SLUGS.has(b.id)) ||
      providerRank(a.id) - providerRank(b.id) ||
      a.name.localeCompare(b.name),
  );

  if (needle || all) return { shown: sorted, local: here.length };

  // The cap applies to named providers only: "not listed" has to stay
  // reachable however long the suggestions run.
  const named = sorted.filter((p) => !FALLBACK_PROVIDER_SLUGS.has(p.id));
  const fallbacks = sorted.filter((p) => FALLBACK_PROVIDER_SLUGS.has(p.id));
  return { shown: [...named.slice(0, limit), ...fallbacks], local: here.length };
}
