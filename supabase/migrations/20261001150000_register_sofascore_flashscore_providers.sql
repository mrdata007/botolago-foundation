-- BotolaGO Production V2
-- Register the two player-identity providers so a later change can store
-- provider ids and candidates under them. Registration only:
--   * no mapping row is written (app_private.football_provider_mappings and its
--     unique constraints are untouched);
--   * no table, function, grant or policy is created or changed;
--   * nothing reads the new rows yet, so no ingestion, scoring or job changes.
-- Forward-only and idempotent: a provider that is already registered is left
-- exactly as it is (its display name and configuration_version are not changed).
insert into app_private.football_providers (name, display_name)
values
  ('sofascore', 'Sofascore (RapidAPI)'),
  ('flashscore', 'Flashscore (RapidAPI)')
on conflict (name) do nothing;
