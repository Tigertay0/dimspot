import { notFound, ok, serverError } from "@/lib/api";
import { voteNetwork } from "@/lib/client-address";
import { getRepository } from "@/lib/data";
import { getWritableIdentity } from "@/lib/identity";
import { LIMITS } from "@/lib/rate-limit";
import { limitWrite, rejectCrossSite } from "@/lib/request-guard";

export const dynamic = "force-dynamic";

/**
 * POST /api/outages/:id/resolve — "it's back for me".
 *
 * With a database this is a vote; the status only flips once enough distinct
 * networks agree, and never for an official outage (apply_resolution_votes in
 * db/migrations/0009_abuse_hardening.sql). The local repository resolves
 * immediately, which is fine for demo data.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const crossSite = rejectCrossSite(request);
    if (crossSite) return crossSite;

    const { id } = await params;
    const identity = await getWritableIdentity();

    const blocked = await limitWrite(request, identity, "outage:resolve", {
      identity: LIMITS.resolve,
      address: LIMITS.resolveByAddress,
    });
    if (blocked) return blocked;

    const outage = await getRepository().resolveOutage(id, identity.id, voteNetwork(request));
    if (!outage) return notFound("That outage no longer exists");

    return ok({ outage });
  } catch (error) {
    return serverError(error, "POST /api/outages/[id]/resolve");
  }
}
