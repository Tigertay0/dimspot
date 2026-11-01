import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Capture outgoing email instead of sending it; the link is all a test needs.
const mail = vi.hoisted(() => ({ sent: [] as Array<{ to: string; url: string }> }));
vi.mock("@/lib/email", () => ({
  sendEmail: async (message: { to: string; text: string }) => {
    mail.sent.push({ to: message.to, url: message.text });
  },
  linkEmail: (to: string, subject: string, _intro: string, _action: string, url: string) => ({
    to,
    subject,
    text: url,
    html: url,
  }),
}));

import { EmailTakenError, createAccount } from "@/lib/account";
import { getAuth } from "@/lib/auth";
import { PostgresRepository } from "@/lib/data/postgres-repo";
import { DEFAULT_PREFERENCES, InvalidInputError } from "@/lib/data/repository";
import { query } from "@/lib/db";
import { saveSubscription } from "@/lib/push";
import { cleanup, cookieHeader, newGuest, trackOutage, trackUser, uniqueEmail } from "./helpers";

const repo = new PostgresRepository();
const PASSWORD = "correct horse battery";

/** The emailed link for `to`, once the background send has run. */
async function linkSentTo(to: string): Promise<URL> {
  await vi.waitFor(() => expect(mail.sent.some((m) => m.to === to)).toBe(true), { timeout: 10_000 });
  return new URL(mail.sent.filter((m) => m.to === to).at(-1)!.url);
}

async function userRow(id: string) {
  const [row] = await query<{ email: string; email_verified: boolean; is_anonymous: boolean }>(
    "SELECT email, email_verified, is_anonymous FROM users WHERE id = $1",
    [id],
  );
  return row;
}

beforeEach(() => {
  mail.sent = [];
});

afterAll(cleanup);

describe("creating an account from a guest", () => {
  it("keeps the guest's id, so reports, comments, preferences and alerts stay theirs", async () => {
    const guest = await newGuest();
    const email = uniqueEmail("upgrade");

    // Contribute as a guest.
    const outage = await repo.createOutage(
      { providerId: null, serviceType: "internet", severity: "degraded", latitude: 40.7, longitude: -74 },
      guest.id,
    );
    trackOutage(outage.id);
    await repo.addComment(outage.id, guest.id, "Slow since noon", "update");
    await repo.savePreferences(guest.id, { ...DEFAULT_PREFERENCES, providerIds: ["xfinity"] });
    const endpoint = `https://fcm.googleapis.com/fcm/send/upgrade-${crypto.randomUUID()}`;
    await saveSubscription({
      identity: guest.id,
      endpoint,
      keys: { p256dh: "key", auth: "auth" },
      settings: DEFAULT_PREFERENCES.notifications,
      center: null,
      timezone: null,
    });

    const outcome = await createAccount(guest.headers, { email, password: PASSWORD });
    expect(outcome).toEqual({ signedIn: false, email, upgraded: true });

    // Same user, now carrying the address, still a guest until it is confirmed.
    expect(await userRow(guest.id)).toEqual({ email, email_verified: false, is_anonymous: true });
    const [credential] = await query<{ password: string }>(
      "SELECT password FROM accounts WHERE user_id = $1 AND provider_id = 'credential'",
      [guest.id],
    );
    expect(credential.password).toBeTruthy();
    expect(credential.password).not.toContain(PASSWORD);

    // Cannot sign in before confirming.
    await expect(
      getAuth().api.signInEmail({ body: { email, password: PASSWORD } }),
    ).rejects.toMatchObject({ body: { code: "EMAIL_NOT_VERIFIED" } });

    // Follow the confirmation link.
    const link = await linkSentTo(email);
    expect(link.pathname).toBe("/api/auth/verify-email");
    await getAuth().api.verifyEmail({ query: { token: link.searchParams.get("token")! } });

    expect(await userRow(guest.id)).toEqual({ email, email_verified: true, is_anonymous: false });

    // The guest's existing session now reads as the permanent account.
    const session = await getAuth().api.getSession({ headers: guest.headers });
    expect(session?.user).toMatchObject({ id: guest.id, email, isAnonymous: false });

    // Everything contributed as a guest is still attached to the same id.
    const [owned] = await query<{ reports: string; comments: string; prefs: string; subs: string }>(
      `SELECT
         (SELECT count(*) FROM outages WHERE reported_by = $1) AS reports,
         (SELECT count(*) FROM outage_comments WHERE user_id = $1) AS comments,
         (SELECT count(*) FROM user_preferences WHERE user_id = $1) AS prefs,
         (SELECT count(*) FROM push_subscriptions WHERE user_id = $1) AS subs`,
      [guest.id],
    );
    expect(owned).toEqual({ reports: "1", comments: "1", prefs: "1", subs: "1" });

    // And signing in on another device lands on that same user.
    const signedIn = await getAuth().api.signInEmail({ body: { email, password: PASSWORD } });
    expect(signedIn.user.id).toBe(guest.id);
  });

  it("refuses an address another user already holds", async () => {
    const [first, second] = await Promise.all([newGuest(), newGuest()]);
    const email = uniqueEmail("taken");

    await createAccount(first.headers, { email, password: PASSWORD });
    await expect(createAccount(second.headers, { email, password: PASSWORD })).rejects.toBeInstanceOf(
      EmailTakenError,
    );
    expect((await userRow(second.id)).is_anonymous).toBe(true);
  });

  it("lets a guest retry before confirming, replacing the earlier password", async () => {
    const guest = await newGuest();
    const email = uniqueEmail("retry");

    await createAccount(guest.headers, { email, password: "first password!" });
    await createAccount(guest.headers, { email, password: PASSWORD });

    const link = await linkSentTo(email);
    await getAuth().api.verifyEmail({ query: { token: link.searchParams.get("token")! } });
    const signedIn = await getAuth().api.signInEmail({ body: { email, password: PASSWORD } });
    expect(signedIn.user.id).toBe(guest.id);
  });

  it("will not upgrade someone already signed in to an account", async () => {
    const guest = await newGuest();
    const email = uniqueEmail("signedin");
    await createAccount(guest.headers, { email, password: PASSWORD });
    const link = await linkSentTo(email);
    await getAuth().api.verifyEmail({ query: { token: link.searchParams.get("token")! } });

    await expect(createAccount(guest.headers, { email: uniqueEmail("again"), password: PASSWORD })).rejects.toBeInstanceOf(
      InvalidInputError,
    );
  });

  it("tells a session-less sign-up that the address is taken", async () => {
    const guest = await newGuest();
    const email = uniqueEmail("dupe");
    await createAccount(guest.headers, { email, password: PASSWORD });

    await expect(createAccount(new Headers(), { email, password: PASSWORD })).rejects.toBeInstanceOf(EmailTakenError);
  });

  it("signs up a new user when there is no session at all", async () => {
    const email = uniqueEmail("fresh");
    const outcome = await createAccount(new Headers(), { email, password: PASSWORD });
    expect(outcome).toEqual({ signedIn: false, email, upgraded: false });

    const [row] = await query<{ id: string; is_anonymous: boolean }>(
      "SELECT id, is_anonymous FROM users WHERE email = $1",
      [email],
    );
    trackUser(row.id);
    expect(row.is_anonymous).toBe(false);
    expect((await linkSentTo(email)).pathname).toBe("/api/auth/verify-email");
  });
});

describe("password reset", () => {
  it("sets a new password from the emailed link and retires the old one", async () => {
    const guest = await newGuest();
    const email = uniqueEmail("reset");
    await createAccount(guest.headers, { email, password: PASSWORD });
    await getAuth().api.verifyEmail({
      query: { token: (await linkSentTo(email)).searchParams.get("token")! },
    });
    mail.sent = [];

    await getAuth().api.requestPasswordReset({ body: { email, redirectTo: "/?auth=reset" } });
    const link = await linkSentTo(email);
    const token = link.pathname.split("/").at(-1)!;
    expect(link.pathname).toBe(`/api/auth/reset-password/${token}`);
    expect(link.searchParams.get("callbackURL")).toBe("/?auth=reset");

    await getAuth().api.resetPassword({ body: { token, newPassword: "a brand new password" } });

    await expect(getAuth().api.signInEmail({ body: { email, password: PASSWORD } })).rejects.toThrow();
    const signedIn = await getAuth().api.signInEmail({ body: { email, password: "a brand new password" } });
    expect(signedIn.user.id).toBe(guest.id);
  });

  it("sends nothing for an address with no account", async () => {
    const known = await newGuest();
    const email = uniqueEmail("known");
    await createAccount(known.headers, { email, password: PASSWORD });
    await linkSentTo(email); // the background sender is running
    mail.sent = [];

    await getAuth().api.requestPasswordReset({ body: { email: uniqueEmail("nobody"), redirectTo: "/?auth=reset" } });
    await getAuth().api.requestPasswordReset({ body: { email, redirectTo: "/?auth=reset" } });
    await linkSentTo(email); // sent after the unknown one, so that one had its chance
    expect(mail.sent.map((m) => m.to)).toEqual([email]);
  });
});

describe("auth endpoints reachable from a browser", () => {
  const handler = (path: string, init?: RequestInit) =>
    getAuth().handler(new Request(`http://localhost:3000/api/auth${path}`, init));

  const json = (body: unknown): RequestInit => ({
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  });

  it("closes direct sign-up and anonymous sign-in, which only the server may do", async () => {
    const signUp = await handler("/sign-up/email", json({ email: uniqueEmail("direct"), password: PASSWORD, name: "x" }));
    expect(signUp.status).toBe(404);
    const anonymous = await handler("/sign-in/anonymous", json({}));
    expect(anonymous.status).toBe(404);
  });

  it("serves the session, sign-out and the password reset link", async () => {
    const guest = await newGuest();
    const session = await handler("/get-session", { headers: guest.headers });
    expect(session.status).toBe(200);
    expect((await session.json()).user.id).toBe(guest.id);

    const reset = await handler(`/reset-password/not-a-token?callbackURL=${encodeURIComponent("/?auth=reset")}`, {
      redirect: "manual",
    });
    expect(reset.status).toBe(302);
    expect(reset.headers.get("location")).toContain("error=INVALID_TOKEN");

    const out = await handler("/sign-out", { ...json({}), headers: { ...json({}).headers, cookie: guest.headers.get("cookie")! } });
    expect(out.status).toBe(200);
    expect(cookieHeader(out.headers.get("set-cookie"))).toContain("session_token=");
  });
});
