import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { IngestedOutage, SourceResult } from "@/lib/ingest/source";

/**
 * runIngest against the real sync_official_outages and the real query for a
 * source's open outages — the truncation guard from PR #22, end to end. The
 * feeds are fakes with names no real source uses, so the live rows on the dev
 * branch are never touched.
 */

const feeds = vi.hoisted(() => {
  const tag = Math.random().toString(36).slice(2, 8);
  return {
    names: {
      nws: `test-nws-${tag}`,
      odin: `test-odin-${tag}`,
      ioda: `test-ioda-${tag}`,
      radar: `test-radar-${tag}`,
    },
    results: {} as Record<string, () => Promise<SourceResult>>,
  };
});

function fakeSource(name: string) {
  return class {
    readonly name = name;
    readonly label = name;
    isConfigured() {
      return name in feeds.results;
    }
    fetch() {
      return feeds.results[name]!();
    }
  };
}

vi.mock("@/lib/ingest/nws", () => ({ NwsSource: fakeSource(feeds.names.nws) }));
vi.mock("@/lib/ingest/odin", () => ({ OdinSource: fakeSource(feeds.names.odin) }));
vi.mock("@/lib/ingest/ioda", () => ({ IodaSource: fakeSource(feeds.names.ioda) }));
vi.mock("@/lib/ingest/cloudflare-radar", () => ({ CloudflareRadarSource: fakeSource(feeds.names.radar) }));

import { query } from "@/lib/db";
import { runIngest } from "@/lib/ingest/run";
import { asOwner } from "./helpers";

const SOURCE = feeds.names.ioda;

function feedOutage(id: string, description = `outage ${id}`): IngestedOutage {
  return {
    sourceId: id,
    providerSlug: null,
    utilityName: "Test Utility",
    customersAffected: 120,
    reportedAt: "2026-10-30T12:00:00.000Z",
    serviceType: "internet",
    severity: "degraded",
    latitude: 35.4,
    longitude: -97.5,
    description,
    city: null,
    state: "Oklahoma",
    estimatedRestoration: null,
    active: true,
  };
}

async function statuses(): Promise<Record<string, string>> {
  const rows = await query<{ source_id: string; status: string }>(
    "SELECT source_id, status FROM outages WHERE source_name = $1",
    [SOURCE],
  );
  return Object.fromEntries(rows.map((r) => [r.source_id, r.status]));
}

beforeEach(() => {
  feeds.results = {};
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterAll(async () => {
  await asOwner((client) =>
    client.query("DELETE FROM outages WHERE source_name = ANY($1)", [Object.values(feeds.names)]),
  );
});

describe("runIngest against Postgres", () => {
  it("resolves what a complete feed stops reporting, and keeps it open when the page was truncated", async () => {
    feeds.results[SOURCE] = async () => ({ outages: [feedOutage("a"), feedOutage("b")], truncated: false });
    await runIngest();
    expect(await statuses()).toEqual({ a: "active", b: "active" });

    // Truncated page without "b": nothing is resolved, "a" is updated, "c" added.
    feeds.results[SOURCE] = async () => ({
      outages: [feedOutage("a", "updated a"), feedOutage("c")],
      truncated: true,
    });
    const truncated = await runIngest();
    expect(await statuses()).toEqual({ a: "active", b: "active", c: "active" });
    expect(truncated.sources.find((s) => s.source === SOURCE)).toMatchObject({ ok: true, truncated: true, outages: 2 });

    // The carried row went back through the sync unchanged.
    const [b] = await query<{ description: string; latitude: number; customers: number }>(
      `SELECT description, ST_Y(location::geometry) AS latitude,
              (metadata->>'customers_affected')::int AS customers
       FROM outages WHERE source_name = $1 AND source_id = 'b'`,
      [SOURCE],
    );
    expect(b).toEqual({ description: "outage b", latitude: 35.4, customers: 120 });

    // A complete page without "b" and "c" resolves them.
    feeds.results[SOURCE] = async () => ({ outages: [feedOutage("a")], truncated: false });
    const complete = await runIngest();
    expect(await statuses()).toEqual({ a: "active", b: "resolved", c: "resolved" });
    expect(complete.outagesResolved).toBeGreaterThanOrEqual(2);
  });
});
