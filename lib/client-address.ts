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
export function clientAddress(source: Request | Headers): string | null {
  // next/headers' headers() is Headers-shaped but not guaranteed to be one.
  const headers = source instanceof Request ? source.headers : source;

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
 * The part of an address that identifies one client.
 *
 * An IPv4 address is one client (or one NAT). A single IPv6 host is routinely
 * handed a whole /64, so bucketing by the full address would give it a fresh
 * bucket for every request; it is keyed by its /64 instead, as Better Auth's
 * own limiter does.
 */
export function networkKey(address: string): string {
  const bare = address.replace(/%.*$/, "").toLowerCase();
  if (!bare.includes(":")) return bare;

  const mapped = bare.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return mapped[1]!;

  const halves = bare.split("::");
  if (halves.length > 2) return bare;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return bare;

  const groups = [...head, ...Array<string>(missing).fill("0"), ...tail];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return bare;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/**
 * Stable, non-reversible bucket key for an address.
 *
 * Salted so the hashes are not a rainbow-table lookup away from the addresses
 * that produced them. Without RATE_LIMIT_SALT the hash is still one-way, just
 * more guessable for a known address — acceptable, since nothing here is
 * retained beyond the rate-limit window.
 */
export function addressBucket(prefix: string, source: Request | Headers): string | null {
  const raw = clientAddress(source);
  if (!raw) return null;
  const address = networkKey(raw);

  const salt = process.env.RATE_LIMIT_SALT ?? "outage-tracker";
  const digest = createHash("sha256")
    .update(`${salt}:${address}`)
    .digest("hex")
    .slice(0, 32);

  return `${prefix}:${digest}`;
}
