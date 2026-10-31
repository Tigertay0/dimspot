import { getAuth } from "@/lib/auth";
import { query } from "@/lib/db";

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

export async function cleanup(): Promise<void> {
  // Outages first: deleting a user only nulls reported_by on its reports.
  if (created.outages.size > 0) {
    await query("DELETE FROM outages WHERE id = ANY($1::uuid[])", [[...created.outages]]);
  }
  if (created.users.size > 0) {
    await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [[...created.users]]);
  }
  created.outages.clear();
  created.users.clear();
}
