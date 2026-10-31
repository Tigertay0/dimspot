import "server-only";
import { addressBucket } from "./client-address";
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

/**
 * Durable limit, shared across instances. Falls back to the in-memory counter
 * when there is no database, and — deliberately — when the database call fails:
 * a rate limiter that is down should not take reporting down with it.
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
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
): Promise<RateLimitResult | null> {
  const bucket = addressBucket(prefix, request);
  if (!bucket) return null;

  const result = await consumeRateLimit(bucket, config.limit, config.windowMs);
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
  commentByAddress: { limit: 60, windowMs: 60 * 60 * 1000 },
  /**
   * Each subscription is a recipient on every nearby report, so unbounded
   * creation multiplies outbound sends. A browser legitimately re-posts on
   * every settings save, hence room for a few per hour.
   */
  pushSubscribe: { limit: 12, windowMs: 60 * 60 * 1000 },
  pushSubscribeByAddress: { limit: 30, windowMs: 60 * 60 * 1000 },
  /** Shared by confirm and unconfirm, so toggling cannot sidestep the cap. */
  confirm: { limit: 60, windowMs: 60 * 60 * 1000 },
  confirmByAddress: { limit: 150, windowMs: 60 * 60 * 1000 },
  /**
   * Two votes from distinct identities resolve an outage, and anonymous
   * identities are free, so the address layer is what protects real outages
   * from being closed by one script.
   */
  resolve: { limit: 20, windowMs: 60 * 60 * 1000 },
  resolveByAddress: { limit: 30, windowMs: 60 * 60 * 1000 },
  comment: { limit: 20, windowMs: 60 * 60 * 1000 },
  /**
   * New guest users, per client address. Every first visit mints one, so this
   * is what stops a script filling the users table; it matches the 30 an hour
   * Supabase Auth allowed for anonymous sign-ins.
   */
  guestSessionByAddress: { limit: 30, windowMs: 60 * 60 * 1000 },
  /** Account emails one inbox may receive, however they were triggered. */
  accountEmailPerRecipient: { limit: 5, windowMs: 60 * 60 * 1000 },
  /** Each attempt can email an address of the caller's choosing. */
  createAccount: { limit: 5, windowMs: 60 * 60 * 1000 },
  createAccountByAddress: { limit: 10, windowMs: 60 * 60 * 1000 },
  /** Nominatim's usage policy is one request per second, per source. */
  geocode: { limit: 30, windowMs: 60 * 1000 },
} as const;
