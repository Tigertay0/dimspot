import "server-only";
import type { Severity } from "@/lib/types";
import { FETCH_TIMEOUT_MS } from "./source";
import type { IngestedOutage, OutageSource, SourceResult } from "./source";

/**
 * Cloudflare Radar traffic anomalies: the closest thing to a live, free feed
 * of ISP and mobile-carrier trouble.
 *
 * Radar watches the traffic Cloudflare receives from each network. When the
 * volume from one drops well below what that network normally sends, it raises
 * an anomaly, and its team later marks the real ones verified. Unlike the
 * curated annotations (cloudflare-radar.ts), which describe a handful of large
 * events a month, these are raised automatically and per network, so they are
 * what catches "Comcast is having a bad hour" or "T-Mobile data is down".
 *
 *   https://radar.cloudflare.com/outage-center
 *   https://developers.cloudflare.com/api/resources/radar/subresources/traffic_anomalies/
 *
 * What it is not. An anomaly names a network (an AS number), not a place:
 * T-Mobile is one network from Seattle to Miami, and the feed cannot say which
 * city lost service. So these rows are scoped "national" and the app lists
 * them as network alerts rather than drawing a pin somewhere arbitrary. And a
 * traffic drop is a signal, not a confirmed outage, which the description and
 * the severity both say.
 *
 * Mobile carriers are the reason this matters for the cellular layer: no free
 * feed reports tower outages, but each carrier's mobile network is its own AS,
 * so a carrier-wide failure shows up here.
 *
 * Uses the same free token as the annotations source (CLOUDFLARE_RADAR_TOKEN,
 * Account > Radar > Read). Without it the source is skipped.
 */

const API = "https://api.cloudflare.com/client/v4/radar/traffic_anomalies";

/**
 * How far back to read. Anomalies still open at the end of the window are the
 * snapshot; the window only needs to be longer than the oldest one worth
 * showing.
 */
const WINDOW = "7d";

/**
 * Most anomalies one request returns. Read as a single page; a response this
 * full may be missing open ones, so it is flagged as truncated and the sync
 * keeps what it could not see.
 */
const ANOMALY_LIMIT = 200;

/**
 * An anomaly nobody has verified is dropped after this long. Real outages are
 * either over or verified by then; what is left is usually a network that
 * changed how it routes traffic, which looks like a permanent drop.
 */
const MAX_UNVERIFIED_HOURS = 12;

/** A verified one is kept longer, but not for ever. */
const MAX_VERIFIED_HOURS = 72;

interface RadarAnomaly {
  uuid?: string;
  type?: string; // "LOCATION" | "AS" | "ORIGIN"
  status?: string; // "VERIFIED" | "UNVERIFIED"
  startDate?: string;
  endDate?: string | null;
  asnDetails?: {
    asn?: string | number;
    name?: string | null;
    location?: { code?: string; name?: string } | null;
  } | null;
  locationDetails?: { code?: string; name?: string } | null;
}

interface KnownNetwork {
  slug: string;
  name: string;
  serviceType: "internet" | "cellular";
}

const net = (slug: string, name: string, serviceType: KnownNetwork["serviceType"] = "internet") =>
  ({ slug, name, serviceType }) satisfies KnownNetwork;

/**
 * US networks people know by a brand, by AS number. A match links the alert to
 * the provider in the catalog and files it under the right service type: a
 * carrier's mobile AS is cellular, its wireline AS is internet.
 *
 * Only numbers that are well established are listed. Anything else is still
 * reported, under the network's registered name and as internet.
 */
const BY_ASN: Record<number, KnownNetwork> = {
  // Mobile networks.
  21928: net("tmobile", "T-Mobile", "cellular"),
  22394: net("verizon", "Verizon", "cellular"),
  6167: net("verizon", "Verizon", "cellular"),
  20057: net("att", "AT&T", "cellular"),
  6614: net("uscellular", "US Cellular", "cellular"),
  // Wireline.
  7922: net("xfinity", "Comcast / Xfinity"),
  20115: net("spectrum", "Spectrum"),
  7018: net("att-internet", "AT&T Internet"),
  701: net("fios", "Verizon Fios"),
  22773: net("cox", "Cox"),
  209: net("centurylink", "CenturyLink"),
  5650: net("frontier", "Frontier"),
  16591: net("google-fiber", "Google Fiber"),
  6128: net("optimum", "Optimum"),
  30036: net("mediacom", "Mediacom"),
  7029: net("kinetic", "Kinetic by Windstream"),
  12083: net("wow", "WOW!"),
  11492: net("sparklight", "Sparklight"),
  14593: net("starlink", "Starlink"),
};

/**
 * The same brands by registered name, for the regional AS numbers the big
 * cable companies also run (Comcast and Charter have dozens each).
 */
const BY_NAME: Array<[RegExp, KnownNetwork]> = [
  [/comcast/i, BY_ASN[7922]],
  [/charter|spectrum|time warner cable|\btwc\b|bright house/i, BY_ASN[20115]],
  [/t-mobile/i, BY_ASN[21928]],
  [/cellco|verizon wireless/i, BY_ASN[22394]],
  [/att-mobility|at&t mobility/i, BY_ASN[20057]],
];

export function knownNetwork(asn: number | null, name: string | null): KnownNetwork | null {
  if (asn !== null && Object.hasOwn(BY_ASN, asn)) return BY_ASN[asn];
  if (name) {
    const match = BY_NAME.find(([pattern]) => pattern.test(name));
    if (match) return match[1];
  }
  return null;
}

/** "COMCAST-7922" reads better as "Comcast 7922"; unknown networks keep their registered name. */
function tidyName(raw: string): string {
  const spaced = raw.replace(/[-_]+/g, " ").trim();
  return /[a-z]/.test(spaced)
    ? spaced
    : spaced.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export class RadarAnomalySource implements OutageSource {
  readonly name = "radar-anomalies";
  readonly label = "Cloudflare Radar traffic anomalies";

  isConfigured(): boolean {
    return Boolean(process.env.CLOUDFLARE_RADAR_TOKEN);
  }

  async fetch(): Promise<SourceResult> {
    const token = process.env.CLOUDFLARE_RADAR_TOKEN;
    if (!token) throw new Error("CLOUDFLARE_RADAR_TOKEN is not set");

    const url = `${API}?location=US&dateRange=${WINDOW}&limit=${ANOMALY_LIMIT}&format=JSON`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      // As in cloudflare-radar.ts: a bad or under-scoped token is a 400.
      const authish = [400, 401, 403].includes(response.status);
      const hint = authish
        ? " — check CLOUDFLARE_RADAR_TOKEN has Account > Radar > Read"
        : "";
      throw new Error(`Cloudflare Radar anomalies responded ${response.status}${hint}`);
    }

    const body = (await response.json()) as {
      success?: boolean;
      errors?: Array<{ message?: string }>;
      result?: { trafficAnomalies?: RadarAnomaly[] };
    };

    if (body.success === false) {
      throw new Error(`Cloudflare Radar anomalies: ${body.errors?.[0]?.message ?? "unknown error"}`);
    }

    // A missing array must not read as "no anomalies": the sync would resolve
    // every active row.
    const anomalies = body.result?.trafficAnomalies;
    if (!Array.isArray(anomalies)) {
      throw new Error("Cloudflare Radar anomalies: unexpected response shape");
    }

    const now = Date.now();
    const outages = new Map<string, IngestedOutage>();

    for (const row of anomalies) {
      // Closed anomalies are history; cloud-provider ("ORIGIN") ones are not a
      // home or mobile connection.
      if (row.endDate || !row.uuid || !row.startDate) continue;
      if (row.type !== "AS" && row.type !== "LOCATION") continue;

      const started = Date.parse(row.startDate);
      if (!Number.isFinite(started)) continue;

      const verified = row.status === "VERIFIED";
      const maxAge = (verified ? MAX_VERIFIED_HOURS : MAX_UNVERIFIED_HOURS) * 60 * 60 * 1000;
      if (now - started > maxAge) continue;

      // The request filters by location, but the row says where the network
      // is registered; believe the row.
      const country = row.asnDetails?.location?.code ?? row.locationDetails?.code;
      if (country && country !== "US") continue;

      const asn = row.asnDetails?.asn !== undefined ? Number(row.asnDetails.asn) : null;
      const rawName = row.asnDetails?.name ?? null;
      const known =
        row.type === "AS" ? knownNetwork(Number.isFinite(asn) ? asn : null, rawName) : null;

      const who =
        row.type === "LOCATION"
          ? "networks across the United States"
          : known
            ? `${known.name}${asn ? ` (AS${asn})` : ""}`
            : `${rawName ? tidyName(rawName) : "a US network"}${asn ? ` (AS${asn})` : ""}`;

      // Verified is still "traffic dropped", not "everyone is offline".
      const severity: Severity = verified ? "degraded" : "intermittent";

      outages.set(row.uuid, {
        sourceId: row.uuid,
        providerSlug: known?.slug ?? null,
        utilityName:
          known?.name ??
          (row.type === "LOCATION" ? "United States" : rawName ? tidyName(rawName) : null),
        customersAffected: null,
        reportedAt: new Date(started).toISOString(),
        serviceType: known?.serviceType ?? "internet",
        severity,
        // Geographic centre of the contiguous US, as a placeholder: see scope.
        latitude: 39.8283,
        longitude: -98.5795,
        description:
          `Cloudflare Radar detected an unusual drop in traffic from ${who}. ` +
          (verified
            ? "Cloudflare has verified it. "
            : "It has not been verified yet, so it may be a measurement blip. ") +
          "This is a signal for the whole network, not for one place, and a traffic drop is not always an outage.",
        city: null,
        state: null,
        estimatedRestoration: null,
        active: true,
        scope: "national",
      });
    }

    return {
      outages: [...outages.values()],
      truncated: anomalies.length >= ANOMALY_LIMIT,
    };
  }
}
