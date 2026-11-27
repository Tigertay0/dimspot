-- Abuse hardening, from the security review of the write paths.
--
-- Guest identities are free to mint, so anything that counted identities
-- counted nothing: one address could verify its own report, close anyone
-- else's (official feeds included), and have a fake report pushed to 500
-- phones. Votes now carry a salted hash of the network they came from and are
-- counted by distinct network; alerts wait for a second network; unconfirmed
-- reports expire; idle guests are removed.
--
-- Additive: safe to apply before the code that writes the new columns. Votes
-- written by older code have no hash and count once per user, as before.

-- ---------------------------------------------------------------------------
-- Where a vote came from.
--
-- A salted SHA-256 prefix of the client's network (lib/client-address.ts), not
-- the address: enough to tell two votes came from one place, not where that
-- is. Cleared after 30 days by prune_stale_rows, below.
-- ---------------------------------------------------------------------------

ALTER TABLE outage_confirmations
  ADD COLUMN network_hash TEXT CHECK (network_hash IS NULL OR length(network_hash) <= 64);
ALTER TABLE outage_resolutions
  ADD COLUMN network_hash TEXT CHECK (network_hash IS NULL OR length(network_hash) <= 64);

-- When the nearby-subscribers alert for an outage went out. NULL: not yet.
ALTER TABLE outages ADD COLUMN alerted_at TIMESTAMPTZ;
-- Reports that exist today were alerted when they were filed.
UPDATE outages SET alerted_at = reported_at WHERE origin = 'crowdsourced';

-- When a subscription last received an alert, for the cooldown in push_targets.
ALTER TABLE push_subscriptions ADD COLUMN last_alerted_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- Verified means three distinct networks, not five identities.
--
-- Five guest sessions from one address used to be enough. Three households is
-- a higher bar than that and a lower one than five strangers, which a map with
-- few users never reached. verification_count is now the number of networks.
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

  SELECT COUNT(DISTINCT COALESCE(network_hash, user_id::text)) INTO confirm_count
  FROM outage_confirmations
  WHERE outage_id = target_outage;

  UPDATE outages
  SET verification_count = confirm_count,
      is_verified = confirm_count >= 3
  WHERE id = target_outage;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Bring existing rows onto the new threshold.
UPDATE outages o
SET verification_count = c.n, is_verified = c.n >= 3
FROM (
  SELECT outage_id, COUNT(DISTINCT COALESCE(network_hash, user_id::text))::INTEGER AS n
  FROM outage_confirmations
  GROUP BY outage_id
) c
WHERE o.id = c.outage_id
  AND (o.verification_count IS DISTINCT FROM c.n OR o.is_verified IS DISTINCT FROM (c.n >= 3));

-- ---------------------------------------------------------------------------
-- "It's back" votes.
--
--   * Never on an official outage: the utility's own feed opens and closes
--     those. Two guests could make one vanish from the map until the next poll.
--   * Counted by distinct network, and the more networks confirmed an outage
--     the more it takes to close it: half of them, at least two.
--   * The reporter can still close their own report alone, until it has been
--     verified by others; after that it is no longer theirs to withdraw.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION apply_resolution_votes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  votes INTEGER;
  needed INTEGER;
  reporter UUID;
  outage_origin TEXT;
  confirmations INTEGER;
BEGIN
  SELECT reported_by, origin, COALESCE(verification_count, 0)
  INTO reporter, outage_origin, confirmations
  FROM outages WHERE id = NEW.outage_id
  FOR NO KEY UPDATE;

  IF outage_origin IS DISTINCT FROM 'crowdsourced' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(DISTINCT COALESCE(network_hash, user_id::text)) INTO votes
  FROM outage_resolutions WHERE outage_id = NEW.outage_id;

  needed := GREATEST(2, (confirmations + 1) / 2);

  IF votes >= needed OR (reporter = NEW.user_id AND confirmations < 3) THEN
    UPDATE outages
    SET status = 'resolved', resolved_at = COALESCE(resolved_at, NOW())
    WHERE id = NEW.outage_id AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Alerts: a subscription that was alerted in the last ten minutes is skipped.
-- A storm files many reports in one neighbourhood; one buzz per ten minutes
-- says the same thing, and it caps what any flood of reports can send.
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
    AND (s.last_alerted_at IS NULL OR s.last_alerted_at < NOW() - INTERVAL '10 minutes')
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
-- Guests that never did anything.
--
-- Every first visit mints a user row and a year-long session, and nothing
-- removed them. A guest with no report, vote, comment, saved setting or alert
-- subscription, and no session used in 30 days, has nothing to lose: if they
-- come back they are given a new one. The app's role cannot delete users
-- (0005), so this runs with the owner's rights and does exactly one thing.
-- ---------------------------------------------------------------------------

CREATE FUNCTION prune_idle_guests()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n INTEGER;
BEGIN
  DELETE FROM users
  WHERE id IN (
    SELECT u.id
    FROM users u
    WHERE u.is_anonymous
      AND u.created_at < NOW() - INTERVAL '30 days'
      AND NOT EXISTS (
        SELECT 1 FROM sessions s
        WHERE s.user_id = u.id AND s.updated_at > NOW() - INTERVAL '30 days'
      )
      AND NOT EXISTS (SELECT 1 FROM outages o WHERE o.reported_by = u.id)
      AND NOT EXISTS (SELECT 1 FROM outage_confirmations c WHERE c.user_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM outage_resolutions r WHERE r.user_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM outage_comments m WHERE m.user_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM user_preferences p WHERE p.user_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = u.id)
    -- A bounded bite per run, so a backlog cannot hold locks for long.
    LIMIT 5000
  );
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION prune_idle_guests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prune_idle_guests() TO outage_app;

-- ---------------------------------------------------------------------------
-- Housekeeping, run by the ingest cron every 20 minutes. Adds:
--
--   * Reports nobody else confirmed expire after 12 hours, and any report
--     after 72: a pin with no second voice should not sit on the map for good,
--     and a flood of fakes clears itself. Marked in metadata so it can be told
--     from a real "it's back".
--   * Vote network hashes are dropped after 30 days.
--   * Idle guests are removed.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prune_stale_rows()
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

  UPDATE outages
  SET status = 'resolved',
      resolved_at = NOW(),
      metadata = COALESCE(metadata, '{}'::jsonb) || '{"expired": true}'::jsonb
  WHERE origin = 'crowdsourced'
    AND status = 'active'
    AND (
      (COALESCE(verification_count, 0) <= 1 AND reported_at < NOW() - INTERVAL '12 hours')
      OR reported_at < NOW() - INTERVAL '72 hours'
    );
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;

  UPDATE outage_confirmations SET network_hash = NULL
  WHERE network_hash IS NOT NULL AND confirmed_at < NOW() - INTERVAL '30 days';
  UPDATE outage_resolutions SET network_hash = NULL
  WHERE network_hash IS NOT NULL AND reported_at < NOW() - INTERVAL '30 days';

  removed := removed + prune_idle_guests();

  RETURN removed;
END;
$$;

-- ---------------------------------------------------------------------------
-- One oversized number in a feed must not take the map down.
--
-- customers_affected comes from utility feeds as JSON. A value past the
-- integer range made the ::INTEGER cast throw, and with it every map request
-- whose viewport held that row. Clamped here as well as in the adapters, so a
-- row that is already stored cannot do it either.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION search_outages(
  min_lat DOUBLE PRECISION DEFAULT -90,
  min_lng DOUBLE PRECISION DEFAULT -180,
  max_lat DOUBLE PRECISION DEFAULT 90,
  max_lng DOUBLE PRECISION DEFAULT 180,
  service_types TEXT[] DEFAULT NULL,
  provider_slugs TEXT[] DEFAULT NULL,
  severities TEXT[] DEFAULT NULL,
  resolved_within_hours INTEGER DEFAULT 0,
  max_results INTEGER DEFAULT 1000,
  outage_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID, provider_id UUID, provider_slug VARCHAR, provider_name VARCHAR,
  service_type VARCHAR, severity VARCHAR, status VARCHAR,
  latitude DOUBLE PRECISION, longitude DOUBLE PRECISION,
  address TEXT, city VARCHAR, state VARCHAR, zip_code VARCHAR, description TEXT,
  reported_by UUID, reported_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ,
  estimated_restoration TIMESTAMPTZ, verification_count INTEGER, is_verified BOOLEAN,
  origin VARCHAR, source_name VARCHAR, customers_affected INTEGER, start_known BOOLEAN,
  scope VARCHAR
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  south DOUBLE PRECISION := GREATEST(LEAST(min_lat, max_lat), -90);
  north DOUBLE PRECISION := LEAST(GREATEST(min_lat, max_lat), 90);
  -- The API normalises longitudes into [-180, 180] (lib/geo.ts); the clamp is
  -- for direct callers. A span of 360 or more is the whole world.
  whole_world BOOLEAN := max_lng - min_lng >= 360;
  west  DOUBLE PRECISION := GREATEST(LEAST(min_lng, 180), -180);
  east  DOUBLE PRECISION := GREATEST(LEAST(max_lng, 180), -180);
  box   GEOMETRY;
  box2  GEOMETRY;
BEGIN
  IF whole_world THEN
    box := ST_MakeEnvelope(-180, south, 180, north, 4326);
  ELSIF west <= east THEN
    box := ST_MakeEnvelope(west, south, east, north, 4326);
  ELSE
    -- Crosses the antimeridian.
    box  := ST_MakeEnvelope(west, south, 180, north, 4326);
    box2 := ST_MakeEnvelope(-180, south, east, north, 4326);
  END IF;

  RETURN QUERY
  SELECT
    o.id, o.provider_id, p.slug,
    COALESCE(p.name, LEFT(o.metadata->>'utility_name', 100))::VARCHAR(100),
    o.service_type, o.severity, o.status,
    ST_Y(o.location::geometry), ST_X(o.location::geometry),
    o.address, o.city, o.state, o.zip_code, o.description,
    o.reported_by, o.reported_at, o.resolved_at, o.estimated_restoration,
    o.verification_count, o.is_verified,
    o.origin, o.source_name,
    CASE WHEN jsonb_typeof(o.metadata->'customers_affected') = 'number'
      THEN LEAST(GREATEST((o.metadata->>'customers_affected')::NUMERIC, 0), 2147483647)::INTEGER END,
    CASE WHEN jsonb_typeof(o.metadata->'start_known') = 'boolean'
      THEN (o.metadata->>'start_known')::BOOLEAN ELSE TRUE END,
    CASE WHEN o.metadata->>'scope' = 'national' THEN 'national' END::VARCHAR
  FROM outages o
  LEFT JOIN providers p ON p.id = o.provider_id
  WHERE
    (
      outage_ids IS NOT NULL
      -- Network-wide: in every viewport, wherever its nominal point is.
      OR o.metadata->>'scope' = 'national'
      OR ST_Intersects(o.location::geometry, box)
      OR (box2 IS NOT NULL AND ST_Intersects(o.location::geometry, box2))
    )
    AND (
      -- A direct lookup (a link or a notification) still loads a resolved
      -- outage; only active and resolved ones are ever public.
      (outage_ids IS NOT NULL AND o.status IN ('active', 'resolved'))
      OR o.status = 'active'
      OR (
        o.status = 'resolved'
        AND resolved_within_hours > 0
        AND o.resolved_at > NOW() - (resolved_within_hours || ' hours')::INTERVAL
      )
    )
    AND (outage_ids IS NULL OR o.id = ANY(outage_ids))
    AND (service_types IS NULL OR o.service_type = ANY(service_types))
    AND (severities IS NULL OR o.severity = ANY(severities))
    AND (
      provider_slugs IS NULL
      OR array_length(provider_slugs, 1) IS NULL
      OR p.slug = ANY(provider_slugs)
    )
  ORDER BY o.reported_at DESC
  LIMIT max_results;
END;
$$;
