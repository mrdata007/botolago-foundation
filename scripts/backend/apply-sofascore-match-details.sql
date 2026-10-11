-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261011110000_football_sofascore_snapshot_teams: adds each
-- fixture's home and away team ids (internal uuids) to the read helper
-- api.football_sofascore_live_snapshot(), which the SofaScore match-details
-- path of the Edge Function football-live-refresh needs. Same signature and
-- grants, pure read. Existing readers ignore the two new keys, so applying it
-- changes nothing by itself. The Edge Function is deployed separately.
-- Runbook: docs/production/SOFASCORE_MATCH_DETAILS_RELEASE_RUNBOOK.md
--
-- HOW TO RUN
--   Check nothing else is writing (AGENTS.md). Then run the WHOLE file. As
--   shipped it is a REHEARSAL (rolled back; "Rehearsal passed"). Change
--   `rollback;` near the bottom to `commit;` and run again ("Applied"). A
--   failed check stops it with nothing saved; do not edit a check to make it pass.
--
-- WHAT IT DOES
--   * refuses to run twice (20261011110000 already recorded), where
--     20261011090000 or 20261011100000 is NOT recorded, while a pg_cron job is
--     mid-run, and where the current api.football_sofascore_live_snapshot() is
--     not the reviewed definition (md5 e39415311b09f4a5cb29e96897d0d88f,
--     measured in CI run 38110909523);
--   * records the migration file whole in supabase_migrations.schema_migrations
--     and runs it from that record once its sha256 matches the repository file;
--   * checks the result: the function is security definer with an empty
--     search_path, only the service role may execute it, and its definition is
--     the reviewed new one (md5 pinned below).
--   BEFORE THE OWNER RUNS THIS: the new md5 below must be filled from the green
--   database-quality CI run ("SofaScore snapshot teams md5" in the step
--   "SofaScore live switch objects"). Until then the postflight stops the run.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
begin
  if exists (select 1 from supabase_migrations.schema_migrations
              where version = '20261011110000') then
    raise exception 'stop: migration 20261011110000 is already recorded as applied';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations
       where version in ('20261011090000', '20261011100000')) <> 2 then
    raise exception 'stop: migration 20261011090000 or 20261011100000 is not recorded -- apply scripts/backend/apply-sofascore-live-switch.sql first';
  end if;
  -- Any run not finished blocks: a recent one, and an older one whose
  -- backend is still alive (a record left behind by a crash does not).
  if exists (select 1 from cron.job_run_details run
    where run.status not in ('succeeded', 'failed')
      and (run.start_time > statement_timestamp() - interval '15 minutes'
        or exists (select 1 from pg_stat_activity activity where activity.pid = run.job_pid))) then
    raise exception 'stop: a scheduled (pg_cron) job is running right now -- nothing was saved; run this again in a minute';
  end if;
  if to_regprocedure('api.football_sofascore_live_snapshot()') is null
    or to_regprocedure('app_private.is_service_request()') is null
    or to_regclass('app_private.football_provider_mappings') is null
    or to_regclass('app.fixtures') is null then
    raise exception 'stop: an object this migration depends on is missing -- production is not the state it was written for';
  end if;
  -- It replaces exactly the definition the previous release installed.
  if md5(pg_get_functiondef('api.football_sofascore_live_snapshot()'::regprocedure))
       is distinct from 'e39415311b09f4a5cb29e96897d0d88f' then
    raise exception 'stop: api.football_sofascore_live_snapshot() is not the reviewed version it was written to replace (md5)';
  end if;
end
$preflight$;

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261011110000',
  'football_sofascore_snapshot_teams',
  array[$bg_20261011110000_file$-- Teams on the SofaScore live snapshot, for the SofaScore match-details path.
--
-- api.football_sofascore_live_snapshot (20261011100000) returns each mapped
-- fixture without its two clubs. Match details must name each club by its
-- SofaScore team id (api.ingest_football_match_details checks that every
-- teamExternalId is one of the fixture's two mapped clubs), and the backfill
-- works from a fixture id alone: without the clubs it would need a fourth
-- provider request per fixture to read them. The snapshot already carries every
-- active SofaScore team mapping, so the internal home and away team ids are all
-- that is missing; the function maps them back to SofaScore ids.
--
-- Same signature and grants; the only change is two more keys per fixture
-- (`homeTeamId`, `awayTeamId`, internal uuids). Existing readers ignore keys
-- they do not know. Pure read, as before.

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
        'finalizedAt', f.finalized_at,
        'homeTeamId', f.home_team_id,
        'awayTeamId', f.away_team_id) order by f.kickoff_at, f.id), '[]'::jsonb)
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
  'Service role, read only: the active SofaScore provider mappings and the current state of the fixtures mapped to SofaScore (with their internal home and away team ids), for the football-live-refresh Edge Function.';
$bg_20261011110000_file$]
);

do $apply$
declare
  part_20261011110000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261011110000'
  );
begin
  if encode(sha256(convert_to(part_20261011110000, 'UTF8')), 'hex')
    is distinct from 'e95501a939f9bb2958aa26e8ba9e3c9daee8de70c93b491a4c8d8ef64562194b' then
    raise exception 'stop: 20261011110000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261011110000;
end
$apply$;

do $postflight$
declare
  problems text[] := '{}';
  fn constant regprocedure := 'api.football_sofascore_live_snapshot()'::regprocedure;
begin
  if not exists (select 1 from pg_proc p
      where p.oid = fn and p.prosecdef and coalesce(p.proconfig, '{}') && array['search_path=""']) then
    problems := problems || 'not security definer with an empty search_path'::text;
  end if;
  if has_function_privilege('public', fn, 'execute')
    or has_function_privilege('anon', fn, 'execute')
    or has_function_privilege('authenticated', fn, 'execute') then
    problems := problems || 'callable by anon, authenticated or public'::text;
  end if;
  if not has_function_privilege('service_role', fn, 'execute') then
    problems := problems || 'the service role cannot call it'::text;
  end if;
  -- Exactly the reviewed new definition (md5 of pg_get_functiondef, from the
  -- green database-quality CI run, "SofaScore snapshot teams md5").
  if md5(pg_get_functiondef(fn)) <> 'FILL_FROM_CI_SNAPSHOT_TEAMS_MD5' then
    problems := problems || 'the function definition is not the reviewed version (md5)'::text;
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
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261011110000')
    then 'Applied. The live snapshot now names each fixture''s clubs; deploy football-live-refresh next.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
