# Setup

Dimspot was called Outage Tracker (repo and Worker `outage-app`) until
1 November 2026. The database roles and the `outages` table kept their names.

The live site runs on **Cloudflare Workers** (Next.js through
[OpenNext](https://opennext.js.org/cloudflare)), with data in **Neon Postgres +
PostGIS** reached through **Cloudflare Hyperdrive**, and accounts on
**[Better Auth](https://www.better-auth.com)** with the users stored in that same
database. It lives at <https://dimspot.adetayo.dev>.

## Nothing to set up

```bash
npm install
npm run dev
```

The app runs. No accounts, no API keys, no database.

`getRepository()` in [lib/data/index.ts](lib/data/index.ts) returns a seeded
in-process store when no database is configured, and the map uses MapLibre with
OpenFreeMap tiles, which need no token. Every feature works against demo data,
and a banner says so.

Everything below is optional, and each part can be added on its own.

### Local settings live in `.secrets/dev.env`, not `.env.local`

```bash
mkdir .secrets
cp dev.env.example .secrets/dev.env
```

`npm run dev` loads that file. It is deliberately not a `.env` file: the
Cloudflare build copies every `.env` file it finds into the deployed Worker, so
an old `.env.local` would ship its contents to production. `npm run deploy`
refuses to build while one exists.

---

## Database: Neon + PostGIS

Project `dimspot` (id `hidden-thunder-45493613`) in the Neon org
`org-fancy-wildflower-11294399`, region `aws-us-east-1`, Postgres 17. Two
branches:

| Branch | Used by |
| --- | --- |
| `main` | the live Worker, through Hyperdrive |
| `dev`  | `npm run dev`, `npm run test:db` |

There are two logins on each branch:

- **`neondb_owner`** owns the schema. Migrations and one-off scripts use it.
- **`outage_worker`** is what the app connects as. It can read and write rows
  and call the app's functions, and nothing else: no DDL, no roles, no migration
  history ([`db/migrations/0003_app_role.sql`](db/migrations/0003_app_role.sql)).

Connection strings go in git-ignored files, never in chat or in the repo:

```bash
npx neonctl@latest connection-string dev --project-id hidden-thunder-45493613 \
  --org-id org-fancy-wildflower-11294399 > .secrets/neon-dev-owner.url
```

### Schema and migrations

The schema is plain SQL in [`db/migrations/`](db/migrations), applied in name
order, once each, one transaction per file. Applied files are recorded in
`_migrations`.

```bash
npm run db:migrate                                  # dev branch, from .secrets/dev.env
node scripts/migrate.mjs .secrets/neon-main-owner.url   # live branch
```

Both need the **owner** role (`MIGRATION_DATABASE_URL` in `.secrets/dev.env`).
Add a migration as a new numbered file; never edit one that has been applied.

What the migrations contain:

- `0001_auth.sql`: Better Auth's tables (`users`, `sessions`, `accounts`,
  `verifications`, `auth_rate_limits`), with snake_case columns that
  [`lib/auth.ts`](lib/auth.ts) maps onto.
- `0002_app.sql`: PostGIS, the app's tables, indexes, triggers
  (`verification_count`, resolution votes, `updated_at`) and the functions the
  app calls (`search_outages`, `search_advisories`, `sync_official_outages`,
  `consume_rate_limit`, `push_targets`, `prune_expired_advisories`).
- `0003_app_role.sql`: the `outage_app` group role the Worker's login belongs to.
- `0004_seed_providers.sql`: the providers the filters and report form offer.
- `0005_review_fixes.sql`: deadlock-free confirmation triggers, function
  privileges, index cleanup, `prune_stale_rows`.

There is no row level security. Only the app's server code reaches the database,
and [`lib/data/postgres-repo.ts`](lib/data/postgres-repo.ts) scopes every write
to the identity taken from the session: a confirmation is withdrawn only where
`user_id` is the caller, a comment is attributed to the caller, and so on.

`0004_seed_providers.sql` seeds the provider list a fresh branch needs; it is a
no-op where the providers were copied from Supabase, since the ids match.

### The Worker's login

```bash
node scripts/create-worker-role.mjs .secrets/neon-main-owner.url .secrets/neon-main-worker.url
```

Creates `outage_worker` on that branch, or rotates its password, and writes its
connection string to the output file. After rotating it on `main`, point
Hyperdrive at the new password:

```bash
node scripts/hyperdrive.mjs update 4742c9c0a5b44739ba69bed9c786a48e .secrets/neon-main-worker.url
```

### Hyperdrive

Config `dimspot` (id `4742c9c0a5b44739ba69bed9c786a48e`, binding `HYPERDRIVE`)
points at the `main` branch's direct (not pooled) host as `outage_worker`, with
query caching **off**, so every read sees the latest write.
[`lib/db.ts`](lib/db.ts) builds one `pg` pool per Worker request on its
connection string (a Worker may not reuse a connection across requests);
Hyperdrive keeps the warm connections to Neon.

To run the built Worker locally against the dev branch:

```bash
export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="$(cat .secrets/neon-dev-worker.url)"
npm run preview
```

Local Worker secrets for that go in `.dev.vars` (git-ignored), with
`BETTER_AUTH_URL=http://localhost:8787`.

### Copying data from the old Supabase project

[`scripts/copy-from-supabase.mjs`](scripts/copy-from-supabase.mjs) reads every
table over Supabase's REST API with the service-role key and writes it into
Neon, recreating the Supabase Auth users with their original ids so every owner
column still points at the right person:

```bash
node scripts/copy-from-supabase.mjs <old .env.local> .secrets/neon-main-owner.url
```

It inserts with `ON CONFLICT DO NOTHING`, so it can be re-run to pick up
anything added on the old deployment since the last run, and it fails if any
source row is missing from Neon afterwards. It was run on 31 October 2026 (742
outages, 23 advisories, 22 providers, 30 guest users).

---

## Accounts

Better Auth, configured in [`lib/auth.ts`](lib/auth.ts):

- **Every visitor is a user.** The first request that needs an identity signs
  the visitor in anonymously, server-side ([`lib/identity.ts`](lib/identity.ts)),
  so a guest's reports satisfy the same foreign keys as anyone's.
- **Creating an account upgrades the guest in place.**
  [`lib/account.ts`](lib/account.ts) attaches the email and password to the
  existing user rather than making a new one, so the id, and with it every
  report, confirmation, comment, preference and push subscription, stays put.
  The account becomes permanent when the address is confirmed; until then the
  visitor carries on as a guest. The browser that created the account is
  signed in to it from then on; opening the link elsewhere does not sign that
  browser in (the link proves the inbox, not the password), so other devices
  sign in with the password.
- **Signing in to a different account** replaces the guest session; the guest's
  history stays with the guest, as the account sheet says.
- **Password reset** emails a one-hour, single-use link that lands on the map
  with the new-password form open.

Only these auth endpoints are reachable from a browser: session, sign-in,
sign-out, email verification and password reset. Sign-up and anonymous sign-in
are server-only. Sessions last a year and renew while in use, and store no IP
address or user agent.

Limits: 30 new guests an hour per client address (IPv6 counted per /64), five
account emails an hour per recipient however they were triggered, and Better
Auth's own limits on sign-in and reset requests.

`BETTER_AUTH_SECRET` signs sessions and email links. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

`BETTER_AUTH_URL` is the site's own address. It is a plain var in
[`wrangler.jsonc`](wrangler.jsonc) and must be `https://` in production.

### Email

Verification and reset emails go through
[Cloudflare Email Sending](https://developers.cloudflare.com/email-service/)
(open beta), from `noreply@mail.adetayo.dev`, through the `EMAIL` binding in
[`wrangler.jsonc`](wrangler.jsonc). The sending subdomain is set up once per
account:

```bash
npx wrangler email sending enable mail.adetayo.dev
npx wrangler email sending settings mail.adetayo.dev   # check the DNS records are verified
```

Without the binding (in `npm run dev`), the email is written to the server log
instead, so the link can still be followed. Guest accounts carry a placeholder
address on the reserved `.invalid` domain, and nothing is ever sent to it.

---

## Push notifications

```bash
npx web-push generate-vapid-keys
```

Put the pair in `.secrets/dev.env`, and set them as Worker secrets:

```bash
VAPID_PUBLIC_KEY=BN...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=https://github.com/you/your-repo
```

`VAPID_SUBJECT` is sent to the browser vendors' push services as a way to
contact the operator. It may be a `mailto:` or an `https:` URL; use one you
control. The private key is a secret. Changing the key pair invalidates every
existing browser subscription.

Without these, the Alerts section of Settings explains that push is unavailable
rather than showing a switch that cannot work.

How it works:

- Subscriptions are rows in `push_subscriptions`, one per browser endpoint, with
  the alert settings, a centre point and the browser's IANA time zone.
- `push_targets()` does the matching in SQL — within radius, at or above the
  severity threshold, excluding whoever filed the report.
- Quiet hours are checked in the subscriber's own time zone.
- Fan-out runs in `after()`, which on Workers is the request's `waitUntil`, so
  it finishes after the response is sent.
- Sending uses `web-push`, which works on Workers under `nodejs_compat`.
- Endpoints the push service reports as gone (404/410) are deleted.

The service worker only registers in production builds, so test with
`npm run preview`.

---

## Public-data ingestion

Besides crowdsourced reports, `/api/ingest` polls public feeds and writes what
they return.

```bash
CRON_SECRET=$(openssl rand -base64 32)
```

Put that in `.secrets/dev.env` and set it as a Worker secret. It is required:
the route refuses to run without it instead of defaulting to open.

On the live site a **Cron Trigger** runs it every 20 minutes (`triggers` in
[`wrangler.jsonc`](wrangler.jsonc)). The `scheduled` handler in
[`worker.ts`](worker.ts) sends `/api/ingest` a request carrying the secret
through the app itself, so it gets the same Hyperdrive and env as any other
request. Runs are logged as `[cron] ingest …` in the Worker's logs.

Each run also clears expired sessions, spent email tokens and old rate-limit
rows (`prune_stale_rows`). Each run wakes the Neon compute, which then idles down after five minutes, so a
20-minute schedule keeps it up about a quarter of the time — well inside the
free plan's compute hours.

To run it by hand:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://dimspot.adetayo.dev/api/ingest
```

To check a deployment without holding the secret:

```bash
curl -I https://dimspot.adetayo.dev/api/ingest
```

`x-ingest-writable: false` means the Worker has no database binding.

---

### What it currently pulls

**National Weather Service**: free, no key, good US coverage. Filtered to the
event types that take out power, internet or phones: wind, ice, thunderstorm,
tornado, hurricane, fire, and flooding. All flooding is included, not only
flash events, because substations and street cabinets sit at grade, and on a
quiet weather day flood warnings are often the only relevant US alerts active. That keeps roughly 25–35 of the 215–245 alerts live at any
moment. Alerts carrying a polygon are placed directly; the rest name NWS
forecast zones, which are resolved to a centroid and cached.

These go into `advisories`, not `outages`. A storm warning is a reason to
expect an outage, not evidence of one, and filing it as an outage would put
events on the map where nobody has lost service. The map shows them as a
separate, toggleable layer.

**ODIN** (Outage Data Initiative Nationwide, DOE / Oak Ridge National
Laboratory): free, no key, real power outages. Utilities publish
near-real-time customer counts by county in a common format; about 90 of them
across 30-odd states were reporting when this was added, refreshed hourly. The
bulk export is fetched rather than the paged endpoint, because a sync resolves
whatever is missing from the snapshot and a truncated page would wrongly close
live outages. Rows are aggregated per utility per county, and single-customer
incidents are dropped (see `ODIN_MIN_CUSTOMERS`) — at county granularity one
household is its own service line, not something a neighbour can confirm.

**IODA** (Internet Outage Detection and Analysis, Georgia Tech): free, no key,
internet rather than power. It compares BGP routing, active probing and Google
traffic against each region's own history, so it detects a *region* losing
connectivity and says nothing about one ISP on one street. Two consequences to
know before you judge the layer broken:

- **It is usually empty in the US.** A dense, redundant network rarely drops a
  whole state. Roughly two qualifying events a day nationwide, and quiet weeks
  are normal.
- **Its "critical" is not our "outage".** The level is relative to that region's
  own baseline and fires on drops far too small to matter. In a sample month of
  US alerts, nine sat at 80–99% of normal, including Indiana at 98.8%. Only
  alerts at or below `MAX_NORMAL_RATIO` (50% of normal) are published; the
  remaining 63 of 75 in that sample were genuine collapses, mostly under 20%.

Region-level rows are placed at the state centroid in
[`lib/ingest/us-regions.ts`](lib/ingest/us-regions.ts), since IODA carries no
geometry of its own.

**Cloudflare Radar**: internet again, and the only feed here that gives a
cause. Cloudflare publishes the outages it observes as curated annotations
carrying a cause: cable cut, power outage, government action, maintenance. It
complements IODA. IODA infers an outage from measurements within minutes, and
Radar describes it once a human has characterised it.

This one needs a free token, and is skipped entirely without it:

1. Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens).
2. **Create Token → Create Custom Token.**
3. Permissions: **Account → Radar → Read**. Nothing else is needed.
4. Put it in `.secrets/dev.env` and set it as a Worker secret:

   ```bash
   CLOUDFLARE_RADAR_TOKEN=...
   ```

Radar names places instead of giving coordinates, so a US annotation is drawn
at the first state its scope or description names, and a nationwide event is
drawn at the centre of the country with a description that says so.
Only annotations with no end date are published: Radar closes one when the
outage recovers, which is what lets the sync resolve the row automatically.

### What it does not pull

Street-level detail, and the utilities that stay out of ODIN. PowerOutage.us
aggregates every US utility and charges for it; the DOE's EAGLE-I is bulk
historical. Individual utility outage maps have undocumented JSON endpoints, but
scraping them is fragile and generally against their terms. For internet, the
per-ISP "is Comcast down in my neighbourhood" signal is sold commercially
(Downdetector and similar) and has no free equivalent. IODA answers a coarser
question, and crowdsourced reports cover the rest.

`lib/ingest/source.ts` defines the interface a feed implements, and
`lib/ingest/run.ts` holds the registry — adding a paid source means writing an
adapter and listing it, with nothing above the data layer changing. An
`IngestedOutage` goes into `outages` with `origin = 'official'`, deduplicated
on `(source_name, source_id)`, and rows the feed stops reporting are resolved
automatically.

`lib/ingest/run.ts` runs every source on the same schedule, and one failing feed
never stops the others: a source that throws is reported in the response and its
existing rows are left alone, rather than being resolved as though the outages
had ended.

---

## Basemap

Defaults to [OpenFreeMap](https://openfreemap.org) — no account, no quota. To
use something else, set a MapLibre-compatible style URL:

```bash
NEXT_PUBLIC_MAP_STYLE_URL=https://api.maptiler.com/maps/streets/style.json?key=...
NEXT_PUBLIC_MAP_STYLE_URL_DARK=...
```

If the tile host cannot be reached the map falls back to a blank canvas and
every marker, cluster and interaction still works.

---

## Geocoding

Search and reverse-geocoding proxy through
[`app/api/geocode/route.ts`](app/api/geocode/route.ts) to Nominatim. It is
proxied rather than called from the browser because Nominatim requires an
identifying `User-Agent`, its usage policy caps request rate per source, and
keeping it server-side means a typed address never leaves in a third-party
request carrying the user's referrer.

The public instance is fine for development. Before real traffic, point at a
self-hosted instance or a commercial geocoder:

```bash
NOMINATIM_BASE_URL=https://nominatim.example.com
GEOCODER_USER_AGENT="YourApp/1.0 (contact@example.com)"
GEOCODER_COUNTRY_CODES=us
```

---

## Icons

App icons are generated, not checked in by hand:

```bash
npm run icons
```

[`scripts/generate-icons.mjs`](scripts/generate-icons.mjs) writes the full PWA
set plus `apple-touch-icon.png`. Edit `BRAND` or the `BOLT` polygon in that file
and re-run to change the mark.

---

## Deploying

```bash
npm run deploy
```

Builds with OpenNext (`node -r ./scripts/win-junctions.cjs` makes the build work
on Windows without symlink rights) and deploys the Worker `dimspot`, its
assets, its bindings and the Cron Trigger. `npx wrangler` must be logged in to
the Cloudflare account that owns it.

Configuration lives in two places:

- **[`wrangler.jsonc`](wrangler.jsonc)**: bindings (`HYPERDRIVE`, `EMAIL`), the
  cron schedule, and the public vars `BETTER_AUTH_URL` and `EMAIL_FROM`.
- **Worker secrets**, set with `npx wrangler secret put NAME` (or
  `npx wrangler secret bulk file.json` from a git-ignored file):
  `BETTER_AUTH_SECRET`, `CRON_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`, `RATE_LIMIT_SALT`, `CLOUDFLARE_RADAR_TOKEN`, and optionally
  `NWS_USER_AGENT`, `NOMINATIM_BASE_URL`, `GEOCODER_USER_AGENT`,
  `GEOCODER_COUNTRY_CODES`.

`NEXT_PUBLIC_MAP_STYLE_URL` and `NEXT_PUBLIC_MAP_STYLE_URL_DARK` are read at
build time, so they must be in the environment of the shell that runs
`npm run deploy`, not in Worker secrets.

Schema changes go out before the code that needs them: run the migration
against `main`, then deploy.

`vercel.json` exists only to stop the old Vercel project redeploying on pushes
to `main` (this code has no database there, so it would serve demo data). Delete
it together with the Vercel project once that is switched off.

---

## Troubleshooting

**`npm run deploy` says "Refusing to build: .env.local …".** Move those settings
to `.secrets/dev.env` and delete the file; see the top of this page.

**Every API route under `/api/outages/[id]/…` returns Next's HTML 404 page.**
A stale Turbopack dev cache. Stop the dev server, delete `.next`, restart. Our
own 404s return JSON with an `error` field — an HTML body means the route was
never registered.

**Map is blank but markers and the list work.** The tile host is unreachable and
the fallback style is active. Check `NEXT_PUBLIC_MAP_STYLE_URL` or your network.

**`function search_outages does not exist`, or `relation … does not exist`.**
Migrations have not been run on that branch: `npm run db:migrate`.

**`permission denied for schema public` from `db:migrate`.** It is connecting as
`outage_worker`. Migrations need the owner role (`MIGRATION_DATABASE_URL`).

**Verification or reset emails never arrive.** Check
`npx wrangler email sending settings mail.adetayo.dev` shows the DNS records as
verified, and look for `[auth] background task failed` in the Worker logs.

**Tailwind classes have no effect.** The project is on Tailwind v4, which reads
its theme from `@theme` in [`app/globals.css`](app/globals.css), not from a
`tailwind.config.ts`. Add tokens there.
