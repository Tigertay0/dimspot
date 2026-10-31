// Applies db/migrations/*.sql in name order, once each, inside a transaction per file.
//
// Usage: node scripts/migrate.mjs [path-to-file-holding-the-url]
//
// The URL must be the Neon owner role on the direct (not pooled) host: the
// Worker's own login cannot change the schema. It comes from the file given as
// the argument, or MIGRATION_DATABASE_URL, or MIGRATION_DATABASE_URL in
// .secrets/dev.env (git-ignored). It is never printed.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function databaseUrl() {
  const fromFile = process.argv[2];
  if (fromFile) return readFileSync(fromFile, "utf8").trim();
  if (process.env.MIGRATION_DATABASE_URL) return process.env.MIGRATION_DATABASE_URL;
  const devEnv = join(root, ".secrets", "dev.env");
  if (existsSync(devEnv)) {
    const key = "MIGRATION_DATABASE_URL=";
    const line = readFileSync(devEnv, "utf8").split(/\r?\n/).find((l) => l.startsWith(key));
    if (line) return line.slice(key.length).trim().replace(/^"|"$/g, "");
  }
  throw new Error("No database URL: pass a file, set MIGRATION_DATABASE_URL, or fill it in .secrets/dev.env.");
}

const client = new pg.Client({ connectionString: databaseUrl() });
await client.connect();
try {
  await client.query(
    "create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const applied = new Set((await client.query("select name from public._migrations")).rows.map((r) => r.name));
  const dir = join(root, "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into public._migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log(`applied ${file}`);
      ran++;
    } catch (err) {
      await client.query("rollback");
      throw new Error(`${file} failed: ${err.message}`);
    }
  }
  console.log(ran ? `${ran} migration(s) applied` : "database is up to date");
} finally {
  await client.end();
}
