-- Fixes from the nightly code review.

-- ---------------------------------------------------------------------------
-- outages.status had no NOT NULL, unlike service_type and severity beside it.
--
-- A CHECK constraint does not catch this: `NULL IN ('active', …)` evaluates to
-- NULL, not FALSE, so the existing CHECK accepts an explicit NULL. Such a row
-- would be invisible to every query in the app — search_outages filters on
-- `status = 'active' OR (status = 'resolved' AND …)`, and the partial index
-- idx_outages_status_service_type does the same — so it could never be seen,
-- confirmed or resolved, but would sit in the table forever.
--
-- Nothing writes a NULL status today (the app always inserts 'active' and the
-- resolution trigger writes 'resolved'), so the backfill below should be a
-- no-op; it is here so this migration cannot fail on data that predates it.
-- ---------------------------------------------------------------------------

UPDATE outages SET status = 'active' WHERE status IS NULL;

ALTER TABLE outages ALTER COLUMN status SET NOT NULL;

-- ---------------------------------------------------------------------------
-- providers.slug is the provider's identity everywhere outside the database:
-- lib/data/postgres-repo.ts maps it onto Provider.id and Outage.providerId,
-- both non-nullable in TypeScript. A unique index does not imply NOT NULL —
-- Postgres allows any number of NULLs in one — so a slugless row would have
-- surfaced as `id: null` and quietly broken that contract.
--
-- No backfill: there is no defensible value to invent for a missing slug. If
-- this fails, a provider row genuinely has none and wants a human decision.
-- ---------------------------------------------------------------------------

ALTER TABLE providers ALTER COLUMN slug SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Finish the DELETE audit 0005 started.
--
-- 0005 revoked DELETE on users and all writes on providers. The app never
-- deletes from these two either — a comment and a resolution vote are part of
-- an outage's record, and the only DELETEs anywhere in the code are against
-- outage_confirmations, push_subscriptions, advisories, sessions, verifications
-- and the two rate-limit tables. Narrowing the grant to what the code actually
-- does bounds the damage any future SQL bug on these tables can do.
--
-- `accounts` is deliberately left alone: Better Auth owns that table and its
-- statements are not visible in this repo, so revoking DELETE there risks
-- breaking a reset or sign-up path for no measurable gain.
-- ---------------------------------------------------------------------------

REVOKE DELETE ON outage_comments, outage_resolutions FROM outage_app;
