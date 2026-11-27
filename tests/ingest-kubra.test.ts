import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AREA_MAX_CHARS, KUBRA_UTILITIES, KubraSource, compactArea, decodePoint, resetKubraCache } from "@/lib/ingest/kubra";
import { decodePolyline, encodePolyline, type Position } from "@/lib/polyline";
import { PROVIDER_CATALOG } from "@/lib/data/provider-catalog";

/**
 * Shapes below are trimmed from real responses from kubra.io for Pepco's map
 * (2026-11-26): currentState, the map configuration, and the ZIP area file.
 */

const fetchMock = vi.fn();

const INTERVAL = "data/61ab0e92-1379-40d5-a2e7-23384c109d4d";
const DEPLOYMENT = "10d11a57-e008-4ee2-b955-1ec016367f86";

const currentState = {
  stormcenterDeploymentId: DEPLOYMENT,
  data: { interval_generation_data: INTERVAL },
};

const configuration = {
  config: {
    layers: {
      data: {
        interval_generation_data: [
          { id: "cluster-1", type: "CLUSTER_LAYER_V2", source: ["public/cluster-1/{q}.json"] },
          { id: "thematic-2", type: "THEMATIC_LAYER_V2", areaType: "county", source: ["public/thematic-2/thematic_areas.json"] },
          { id: "thematic-3", type: "THEMATIC_LAYER_V2", areaType: "zip", source: ["public/thematic-3/thematic_areas.json"] },
        ],
      },
    },
    summary: { data: { interval_generation_data: { source: "public/summary-1/data.json" } } },
  },
};

function area(name: string, custA: { val: number; mask?: number }, extra: Record<string, unknown> = {}) {
  return {
    id: `PEPC|${name}|zip`,
    title: name,
    desc: { name, n_out: 3, cust_s: 9000, cust_a: custA, etr: "ETR-NULL", start_time: "2026-11-26T11:10:37Z", ...extra },
    // Silver Spring, as the map encodes it.
    geom: { p: ["sbbmFv}euM"] },
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

/** Answers by URL, so a test states the map's files rather than a call order. */
function serve(files: Record<string, () => Response>) {
  fetchMock.mockImplementation(async (url: string) => {
    const match = Object.keys(files).find((key) => String(url).includes(key));
    return match ? files[match]() : new Response("<Error/>", { status: 404 });
  });
}

const pepco = KUBRA_UTILITIES.find((u) => u.slug === "pepco")!;

beforeEach(() => {
  fetchMock.mockReset();
  resetKubraCache();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("decodePoint", () => {
  it("decodes the first point of an encoded polyline", () => {
    const point = decodePoint("sbbmFv}euM")!;
    expect(point.lat).toBeCloseTo(39.00986, 5);
    expect(point.lng).toBeCloseTo(-77.04044, 5);
  });

  it("returns null for something that is not a polyline", () => {
    expect(decodePoint("")).toBeNull();
    expect(decodePoint("s")).toBeNull();
  });
});

describe("KubraSource", () => {
  it("reads the finest area layer and turns each area into an outage", async () => {
    serve({
      "/currentState": () => json(currentState),
      "/configuration/": () => json(configuration),
      "thematic-3/thematic_areas.json": () =>
        json({
          file_data: [
            area("20817", { val: 1240 }, { etr: "2026-11-27T03:00:00Z" }),
            area("20001", { val: 60 }),
            area("20849,20850", { val: 243 }),
          ],
        }),
    });

    const { outages = [], truncated } = await new KubraSource(pepco).fetch();
    expect(truncated).toBeUndefined();

    // ZIP was chosen over county.
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((u) => u.endsWith(`${INTERVAL}/public/thematic-3/thematic_areas.json`))).toBe(true);
    expect(urls.some((u) => u.includes("thematic-2"))).toBe(false);

    expect(outages).toHaveLength(3);
    expect(outages[0]).toMatchObject({
      sourceId: "PEPC|20817|zip",
      providerSlug: "pepco",
      utilityName: "Pepco",
      customersAffected: 1240,
      serviceType: "power",
      severity: "complete",
      city: "ZIP 20817",
      state: "Maryland",
      reportedAt: "2026-11-26T11:10:37.000Z",
      estimatedRestoration: "2026-11-27T03:00:00.000Z",
      active: true,
    });
    expect(outages[0].latitude).toBeCloseTo(39.00986, 4);
    expect(outages[0].description).toContain("1,240 customers without power across 3 outages");

    // DC ZIP codes are told apart from Maryland ones; "ETR-NULL" is no estimate.
    expect(outages[1]).toMatchObject({ state: "District of Columbia", estimatedRestoration: null });
    expect(outages[2].city).toBe("ZIP 20849, 20850");
  });

  it("drops masked counts and areas under the threshold", async () => {
    serve({
      "/currentState": () => json(currentState),
      "/configuration/": () => json(configuration),
      "thematic-3/": () =>
        json({
          file_data: [
            // "Fewer than 10": val is a placeholder, not a count, even when
            // it is over the threshold.
            area("20737", { val: 9, mask: 10 }),
            area("20706", { val: 4 }),
            area("20707", { val: 5 }),
          ],
        }),
    });

    const { outages = [] } = await new KubraSource(pepco).fetch();
    expect(outages.map((o) => o.sourceId)).toEqual(["PEPC|20707|zip"]);
  });

  it("skips the configuration request while the map has not been redeployed", async () => {
    serve({
      "/currentState": () => json(currentState),
      "/configuration/": () => json(configuration),
      "thematic-3/": () => json({ file_data: [] }),
    });

    const source = new KubraSource(pepco);
    await source.fetch();
    await source.fetch();

    const configCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/configuration/"));
    expect(configCalls).toHaveLength(1);
  });

  it("treats a missing area file as nothing out only when the summary agrees", async () => {
    serve({
      "/currentState": () => json(currentState),
      "/configuration/": () => json(configuration),
      "summary-1/data.json": () =>
        json({ summaryFileData: { totals: [{ total_cust_a: { val: 0 } }] } }),
    });
    expect((await new KubraSource(pepco).fetch()).outages).toEqual([]);

    // Same 404, but the summary still counts customers out: that is a broken
    // read, and an empty snapshot would resolve every Pepco outage.
    resetKubraCache();
    serve({
      "/currentState": () => json(currentState),
      "/configuration/": () => json(configuration),
      "summary-1/data.json": () =>
        json({ summaryFileData: { totals: [{ total_cust_a: { val: 812 } }] } }),
    });
    await expect(new KubraSource(pepco).fetch()).rejects.toThrow(/no usable data/);
  });

  it("does not read a two-company map as empty while one company still has customers out", async () => {
    // Ameren's map has one total for Missouri and one for Illinois.
    serve({
      "/currentState": () => json(currentState),
      "/configuration/": () => json(configuration),
      "summary-1/data.json": () =>
        json({
          summaryFileData: {
            totals: [{ total_cust_a: { val: 0 } }, { total_cust_a: { val: 79273 } }],
          },
        }),
    });
    await expect(new KubraSource(pepco).fetch()).rejects.toThrow(/no usable data/);
  });

  it("takes the state of a multi-state map's area from the map's own label", async () => {
    const delmarva = KUBRA_UTILITIES.find((u) => u.slug === "delmarva")!;
    serve({
      "/currentState": () => json(currentState),
      "/configuration/": () => json(configuration),
      "thematic-3/thematic_areas.json": () =>
        json({
          file_data: [
            area("19901", { val: 400 }, { hierarchy: { state: "DE" } }),
            area("21804", { val: 300 }, { hierarchy: { state: "Maryland" } }),
            area("99999", { val: 200 }),
          ],
        }),
    });

    const { outages = [] } = await new KubraSource(delmarva).fetch();
    expect(outages.map((o) => o.state)).toEqual(["Delaware", "Maryland", null]);
  });

  it("places Dominion's areas by the region in their id", async () => {
    const dominion = KUBRA_UTILITIES.find((u) => u.slug === "dominion")!;
    const county = (region: string, name: string) => ({
      ...area(name, { val: 500 }),
      id: `BOUN|${region}|${name}|county`,
    });
    serve({
      "/currentState": () => json(currentState),
      "/configuration/": () => json(configuration),
      "thematic-3/thematic_areas.json": () =>
        json({
          file_data: [county("Northern Virginia", "Fairfax"), county("North Carolina", "Dare")],
        }),
    });

    const { outages = [] } = await new KubraSource(dominion).fetch();
    expect(outages.map((o) => o.state)).toEqual(["Virginia", "North Carolina"]);
  });

  it("keeps each area's outline and customer total for drawing it", async () => {
    // A ZIP-sized square with a needless point on every side.
    const square: Position[] = [
      [-77.15, 38.99], [-77.125, 38.99], [-77.1, 38.99], [-77.1, 39.005], [-77.1, 39.02],
      [-77.125, 39.02], [-77.15, 39.02], [-77.15, 39.005], [-77.15, 38.99],
    ];
    serve({
      "/currentState": () => json(currentState),
      "/configuration/": () => json(configuration),
      "thematic-3/thematic_areas.json": () =>
        json({
          file_data: [
            {
              ...area("20817", { val: 2234 }, { cust_s: 25590 }),
              geom: { p: ["sbbmFv}euM"], a: [encodePolyline(square)] },
            },
            // A total below the count out is a feed error: no total is kept.
            area("20001", { val: 60 }, { cust_s: 10 }),
          ],
        }),
    });

    const { outages = [] } = await new KubraSource(pepco).fetch();
    expect(outages[0].customersServed).toBe(25590);
    expect(outages[0].area).toHaveLength(1);
    // Simplified to the corners on the way in.
    expect(decodePolyline(outages[0].area![0])).toEqual([
      [-77.15, 38.99], [-77.1, 38.99], [-77.1, 39.02], [-77.15, 39.02], [-77.15, 38.99],
    ]);
    expect(outages[1]).toMatchObject({ customersServed: null, area: null });
  });

  it("leaves out an outline that is still too large after trimming", () => {
    // A star with 8,000 spikes: every point is real detail, so no tolerance
    // used here removes enough of it.
    const star: Position[] = [];
    for (let i = 0; i < 8000; i++) {
      const angle = (i / 8000) * 2 * Math.PI;
      const r = i % 2 ? 0.5 : 0.45;
      star.push([-77 + r * Math.cos(angle), 39 + r * Math.sin(angle)]);
    }
    star.push(star[0]);
    expect(encodePolyline(star).length).toBeGreaterThan(AREA_MAX_CHARS);
    expect(compactArea([encodePolyline(star)])).toBeNull();
    expect(compactArea(undefined)).toBeNull();
    expect(compactArea(["not a polyline!"])).toBeNull();
  });

  it("fails rather than follow a data path that is not the usual shape", async () => {
    serve({
      "/currentState": () =>
        json({ stormcenterDeploymentId: DEPLOYMENT, data: { interval_generation_data: "../../etc/passwd" } }),
    });
    await expect(new KubraSource(pepco).fetch()).rejects.toThrow(/without a data path/);
  });

  it("is off until the deployment opts in", () => {
    vi.stubEnv("KUBRA_INGEST", "");
    expect(new KubraSource(pepco).isConfigured()).toBe(false);
    vi.stubEnv("KUBRA_INGEST", "on");
    expect(new KubraSource(pepco).isConfigured()).toBe(true);
  });
});

describe("the utility list", () => {
  it("names a provider in the catalog for every map, once", () => {
    const power = new Set(
      PROVIDER_CATALOG.filter((p) => p.serviceType === "power").map((p) => p.slug),
    );
    for (const utility of KUBRA_UTILITIES) {
      expect(power.has(utility.slug), utility.slug).toBe(true);
    }
    expect(new Set(KUBRA_UTILITIES.map((u) => u.slug)).size).toBe(KUBRA_UTILITIES.length);
    expect(new Set(KUBRA_UTILITIES.map((u) => u.viewId)).size).toBe(KUBRA_UTILITIES.length);
  });
});
