import { badRequest, notFound, ok, readJson, serverError } from "@/lib/api";
import { getRepository } from "@/lib/data";
import { getWritableIdentity } from "@/lib/identity";
import { LIMITS } from "@/lib/rate-limit";
import { limitWrite, rejectCrossSite } from "@/lib/request-guard";
import { commentSchema, fieldErrors } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** POST /api/outages/:id/comments — add an update to the timeline. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const crossSite = rejectCrossSite(request);
    if (crossSite) return crossSite;

    const { id } = await params;
    const identity = await getWritableIdentity();

    const blocked = await limitWrite(request, identity, "outage:comment", {
      identity: LIMITS.comment,
      address: LIMITS.commentByAddress,
    });
    if (blocked) return blocked;

    const parsed = commentSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return badRequest("Check your comment", fieldErrors(parsed.error));
    }

    const comment = await getRepository().addComment(
      id,
      identity.id,
      parsed.data.comment,
      parsed.data.commentType,
    );
    if (!comment) return notFound("That outage no longer exists");

    return ok({ comment }, { status: 201 });
  } catch (error) {
    return serverError(error, "POST /api/outages/[id]/comments");
  }
}
