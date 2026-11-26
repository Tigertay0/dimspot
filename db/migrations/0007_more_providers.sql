-- More providers, and where each one operates.
--
-- The list had six power companies, so a report from most of the country had
-- to be filed under "Local power company". This seeds the catalog in
-- lib/data/provider-catalog.ts (generated from it; a test keeps the two in
-- step) and adds `regions`: two-letter state codes, used by the report form
-- to list the companies that serve the pin first. Empty means nationwide.
--
-- Existing rows keep their id and name; only their regions are filled in.
-- Additive, so it is safe to apply before the code that reads it is deployed.

ALTER TABLE providers ADD COLUMN regions TEXT[] NOT NULL DEFAULT '{}';

INSERT INTO providers (slug, name, service_type, regions) VALUES
  ('pepco', 'Pepco', 'power', ARRAY['DC','MD']),
  ('bge', 'BGE', 'power', ARRAY['MD']),
  ('delmarva', 'Delmarva Power', 'power', ARRAY['DE','MD']),
  ('potomac-edison', 'Potomac Edison', 'power', ARRAY['MD','WV']),
  ('smeco', 'SMECO', 'power', ARRAY['MD']),
  ('dominion', 'Dominion Energy', 'power', ARRAY['VA','NC','SC']),
  ('novec', 'NOVEC', 'power', ARRAY['VA']),
  ('rappahannock', 'Rappahannock Electric Cooperative', 'power', ARRAY['VA']),
  ('appalachian-power', 'Appalachian Power', 'power', ARRAY['VA','WV','TN']),
  ('mon-power', 'Mon Power', 'power', ARRAY['WV']),
  ('atlantic-city-electric', 'Atlantic City Electric', 'power', ARRAY['NJ']),
  ('pseg', 'PSE&G', 'power', ARRAY['NJ']),
  ('jcpl', 'JCP&L', 'power', ARRAY['NJ']),
  ('peco', 'PECO', 'power', ARRAY['PA']),
  ('ppl', 'PPL Electric', 'power', ARRAY['PA']),
  ('duquesne', 'Duquesne Light', 'power', ARRAY['PA']),
  ('met-ed', 'Met-Ed', 'power', ARRAY['PA']),
  ('penelec', 'Penelec', 'power', ARRAY['PA']),
  ('penn-power', 'Penn Power', 'power', ARRAY['PA']),
  ('west-penn-power', 'West Penn Power', 'power', ARRAY['PA']),
  ('coned', 'Con Edison', 'power', ARRAY['NY']),
  ('orange-rockland', 'Orange & Rockland', 'power', ARRAY['NY','NJ']),
  ('pseg-li', 'PSEG Long Island', 'power', ARRAY['NY']),
  ('national-grid', 'National Grid', 'power', ARRAY['NY','MA']),
  ('nyseg', 'NYSEG', 'power', ARRAY['NY']),
  ('rge', 'RG&E', 'power', ARRAY['NY']),
  ('central-hudson', 'Central Hudson', 'power', ARRAY['NY']),
  ('eversource', 'Eversource', 'power', ARRAY['CT','MA','NH']),
  ('united-illuminating', 'United Illuminating', 'power', ARRAY['CT']),
  ('rhode-island-energy', 'Rhode Island Energy', 'power', ARRAY['RI']),
  ('central-maine-power', 'Central Maine Power', 'power', ARRAY['ME']),
  ('versant', 'Versant Power', 'power', ARRAY['ME']),
  ('green-mountain-power', 'Green Mountain Power', 'power', ARRAY['VT']),
  ('unitil', 'Unitil', 'power', ARRAY['NH','MA']),
  ('duke', 'Duke Energy', 'power', ARRAY['NC','SC','FL','IN','OH','KY']),
  ('santee-cooper', 'Santee Cooper', 'power', ARRAY['SC']),
  ('georgia-power', 'Georgia Power', 'power', ARRAY['GA']),
  ('cobb-emc', 'Cobb EMC', 'power', ARRAY['GA']),
  ('jackson-emc', 'Jackson EMC', 'power', ARRAY['GA']),
  ('alabama-power', 'Alabama Power', 'power', ARRAY['AL']),
  ('huntsville-utilities', 'Huntsville Utilities', 'power', ARRAY['AL']),
  ('mississippi-power', 'Mississippi Power', 'power', ARRAY['MS']),
  ('fpl', 'Florida Power & Light', 'power', ARRAY['FL']),
  ('teco', 'Tampa Electric', 'power', ARRAY['FL']),
  ('jea', 'JEA', 'power', ARRAY['FL']),
  ('ouc', 'OUC', 'power', ARRAY['FL']),
  ('nes', 'Nashville Electric Service', 'power', ARRAY['TN']),
  ('mlgw', 'Memphis Light, Gas and Water', 'power', ARRAY['TN']),
  ('kub', 'Knoxville Utilities Board', 'power', ARRAY['TN']),
  ('epb', 'EPB', 'power', ARRAY['TN']),
  ('lge-ku', 'LG&E and KU', 'power', ARRAY['KY','VA']),
  ('kentucky-power', 'Kentucky Power', 'power', ARRAY['KY']),
  ('entergy', 'Entergy', 'power', ARRAY['AR','LA','MS','TX']),
  ('cleco', 'Cleco', 'power', ARRAY['LA']),
  ('luma', 'LUMA Energy', 'power', ARRAY['PR']),
  ('comed', 'ComEd', 'power', ARRAY['IL']),
  ('ameren', 'Ameren', 'power', ARRAY['IL','MO']),
  ('midamerican', 'MidAmerican Energy', 'power', ARRAY['IA','IL','SD']),
  ('alliant', 'Alliant Energy', 'power', ARRAY['IA','WI']),
  ('dte', 'DTE Energy', 'power', ARRAY['MI']),
  ('consumers-energy', 'Consumers Energy', 'power', ARRAY['MI']),
  ('indiana-michigan-power', 'Indiana Michigan Power', 'power', ARRAY['IN','MI']),
  ('aes-indiana', 'AES Indiana', 'power', ARRAY['IN']),
  ('aes-ohio', 'AES Ohio', 'power', ARRAY['OH']),
  ('aep-ohio', 'AEP Ohio', 'power', ARRAY['OH']),
  ('ohio-edison', 'Ohio Edison', 'power', ARRAY['OH']),
  ('illuminating-company', 'The Illuminating Company', 'power', ARRAY['OH']),
  ('toledo-edison', 'Toledo Edison', 'power', ARRAY['OH']),
  ('we-energies', 'We Energies', 'power', ARRAY['WI']),
  ('wps', 'Wisconsin Public Service', 'power', ARRAY['WI']),
  ('mge', 'Madison Gas and Electric', 'power', ARRAY['WI']),
  ('xcel', 'Xcel Energy', 'power', ARRAY['MN','CO','WI','TX','NM','ND','SD','MI']),
  ('minnesota-power', 'Minnesota Power', 'power', ARRAY['MN']),
  ('otter-tail', 'Otter Tail Power', 'power', ARRAY['MN','ND','SD']),
  ('evergy', 'Evergy', 'power', ARRAY['KS','MO']),
  ('oppd', 'Omaha Public Power District', 'power', ARRAY['NE']),
  ('nppd', 'Nebraska Public Power District', 'power', ARRAY['NE']),
  ('les', 'Lincoln Electric System', 'power', ARRAY['NE']),
  ('black-hills', 'Black Hills Energy', 'power', ARRAY['SD','WY','CO']),
  ('oncor', 'Oncor', 'power', ARRAY['TX']),
  ('centerpoint', 'CenterPoint Energy', 'power', ARRAY['TX','IN']),
  ('aep-texas', 'AEP Texas', 'power', ARRAY['TX']),
  ('tnmp', 'TNMP', 'power', ARRAY['TX']),
  ('austin-energy', 'Austin Energy', 'power', ARRAY['TX']),
  ('cps-energy', 'CPS Energy', 'power', ARRAY['TX']),
  ('pedernales', 'Pedernales Electric Cooperative', 'power', ARRAY['TX']),
  ('el-paso-electric', 'El Paso Electric', 'power', ARRAY['TX','NM']),
  ('oge', 'OG&E', 'power', ARRAY['OK','AR']),
  ('pso', 'PSO', 'power', ARRAY['OK']),
  ('swepco', 'SWEPCO', 'power', ARRAY['AR','LA','TX']),
  ('aps', 'APS', 'power', ARRAY['AZ']),
  ('srp', 'SRP', 'power', ARRAY['AZ']),
  ('tep', 'Tucson Electric Power', 'power', ARRAY['AZ']),
  ('pnm', 'PNM', 'power', ARRAY['NM']),
  ('nv-energy', 'NV Energy', 'power', ARRAY['NV']),
  ('rocky-mountain-power', 'Rocky Mountain Power', 'power', ARRAY['UT','WY','ID']),
  ('idaho-power', 'Idaho Power', 'power', ARRAY['ID','OR']),
  ('northwestern', 'NorthWestern Energy', 'power', ARRAY['MT','SD']),
  ('pge', 'PG&E', 'power', ARRAY['CA']),
  ('sce', 'Southern California Edison', 'power', ARRAY['CA']),
  ('sdge', 'SDG&E', 'power', ARRAY['CA']),
  ('ladwp', 'LADWP', 'power', ARRAY['CA']),
  ('smud', 'SMUD', 'power', ARRAY['CA']),
  ('pacific-power', 'Pacific Power', 'power', ARRAY['OR','WA','CA']),
  ('portland-general', 'Portland General Electric', 'power', ARRAY['OR']),
  ('pse', 'Puget Sound Energy', 'power', ARRAY['WA']),
  ('seattle-city-light', 'Seattle City Light', 'power', ARRAY['WA']),
  ('snohomish-pud', 'Snohomish County PUD', 'power', ARRAY['WA']),
  ('tacoma-power', 'Tacoma Power', 'power', ARRAY['WA']),
  ('avista', 'Avista', 'power', ARRAY['WA','ID']),
  ('heco', 'Hawaiian Electric', 'power', ARRAY['HI']),
  ('chugach', 'Chugach Electric', 'power', ARRAY['AK']),
  ('local-power', 'Local power company', 'power', '{}'),
  ('xfinity', 'Comcast / Xfinity', 'internet', '{}'),
  ('spectrum', 'Spectrum', 'internet', '{}'),
  ('att-internet', 'AT&T Internet', 'internet', '{}'),
  ('fios', 'Verizon Fios', 'internet', ARRAY['NY','NJ','PA','DE','MD','DC','VA','MA','RI']),
  ('cox', 'Cox', 'internet', '{}'),
  ('optimum', 'Optimum', 'internet', ARRAY['NY','NJ','CT']),
  ('centurylink', 'CenturyLink', 'internet', '{}'),
  ('quantum-fiber', 'Quantum Fiber', 'internet', '{}'),
  ('frontier', 'Frontier', 'internet', '{}'),
  ('google-fiber', 'Google Fiber', 'internet', '{}'),
  ('mediacom', 'Mediacom', 'internet', '{}'),
  ('astound', 'Astound (RCN, Wave, Grande)', 'internet', '{}'),
  ('wow', 'WOW!', 'internet', '{}'),
  ('breezeline', 'Breezeline', 'internet', '{}'),
  ('sparklight', 'Sparklight', 'internet', '{}'),
  ('kinetic', 'Kinetic by Windstream', 'internet', '{}'),
  ('brightspeed', 'Brightspeed', 'internet', '{}'),
  ('ziply', 'Ziply Fiber', 'internet', ARRAY['WA','OR','ID','MT']),
  ('metronet', 'Metronet', 'internet', '{}'),
  ('sonic', 'Sonic', 'internet', ARRAY['CA']),
  ('tmobile-home', 'T-Mobile Home Internet', 'internet', '{}'),
  ('verizon-home', 'Verizon 5G Home', 'internet', '{}'),
  ('starlink', 'Starlink', 'internet', '{}'),
  ('hughesnet', 'HughesNet', 'internet', '{}'),
  ('viasat', 'Viasat', 'internet', '{}'),
  ('local-internet', 'Local internet provider', 'internet', '{}'),
  ('verizon', 'Verizon', 'cellular', '{}'),
  ('att', 'AT&T', 'cellular', '{}'),
  ('tmobile', 'T-Mobile', 'cellular', '{}'),
  ('uscellular', 'US Cellular', 'cellular', '{}'),
  ('cricket', 'Cricket Wireless', 'cellular', '{}'),
  ('metro', 'Metro by T-Mobile', 'cellular', '{}'),
  ('boost', 'Boost Mobile', 'cellular', '{}'),
  ('visible', 'Visible', 'cellular', '{}'),
  ('mint', 'Mint Mobile', 'cellular', '{}'),
  ('google-fi', 'Google Fi', 'cellular', '{}'),
  ('xfinity-mobile', 'Xfinity Mobile', 'cellular', '{}'),
  ('spectrum-mobile', 'Spectrum Mobile', 'cellular', '{}'),
  ('straight-talk', 'Straight Talk', 'cellular', '{}'),
  ('consumer-cellular', 'Consumer Cellular', 'cellular', '{}'),
  ('water', 'Municipal water', 'other', '{}'),
  ('gas', 'Natural gas', 'other', '{}'),
  ('landline', 'Landline phone', 'other', '{}'),
  ('voip', 'VoIP provider', 'other', '{}'),
  ('cable-tv', 'Cable TV', 'other', '{}')
ON CONFLICT (slug) DO UPDATE SET regions = EXCLUDED.regions;

-- Feed rows can now name the provider they belong to.
--
-- Official outages carried their utility only as free text in metadata, with
-- provider_id left NULL, so choosing a provider in the filter menu hid every
-- official outage, including that provider's own. A feed row may now carry
-- provider_slug; when it matches a row in providers the outage is linked to
-- it, and the name shown is the catalog's rather than the feed's spelling.
-- A slug that matches nothing, or none at all, behaves exactly as before.
--
-- Same signature, so the EXECUTE grants from 0005 carry over.
CREATE OR REPLACE FUNCTION sync_official_outages(feed_source TEXT, feed_rows JSONB)
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
      provider_slug TEXT,
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
      source_name, source_id, origin, provider_id, service_type, severity, status,
      location, city, state, description, estimated_restoration,
      reported_at, metadata
    )
    SELECT
      feed_source, i.source_id, 'official', p.id, i.service_type, i.severity, 'active',
      ST_SetSRID(ST_MakePoint(i.longitude, i.latitude), 4326)::geography,
      i.city, i.state, i.description, i.estimated_restoration,
      COALESCE(i.reported_at, NOW()), COALESCE(i.metadata, '{}'::jsonb)
    FROM incoming i
    LEFT JOIN providers p ON p.slug = i.provider_slug
    ON CONFLICT (source_name, source_id) WHERE source_name IS NOT NULL
    DO UPDATE SET
      provider_id = EXCLUDED.provider_id,
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

-- Network-wide outages.
--
-- A carrier or an ISP failing across its whole network has no place on a map:
-- the feed names the network, not a location. Such a row carries
-- metadata.scope = 'national' and a nominal point, and until now was only
-- returned to a viewport that happened to contain that point, so someone
-- zoomed in on their own city never saw it. search_outages now returns
-- national rows for every viewport and says which rows they are, so the app
-- can list them as network alerts instead of pinning them to the middle of
-- the country. Every other filter (service type, severity, provider, status)
-- still applies to them.
--
-- The return type gains a column, which Postgres only allows through a drop.
-- Callers select by column name, so the deployed code is unaffected.
DROP FUNCTION search_outages(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION,
  TEXT[], TEXT[], TEXT[], INTEGER, INTEGER, UUID[]
);

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
      THEN (o.metadata->>'customers_affected')::NUMERIC::INTEGER END,
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

REVOKE EXECUTE ON FUNCTION search_outages(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION,
  TEXT[], TEXT[], TEXT[], INTEGER, INTEGER, UUID[]
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION search_outages(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION,
  TEXT[], TEXT[], TEXT[], INTEGER, INTEGER, UUID[]
) TO outage_app;
