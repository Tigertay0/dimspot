import { SERVICE_TYPES, SEVERITIES } from "@/lib/types";
import type { IngestedOutage } from "./source";

/**
 * The last check on a feed row before it is written.
 *
 * A source's whole snapshot goes to the database in one statement, and the map
 * reads every stored row on every request. So one row a feed got wrong is not
 * one bad pin: a state name past the column's width aborted the snapshot, and
 * a customer count past the integer range made every map request that
 * included the row fail. The adapters parse; this bounds, for all of them.
 * Rows that cannot be placed or keyed are dropped, the rest are clamped.
 */
const MAX_CUSTOMERS = 50_000_000;

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const time = new Date(value).getTime();
  // Feeds have sent year 0 and year 9999; neither is a start time.
  if (!Number.isFinite(time) || time < Date.UTC(2000, 0, 1) || time > Date.now() + 366 * 86_400_000) {
    return null;
  }
  return new Date(time).toISOString();
}

/** Encoded polylines use only these characters. */
const POLYLINE = /^[\x3f-\x7e]+$/;
const MAX_AREA_RINGS = 40;
const MAX_AREA_CHARS = 32_000;

/** An outline is stored only when it is well formed and small. */
function area(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_AREA_RINGS) return null;
  let chars = 0;
  for (const ring of value) {
    if (typeof ring !== "string" || !POLYLINE.test(ring)) return null;
    chars += ring.length;
  }
  return chars <= MAX_AREA_CHARS ? (value as string[]) : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(MAX_CUSTOMERS, Math.max(0, Math.round(value)))
    : null;
}

export function sanitizeFeedRow(row: IngestedOutage): IngestedOutage | null {
  if (typeof row.sourceId !== "string" || !row.sourceId || row.sourceId.length > 200) return null;
  if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) return null;
  if (Math.abs(row.latitude) > 90 || Math.abs(row.longitude) > 180) return null;
  if (!SERVICE_TYPES.includes(row.serviceType) || !SEVERITIES.includes(row.severity)) return null;

  return {
    ...row,
    customersAffected: count(row.customersAffected),
    // Optional: a source that never sends them gets rows without them.
    ...(row.customersServed !== undefined ? { customersServed: count(row.customersServed) } : {}),
    ...(row.area !== undefined ? { area: area(row.area) } : {}),
    city: text(row.city, 100),
    state: text(row.state, 50),
    description: text(row.description, 2000),
    utilityName: text(row.utilityName, 100),
    reportedAt: timestamp(row.reportedAt),
    estimatedRestoration: timestamp(row.estimatedRestoration),
  };
}
