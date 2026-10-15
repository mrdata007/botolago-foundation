-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Reopen the one GW4 SofaScore Fantasy attempt given up on `timeline_unresolved`
-- (Maghreb Fes - IR Tanger: a goal and a substitution both in the 77th minute).
-- The Fantasy builder now places a goal in the minute of a substitution or
-- dismissal by SofaScore's own order of events (owner decision 2026-10-15,
-- option A; supabase/functions/_shared/sofascore-fantasy.ts, `chronology`).
--
-- ORDER: deploy football-live-refresh with that change FIRST. Reopened under the
-- old code, the match would only be held again. Resolve Narcisse Ouedraogo on
-- the review list too (never as Benjamin Tanimu); until then the match is held
-- again for him, harmlessly, and retried.
--
-- HOW TO RUN
--   Check nothing else is writing (AGENTS.md "One writer at a time"). Run when no
--   match is in play (the preflight refuses otherwise). Run the WHOLE file. As
--   shipped it is a REHEARSAL (rolled back). Read the last result: the match it
--   names must be Maghreb Fes - Tanger. Then change `rollback;` near the bottom
--   to `commit;` and run again. A failed check stops it with nothing saved; do
--   not edit a check to make it pass.
--
-- WHAT IT DOES
--   * finds the GW4 attempts that gave up (or are held) on timeline_unresolved,
--     with no observation recorded, and requires exactly one;
--   * checks: finished and finalized, GW4 not finalizing or finalized, no fixture
--     in play, no pg_cron job mid-run; giving up dropped the stored replies, so it
--     checks the next tick will fetch the match again (active SofaScore fixture
--     link, a gameweek that takes automatic observations, finalized within the
--     504-hour catch-up window);
--   * calls app_private.sofascore_fantasy_reopen(null, <fixture>), which must
--     reopen exactly one row: `held`, 0 attempts, due now. The next
--     football-live-refresh tick fetches the match (3 RapidAPI requests) and
--     records the observation, or holds it again with the reason in last_outcome.
--   It writes app_private.sofascore_fantasy_attempts only.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create temporary table reopen_target (fixture_id uuid primary key) on commit drop;

do $preflight$
declare
  c_gw4 constant uuid := '3c37ffb7-e2c8-4662-a1ee-4a52f76ad1c2';
  v_fixture uuid;
  v_count integer;
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

  select count(*), min(att.fixture_id::text)::uuid into v_count, v_fixture
  from app_private.sofascore_fantasy_attempts att
  join app.fantasy_fixture_assignments x on x.fixture_id = att.fixture_id
    and x.superseded_at is null and x.gameweek_id = c_gw4
  where att.status in ('gave_up', 'held')
    and (att.last_outcome = 'timeline_unresolved'
         or exists (select 1 from jsonb_array_elements(att.last_blockers) b
                     where b->>'code' = 'timeline_unresolved'))
    and not exists (select 1 from app_private.fantasy_fixture_observations o
                     where o.fixture_id = att.fixture_id);
  if v_count <> 1 then
    raise exception 'stop: expected exactly one GW4 attempt held or given up on timeline_unresolved, found %', v_count;
  end if;

  select * into f from app.fixtures where id = v_fixture;
  if f.status <> 'finished' or f.finalized_at is null then
    raise exception 'stop: the fixture is not a finished, finalized match';
  end if;
  select * into a from app_private.sofascore_fantasy_attempts where fixture_id = v_fixture;
  if exists (select 1 from app.fantasy_gameweeks g where g.id = c_gw4
              and g.status in ('finalizing', 'finalized', 'corrected')) then
    raise exception 'stop: GW4 is finalizing or finalized; it takes no new observation';
  end if;
  if a.match_data is null then
    if not exists (select 1 from app_private.football_provider_mappings m
                    where m.provider_name = 'sofascore' and m.entity_type = 'fixture'
                      and m.internal_entity_id = v_fixture and m.active
                      and m.external_id = a.sofascore_event_id) then
      raise exception 'stop: no stored replies, and no active SofaScore link to event % to fetch them again', a.sofascore_event_id;
    end if;
    if not app_private.fantasy_adaptive_enabled(c_gw4) then
      raise exception 'stop: no stored replies, and GW4 does not take automatic observations';
    end if;
    if f.finalized_at <= statement_timestamp() - interval '504 hours' then
      raise exception 'stop: no stored replies, and the match is older than the 21-day fetch window';
    end if;
  end if;
  insert into reopen_target values (v_fixture);
end
$preflight$;

do $reopen$
declare
  v_count integer;
begin
  v_count := app_private.sofascore_fantasy_reopen(null, (select fixture_id from reopen_target));
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
   where fixture_id = (select fixture_id from reopen_target);
  if a.status <> 'held' or a.attempts <> 0 or a.next_retry_at > statement_timestamp() then
    raise exception 'stop: the attempt did not read as reopened (status %, attempts %)', a.status, a.attempts;
  end if;
end
$postflight$;

-- The match this run reopens: check it is Maghreb Fes - Tanger before committing.
select ht.name || ' - ' || awt.name as match, f.kickoff_at, att.sofascore_event_id,
       att.status, att.attempts, att.next_retry_at
from reopen_target r
join app.fixtures f on f.id = r.fixture_id
join app.teams ht on ht.id = f.home_team_id
join app.teams awt on awt.id = f.away_team_id
join app_private.sofascore_fantasy_attempts att on att.fixture_id = r.fixture_id;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To reopen for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;
