import { afterAll, describe, expect, it } from "vitest";
import { PostgresRepository } from "@/lib/data/postgres-repo";
import { DEFAULT_PREFERENCES, InvalidInputError } from "@/lib/data/repository";
import { query } from "@/lib/db";
import { removeSubscription, saveSubscription } from "@/lib/push";
import type { CreateOutageInput } from "@/lib/types";
import { cleanup, newGuest, trackOutage } from "./helpers";

/**
 * The repository is the authorization layer now that there is no row level
 * security: every write must touch only the acting identity's rows.
 */

const repo = new PostgresRepository();

const report: CreateOutageInput = {
  providerId: null,
  serviceType: "power",
  severity: "complete",
  latitude: 41.88,
  longitude: -87.63,
  description: "repository ownership test",
};

async function reportAs(identity: string) {
  const outage = await repo.createOutage(report, identity);
  trackOutage(outage.id);
  return outage;
}

afterAll(cleanup);

describe("PostgresRepository ownership", () => {
  it("lets each person withdraw only their own confirmation", async () => {
    const [a, b, c] = await Promise.all([newGuest(), newGuest(), newGuest()]);
    const outage = await reportAs(a.id);
    expect(outage.verificationCount).toBe(1); // the reporter's own

    expect(await repo.confirmOutage(outage.id, b.id)).toBe(2);
    expect(await repo.confirmOutage(outage.id, b.id)).toBe(2); // twice counts once

    // c never confirmed: withdrawing removes nothing of anyone else's.
    expect(await repo.unconfirmOutage(outage.id, c.id)).toBe(2);
    expect(await repo.unconfirmOutage(outage.id, b.id)).toBe(1);

    expect((await repo.getOutage(outage.id, a.id))?.confirmedByMe).toBe(true);
    expect((await repo.getOutage(outage.id, b.id))?.confirmedByMe).toBe(false);
  });

  it("attributes a comment to whoever wrote it", async () => {
    const [a, b] = await Promise.all([newGuest(), newGuest()]);
    const outage = await reportAs(a.id);

    const comment = await repo.addComment(outage.id, b.id, "Still out on my street", "update");
    expect(comment).toMatchObject({ userId: b.id, authorLabel: "You", commentType: "update" });

    const seenByA = await repo.getOutage(outage.id, a.id);
    const seenByB = await repo.getOutage(outage.id, b.id);
    expect(seenByA?.comments.map((x) => x.authorLabel)).toEqual(["Neighbor"]);
    expect(seenByB?.comments.map((x) => x.authorLabel)).toEqual(["You"]);
    expect(typeof seenByB?.comments[0]?.createdAt).toBe("string");
  });

  it("keeps preferences per identity", async () => {
    const [a, b] = await Promise.all([newGuest(), newGuest()]);
    const mine = {
      ...DEFAULT_PREFERENCES,
      providerIds: ["comed"],
      savedLocations: [{ id: "home", name: "Home", latitude: 41.9, longitude: -87.6, zoom: 13 }],
    };

    await repo.savePreferences(a.id, mine);

    expect(await repo.getPreferences(b.id)).toBeNull();
    expect(await repo.getPreferences(a.id)).toMatchObject({
      providerIds: ["comed"],
      savedLocations: mine.savedLocations,
    });
  });

  it("counts simultaneous confirmations exactly, without deadlocking", async () => {
    const reporter = await newGuest();
    const outage = await reportAs(reporter.id);
    const others = await Promise.all(Array.from({ length: 4 }, () => newGuest()));

    // Four at once: the pool allows five connections per request.
    const counts = await Promise.all(others.map((g) => repo.confirmOutage(outage.id, g.id)));

    expect(counts.every((n) => typeof n === "number")).toBe(true);
    expect((await repo.getOutage(outage.id, reporter.id))?.verificationCount).toBe(5);
  });

  it("puts one 'service is back' comment on the timeline per person", async () => {
    const [a, b] = await Promise.all([newGuest(), newGuest()]);
    const outage = await reportAs(a.id);

    await repo.resolveOutage(outage.id, b.id);
    await repo.resolveOutage(outage.id, b.id);

    const detail = await repo.getOutage(outage.id, b.id);
    expect(detail?.comments.filter((c) => c.commentType === "resolution")).toHaveLength(1);
  });

  it("treats a vote as a vote: two people, or the reporter, resolve an outage", async () => {
    const [a, b, c] = await Promise.all([newGuest(), newGuest(), newGuest()]);

    const first = await reportAs(a.id);
    expect((await repo.resolveOutage(first.id, b.id))?.status).toBe("active");
    expect((await repo.resolveOutage(first.id, c.id))?.status).toBe("resolved");

    const second = await reportAs(a.id);
    expect((await repo.resolveOutage(second.id, a.id))?.status).toBe("resolved");
  });

  it("answers a missing or malformed outage id with null, not an error", async () => {
    const guest = await newGuest();
    for (const id of [crypto.randomUUID(), "not-a-uuid"]) {
      expect(await repo.getOutage(id, guest.id)).toBeNull();
      expect(await repo.confirmOutage(id, guest.id)).toBeNull();
      expect(await repo.unconfirmOutage(id, guest.id)).toBeNull();
      expect(await repo.addComment(id, guest.id, "hello", "update")).toBeNull();
      expect(await repo.resolveOutage(id, guest.id)).toBeNull();
    }
  });

  it("refuses a write from a cookie-only guest id", async () => {
    const owner = await newGuest();
    const outage = await reportAs(owner.id);

    await expect(repo.confirmOutage(outage.id, "guest_cookie-only")).rejects.toBeInstanceOf(InvalidInputError);
    await expect(repo.createOutage(report, "guest_cookie-only")).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("moves a browser's push subscription to whoever registers it last", async () => {
    const [a, b] = await Promise.all([newGuest(), newGuest()]);
    const endpoint = `https://fcm.googleapis.com/fcm/send/test-${crypto.randomUUID()}`;
    const subscription = {
      endpoint,
      keys: { p256dh: "BPublicKeyForTests", auth: "authsecret" },
      settings: { ...DEFAULT_PREFERENCES.notifications, enabled: true },
      center: { latitude: 41.88, longitude: -87.63 },
      timezone: "America/Chicago",
    };

    await saveSubscription({ ...subscription, identity: a.id });
    await saveSubscription({ ...subscription, identity: b.id });

    const rows = await query<{ user_id: string; lat: number }>(
      "SELECT user_id, ST_Y(center::geometry) AS lat FROM push_subscriptions WHERE endpoint = $1",
      [endpoint],
    );
    expect(rows).toEqual([{ user_id: b.id, lat: 41.88 }]);

    await removeSubscription(endpoint);
    expect(await query("SELECT 1 FROM push_subscriptions WHERE endpoint = $1", [endpoint])).toEqual([]);
  });
});
