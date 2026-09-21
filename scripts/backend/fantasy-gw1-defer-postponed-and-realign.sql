-- BotolaGO Fantasy — defer the postponed GW1 fixture, then realign GW1's window.
--
-- PRODUCTION OPERATION. Run inside ONE transaction in the trusted service
-- context (Supabase SQL editor as the database owner, or psql with the service
-- role). Read the review SELECTs at the bottom, THEN uncomment `commit;`.
--
-- WHY THIS EXISTS INSTEAD OF fantasy-realign-gameweek-calendar.sql
-- ---------------------------------------------------------------
-- That script was written on 2026-09-18, when all eight GW1 fixtures still
-- carried the provider placeholder 00:00:00Z. Three things now make it wrong
-- to run, and the third is destructive:
--
--   1. Its hardcoded p_gameweek_id is 3cc19aaa-ea33-4909-845b-db33314b4071.
--      No such gameweek exists. GW1 is 7fcb28c5-9b69-4591-bcda-437c6c961c5c.
--      It would raise `gameweek_not_found` and roll back.
--   2. Its guard rejects any assignment whose fixture status is not
--      'scheduled'/'not_started'. FAR Rabat v Raja Casablanca is 'postponed',
--      so it would raise `fixtures_already_started_or_frozen` and roll back.
--   3. Had either guard been relaxed, its first UPDATE
--        `set kickoff_at = p_first_kickoff ... where kickoff_at is distinct from p_first_kickoff`
--      would have rewritten EVERY fixture in the gameweek to the single first
--      kickoff. That was harmless when all eight were identical placeholders.
--      It is now destructive: the orchestrator run at 2026-09-21 16:06Z
--      ingested seven real kickoffs spread across 24-27 September, and that
--      statement would flatten all of them to 2026-09-24 20:00Z.
--
-- WHAT THIS DOES
-- --------------
-- Nothing to any fixture row. Two steps, in this order, because the order is
-- the whole point: the deadline is derived from the earliest counting
-- assignment, so while the postponed fixture still counts, min() is its
-- 00:00:00Z placeholder and any recompute returns the same stale deadline.
--
--   A. Defer the one postponed assignment: superseded_at set, counts_points
--      false, assignment_status 'deferred', resolution 'operator_deferred'.
--      Note 'postponed' is NOT a legal resolution --
--      fantasy_fixture_assignments_resolution_check allows only
--      completed_in_window, moved_to_actual_gameweek, official_result_confirmed,
--      resumed_in_window, replayed, operator_deferred. 'operator_deferred' is
--      the vocabulary's word for exactly this.
--   B. Recompute starts_at / ends_at / deadline_at from the seven remaining
--      counting assignments. The deadline comes from the ruleset rule (90
--      minutes before the first kickoff); it is never typed by hand.
--
-- Expected result: deadline 2026-09-24 18:30Z, starts_at 2026-09-24 20:00Z,
-- ends_at 2026-09-28 00:00Z (last kickoff 2026-09-27 18:00Z plus six hours).
--
-- MUST RUN BEFORE 2026-09-23 22:30Z. After that instant
-- app_private.fantasy_guard_deadline_change raises PT409 on any deadline
-- change, and this script -- like every other route -- can no longer work.
--
-- Deferring the fixture does not decide what happens to it. It leaves GW1 with
-- seven counting fixtures; re-staging FAR v Raja into a later gameweek when a
-- date is published is a separate operation.

begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $defer_and_realign$
declare
  -- >>> parameters -----------------------------------------------------------
  p_gameweek_id   uuid := '7fcb28c5-9b69-4591-bcda-437c6c961c5c';  -- GW1 2026/27
  p_assignment_id uuid := '58d3befc-eb35-4333-962c-f5a5db05d3bb';  -- FAR Rabat v Raja Casablanca
  p_expected_remaining integer := 7;
  -- <<< parameters -----------------------------------------------------------
  gw app.fantasy_gameweeks%rowtype;
  ruleset uuid;
  target app.fantasy_fixture_assignments%rowtype;
  target_status text;
  n_deferred integer;
  n_remaining integer;
  n_unconfirmed integer;
  new_start timestamptz;
  new_end timestamptz;
  new_deadline timestamptz;
begin
  select * into gw from app.fantasy_gameweeks where id = p_gameweek_id for update;
  if not found then raise exception 'gameweek_not_found (%)', p_gameweek_id; end if;
  if gw.status <> 'open' then raise exception 'gameweek_not_open (status=%)', gw.status; end if;
  if gw.deadline_at <= statement_timestamp() then
    raise exception 'current_deadline_already_passed (% <= %)', gw.deadline_at, statement_timestamp();
  end if;

  if exists (
    select 1 from app.fantasy_fixture_assignments a
    where a.gameweek_id = gw.id and a.superseded_at is null and a.frozen_at is not null
  ) then raise exception 'gameweek_has_frozen_assignments'; end if;

  -- The target must be the row we think it is, still live, still postponed.
  select * into target from app.fantasy_fixture_assignments
  where id = p_assignment_id and gameweek_id = gw.id for update;
  if not found then raise exception 'assignment_not_found_in_gameweek (%)', p_assignment_id; end if;
  if target.superseded_at is not null then
    raise notice 'already_applied - assignment % is already superseded; nothing deferred', p_assignment_id;
  else
    select f.status::text into target_status from app.fixtures f where f.id = target.fixture_id;
    if target_status <> 'postponed' then
      raise exception 'target_fixture_not_postponed (status=%) - refusing to defer a playable fixture', target_status;
    end if;

    update app.fantasy_fixture_assignments
    set superseded_at = statement_timestamp(),
        assignment_status = 'deferred',
        resolution = 'operator_deferred',
        counts_points = false
    where id = p_assignment_id;
    get diagnostics n_deferred = row_count;
    raise notice 'deferred % assignment(s) for the postponed fixture', n_deferred;
  end if;

  -- What is left must be exactly the playable set, and fully confirmed.
  select count(*) into n_remaining
  from app.fantasy_fixture_assignments a
  where a.gameweek_id = gw.id and a.superseded_at is null and a.counts_points;
  if n_remaining <> p_expected_remaining then
    raise exception 'unexpected_remaining_count (% , expected %) - do not loosen this, find out why',
      n_remaining, p_expected_remaining;
  end if;

  select count(*) into n_unconfirmed
  from app.fantasy_fixture_assignments a join app.fixtures f on f.id = a.fixture_id
  where a.gameweek_id = gw.id and a.superseded_at is null and a.counts_points
    and not app_private.fantasy_kickoff_confirmed(f.kickoff_at);
  if n_unconfirmed > 0 then
    raise exception 'still_% _unconfirmed_kickoff(s) - a deadline derived from a placeholder is worse than a stale one',
      n_unconfirmed;
  end if;

  select min(f.kickoff_at), max(f.kickoff_at) + interval '6 hours'
  into new_start, new_end
  from app.fantasy_fixture_assignments a join app.fixtures f on f.id = a.fixture_id
  where a.gameweek_id = gw.id and a.superseded_at is null and a.counts_points;

  select ruleset_id into ruleset from app.fantasy_seasons where id = gw.fantasy_season_id;
  new_deadline := app_private.fantasy_calculate_deadline(ruleset, new_start);
  if new_deadline is null then raise exception 'deadline_rule_missing_for_ruleset (%)', ruleset; end if;
  if new_deadline <= statement_timestamp() then
    raise exception 'new_deadline_not_in_future (%)', new_deadline;
  end if;
  if new_end <= new_start then raise exception 'window_inverted (% -> %)', new_start, new_end; end if;

  update app.fantasy_gameweeks
  set starts_at = new_start, ends_at = new_end, deadline_at = new_deadline
  where id = gw.id;

  raise notice 'GW% realigned: deadline %, starts %, ends % (% counting fixtures)',
    gw.sequence_number, new_deadline, new_start, new_end, n_remaining;
end $defer_and_realign$;

-- ---------------------------------------------------------------------------
-- Review 1 — the gameweek window. Expect deadline 2026-09-24 18:30Z,
-- starts 2026-09-24 20:00Z, ends 2026-09-28 00:00Z, ends_after_last_kickoff t.
-- ---------------------------------------------------------------------------
select g.sequence_number, g.status, g.deadline_at, g.starts_at, g.ends_at,
       (select max(f.kickoff_at) from app.fantasy_fixture_assignments a
          join app.fixtures f on f.id = a.fixture_id
        where a.gameweek_id = g.id and a.superseded_at is null and a.counts_points) as last_kickoff,
       g.ends_at > (select max(f.kickoff_at) from app.fantasy_fixture_assignments a
          join app.fixtures f on f.id = a.fixture_id
        where a.gameweek_id = g.id and a.superseded_at is null and a.counts_points) as ends_after_last_kickoff,
       g.deadline_at = (select min(f.kickoff_at) from app.fantasy_fixture_assignments a
          join app.fixtures f on f.id = a.fixture_id
        where a.gameweek_id = g.id and a.superseded_at is null and a.counts_points) - interval '90 minutes'
         as deadline_is_90min_before_first_kickoff
from app.fantasy_gameweeks g
where g.id = '7fcb28c5-9b69-4591-bcda-437c6c961c5c';

-- ---------------------------------------------------------------------------
-- Review 2 — the assignments. Expect 7 rows counting and aligned, plus the one
-- deferred row showing superseded/deferred/operator_deferred/counts_points f.
-- ---------------------------------------------------------------------------
select ht.name || ' v ' || at2.name as fixture, f.status::text as fixture_status,
       f.kickoff_at, a.assigned_kickoff_at, (f.kickoff_at = a.assigned_kickoff_at) as aligned,
       a.counts_points, a.assignment_status, a.resolution, a.superseded_at is not null as superseded
from app.fantasy_fixture_assignments a
join app.fixtures f on f.id = a.fixture_id
join app.teams ht on ht.id = f.home_team_id
join app.teams at2 on at2.id = f.away_team_id
where a.gameweek_id = '7fcb28c5-9b69-4591-bcda-437c6c961c5c'
order by a.superseded_at nulls first, f.kickoff_at;

-- commit;
