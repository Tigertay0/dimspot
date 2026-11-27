import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  identity: {
    id: "11111111-1111-4111-8111-111111111111",
    isAuthenticated: true,
    isAnonymous: true,
    email: null as string | null,
    canWrite: true,
    writeBlockedReason: null as string | null,
  },
  repository: {
    findNearbyReport: vi.fn(),
    createOutage: vi.fn(),
    confirmOutage: vi.fn(),
    getOutage: vi.fn(),
  },
  alertSubscribers: vi.fn(),
}));

vi.mock("@/lib/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db")>()),
  isDatabaseConfigured: () => true,
  query: mocks.query,
}));
vi.mock("@/lib/identity", () => ({ getWritableIdentity: async () => mocks.identity }));
vi.mock("@/lib/data", () => ({ getRepository: () => mocks.repository }));
vi.mock("@/lib/push", () => ({ alertSubscribers: mocks.alertSubscribers }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  // Outside a request there is no waitUntil; run the deferred work inline.
  after: (work: () => unknown) => void work(),
}));

import { POST } from "@/app/api/outages/route";

const allowed = [{ allowed: true, remaining: 4, retry_after: 0 }];
const denied = [{ allowed: false, remaining: 0, retry_after: 600 }];

const body = { providerId: null, serviceType: "power", severity: "complete", latitude: 38.98, longitude: -77.1 };

function post(headers: Record<string, string> = {}, payload: unknown = body) {
  return new NextRequest("https://dimspot.example/api/outages", {
    method: "POST",
    headers: { host: "dimspot.example", "cf-connecting-ip": "203.0.113.7", ...headers },
    body: JSON.stringify(payload),
  });
}

/** Deny exactly the buckets whose key starts with `prefix`. */
function denyBucket(prefix: string) {
  mocks.query.mockImplementation(async (_sql: unknown, params: unknown[]) =>
    String(params[0]).startsWith(prefix) ? denied : allowed,
  );
}

function buckets(): string[] {
  return mocks.query.mock.calls.map(([, params]) => String((params as unknown[])[0]).replace(/[0-9a-f]{32}$/, "#"));
}

beforeEach(() => {
  mocks.query.mockReset().mockResolvedValue(allowed);
  mocks.identity.email = null;
  mocks.identity.canWrite = true;
  mocks.repository.findNearbyReport.mockReset().mockResolvedValue(null);
  mocks.repository.createOutage.mockReset().mockResolvedValue({ id: "new", verificationCount: 1 });
  mocks.repository.confirmOutage.mockReset().mockResolvedValue(2);
  mocks.repository.getOutage.mockReset().mockResolvedValue({ id: "existing", verificationCount: 2 });
  mocks.alertSubscribers.mockReset().mockResolvedValue(0);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("POST /api/outages", () => {
  it("files a report through every limit, in order, and alerts no one yet", async () => {
    const response = await POST(post());

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ merged: false });
    expect(buckets()).toEqual([
      "outage:create:addr:#",
      `outage:create:${mocks.identity.id}`,
      "outage:create:cell:39.0:-77.1",
      "global:outage:create:guests",
    ]);
    // The reporter's network goes in with the report, for the confirmation count.
    expect(mocks.repository.createOutage).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 38.98 }),
      mocks.identity.id,
      expect.stringMatching(/^[0-9a-f]{32}$/),
    );
    expect(mocks.alertSubscribers).not.toHaveBeenCalled();
  });

  it("refuses a report another site's page made the browser send", async () => {
    const response = await POST(post({ "sec-fetch-site": "cross-site", origin: "https://evil.example" }));

    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.repository.createOutage).not.toHaveBeenCalled();
  });

  it("turns a second report of the same thing nearby into a confirmation, not a second pin", async () => {
    mocks.repository.findNearbyReport.mockResolvedValue("existing");

    const response = await POST(post());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ merged: true, outage: { id: "existing" } });
    expect(mocks.repository.confirmOutage).toHaveBeenCalledWith(
      "existing",
      mocks.identity.id,
      expect.stringMatching(/^[0-9a-f]{32}$/),
    );
    expect(mocks.repository.createOutage).not.toHaveBeenCalled();
    // No new pin, so the per-cell and sitewide pin counters are not spent.
    expect(buckets().some((key) => key.includes(":cell:") || key.startsWith("global:"))).toBe(false);
    // The merge may be the second network: the alert is offered, and claims itself once.
    expect(mocks.alertSubscribers).toHaveBeenCalledTimes(1);
  });

  it("stops new pins in one map cell at the cell's hourly ceiling", async () => {
    denyBucket("outage:create:cell:");

    const response = await POST(post());

    expect(response.status).toBe(429);
    expect(mocks.repository.createOutage).not.toHaveBeenCalled();
  });

  it("pauses guest reports sitewide at the global ceiling, and says to sign in", async () => {
    denyBucket("global:outage:create:guests");

    const response = await POST(post());

    expect(response.status).toBe(429);
    expect(((await response.json()) as { error: string }).error).toContain("Sign in to report");
    expect(mocks.repository.createOutage).not.toHaveBeenCalled();
  });

  it("counts a signed-in reporter against the accounts ceiling, not the guests one", async () => {
    mocks.identity.email = "someone@example.com";
    denyBucket("global:outage:create:guests");

    const response = await POST(post());

    expect(response.status).toBe(201);
    expect(buckets()).toContain("global:outage:create:accounts");
  });

  it("refuses the write when the limiter's store is down, instead of counting per isolate", async () => {
    mocks.query.mockRejectedValue(new Error("connection refused"));

    const response = await POST(post());

    expect(response.status).toBe(429);
    expect(mocks.repository.createOutage).not.toHaveBeenCalled();
  });

  it("answers an oversized body with 413 without parsing it", async () => {
    const response = await POST(post({}, { ...body, description: "x".repeat(40_000) }));

    expect(response.status).toBe(413);
    expect(mocks.repository.createOutage).not.toHaveBeenCalled();
  });
});
