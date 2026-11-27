import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { addressBucket } from "./client-address";

/**
 * A per-address throttle on the public read endpoints.
 *
 * The map's reads are open to anyone and each one is a database query, so a
 * loop from one address could keep the database busy all day. The write limits
 * count in Postgres, which is right for a handful of writes an hour and wrong
 * here: a counter that costs a query per read would double the load it is
 * meant to bound. This uses the Workers Rate Limiting binding instead
 * (READ_LIMITER in wrangler.jsonc): counted at the edge, per Cloudflare
 * location, no database involved.
 *
 * It is approximate by design and it fails open: with no binding (local
 * development, a deployment without it) or an error from it, reads proceed.
 *
 * What it does not do: a refused request has still reached the Worker, so
 * this does not protect the plan's daily request allowance. Only a rate
 * limiting rule on the zone does that (SETUP.md, "Abuse limits").
 */
interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

function binding(): RateLimitBinding | null {
  try {
    const env = getCloudflareContext().env as { READ_LIMITER?: RateLimitBinding };
    return env.READ_LIMITER ?? null;
  } catch {
    return null;
  }
}

export async function limitRead(request: Request): Promise<NextResponse | null> {
  const limiter = binding();
  if (!limiter) return null;

  try {
    const { success } = await limiter.limit({
      key: addressBucket("read", request) ?? "read:unknown",
    });
    if (success) return null;
  } catch (error) {
    console.error("[read-limit] binding failed, allowing the read:", error);
    return null;
  }

  return NextResponse.json(
    { error: "You are loading the map too quickly. Try again in a minute.", retryAfter: 60 },
    { status: 429, headers: { "Retry-After": "60" } },
  );
}
