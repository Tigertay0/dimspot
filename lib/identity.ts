import "server-only";
import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/db";
import { LIMITS, consumeAddressLimit } from "@/lib/rate-limit";

/**
 * Who is acting on a request.
 *
 * The PRD wants guest browsing plus accounts (sections 4.3, 7). Gating writes
 * behind sign-up would starve the crowdsourcing the app depends on, so a
 * visitor with no account still gets a durable identity — enough to enforce
 * one confirmation per person and to attribute comments.
 *
 * How that identity is minted depends on the backend:
 *
 *   - Database: an anonymous Better Auth sign-in, which creates a real `users`
 *     row. This matters because `outages.reported_by` and every other owner
 *     column is a UUID with a foreign key to that table. Anonymous users can
 *     later be upgraded to a permanent account in place, keeping their id and
 *     so their history (lib/account.ts).
 *   - Local store: a random id in an httpOnly cookie, since there is no
 *     database to be consistent with.
 *
 * If a session cannot be created (the database is unreachable, say), this
 * falls back to the cookie identity so reads keep working, and `canWrite`
 * reports false so the caller can say something useful instead of a 500.
 */

export const GUEST_COOKIE = "outage_guest_id";
/**
 * What this server mints. The prefix matters: it keeps a cookie value from ever
 * looking like a user id, so a hand-written cookie holding someone's UUID cannot
 * read their "confirmed by me" state or, if a session could not be created,
 * write as them.
 */
const GUEST_ID = /^guest_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GUEST_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export interface Identity {
  id: string;
  /** True for a real user, anonymous or not. */
  isAuthenticated: boolean;
  /** True when this identity is a guest (anonymous) user. */
  isAnonymous: boolean;
  /** Set only once the address is confirmed and the account is permanent. */
  email: string | null;
  /**
   * Whether writes will pass the database's constraints. False means the
   * identity is a cookie id that `users` has never heard of.
   */
  canWrite: boolean;
  /**
   * Why writes are unavailable, when they are. Surfaced to the client so a
   * visitor is told "reporting is unavailable" up front rather than at submit
   * time, and so a broken deployment is diagnosable without log access.
   */
  writeBlockedReason: string | null;
}

interface SessionUser {
  id: string;
  email: string;
  isAnonymous?: boolean | null;
}

function guestIdentity(id: string, reason: string | null = null): Identity {
  const database = isDatabaseConfigured();
  return {
    id,
    isAuthenticated: false,
    isAnonymous: false,
    email: null,
    // Against the database, a cookie id has no users row, so every insert
    // referencing it would fail the foreign key. Against the local store there
    // is nothing to be consistent with, so it is fine.
    canWrite: !database,
    writeBlockedReason: database
      ? (reason ?? "Could not create a guest session.")
      : null,
  };
}

function userIdentity(user: SessionUser): Identity {
  const isAnonymous = Boolean(user.isAnonymous);
  return {
    id: user.id,
    isAuthenticated: true,
    isAnonymous,
    // A guest's address is a placeholder; an upgraded guest's real address
    // counts only once confirmed, which is also when isAnonymous clears.
    email: isAnonymous ? null : user.email,
    canWrite: true,
    writeBlockedReason: null,
  };
}

/** Read the guest cookie, minting and persisting one if absent. */
async function readOrCreateGuestCookie(): Promise<string> {
  const store = await cookies();
  const existing = store.get(GUEST_COOKIE)?.value;
  if (existing && GUEST_ID.test(existing)) return existing;

  const fresh = `guest_${randomUUID()}`;
  try {
    store.set(GUEST_COOKIE, fresh, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: GUEST_MAX_AGE_SECONDS,
    });
  } catch {
    // Called from a Server Component, which cannot set cookies. The value is
    // still usable for this request; /api/session persists it properly.
  }

  return fresh;
}

/**
 * Resolve the caller.
 *
 * `allowSignIn` must only be true in Route Handlers. Creating a session writes
 * cookies, and a Server Component cannot — so calling it there would mint a
 * fresh anonymous user on every single render instead of reusing one.
 */
export async function getIdentity(
  { allowSignIn = false }: { allowSignIn?: boolean } = {},
): Promise<Identity> {
  if (!isDatabaseConfigured()) {
    return guestIdentity(await readOrCreateGuestCookie());
  }

  let reason: string | null = null;

  try {
    const auth = getAuth();
    const requestHeaders = await headers();

    const session = await auth.api.getSession({ headers: requestHeaders });
    if (session) return userIdentity(session.user);

    if (allowSignIn) {
      const blocked = await consumeAddressLimit(
        "guest:create:addr",
        requestHeaders,
        LIMITS.guestSessionByAddress,
      );
      if (blocked) {
        reason = "Too many new guest sessions from this network. Try again later.";
      } else {
        // nextCookies() writes the new session cookie onto this response.
        const created = await auth.api.signInAnonymous({ headers: requestHeaders });
        if (created?.user) return userIdentity({ ...created.user, isAnonymous: true });
        reason = "Could not create a guest session.";
      }
    } else {
      reason = "No session, and this request may not create one.";
    }
  } catch (error) {
    // A broken database or auth config should degrade to read-only, not 500.
    reason = "Could not create a guest session.";
    console.error("[identity] session unavailable:", error instanceof Error ? error.message : error);
  }

  return guestIdentity(await readOrCreateGuestCookie(), reason);
}

/**
 * Identity for a request that is about to write. Creates a session if there
 * is none, so this is only valid inside a Route Handler.
 */
export async function getWritableIdentity(): Promise<Identity> {
  return getIdentity({ allowSignIn: true });
}
