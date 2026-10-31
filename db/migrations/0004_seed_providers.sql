-- The provider list the filter menu and the report form offer.
--
-- Same ids as the live database (copied from Supabase), so this is a no-op
-- there and seeds a fresh branch. Add or rename providers in a new migration.

INSERT INTO providers (id, slug, name, service_type, logo_url, official_status_url) VALUES
  ('53bd5e1c-8672-4a72-92e9-4897afdabbf0', 'att', 'AT&T', 'cellular', '/icons/providers/att.png', NULL),
  ('87810bc0-be3f-42ab-bcfa-fd50ee29f02c', 'cricket', 'Cricket Wireless', 'cellular', '/icons/providers/cricket.png', NULL),
  ('f71a4925-780d-42ec-9045-9b8824588eb7', 'metro', 'Metro by T-Mobile', 'cellular', '/icons/providers/metro.png', NULL),
  ('c4d54be7-4525-408f-bb2c-0b0250d95176', 'tmobile', 'T-Mobile', 'cellular', '/icons/providers/tmobile.png', NULL),
  ('d29bb6fa-2dc8-49f8-a414-2b1125a48d42', 'uscellular', 'US Cellular', 'cellular', '/icons/providers/uscellular.png', NULL),
  ('d17baf0d-5efc-4479-bed5-bc97e9f83cc4', 'verizon', 'Verizon', 'cellular', '/icons/providers/verizon.png', NULL),
  ('9f4d7c84-d3c7-4a31-aeb9-ab91b5c0434d', 'att-internet', 'AT&T Internet', 'internet', '/icons/providers/att-internet.png', NULL),
  ('56d2daf3-636f-43a6-ba6e-e6ea30e040ff', 'centurylink', 'CenturyLink', 'internet', '/icons/providers/centurylink.png', NULL),
  ('5a739d38-15bc-48c0-8eed-440ba680c3bb', 'xfinity', 'Comcast / Xfinity', 'internet', '/icons/providers/comcast.png', NULL),
  ('ddf9f990-7ca0-480a-bf44-0f41f8c71153', 'cox', 'Cox', 'internet', '/icons/providers/cox.png', NULL),
  ('2515e5e4-b074-4d50-a083-d4849cc1cc54', 'frontier', 'Frontier', 'internet', '/icons/providers/frontier.png', NULL),
  ('f4589239-07e7-4da9-809f-e54b4c0b3b17', 'google-fiber', 'Google Fiber', 'internet', '/icons/providers/google-fiber.png', NULL),
  ('4277bdd9-8637-4a15-b73e-bab16f2de487', 'spectrum', 'Spectrum', 'internet', '/icons/providers/spectrum.png', NULL),
  ('87892202-8668-407a-923e-1a743e866065', 'fios', 'Verizon Fios', 'internet', '/icons/providers/verizon-fios.png', NULL),
  ('bec2b00e-cb2c-4a17-acc8-8c5f4d86f1af', 'water', 'Municipal water', 'other', NULL, NULL),
  ('f8a33308-e1e1-4be2-82fa-123c054a493b', 'voip', 'VoIP provider', 'other', NULL, NULL),
  ('931f9c35-7350-4d10-8b8f-f31ea0fc7c56', 'coned', 'Con Edison', 'power', NULL, NULL),
  ('cd93b0d4-e7f6-4505-b266-f02871701964', 'duke', 'Duke Energy', 'power', NULL, NULL),
  ('64357f57-f95b-4ca8-ba33-5e99682979b6', 'fpl', 'Florida Power & Light', 'power', NULL, NULL),
  ('5b13fece-32ba-482a-a6fc-4245f2c6b80b', 'local-power', 'Local power company', 'power', NULL, NULL),
  ('eb5dd06f-b301-4693-bfdc-ee09fb100e24', 'oncor', 'Oncor', 'power', NULL, NULL),
  ('9908f45a-5df1-468e-a457-3f5bc38105bf', 'pge', 'PG&E', 'power', NULL, NULL)
ON CONFLICT DO NOTHING;
