-- BotolaGO Production V2
-- Pronostics (score predictions), part 2 of 6: the rules.
--
-- Small, pure or read-only helpers that every later function uses, each taking
-- an explicit "now" so pgTAP can test exact boundaries (the repository's tests
-- never mock the clock). None of them is callable from the API.
--
--   * prediction_points / prediction_result_kind: rule v1, 3 / 1 / 0.
--   * prediction_fixture_open: a match can be predicted only while its status is
--     scheduled or not_started AND the database clock is before its stored
--     kick-off. A provider placeholder kick-off (00:00 UTC, "time not
--     confirmed") therefore locks at the start of match day: always early,
--     never late.
--   * predictions_current_season: the season Pronostics plays.
--   * predictions_access_allowed: the off / testers / public switch.
--   * predictions_current_round: which journée the page opens on.
--   * prediction_round_state: upcoming / in_progress / provisional / completed,
--     derived from the journée's matches (no journée state is stored).
--
-- Plan: docs/backend/PREDICTIONS_DOMAIN_PLAN.md (BG-0146).

-- ---------------------------------------------------------------------------
-- Scoring rule v1
-- ---------------------------------------------------------------------------
create or replace function app_private.prediction_points(
  p_home integer, p_away integer, p_result_home integer, p_result_away integer
)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_home = p_result_home and p_away = p_result_away then 3
    when sign(p_home - p_away) = sign(p_result_home - p_result_away) then 1
    else 0
  end;
$$;

comment on function app_private.prediction_points(integer, integer, integer, integer) is
  'Rule v1: exact score 3, right outcome (home win / draw / away win) 1, otherwise 0. Mirrored by src/backend/predictions/scoring.ts; both are tested against the same cases.';

create or replace function app_private.prediction_result_kind(
  p_home integer, p_away integer, p_result_home integer, p_result_away integer
)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_home = p_result_home and p_away = p_result_away then 'exact'
    when sign(p_home - p_away) = sign(p_result_home - p_result_away) then 'outcome'
    else 'miss'
  end;
$$;

-- ---------------------------------------------------------------------------
-- The lock
-- ---------------------------------------------------------------------------
create or replace function app_private.prediction_fixture_open(
  p_status app.fixture_status, p_kickoff_at timestamptz, p_now timestamptz
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(
    p_status in ('scheduled', 'not_started') and p_now < p_kickoff_at,
    false
  );
$$;

comment on function app_private.prediction_fixture_open(app.fixture_status, timestamptz, timestamptz) is
  'The only definition of "this match can still be predicted": status scheduled/not_started and p_now strictly before the stored kick-off. Every write checks it with statement_timestamp() in the statement that writes.';

-- ---------------------------------------------------------------------------
-- The season and the switch
-- ---------------------------------------------------------------------------
create or replace function app_private.predictions_current_season()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select season.id
  from app.seasons season
  cross join app_private.prediction_settings settings
  where settings.id
    and season.is_current
    and (settings.competition_id is null or season.competition_id = settings.competition_id)
  order by season.starts_on desc, season.id desc
  limit 1;
$$;

create or replace function app_private.predictions_access_allowed(p_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((
    select settings.mode = 'public'
      or (settings.mode = 'testers' and p_user_id is not null
        and p_user_id = any(settings.tester_user_ids))
    from app_private.prediction_settings settings
    where settings.id
  ), false);
$$;

-- ---------------------------------------------------------------------------
-- Which journée opens by default
-- ---------------------------------------------------------------------------
-- The journée of the earliest match still open, ignoring
--   * a leftover: a match of an older journée once a later journée has had at
--     least half of its matches kick off (a rescheduled postponement), and
--   * an early bird: a match of a later journée while an earlier journée still
--     has more than half of its matches open (a match brought forward).
-- If nothing qualifies, the journée of the earliest open match; if nothing is
-- open, the journée of the most recent match that kicked off; else the first.
-- Cancelled and abandoned matches are ignored. The Botola calendar moves single
-- matches often (continental fixtures); one moved match must not drag the page
-- to another journée.
create or replace function app_private.predictions_current_round(
  p_season_id uuid, p_now timestamptz
)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  with fx as (
    select fixture.round_id, round_row.round_number, fixture.kickoff_at, fixture.status,
      app_private.prediction_fixture_open(fixture.status, fixture.kickoff_at, p_now) as is_open,
      (fixture.kickoff_at <= p_now and fixture.status <> 'postponed') as started
    from app.fixtures fixture
    join app.rounds round_row on round_row.id = fixture.round_id
    where fixture.season_id = p_season_id
      and fixture.round_id is not null
      and fixture.status not in ('cancelled', 'abandoned')
  ),
  rounds as (
    select round_id, round_number, count(*) as fixtures,
      count(*) filter (where started) as started_fixtures,
      count(*) filter (where is_open) as open_fixtures
    from fx
    group by round_id, round_number
  ),
  candidate as (
    select fx.round_id
    from fx
    where fx.is_open
      and not exists (
        select 1 from rounds later
        where later.round_number > fx.round_number
          and later.started_fixtures * 2 >= later.fixtures
      )
      and not exists (
        select 1 from rounds earlier
        where earlier.round_number < fx.round_number
          and earlier.open_fixtures * 2 > earlier.fixtures
      )
    order by fx.kickoff_at, fx.round_number
    limit 1
  )
  select coalesce(
    (select round_id from candidate),
    (select fx.round_id from fx where fx.is_open order by fx.kickoff_at, fx.round_number limit 1),
    (select fx.round_id from fx where fx.started order by fx.kickoff_at desc, fx.round_number desc limit 1),
    (select fx.round_id from fx order by fx.round_number, fx.kickoff_at limit 1)
  );
$$;

-- ---------------------------------------------------------------------------
-- A journée's state, derived from its matches
-- ---------------------------------------------------------------------------
--   upcoming     no match has kicked off yet (postponed and void ones aside)
--   completed    every match is final or void
--   provisional  every match is final or void, except postponed ones
--   in_progress  anything else
-- A match is final when status = finished and finalized_at is set; void when
-- cancelled, abandoned, or voided by an operator.
create or replace function app_private.prediction_round_state(
  p_round_id uuid, p_now timestamptz
)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  with fx as (
    select fixture.status, fixture.kickoff_at,
      (fixture.status = 'finished' and fixture.finalized_at is not null) as is_final,
      -- coalesce: most matches have no scoring row yet, and a null here would
      -- drop them from every count below.
      (fixture.status in ('cancelled', 'abandoned')
        or coalesce(scoring.override = 'void', false)) as is_void
    from app.fixtures fixture
    left join app_private.prediction_fixture_scoring scoring on scoring.fixture_id = fixture.id
    where fixture.round_id = p_round_id
  )
  select case
    when count(*) = 0 then 'upcoming'
    when count(*) filter (where is_final or is_void) = count(*) then 'completed'
    when count(*) filter (
      where kickoff_at <= p_now and status <> 'postponed' and not is_void
    ) = 0 then 'upcoming'
    when count(*) filter (where not (is_final or is_void) and status <> 'postponed') = 0
      then 'provisional'
    else 'in_progress'
  end
  from fx;
$$;

-- ---------------------------------------------------------------------------
-- Grants: none to any API role
-- ---------------------------------------------------------------------------
revoke all on function app_private.prediction_points(integer, integer, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function app_private.prediction_result_kind(integer, integer, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function app_private.prediction_fixture_open(app.fixture_status, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function app_private.predictions_current_season()
  from public, anon, authenticated, service_role;
revoke all on function app_private.predictions_access_allowed(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.predictions_current_round(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function app_private.prediction_round_state(uuid, timestamptz)
  from public, anon, authenticated, service_role;
