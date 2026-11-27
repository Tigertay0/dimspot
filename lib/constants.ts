import { PROVIDER_CATALOG } from "./data/provider-catalog";
import type { ServiceType, Severity } from "./types";

/** Confirmations required before an outage is badged as verified. */
export const VERIFICATION_THRESHOLD = 5;

/** Zoom at which clusters give way to individual markers (PRD §4.1 "Level 3"). */
export const MARKER_ZOOM = 13;

export const DEFAULT_VIEW = {
  latitude: 39.8283,
  longitude: -98.5795, // Geographic centre of the contiguous US.
  zoom: 3.6,
};

/**
 * Fitted on load instead of using DEFAULT_VIEW's fixed zoom, so a phone in
 * portrait and a desktop window both open showing the whole country rather
 * than an arbitrary crop of the Midwest. [west, south, east, north]
 */
export const HOME_BOUNDS: [number, number, number, number] = [
  -125.0, 24.4, -66.9, 49.4,
];

export const SERVICE_META: Record<
  ServiceType,
  { label: string; shortLabel: string; icon: string }
> = {
  power: { label: "Power", shortLabel: "Power", icon: "zap" },
  internet: { label: "Internet / WiFi", shortLabel: "Internet", icon: "wifi" },
  cellular: { label: "Cellular", shortLabel: "Cellular", icon: "signal" },
  other: { label: "Other services", shortLabel: "Other", icon: "circle-help" },
};

/**
 * What live data actually exists per service type, and what to tell someone
 * looking at an empty map because of it.
 *
 * An empty map has two very different meanings — "nothing is broken" and
 * "nothing is watching" — and the app cannot tell them apart unless it says
 * which feeds it has. Power is well covered. Internet and cellular are covered
 * at the scale of a whole network or a whole state, never a street.
 */
export const SERVICE_COVERAGE: Record<
  ServiceType,
  { live: boolean; summary: string; note: string }
> = {
  power: {
    live: true,
    summary: "Covers many US utilities, not all",
    note: "Live utility data covers many US utilities, not all of them, plus anything people report. A quiet map can mean your utility is not one of them.",
  },
  internet: {
    live: true,
    summary: "Whole-network outages and reports",
    note: "Live data catches a whole provider or a whole state losing connectivity. One neighborhood going down shows up only if someone reports it.",
  },
  cellular: {
    live: true,
    summary: "Whole-network outages and reports",
    note: "Live data catches a carrier's whole network dropping, not single towers. Local dead zones show up only if someone reports them.",
  },
  other: {
    live: false,
    summary: "Reported by people only",
    note: "Water, gas and everything else is reported by people here. No free live feed covers them.",
  },
};

export const SEVERITY_META: Record<
  Severity,
  { label: string; description: string; rank: number; token: string }
> = {
  complete: {
    label: "Complete outage",
    description: "Service is entirely down",
    rank: 3,
    token: "var(--severity-complete)",
  },
  degraded: {
    label: "Degraded",
    description: "Working, but slow or unreliable",
    rank: 2,
    token: "var(--severity-degraded)",
  },
  intermittent: {
    label: "Intermittent",
    description: "Cuts out and comes back",
    rank: 1,
    token: "var(--severity-intermittent)",
  },
};

/** Highest severity in a set — drives cluster colour. */
export function dominantSeverity(severities: Severity[]): Severity {
  return severities.reduce<Severity>(
    (worst, s) => (SEVERITY_META[s].rank > SEVERITY_META[worst].rank ? s : worst),
    "intermittent",
  );
}

export const MILES_TO_METERS = 1609.344;

/** Account passwords. Shared by the sign-up form and the server's checks. */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/**
 * Display names for upstream feeds, keyed by the `source_name` stored on each
 * ingested row. Doubles as attribution: these are other organisations' data.
 */
interface SourceMeta {
  name: string;
  short: string;
  /**
   * How the feed knows. A utility saying "our customers are off supply" and a
   * research group inferring "this region stopped answering" are different
   * claims, and the detail sheet must not present the second as the first.
   */
  provenance: "reported" | "detected";
  /** Replaces the stock sentence for this provenance, where it does not fit. */
  attribution?: string;
}

export const SOURCE_LABELS: Record<string, SourceMeta> = {
  odin: {
    name: "ODIN (Oak Ridge National Laboratory)",
    short: "ODIN",
    provenance: "reported",
  },
  nws: {
    name: "National Weather Service",
    short: "NWS",
    provenance: "reported",
  },
  ioda: {
    name: "IODA (Georgia Tech)",
    short: "IODA",
    provenance: "detected",
  },
  "cloudflare-radar": {
    name: "Cloudflare Radar",
    short: "Radar",
    provenance: "detected",
  },
  "radar-anomalies": {
    name: "Cloudflare Radar",
    short: "Radar",
    provenance: "detected",
    attribution:
      "Detected by Cloudflare Radar from the traffic it sees from this network, not reported by the provider. Your own connection may be fine.",
  },
};

/** Sources named "kubra-<provider slug>" are one utility's own outage map. */
const UTILITY_MAP_PREFIX = "kubra-";

function utilityMapName(sourceName: string | null): string | null {
  if (!sourceName?.startsWith(UTILITY_MAP_PREFIX)) return null;
  const slug = sourceName.slice(UTILITY_MAP_PREFIX.length);
  return PROVIDER_CATALOG.find((p) => p.slug === slug)?.name ?? null;
}

/** Whether a feed measured this itself rather than being told by a provider. */
export function isDetected(sourceName: string | null): boolean {
  return sourceName !== null && SOURCE_LABELS[sourceName]?.provenance === "detected";
}

export function sourceLabel(sourceName: string | null, form: "name" | "short" = "name"): string {
  if (!sourceName) return form === "short" ? "feed" : "an official feed";

  const utility = utilityMapName(sourceName);
  if (utility) return form === "short" ? "Utility map" : `${utility}'s outage map`;

  return SOURCE_LABELS[sourceName]?.[form] ?? sourceName;
}

/** One sentence saying where an ingested row came from, and how sure it is. */
export function sourceAttribution(sourceName: string | null): string {
  const utility = utilityMapName(sourceName);
  if (utility) {
    return (
      `Reported by ${utility} on its own outage map, not by a person. ` +
      `The marker is the center of the area it reports, not one address. Confirmations do not apply.`
    );
  }

  const meta = sourceName ? SOURCE_LABELS[sourceName] : undefined;
  if (meta?.attribution) return meta.attribution;
  const label = sourceLabel(sourceName);

  if (meta?.provenance === "detected") {
    return (
      `Detected by ${label} from network measurements, not reported by a provider. ` +
      `Individual providers in the area may be unaffected.`
    );
  }

  return `Reported by the utility via ${label}, not by a person. Confirmations do not apply.`;
}
