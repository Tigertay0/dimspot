"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * Account actions (PRD section 4.3).
 *
 * The important case is the first one: a visitor who has already been using the
 * app is an *anonymous* user, not a session-less browser. Their reports,
 * confirmations and comments are all foreign-keyed to that user id. So creating
 * an account attaches credentials to the existing user rather than making a new
 * one — POST /api/account does that server-side (lib/account.ts) — and nothing
 * they contributed is orphaned.
 *
 * Signing in to a *different*, existing account is a different act and does
 * replace the guest session. That is correct — those contributions belong to
 * the guest identity, not to the account being opened — but it is worth saying
 * out loud in the UI, which `AuthSheet` does.
 *
 * The other actions talk to Better Auth's endpoints under /api/auth directly;
 * they are plain JSON POSTs, so no client library is shipped for them.
 */

export interface AuthOutcome {
  /** False when the account exists but the address still needs confirming. */
  signedIn: boolean;
  email: string | null;
  /** True when this upgraded an existing guest rather than creating a user. */
  upgraded: boolean;
}

class AuthRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = "AuthRequestError";
  }
}

/** Better Auth's error codes, said the way the rest of the app talks. */
const FRIENDLY: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "That email and password don't match an account.",
  INVALID_TOKEN: "That link has expired or was already used. Request a new one.",
  PASSWORD_TOO_SHORT: "That password is too short.",
  PASSWORD_TOO_LONG: "That password is too long.",
};

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body ?? {}),
  });

  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    code?: string;
  };

  if (!response.ok) {
    const code = data.code ?? null;
    const message =
      (code && FRIENDLY[code]) ||
      data.error ||
      data.message ||
      (response.status === 429
        ? "You are doing that too often. Try again shortly."
        : "Something went wrong. Please try again.");
    throw new AuthRequestError(message, response.status, code);
  }

  return data as T;
}

/** Every cached query is identity-scoped, so none of it survives a switch. */
function useResetIdentity() {
  const queryClient = useQueryClient();

  return async () => {
    await queryClient.invalidateQueries();
  };
}

/**
 * Create an account.
 *
 * Upgrades the current guest in place. The address has to be confirmed before
 * the account can sign in, so the caller is always told to check their email.
 */
export function useCreateAccount() {
  const reset = useResetIdentity();

  return useMutation<AuthOutcome, Error, { email: string; password: string }>({
    mutationFn: (credentials) => post<AuthOutcome>("/api/account", credentials),
    onSuccess: reset,
  });
}

/** Sign in to an existing account, replacing whatever session is current. */
export function useSignIn() {
  const reset = useResetIdentity();

  return useMutation<AuthOutcome, Error, { email: string; password: string }>({
    mutationFn: async ({ email, password }) => {
      try {
        await post("/api/auth/sign-in/email", { email, password });
        return { signedIn: true, email, upgraded: false };
      } catch (error) {
        // An unconfirmed account cannot sign in; the server has just sent a
        // fresh confirmation link, which is the useful thing to say.
        if (error instanceof AuthRequestError && error.code === "EMAIL_NOT_VERIFIED") {
          return { signedIn: false, email, upgraded: false };
        }
        throw error;
      }
    },
    onSuccess: reset,
  });
}

/**
 * Sign out.
 *
 * The next request with no session mints a fresh anonymous user, so the app
 * stays usable — signing out returns someone to guest mode rather than to a
 * locked door.
 */
export function useSignOut() {
  const reset = useResetIdentity();

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      await post("/api/auth/sign-out", {});
    },
    onSuccess: reset,
  });
}

/**
 * Send a password reset email. Succeeds whether or not the address has an
 * account, so it cannot be used to find out who does.
 */
export function useResetPassword() {
  return useMutation<void, Error, { email: string }>({
    mutationFn: async ({ email }) => {
      await post("/api/auth/request-password-reset", {
        email,
        // The emailed link lands back on the map with ?auth=reset&token=…
        redirectTo: "/?auth=reset",
      });
    },
  });
}

/** Set a new password with the token from a reset email. */
export function useSetNewPassword() {
  return useMutation<void, Error, { token: string; newPassword: string }>({
    mutationFn: async ({ token, newPassword }) => {
      await post("/api/auth/reset-password", { token, newPassword });
    },
  });
}
