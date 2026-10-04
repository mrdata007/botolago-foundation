-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261004140000_fantasy_completion_skips_inactive_leagues: completing a gameweek no longer
-- waits for rankings of switched-off leagues, the same leagues the worker never
-- ranks. Unblocks GW1 (stopped at fantasy_rankings_incomplete, 2026-10-04).
-- Owner decision 2026-10-04.
--
-- HOW TO RUN
--   Check nothing else is writing (AGENTS.md): no Fantasy worker run, the
--   Fantasy tick off. Then run the WHOLE file. As shipped it is a REHEARSAL
--   (rolled back; "Rehearsal passed"). Change `rollback;` near the bottom to
--   `commit;` and run again ("Applied"). A failed check stops it with nothing
--   saved; do not edit a check to make it pass.
--
-- WHAT IT DOES
--   * refuses to run twice, while the Fantasy tick is on, while a pg_cron job
--     is mid-run, or where the completion function is not production's
--     2026-10-04 version (md5 of its definition);
--   * records the migration file whole in supabase_migrations.schema_migrations
--     and runs it from that record once its sha256 matches the repository file;
--   * checks the result: the function is exactly the reviewed new version (md5,
--     measured on a local database built from the migrations) and only the
--     service role can call it.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $hold$
begin
  lock table app.fantasy_gameweeks in share row exclusive mode;
exception when lock_not_available then
  raise exception 'stop: a Fantasy gameweek is being changed right now -- nothing was saved; run this again when that has finished';
end
$hold$;

do $preflight$
begin
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261004140000') then
    raise exception 'stop: migration 20261004140000 is already recorded as applied';
  end if;
  if exists (select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled) then
    raise exception 'stop: the Fantasy lifecycle tick is on -- pause it first with select app_private.fantasy_automation_configure(false);';
  end if;
  -- Any run not finished blocks: a recent one, and an older one whose
  -- backend is still alive (a record left behind by a crash does not).
  if exists (select 1 from cron.job_run_details run
    where run.status not in ('succeeded', 'failed')
      and (run.start_time > statement_timestamp() - interval '15 minutes'
        or exists (select 1 from pg_stat_activity activity where activity.pid = run.job_pid))) then
    raise exception 'stop: a scheduled (pg_cron) job is running right now -- nothing was saved; run this again in a minute';
  end if;
  if md5(pg_get_functiondef('api.service_complete_fantasy_gameweek(uuid,bigint)'::regprocedure))
      <> '775376759e2bff11b82243d94375149a' then
    raise exception 'stop: the completion function is not the version reviewed on 2026-10-04';
  end if;
end
$preflight$;

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261004140000',
  'fantasy_completion_skips_inactive_leagues',
  array[$bg_20261004140000_file$-- BotolaGO Production V2
-- Completing a gameweek no longer waits for rankings of switched-off leagues.
--
-- WHY. The worker ranks the leagues that api.service_fantasy_scoring_league_page
-- lists, and that page lists active leagues only (20260925090500). The
-- completion check (20260914200730) required league rankings for every active
-- membership, whatever the league's state. A team still listed as a member of
-- a switched-off league therefore blocked completion forever
-- (fantasy_rankings_incomplete). Production GW1, 2026-10-04: one team is a
-- member of an inactive end-to-end test league from 2026-09-23.
--
-- WHAT CHANGES. The league part of the check now joins the league and keeps
-- active ones only, the same set the worker ranks. Every other check, and the
-- overall rankings every team needs, are unchanged. The function is patched in
-- place: its exact text is replaced once, and the migration stops if that text
-- is not found exactly once.

do $complete$
declare
  definition text := pg_get_functiondef(
    'api.service_complete_fantasy_gameweek(uuid,bigint)'::regprocedure);
  old_text constant text := '    join app.fantasy_league_memberships membership
      on membership.fantasy_team_id = team.id and membership.status = ''active''
';
  new_text constant text := '    join app.fantasy_league_memberships membership
      on membership.fantasy_team_id = team.id and membership.status = ''active''
    join app.fantasy_leagues league on league.id = membership.league_id and league.active
';
begin
  if (length(definition) - length(replace(definition, old_text, ''))) / length(old_text) <> 1 then
    raise exception 'inactive leagues: service_complete_fantasy_gameweek is not the 20260914200730 version';
  end if;
  execute replace(definition, old_text, new_text);
end
$complete$;
$bg_20261004140000_file$]
);

do $apply$
declare
  part_20261004140000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261004140000'
  );
begin
  if encode(sha256(convert_to(part_20261004140000, 'UTF8')), 'hex')
    is distinct from 'eb2781ad5044a1c856f2fafcabdf816cae40cfc05e69b56dd840197b3aecadfd' then
    raise exception 'stop: 20261004140000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261004140000;
end
$apply$;

do $postflight$
declare
  problems text[] := '{}';
  complete constant regprocedure := 'api.service_complete_fantasy_gameweek(uuid,bigint)'::regprocedure;
begin
  if md5(pg_get_functiondef(complete)) <> 'b0a24c7416776ed42e7fc06b771fa185' then
    problems := problems || 'the completion function is not the reviewed new version'::text;
  end if;
  if has_function_privilege('anon', complete, 'execute')
    or has_function_privilege('authenticated', complete, 'execute')
    or not has_function_privilege('service_role', complete, 'execute') then
    problems := problems || 'the completion function is callable by the wrong roles'::text;
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
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261004140000')
    then 'Applied. Completion skips switched-off leagues.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
