import { badRequest, ok, readJson, serverError } from "@/lib/api";
import { DEFAULT_PREFERENCES, getRepository } from "@/lib/data";
import { getWritableIdentity } from "@/lib/identity";
import { LIMITS } from "@/lib/rate-limit";
import { limitWrite, rejectCrossSite } from "@/lib/request-guard";
import { fieldErrors, preferencesSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Saved filter preferences (PRD section 4.3).
 *
 * Guests get these too — the identity cookie is enough to key them — so the
 * "select your providers once" promise holds before anyone signs up.
 */
export async function GET() {
  try {
    const identity = await getWritableIdentity();
    const preferences = await getRepository().getPreferences(identity.id);

    return ok({
      preferences: preferences ?? DEFAULT_PREFERENCES,
      // "Has an account", which is what the settings screen asks. A guest on
      // a database-backed deployment is an anonymous user row, so it counts as
      // authenticated to the session layer while having nothing to sign in to;
      // reporting it as signed in told guests their settings were "synced to
      // your account".
      isAuthenticated: identity.isAuthenticated && !identity.isAnonymous,
    });
  } catch (error) {
    return serverError(error, "GET /api/preferences");
  }
}

export async function PUT(request: Request) {
  try {
    const crossSite = rejectCrossSite(request);
    if (crossSite) return crossSite;

    const identity = await getWritableIdentity();

    // Each save rewrites a row of JSON, and guests can save. Unlimited, with a
    // field that had no length cap, this was megabytes of storage per request.
    const blocked = await limitWrite(request, identity, "preferences:save", {
      identity: LIMITS.preferences,
      address: LIMITS.preferencesByAddress,
    });
    if (blocked) return blocked;

    const parsed = preferencesSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return badRequest("Invalid preferences", fieldErrors(parsed.error));
    }

    const preferences = await getRepository().savePreferences(
      identity.id,
      parsed.data,
    );
    return ok({ preferences });
  } catch (error) {
    return serverError(error, "PUT /api/preferences");
  }
}
