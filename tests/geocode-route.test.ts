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

function geocodeRequest(address: string | null = "203.0.113.7", extra: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/geocode?q=springfield", {
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

beforeEach(() => {
  mocks.configured = true;
  mocks.query.mockReset().mockResolvedValue(allowedRow);
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response("[]", { status: 200 })));
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
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("consume_rate_limit"),
      [expect.stringMatching(/^geocode:addr:[0-9a-f]{32}$/), LIMITS.geocode.limit, LIMITS.geocode.windowMs / 1000],
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
    expect(new Set(bucketKeys()).size).toBe(2);

    mocks.query.mockClear();
    const response = await GET(geocodeRequest(null));
    expect(response.status).toBe(200);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("buckets by cf-connecting-ip and ignores a forged x-forwarded-for beside it", async () => {
    await GET(geocodeRequest("203.0.113.7", { "cf-connecting-ip": "192.0.2.1" }));
    await GET(geocodeRequest("198.51.100.9", { "cf-connecting-ip": "192.0.2.1" }));
    await GET(geocodeRequest("203.0.113.7"));

    const [first, second, xffOnly] = bucketKeys();
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
