import "server-only";
import { isDatabaseConfigured } from "@/lib/db";
import { LocalRepository } from "./local-repo";
import { PostgresRepository } from "./postgres-repo";
import type { Repository } from "./repository";

/**
 * Backend selection.
 *
 * With a database (the Hyperdrive binding on the live site, DATABASE_URL in
 * development) the app talks to Postgres/PostGIS. Without one it falls back to
 * a seeded in-process store, so a fresh clone runs with `npm run dev` and
 * nothing else. Everything above this module is written against the Repository
 * interface and does not know which one it got.
 */

let postgres: PostgresRepository | null = null;
let local: LocalRepository | null = null;

export function getRepository(): Repository {
  // Decided per call, not cached: on Workers the database is a per-request
  // binding. The repositories themselves hold no connection state.
  if (isDatabaseConfigured()) return (postgres ??= new PostgresRepository());
  return (local ??= new LocalRepository());
}

export { isDatabaseConfigured };
export type { Repository };
export { DEFAULT_PREFERENCES } from "./repository";
