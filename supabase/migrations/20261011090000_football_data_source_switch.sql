-- Data-source switch for the live football refresh.
--
-- BotolaGO is moving its live football data from SportsMonks to SofaScore
-- (docs/backend/SOFASCORE_FULL_MIGRATION_PLAN.md, phase P5). This migration
-- only adds the switch; nothing reads anything differently until the owner
-- flips it, and the default is `sportsmonks`, which is today's behaviour.
--
--   sportsmonks  the Edge Function football-live-refresh reads SportsMonks and
--                writes, exactly as before (default)
--   sofascore    SofaScore is the live source
--   shadow       SportsMonks writes; SofaScore is computed and logged only
--
-- The Edge Function reads the source through api.football_data_source() on
-- every call. Until the SofaScore path lands, `sofascore` and `shadow` make it
-- answer `source_not_implemented` without writing or calling any provider.
--
-- Where it lives: a small singleton table of its own, not a column on
-- app_private.notification_email_settings. That table is the email/notification
-- switchboard and app_private.notification_email_configure has a fixed
-- signature that three pgTAP suites and the runbooks call positionally; adding
-- a column would mean replacing that function for a setting that is not about
-- email. The cron ticks (football_live_refresh_tick, football_season_refresh_tick)
-- are untouched too: they still wake the Edge Function with the same body and
-- the function reads the source itself, so a tick's behaviour cannot change.
-- The table follows the neighbouring settings tables: RLS enabled and forced,
-- every grant revoked.
--
-- Read the switch:
--   select app_private.football_data_source();
-- Flip it (database owner only; recorded in the notification operational audit):
--   select app_private.football_data_source_configure('shadow');
--   select app_private.football_data_source_configure('sportsmonks');
-- AGENTS.md: pause the football refresh jobs before a write that touches
-- fixtures, as for any other change to them.

create table app_private.football_data_source_settings (
  id boolean primary key default true,
  source text not null default 'sportsmonks',
  updated_at timestamptz not null default statement_timestamp(),
  constraint football_data_source_settings_singleton check (id),
  constraint football_data_source_settings_source_check
    check (source in ('sportsmonks', 'sofascore', 'shadow'))
);
comment on table app_private.football_data_source_settings is
  'Which provider the live football refresh reads: sportsmonks (default), sofascore, or shadow (SportsMonks writes, SofaScore logged only). Single row; change it with app_private.football_data_source_configure.';
insert into app_private.football_data_source_settings (id) values (true);
alter table app_private.football_data_source_settings enable row level security;
alter table app_private.football_data_source_settings force row level security;
revoke all on app_private.football_data_source_settings from public, anon, authenticated, service_role;

create or replace function app_private.football_data_source()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select settings.source from app_private.football_data_source_settings settings where settings.id),
    'sportsmonks'
  );
$$;
revoke all on function app_private.football_data_source() from public, anon, authenticated, service_role;

-- Owner switch (database owner only, like notification_email_configure).
create or replace function app_private.football_data_source_configure(p_source text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  previous text;
  result app_private.football_data_source_settings%rowtype;
begin
  if p_source is null or p_source not in ('sportsmonks', 'sofascore', 'shadow') then
    raise exception using errcode = '22023', message = 'football_data_source_invalid';
  end if;
  select settings.source into previous
  from app_private.football_data_source_settings settings where settings.id for update;
  update app_private.football_data_source_settings
  set source = p_source, updated_at = statement_timestamp()
  where id
  returning * into result;
  perform app_private.write_notification_audit(
    'football_data_source_configured',
    p_metadata := jsonb_build_object('source', result.source, 'previousSource', previous)
  );
  return jsonb_build_object('source', result.source, 'updatedAt', result.updated_at);
end;
$$;
revoke all on function app_private.football_data_source_configure(text)
  from public, anon, authenticated, service_role;

-- What the Edge Function reads: the source, nothing else.
create or replace function api.football_data_source()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.football_data_source();
$$;
revoke all on function api.football_data_source() from public, anon, authenticated, service_role;
grant execute on function api.football_data_source() to service_role;
