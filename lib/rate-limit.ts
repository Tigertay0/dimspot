import "server-only";
import { addressBuckets } from "./client-address";
import { isDatabaseConfigured, query } from "./db";

/**
 * Fixed-window rate limiting.
 *
 * PRD section 6.3 asks for rate limiting to prevent abuse, and section 9 names
 * spam reports as the top data-quality risk.
 *
 * Two implementations behind one call:
 *
 *   - `rateLimit` counts in process memory. On Workers that means each isolate
 *     enforces its own copy of the limit, so treat it as a courtesy throttle.
 *     It needs no database, so it is what the local backend uses.
 *   - `consumeRateLimit` counts in Postgres (consume_rate_limit in
 *     db/migrations/0002_app.sql), shared across every isolate. This is the one
 *     that actually constrains a determined caller, and it is used wherever a
 *     database is configured.
 *
 * The distinction matters because guest identities are free to mint, so a bot
 * can get a fresh identity per request; a per-address limit that only holds
 * within one isolate would not slow that down. (Workers rate-limit bindings
 * were considered, but they only count over 10 or 60 seconds; these windows
 * are an hour.)
 */

interface Window {
  count: number;
  resetAt: number;
}

const globalBuckets = globalThis as unknown as {
  __rateBuckets?: Map<string, Window>;
};

function buckets(): Map<string, Window> {
  if (!globalBuckets.__rateBuckets) {
    globalBuckets.__rateBuckets = new Map();
  }
  return globalBuckets.__rateBuckets;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const store = buckets();
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }

  existing.count += 1;
  const retryAfter = Math.ceil((existing.resetAt - now) / 1000);

  if (existing.count > limit) {
    return { allowed: false, remaining: 0, retryAfter };
  }

  return { allowed: true, remaining: limit - existing.count, retryAfter };
}

/** Opportunistic cleanup so the map does not grow without bound. */
export function pruneRateLimits(): void {
  const now = Date.now();
  for (const [key, window] of buckets()) {
    if (window.resetAt <= now) buckets().delete(key);
  }
}

export interface LimitOptions {
  /**
   * Refuse when the shared counter cannot be reached, instead of falling back
   * to this isolate's memory. For writes: on Workers the fallback is one
   * counter per isolate, which is no limit at all to a caller spread across
   * them, and a write needs the same database anyway.
   */
  failClosed?: boolean;
}

/**
 * Durable limit, shared across instances. Falls back to the in-memory counter
 * when there is no database, and, unless `failClosed`, when the database call
 * fails: a limiter that is down should not take reading the map down with it.
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  { failClosed = false }: LimitOptions = {},
): Promise<RateLimitResult> {
  if (!isDatabaseConfigured()) {
    return rateLimit(key, limit, windowMs);
  }

  try {
    // Only server code reaches the database, so no client can name someone
    // else's bucket and spend their quota.
    const [row] = await query<{
      allowed: boolean;
      remaining: number;
      retry_after: number;
    }>("SELECT * FROM consume_rate_limit($1, $2, $3)", [
      key,
      limit,
      Math.ceil(windowMs / 1000),
    ]);

    if (!row) throw new Error("consume_rate_limit returned no row");

    return {
      allowed: row.allowed,
      remaining: row.remaining,
      retryAfter: row.retry_after,
    };
  } catch (cause) {
    if (failClosed) {
      console.error("[rate-limit] durable check failed, refusing the write:", cause);
      return { allowed: false, remaining: 0, retryAfter: 30 };
    }
    console.error("[rate-limit] durable check failed, using in-memory:", cause);
    return rateLimit(key, limit, windowMs);
  }
}

/**
 * Per-address layer over a per-identity limit. Anonymous identities are free to
 * mint, so the address is what actually bounds a script. Returns the blocking
 * result, or null when the request may proceed (including when the address is
 * unknown).
 */
export async function consumeAddressLimit(
  prefix: string,
  request: Request | Headers,
  config: { limit: number; windowMs: number },
  options: LimitOptions = {},
): Promise<RateLimitResult | null> {
  // The address itself, and for IPv6 the /48 around it at a higher limit.
  for (const bucket of addressBuckets(prefix, request)) {
    const result = await consumeRateLimit(
      bucket.key,
      config.limit * bucket.scale,
      config.windowMs,
      options,
    );
    if (!result.allowed) return result;
  }
  return null;
}

/**
 * A limit on everyone together: the ceiling that still holds when a caller has
 * more addresses than any per-address limit can count.
 */
export async function consumeGlobalLimit(
  name: string,
  config: { limit: number; windowMs: number },
  options: LimitOptions = {},
): Promise<RateLimitResult | null> {
  const result = await consumeRateLimit(`global:${name}`, config.limit, config.windowMs, options);
  return result.allowed ? null : result;
}

export const LIMITS = {
  /** Reports are the expensive, abusable action. */
  createOutage: { limit: 5, windowMs: 60 * 60 * 1000 },
  /**
   * Per client address, layered over the per-identity limit above. Higher,
   * because one address can legitimately be a household, an office or a whole
   * carrier NAT — the point is to stop a flood, not to police a building.
   */
  createOutageByAddress: { limit: 20, windowMs: 60 * 60 * 1000 },
  /**
   * New pins per map cell of about 11 km, from everyone. A second report of
   * the same thing nearby becomes a confirmation and does not count, so this
   * is thirty separate places in one town in one hour: more than a real storm
   * files, and the most a flood can add there.
   */
  createOutageByCell: { limit: 30, windowMs: 60 * 60 * 1000 },
  /**
   * New pins from guests, sitewide. When this is hit, guests are asked to
   * sign in to report; accounts have their own, separate ceiling.
   */
  createOutageGuestsGlobal: { limit: 200, windowMs: 60 * 60 * 1000 },
  createOutageAccountsGlobal: { limit: 400, windowMs: 60 * 60 * 1000 },
  commentByAddress: { limit: 60, windowMs: 60 * 60 * 1000 },
  /**
   * Each subscription is a recipient on every nearby report, so unbounded
   * creation multiplies outbound sends. A browser legitimately re-posts on
   * every settings save, hence room for a few per hour.
   */
  pushSubscribe: { limit: 12, windowMs: 60 * 60 * 1000 },
  pushSubscribeByAddress: { limit: 30, windowMs: 60 * 60 * 1000 },
  /** Shared by confirm and unconfirm, so toggling cannot sidestep the cap. */
  confirm: { limit: 20, windowMs: 60 * 60 * 1000 },
  confirmByAddress: { limit: 40, windowMs: 60 * 60 * 1000 },
  /**
   * Votes are counted by distinct network (migration 0009), so one address
   * cannot close a report alone; this bounds how many it can vote on.
   */
  resolve: { limit: 10, windowMs: 60 * 60 * 1000 },
  resolveByAddress: { limit: 15, windowMs: 60 * 60 * 1000 },
  /** A settings save. Each one rewrites a row; nobody saves thirty an hour. */
  preferences: { limit: 30, windowMs: 60 * 60 * 1000 },
  preferencesByAddress: { limit: 90, windowMs: 60 * 60 * 1000 },
  comment: { limit: 20, windowMs: 60 * 60 * 1000 },
  /**
   * New guest users, per client address. Every first visit mints one, so this
   * is what stops a script filling the users table; it matches the 30 an hour
   * Supabase Auth allowed for anonymous sign-ins.
   */
  guestSessionByAddress: { limit: 30, windowMs: 60 * 60 * 1000 },
  /** Account emails one inbox may receive, however they were triggered. */
  accountEmailPerRecipient: { limit: 5, windowMs: 60 * 60 * 1000 },
  /**
   * Account emails to everyone together. The per-recipient and per-address
   * limits do not stop many addresses aiming at many inboxes, and mail nobody
   * asked for is what costs a sending domain its reputation.
   */
  accountEmailGlobal: { limit: 60, windowMs: 60 * 60 * 1000 },
  /** Each attempt can email an address of the caller's choosing. */
  createAccount: { limit: 5, windowMs: 60 * 60 * 1000 },
  createAccountByAddress: { limit: 10, windowMs: 60 * 60 * 1000 },
  /**
   * Suggestions while typing take several requests per search, so this is
   * looser than Nominatim's one-per-second policy; the client debounces, and
   * only a submitted search or a reverse lookup reaches Nominatim.
   */
  geocode: { limit: 60, windowMs: 60 * 1000 },
  /**
   * What the app as a whole forwards upstream. Every caller shares one
   * User-Agent, so one script's volume is everyone's ban: Nominatim's policy
   * is one request a second, and Photon asks for fair use.
   */
  geocodeSuggestGlobal: { limit: 300, windowMs: 60 * 1000 },
  geocodeSearchGlobal: { limit: 50, windowMs: 60 * 1000 },
  /** One address's share of the Nominatim budget: a fifth, not all of it. */
  geocodeSearchByAddress: { limit: 10, windowMs: 60 * 1000 },
} as const;
