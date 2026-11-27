import { notFound, ok, serverError } from "@/lib/api";
import { getRepository } from "@/lib/data";
import { getIdentity } from "@/lib/identity";
import { limitRead } from "@/lib/read-limit";

export const dynamic = "force-dynamic";

/** GET /api/outages/:id — detail, comments and the caller's confirm state. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const throttled = await limitRead(request);
    if (throttled) return throttled;

    const { id } = await params;
    const identity = await getIdentity();

    const outage = await getRepository().getOutage(id, identity.id);
    if (!outage) return notFound("That outage no longer exists");

    return ok({ outage });
  } catch (error) {
    return serverError(error, "GET /api/outages/[id]");
  }
}
