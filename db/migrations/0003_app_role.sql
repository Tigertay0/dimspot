-- What the live Worker's database login may do.
--
-- outage_app is a group role with no login. The login itself (outage_worker,
-- created by scripts/create-worker-role.mjs so its password never lands in a
-- file in git) is a member, so the Worker can read and write rows and call the
-- app's functions, but cannot change the schema, create roles or read the
-- migration history. Migrations run as the Neon owner role.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'outage_app') THEN
    CREATE ROLE outage_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO outage_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO outage_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO outage_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO outage_app;

-- Tables and functions added by later migrations get the same access.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO outage_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO outage_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO outage_app;

-- Reference data and bookkeeping the app only reads, or never touches.
REVOKE INSERT, UPDATE, DELETE ON spatial_ref_sys FROM outage_app;
REVOKE ALL ON _migrations FROM outage_app;
