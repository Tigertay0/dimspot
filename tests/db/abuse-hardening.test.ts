import { afterAll, describe, expect, it } from "vitest";
import { PostgresRepository } from "@/lib/data/postgres-repo";
import { InvalidInputError } from "@/lib/data/repository";
import { query } from "@/lib/db";
import { claimAlert, removeSubscription, saveSubscription } from "@/lib/push";
import type { CreateOutageInput } from "@/lib/types";
import { asOwner, cleanup, newGuest, trackOutage } from "./helpers";

/**
 * The abuse paths from the security review, against the real triggers and
 * functions in db/migrations/0009_abuse_hardening.sql. Each test is the attack
 * it names, followed by the honest version of the same action.
 */

const repo = new PostgresRepository();
const tag = Math.random().toString(36).slice(2, 8);

/** Somewhere no other test or real row is: mid-Pacific, moved per test. */
let spot = 0;
function report(overrides: Partial<CreateOutageInput> = {}): CreateOutageInput {
  spot += 1;
  return {
    providerId: null,
    serviceType: "power",
    severity: "complete",
    latitude: -40 - spot * 0.05,
    longitude: -140,
    description: `abuse hardening test ${tag}`,
    ...overrides,
  };
}

async function reportAs(identity: string, network: string | null, input = report()) {
  const outage = await repo.createOutage(input, identity, network);
  trackOutage(outage.id);
  return outage;
}

async function guests(n: number) {
  return Promise.all(Array.from({ length: n }, () => newGuest()));
}

/** A utility's own row, written the way the ingest writes one. */
async function officialOutage(extraMetadata: Record<string, unknown> = {}) {
  const source = `test-abuse-${tag}-${++spot}`;
  await query("SELECT * FROM sync_official_outages($1, $2::jsonb)", [
    source,
    JSON.stringify([
      {
        source_id: "row-1",
        service_type: "power",
        severity: "complete",
        latitude: -41 - spot * 0.05,
        longitude: -141,
        description: "official test row",
        metadata: { customers_affected: 120, ...extraMetadata },
      },
    ]),
  ]);
  const [row] = await query<{ id: string }>("SELECT id FROM outages WHERE source_name = $1", [source]);
  return trackOutage(row!.id);
}

afterAll(cleanup);

describe("verified means distinct networks", () => {
  it("does not let one address verify its own report with fresh guest sessions", async () => {
    const [reporter, ...sockpuppets] = await guests(6);
    const outage = await reportAs(reporter.id, "net-attacker");

    for (const puppet of sockpuppets) {
      await repo.confirmOutage(outage.id, puppet.id, "net-attacker");
    }

    const after = await repo.getOutage(outage.id, null);
    expect(after?.verificationCount).toBe(1);
    expect(after?.isVerified).toBe(false);
  });

  it("verifies at three networks", async () => {
    const [a, b, c] = await guests(3);
    const outage = await reportAs(a.id, "net-a");

    expect(await repo.confirmOutage(outage.id, b.id, "net-b")).toBe(2);
    expect((await repo.getOutage(outage.id, null))?.isVerified).toBe(false);
    expect(await repo.confirmOutage(outage.id, c.id, "net-c")).toBe(3);
    expect((await repo.getOutage(outage.id, null))?.isVerified).toBe(true);
  });
});

describe("closing an outage", () => {
  it("is refused for an official outage, and a vote written past the repository does nothing", async () => {
    const [a, b] = await guests(2);
    const id = await officialOutage();

    await expect(repo.resolveOutage(id, a.id, "net-a")).rejects.toBeInstanceOf(InvalidInputError);

    // The trigger holds on its own: two votes from two networks, inserted directly.
    await query(
      `INSERT INTO outage_resolutions (outage_id, user_id, network_hash)
       VALUES ($1, $2, 'net-a'), ($1, $3, 'net-b')`,
      [id, a.id, b.id],
    );
    expect((await repo.getOutage(id, null))?.status).toBe("active");
  });

  it("takes two networks, not two guest sessions from one", async () => {
    const [reporter, x, y, z] = await guests(4);
    const outage = await reportAs(reporter.id, "net-reporter");

    await repo.resolveOutage(outage.id, x.id, "net-attacker");
    expect((await repo.resolveOutage(outage.id, y.id, "net-attacker"))?.status).toBe("active");
    expect((await repo.resolveOutage(outage.id, z.id, "net-other"))?.status).toBe("resolved");
  });

  it("takes more votes the more widely a report was confirmed, and is no longer the reporter's to withdraw", async () => {
    const [reporter, ...neighbors] = await guests(9);
    const outage = await reportAs(reporter.id, "net-0");
    for (let i = 0; i < 5; i++) {
      await repo.confirmOutage(outage.id, neighbors[i]!.id, `net-${i + 1}`);
    }
    // Six networks confirmed it: three must say it is back.
    expect((await repo.getOutage(outage.id, null))?.verificationCount).toBe(6);

    expect((await repo.resolveOutage(outage.id, reporter.id, "net-0"))?.status).toBe("active");
    expect((await repo.resolveOutage(outage.id, neighbors[5]!.id, "net-x"))?.status).toBe("active");
    expect((await repo.resolveOutage(outage.id, neighbors[6]!.id, "net-y"))?.status).toBe("resolved");
  });
});

describe("one spot is one pin", () => {
  it("finds an active report of the same service within a block, and nothing else", async () => {
    const reporter = await newGuest();
    const input = report();
    const outage = await reportAs(reporter.id, "net-a", input);

    // About 55 m north.
    expect(await repo.findNearbyReport({ ...input, latitude: input.latitude + 0.0005 })).toBe(outage.id);
    // A different service at the same place is a different outage.
    expect(await repo.findNearbyReport({ ...input, serviceType: "internet" })).toBeNull();
    // About 1.1 km north.
    expect(await repo.findNearbyReport({ ...input, latitude: input.latitude + 0.01 })).toBeNull();

    await repo.resolveOutage(outage.id, reporter.id, "net-a");
    expect(await repo.findNearbyReport(input)).toBeNull();
  });
});

describe("alerts wait for a second network", () => {
  it("claims the alert once, and only after someone else confirms", async () => {
    const [reporter, puppet, neighbor] = await guests(3);
    const outage = await reportAs(reporter.id, "net-a");

    expect(await claimAlert(outage)).toBe(false);

    // A second guest from the reporter's own address changes nothing.
    await repo.confirmOutage(outage.id, puppet.id, "net-a");
    expect(await claimAlert(outage)).toBe(false);

    await repo.confirmOutage(outage.id, neighbor.id, "net-b");
    expect(await claimAlert(outage)).toBe(true);
    expect(await claimAlert(outage)).toBe(false);
  });

  it("skips a subscriber who was alerted in the last ten minutes", async () => {
    const subscriber = await newGuest();
    const endpoint = `https://fcm.googleapis.com/fcm/send/abuse-${tag}`;
    await saveSubscription({
      identity: subscriber.id,
      endpoint,
      keys: { p256dh: "k", auth: "a" },
      settings: {
        enabled: true,
        severityThreshold: "intermittent",
        radiusMiles: 5,
        quietHoursStart: null,
        quietHoursEnd: null,
      },
      center: { latitude: -50, longitude: -150 },
      timezone: "UTC",
    });

    const targets = () =>
      query<{ endpoint: string }>(
        "SELECT endpoint FROM push_targets($1, $2, 'complete', NULL) WHERE endpoint = $3",
        [-50, -150, endpoint],
      );

    expect(await targets()).toHaveLength(1);
    await query("UPDATE push_subscriptions SET last_alerted_at = NOW() WHERE endpoint = $1", [endpoint]);
    expect(await targets()).toHaveLength(0);
    await query(
      "UPDATE push_subscriptions SET last_alerted_at = NOW() - INTERVAL '11 minutes' WHERE endpoint = $1",
      [endpoint],
    );
    expect(await targets()).toHaveLength(1);

    await removeSubscription(endpoint);
  });
});

describe("housekeeping", () => {
  it("expires a report nobody else confirmed after 12 hours, and keeps a confirmed one", async () => {
    const [a, b, c] = await guests(3);
    const lonely = await reportAs(a.id, "net-a");
    const confirmed = await reportAs(b.id, "net-b");
    await repo.confirmOutage(confirmed.id, c.id, "net-c");

    await asOwner((client) =>
      client.query("UPDATE outages SET reported_at = NOW() - INTERVAL '13 hours' WHERE id = ANY($1::uuid[])", [
        [lonely.id, confirmed.id],
      ]),
    );
    await query("SELECT prune_stale_rows()");

    expect((await repo.getOutage(lonely.id, null))?.status).toBe("resolved");
    expect((await repo.getOutage(confirmed.id, null))?.status).toBe("active");

    const [row] = await query<{ expired: boolean }>(
      "SELECT (metadata->>'expired')::boolean AS expired FROM outages WHERE id = $1",
      [lonely.id],
    );
    expect(row?.expired).toBe(true);

    // And any report after three days.
    await asOwner((client) =>
      client.query("UPDATE outages SET reported_at = NOW() - INTERVAL '73 hours' WHERE id = $1", [confirmed.id]),
    );
    await query("SELECT prune_stale_rows()");
    expect((await repo.getOutage(confirmed.id, null))?.status).toBe("resolved");
  });

  it("never expires an official outage", async () => {
    const id = await officialOutage();
    await asOwner((client) =>
      client.query("UPDATE outages SET reported_at = NOW() - INTERVAL '30 days' WHERE id = $1", [id]),
    );

    await query("SELECT prune_stale_rows()");

    expect((await repo.getOutage(id, null))?.status).toBe("active");
  });

  it("removes a guest that never did anything, and keeps one that did", async () => {
    const [idle, active] = await guests(2);
    const outage = await reportAs(active.id, "net-a");
    await asOwner(async (client) => {
      await client.query("UPDATE users SET created_at = NOW() - INTERVAL '31 days' WHERE id = ANY($1::uuid[])", [
        [idle.id, active.id],
      ]);
      await client.query("UPDATE sessions SET updated_at = NOW() - INTERVAL '31 days' WHERE user_id = ANY($1::uuid[])", [
        [idle.id, active.id],
      ]);
    });

    // As the app's own role, which cannot delete users directly.
    await query("SELECT prune_idle_guests()");

    const left = await query<{ id: string }>("SELECT id FROM users WHERE id = ANY($1::uuid[])", [
      [idle.id, active.id],
    ]);
    expect(left.map((row) => row.id)).toEqual([active.id]);
    expect((await repo.getOutage(outage.id, null))?.reportedBy).toBe(active.id);
  });
});

describe("a stored row cannot break the map", () => {
  it("clamps a customer count past the integer range instead of failing the query", async () => {
    const id = await officialOutage({ customers_affected: 2 ** 40 });

    const outage = await repo.getOutage(id, null);

    expect(outage?.customersAffected).toBe(2147483647);
  });

  it("returns the newest hundred comments, however many were written", async () => {
    const author = await newGuest();
    const outage = await reportAs(author.id, "net-a");
    await query(
      `INSERT INTO outage_comments (outage_id, user_id, comment, comment_type, created_at)
       SELECT $1, $2, 'comment ' || n, 'update', NOW() - make_interval(secs => 200 - n)
       FROM generate_series(1, 130) AS n`,
      [outage.id, author.id],
    );

    const comments = (await repo.getOutage(outage.id, null))?.comments ?? [];

    expect(comments).toHaveLength(100);
    expect(comments[0]?.comment).toBe("comment 31");
    expect(comments.at(-1)?.comment).toBe("comment 130");
  });
});
