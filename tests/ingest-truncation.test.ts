import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IngestedOutage, SourceResult } from "@/lib/ingest/source";

/**
 * Feed results per source, and a tiny in-memory `outages` table whose
 * sync_official_outages mirrors db/migrations/0002_app.sql: upsert every row
 * passed, resolve every active row of that source that was not passed.
 */
const mocks = vi.hoisted(() => ({
  results: {} as Record<string, () => Promise<SourceResult>>,
  outages: [] as Array<Record<string, unknown>>,
  query: vi.fn(),
  failActiveRead: false,
}));

function fakeSource(name: string) {
  return class {
    readonly name = name;
    readonly label = name;
    isConfigured() {
      return name in mocks.results;
    }
    fetch() {
      return mocks.results[name]();
    }
  };
}

vi.mock("@/lib/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db")>()),
  isDatabaseConfigured: () => true,
  query: mocks.query,
}));
vi.mock("@/lib/ingest/nws", () => ({ NwsSource: fakeSource("nws") }));
vi.mock("@/lib/ingest/odin", () => ({ OdinSource: fakeSource("odin") }));
vi.mock("@/lib/ingest/ioda", () => ({ IodaSource: fakeSource("ioda") }));
vi.mock("@/lib/ingest/cloudflare-radar", () => ({ CloudflareRadarSource: fakeSource("cloudflare-radar") }));

import { runIngest } from "@/lib/ingest/run";

/** sync_official_outages over the in-memory table. */
function syncOfficialOutages(source: string, rows: Array<Record<string, unknown>>) {
  for (const row of rows) {
    const existing = mocks.outages.find((o) => o.source_name === source && o.source_id === row.source_id);
    if (existing) Object.assign(existing, row, { status: "active" });
    else mocks.outages.push({ ...row, source_name: source, status: "active" });
  }
  const passed = new Set(rows.map((r) => r.source_id));
  let resolved = 0;
  for (const o of mocks.outages) {
    if (o.source_name === source && o.status === "active" && !passed.has(o.source_id)) {
      o.status = "resolved";
      resolved++;
    }
  }
  return [{ upserted: rows.length, resolved }];
}

/** Routes each statement runIngest sends to the matching fake. */
async function fakeQuery(sql: string, params: unknown[] = []) {
  if (sql.includes("sync_official_outages")) {
    return syncOfficialOutages(params[0] as string, JSON.parse(params[1] as string));
  }
  if (sql.includes("prune_expired_advisories")) return [{ removed: 0 }];
  if (sql.includes("INSERT INTO advisories")) return [];
  if (sql.includes("FROM outages")) {
    if (mocks.failActiveRead) throw new Error("connection reset");
    return mocks.outages.filter((o) => o.source_name === params[0] && o.status === "active");
  }
  throw new Error(`unexpected query: ${sql.slice(0, 60)}`);
}

function stored(source: string, id: string, extra: Record<string, unknown> = {}) {
  return {
    source_name: source,
    source_id: id,
    status: "active",
    service_type: "internet",
    severity: "degraded",
    latitude: 35.4,
    longitude: -97.5,
    city: null,
    state: "Oklahoma",
    description: `stored ${id}`,
    estimated_restoration: null,
    reported_at: "2026-10-12T00:00:00.000Z",
    metadata: { utility_name: null, customers_affected: null, start_known: true },
    ...extra,
  };
}

function ingested(id: string): IngestedOutage {
  return {
    sourceId: id,
    providerSlug: null,
    utilityName: null,
    customersAffected: null,
    reportedAt: "2026-10-13T00:00:00.000Z",
    serviceType: "internet",
    severity: "complete",
    latitude: 30,
    longitude: -90,
    description: `fresh ${id}`,
    city: null,
    state: "Louisiana",
    estimatedRestoration: null,
    active: true,
  };
}

function statusOf(source: string, id: string) {
  return mocks.outages.find((o) => o.source_name === source && o.source_id === id)?.status;
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.results = {};
  mocks.outages = [];
  mocks.failActiveRead = false;
  mocks.query.mockReset().mockImplementation(fakeQuery);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runIngest official-outage sync", () => {
  it.each(["ioda", "cloudflare-radar"])("resolves %s outages missing from a complete response, as before", async (source) => {
    mocks.outages = [stored(source, "a"), stored(source, "b")];
    mocks.results[source] = async () => ({ outages: [ingested("a")], truncated: false });

    const report = await runIngest();

    expect(statusOf(source, "a")).toBe("active");
    expect(statusOf(source, "b")).toBe("resolved");
    expect(report.outagesResolved).toBe(1);
    expect(report.sources.find((s) => s.source === source)).toEqual({
      source,
      ok: true,
      outages: 1,
      advisories: 0,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(["ioda", "cloudflare-radar"])(
    "keeps %s outages missing from a truncated response open, still upserting what came back",
    async (source) => {
      const untouched = stored(source, "b", { severity: "complete", description: "keep me as I am" });
      mocks.outages = [stored(source, "a"), { ...untouched }];
      mocks.results[source] = async () => ({ outages: [ingested("a"), ingested("c")], truncated: true });

      const report = await runIngest();

      expect(statusOf(source, "b")).toBe("active");
      expect(mocks.outages.find((o) => o.source_id === "b")).toMatchObject(untouched);
      expect(mocks.outages.find((o) => o.source_id === "a")?.description).toBe("fresh a");
      expect(statusOf(source, "c")).toBe("active");
      expect(report.outagesResolved).toBe(0);
      expect(report.sources.find((s) => s.source === source)).toEqual({
        source,
        ok: true,
        outages: 2,
        advisories: 0,
        truncated: true,
      });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(`${source}: response may be truncated`));
    },
  );

  it("only skips resolving for the source that was truncated", async () => {
    mocks.outages = [stored("ioda", "gone"), stored("cloudflare-radar", "hidden")];
    mocks.results.ioda = async () => ({ outages: [], truncated: false });
    mocks.results["cloudflare-radar"] = async () => ({ outages: [], truncated: true });

    await runIngest();

    expect(statusOf("ioda", "gone")).toBe("resolved");
    expect(statusOf("cloudflare-radar", "hidden")).toBe("active");
  });

  it("writes nothing for a truncated source when its open outages can't all be read", async () => {
    mocks.outages = [stored("ioda", "b")];
    mocks.failActiveRead = true;
    mocks.results.ioda = async () => ({ outages: [ingested("a")], truncated: true });

    const report = await runIngest();

    expect(mocks.query).not.toHaveBeenCalledWith(expect.stringContaining("sync_official_outages"), expect.anything());
    expect(statusOf("ioda", "b")).toBe("active");
    expect(report.sources.find((s) => s.source === "ioda")?.ok).toBe(false);
  });
});
