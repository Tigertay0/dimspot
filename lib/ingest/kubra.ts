import "server-only";
import { FETCH_TIMEOUT_MS } from "./source";
import type { IngestedOutage, OutageSource, SourceResult } from "./source";

/**
 * Kubra StormCenter: the outage map most large investor-owned utilities embed
 * on their own site (outagemap.pepco.com and its kin are this, hosted on
 * kubra.io).
 *
 * Why it is here: ODIN is voluntary and the largest utilities are mostly not
 * in it. Pepco, BGE, ComEd, Dominion, DTE, Oncor, Georgia Power and the AEP
 * companies publish through StormCenter instead, so without this the map had
 * no live power data for Washington, Baltimore, Chicago, Detroit, Dallas or
 * Atlanta. Utilities that ODIN already reports are left out of the list below,
 * so nothing is counted twice.
 *
 * What is read, per utility, per run:
 *
 *   1. currentState: where this generation's files are. No auth, no key.
 *   2. configuration: which area layers the map has. Only when the map has
 *      been redeployed since this isolate last looked.
 *   3. one "thematic" file: every area with customers out, each with a count,
 *      an outage count, a start time, an estimate and a label point.
 *
 * Areas, not incidents. StormCenter also serves individual incidents as map
 * tiles, but walking them costs dozens of requests per utility, and a Worker
 * invocation has a subrequest budget. The finest area layer a map offers (ZIP
 * code where there is one, otherwise town or county) is two or three requests
 * and is the same granularity the utility's own summary table uses.
 *
 * Off unless KUBRA_INGEST=on. These are the utilities' public outage maps,
 * read the way a browser reads them, a few requests an hour each, but they are
 * not a documented API and a utility's site terms may not welcome automated
 * reads. That is a call for whoever runs the deployment, so it is opt-in (see
 * SETUP.md). A utility can also redeploy or change vendor without notice, which
 * fails that one source for a run (the runner isolates it), not the ingest.
 */

const ORIGIN = "https://kubra.io";

/** Smallest area shown, in customers. Same reasoning as ODIN_MIN_CUSTOMERS. */
export const KUBRA_MIN_CUSTOMERS = 5;

export interface KubraUtility {
  /** Slug in lib/data/provider-catalog.ts; outages are linked to that provider. */
  slug: string;
  name: string;
  stormcenterId: string;
  viewId: string;
  /** The state every area is in, when the utility serves only one. */
  state?: string;
  /** For utilities spanning states: the state of one area, when it can be told. */
  stateFor?: (area: { name: string; type: string }) => string | null;
}

/**
 * Verified against kubra.io on 2026-11-26: each view answered currentState and
 * was matched to the utility through its own outage-map page. National Grid
 * and Evergy also publish here but are in ODIN, so they are not listed.
 */
export const KUBRA_UTILITIES: KubraUtility[] = [
  {
    slug: "pepco",
    name: "Pepco",
    stormcenterId: "bac68083-1c42-44ee-bb3c-6d1c1c026f52",
    viewId: "66f63a73-3b4a-4b2a-a833-f01668ef4986",
    // DC ZIP codes are 200xx to 205xx; everything else Pepco serves is Maryland.
    stateFor: ({ name, type }) =>
      type === "zip"
        ? /^20[0-5]/.test(name)
          ? "District of Columbia"
          : "Maryland"
        : name === "District of Columbia"
          ? name
          : "Maryland",
  },
  { slug: "bge", name: "BGE", stormcenterId: "3db5fd35-4a88-465f-8985-8db3eb760b61", viewId: "1b43510f-b947-437b-9879-c0bd8f6d7816", state: "Maryland" },
  { slug: "delmarva", name: "Delmarva Power", stormcenterId: "b3e5379d-7d75-4ea0-a978-b42bab577210", viewId: "53f06375-21b5-402f-bffe-9c6c81de478c" },
  { slug: "atlantic-city-electric", name: "Atlantic City Electric", stormcenterId: "4b4c1b8f-d2fe-4d2a-877d-a704f764db98", viewId: "f9accd4d-75d9-4e7a-ad5b-d81abd62b2ed", state: "New Jersey" },
  { slug: "comed", name: "ComEd", stormcenterId: "0f46457f-e3ee-473c-8040-d7da9e776ccb", viewId: "a7f6692c-38f6-4bef-8681-989b2bcba5da", state: "Illinois" },
  { slug: "peco", name: "PECO", stormcenterId: "39e6d9f3-fdea-4539-848f-b8631945da6f", viewId: "74de8a50-3f45-4f6a-9483-fd618bb9165d", state: "Pennsylvania" },
  { slug: "dominion", name: "Dominion Energy", stormcenterId: "9c691bb6-767e-4532-b00e-286ac9adc223", viewId: "38b5394c-8bca-4dfd-ac59-b321615446bd" },
  { slug: "pseg-li", name: "PSEG Long Island", stormcenterId: "48006d55-45bb-40a4-99a6-1289326f0d0d", viewId: "fb50e444-70e5-4b69-b868-28463b5dbd19", state: "New York" },
  { slug: "pseg", name: "PSE&G", stormcenterId: "79d82478-c10a-4956-a045-89de3cda618c", viewId: "bdb7f5be-1c1a-46fa-862e-ebdf21851d2e", state: "New Jersey" },
  { slug: "aep-ohio", name: "AEP Ohio", stormcenterId: "9c0735d8-b721-4dce-b80b-558e98ce1083", viewId: "9b2feb80-69f8-4035-925e-f2acbcf1728e", state: "Ohio" },
  { slug: "aep-texas", name: "AEP Texas", stormcenterId: "3ff6812b-90d8-40cd-97a6-76633226f27b", viewId: "6022fe09-5259-4763-892f-5f57463fa6a5", state: "Texas" },
  { slug: "appalachian-power", name: "Appalachian Power", stormcenterId: "6674f49e-0236-4ed8-a40a-b31747557ab7", viewId: "8cfe790f-59f3-4ce3-a73f-a9642227411f" },
  { slug: "indiana-michigan-power", name: "Indiana Michigan Power", stormcenterId: "e07a4ffb-83dd-4251-8dad-3fe5a26979b6", viewId: "1b319a36-d1cf-443d-9ecf-6267acae0c3a" },
  { slug: "kentucky-power", name: "Kentucky Power", stormcenterId: "23dcd38e-2573-4e20-a463-959b11cae011", viewId: "60f31606-5702-4a1e-a74c-08d866b7a6fa", state: "Kentucky" },
  { slug: "pso", name: "PSO", stormcenterId: "4bb3b3bc-e1c4-448b-b806-e4fc85c3b640", viewId: "e2356e43-c76f-4772-bf85-31240a2cc504", state: "Oklahoma" },
  { slug: "swepco", name: "SWEPCO", stormcenterId: "9632df6e-a385-400a-b822-b68d268e8e7c", viewId: "e51304d0-7052-458d-a5ac-0e1980cca976" },
  { slug: "dte", name: "DTE Energy", stormcenterId: "4fbb3ad3-e01d-4d71-9575-d453769c1171", viewId: "8ed2824a-bd92-474e-a7c4-848b812b7f9b", state: "Michigan" },
  { slug: "oncor", name: "Oncor", stormcenterId: "560abba3-7881-4741-b538-ca416b58ba1e", viewId: "ca124b24-9a06-4b19-aeb3-1841a9c962e1", state: "Texas" },
  { slug: "ameren", name: "Ameren", stormcenterId: "92e209c0-35c3-4ec2-9ce9-30d87a55706f", viewId: "9b7c2416-cb0c-4845-99c7-7b31041038a2" },
  { slug: "georgia-power", name: "Georgia Power", stormcenterId: "7b38c047-7950-444b-a25c-9b3e5ab986eb", viewId: "67b44af5-3847-4ca3-9f4e-9190aac343d6", state: "Georgia" },
  { slug: "alabama-power", name: "Alabama Power", stormcenterId: "7636a60f-7b81-4fb0-a30d-ed79a8e271e7", viewId: "c3471c92-6e1b-494b-a884-391139a2cc18", state: "Alabama" },
  { slug: "austin-energy", name: "Austin Energy", stormcenterId: "dd9c446f-f6b8-43f9-8f80-83f5245c60a1", viewId: "76446308-a901-4fa3-849c-3dd569933a51", state: "Texas" },
  { slug: "cps-energy", name: "CPS Energy", stormcenterId: "912c6202-c3f4-491c-a8c1-726157725e92", viewId: "812092c0-153f-4a7f-8c58-e1af1cb740b7", state: "Texas" },
  { slug: "oge", name: "OG&E", stormcenterId: "dc85f79f-59f9-4e9e-9557-b3a9bee7e0ce", viewId: "8fe9d356-96bc-41f1-b353-6720eb408936" },
];

/** Source name stored on every row of one utility. */
export function kubraSourceName(slug: string): string {
  return `kubra-${slug}`;
}

/**
 * Area layers a map can offer, finest first. A map has several (Pepco: county
 * and ZIP); the first one present is used. Anything unlisted ranks last.
 */
const AREA_PREFERENCE = ["zip", "ctv", "town_ward", "county", "district", "operatingarea"];

interface CurrentState {
  stormcenterDeploymentId?: string;
  data?: { interval_generation_data?: string };
}

interface Configuration {
  config?: {
    layers?: {
      data?: {
        interval_generation_data?: Array<{
          type?: string;
          areaType?: string;
          source?: string[];
        }>;
      };
    };
    summary?: { data?: { interval_generation_data?: { source?: string } } };
  };
}

interface Counted {
  val?: number;
  /** Present when the utility hides a small number: `val` is then a placeholder. */
  mask?: number;
}

interface ThematicArea {
  id?: string;
  title?: string;
  desc?: {
    name?: string;
    n_out?: number;
    cust_a?: Counted;
    etr?: string | null;
    start_time?: string | null;
  };
  geom?: { p?: string[] };
}

interface LayerChoice {
  deploymentId: string;
  areaType: string;
  source: string;
  summarySource: string | null;
}

/**
 * The chosen layer per view, kept for as long as this isolate lives. A map's
 * configuration only changes when the utility redeploys it, which currentState
 * announces with a new deployment id, so most runs skip that request.
 */
const layerCache = new Map<string, LayerChoice>();

async function getJson<T>(url: string): Promise<{ status: number; body: T | null }> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Dimspot outage map (+https://dimspot.adetayo.dev)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return { status: response.status, body: null };
  return { status: response.status, body: (await response.json()) as T };
}

/**
 * First point of a Google encoded polyline (precision 5), which is how
 * StormCenter writes an area's label point.
 */
export function decodePoint(encoded: string): { lat: number; lng: number } | null {
  let index = 0;

  function next(): number | null {
    let result = 0;
    let shift = 0;
    for (;;) {
      if (index >= encoded.length) return null;
      const byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0) return null;
      result |= (byte & 0x1f) << shift;
      shift += 5;
      if (byte < 0x20) break;
    }
    return result & 1 ? ~(result >> 1) : result >> 1;
  }

  const lat = next();
  const lng = next();
  if (lat === null || lng === null) return null;

  const point = { lat: lat / 1e5, lng: lng / 1e5 };
  const valid = Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
  return valid ? point : null;
}

function chooseLayer(config: Configuration, deploymentId: string): LayerChoice {
  const layers = (config.config?.layers?.data?.interval_generation_data ?? []).filter(
    (layer) =>
      layer.type === "THEMATIC_LAYER_V2" &&
      typeof layer.areaType === "string" &&
      typeof layer.source?.[0] === "string",
  );
  if (layers.length === 0) throw new Error("no area layer in the map configuration");

  const rank = (type: string) => {
    const at = AREA_PREFERENCE.indexOf(type);
    return at === -1 ? AREA_PREFERENCE.length : at;
  };
  const best = [...layers].sort((a, b) => rank(a.areaType!) - rank(b.areaType!))[0];

  return {
    deploymentId,
    areaType: best.areaType!,
    source: best.source![0],
    summarySource: config.config?.summary?.data?.interval_generation_data?.source ?? null,
  };
}

function isoOrNull(value: string | null | undefined): string | null {
  // "ETR-NULL" is StormCenter's own spelling of "no estimate".
  if (!value || value === "ETR-NULL") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** Some maps shout ("CHESTER", "HUNTINGTON"); mixed-case names are left alone. */
function titleCase(name: string): string {
  if (/[a-z]/.test(name)) return name;
  return name.toLowerCase().replace(/(^|[\s\-'(])([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase());
}

/** "20817" to "ZIP 20817"; "Montgomery" to "Montgomery County". */
function placeName(raw: string, areaType: string): string {
  const name = titleCase(raw.trim());
  if (areaType === "zip") return `ZIP ${name.replace(/,\s*/g, ", ")}`;
  if (areaType === "county" && !/county|parish|district of columbia|city$/i.test(name)) {
    return `${name} County`;
  }
  return name;
}

export class KubraSource implements OutageSource {
  readonly name: string;
  readonly label: string;

  constructor(private readonly utility: KubraUtility) {
    this.name = kubraSourceName(utility.slug);
    this.label = `${utility.name} outage map`;
  }

  /** Opt-in: reading utility outage maps is the deployment owner's decision. */
  isConfigured(): boolean {
    return process.env.KUBRA_INGEST === "on";
  }

  async fetch(): Promise<SourceResult> {
    const { name, stormcenterId, viewId } = this.utility;
    const api = `${ORIGIN}/stormcenter/api/v1/stormcenters/${stormcenterId}/views/${viewId}`;

    const state = await getJson<CurrentState>(`${api}/currentState?preview=false`);
    const interval = state.body?.data?.interval_generation_data;
    const deploymentId = state.body?.stormcenterDeploymentId;
    // Both come from the server and go into a URL, so they are held to the
    // shape they always have rather than trusted.
    if (
      !interval ||
      !deploymentId ||
      !/^data\/[0-9a-f-]{36}$/.test(interval) ||
      !/^[0-9a-f-]{36}$/.test(deploymentId)
    ) {
      throw new Error(`${name}: currentState responded ${state.status} without a data path`);
    }

    let layer = layerCache.get(viewId);
    if (!layer || layer.deploymentId !== deploymentId) {
      const config = await getJson<Configuration>(
        `${api}/configuration/${deploymentId}?preview=false`,
      );
      if (!config.body) throw new Error(`${name}: configuration responded ${config.status}`);
      layer = chooseLayer(config.body, deploymentId);
      if (!/^public\/[\w./-]+\.json$/.test(layer.source) || layer.source.includes("..")) {
        throw new Error(`${name}: unexpected layer path`);
      }
      layerCache.set(viewId, layer);
    }

    const file = await getJson<{ file_data?: ThematicArea[] }>(
      `${ORIGIN}/${interval}/${layer.source}`,
    );

    let areas: ThematicArea[];
    if (file.body && Array.isArray(file.body.file_data)) {
      areas = file.body.file_data;
    } else if (file.status === 404 && (await this.nothingIsOut(interval, layer))) {
      // No file because there is nothing to put in it. Confirmed against the
      // summary before it is believed: an empty snapshot resolves every row.
      areas = [];
    } else {
      throw new Error(`${name}: area file responded ${file.status} with no usable data`);
    }

    const outages: IngestedOutage[] = [];
    for (const area of areas) {
      const customers = area.desc?.cust_a;
      const areaName = area.desc?.name ?? area.title;
      const encoded = area.geom?.p?.[0];
      if (!area.id || !areaName || !customers || !encoded) continue;
      // A masked value is "fewer than N", not a count.
      if (customers.mask !== undefined) continue;
      if (typeof customers.val !== "number" || customers.val < KUBRA_MIN_CUSTOMERS) continue;

      const point = decodePoint(encoded);
      if (!point) continue;

      const incidents = area.desc?.n_out ?? 0;
      const count = customers.val.toLocaleString("en-US");

      outages.push({
        sourceId: area.id,
        providerSlug: this.utility.slug,
        utilityName: name,
        customersAffected: customers.val,
        reportedAt: isoOrNull(area.desc?.start_time),
        serviceType: "power",
        severity: "complete",
        latitude: point.lat,
        longitude: point.lng,
        description:
          `${count} customers without power` +
          (incidents > 1 ? ` across ${incidents} outages` : "") +
          `. Reported by ${name} on its outage map.`,
        city: placeName(areaName, layer.areaType),
        state:
          this.utility.state ??
          this.utility.stateFor?.({ name: areaName, type: layer.areaType }) ??
          null,
        estimatedRestoration: isoOrNull(area.desc?.etr),
        active: true,
      });
    }

    return { outages };
  }

  /** Whether the utility's own summary says zero customers are out. */
  private async nothingIsOut(interval: string, layer: LayerChoice): Promise<boolean> {
    if (!layer.summarySource || !/^public\/[\w./-]+\.json$/.test(layer.summarySource)) {
      return false;
    }
    const summary = await getJson<{
      summaryFileData?: { totals?: Array<{ total_cust_a?: Counted }> };
    }>(`${ORIGIN}/${interval}/${layer.summarySource}`);
    return summary.body?.summaryFileData?.totals?.[0]?.total_cust_a?.val === 0;
  }
}

/** Test seam: forget what earlier fetches learned about each map. */
export function resetKubraCache(): void {
  layerCache.clear();
}
