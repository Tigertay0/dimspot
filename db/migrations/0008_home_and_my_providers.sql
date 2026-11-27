-- A saved home and the providers that serve it.
--
-- Preferences held a list of saved map views and a provider filter, but not
-- the two things a person actually has: where they live and who supplies
-- their power, internet and mobile service. With those the app can open on
-- their street, aim alerts at it, and pre-fill a report.
--
--   home          {"label", "latitude", "longitude", "state"} or NULL
--   my_providers  {"power", "internet", "cellular"}: provider slugs, each
--                 optional. Slugs rather than ids, as everywhere else outside
--                 the database.
--
-- Additive, with defaults, so it is safe to apply before the code that reads
-- it is deployed. Rows are scoped to their user like the rest of the table,
-- and are carried over when a guest creates an account.

ALTER TABLE user_preferences
  ADD COLUMN home JSONB,
  ADD COLUMN my_providers JSONB NOT NULL DEFAULT '{}'::jsonb;
