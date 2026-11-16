// Creates (or rotates the password of) the login role the Worker uses: outage_worker.
// It owns nothing and can only do what the outage_app group role allows
// (db/migrations/0003_app_role.sql): read and write rows, call the app's
// functions. Hyperdrive connects with it.
//
// Usage: node scripts/create-worker-role.mjs <owner-url-file> <output-file>
// Writes the worker's connection string to <output-file> (keep it out of git)
// and prints nothing secret.
import { randomBytes } from "node:crypto";
import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import pg from "pg";

const [ownerFile, out] = process.argv.slice(2);
if (!ownerFile || !out) {
  console.error("Usage: node scripts/create-worker-role.mjs <owner-url-file> <output-file>");
  process.exit(1);
}

const ROLE = "outage_worker";
const ownerUrl = readFileSync(ownerFile, "utf8").trim();
const password = randomBytes(24).toString("base64url"); // 192 bits, URL-safe
const client = new pg.Client({ connectionString: ownerUrl });
await client.connect();
const tmp = `${out}.tmp`;
try {
  // Write a temp file first: a bad path fails before the live password
  // changes, and the real file is only replaced once the role is set.
  const url = new URL(ownerUrl);
  url.username = ROLE;
  url.password = password;
  url.searchParams.delete("channel_binding");
  writeFileSync(tmp, url.toString(), { mode: 0o600 });

  const exists = (await client.query("select 1 from pg_roles where rolname = $1", [ROLE])).rowCount > 0;
  const pw = client.escapeLiteral(password);
  // A role name cannot be a bound parameter, so it is quoted the same way the
  // database name below already is. ROLE is a constant today; escaping it now
  // means a later change that reads it from argv cannot become an injection.
  const role = client.escapeIdentifier(ROLE);
  if (exists) {
    await client.query(`alter role ${role} with login inherit nosuperuser nocreaterole nocreatedb nobypassrls password ${pw}`);
  } else {
    await client.query(`create role ${role} with login inherit nosuperuser nocreaterole nocreatedb nobypassrls password ${pw}`);
  }
  await client.query(`grant outage_app to ${role}`);
  // The client-side query timeout only stops waiting; these stop the server
  // holding row locks for a Worker request that has already gone away.
  await client.query(`alter role ${role} set statement_timeout = '20s'`);
  await client.query(`alter role ${role} set lock_timeout = '5s'`);
  await client.query(`alter role ${role} set idle_in_transaction_session_timeout = '15s'`);
  await client.query(`grant connect on database ${client.escapeIdentifier(client.database)} to ${role}`);
  renameSync(tmp, out);
  console.log(`${exists ? "rotated" : "created"} ${ROLE}; connection string written to ${out}`);
} catch (err) {
  // Never leave a connection string whose password was not set.
  try { unlinkSync(tmp); } catch {}
  throw err;
} finally {
  await client.end();
}
