import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ configured: true, query: vi.fn() }));

vi.mock("@/lib/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db")>()),
  isDatabaseConfigured: () => mocks.configured,
  query: mocks.query,
}));

import { MAX_JSON_BYTES, RequestTooLargeError, readJson, serverError } from "@/lib/api";
import { addressBuckets, voteNetwork } from "@/lib/client-address";
import type { Identity } from "@/lib/identity";
import { LIMITS } from "@/lib/rate-limit";
import { isCrossSite, limitWrite, rejectCrossSite } from "@/lib/request-guard";

const allowed = [{ allowed: true, remaining: 4, retry_after: 0 }];
const denied = [{ allowed: false, remaining: 0, retry_after: 77 }];

function headers(values: Record<string, string>) {
  return new Headers({ host: "dimspot.example", ...values });
}

function post(values: Record<string, string> = {}, body: BodyInit | null = "{}") {
  return new Request("https://dimspot.example/api/outages", {
    method: "POST",
    headers: { host: "dimspot.example", "cf-connecting-ip": "203.0.113.7", ...values },
    body,
  });
}

const guest: Identity = {
  id: "11111111-1111-4111-8111-111111111111",
  isAuthenticated: true,
  isAnonymous: true,
  email: null,
  canWrite: true,
  writeBlockedReason: null,
};

const limits = { identity: LIMITS.createOutage, address: LIMITS.createOutageByAddress };

function bucketKeys(): string[] {
  return mocks.query.mock.calls.map(([, params]) => String((params as unknown[])[0]));
}

beforeEach(() => {
  mocks.configured = true;
  mocks.query.mockReset().mockResolvedValue(allowed);
  vi.spyOn(console, "error").mockImplementation(() => {});
  delete (globalThis as { __rateBuckets?: unknown }).__rateBuckets;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isCrossSite", () => {
  it("trusts the browser's own verdict when it gives one", () => {
    expect(isCrossSite(headers({ "sec-fetch-site": "same-origin" }))).toBe(false);
    expect(isCrossSite(headers({ "sec-fetch-site": "none" }))).toBe(false);
    expect(isCrossSite(headers({ "sec-fetch-site": "cross-site", origin: "https://dimspot.example" }))).toBe(true);
  });

  it("falls back to Origin for browsers that do not send Sec-Fetch-Site", () => {
    expect(isCrossSite(headers({ origin: "https://dimspot.example" }))).toBe(false);
    expect(isCrossSite(headers({ origin: "https://evil.example" }))).toBe(true);
    expect(isCrossSite(headers({ origin: "null" }))).toBe(true);
  });

  it("accepts the configured public and extra origins", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://dimspot.adetayo.dev");
    vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "https://old.workers.dev, https://other.example/");

    expect(isCrossSite(headers({ origin: "https://dimspot.adetayo.dev" }))).toBe(false);
    expect(isCrossSite(headers({ origin: "https://other.example" }))).toBe(false);
  });

  it("leaves a client that is not a browser to the rate limits", () => {
    expect(isCrossSite(headers({}))).toBe(false);
  });

  it("answers another site's write with 403", async () => {
    const response = rejectCrossSite(post({ "sec-fetch-site": "cross-site" }));

    expect(response?.status).toBe(403);
    expect(rejectCrossSite(post({ "sec-fetch-site": "same-origin" }))).toBeNull();
  });
});

describe("limitWrite", () => {
  it("counts the address before the identity", async () => {
    expect(await limitWrite(post(), guest, "outage:create", limits)).toBeNull();

    expect(bucketKeys().map((key) => key.replace(/[0-9a-f]{32}$/, "#"))).toEqual([
      "outage:create:addr:#",
      `outage:create:${guest.id}`,
    ]);
  });

  it("stops at the address when it is over, without touching the identity's count", async () => {
    mocks.query.mockResolvedValue(denied);

    const response = await limitWrite(post(), guest, "outage:create", limits);

    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("77");
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("counts nothing for an identity that cannot write", async () => {
    // What a cookieless request gets once its address has minted too many guests:
    // a new throwaway id every time. Counting it wrote a row per rejected request.
    const throwaway: Identity = {
      ...guest,
      id: "guest_22222222-2222-4222-8222-222222222222",
      isAuthenticated: false,
      canWrite: false,
      writeBlockedReason: "Too many new guest sessions from this network. Try again later.",
    };

    const response = await limitWrite(post(), throwaway, "outage:create", limits);

    expect(response?.status).toBe(429);
    expect(await response?.json()).toEqual({ error: throwaway.writeBlockedReason });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("refuses the write when the shared counter cannot be reached", async () => {
    mocks.query.mockRejectedValue(new Error("connection refused"));

    const response = await limitWrite(post(), guest, "outage:create", limits);

    // Not the per-isolate memory fallback, which a caller spread across
    // isolates would never fill.
    expect(response?.status).toBe(429);
  });
});

describe("addressBuckets and voteNetwork", () => {
  it("gives IPv4 one bucket and IPv6 its /64 plus its /48 at eight times the limit", () => {
    expect(addressBuckets("x", headers({ "cf-connecting-ip": "203.0.113.7" }))).toHaveLength(1);

    const a = addressBuckets("x", headers({ "cf-connecting-ip": "2001:db8:aa:1::5" }));
    const b = addressBuckets("x", headers({ "cf-connecting-ip": "2001:db8:aa:ffff::9" }));

    expect(a.map((bucket) => bucket.scale)).toEqual([1, 8]);
    expect(a[0].key).not.toBe(b[0].key); // different /64
    expect(a[1].key).toBe(b[1].key); // same /48
  });

  it("counts one household's IPv6 block as one voting network", () => {
    const vote = (address: string) => voteNetwork(headers({ "cf-connecting-ip": address }));

    // Two /64s inside one /56: the same home connection.
    expect(vote("2001:db8:aa:1200::5")).toBe(vote("2001:db8:aa:12ff::9"));
    // The next /56 over is someone else.
    expect(vote("2001:db8:aa:1300::5")).not.toBe(vote("2001:db8:aa:1200::5"));
    expect(vote("203.0.113.7")).not.toBe(vote("203.0.113.8"));
  });

  it("does not reuse a rate-limit bucket's hash for a vote", () => {
    const source = headers({ "cf-connecting-ip": "203.0.113.7" });

    expect(addressBuckets("x", source)[0].key).not.toContain(voteNetwork(source)!);
    expect(voteNetwork(headers({}))).toBeNull();
  });
});

describe("readJson", () => {
  it("parses an ordinary body and tolerates a malformed or empty one", async () => {
    expect(await readJson(post({}, '{"a":1}'))).toEqual({ a: 1 });
    expect(await readJson(post({}, "not json"))).toEqual({});
    expect(await readJson(post({}, null))).toEqual({});
  });

  it("refuses a body over the cap, whether or not its length is declared", async () => {
    const huge = JSON.stringify({ id: "x".repeat(MAX_JSON_BYTES) });

    await expect(readJson(post({}, huge))).rejects.toBeInstanceOf(RequestTooLargeError);

    const undeclared = new Request("https://dimspot.example/api/preferences", {
      method: "PUT",
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(huge));
          controller.close();
        },
      }),
      // @ts-expect-error duplex is required for a stream body and missing from the DOM types.
      duplex: "half",
    });
    await expect(readJson(undeclared)).rejects.toBeInstanceOf(RequestTooLargeError);
  });

  it("is reported to the client as 413", () => {
    expect(serverError(new RequestTooLargeError(), "test").status).toBe(413);
  });
});
