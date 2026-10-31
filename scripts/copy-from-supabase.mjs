// One-off: copies the live data from the old Supabase project into Neon.
//
// Usage:
//   node scripts/copy-from-supabase.mjs <supabase-env-file> <neon-owner-url-file>
//
// The env file needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// (the old .env.local). Rows are read over PostgREST with the service role, a
// page at a time, and written with ON CONFLICT DO NOTHING, so the script can be
// re-run to pick up anything added on the old deployment since the last run
// without touching what is already in Neon. Supabase Auth users are recreated
// with their original ids, so every owner column keeps pointing at the right
// person; their old sessions do not carry over.
//
// Not copied: rate_limit_events (expire within the hour) and schema_version
// (replaced by _migrations). Prints counts only, never credentials.
import { readFileSync } from "node:fs";
import pg from "pg";

const [envFile, urlFile] = process.argv.slice(2);
if (!envFile || !urlFile) {
  console.error("Usage: node scripts/copy-from-supabase.mjs <supabase-env-file> <neon-owner-url-file>");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const SUPABASE = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE || !KEY) throw new Error("The env file needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const PAGE = 1000;

/** Parents first, so foreign keys hold as rows arrive. */
const TABLES = [
  { name: "providers" },
  { name: "outages" },
  { name: "advisories" },
  { name: "outage_confirmations", parents: ["outage", "user"] },
  { name: "outage_resolutions", parents: ["outage", "user"] },
  { name: "outage_comments", parents: ["outage", "user"] },
  { name: "user_preferences", parents: ["user"] },
  { name: "push_subscriptions", parents: ["user"] },
];

async function fetchJson(url, extra = {}) {
  const response = await fetch(url, { headers: { ...headers, ...extra } });
  if (!response.ok) throw new Error(`${new URL(url).pathname}: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
  return { body: await response.json(), response };
}

async function authUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const { body } = await fetchJson(`${SUPABASE}/auth/v1/admin/users?page=${page}&per_page=100`);
    users.push(...body.users);
    if (body.users.length < 100) return users;
  }
}

async function tableRows(table) {
  const rows = [];
  let total = null;
  for (let start = 0; ; start += PAGE) {
    const { body, response } = await fetchJson(`${SUPABASE}/rest/v1/${table}?select=*&order=id.asc`, {
      "Range-Unit": "items",
      Range: `${start}-${start + PAGE - 1}`,
      Prefer: "count=exact",
    });
    total ??= Number(response.headers.get("content-range")?.split("/")[1] ?? NaN);
    rows.push(...body);
    if (body.length < PAGE) break;
  }
  if (Number.isFinite(total) && total !== rows.length) {
    throw new Error(`${table}: read ${rows.length} of ${total} rows`);
  }
  return rows;
}

const client = new pg.Client({ connectionString: readFileSync(urlFile, "utf8").trim() });
await client.connect();

const report = [];
try {
  // Users: recreated with their Supabase ids. Guests get a placeholder address
  // on the reserved .invalid TLD, as Better Auth's anonymous plugin does.
  const users = await authUsers();
  let inserted = 0;
  for (const user of users) {
    const email = user.email?.trim() ? user.email.trim().toLowerCase() : `${user.id}@anonymous.placeholder.invalid`;
    const result = await client.query(
      `INSERT INTO users (id, name, email, email_verified, is_anonymous, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING`,
      [
        user.id,
        user.is_anonymous ? "Anonymous" : "Neighbor",
        email,
        Boolean(user.email_confirmed_at),
        Boolean(user.is_anonymous),
        user.created_at,
        user.updated_at ?? user.created_at,
      ],
    );
    inserted += result.rowCount;
  }
  const userIds = users.map((u) => u.id);
  const { rows: [{ present }] } = await client.query(
    "SELECT count(*)::int AS present FROM users WHERE id = ANY($1::uuid[])",
    [userIds],
  );
  report.push({ table: "users (auth)", source: users.length, inserted, inNeon: present });

  for (const { name, parents = [] } of TABLES) {
    const rows = await tableRows(name);
    // A child whose parent was skipped (say, an official outage Neon's own
    // ingest already holds under another id) is left out rather than failing.
    const conditions = [
      parents.includes("outage") ? "EXISTS (SELECT 1 FROM outages o WHERE o.id = r.outage_id)" : null,
      parents.includes("user") ? "EXISTS (SELECT 1 FROM users u WHERE u.id = r.user_id)" : null,
    ].filter(Boolean);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    let written = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      // Geography columns arrive as hex EWKB, which PostGIS accepts as input.
      const result = await client.query(
        `INSERT INTO ${name}
         SELECT r.* FROM jsonb_populate_recordset(NULL::${name}, $1::jsonb) AS r
         ${where}
         ON CONFLICT DO NOTHING`,
        [JSON.stringify(batch)],
      );
      written += result.rowCount;
    }

    const ids = rows.map((r) => r.id);
    const { rows: [{ present: inNeon }] } = await client.query(
      `SELECT count(*)::int AS present FROM ${name} WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    report.push({ table: name, source: rows.length, inserted: written, inNeon });
  }
} finally {
  await client.end();
}

console.table(report);
const missing = report.filter((r) => r.inNeon !== r.source);
if (missing.length > 0) {
  console.error(`Rows missing from Neon in: ${missing.map((r) => r.table).join(", ")}`);
  process.exit(2);
}
console.log("Every source row is in Neon.");
