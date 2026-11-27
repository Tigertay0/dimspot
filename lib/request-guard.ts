import "server-only";
import { NextResponse } from "next/server";
import { tooMany } from "./api";
import type { Identity } from "./identity";
import { consumeAddressLimit, consumeRateLimit } from "./rate-limit";

/**
 * Whether a browser sent this request from another site.
 *
 * The session cookie is SameSite=Lax, so another site cannot act as a signed-in
 * visitor. But a cookieless write mints a guest, so any page could have each of
 * its visitors' browsers file a report or cast a vote from that visitor's own
 * address, without them knowing: a botnet of other people's networks.
 *
 * `Sec-Fetch-Site` is set by the browser and cannot be changed by page script;
 * where it is missing (older Safari), `Origin` is compared with this site's own
 * addresses. A client that sends neither is not a browser on someone else's
 * page, and is left to the rate limits.
 */
export function isCrossSite(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  if (site) return site === "cross-site";

  const origin = headers.get("origin");
  if (!origin) return false;
  if (origin === "null") return true;
  return !ownOrigins(headers).has(origin);
}

function ownOrigins(headers: Headers): Set<string> {
  const origins = new Set<string>();
  const host = headers.get("host");
  if (host) {
    origins.add(`https://${host}`);
    origins.add(`http://${host}`);
  }
  for (const value of [
    process.env.BETTER_AUTH_URL,
    ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(","),
  ]) {
    const trimmed = value?.trim().replace(/\/$/, "");
    if (trimmed) origins.add(trimmed);
  }
  return origins;
}

/** A 403 for a write another site's page tried to make, or null. */
export function rejectCrossSite(request: Request): NextResponse | null {
  if (!isCrossSite(request.headers)) return null;
  return NextResponse.json(
    { error: "This request did not come from Dimspot." },
    { status: 403 },
  );
}

/**
 * The limits every write goes through, in the order that costs least when the
 * answer is no.
 *
 *   1. No usable identity (a guest could not be created, usually because this
 *      address has minted too many): refused before anything is counted. The
 *      fallback id is new on every cookieless request, so counting it would
 *      write a row per rejected request.
 *   2. The address, which is the limit a script cannot mint its way around.
 *   3. The identity.
 *
 * Both counters fail closed: if the shared store is unreachable the write is
 * refused, since the write needs that database too.
 */
export async function limitWrite(
  request: Request,
  identity: Identity,
  bucket: string,
  limits: {
    identity: { limit: number; windowMs: number };
    address: { limit: number; windowMs: number };
  },
): Promise<NextResponse | null> {
  if (!identity.canWrite) {
    return NextResponse.json(
      { error: identity.writeBlockedReason ?? "Could not create a guest session." },
      { status: 429, headers: { "Retry-After": "600" } },
    );
  }

  const perAddress = await consumeAddressLimit(`${bucket}:addr`, request, limits.address, {
    failClosed: true,
  });
  if (perAddress) return tooMany(perAddress);

  const perIdentity = await consumeRateLimit(
    `${bucket}:${identity.id}`,
    limits.identity.limit,
    limits.identity.windowMs,
    { failClosed: true },
  );
  return perIdentity.allowed ? null : tooMany(perIdentity);
}
