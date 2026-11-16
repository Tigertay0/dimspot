-- Outage Tracker schema, ported from the live Supabase database (2026-10-31).
--
-- What changed from prisma/migrations/001-010 on Supabase:
--   - Foreign keys to auth.users now point at users (0001_auth.sql).
--   - No row level security, policies or role grants for anon/authenticated:
--     the database is reached only by the app's own server code, and ownership
--     checks live in lib/data/postgres-repo.ts (identity is passed into every
--     write). See 0003_app_role.sql for what the Worker's login may do.
--   - guard_outage_columns is gone: it existed to stop browsers writing
--     protected columns through PostgREST, which no longer exists.
--   - find_outages_in_bounds, find_outages_within_radius and
--     recent_report_count are gone (nothing called them).
--   - No SECURITY DEFINER: every function runs as the caller.
--   - gen_random_uuid() (built in) replaces uuid-ossp's uuid_generate_v4().

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(64),
  name VARCHAR(100) NOT NULL,
  service_type VARCHAR(50) NOT NULL
    CHECK (service_type IN ('power', 'internet', 'cellular', 'other')),
  logo_url VARCHAR(255),
  official_status_url VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_providers_slug ON providers (slug);
CREATE INDEX idx_providers_service_type ON providers (service_type);

CREATE TABLE outages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
  service_type VARCHAR(50) NOT NULL
    CHECK (service_type IN ('power', 'internet', 'cellular', 'other')),
  severity VARCHAR(20) NOT NULL
    CHECK (severity IN ('complete', 'degraded', 'intermittent')),
  status VARCHAR(20) DEFAULT 'active'
    CHECK (status IN ('active', 'resolved', 'disputed')),
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  address TEXT,
  zip_code VARCHAR(10),
  city VARCHAR(100),
  state VARCHAR(50),
  description TEXT,
  reported_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reported_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  estimated_restoration TIMESTAMPTZ,
  verification_count INTEGER DEFAULT 0,
  is_verified BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb,
  origin VARCHAR(20) NOT NULL DEFAULT 'crowdsourced'
    CHECK (origin IN ('crowdsourced', 'official')),
  source_name VARCHAR(64),
  source_id VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_outages_location ON outages USING GIST (location);
CREATE INDEX idx_outages_location_geom ON outages USING GIST ((location::geometry));
CREATE INDEX idx_outages_origin ON outages (origin);
CREATE INDEX idx_outages_provider_id ON outages (provider_id);
CREATE INDEX idx_outages_reported_at ON outages (reported_at DESC);
CREATE INDEX idx_outages_reported_by ON outages (reported_by);
CREATE INDEX idx_outages_service_type ON outages (service_type);
CREATE INDEX idx_outages_severity ON outages (severity);
CREATE INDEX idx_outages_status ON outages (status);
CREATE INDEX idx_outages_status_service_type ON outages (status, service_type);
-- Feed rows are upserted on this; partial so crowdsourced rows (no source) are free.
CREATE UNIQUE INDEX idx_outages_source ON outages (source_name, source_id)
  WHERE source_name IS NOT NULL;

CREATE TABLE outage_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outage_id UUID NOT NULL REFERENCES outages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  confirmed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (outage_id, user_id)
);
CREATE INDEX idx_confirmations_outage_id ON outage_confirmations (outage_id);
CREATE INDEX idx_confirmations_user_id ON outage_confirmations (user_id);

CREATE TABLE outage_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outage_id UUID NOT NULL REFERENCES outages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (outage_id, user_id)
);
CREATE INDEX idx_resolutions_outage_id ON outage_resolutions (outage_id);
CREATE INDEX idx_resolutions_user_id ON outage_resolutions (user_id);

CREATE TABLE outage_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outage_id UUID NOT NULL REFERENCES outages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  comment_type VARCHAR(20) DEFAULT 'update'
    CHECK (comment_type IN ('update', 'resolution', 'escalation')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_comments_outage_id ON outage_comments (outage_id);
CREATE INDEX idx_comments_created_at ON outage_comments (created_at DESC);
CREATE INDEX idx_comments_user_id ON outage_comments (user_id);

CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  saved_providers TEXT[] DEFAULT ARRAY[]::TEXT[],
  saved_locations JSONB DEFAULT '[]'::jsonb,
  notification_settings JSONB DEFAULT '{"enabled": false, "radius_miles": 5, "quiet_hours_end": null, "quiet_hours_start": null, "severity_threshold": "complete"}'::jsonb,
  default_map_center GEOGRAPHY(POINT, 4326),
  default_zoom INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The push service URL is the whole credential for a subscription.
  endpoint TEXT NOT NULL,
  keys JSONB NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  center GEOGRAPHY(POINT, 4326),
  timezone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_push_subscriptions_endpoint ON push_subscriptions (endpoint);
CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions (user_id);
CREATE INDEX idx_push_subscriptions_center ON push_subscriptions USING GIST (center);

CREATE TABLE advisories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name VARCHAR(64) NOT NULL,
  source_id VARCHAR(200) NOT NULL,
  kind VARCHAR(120) NOT NULL,
  severity VARCHAR(20) NOT NULL
    CHECK (severity IN ('complete', 'degraded', 'intermittent')),
  headline TEXT,
  description TEXT,
  area_description TEXT,
  url TEXT,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (source_name, source_id)
);
CREATE INDEX idx_advisories_ends_at ON advisories (ends_at);
CREATE INDEX idx_advisories_location ON advisories USING GIST (location);
CREATE INDEX idx_advisories_location_geom ON advisories USING GIST ((location::geometry));

-- Sliding-window rate limiter shared by every Worker isolate (lib/rate-limit.ts).
CREATE TABLE rate_limit_events (
  id BIGSERIAL PRIMARY KEY,
  bucket TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_rate_limit_bucket_time ON rate_limit_events (bucket, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_providers_updated_at BEFORE UPDATE ON providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_outages_updated_at BEFORE UPDATE ON outages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_push_subscriptions_updated_at BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_advisories_updated_at BEFORE UPDATE ON advisories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- verification_count is derived from confirmations, never written by the app.
CREATE FUNCTION update_outage_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  target_outage UUID;
  confirm_count INTEGER;
BEGIN
  target_outage := COALESCE(NEW.outage_id, OLD.outage_id);

  -- Serialise concurrent confirmations of one outage so the count is exact.
  PERFORM 1 FROM outages WHERE id = target_outage FOR UPDATE;

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

CREATE TRIGGER update_verification_on_confirm AFTER INSERT ON outage_confirmations
  FOR EACH ROW EXECUTE FUNCTION update_outage_verification();
CREATE TRIGGER update_verification_on_unconfirm AFTER DELETE ON outage_confirmations
  FOR EACH ROW EXECUTE FUNCTION update_outage_verification();

-- "It's back for me" is a vote: two people, or the original reporter, resolve it.
CREATE FUNCTION apply_resolution_votes()
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
  FOR UPDATE;

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

CREATE TRIGGER apply_resolution_votes_trigger AFTER INSERT ON outage_resolutions
  FOR EACH ROW EXECUTE FUNCTION apply_resolution_votes();

-- ---------------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------------

CREATE FUNCTION search_outages(
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
  origin VARCHAR, source_name VARCHAR, customers_affected INTEGER, start_known BOOLEAN
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
      THEN (o.metadata->>'customers_affected')::NUMERIC::INTEGER END,
    CASE WHEN jsonb_typeof(o.metadata->'start_known') = 'boolean'
      THEN (o.metadata->>'start_known')::BOOLEAN ELSE TRUE END
  FROM outages o
  LEFT JOIN providers p ON p.id = o.provider_id
  WHERE
    (
      outage_ids IS NOT NULL
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

CREATE FUNCTION search_advisories(
  min_lat DOUBLE PRECISION DEFAULT -90,
  min_lng DOUBLE PRECISION DEFAULT -180,
  max_lat DOUBLE PRECISION DEFAULT 90,
  max_lng DOUBLE PRECISION DEFAULT 180,
  max_results INTEGER DEFAULT 300
)
RETURNS TABLE (
  id UUID, source_name VARCHAR, source_id VARCHAR, kind VARCHAR, severity VARCHAR,
  headline TEXT, description TEXT, area_description TEXT, url TEXT,
  latitude DOUBLE PRECISION, longitude DOUBLE PRECISION,
  starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Same envelope handling as search_outages above.
  south DOUBLE PRECISION := GREATEST(LEAST(min_lat, max_lat), -90);
  north DOUBLE PRECISION := LEAST(GREATEST(min_lat, max_lat), 90);
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
    box  := ST_MakeEnvelope(west, south, 180, north, 4326);
    box2 := ST_MakeEnvelope(-180, south, east, north, 4326);
  END IF;

  RETURN QUERY
  SELECT
    a.id, a.source_name, a.source_id, a.kind, a.severity,
    a.headline, a.description, a.area_description, a.url,
    ST_Y(a.location::geometry), ST_X(a.location::geometry),
    a.starts_at, a.ends_at
  FROM advisories a
  WHERE (
      ST_Intersects(a.location::geometry, box)
      OR (box2 IS NOT NULL AND ST_Intersects(a.location::geometry, box2))
    )
    AND (a.ends_at IS NULL OR a.ends_at > NOW())
  ORDER BY a.starts_at DESC NULLS LAST
  LIMIT max_results;
END;
$$;

-- Apply one feed's full snapshot atomically: upsert what it reports, resolve
-- what it no longer does (lib/ingest/run.ts).
CREATE FUNCTION sync_official_outages(feed_source TEXT, feed_rows JSONB)
RETURNS TABLE (upserted INTEGER, resolved INTEGER)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  n_upserted INTEGER;
  n_resolved INTEGER;
BEGIN
  WITH incoming AS (
    SELECT *
    FROM jsonb_to_recordset(feed_rows) AS r(
      source_id TEXT,
      service_type TEXT,
      severity TEXT,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      city TEXT,
      state TEXT,
      description TEXT,
      estimated_restoration TIMESTAMPTZ,
      reported_at TIMESTAMPTZ,
      metadata JSONB
    )
    WHERE r.source_id IS NOT NULL
  ),
  written AS (
    INSERT INTO outages AS o (
      source_name, source_id, origin, service_type, severity, status,
      location, city, state, description, estimated_restoration,
      reported_at, metadata
    )
    SELECT
      feed_source, i.source_id, 'official', i.service_type, i.severity, 'active',
      ST_SetSRID(ST_MakePoint(i.longitude, i.latitude), 4326)::geography,
      i.city, i.state, i.description, i.estimated_restoration,
      COALESCE(i.reported_at, NOW()), COALESCE(i.metadata, '{}'::jsonb)
    FROM incoming i
    ON CONFLICT (source_name, source_id) WHERE source_name IS NOT NULL
    DO UPDATE SET
      severity = EXCLUDED.severity,
      location = EXCLUDED.location,
      city = EXCLUDED.city,
      state = EXCLUDED.state,
      description = EXCLUDED.description,
      estimated_restoration = EXCLUDED.estimated_restoration,
      metadata = EXCLUDED.metadata,
      reported_at = CASE
        WHEN o.status = 'resolved' THEN EXCLUDED.reported_at
        ELSE LEAST(o.reported_at, EXCLUDED.reported_at)
      END,
      status = 'active',
      resolved_at = NULL
    RETURNING 1
  )
  SELECT count(*) INTO n_upserted FROM written;

  UPDATE outages o
  SET status = 'resolved', resolved_at = NOW()
  WHERE o.source_name = feed_source
    AND o.status = 'active'
    AND o.source_id NOT IN (
      SELECT r->>'source_id'
      FROM jsonb_array_elements(feed_rows) AS r
      WHERE r->>'source_id' IS NOT NULL
    );
  GET DIAGNOSTICS n_resolved = ROW_COUNT;

  RETURN QUERY SELECT n_upserted, n_resolved;
END;
$$;

CREATE FUNCTION prune_expired_advisories()
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  removed INTEGER;
BEGIN
  DELETE FROM advisories
  WHERE ends_at IS NOT NULL AND ends_at < NOW() - INTERVAL '6 hours';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

-- Sliding window per bucket. The advisory lock serialises concurrent hits on
-- one bucket so two requests cannot both take the last slot.
CREATE FUNCTION consume_rate_limit(bucket_key TEXT, max_hits INTEGER, window_seconds INTEGER)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, retry_after INTEGER)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  cutoff TIMESTAMPTZ := NOW() - make_interval(secs => window_seconds);
  hits INTEGER;
  oldest TIMESTAMPTZ;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(bucket_key));

  DELETE FROM rate_limit_events
  WHERE bucket = bucket_key AND occurred_at < cutoff;

  SELECT count(*), min(occurred_at)
  INTO hits, oldest
  FROM rate_limit_events
  WHERE bucket = bucket_key AND occurred_at >= cutoff;

  IF hits >= max_hits THEN
    RETURN QUERY SELECT
      FALSE,
      0,
      GREATEST(
        1,
        CEIL(EXTRACT(EPOCH FROM (oldest + make_interval(secs => window_seconds)) - NOW()))::INTEGER
      );
    RETURN;
  END IF;

  INSERT INTO rate_limit_events (bucket) VALUES (bucket_key);

  RETURN QUERY SELECT TRUE, max_hits - hits - 1, 0;
END;
$$;

-- Subscribers near a new outage whose alert settings it meets.
CREATE FUNCTION push_targets(
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
  )
  SELECT s.endpoint, s.keys, s.settings, s.timezone
  FROM push_subscriptions s
  WHERE COALESCE((s.settings->>'enabled')::BOOLEAN, FALSE)
    AND (exclude_user IS NULL OR s.user_id <> exclude_user)
    AND s.center IS NOT NULL
    AND ST_DWithin(
      s.center,
      ST_SetSRID(ST_MakePoint(outage_lng, outage_lat), 4326)::geography,
      COALESCE((s.settings->>'radiusMiles')::DOUBLE PRECISION, 5) * 1609.344
    )
    AND (SELECT rank FROM severity_rank WHERE name = outage_severity)
        >= COALESCE(
             (SELECT rank FROM severity_rank WHERE name = s.settings->>'severityThreshold'),
             3
           )
  ORDER BY ST_Distance(
    s.center,
    ST_SetSRID(ST_MakePoint(outage_lng, outage_lat), 4326)::geography
  )
  LIMIT 500;
$$;
