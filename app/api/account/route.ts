import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { EmailTakenError, createAccount } from "@/lib/account";
import { badRequest, ok, readJson, serverError, tooMany } from "@/lib/api";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/constants";
import { isDatabaseConfigured } from "@/lib/db";
import { getIdentity } from "@/lib/identity";
import { LIMITS, consumeAddressLimit, consumeRateLimit } from "@/lib/rate-limit";
import { fieldErrors } from "@/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().trim().max(254).pipe(z.email("Enter a valid email address")),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `At least ${MIN_PASSWORD_LENGTH} characters`)
    .max(MAX_PASSWORD_LENGTH, `At most ${MAX_PASSWORD_LENGTH} characters`),
});

/**
 * POST /api/account — create an account from the current guest (lib/account.ts).
 *
 * Each call can send a verification email to an address of the caller's
 * choosing, so it is limited per identity and per client address.
 */
export async function POST(request: Request) {
  try {
    if (!isDatabaseConfigured()) {
      return badRequest("Accounts are unavailable on this deployment.");
    }

    const parsed = bodySchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return badRequest("Check the highlighted fields", fieldErrors(parsed.error));
    }

    const perAddress = await consumeAddressLimit("account:create:addr", request, LIMITS.createAccountByAddress);
    if (perAddress) return tooMany(perAddress);

    // The guest being upgraded, if there is one. Not minted here: a visitor
    // with no session at all simply signs up (lib/account.ts).
    const identity = await getIdentity();
    if (identity.isAuthenticated) {
      const perIdentity = await consumeRateLimit(
        `account:create:${identity.id}`,
        LIMITS.createAccount.limit,
        LIMITS.createAccount.windowMs,
      );
      if (!perIdentity.allowed) return tooMany(perIdentity);
    }

    const outcome = await createAccount(await headers(), parsed.data);
    return ok(outcome, { status: 201 });
  } catch (error) {
    if (error instanceof EmailTakenError) {
      return NextResponse.json({ error: error.message, fields: { email: error.message } }, { status: 409 });
    }
    return serverError(error, "POST /api/account");
  }
}
