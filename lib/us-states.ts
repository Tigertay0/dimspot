/**
 * State names to postal codes, for matching a geocoded place (which names its
 * state in full) against the two-letter codes on a provider's regions.
 */
const CODES: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", "District of Columbia": "DC",
  Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL",
  Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA",
  Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI",
  Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT",
  Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC",
  "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR",
  Pennsylvania: "PA", "Puerto Rico": "PR", "Rhode Island": "RI",
  "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX",
  Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA",
  "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
};

const BY_LOWER = new Map(
  Object.entries(CODES).map(([name, code]) => [name.toLowerCase(), code]),
);
const KNOWN = new Set(Object.values(CODES));

/** "Maryland" or "md" to "MD"; null for anything that is not a US state. */
export function stateCode(state: string | null | undefined): string | null {
  if (!state) return null;
  const trimmed = state.trim();
  const upper = trimmed.toUpperCase();
  if (KNOWN.has(upper)) return upper;
  return BY_LOWER.get(trimmed.toLowerCase()) ?? null;
}

export const US_STATE_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(CODES).map(([name, code]) => [code, name]),
);
