import "server-only";
import { createHash } from "node:crypto";

const IN_WORKER =
  typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

/**
 * Identify the client for rate-limiting purposes.
 *
 * The address is hashed before it is used as a bucket key and never stored in
 * the clear: the app only needs to know whether two requests came from the same
 * place, not where that is. PRD section 6.3 asks for minimal personal data.
 */

/**
 * On Cloudflare, `cf-connecting-ip` is set by the edge to the address that
 * actually connected, overwriting anything the client sent, so it is the only
 * header trusted when present. `x-forwarded-for` and `x-real-ip` are
 * client-supplied everywhere except behind a proxy that overwrites them; they
 * are a fallback for local development, and are not consulted at all when the
 * Cloudflare header exists — otherwise a caller could rotate a forged value to
 * get a fresh bucket per request.
 */
export function clientAddress(request: Request): string | null {
  const headers = request.headers;

  const cloudflare = headers.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare;
  // On the live Worker every outside request carries it; one that does not
  // gets no address rather than a client-chosen one.
  if (IN_WORKER) return null;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();

  return headers.get("x-real-ip");
}

/**
 * Stable, non-reversible bucket key for an address.
 *
 * Salted so the hashes are not a rainbow-table lookup away from the addresses
 * that produced them. Without RATE_LIMIT_SALT the hash is still one-way, just
 * more guessable for a known address — acceptable, since nothing here is
 * retained beyond the rate-limit window.
 */
export function addressBucket(prefix: string, request: Request): string | null {
  const address = clientAddress(request);
  if (!address) return null;

  const salt = process.env.RATE_LIMIT_SALT ?? "outage-tracker";
  const digest = createHash("sha256")
    .update(`${salt}:${address}`)
    .digest("hex")
    .slice(0, 32);

  return `${prefix}:${digest}`;
}
