import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

/**
 * Postgres access.
 *
 * On the live site, queries go through Cloudflare Hyperdrive (the HYPERDRIVE
 * binding in wrangler.jsonc), which keeps warm connections to Neon. Elsewhere
 * — `next dev`, tests, scripts — DATABASE_URL is used directly. With neither,
 * the app runs on the seeded in-memory store (see lib/data).
 */

// A query that hangs fails after this long instead of leaving a request open.
const QUERY_TIMEOUT_MS = 15_000;
const CONNECT_TIMEOUT_MS = 10_000;
const EXPECTED_CLOSE = /^This socket has been closed\.?$/;

interface WorkerEnv {
  HYPERDRIVE?: { connectionString: string };
}

const IN_WORKER =
  typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

/** The current Worker request's context, or null outside a Worker. */
function workerRequest(): { env: WorkerEnv } | null {
  try {
    return getCloudflareContext() as unknown as { env: WorkerEnv };
  } catch (error) {
    // In a Worker, falling back to one shared pool would reuse connections
    // across requests, which the runtime forbids.
    if (IN_WORKER) throw error;
    return null;
  }
}

function localDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL?.trim();
  return url ? url : null;
}

/**
 * Whether there is a database to talk to, or the demo store should be used.
 *
 * On the live Worker the answer is always yes: a missing binding is a broken
 * deploy, and quietly falling back to the in-memory store would accept reports
 * and then lose them.
 */
export function isDatabaseConfigured(): boolean {
  const request = workerRequest();
  if (request) {
    if (!request.env.HYPERDRIVE?.connectionString) {
      throw new Error("The HYPERDRIVE binding is missing; check wrangler.jsonc.");
    }
    return true;
  }
  return localDatabaseUrl() !== null;
}

function createPool(connectionString: string, inWorker: boolean): Pool {
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
    // A Worker may not reuse a connection from another request, and allows six
    // open at once. Hyperdrive does the pooling on the other side.
    ...(inWorker ? { maxUses: 1, max: 5 } : { max: 5 }),
  });
  // An idle connection the server closes is replaced on next use; unhandled, it
  // would crash the process. In a Worker, ending each used connection
  // (maxUses 1) always reports this closed socket.
  pool.on("error", (error) => {
    if (!EXPECTED_CLOSE.test(error.message)) {
      console.warn(`[db] idle connection closed: ${error.message}`);
    }
  });
  return pool;
}

// One pool per Worker request (the context object is new for each request).
const byRequest = new WeakMap<object, Pool>();
let shared: Pool | null = null;

/** The pool for the current request. Throws when no database is configured. */
export function getPool(): Pool {
  const request = workerRequest();

  if (!request) {
    const url = localDatabaseUrl();
    if (!url) throw new Error("DATABASE_URL is not set.");
    return (shared ??= createPool(url, false));
  }

  let pool = byRequest.get(request);
  if (!pool) {
    const hyperdrive = request.env.HYPERDRIVE?.connectionString;
    if (!hyperdrive) {
      throw new Error("The HYPERDRIVE binding is missing; check wrangler.jsonc.");
    }
    pool = createPool(hyperdrive, true);
    byRequest.set(request, pool);
  }
  return pool;
}

/** Run one parameterised statement and return its rows. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

/** Run `work` inside a transaction on one connection. */
export async function transaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  let broken: Error | undefined;
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch((rollbackError: Error) => {
      // A connection that cannot roll back must not go back into the pool.
      broken = rollbackError;
    });
    throw error;
  } finally {
    client.release(broken);
  }
}

/** Postgres error codes the app handles rather than reporting as a 500. */
export const PG = {
  uniqueViolation: "23505",
  foreignKeyViolation: "23503",
} as const;

/**
 * Errors that mean the value the caller sent cannot be stored — malformed
 * text for a typed column, a NUL byte, a string longer than its column —
 * so the request is wrong, not the server.
 */
const BAD_INPUT_CODES = new Set(["22P02", "22021", "22001", "22003"]);

export function isBadInputError(error: unknown): boolean {
  const code = pgCode(error);
  return code !== null && BAD_INPUT_CODES.has(code);
}

export function pgCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
}

/** pg returns timestamptz as Date; the app's types carry ISO strings. */
export function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
