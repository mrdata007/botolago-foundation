-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261004130000_current_fixture_left_out_limit: raises the left-out limits of
-- 20261004120000 (up to 40 named rows left out, counted apart from the unnamed
-- ones; at least 11 kept), so 19874709 (MAS vs Zemamra) can come in. Owner
-- decision 2026-10-04.
--
-- HOW TO RUN
--   As 20261004120000's script: check nothing else is writing (AGENTS.md), the
--   Fantasy tick must be off, then run the WHOLE file. As shipped it is a
--   REHEARSAL (rolled back; "Rehearsal passed"). Change `rollback;` near the
--   bottom to `commit;` and run again ("Applied"). A failed check stops it
--   with nothing saved; do not edit a check to make it pass.
--
-- WHAT IT DOES
--   * refuses to run twice, before 20261004120000, while the Fantasy tick is
--     on, while a pg_cron job is mid-run, or where the two functions it patches
--     are not production's 2026-10-04 versions (md5 of their definitions);
--   * records the migration file whole in supabase_migrations.schema_migrations
--     and runs it from that record once its sha256 matches the repository file;
--   * checks the result: the new limits are in the import, the scoring check
--     and both coverage constraints, and only the service role can import.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $hold$
begin
  lock table app_private.historical_performance_fixture_coverage in access exclusive mode;
  lock table app.player_fixture_performances in share row exclusive mode;
exception when lock_not_available then
  raise exception 'stop: match statistics are being written right now -- nothing was saved; run this again when that has finished';
end
$hold$;

do $preflight$
begin
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261004130000') then
    raise exception 'stop: migration 20261004130000 is already recorded as applied';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261004120000') then
    raise exception 'stop: migration 20261004120000 (the left-out rule) is not applied -- this update builds on it';
  end if;
  if exists (select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled) then
    raise exception 'stop: the Fantasy lifecycle tick is on -- pause it first with select app_private.fantasy_automation_configure(false);';
  end if;
  if exists (select 1 from cron.job_run_details run
    where run.status not in ('succeeded', 'failed')
      and run.start_time > statement_timestamp() - interval '15 minutes') then
    raise exception 'stop: a scheduled (pg_cron) job is running right now -- nothing was saved; run this again in a minute';
  end if;
  if md5(pg_get_functiondef('api.ingest_current_player_fixture_performance(text,text,text,jsonb,jsonb,timestamptz)'::regprocedure))
      <> 'f4e062c7a04e83a0220bd95b29984bdf'
    or md5(pg_get_functiondef('app_private.fantasy_validate_scoring_document_v1(jsonb)'::regprocedure))
      <> '3e858d5f672a339509b5c3d257541cf1' then
    raise exception 'stop: the functions this update patches are not the versions reviewed on 2026-10-04';
  end if;
end
$preflight$;

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261004130000',
  'current_fixture_left_out_limit',
  array[$bg_20261004130000_file$-- BotolaGO Production V2
-- Raises the left-out limits of 20261004120000 so that a fixture where one
-- side is almost entirely unknown to the catalogue can still come in, when
-- nobody holds any of the players left out.
--
-- WHY. 19874709 (MAS vs Zemamra, GW1): none of Zemamra's 19 lineup players is
-- placeable (13 have no provider mapping, 6 no 2026/27 club record there) and
-- 7 of MAS's 20 are not either: 26 rows to leave out, 13 to keep. The rule
-- capped the rows left out in all at 20 and the rows kept at 22 minimum (the
-- coverage table's bounds from last season's importer), so it refused
-- (LEFT_OUT_ROWS_EXCEEDED) although nobody's points depend on those 26: the
-- only held Zemamra player is the owner-confirmed absent one, and every held
-- MAS player is mapped. Owner decision 2026-10-04: raise the limit.
--
-- WHAT CHANGES. Only the limits. Every check on held players stays as it is.
--   * Left-out (named, unplaceable) rows: at most 40, counted apart from the
--     unnamed rows, which keep their own bound of 20.
--   * Rows kept: at least 11 (one side), and kept plus left out at least 22
--     (every named lineup row is still accounted for).
-- The coverage table's checks, the scoring document's fixture check and the
-- import's own limit are changed to match. The two functions are patched in
-- place (their exact text is replaced once each, and the migration stops if
-- it is not found exactly once), so nothing else in them changes.

alter table app_private.historical_performance_fixture_coverage
  drop constraint historical_performance_coverage_counts_check;
alter table app_private.historical_performance_fixture_coverage
  add constraint historical_performance_coverage_counts_check check (
    lineup_rows_seen between 22 and 100
    and valid_player_rows between 11 and 100
    and valid_player_rows + excluded_mapping_rows >= 22
    and excluded_incomplete_rows - excluded_mapping_rows between 0 and 20
    and lineup_rows_seen = valid_player_rows + excluded_incomplete_rows
    and anonymous_starter_rows between 0 and 22
    and identified_starter_rows = 22 - anonymous_starter_rows
    and team_count = 2 and detail_rows >= 0 and invalid_detail_rows >= 0
    and (coverage_outcome = 'quarantined') = (anonymous_starter_rows > 4)
    and case when coverage_outcome = 'accepted'
      then starter_rows between 0 and identified_starter_rows and performance_rows = valid_player_rows
      else starter_rows = 0 and performance_rows = 0
    end
    and (anonymous_starter_rows = 0
      or source_version ~ '^sportsmonks-(current-)?fixture:[0-9a-f]{64}$')
  );
alter table app_private.historical_performance_fixture_coverage
  drop constraint historical_performance_coverage_mapping_exclusions_check;
alter table app_private.historical_performance_fixture_coverage
  add constraint historical_performance_coverage_mapping_exclusions_check check (
    excluded_mapping_rows between 0 and excluded_incomplete_rows and excluded_mapping_rows <= 40
  );

do $limits$
declare
  definition text;
  old_text text;
  new_text text;
begin
  -- The import (20261004120000).
  definition := pg_get_functiondef(
    'api.ingest_current_player_fixture_performance(text,text,text,jsonb,jsonb,timestamptz)'::regprocedure);
  old_text := '  if jsonb_array_length(left_out) + unnamed_rows > 20 or jsonb_array_length(placed) < 22 then';
  new_text := '  if jsonb_array_length(left_out) > 40 or jsonb_array_length(placed) < 11 then';
  if (length(definition) - length(replace(definition, old_text, ''))) / length(old_text) <> 1 then
    raise exception 'left-out limit: the import is not the 20261004120000 version';
  end if;
  execute replace(definition, old_text, new_text);

  -- The scoring document's fixture check (20261004120000).
  definition := pg_get_functiondef('app_private.fantasy_validate_scoring_document_v1(jsonb)'::regprocedure);
  old_text := '      or coalesce((f#>>''{coverage,excluded_incomplete_rows}'')::integer,-1)
        not between coalesce((f#>>''{coverage,anonymous_starter_rows}'')::integer,0)
          + coalesce((f#>>''{coverage,excluded_mapping_rows}'')::integer,0) and 20';
  new_text := '      or coalesce((f#>>''{coverage,excluded_incomplete_rows}'')::integer,-1)
          - coalesce((f#>>''{coverage,excluded_mapping_rows}'')::integer,0)
        not between coalesce((f#>>''{coverage,anonymous_starter_rows}'')::integer,0) and 20
      or coalesce((f#>>''{coverage,excluded_mapping_rows}'')::integer,0) > 40';
  if (length(definition) - length(replace(definition, old_text, ''))) / length(old_text) <> 1 then
    raise exception 'left-out limit: the scoring check is not the 20261004120000 version';
  end if;
  execute replace(definition, old_text, new_text);
end
$limits$;
$bg_20261004130000_file$]
);

do $apply$
declare
  part_20261004130000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261004130000'
  );
begin
  if encode(sha256(convert_to(part_20261004130000, 'UTF8')), 'hex')
    is distinct from '56fa4c758e72dc662e66568cb92d1aa24fb1159a8d035e40f9b4640af1bbdced' then
    raise exception 'stop: 20261004130000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261004130000;
end
$apply$;

do $postflight$
declare
  problems text[] := '{}';
  ingest constant regprocedure :=
    'api.ingest_current_player_fixture_performance(text,text,text,jsonb,jsonb,timestamptz)'::regprocedure;
begin
  if pg_get_functiondef(ingest) not like '%if jsonb_array_length(left_out) > 40 or jsonb_array_length(placed) < 11 then%'
    or pg_get_functiondef(ingest) like '%+ unnamed_rows > 20 or jsonb_array_length(placed) < 22%' then
    problems := problems || 'the import does not carry the new limit'::text;
  end if;
  if pg_get_functiondef('app_private.fantasy_validate_scoring_document_v1(jsonb)'::regprocedure)
      not like '%excluded_mapping_rows}'')::integer,0) > 40%' then
    problems := problems || 'the scoring check does not carry the new limit'::text;
  end if;
  if (select pg_get_constraintdef(oid) from pg_constraint where conname = 'historical_performance_coverage_counts_check')
      not like '%valid_player_rows >= 11%'
    or (select pg_get_constraintdef(oid) from pg_constraint where conname = 'historical_performance_coverage_mapping_exclusions_check')
      not like '%excluded_mapping_rows <= 40%' then
    problems := problems || 'the coverage constraints do not carry the new limits'::text;
  end if;
  if has_function_privilege('anon', ingest, 'execute')
    or has_function_privilege('authenticated', ingest, 'execute')
    or not has_function_privilege('service_role', ingest, 'execute') then
    problems := problems || 'the statistics import is callable by the wrong roles'::text;
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
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261004130000')
    then 'Applied. The left-out limits are raised.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
