import pg from "pg";
import { getAuth } from "@/lib/auth";

/** Rows this test run created, removed by cleanup(). */
const created = { users: new Set<string>(), outages: new Set<string>() };

export interface Guest {
  id: string;
  /** Request headers carrying the guest's session cookie. */
  headers: Headers;
}

/** "a=1; Path=/, b=2; Path=/" -> "a=1; b=2" */
export function cookieHeader(setCookie: string | null): string {
  if (!setCookie) throw new Error("no Set-Cookie header");
  return setCookie
    .split(/,(?=\s*[\w.-]+=)/)
    .map((cookie) => cookie.split(";")[0]!.trim())
    .join("; ");
}

/** A fresh anonymous user with a session, as lib/identity.ts makes one. */
export async function newGuest(): Promise<Guest> {
  const { headers, response } = await getAuth().api.signInAnonymous({
    headers: new Headers(),
    returnHeaders: true,
  });
  created.users.add(response.user.id);
  return { id: response.user.id, headers: new Headers({ cookie: cookieHeader(headers.get("set-cookie")) }) };
}

export function trackOutage(id: string): string {
  created.outages.add(id);
  return id;
}

export function trackUser(id: string): void {
  created.users.add(id);
}

export function uniqueEmail(label: string): string {
  return `outage-test-${label}-${crypto.randomUUID().slice(0, 8)}@example.com`;
}

/**
 * Runs `work` as the branch owner. The app's own login may not delete users or
 * touch providers (db/migrations/0005_review_fixes.sql), so tests clean up and
 * inspect privileges with this instead.
 */
export async function asOwner<T>(work: (client: pg.Client) => Promise<T>): Promise<T> {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("Set MIGRATION_DATABASE_URL (dev branch owner) for the database tests.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

export async function cleanup(): Promise<void> {
  const outages = [...created.outages];
  const users = [...created.users];
  created.outages.clear();
  created.users.clear();
  await asOwner(async (client) => {
    // Outages first: deleting a user only nulls reported_by on its reports.
    if (outages.length > 0) await client.query("DELETE FROM outages WHERE id = ANY($1::uuid[])", [outages]);
    if (users.length > 0) await client.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [users]);
  });
}
