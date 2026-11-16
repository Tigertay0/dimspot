// Creates the Hyperdrive config, or points an existing one at a new connection
// string, without the password being typed, pasted or printed.
//
// Usage:
//   node scripts/hyperdrive.mjs create <name> <worker-url-file>
//   node scripts/hyperdrive.mjs update <id> <worker-url-file>
//
// The URL file holds the outage_worker connection string for the Neon main
// branch (direct host, not pooled), as written by scripts/create-worker-role.mjs.
// Query caching is disabled so every read sees the latest write.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const [action, target, file] = process.argv.slice(2);
if (!["create", "update"].includes(action) || !target || !file) {
  console.error("Usage: node scripts/hyperdrive.mjs <create <name> | update <id>> <worker-url-file>");
  process.exit(1);
}

const url = new URL(readFileSync(file, "utf8").trim());
const password = decodeURIComponent(url.password);
const args = [
  "wrangler",
  "hyperdrive",
  action,
  target,
  "--origin-host", url.hostname,
  "--origin-port", url.port || "5432",
  "--database", url.pathname.replace(/^\//, ""),
  "--origin-user", decodeURIComponent(url.username),
  // Read from the file by this script, so it is never typed or printed. It is
  // briefly visible to local processes as wrangler's argv; wrangler has no
  // environment variable for it.
  "--origin-password", password,
  "--caching-disabled",
];

const result = spawnSync("npx", args, {
  encoding: "utf8",
  shell: process.platform === "win32",
  input: "",
});

const redact = (text) => (text ?? "").split(password).join("<redacted>");
process.stdout.write(redact(result.stdout));
process.stderr.write(redact(result.stderr));
process.exit(result.status ?? 1);
