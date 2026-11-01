import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { anonymous } from "better-auth/plugins";
import { createHash } from "node:crypto";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./constants";
import { getPool } from "./db";
import { linkEmail, sendEmail, type OutgoingEmail } from "./email";
import { LIMITS, consumeRateLimit } from "./rate-limit";

/**
 * Accounts (PRD section 4.3), on Better Auth with users stored in the app's
 * own Postgres.
 *
 * Every visitor gets an anonymous user the first time they need an identity
 * (see lib/identity.ts), so reports, confirmations, comments, preferences and
 * push subscriptions all hang off a real `users` row from the start. Creating
 * an account later attaches an email and password to that same row — see
 * lib/account.ts — so none of it has to move.
 */

const DAY = 60 * 60 * 24;
const IS_PROD = process.env.NODE_ENV === "production";

/** Better Auth's camelCase field names mapped onto snake_case columns. */
function snake<T extends string>(fields: readonly T[]): Record<T, string> {
  return Object.fromEntries(
    fields.map((field) => [field, field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)]),
  ) as Record<T, string>;
}

/**
 * The only auth endpoints a browser may call. Sign-up is not among them: a new
 * account is always an upgrade of the visitor's guest user, done server-side by
 * POST /api/account, so a direct sign-up cannot strand their history on the
 * guest. Anonymous sign-in is server-side too, from lib/identity.ts.
 */
const PUBLIC_AUTH_PATHS = new Set([
  "/get-session",
  "/sign-out",
  "/sign-in/email",
  "/verify-email",
  "/send-verification-email",
  "/request-password-reset",
  "/reset-password",
  "/reset-password/:token",
]);

const lockDownAuth = createAuthMiddleware(async (ctx) => {
  if (ctx.request && !PUBLIC_AUTH_PATHS.has(ctx.path)) {
    throw new APIError("NOT_FOUND", { message: "Not available." });
  }
});

/**
 * Sends an account email unless that inbox has had too many lately.
 *
 * Every path that emails someone (sign-up, an unconfirmed sign-in, a reset
 * request) can be triggered by a stranger, and the per-address limits do not
 * stop several addresses aiming at one inbox. Keyed on a hash of the
 * recipient, so the address itself is never stored.
 */
async function sendAccountEmail(mail: OutgoingEmail): Promise<void> {
  const recipient = createHash("sha256").update(mail.to.toLowerCase()).digest("hex").slice(0, 32);
  const { limit, windowMs } = LIMITS.accountEmailPerRecipient;
  const allowed = await consumeRateLimit(`email:to:${recipient}`, limit, windowMs);
  if (!allowed.allowed) {
    console.warn("[auth] account email skipped: recipient over its hourly limit");
    return;
  }
  await sendEmail(mail);
}

/** Lets an email go out after the response, so its timing reveals nothing. */
function inBackground(promise: Promise<unknown>): void {
  const logged = promise.catch((error) =>
    console.error("[auth] background task failed:", error instanceof Error ? error.message : error),
  );
  try {
    getCloudflareContext().ctx.waitUntil(logged);
  } catch {
    // Outside a Worker the process stays up, so the promise simply finishes.
  }
}

function baseURL(): string {
  const url = process.env.BETTER_AUTH_URL?.trim() ?? "";
  // A live server must know its own https address: it decides secure cookies
  // and the links in every email.
  if (IS_PROD && process.env.NEXT_PHASE !== "phase-production-build" && !/^https:\/\/|^http:\/\/localhost(:\d+)?$/.test(url)) {
    throw new Error("BETTER_AUTH_URL must be the site's https:// address in production.");
  }
  return url || "http://localhost:3000";
}

/** The full configuration; exported so tests can check it against the schema. */
export function authOptions() {
  const url = baseURL();

  return {
    appName: "Dimspot",
    baseURL: url,
    basePath: "/api/auth",
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: [url],
    database: getPool(),

    user: {
      modelName: "users",
      fields: snake(["emailVerified", "createdAt", "updatedAt"] as const),
    },
    session: {
      modelName: "sessions",
      fields: snake(["expiresAt", "createdAt", "updatedAt", "ipAddress", "userAgent", "userId"] as const),
      // A guest identity is meant to last like the old guest cookie did: a year,
      // renewed while in use. Losing it means losing "confirmed by me" state.
      expiresIn: 365 * DAY,
      updateAge: DAY,
    },
    account: {
      modelName: "accounts",
      fields: snake([
        "accountId",
        "providerId",
        "userId",
        "accessToken",
        "refreshToken",
        "idToken",
        "accessTokenExpiresAt",
        "refreshTokenExpiresAt",
        "createdAt",
        "updatedAt",
      ] as const),
    },
    verification: {
      modelName: "verifications",
      fields: snake(["expiresAt", "createdAt", "updatedAt"] as const),
    },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url: link }) => {
        await sendAccountEmail(
          linkEmail(
            user.email,
            "Reset your Dimspot password",
            "Someone asked to reset the password for this Dimspot account.",
            "Choose a new password",
            link,
            "The link works once and expires in an hour. If this wasn't you, ignore this email.",
          ),
        );
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      // Off on purpose. The link goes to whoever owns the address, but the
      // account it confirms was set up by whoever typed the address in — so
      // signing the clicker in could put a stranger's browser into an account
      // someone else holds the password to. The person who created the account
      // is already signed in on their own device (it is the same user), and
      // anywhere else they sign in with their password.
      autoSignInAfterVerification: false,
      expiresIn: DAY,
      sendVerificationEmail: async ({ user, url: link }) => {
        await sendAccountEmail(
          linkEmail(
            user.email,
            "Confirm your Dimspot account",
            "Confirm this address to finish creating your Dimspot account.",
            "Confirm my email",
            link,
            "The link expires in 24 hours. If you didn't create an account, ignore this email.",
          ),
        );
      },
    },

    databaseHooks: {
      session: {
        create: {
          // PRD 6.3 asks for minimal personal data, and nothing reads these.
          before: async (session) => ({
            data: { ...session, ipAddress: null, userAgent: null },
          }),
        },
      },
      user: {
        update: {
          // Confirming the address is what makes an upgraded guest a full
          // account, as Supabase's is_anonymous flag used to work.
          before: async (data) =>
            data.emailVerified === true ? { data: { ...data, isAnonymous: false } } : undefined,
        },
      },
    },

    hooks: { before: lockDownAuth },

    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "auth_rate_limits",
      fields: snake(["lastRequest"] as const),
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/request-password-reset": { window: 60 * 60, max: 5 },
        "/send-verification-email": { window: 60 * 60, max: 5 },
        "/reset-password": { window: 60 * 60, max: 10 },
      },
    },

    advanced: {
      cookiePrefix: "dimspot",
      useSecureCookies: IS_PROD,
      // Cloudflare sets this to the real visitor address; nothing else is trusted.
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      database: {
        generateId: "uuid",
        // A new instance is built per Worker request (connections cannot be
        // shared across requests), and validation would introspect the
        // database on every one. tests/db/auth-schema.test.ts checks it instead.
        validateSchema: false,
      },
      backgroundTasks: { handler: inBackground },
    },

    plugins: [
      anonymous({
        // Signing in to a different account leaves the guest's history with
        // the guest, as it always has; deleting the guest would cascade-delete
        // its confirmations and comments.
        disableDeleteAnonymousUser: true,
        schema: { user: { fields: { isAnonymous: "is_anonymous" } } },
      }),
      nextCookies(), // must stay last
    ],
  } satisfies BetterAuthOptions;
}

function createAuth() {
  return betterAuth(authOptions());
}

export type Auth = ReturnType<typeof createAuth>;

const byRequest = new WeakMap<object, Auth>();
let shared: Auth | null = null;

/**
 * The auth instance for the current request.
 *
 * It holds the request's database pool, and a Worker may not reuse I/O from
 * one request in another, so each Worker request builds its own.
 */
export function getAuth(): Auth {
  let request: object | null = null;
  try {
    request = getCloudflareContext();
  } catch {
    request = null;
  }

  if (!request) return (shared ??= createAuth());

  let auth = byRequest.get(request);
  if (!auth) {
    auth = createAuth();
    byRequest.set(request, auth);
  }
  return auth;
}
