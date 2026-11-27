import { after } from "next/server";
import { notFound, ok, serverError } from "@/lib/api";
import { voteNetwork } from "@/lib/client-address";
import { ALERT_THRESHOLD } from "@/lib/constants";
import { getRepository } from "@/lib/data";
import { getWritableIdentity, type Identity } from "@/lib/identity";
import { alertSubscribers } from "@/lib/push";
import { LIMITS } from "@/lib/rate-limit";
import { limitWrite, rejectCrossSite } from "@/lib/request-guard";

export const dynamic = "force-dynamic";

/**
 * Shared by both methods: confirmations drive verification, and identities are
 * free to mint, so the address is limited first and the identity after.
 */
async function guard(
  request: Request,
): Promise<{ blocked: Response; identity?: undefined } | { blocked?: undefined; identity: Identity }> {
  const crossSite = rejectCrossSite(request);
  if (crossSite) return { blocked: crossSite };

  const identity = await getWritableIdentity();
  const blocked = await limitWrite(request, identity, "outage:confirm", {
    identity: LIMITS.confirm,
    address: LIMITS.confirmByAddress,
  });
  return blocked ? { blocked } : { identity };
}

/** POST /api/outages/:id/confirm — "I'm affected too". */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { blocked, identity } = await guard(request);
    if (blocked) return blocked;

    const repository = getRepository();
    const count = await repository.confirmOutage(id, identity.id, voteNetwork(request));
    if (count === null) return notFound("That outage no longer exists");

    // The confirmation that brings a second network is the one that alerts
    // nearby subscribers (lib/push.ts claims it, so it happens once).
    if (count === ALERT_THRESHOLD) {
      after(async () => {
        try {
          const outage = await repository.getOutage(id, null);
          if (outage) await alertSubscribers(outage);
        } catch (error) {
          console.error("[push] alertSubscribers", error);
        }
      });
    }

    return ok({ verificationCount: count, confirmedByMe: true });
  } catch (error) {
    return serverError(error, "POST /api/outages/[id]/confirm");
  }
}

/** DELETE /api/outages/:id/confirm — withdraw a confirmation. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { blocked, identity } = await guard(request);
    if (blocked) return blocked;

    const count = await getRepository().unconfirmOutage(id, identity.id);
    if (count === null) return notFound("That outage no longer exists");

    return ok({ verificationCount: count, confirmedByMe: false });
  } catch (error) {
    return serverError(error, "DELETE /api/outages/[id]/confirm");
  }
}
