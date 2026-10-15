-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Reopen the SofaScore Fantasy attempt of RS Berkane 2-2 Renaissance Zemamra
-- (2026-10-13, fixture f128e41f-e72b-4340-9725-ec4f95432848, SofaScore event
-- 17256978), which gave up after 58 attempts with `unknown_incident` and
-- `goals_do_not_add_up`: its first goal is an own goal (goal/ownGoal), a label
-- the Fantasy builder did not know. The fix (branch claude/live-details-fix)
-- reads it as an own goal, also from the replies stored with the attempt.
--
-- ORDER: deploy football-live-refresh with the fix FIRST. Reopened under the
-- old code, the match would only give up again.
--
-- HOW TO RUN
--   Check nothing else is writing (AGENTS.md "One writer at a time"). The
--   attempt row is written by the football-live-refresh Edge Function's
--   Fantasy step, so run this when no match is in play (the preflight
--   refuses otherwise). Run the WHOLE file. As shipped it is a REHEARSAL
--   (rolled back; "Rehearsal passed"). Change `rollback;` near the bottom to
--   `commit;` and run again ("Reopened"). A failed check stops it with nothing
--   saved; do not edit a check to make it pass.
--
-- WHAT IT DOES
--   * checks: the fixture is finished and finalized, its attempt is for event
--     17256978, has given up (or is held) and kept its stored replies, no
--     observation is recorded, its gameweek is not finalizing or finalized, no
--     fixture is in play, no pg_cron job is mid-run;
--   * calls app_private.sofascore_fantasy_reopen(null, <fixture>) (migration
--     20261012120000: by fixture, whatever held it; status `held`, attempts 0,
--     retried on the next tick), which must reopen exactly one row;
--   * checks the row reads `held`, 0 attempts, due now. The next Edge tick
--     retries it from the stored replies (no RapidAPI request) or, as here,
--     where giving up dropped them, fetches the match again (catch-up, 3
--     requests); then records the observation, or holds it again with the
--     reason in last_outcome.
--   It writes app_private.sofascore_fantasy_attempts only.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
declare
  v_fixture constant uuid := 'f128e41f-e72b-4340-9725-ec4f95432848';
  a record;
  f record;
begin
  if to_regprocedure('app_private.sofascore_fantasy_reopen(uuid, uuid)') is null
    or to_regclass('app_private.sofascore_fantasy_attempts') is null
    or to_regclass('app_private.fantasy_fixture_observations') is null then
    raise exception 'stop: an object this script depends on is missing (migration 20261012120000)';
  end if;
  if exists (select 1 from cron.job_run_details run
    where run.status not in ('succeeded', 'failed')
      and (run.start_time > statement_timestamp() - interval '15 minutes'
        or exists (select 1 from pg_stat_activity activity where activity.pid = run.job_pid))) then
    raise exception 'stop: a scheduled (pg_cron) job is running right now -- nothing was saved; run this again in a minute';
  end if;
  if exists (select 1 from app.fixtures
              where status in ('live_first_half', 'half_time', 'live_second_half',
                               'extra_time', 'penalties')) then
    raise exception 'stop: a match is in play, and the live refresh writes Fantasy attempts every minute -- run this after it';
  end if;
  select * into f from app.fixtures where id = v_fixture;
  if not found or f.status <> 'finished' or f.finalized_at is null then
    raise exception 'stop: the fixture is not a finished, finalized match';
  end if;
  select * into a from app_private.sofascore_fantasy_attempts where fixture_id = v_fixture;
  if not found then
    raise exception 'stop: no SofaScore Fantasy attempt for this fixture';
  end if;
  if a.sofascore_event_id <> '17256978' then
    raise exception 'stop: the attempt is for SofaScore event %, not 17256978', a.sofascore_event_id;
  end if;
  if a.status not in ('gave_up', 'held') then
    raise exception 'stop: the attempt is %, not gave_up or held -- nothing to reopen', a.status;
  end if;
  -- Giving up drops the stored replies (match_data). Reopened without them, the
  -- attempt is `held` with no replies and 0 attempts, which is exactly what
  -- api.service_sofascore_fantasy_due (20261013150100) lists under catchUp: the
  -- next tick fetches the match afresh (3 RapidAPI requests) with the deployed
  -- code. Check that it will be listed, rather than assume it.
  if a.match_data is null then
    if not exists (select 1 from app_private.football_provider_mappings m
                    where m.provider_name = 'sofascore' and m.entity_type = 'fixture'
                      and m.internal_entity_id = v_fixture and m.active and m.external_id = '17256978') then
      raise exception 'stop: no stored replies, and no active SofaScore link to event 17256978 to fetch them again';
    end if;
    if not exists (select 1 from app.fantasy_fixture_assignments x
                    where x.fixture_id = v_fixture and x.superseded_at is null
                      and app_private.fantasy_adaptive_enabled(x.gameweek_id)) then
      raise exception 'stop: no stored replies, and the fixture''s gameweek does not take automatic observations';
    end if;
    if f.finalized_at <= statement_timestamp() - interval '504 hours' then
      raise exception 'stop: no stored replies, and the match is older than the 21-day fetch window';
    end if;
  end if;
  if exists (select 1 from app_private.fantasy_fixture_observations o where o.fixture_id = v_fixture) then
    raise exception 'stop: an observation is already recorded for this fixture';
  end if;
  if exists (select 1 from app.fantasy_fixture_assignments x
               join app.fantasy_gameweeks g on g.id = x.gameweek_id
              where x.fixture_id = v_fixture and x.superseded_at is null
                and g.status in ('finalizing', 'finalized', 'corrected')) then
    raise exception 'stop: the gameweek of this fixture is finalizing or finalized; it takes no new observation';
  end if;
end
$preflight$;

do $reopen$
declare
  v_count integer;
begin
  v_count := app_private.sofascore_fantasy_reopen(null, 'f128e41f-e72b-4340-9725-ec4f95432848'::uuid);
  if v_count <> 1 then
    raise exception 'stop: % rows reopened, expected exactly 1', v_count;
  end if;
end
$reopen$;

do $postflight$
declare
  a record;
begin
  select * into a from app_private.sofascore_fantasy_attempts
   where fixture_id = 'f128e41f-e72b-4340-9725-ec4f95432848';
  if a.status <> 'held' or a.attempts <> 0 or a.next_retry_at > statement_timestamp() then
    raise exception 'stop: the attempt did not read as reopened (status %, attempts %)', a.status, a.attempts;
  end if;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To reopen for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when (select status = 'held' and attempts = 0 from app_private.sofascore_fantasy_attempts
         where fixture_id = 'f128e41f-e72b-4340-9725-ec4f95432848')
    then 'Reopened. The next football-live-refresh tick fetches the match again and retries it.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
