import "server-only";
import { NextResponse } from "next/server";
import { InvalidInputError } from "./data/repository";
import { isBadInputError } from "./db";
import type { RateLimitResult } from "./rate-limit";

/** Shared response helpers so every route reports errors the same way. */

/** A request body past the size any real client sends. */
export class RequestTooLargeError extends Error {
  constructor() {
    super("That request is too large.");
    this.name = "RequestTooLargeError";
  }
}

/**
 * The largest JSON body a route reads. The biggest honest one is a settings
 * save (twenty saved places, a hundred provider ids), about 10 KB. Without a
 * cap, a field with no length limit was a way to store megabytes per request.
 */
export const MAX_JSON_BYTES = 32 * 1024;

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function badRequest(message: string, fields?: Record<string, string>) {
  return NextResponse.json({ error: message, fields }, { status: 400 });
}

export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function tooMany(result: RateLimitResult) {
  return NextResponse.json(
    {
      error: "You are doing that too often. Try again shortly.",
      retryAfter: result.retryAfter,
    },
    { status: 429, headers: { "Retry-After": String(result.retryAfter) } },
  );
}

/**
 * Convert a thrown error into a response.
 *
 * A bad request from the caller becomes a 400 carrying the reason; anything
 * else becomes a 500 whose detail stays in the server log rather than going to
 * the client.
 */
export function serverError(error: unknown, context: string) {
  if (error instanceof RequestTooLargeError) {
    return NextResponse.json({ error: error.message }, { status: 413 });
  }

  if (error instanceof InvalidInputError) {
    return badRequest(
      error.message,
      error.field ? { [error.field]: error.message } : undefined,
    );
  }

  if (isBadInputError(error)) {
    return badRequest("Part of that request could not be stored. Check what you entered.");
  }

  console.error(`[${context}]`, error);
  return NextResponse.json(
    { error: "Something went wrong on our end." },
    { status: 500 },
  );
}

/**
 * Parse a JSON body, tolerating an empty or malformed one, and refusing one
 * over `maxBytes` (thrown as RequestTooLargeError, which serverError turns
 * into a 413). The declared length is checked first and the stream is counted
 * as it is read, so an oversized body is dropped without being buffered.
 */
export async function readJson(request: Request, maxBytes = MAX_JSON_BYTES): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new RequestTooLargeError();

  let text = "";
  try {
    const reader = request.body?.getReader();
    if (!reader) return {};

    const decoder = new TextDecoder();
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new RequestTooLargeError();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof RequestTooLargeError) throw error;
    return {};
  }

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}
