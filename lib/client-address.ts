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

/** The first `groups` 16-bit groups of an IPv6 address, or null if it is not one. */
function ipv6Prefix(address: string, groups: number, bits: number): string | null {
  const bare = address.replace(/%.*$/, "").toLowerCase();
  if (!bare.includes(":") || /^::ffff:\d/.test(bare)) return null;

  const halves = bare.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;

  const all = [...head, ...Array<string>(missing).fill("0"), ...tail];
  if (!all.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;

  const kept = all.slice(0, groups).map((g) => parseInt(g, 16));
  // A prefix that ends inside a group (a /56) keeps only that group's top bits.
  const spare = groups * 16 - bits;
  if (spare > 0) kept[groups - 1] = (kept[groups - 1]! >> spare) << spare;
  return `${kept.map((g) => g.toString(16)).join(":")}::/${bits}`;
}

function digest(value: string): string {
  const salt = process.env.RATE_LIMIT_SALT ?? "dimspot";
  return createHash("sha256").update(`${salt}:${value}`).digest("hex").slice(0, 32);
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
  return `${prefix}:${digest(networkKey(raw))}`;
}

/**
 * Every bucket a request counts against, each with the factor its limit is
 * multiplied by.
 *
 * One bucket per /64 is not enough for IPv6: anyone with a routed /48 (a
 * hosting customer, a tunnel) has 65,536 of them and so 65,536 times every
 * limit. The /48 is counted as well, at eight times the limit: generous
 * enough for the unrelated phones a carrier puts in one /48, and still a
 * ceiling four orders of magnitude lower than none.
 *
 * On Cloudflare a request with no address at all should not exist; if one
 * arrives it shares a single bucket instead of going unlimited.
 */
export function addressBuckets(
  prefix: string,
  source: Request | Headers,
): Array<{ key: string; scale: number }> {
  const raw = clientAddress(source);
  if (!raw) return IN_WORKER ? [{ key: `${prefix}:unknown`, scale: 1 }] : [];

  const buckets = [{ key: `${prefix}:${digest(networkKey(raw))}`, scale: 1 }];
  const wider = ipv6Prefix(raw, 3, 48);
  if (wider) buckets.push({ key: `${prefix}:${digest(wider)}`, scale: 8 });
  return buckets;
}

/**
 * Which network a vote came from, for counting confirmations and "it's back"
 * votes by distinct network rather than by identity (guest identities are
 * free; see db/migrations/0009_abuse_hardening.sql).
 *
 * IPv4: the address. IPv6: the /56, the block a home connection is usually
 * given, so one household's devices and its spare /64s are one voice. Stored
 * as a salted hash under its own label, so it cannot be matched against a
 * rate-limit bucket, and cleared after 30 days.
 */
export function voteNetwork(source: Request | Headers): string | null {
  const raw = clientAddress(source);
  if (!raw) return null;
  return digest(`vote:${ipv6Prefix(raw, 4, 56) ?? networkKey(raw)}`);
}
