import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configured: true,
  identityCount: 0,
  query: vi.fn(),
}));

vi.mock("@/lib/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db")>()),
  isDatabaseConfigured: () => mocks.configured,
  query: mocks.query,
}));
// A fresh identity per call, so only the per-address cap can trip in these tests.
vi.mock("@/lib/identity", () => ({
  getIdentity: async () => ({ id: `guest-${++mocks.identityCount}` }),
}));

import { GET } from "@/app/api/geocode/route";
import { LIMITS } from "@/lib/rate-limit";

/** A suggestion request (the path every keystroke takes), from `address`. */
function geocodeRequest(
  address: string | null = "203.0.113.7",
  extra: Record<string, string> = {},
  query = "q=springfield&suggest=1",
) {
  return new NextRequest(`http://localhost/api/geocode?${query}`, {
    headers: { ...(address ? { "x-forwarded-for": address } : {}), ...extra },
  });
}

const allowedRow = [{ allowed: true, remaining: 29, retry_after: 0 }];

/** The bucket keys passed to consume_rate_limit, in call order. */
function bucketKeys(): string[] {
  return mocks.query.mock.calls
    .filter(([sql]) => String(sql).includes("consume_rate_limit"))
    .map(([, params]) => (params as unknown[])[0] as string);
}

/** Only the per-address buckets of the route's own limit. */
function addressKeys(): string[] {
  return bucketKeys().filter((key) => key.startsWith("geocode:addr:"));
}

beforeEach(() => {
  mocks.configured = true;
  mocks.query.mockReset().mockResolvedValue(allowedRow);
  // Photon answers suggestions with a feature list, Nominatim a search with an array.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url: unknown) =>
      String(url).includes("nominatim")
        ? new Response("[]", { status: 200 })
        : new Response('{"features":[]}', { status: 200 }),
    ),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
  // The in-memory counters live on globalThis; start each test from empty.
  delete (globalThis as { __rateBuckets?: unknown }).__rateBuckets;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/geocode per-address cap — shared limiter", () => {
  it("counts the address in Postgres with the geocode limits", async () => {
    const response = await GET(geocodeRequest());

    expect(response.status).toBe(200);
    // The address, then what the whole app may forward upstream.
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("consume_rate_limit"),
      [expect.stringMatching(/^geocode:addr:[0-9a-f]{32}$/), LIMITS.geocode.limit, LIMITS.geocode.windowMs / 1000],
    );
    expect(mocks.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("consume_rate_limit"),
      ["global:geocode:suggest", LIMITS.geocodeSuggestGlobal.limit, LIMITS.geocodeSuggestGlobal.windowMs / 1000],
    );
  });

  it("answers 429 with Retry-After when the shared counter says the address is over its cap", async () => {
    mocks.query.mockResolvedValue([{ allowed: false, remaining: 0, retry_after: 42 }]);

    const response = await GET(geocodeRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(await response.json()).toEqual({
      error: "You are doing that too often. Try again shortly.",
      retryAfter: 42,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("holds across cold starts: the shared count, not process memory, decides", async () => {
    mocks.query.mockResolvedValue([{ allowed: false, remaining: 0, retry_after: 5 }]);
    // A cold start empties the in-process buckets; the cap must still apply.
    delete (globalThis as { __rateBuckets?: unknown }).__rateBuckets;

    expect((await GET(geocodeRequest())).status).toBe(429);
  });

  it("uses a different bucket per address and none when the address is unknown", async () => {
    await GET(geocodeRequest("203.0.113.7"));
    await GET(geocodeRequest("198.51.100.9"));
    expect(new Set(addressKeys()).size).toBe(2);

    mocks.query.mockClear();
    const response = await GET(geocodeRequest(null));
    expect(response.status).toBe(200);
    expect(addressKeys()).toEqual([]);
  });

  it("buckets by cf-connecting-ip and ignores a forged x-forwarded-for beside it", async () => {
    await GET(geocodeRequest("203.0.113.7", { "cf-connecting-ip": "192.0.2.1" }));
    await GET(geocodeRequest("198.51.100.9", { "cf-connecting-ip": "192.0.2.1" }));
    await GET(geocodeRequest("203.0.113.7"));

    const [first, second, xffOnly] = addressKeys();
    expect(first).toBe(second);
    expect(xffOnly).not.toBe(first);
  });
});

describe("GET /api/geocode per-address cap — in-memory fallback", () => {
  it("falls back to the in-memory counter when there is no database", async () => {
    mocks.configured = false;

    for (let i = 0; i < LIMITS.geocode.limit; i++) {
      expect((await GET(geocodeRequest())).status).toBe(200);
    }
    const blocked = await GET(geocodeRequest());

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("falls back to the in-memory counter when the database call fails", async () => {
    mocks.query.mockRejectedValue(new Error("connection refused"));

    for (let i = 0; i < LIMITS.geocode.limit; i++) {
      expect((await GET(geocodeRequest())).status).toBe(200);
    }

    expect((await GET(geocodeRequest())).status).toBe(429);
  });

  it("keeps separate in-memory counts per address", async () => {
    mocks.configured = false;
    for (let i = 0; i < LIMITS.geocode.limit; i++) await GET(geocodeRequest("203.0.113.7"));

    expect((await GET(geocodeRequest("203.0.113.7"))).status).toBe(429);
    expect((await GET(geocodeRequest("198.51.100.9"))).status).toBe(200);
  });
});

describe("GET /api/geocode?suggest=1", () => {
  it("asks Photon, biased to the map, and returns places", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [-77.09, 38.98] },
              properties: {
                osm_type: "N", osm_id: 1, osm_key: "place", osm_value: "city", type: "city",
                name: "Bethesda", state: "Maryland", countrycode: "US",
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/geocode?q=beth&suggest=1&near_lat=38.98&near_lng=-77.1&near_zoom=11",
        { headers: { "x-forwarded-for": "203.0.113.9" } },
      ),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: Array<{ label: string }> };
    expect(body.results.map((r) => r.label)).toEqual(["Bethesda, Maryland"]);

    const called = new URL(String(fetchMock.mock.calls[0][0]));
    expect(called.pathname).toBe("/api/");
    expect(called.searchParams.get("q")).toBe("beth");
    expect(called.searchParams.get("lat")).toBe("38.980");
  });

  it("answers 500 when Photon is down, so the box says search is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("busy", { status: 503 })));

    const response = await GET(
      new NextRequest("http://localhost/api/geocode?q=beth&suggest=1", {
        headers: { "x-forwarded-for": "203.0.113.9" },
      }),
    );

    expect(response.status).toBe(500);
  });
});

describe("GET /api/geocode upstream budgets", () => {
  it("counts an IPv6 caller against its /48 as well, at eight times the limit", async () => {
    await GET(geocodeRequest(null, { "cf-connecting-ip": "2001:db8:aa:1::5" }));

    const address = mocks.query.mock.calls
      .filter(([, params]) => String((params as unknown[])[0]).startsWith("geocode:addr:"))
      .map(([, params]) => (params as unknown[])[1]);
    expect(address).toEqual([LIMITS.geocode.limit, LIMITS.geocode.limit * 8]);
  });

  it("puts a low per-address limit and a global one in front of Nominatim", async () => {
    const response = await GET(geocodeRequest("203.0.113.7", {}, "q=1600+pennsylvania+avenue"));

    expect(response.status).toBe(200);
    expect(bucketKeys().map((key) => key.replace(/:[0-9a-f]{32}$/, ""))).toEqual([
      "geocode:addr",
      "geocode:search:addr",
      "global:geocode:search",
    ]);
  });

  it("answers 429 without calling upstream when the app-wide budget is spent", async () => {
    mocks.query.mockImplementation(async (_sql: unknown, params: unknown[]) =>
      String(params[0]).startsWith("global:")
        ? [{ allowed: false, remaining: 0, retry_after: 30 }]
        : allowedRow,
    );

    const response = await GET(geocodeRequest());

    expect(response.status).toBe(429);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a query no address is long enough to need", async () => {
    const response = await GET(geocodeRequest("203.0.113.7", {}, `q=${"a".repeat(201)}&suggest=1`));

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("answers a reverse lookup from Photon's address fields, not the nearest shop's name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            features: [
              {
                type: "Feature",
                geometry: { type: "Point", coordinates: [-77.1003, 38.9806] },
                properties: {
                  osm_type: "N", osm_id: 9, osm_key: "shop", osm_value: "deli", type: "house",
                  name: "Pescadeli", housenumber: "4960", street: "Bethesda Avenue",
                  city: "Bethesda", state: "Maryland", postcode: "20814", countrycode: "US",
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const response = await GET(geocodeRequest("203.0.113.7", {}, "lat=38.9807&lng=-77.1003"));
    const body = (await response.json()) as { results: Array<{ label: string; state: string; zipCode: string }> };

    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({
      label: "4960 Bethesda Avenue, Bethesda, Maryland",
      state: "Maryland",
      zipCode: "20814",
    });
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("/reverse?");
  });

  it("falls back to Nominatim when Photon has nothing near the point", async () => {
    await GET(geocodeRequest("203.0.113.7", {}, "lat=39.5&lng=-98.35"));

    const hosts = vi.mocked(fetch).mock.calls.map(([url]) => new URL(String(url)).hostname);
    expect(hosts).toEqual(["photon.komoot.io", "nominatim.openstreetmap.org"]);
  });
});
