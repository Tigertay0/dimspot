import { getSchema } from "better-auth/db";
import { describe, expect, it } from "vitest";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

/**
 * lib/auth.ts turns off Better Auth's runtime schema check (it would
 * introspect the database on every Worker request), so this does it instead:
 * every table and column Better Auth will read or write, under the names
 * lib/auth.ts maps them to, must exist. Catches drift after an upgrade.
 */
describe("Better Auth schema", () => {
  it("matches the tables and columns in db/migrations", async () => {
    const expected = getSchema(authOptions());
    const rows = await query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [Object.keys(expected)],
    );
    const actual = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!actual.has(row.table_name)) actual.set(row.table_name, new Set());
      actual.get(row.table_name)!.add(row.column_name);
    }

    const missing: string[] = [];
    for (const [table, { fields }] of Object.entries(expected)) {
      const columns = actual.get(table);
      if (!columns) {
        missing.push(`table ${table}`);
        continue;
      }
      for (const column of ["id", ...Object.keys(fields)]) {
        if (!columns.has(column)) missing.push(`${table}.${column}`);
      }
    }

    expect(Object.keys(expected).sort()).toEqual(
      ["accounts", "auth_rate_limits", "sessions", "users", "verifications"],
    );
    expect(missing).toEqual([]);
  });
});
