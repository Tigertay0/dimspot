import "server-only";
import { isDatabaseConfigured, iso, query } from "@/lib/db";
import { CloudflareRadarSource } from "./cloudflare-radar";
import { IodaSource } from "./ioda";
import { NwsSource } from "./nws";
import { OdinSource } from "./odin";
import type { IngestedAdvisory, IngestedOutage, OutageSource } from "./source";

/**
 * Ingestion runner.
 *
 * Runs on the Cron Trigger in wrangler.jsonc (every 20 minutes): worker.ts
 * calls /api/ingest with CRON_SECRET.
 *
 * Each source is isolated — one feed being down or changing shape must not stop
 * the others — and every upsert is keyed on (source_name, source_id) so a poll
 * every few minutes updates in place instead of duplicating.
 */

const SOURCES: OutageSource[] = [
  new NwsSource(),
  new OdinSource(),
  new IodaSource(),
  new CloudflareRadarSource(),
];

export interface SourceReport {
  source: string;
  ok: boolean;
  outages: number;
  advisories: number;
  /** The feed's page may have been cut off, so nothing was resolved for it. */
  truncated?: boolean;
  error?: string;
}

export interface IngestReport {
  ran: string;
  sources: SourceReport[];
  advisoriesPruned: number;
  /** Expired sessions, tokens and rate-limit rows cleared this run. */
  staleRowsPruned: number;
  outagesResolved: number;
}

async function upsertAdvisories(
  sourceName: string,
  advisories: IngestedAdvisory[],
): Promise<void> {
  if (advisories.length === 0) return;

  const rows = advisories.map((a) => ({
    source_id: a.sourceId,
    kind: a.kind,
    severity: a.severity,
    headline: a.headline,
    description: a.description,
    area_description: a.areaDescription,
    url: a.url,
    latitude: a.latitude,
    longitude: a.longitude,
    starts_at: a.startsAt,
    ends_at: a.endsAt,
  }));

  // One statement for the whole batch. A feed repeating an id would make
  // ON CONFLICT touch the same row twice and abort, so the first one wins.
  await query(
    `INSERT INTO advisories (
       source_name, source_id, kind, severity, headline, description,
       area_description, url, location, starts_at, ends_at
     )
     SELECT DISTINCT ON (r.source_id)
       $1, r.source_id, r.kind, r.severity, r.headline, r.description,
       r.area_description, r.url,
       ST_SetSRID(ST_MakePoint(r.longitude, r.latitude), 4326)::geography,
       r.starts_at, r.ends_at
     FROM jsonb_to_recordset($2::jsonb) AS r(
       source_id TEXT, kind TEXT, severity TEXT, headline TEXT, description TEXT,
       area_description TEXT, url TEXT, latitude DOUBLE PRECISION,
       longitude DOUBLE PRECISION, starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ
     )
     ON CONFLICT (source_name, source_id) DO UPDATE SET
       kind = EXCLUDED.kind,
       severity = EXCLUDED.severity,
       headline = EXCLUDED.headline,
       description = EXCLUDED.description,
       area_description = EXCLUDED.area_description,
       url = EXCLUDED.url,
       location = EXCLUDED.location,
       starts_at = EXCLUDED.starts_at,
       ends_at = EXCLUDED.ends_at`,
    [sourceName, JSON.stringify(rows)],
  );
}

type FeedRow = {
  source_id: string;
  service_type: IngestedOutage["serviceType"];
  severity: IngestedOutage["severity"];
  latitude: number;
  longitude: number;
  city: string | null;
  state: string | null;
  description: string | null;
  estimated_restoration: string | null;
  reported_at: string | null;
  metadata: unknown;
};

/**
 * This source's active outages that are missing from `seen`, as feed rows
 * carrying their stored values unchanged — so passing them back through the
 * sync keeps them open without altering them.
 *
 * Throws rather than return a partial list: any row left out would be resolved.
 */
async function activeRowsNotIn(
  sourceName: string,
  seen: Set<string>,
): Promise<FeedRow[]> {
  const stored = await query<{
    source_id: string | null;
    service_type: FeedRow["service_type"];
    severity: FeedRow["severity"];
    latitude: number | null;
    longitude: number | null;
    city: string | null;
    state: string | null;
    description: string | null;
    estimated_restoration: Date | null;
    reported_at: Date;
    metadata: unknown;
  }>(
    `SELECT source_id, service_type, severity,
            ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude,
            city, state, description, estimated_restoration, reported_at, metadata
     FROM outages
     WHERE source_name = $1 AND status = 'active'`,
    [sourceName],
  );

  const rows: FeedRow[] = [];
  for (const row of stored) {
    if (row.source_id === null || seen.has(row.source_id)) continue;
    if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) {
      throw new Error(`active ${sourceName} outage ${row.source_id}: unreadable location`);
    }
    rows.push({
      source_id: row.source_id,
      service_type: row.service_type,
      severity: row.severity,
      latitude: row.latitude as number,
      longitude: row.longitude as number,
      city: row.city,
      state: row.state,
      description: row.description,
      estimated_restoration: iso(row.estimated_restoration),
      reported_at: iso(row.reported_at),
      metadata: row.metadata,
    });
  }
  return rows;
}

/**
 * Apply a source's full outage snapshot: upsert what it reports, resolve what
 * it no longer does.
 *
 * With `keepMissing` (a truncated feed page) nothing is resolved: the source's
 * other active outages are passed back unchanged alongside the new rows, so
 * the same atomic call upserts what came back and leaves the rest open.
 *
 * One atomic SQL call (sync_official_outages) rather than an upsert plus a
 * cleanup query from here, so a reader never sees the snapshot half applied.
 */
async function syncOutages(
  sourceName: string,
  outages: IngestedOutage[],
  { keepMissing = false }: { keepMissing?: boolean } = {},
): Promise<{ upserted: number; resolved: number }> {
  // The SQL function upserts in one statement, so a repeated source_id or a row
  // with no usable coordinates would abort the whole snapshot. Keep the first
  // row per id and drop rows that cannot be placed on the map.
  const unique = new Map<string, IngestedOutage>();
  for (const o of outages) {
    if (!o.active || unique.has(o.sourceId)) continue;
    if (!Number.isFinite(o.latitude) || !Number.isFinite(o.longitude)) continue;
    unique.set(o.sourceId, o);
  }

  const rows: FeedRow[] = [...unique.values()].map((o) => ({
    source_id: o.sourceId,
    service_type: o.serviceType,
    severity: o.severity,
    latitude: o.latitude,
    longitude: o.longitude,
    city: o.city,
    state: o.state,
    description: o.description,
    estimated_restoration: o.estimatedRestoration,
    reported_at: o.reportedAt,
    metadata: {
      utility_name: o.utilityName,
      customers_affected: o.customersAffected,
      // Without a feed start time, reported_at is only when we first saw it.
      start_known: o.reportedAt !== null,
    },
  }));

  const carried = keepMissing ? await activeRowsNotIn(sourceName, new Set(unique.keys())) : [];

  const [result] = await query<{ upserted: number; resolved: number }>(
    "SELECT * FROM sync_official_outages($1, $2::jsonb)",
    [sourceName, JSON.stringify([...rows, ...carried])],
  );
  if (!result) throw new Error("sync_official_outages returned no result row");
  // Carried rows are re-written, not new: report only what the feed sent.
  return { upserted: result.upserted - carried.length, resolved: result.resolved };
}

export async function runIngest(): Promise<IngestReport> {
  if (!isDatabaseConfigured()) {
    throw new Error("Ingestion needs a database, and none is configured.");
  }

  const reports: SourceReport[] = [];
  let outagesResolved = 0;

  for (const source of SOURCES) {
    if (!source.isConfigured()) {
      reports.push({
        source: source.name,
        ok: false,
        outages: 0,
        advisories: 0,
        error: "not configured",
      });
      continue;
    }

    try {
      const result = await source.fetch();
      const advisories = result.advisories ?? [];
      const outages = result.outages ?? [];

      await upsertAdvisories(source.name, advisories);

      // Only sources that deal in outages get a sync. An advisory-only source
      // returning no outages must not be read as "every outage is resolved".
      let written = 0;
      if (result.outages !== undefined) {
        if (result.truncated) {
          console.warn(
            `[ingest] ${source.name}: response may be truncated (${outages.length} outages kept); ` +
              "not resolving outages missing from it this run.",
          );
        }
        const synced = await syncOutages(source.name, outages, {
          keepMissing: result.truncated === true,
        });
        written = synced.upserted;
        outagesResolved += synced.resolved;
      }

      reports.push({
        source: source.name,
        ok: true,
        outages: written,
        advisories: advisories.length,
        ...(result.truncated ? { truncated: true } : {}),
      });
    } catch (error) {
      // One bad feed must not stop the rest.
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[ingest] ${source.name} failed:`, message);
      reports.push({
        source: source.name,
        ok: false,
        outages: 0,
        advisories: 0,
        error: message,
      });
    }
  }

  // Sources are already written by now, so a failed prune is logged rather than
  // thrown: it must not turn a successful ingest into a failed run.
  let advisoriesPruned = 0;
  try {
    const [row] = await query<{ removed: number }>(
      "SELECT prune_expired_advisories() AS removed",
    );
    advisoriesPruned = row?.removed ?? 0;
  } catch (error) {
    console.error(
      "[ingest] prune_expired_advisories failed:",
      error instanceof Error ? error.message : error,
    );
  }

  let staleRowsPruned = 0;
  try {
    const [row] = await query<{ removed: number }>("SELECT prune_stale_rows() AS removed");
    staleRowsPruned = row?.removed ?? 0;
  } catch (error) {
    console.error(
      "[ingest] prune_stale_rows failed:",
      error instanceof Error ? error.message : error,
    );
  }

  return {
    ran: new Date().toISOString(),
    sources: reports,
    advisoriesPruned,
    staleRowsPruned,
    outagesResolved,
  };
}

/** Whether ingestion can write at all: it needs a database. */
export function ingestCanWrite(): boolean {
  return isDatabaseConfigured();
}

/** Names of the registered sources, for the status endpoint. */
export function registeredSources() {
  return SOURCES.map((s) => ({
    name: s.name,
    label: s.label,
    configured: s.isConfigured(),
  }));
}
