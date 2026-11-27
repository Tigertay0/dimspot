import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RadarAnomalySource, knownNetwork } from "@/lib/ingest/radar-anomalies";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("CLOUDFLARE_RADAR_TOKEN", "test-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

/** A row as the API documents it (cloudflare SDK, TrafficAnomalyGetResponse). */
function anomaly(overrides: Record<string, unknown> = {}) {
  return {
    uuid: "55a57f33-8bc0-4984-b4df-fdaff72df39d",
    type: "AS",
    status: "VERIFIED",
    startDate: hoursAgo(1),
    endDate: null,
    asnDetails: { asn: "21928", name: "T-MOBILE-AS21928", location: { code: "US", name: "United States" } },
    locationDetails: null,
    originDetails: null,
    visibleInDataSources: ["HTTP", "NET"],
    ...overrides,
  };
}

function respond(trafficAnomalies: unknown[]) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ success: true, result: { trafficAnomalies } }), { status: 200 }),
  );
}

describe("knownNetwork", () => {
  it("files a carrier's mobile network under cellular and its wireline one under internet", () => {
    expect(knownNetwork(21928, null)).toMatchObject({ slug: "tmobile", serviceType: "cellular" });
    expect(knownNetwork(20057, null)).toMatchObject({ slug: "att", serviceType: "cellular" });
    expect(knownNetwork(7018, null)).toMatchObject({ slug: "att-internet", serviceType: "internet" });
    expect(knownNetwork(701, null)).toMatchObject({ slug: "fios", serviceType: "internet" });
  });

  it("recognises a regional AS of a cable company by name", () => {
    expect(knownNetwork(33651, "COMCAST-33651")).toMatchObject({ slug: "xfinity" });
    expect(knownNetwork(11427, "TWC-11427-TEXAS")).toMatchObject({ slug: "spectrum" });
  });

  it("returns null for a network it does not know", () => {
    expect(knownNetwork(64512, "EXAMPLE-NET")).toBeNull();
    // An inherited property name is not an AS number.
    expect(knownNetwork(Number("constructor"), null)).toBeNull();
  });
});

describe("RadarAnomalySource", () => {
  it("asks for US anomalies with the token", async () => {
    respond([]);
    await new RadarAnomalySource().fetch();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/radar/traffic_anomalies?location=US");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer test-token" });
  });

  it("turns an open carrier anomaly into a network-wide cellular outage", async () => {
    respond([anomaly()]);
    const { outages = [] } = await new RadarAnomalySource().fetch();

    expect(outages).toHaveLength(1);
    expect(outages[0]).toMatchObject({
      sourceId: "55a57f33-8bc0-4984-b4df-fdaff72df39d",
      providerSlug: "tmobile",
      utilityName: "T-Mobile",
      serviceType: "cellular",
      severity: "degraded",
      scope: "national",
      state: null,
      active: true,
    });
    expect(outages[0].description).toContain("T-Mobile (AS21928)");
    expect(outages[0].description).toContain("not always an outage");
  });

  it("reports an unknown network under its registered name, as internet and unverified", async () => {
    respond([
      anomaly({
        uuid: "u-2",
        status: "UNVERIFIED",
        asnDetails: { asn: "64512", name: "EXAMPLE-FIBER-NET", location: { code: "US", name: "United States" } },
      }),
    ]);
    const { outages = [] } = await new RadarAnomalySource().fetch();
    expect(outages[0]).toMatchObject({
      providerSlug: null,
      utilityName: "Example Fiber Net",
      serviceType: "internet",
      severity: "intermittent",
    });
    expect(outages[0].description).toContain("not been verified");
  });

  it("leaves out closed, stale, foreign and cloud-provider anomalies", async () => {
    respond([
      anomaly({ uuid: "closed", endDate: hoursAgo(0.5) }),
      anomaly({ uuid: "stale-unverified", status: "UNVERIFIED", startDate: hoursAgo(13) }),
      anomaly({ uuid: "stale-verified", startDate: hoursAgo(80) }),
      anomaly({ uuid: "foreign", asnDetails: { asn: "3320", name: "DTAG", location: { code: "DE", name: "Germany" } } }),
      anomaly({ uuid: "origin", type: "ORIGIN", asnDetails: null }),
      anomaly({ uuid: "kept-verified", startDate: hoursAgo(30) }),
    ]);
    const { outages = [] } = await new RadarAnomalySource().fetch();
    expect(outages.map((o) => o.sourceId)).toEqual(["kept-verified"]);
  });

  it("flags a full page as truncated, and refuses a response with no list", async () => {
    respond(Array.from({ length: 200 }, (_, i) => anomaly({ uuid: `u-${i}` })));
    expect((await new RadarAnomalySource().fetch()).truncated).toBe(true);

    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true, result: {} }), { status: 200 }));
    await expect(new RadarAnomalySource().fetch()).rejects.toThrow(/unexpected response shape/);
  });

  it("is skipped without a token", () => {
    vi.stubEnv("CLOUDFLARE_RADAR_TOKEN", "");
    expect(new RadarAnomalySource().isConfigured()).toBe(false);
  });
});
