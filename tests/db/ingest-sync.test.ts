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
// No utility maps: the real ones would be fetched and written to this database.
vi.mock("@/lib/ingest/kubra", () => ({ KUBRA_UTILITIES: [], KubraSource: class {} }));

import { query } from "@/lib/db";
import { runIngest } from "@/lib/ingest/run";
import { asOwner } from "./helpers";

const SOURCE = feeds.names.ioda;

function feedOutage(
  id: string,
  description = `outage ${id}`,
  providerSlug: string | null = null,
): IngestedOutage {
  return {
    sourceId: id,
    providerSlug,
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

  it("links a feed row to the provider its slug names, and keeps the link through a truncated run", async () => {
    const provider = async (id: string) => {
      const [row] = await query<{ slug: string | null }>(
        `SELECT p.slug FROM outages o LEFT JOIN providers p ON p.id = o.provider_id
         WHERE o.source_name = $1 AND o.source_id = $2`,
        [SOURCE, id],
      );
      return row?.slug ?? null;
    };

    feeds.results[SOURCE] = async () => ({
      outages: [
        feedOutage("linked", "pepco row", "pepco"),
        feedOutage("unknown", "no such provider", "not-a-provider"),
        feedOutage("plain"),
      ],
      truncated: false,
    });
    await runIngest();
    expect(await provider("linked")).toBe("pepco");
    // A slug that matches nothing is not an error: the row is written unlinked.
    expect(await provider("unknown")).toBeNull();
    expect(await provider("plain")).toBeNull();

    // The catalog's name wins over the feed's spelling, and the provider
    // filter now finds the official row.
    const named = await query<{ provider_slug: string; provider_name: string }>(
      `SELECT provider_slug, provider_name FROM search_outages(provider_slugs => ARRAY['pepco'])
       WHERE source_name = $1`,
      [SOURCE],
    );
    expect(named).toEqual([{ provider_slug: "pepco", provider_name: "Pepco" }]);

    // Truncated page that does not include "linked": it is carried, link intact.
    feeds.results[SOURCE] = async () => ({ outages: [feedOutage("plain")], truncated: true });
    await runIngest();
    expect(await provider("linked")).toBe("pepco");
    expect((await statuses()).linked).toBe("active");
  });

  it("returns a network-wide outage to every viewport, and a placed one only to its own", async () => {
    feeds.results[SOURCE] = async () => ({
      outages: [
        // Nominal point in Kansas; Oklahoma for the placed row.
        { ...feedOutage("network"), latitude: 39.8283, longitude: -98.5795, scope: "national" as const },
        feedOutage("placed"),
      ],
      truncated: false,
    });
    await runIngest();

    // A viewport over Washington, DC: neither row's point is inside it.
    const dc = await query<{ source_id: string; scope: string | null }>(
      `SELECT o.source_id, s.scope
       FROM search_outages(min_lat => 38.7, min_lng => -77.3, max_lat => 39.1, max_lng => -76.8) s
       JOIN outages o ON o.id = s.id
       WHERE o.source_name = $1`,
      [SOURCE],
    );
    expect(dc).toEqual([{ source_id: "network", scope: "national" }]);

    // The service-type filter still applies to it.
    const power = await query<{ id: string }>(
      `SELECT s.id FROM search_outages(service_types => ARRAY['power']) s
       JOIN outages o ON o.id = s.id WHERE o.source_name = $1`,
      [SOURCE],
    );
    expect(power).toEqual([]);

    // Through the repository, as the API reads it.
    const { getRepository } = await import("@/lib/data");
    const listed = await getRepository().listOutages({
      bounds: { minLat: 38.7, minLng: -77.3, maxLat: 39.1, maxLng: -76.8 },
    });
    const mine = listed.filter((o) => o.sourceName === SOURCE);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ scope: "national", serviceType: "internet" });
  });
});
