import { notFound, ok, serverError } from "@/lib/api";
import { getRepository } from "@/lib/data";
import { limitRead } from "@/lib/read-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/outages/:id/area — the outage as an area to draw once it is
 * selected: the utility's own outline when there is one, otherwise an
 * approximate circle (lib/outage-area.ts).
 *
 * Kept apart from the detail endpoint so the outline, which can be a few
 * kilobytes, is only sent to someone who opened that outage. No identity is
 * read: the answer is the same for everyone, so it is cached briefly too.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const throttled = await limitRead(request);
    if (throttled) return throttled;

    const { id } = await params;
    const area = await getRepository().getOutageArea(id);
    if (!area) return notFound("That outage no longer exists");

    // Feeds refresh every 20 minutes; a minute of staleness is invisible.
    return ok({ area }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch (error) {
    return serverError(error, "GET /api/outages/[id]/area");
  }
}
