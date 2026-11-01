# Dimspot

Power, internet and cellular outages on one live map. Report what is down where
you are, confirm what other people report, and find out whether the problem is
your router or your whole street.

Live at <https://dimspot.tiger-tayo.workers.dev>. The product spec lives in
[PRD/outage_tracker_prd.md](PRD/outage_tracker_prd.md).

## Run it

```bash
npm install
npm run dev
```

That is the whole setup. With no configuration the app runs against a seeded
in-process store and a no-token basemap, so every feature — map, clustering,
filters, reporting, confirming, comments, timeline, search — works immediately.
A banner makes it clear the outages you see are demo data.

To connect a real database and enable accounts and push notifications, see
[SETUP.md](SETUP.md) and copy [dev.env.example](dev.env.example) to
`.secrets/dev.env`. (Not `.env.local`: the Cloudflare build would ship it.)

## What is built

| Feature | Where |
| --- | --- |
| Zoom-based clustering, severity colouring, verification state | `components/map/` |
| Service, provider and severity filters, persisted per browser | `components/filters/`, `lib/store/filters.ts` |
| Three-step outage report with map-centre pin and reverse geocoding | `components/report/` |
| Confirm, comment, "it's back", derived timeline | `components/outage/` |
| Address / ZIP / city search with autocomplete | `components/search/`, `app/api/geocode/` |
| Distance-sorted list of what is in view | `components/layout/nearby-panel.tsx` |
| Alerts, quiet hours, saved places | `components/layout/settings-sheet.tsx` |
| Web Push fan-out on new reports | `lib/push.ts`, `public/sw.js` |
| Public-feed ingestion, on a schedule | `lib/ingest/`, `app/api/ingest/` |
| Accounts, upgrading a guest in place, password reset | `components/auth/`, `lib/account.ts`, `lib/auth.ts` |
| Storm-warning layer from the National Weather Service | `components/outage/advisory-sheet.tsx` |

## How it is put together

**The stack.** Next.js on Cloudflare Workers through OpenNext; Neon Postgres +
PostGIS reached through Cloudflare Hyperdrive with the `pg` driver; Better Auth
for accounts, with the users in the same database; Cloudflare Email Sending for
verification and reset emails; a Cron Trigger for the public feeds. SETUP.md
has the details and the ids.

**Two interchangeable backends.** Everything above the data layer talks to the
`Repository` interface in `lib/data/repository.ts`. `getRepository()` returns the
Postgres implementation when there is a database and a seeded in-memory one
otherwise. Nothing else in the app knows which it got, which is why a fresh
clone runs without an account anywhere. There is no row level security: the
Postgres repository scopes every write to the identity from the session.

**MapLibre, not Mapbox.** `react-map-gl` supports both. MapLibre with
OpenFreeMap tiles needs no access token and has no request quota, so the map is
not a billing relationship or a signup wall. Point
`NEXT_PUBLIC_MAP_STYLE_URL` at any MapLibre-compatible style — including a
Mapbox one — to change it.

**Guests are first class.** A visitor with no account is a real anonymous user,
so their reports satisfy the same foreign keys as anyone else's. Creating an
account attaches an email and password to that same user rather than making a
second one, so nothing they contributed is orphaned.

**Two kinds of data, kept apart.** Reports come from people; a separate
ingestion layer polls public feeds every 20 minutes. Anything ingested is
marked `origin: 'official'` and badged in the UI, because a confirmation count
means something different for a neighbour's report than for a utility's feed.
Weather warnings go further and live in their own table — a storm is a reason to
expect an outage, not evidence of one.

**Filters and viewport are pushed into SQL.** The map queries
`search_outages` (`db/migrations/0002_app.sql`) with the viewport bounding box
and every active filter, so panning fetches only what is on screen rather than filtering a full
table client-side.

## Commands

```bash
npm run dev         # development server (loads .secrets/dev.env if present)
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # unit tests
npm run test:db     # integration tests against the Neon dev branch
npm run db:migrate  # apply db/migrations to the dev branch
npm run preview     # build for Cloudflare and run the Worker locally
npm run deploy      # build for Cloudflare and deploy
npm run icons       # regenerate the PWA icon set
```

## Not built yet

- Social sign-in. Accounts are email and password only. Better Auth supports
  OAuth providers; none are wired up.
- Deploy on push. CI checks every pull request, but deploys are
  `npm run deploy` from a logged-in machine; no CI job holds a Cloudflare token.
- Live power-outage data. No free feed exists — PowerOutage.us aggregates every
  US utility and charges for it. `lib/ingest/source.ts` is the interface a paid
  source would implement; nothing above the data layer would change.
- The analytics, heatmap and history views (PRD 4.10–4.12).
