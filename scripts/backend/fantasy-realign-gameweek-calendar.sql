-- BotolaGO Fantasy — realign one OPEN gameweek's calendar with the official kickoff.
--
-- PRODUCTION OPERATION. Run inside ONE transaction in the trusted service
-- context (Supabase SQL editor as the database owner, or psql with the service
-- role). Rehearsed on 2026-09-18 inside a rolled-back transaction: see
-- docs/qa/FANTASY_LAUNCH_HARDENING_2026_09_18.md §2.
--
-- Why this exists: fixture kickoffs enter BotolaGO through the SportsMonks
-- recovery workflow, but nothing realigns `app.fantasy_fixture_assignments.
-- assigned_kickoff_at` or the gameweek deadline afterwards. The lifecycle
-- worker refuses to freeze a gameweek whose fixture kickoff differs from the
-- assignment (`fantasy_fixture_resolution_required`), so a kickoff change that
-- is not mirrored here blocks the gameweek. The deadline itself is always
-- derived from the ruleset rule (90 minutes before the first kickoff), never
-- typed by hand.
--
-- Guards (all raise and roll back):
--   * the gameweek must be `open` and its current deadline still in the future
--     (the database trigger app_private.fantasy_guard_deadline_change enforces
--     this too and audits the change in app_private.fantasy_deadline_change_audit);
--   * every fixture of the gameweek must still be scheduled / not started;
--   * the new deadline must be in the future.
--
-- Usage: replace the two values in the `params` CTE, run the whole file.

begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $realign$
declare
  -- >>> parameters -----------------------------------------------------------
  p_gameweek_id uuid := '3cc19aaa-ea33-4909-845b-db33314b4071';   -- GW1 2026/27
  p_first_kickoff timestamptz := '2026-09-24T20:00:00Z';            -- official first kickoff (UTC)
  -- <<< parameters -----------------------------------------------------------
  gw app.fantasy_gameweeks%rowtype;
  ruleset uuid;
  new_deadline timestamptz;
  n_fixtures integer;
begin
  select * into gw from app.fantasy_gameweeks where id = p_gameweek_id for update;
  if not found then raise exception 'gameweek_not_found'; end if;
  if gw.status <> 'open' then raise exception 'gameweek_not_open (status=%)', gw.status; end if;
  if gw.deadline_at <= statement_timestamp() then raise exception 'current_deadline_already_passed'; end if;
  select ruleset_id into ruleset from app.fantasy_seasons where id = gw.fantasy_season_id;
  new_deadline := app_private.fantasy_calculate_deadline(ruleset, p_first_kickoff);
  if new_deadline <= statement_timestamp() then raise exception 'new_deadline_not_in_future (%)', new_deadline; end if;
  if exists (
    select 1 from app.fantasy_fixture_assignments a join app.fixtures f on f.id = a.fixture_id
    where a.gameweek_id = gw.id and a.superseded_at is null
      and (f.status not in ('scheduled', 'not_started') or a.frozen_at is not null)
  ) then raise exception 'fixtures_already_started_or_frozen'; end if;

  -- 1. fixtures that still carry the provider placeholder move to the official kickoff
  update app.fixtures f set kickoff_at = p_first_kickoff
  from app.fantasy_fixture_assignments a
  where a.fixture_id = f.id and a.gameweek_id = gw.id and a.superseded_at is null
    and f.kickoff_at is distinct from p_first_kickoff;
  -- 2. assignments must mirror the fixture kickoff exactly (worker precondition)
  update app.fantasy_fixture_assignments a set assigned_kickoff_at = f.kickoff_at
  from app.fixtures f
  where f.id = a.fixture_id and a.gameweek_id = gw.id and a.superseded_at is null
    and a.assigned_kickoff_at is distinct from f.kickoff_at;
  get diagnostics n_fixtures = row_count;
  -- 3. gameweek window + deadline derived from the ruleset rule (audited by trigger)
  update app.fantasy_gameweeks set
    starts_at = (select min(f.kickoff_at) from app.fantasy_fixture_assignments a join app.fixtures f on f.id = a.fixture_id where a.gameweek_id = gw.id and a.superseded_at is null),
    ends_at = (select max(f.kickoff_at) + interval '6 hours' from app.fantasy_fixture_assignments a join app.fixtures f on f.id = a.fixture_id where a.gameweek_id = gw.id and a.superseded_at is null),
    deadline_at = app_private.fantasy_calculate_deadline(ruleset,
      (select min(f.kickoff_at) from app.fantasy_fixture_assignments a join app.fixtures f on f.id = a.fixture_id where a.gameweek_id = gw.id and a.superseded_at is null))
  where id = gw.id;

  raise notice 'realigned gameweek % : % assignments touched, deadline now %', gw.id, n_fixtures,
    (select deadline_at from app.fantasy_gameweeks where id = gw.id);
end $realign$;

-- Review the result, then COMMIT (or ROLLBACK).
select g.id, g.status, g.starts_at, g.deadline_at, g.ends_at,
  (select count(*) from app.fantasy_fixture_assignments a join app.fixtures f on f.id = a.fixture_id
     where a.gameweek_id = g.id and a.superseded_at is null and a.assigned_kickoff_at = f.kickoff_at) as aligned_assignments,
  (select count(*) from app.fantasy_fixture_assignments a where a.gameweek_id = g.id and a.superseded_at is null) as assignments
from app.fantasy_gameweeks g where g.id = '3cc19aaa-ea33-4909-845b-db33314b4071';
-- commit;
