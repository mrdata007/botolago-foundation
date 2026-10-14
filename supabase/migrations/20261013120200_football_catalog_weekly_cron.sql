-- BotolaGO Production V2
-- Weekly schedule of the SofaScore catalog refresh.
-- Documentation: docs/backend/SOFASCORE_CATALOG_AND_STANDINGS.md.
--
-- pg_cron `football-catalog-weekly` (Sundays 04:17 UTC) calls the Edge Function
-- football-live-refresh with {"job":"catalog_weekly"}: for every club with an
-- active SofaScore team mapping, the squad is read and the fields of
-- ALREADY-MAPPED players and clubs are refreshed, and a bounded number of club
-- crests (and, if switched on in the function's secrets, player images) are
-- copied into our own storage. See 20261013120100 for what it may write.
--
-- Gates, all read here and again in the function:
--   * the live refresh switch, app_private.notification_email_settings
--     .football_live_refresh_enabled, and functions_base_url. Off: `disabled`,
--     nothing is called. This is the same switch that pauses the live and
--     season refresh before a write (AGENTS.md), so one command pauses all
--     three.
--   * the data source, app_private.football_data_source():
--       sofascore    the function reads and writes;
--       shadow       the function reads the squads, logs what it would change
--                    and downloads and writes nothing;
--       sportsmonks  `skipped_source`: SportsMonks has no catalog job here.
-- It does not use app_private.football_refresh_invoke: that guards the fixture
-- jobs from each other, and this job writes no fixture. It takes a different
-- lock per club or player image inside the database, so an overlap with a live
-- tick cannot corrupt a row.

create or replace function app_private.football_catalog_weekly_tick()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings app_private.notification_email_settings%rowtype;
  source text := app_private.football_data_source();
  request bigint;
begin
  select * into settings from app_private.notification_email_settings where id;
  if not coalesce(settings.football_live_refresh_enabled, false)
    or settings.functions_base_url is null then
    return 'disabled';
  end if;
  if source not in ('sofascore', 'shadow') then
    return 'skipped_source';
  end if;
  request := app_private.invoke_scheduled_function(
    settings.functions_base_url, 'football-live-refresh', jsonb_build_object('job', 'catalog_weekly')
  );
  if request is null then
    return 'not_configured';
  end if;
  return 'invoked';
end;
$$;

revoke all on function app_private.football_catalog_weekly_tick()
  from public, anon, authenticated, service_role;
comment on function app_private.football_catalog_weekly_tick() is
  'pg_cron entry point (weekly): while the live refresh switch is on and the data source is sofascore or shadow, calls the Edge Function football-live-refresh with {"job":"catalog_weekly"}. Writes nothing itself.';

select cron.schedule(
  'football-catalog-weekly',
  '17 4 * * 0',
  'select app_private.football_catalog_weekly_tick();'
);
