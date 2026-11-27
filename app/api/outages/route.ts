import { NextResponse, after } from "next/server";
import type { NextRequest } from "next/server";
import { badRequest, ok, readJson, serverError, tooMany } from "@/lib/api";
import { getRepository } from "@/lib/data";
import { parseBboxParam } from "@/lib/geo";
import { voteNetwork } from "@/lib/client-address";
import { getWritableIdentity } from "@/lib/identity";
import { alertSubscribers } from "@/lib/push";
import { limitRead } from "@/lib/read-limit";
import {
  LIMITS,
  consumeGlobalLimit,
  consumeRateLimit,
  pruneRateLimits,
} from "@/lib/rate-limit";
import { limitWrite, rejectCrossSite } from "@/lib/request-guard";
import {
  SERVICE_TYPES,
  SEVERITIES,
  type Outage,
  type ServiceType,
  type Severity,
} from "@/lib/types";
import { createOutageSchema, fieldErrors } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Ceilings on what one read may ask for. The app itself asks for the default
 * page and at most six hours of resolved outages; the old ceilings (2,000 rows,
 * 90 days) only served a caller trying to make each request as heavy as it
 * could be.
 */
const MAX_RESULTS = 1000;
const MAX_RESOLVED_HOURS = 72;
const MAX_PROVIDER_FILTER = 200;

/** Split a repeated/comma-joined query param into a validated enum list. */
function parseEnumList<T extends string>(
  raw: string | null,
  allowed: readonly T[],
): T[] | undefined {
  if (raw === null) return undefined;

  const values = raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .filter((v): v is T => (allowed as readonly string[]).includes(v));

  // An explicit empty filter means "show nothing", which is a legitimate state
  // when the user deselects everything — so an empty array is not undefined.
  return values;
}

/**
 * GET /api/outages
 *
 * Query params:
 *   bbox=minLng,minLat,maxLng,maxLat   viewport (optional; omit for everything)
 *   services=power,internet            service type filter
 *   providers=att,xfinity              provider slug filter
 *   severities=complete,degraded       severity filter
 *   resolvedHours=6                    also include recently resolved outages (72 at most)
 *   limit=1000                         1000 at most
 */
export async function GET(request: NextRequest) {
  try {
    const throttled = await limitRead(request);
    if (throttled) return throttled;

    const params = request.nextUrl.searchParams;

    const serviceTypes = parseEnumList<ServiceType>(
      params.get("services"),
      SERVICE_TYPES,
    );
    const severities = parseEnumList<Severity>(
      params.get("severities"),
      SEVERITIES,
    );

    // Short-circuit the "everything deselected" case rather than making the
    // database prove that an empty IN list matches nothing.
    if (serviceTypes?.length === 0 || severities?.length === 0) {
      return ok({ outages: [] });
    }

    const providersRaw = params.get("providers");
    const providerIds = providersRaw
      ? providersRaw.split(",").map((v) => v.trim()).filter(Boolean).slice(0, MAX_PROVIDER_FILTER)
      : undefined;

    const limitRaw = Number(params.get("limit"));
    // Whole numbers only: both go to INTEGER parameters.
    const limit =
      Number.isFinite(limitRaw) && limitRaw >= 1
        ? Math.min(Math.trunc(limitRaw), MAX_RESULTS)
        : MAX_RESULTS;

    const resolvedRaw = Number(params.get("resolvedHours"));
    const includeResolvedHours =
      Number.isFinite(resolvedRaw) && resolvedRaw > 0
        ? Math.min(Math.ceil(resolvedRaw), MAX_RESOLVED_HOURS)
        : 0;

    const outages = await getRepository().listOutages({
      bounds: parseBboxParam(params.get("bbox")),
      serviceTypes,
      providerIds,
      severities,
      includeResolvedHours,
      limit,
    });

    return ok({ outages });
  } catch (error) {
    return serverError(error, "GET /api/outages");
  }
}

/**
 * POST /api/outages — file a new report.
 *
 * Anyone can do this without an account, so it is the route with the most in
 * front of it (see the security review notes in lib/request-guard.ts and
 * db/migrations/0009_abuse_hardening.sql):
 *
 *   - not from another site's page;
 *   - limited per address, then per identity, failing closed;
 *   - a second report of the same service within a block becomes a
 *     confirmation of the first, so one spot is one pin however often it is
 *     reported;
 *   - new pins are capped per map cell and, for guests, sitewide;
 *   - nobody is alerted until a second network confirms it (lib/push.ts).
 */
export async function POST(request: NextRequest) {
  try {
    const crossSite = rejectCrossSite(request);
    if (crossSite) return crossSite;

    const identity = await getWritableIdentity();

    pruneRateLimits();

    const blocked = await limitWrite(request, identity, "outage:create", {
      identity: LIMITS.createOutage,
      address: LIMITS.createOutageByAddress,
    });
    if (blocked) return blocked;

    const parsed = createOutageSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return badRequest("Check the highlighted fields", fieldErrors(parsed.error));
    }

    const repository = getRepository();
    const network = voteNetwork(request);

    const alertLater = (outage: Outage) =>
      // After the response rather than a floating promise: on Workers `after`
      // is the request's waitUntil, and a `void` promise started before the
      // response is abandoned partway through the recipient list. Best effort
      // either way: alerting must never fail the report itself.
      after(async () => {
        try {
          await alertSubscribers(outage);
        } catch (error) {
          console.error("[push] alertSubscribers", error);
        }
      });

    const duplicateOf = await repository.findNearbyReport(parsed.data);
    if (duplicateOf) {
      await repository.confirmOutage(duplicateOf, identity.id, network);
      const existing = await repository.getOutage(duplicateOf, identity.id);
      if (existing) {
        alertLater(existing);
        return ok({ outage: existing, merged: true });
      }
    }

    // A new pin. These two ceilings are what still hold when a caller has
    // more addresses than the per-address limit can count.
    const cell = `outage:create:cell:${parsed.data.latitude.toFixed(1)}:${parsed.data.longitude.toFixed(1)}`;
    const perCell = await consumeRateLimit(
      cell,
      LIMITS.createOutageByCell.limit,
      LIMITS.createOutageByCell.windowMs,
      { failClosed: true },
    );
    if (!perCell.allowed) return tooMany(perCell);

    const guest = identity.email === null;
    const sitewide = await consumeGlobalLimit(
      guest ? "outage:create:guests" : "outage:create:accounts",
      guest ? LIMITS.createOutageGuestsGlobal : LIMITS.createOutageAccountsGlobal,
      { failClosed: true },
    );
    if (sitewide) {
      return NextResponse.json(
        {
          error: guest
            ? "Reports from guests are paused for a few minutes because of unusual volume. Sign in to report now, or try again shortly."
            : "Reporting is paused for a few minutes because of unusual volume. Try again shortly.",
          retryAfter: sitewide.retryAfter,
        },
        { status: 429, headers: { "Retry-After": String(sitewide.retryAfter) } },
      );
    }

    const outage = await repository.createOutage(
      {
        ...parsed.data,
        description: parsed.data.description ?? null,
        address: parsed.data.address ?? null,
        city: parsed.data.city ?? null,
        state: parsed.data.state ?? null,
        zipCode: parsed.data.zipCode ?? null,
        estimatedRestoration: parsed.data.estimatedRestoration ?? null,
      },
      identity.id,
      network,
    );

    return ok({ outage, merged: false }, { status: 201 });
  } catch (error) {
    return serverError(error, "POST /api/outages");
  }
}
