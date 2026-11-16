import { getAuth } from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Better Auth's endpoints (sign-in, sign-out, email verification, password
 * reset). lib/auth.ts decides which of them a browser may reach.
 */
function handle(request: Request): Promise<Response> | Response {
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Accounts are unavailable on this deployment." }, { status: 404 });
  }
  return getAuth().handler(request);
}

export const GET = handle;
export const POST = handle;
