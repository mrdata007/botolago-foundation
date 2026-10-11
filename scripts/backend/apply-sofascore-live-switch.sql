-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migrations 20261011090000_football_data_source_switch and
-- 20261011100000_football_sofascore_live_snapshot (PR 422): the data-source
-- switch for the Edge Function football-live-refresh (app_private.football_data_source_settings,
-- app_private.football_data_source(), app_private.football_data_source_configure(text),
-- api.football_data_source()) and the read helper api.football_sofascore_live_snapshot().
-- The switch is installed reading 'sportsmonks', so nothing reads anything
-- differently until the owner flips it. The Edge Function is deployed separately.
-- Runbook: docs/production/SOFASCORE_LIVE_RELEASE_RUNBOOK.md
--
-- HOW TO RUN
--   Check nothing else is writing (AGENTS.md). Then run the WHOLE file. As
--   shipped it is a REHEARSAL (rolled back; "Rehearsal passed"). Change
--   `rollback;` near the bottom to `commit;` and run again ("Applied"). A
--   failed check stops it with nothing saved; do not edit a check to make it pass.
--
-- WHAT IT DOES
--   * refuses to run twice (either version already recorded, or any of the
--     objects already present), while a pg_cron job is mid-run, and where an
--     object these migrations depend on is missing;
--   * records both migration files whole in supabase_migrations.schema_migrations
--     and runs each from that record once its sha256 matches the repository file;
--   * checks the result: the switch exists and reads 'sportsmonks', the three
--     functions are security definer with an empty search_path, only the service
--     role may execute the two api ones, nobody but the owner the app_private
--     ones, and the settings table forces row level security and is readable
--     by no API role.
--   The four function definitions are pinned by md5, measured by the
--   database-quality CI job on a database built from the migrations (run
--   38110909523, "SofaScore switch function md5").
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
begin
  if exists (select 1 from supabase_migrations.schema_migrations
              where version in ('20261011090000', '20261011100000')) then
    raise exception 'stop: migration 20261011090000 or 20261011100000 is already recorded as applied';
  end if;
  -- Any run not finished blocks: a recent one, and an older one whose
  -- backend is still alive (a record left behind by a crash does not).
  if exists (select 1 from cron.job_run_details run
    where run.status not in ('succeeded', 'failed')
      and (run.start_time > statement_timestamp() - interval '15 minutes'
        or exists (select 1 from pg_stat_activity activity where activity.pid = run.job_pid))) then
    raise exception 'stop: a scheduled (pg_cron) job is running right now -- nothing was saved; run this again in a minute';
  end if;
  if to_regclass('app_private.football_data_source_settings') is not null
    or to_regprocedure('app_private.football_data_source()') is not null
    or to_regprocedure('app_private.football_data_source_configure(text)') is not null
    or to_regprocedure('api.football_data_source()') is not null
    or to_regprocedure('api.football_sofascore_live_snapshot()') is not null then
    raise exception 'stop: the football data source settings or one of the functions already exists';
  end if;
  -- What the migrations call or read.
  if to_regprocedure('app_private.is_service_request()') is null
    or to_regprocedure('app_private.write_notification_audit(text,uuid,uuid,uuid,uuid,jsonb)') is null
    or to_regclass('app_private.football_provider_mappings') is null
    or to_regclass('app.fixtures') is null then
    raise exception 'stop: an object these migrations depend on is missing -- production is not the state they were written for';
  end if;
end
$preflight$;

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261011090000',
  'football_data_source_switch',
  array[$bg_20261011090000_file$-- Data-source switch for the live football refresh.
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
$bg_20261011090000_file$]
);

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261011100000',
  'football_sofascore_live_snapshot',
  array[$bg_20261011100000_file$-- Read helper for the SofaScore path of the football-live-refresh Edge Function.
--
-- The Edge Function needs, in one call, (a) every active SofaScore provider
-- mapping, to turn SofaScore ids into internal ids, and (b) the current state of
-- the fixtures mapped to SofaScore, to write only what changed and to know which
-- mapped fixtures are in play. PostgREST exposes the `api` schema only, and
-- api.resolve_football_mapping resolves one id per call (and writes
-- last_seen_at), so no existing api function returns this. This one is a pure
-- read: service role only, security definer, search_path '', no write, no table.
--
-- Same shape as the SELECT in scripts/backend/sofascore-live-shadow-compare.ts.

create or replace function api.football_sofascore_live_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  return jsonb_build_object(
    'mappings', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'provider_name', m.provider_name,
        'entity_type', m.entity_type::text,
        'external_id', m.external_id,
        'internal_entity_id', m.internal_entity_id,
        'active', m.active) order by m.entity_type::text, m.external_id), '[]'::jsonb)
      from app_private.football_provider_mappings m
      where m.provider_name = 'sofascore' and m.active
    ),
    'fixtures', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id,
        'externalId', m.external_id,
        'kickoffAt', f.kickoff_at,
        'status', f.status::text,
        'period', f.period::text,
        'homeScore', f.home_score,
        'awayScore', f.away_score,
        'providerUpdatedAt', f.provider_updated_at,
        'sourceSequence', f.source_sequence,
        'finalizedAt', f.finalized_at) order by f.kickoff_at, f.id), '[]'::jsonb)
      from app_private.football_provider_mappings m
      join app.fixtures f on f.id = m.internal_entity_id
      where m.provider_name = 'sofascore' and m.entity_type = 'fixture' and m.active
    )
  );
end;
$$;

revoke all on function api.football_sofascore_live_snapshot()
  from public, anon, authenticated, service_role;
grant execute on function api.football_sofascore_live_snapshot() to service_role;

comment on function api.football_sofascore_live_snapshot() is
  'Service role, read only: the active SofaScore provider mappings and the current state of the fixtures mapped to SofaScore, for the football-live-refresh Edge Function.';
$bg_20261011100000_file$]
);

do $apply$
declare
  part_20261011090000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261011090000'
  );
  part_20261011100000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261011100000'
  );
begin
  if encode(sha256(convert_to(part_20261011090000, 'UTF8')), 'hex')
    is distinct from 'e44e96eb3300dd94c8ce0cbc747885f72202494b40edfae7386f1d81ad753cb7' then
    raise exception 'stop: 20261011090000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;
  if encode(sha256(convert_to(part_20261011100000, 'UTF8')), 'hex')
    is distinct from '5be9e149f269ea1c99996343ddf15239029d5764fac0f4346f54cffee55a5402' then
    raise exception 'stop: 20261011100000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261011090000;
  execute part_20261011100000;
end
$apply$;

do $postflight$
declare
  problems text[] := '{}';
  fn regprocedure;
  api_fns constant regprocedure[] := array[
    'api.football_data_source()'::regprocedure,
    'api.football_sofascore_live_snapshot()'::regprocedure];
  all_fns constant regprocedure[] := array[
    'app_private.football_data_source()'::regprocedure,
    'app_private.football_data_source_configure(text)'::regprocedure,
    'api.football_data_source()'::regprocedure,
    'api.football_sofascore_live_snapshot()'::regprocedure];
begin
  if (select count(*) from app_private.football_data_source_settings) <> 1
    or app_private.football_data_source() is distinct from 'sportsmonks' then
    problems := problems || 'the switch is missing or does not read sportsmonks'::text;
  end if;
  foreach fn in array all_fns loop
    if not exists (select 1 from pg_proc p
        where p.oid = fn and p.prosecdef and coalesce(p.proconfig, '{}') && array['search_path=""']) then
      problems := problems || ('not security definer with an empty search_path: ' || fn::text);
    end if;
    if has_function_privilege('public', fn, 'execute')
      or has_function_privilege('anon', fn, 'execute')
      or has_function_privilege('authenticated', fn, 'execute') then
      problems := problems || ('callable by anon, authenticated or public: ' || fn::text);
    end if;
  end loop;
  foreach fn in array api_fns loop
    if not has_function_privilege('service_role', fn, 'execute') then
      problems := problems || ('the service role cannot call ' || fn::text);
    end if;
  end loop;
  foreach fn in array array['app_private.football_data_source()'::regprocedure,
      'app_private.football_data_source_configure(text)'::regprocedure] loop
    if has_function_privilege('service_role', fn, 'execute') then
      problems := problems || ('the service role can call ' || fn::text);
    end if;
  end loop;
  if not (select relrowsecurity and relforcerowsecurity from pg_class
      where oid = 'app_private.football_data_source_settings'::regclass)
    or has_table_privilege('anon', 'app_private.football_data_source_settings', 'select')
    or has_table_privilege('authenticated', 'app_private.football_data_source_settings', 'select')
    or has_table_privilege('service_role', 'app_private.football_data_source_settings', 'select')
    or has_table_privilege('public', 'app_private.football_data_source_settings', 'select') then
    problems := problems || 'the settings table is readable by an API role or lacks forced RLS'::text;
  end if;
  -- Exactly the reviewed definitions (md5 of pg_get_functiondef, CI run 38110909523).
  if md5(pg_get_functiondef('app_private.football_data_source()'::regprocedure))
       <> '6122e1f6c15d0e120f31424a4d970313'
    or md5(pg_get_functiondef('app_private.football_data_source_configure(text)'::regprocedure))
       <> 'e1bac99bd3512b590b8066747de3d9b4'
    or md5(pg_get_functiondef('api.football_data_source()'::regprocedure))
       <> '94a8db78908cbb7a55541e0709021a5f'
    or md5(pg_get_functiondef('api.football_sofascore_live_snapshot()'::regprocedure))
       <> 'e39415311b09f4a5cb29e96897d0d88f' then
    problems := problems || 'a function definition is not the reviewed version (md5)'::text;
  end if;
  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261011100000')
    then 'Applied. The data-source switch reads sportsmonks; deploy football-live-refresh next.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
