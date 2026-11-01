import { ok, serverError } from "@/lib/api";
import { isDatabaseConfigured } from "@/lib/db";
import { getWritableIdentity } from "@/lib/identity";
import { pushConfigured } from "@/lib/push";

export const dynamic = "force-dynamic";

/**
 * GET /api/session
 *
 * One call that tells the client who it is and which optional capabilities this
 * deployment actually has, so the UI can hide what is not wired up instead of
 * offering buttons that fail. Also the request that mints the guest cookie —
 * route handlers can set cookies, Server Components cannot.
 */
export async function GET() {
  try {
    const identity = await getWritableIdentity();

    return ok({
      identity: {
        id: identity.id,
        isAuthenticated: identity.isAuthenticated,
        isAnonymous: identity.isAnonymous,
        email: identity.email,
      },
      capabilities: {
        /**
         * False when there is a database but no identity it will accept could
         * be issued — the database or auth setup is broken. Reads still work;
         * the UI says so rather than letting a report fail at submit time.
         */
        write: identity.canWrite,
        writeBlockedReason: identity.writeBlockedReason,
        accounts: isDatabaseConfigured(),
        push: pushConfigured(),
        /** Local mode means data is demo data and resets on restart. */
        demoData: !isDatabaseConfigured(),
      },
    });
  } catch (error) {
    return serverError(error, "GET /api/session");
  }
}
