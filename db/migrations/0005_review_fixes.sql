-- Fixes from the database review of the Neon port.

-- ---------------------------------------------------------------------------
-- Concurrent confirmations (or resolution votes) on one outage deadlocked.
--
-- The foreign key check on the child insert takes FOR KEY SHARE on the outage
-- row, then the trigger asked for FOR UPDATE, which conflicts with the other
-- transaction's key share: two people confirming at once each waited on the
-- other until Postgres aborted one. FOR NO KEY UPDATE does not conflict with
-- KEY SHARE, still serialises the two triggers, and is the lock the UPDATE
-- that follows takes anyway.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_outage_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  target_outage UUID;
  confirm_count INTEGER;
BEGIN
  target_outage := COALESCE(NEW.outage_id, OLD.outage_id);

  PERFORM 1 FROM outages WHERE id = target_outage FOR NO KEY UPDATE;

  SELECT COUNT(*) INTO confirm_count
  FROM outage_confirmations
  WHERE outage_id = target_outage;

  UPDATE outages
  SET verification_count = confirm_count,
      is_verified = confirm_count >= 5
  WHERE id = target_outage;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION apply_resolution_votes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  votes INTEGER;
  reporter UUID;
BEGIN
  SELECT reported_by INTO reporter
  FROM outages WHERE id = NEW.outage_id
  FOR NO KEY UPDATE;

  SELECT COUNT(*) INTO votes
  FROM outage_resolutions WHERE outage_id = NEW.outage_id;

  IF votes >= 2 OR reporter = NEW.user_id THEN
    UPDATE outages
    SET status = 'resolved', resolved_at = COALESCE(resolved_at, NOW())
    WHERE id = NEW.outage_id AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- push_targets could not use its spatial index: the radius is per row. A fixed
-- outer bound (the 50-mile maximum the settings allow) lets the GIST index
-- prefilter before the per-subscriber radius is checked.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION push_targets(
  outage_lat DOUBLE PRECISION,
  outage_lng DOUBLE PRECISION,
  outage_severity TEXT,
  exclude_user UUID DEFAULT NULL
)
RETURNS TABLE (endpoint TEXT, keys JSONB, settings JSONB, timezone TEXT)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH severity_rank(name, rank) AS (
    VALUES ('intermittent', 1), ('degraded', 2), ('complete', 3)
  ),
  point AS (
    SELECT ST_SetSRID(ST_MakePoint(outage_lng, outage_lat), 4326)::geography AS at
  )
  SELECT s.endpoint, s.keys, s.settings, s.timezone
  FROM push_subscriptions s, point
  WHERE COALESCE((s.settings->>'enabled')::BOOLEAN, FALSE)
    AND (exclude_user IS NULL OR s.user_id <> exclude_user)
    AND s.center IS NOT NULL
    AND ST_DWithin(s.center, point.at, 50 * 1609.344)
    AND ST_DWithin(
      s.center,
      point.at,
      LEAST(COALESCE((s.settings->>'radiusMiles')::DOUBLE PRECISION, 5), 50) * 1609.344
    )
    AND (SELECT rank FROM severity_rank WHERE name = outage_severity)
        >= COALESCE(
             (SELECT rank FROM severity_rank WHERE name = s.settings->>'severityThreshold'),
             3
           )
  ORDER BY ST_Distance(s.center, point.at)
  LIMIT 500;
$$;

-- ---------------------------------------------------------------------------
-- Indexes nothing uses, or that repeat another index's leading column. Map
-- searches go through the geometry expression indexes; the unique
-- (outage_id, user_id) constraints already index outage_id.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS idx_outages_location;
DROP INDEX IF EXISTS idx_advisories_location;
DROP INDEX IF EXISTS idx_confirmations_outage_id;
DROP INDEX IF EXISTS idx_resolutions_outage_id;
DROP INDEX IF EXISTS idx_outages_status;

-- ---------------------------------------------------------------------------
-- Housekeeping. consume_rate_limit only clears the bucket it is counting, so
-- abandoned buckets, expired sessions and spent tokens stayed forever. The
-- ingest cron calls this every run.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_rate_limit_occurred_at ON rate_limit_events (occurred_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_verifications_expires_at ON verifications (expires_at);

CREATE FUNCTION prune_stale_rows()
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  removed INTEGER := 0;
  n INTEGER;
BEGIN
  -- The longest rate-limit window is an hour.
  DELETE FROM rate_limit_events WHERE occurred_at < NOW() - INTERVAL '1 day';
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;

  DELETE FROM auth_rate_limits
  WHERE last_request < (EXTRACT(EPOCH FROM NOW() - INTERVAL '1 day') * 1000)::BIGINT;
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;

  DELETE FROM sessions WHERE expires_at < NOW();
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;

  DELETE FROM verifications WHERE expires_at < NOW();
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;

  RETURN removed;
END;
$$;

-- ---------------------------------------------------------------------------
-- Privileges. Functions are executable by PUBLIC by default; these return
-- subscriber keys or write on the caller's behalf, so only the app's role
-- keeps them, and functions added later start that way too.
-- ---------------------------------------------------------------------------

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION
  push_targets(DOUBLE PRECISION, DOUBLE PRECISION, TEXT, UUID),
  consume_rate_limit(TEXT, INTEGER, INTEGER),
  sync_official_outages(TEXT, JSONB),
  prune_expired_advisories(),
  prune_stale_rows()
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  push_targets(DOUBLE PRECISION, DOUBLE PRECISION, TEXT, UUID),
  consume_rate_limit(TEXT, INTEGER, INTEGER),
  sync_official_outages(TEXT, JSONB),
  prune_expired_advisories(),
  prune_stale_rows()
TO outage_app;

-- The app never deletes users (guests are kept, deleting one would cascade its
-- history away) and never edits the provider list.
REVOKE DELETE ON users FROM outage_app;
REVOKE INSERT, UPDATE, DELETE ON providers FROM outage_app;
