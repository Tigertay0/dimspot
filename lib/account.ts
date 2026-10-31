import "server-only";
import { APIError } from "better-auth/api";
import { getAuth } from "./auth";
import { PG, pgCode } from "./db";
import { InvalidInputError } from "./data/repository";

/**
 * Creating an account.
 *
 * A visitor who has used the app at all is already an anonymous user, and
 * their reports, confirmations, comments, preferences and push subscriptions
 * all reference that user's id. So creating an account attaches an email and a
 * password to the existing user rather than making a new one: the id — and
 * with it everything they contributed — stays put. (A fresh sign-up would
 * strand all of it on the guest.)
 *
 * The account becomes permanent when the address is confirmed: the link in the
 * verification email sets email_verified, and lib/auth.ts clears is_anonymous
 * in the same update. Until then the visitor carries on as a guest, exactly as
 * Supabase's pending-email upgrade used to work, and the link can be opened on
 * any device because nothing needs to move.
 */

export interface AccountOutcome {
  /** False while the address still needs confirming (always, today). */
  signedIn: boolean;
  email: string;
  /** True when this upgraded the visitor's guest user in place. */
  upgraded: boolean;
}

/** The address belongs to a different user. */
export class EmailTakenError extends Error {
  constructor() {
    super("An account with that email already exists. Sign in, or reset its password if it is yours.");
    this.name = "EmailTakenError";
  }
}

const VERIFIED_CALLBACK = "/?auth=confirmed";

/** Attach credentials to the anonymous user `userId`, keeping its id. */
async function upgradeGuest(userId: string, email: string, password: string): Promise<void> {
  const ctx = await getAuth().$context;

  const existing = await ctx.internalAdapter.findUserByEmail(email);
  if (existing && existing.user.id !== userId) throw new EmailTakenError();

  try {
    await ctx.internalAdapter.updateUser(userId, { email, emailVerified: false, name: "Neighbor" });
  } catch (error) {
    // Lost a race with someone claiming the same address.
    if (pgCode(error) === PG.uniqueViolation) throw new EmailTakenError();
    throw error;
  }

  const hash = await ctx.password.hash(password);
  const accounts = await ctx.internalAdapter.findAccounts(userId);
  // A retry (a typo'd password, a lost email) replaces the earlier attempt.
  if (accounts.some((account) => account.providerId === "credential")) {
    await ctx.internalAdapter.updatePassword(userId, hash);
  } else {
    await ctx.internalAdapter.linkAccount({
      userId,
      providerId: "credential",
      accountId: userId,
      password: hash,
    });
  }
}

/**
 * Create an account for the caller.
 *
 * Upgrades the current guest in place when there is one; signs up a brand new
 * user only when the request has no session at all. Either way the address
 * must be confirmed before the account can sign in.
 */
export async function createAccount(
  requestHeaders: Headers,
  input: { email: string; password: string },
): Promise<AccountOutcome> {
  const auth = getAuth();
  const email = input.email.trim().toLowerCase();

  const session = await auth.api.getSession({ headers: requestHeaders });

  if (session && !session.user.isAnonymous) {
    throw new InvalidInputError("You are already signed in to an account.");
  }

  if (session) {
    await upgradeGuest(session.user.id, email, input.password);
    // No headers: looked up by address, so the guest's session cache cannot
    // trip the "email does not match the session" check.
    await auth.api.sendVerificationEmail({ body: { email, callbackURL: VERIFIED_CALLBACK } });
    return { signedIn: false, email, upgraded: true };
  }

  try {
    await auth.api.signUpEmail({
      body: { email, password: input.password, name: "Neighbor", callbackURL: VERIFIED_CALLBACK },
      headers: requestHeaders,
    });
  } catch (error) {
    if (error instanceof APIError && error.status === "UNPROCESSABLE_ENTITY") {
      throw new EmailTakenError();
    }
    throw error;
  }
  return { signedIn: false, email, upgraded: false };
}
