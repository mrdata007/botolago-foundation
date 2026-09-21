-- BG-0043 — scripts/backend/football-deactivate-non-current-teams.sql
--
-- Exercises the guarded deactivation transaction end-to-end against a
-- synthetic catalog shaped like production's real problem: one current season
-- whose participants must survive, and a set of clubs left over from an
-- earlier season that must go inactive — plus the three shapes that must NOT
-- be deactivated silently (a club with a current-season fixture, a club with a
-- current-season squad row, and a club that owns fantasy players).
--
-- The maintenance body below is kept byte-for-byte in sync with
-- scripts/backend/football-deactivate-non-current-teams.sql. `supabase test
-- db` runs from supabase/tests/database, so a \i / \ir of a path under
-- scripts/backend is not reachable from here — the same constraint (and the
-- same remedy) as supabase/tests/database/fantasy_catalog_restage_maintenance.test.sql.
--
-- Scenario isolation: the candidate set is global by construction (every
-- ACTIVE club with no participation in ANY current season), so each scenario
-- runs inside its own savepoint and rolls back to it, rather than trying to
-- partition app.teams.
begin;

-- An explicit plan, NOT extensions.no_plan().
--
-- pgTAP keeps its "tests run so far" counter in a temporary table, and this
-- file rolls back to a savepoint five times (see the scenario-isolation note
-- above). Each `rollback to savepoint` reverts that counter along with the
-- fixture, so at `finish()` pgTAP believed only 10 of the 20 assertions had
-- run and emitted `1..10` — a bad plan, even though all 20 assertions passed.
-- (Assertion NUMBERING stays correct because it comes from a sequence, which
-- a rollback does not rewind; only the count pgTAP reports at the end is lost.)
--
-- Declaring the plan up front emits `1..20` before the first savepoint, so it
-- cannot be rolled back. Keep this number in step with the assertion count
-- whenever an assertion is added or removed below.
select extensions.plan(20);

-- ---------------------------------------------------------------------
-- Maintenance body — SYNCED COPY of scripts/backend/football-deactivate-non-current-teams.sql
-- ---------------------------------------------------------------------
create function pg_temp.bg0043_deactivate_non_current_teams(
  p_expected_affected_count integer,
  p_expected_remaining_active_count integer
)
returns table (team_id uuid, team_name text, was_updated boolean)
language plpgsql
as $$
declare
  v_current_seasons uuid[];
  v_candidates integer;
  v_offenders text;
  v_updated integer;
  v_remaining integer;
begin
  -- 1. The current season(s). No current season means the whole notion of
  --    "not in the competition" is undefined: refuse rather than guess.
  select coalesce(array_agg(season.id), '{}'::uuid[])
  into v_current_seasons
  from app.seasons season
  where season.is_current;

  if cardinality(v_current_seasons) = 0 then
    raise exception 'bg0043 refused: no_current_season — app.seasons holds no row with is_current = true, so non-participation cannot be determined';
  end if;

  raise notice 'bg0043: current season(s): %', v_current_seasons;

  -- 2. Candidate set: ACTIVE clubs with no squad row and no fixture in any
  --    current season.
  -- (a re-call in the same session/transaction — the pgTAP suite does this —
  -- must not trip over the previous call's temp table)
  if to_regclass('pg_temp.bg0043_candidates') is not null then
    drop table bg0043_candidates;
  end if;
  create temporary table bg0043_candidates on commit drop as
  select team.id, team.name
  from app.teams team
  where team.active
    and not exists (
      select 1 from app.team_memberships membership
      where membership.team_id = team.id
        and membership.season_id = any (v_current_seasons)
    )
    and not exists (
      select 1 from app.fixtures fixture
      where fixture.season_id = any (v_current_seasons)
        and team.id in (fixture.home_team_id, fixture.away_team_id)
    );

  select count(*) into v_candidates from bg0043_candidates;

  -- 2b. Lock the candidate rows so a concurrent import cannot make a candidate
  --     current between the read above and the UPDATE below; the guards in
  --     steps 5-6 are re-evaluated after this lock is held.
  perform 1 from app.teams team
  where team.id in (select candidate.id from bg0043_candidates candidate)
  for update;

  -- 3. Idempotency: a committed run leaves nothing to do.
  if v_candidates = 0 then
    select count(*) into v_remaining from app.teams where active;
    raise notice 'bg0043: already_applied — no active club is outside the current season; % clubs remain active, nothing written', v_remaining;
    if v_remaining <> p_expected_remaining_active_count then
      raise exception 'bg0043 refused: unexpected_remaining_active_count — expected % active clubs, found %', p_expected_remaining_active_count, v_remaining;
    end if;
    return;
  end if;

  -- 4. Guard: the affected count must be exactly what was reviewed.
  if v_candidates <> p_expected_affected_count then
    select string_agg(format('%s (%s)', candidate.name, candidate.id), ', ' order by candidate.name)
    into v_offenders from bg0043_candidates candidate;
    raise exception 'bg0043 refused: unexpected_affected_count — expected % clubs, found %: %. Production drifted (a squad or fixture import may be mid-flight); re-run the review query and get the new list approved instead of loosening this guard.',
      p_expected_affected_count, v_candidates, v_offenders;
  end if;

  -- 5. Guard: no candidate may own a fantasy player.
  select string_agg(format('%s (%s): %s fantasy player row(s)', candidate.name, candidate.id, player.count), ', ' order by candidate.name)
  into v_offenders
  from bg0043_candidates candidate
  join lateral (
    select count(*) as count from app.fantasy_players fantasy_player
    where fantasy_player.football_team_id = candidate.id
  ) player on player.count > 0;

  if v_offenders is not null then
    raise exception 'bg0043 refused: affected_club_has_fantasy_player — %. Deactivating a club that is priced into a fantasy season would strand its players.', v_offenders;
  end if;

  -- 6. Guard: re-checked per row immediately before the write.
  select string_agg(format('%s (%s)', candidate.name, candidate.id), ', ' order by candidate.name)
  into v_offenders
  from bg0043_candidates candidate
  where exists (
    select 1 from app.fixtures fixture
    where fixture.season_id = any (v_current_seasons)
      and candidate.id in (fixture.home_team_id, fixture.away_team_id)
  );
  if v_offenders is not null then
    raise exception 'bg0043 refused: affected_club_has_current_season_fixture — %', v_offenders;
  end if;

  select string_agg(format('%s (%s)', candidate.name, candidate.id), ', ' order by candidate.name)
  into v_offenders
  from bg0043_candidates candidate
  where exists (
    select 1 from app.team_memberships membership
    where membership.team_id = candidate.id
      and membership.season_id = any (v_current_seasons)
  );
  if v_offenders is not null then
    raise exception 'bg0043 refused: affected_club_has_current_season_membership — %', v_offenders;
  end if;

  -- 7. Print the affected clubs BEFORE the write, so the operator sees the
  --    exact list even if a later guard rolls everything back.
  select string_agg(format('%s (%s)', candidate.name, candidate.id), E'\n  - ' order by candidate.name)
  into v_offenders from bg0043_candidates candidate;
  raise notice E'bg0043: about to deactivate % club(s):\n  - %', v_candidates, v_offenders;

  -- 8. The single write. Scoped to the exact candidate ids, never a broad
  --    predicate. The teams_set_updated_at trigger bumps updated_at on the
  --    changed rows only.
  update app.teams team
  set active = false
  from bg0043_candidates candidate
  where team.id = candidate.id
    and team.active is distinct from false;
  get diagnostics v_updated = row_count;

  if v_updated <> v_candidates then
    raise exception 'bg0043 refused: write_count_mismatch — % candidates but % rows updated', v_candidates, v_updated;
  end if;

  -- 9. Post-condition.
  select count(*) into v_remaining from app.teams where active;
  if v_remaining <> p_expected_remaining_active_count then
    raise exception 'bg0043 refused: unexpected_remaining_active_count — expected % active clubs after the write, found %', p_expected_remaining_active_count, v_remaining;
  end if;

  raise notice 'bg0043: deactivated % club(s); % clubs remain active', v_updated, v_remaining;

  return query
  select candidate.id, candidate.name, true from bg0043_candidates candidate order by candidate.name;
end;
$$;

-- ---------------------------------------------------------------------
-- Fixture data. One competition, one CURRENT season (2026/27) and one prior
-- season (2025/26). Eight clubs:
--
--   current-1..3  squad row + fixture in the current season   -> must survive
--   member-only   squad row in the current season, no fixture -> must survive
--   fixture-only  fixture in the current season, no squad row -> must survive
--   relegated-1..3  prior season only                          -> the targets
--
-- `fantasy-club` is added per-scenario, not here.
-- ---------------------------------------------------------------------
insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('b6004300-0000-4000-8000-00000000c001', 'MA', 'MAR');

insert into app.competitions (id, slug, name, short_name, competition_type, country_id, active)
values ('b6004300-0000-4000-8000-00000000d001', 'bg0043-league', 'BG0043 League', 'BGL',
  'league', 'b6004300-0000-4000-8000-00000000c001', true);

insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values
  ('b6004300-0000-4000-8000-00000000e001', 'b6004300-0000-4000-8000-00000000d001',
    '2025/26', '2025-08-01', '2026-05-31', 'completed', false),
  ('b6004300-0000-4000-8000-00000000e002', 'b6004300-0000-4000-8000-00000000d001',
    '2026/27', '2026-08-01', '2027-05-31', 'active', true);

insert into app.teams (id, slug, name, short_name, code, country_id, active)
values
  ('b6004300-0000-4000-8000-00000000a001', 'bg0043-current-1', 'BG0043 Current 1', 'Current 1', 'BGC1',
    'b6004300-0000-4000-8000-00000000c001', true),
  ('b6004300-0000-4000-8000-00000000a002', 'bg0043-current-2', 'BG0043 Current 2', 'Current 2', 'BGC2',
    'b6004300-0000-4000-8000-00000000c001', true),
  ('b6004300-0000-4000-8000-00000000a003', 'bg0043-current-3', 'BG0043 Current 3', 'Current 3', 'BGC3',
    'b6004300-0000-4000-8000-00000000c001', true),
  ('b6004300-0000-4000-8000-00000000a004', 'bg0043-member-only', 'BG0043 Member Only', 'Member Only', 'BGM1',
    'b6004300-0000-4000-8000-00000000c001', true),
  ('b6004300-0000-4000-8000-00000000a005', 'bg0043-fixture-only', 'BG0043 Fixture Only', 'Fixture Only', 'BGF1',
    'b6004300-0000-4000-8000-00000000c001', true),
  ('b6004300-0000-4000-8000-00000000b001', 'bg0043-relegated-1', 'BG0043 Relegated 1', 'Relegated 1', 'BGR1',
    'b6004300-0000-4000-8000-00000000c001', true),
  ('b6004300-0000-4000-8000-00000000b002', 'bg0043-relegated-2', 'BG0043 Relegated 2', 'Relegated 2', 'BGR2',
    'b6004300-0000-4000-8000-00000000c001', true),
  ('b6004300-0000-4000-8000-00000000b003', 'bg0043-relegated-3', 'BG0043 Relegated 3', 'Relegated 3', 'BGR3',
    'b6004300-0000-4000-8000-00000000c001', true);

insert into app.players (id, slug, full_name, display_name, position, active)
select md5('bg0043-player:' || club)::uuid, 'bg0043-player-' || club,
  'BG0043 Player ' || club, 'BGP ' || club, 'midfielder'::app.football_position, true
from unnest(array['a001', 'a002', 'a003', 'a004', 'b001', 'b002', 'b003', 'z001']) club;

-- Current-season squad rows: current-1..3 and member-only.
insert into app.team_memberships (player_id, team_id, season_id, valid_from, active)
select md5('bg0043-player:' || club)::uuid,
  ('b6004300-0000-4000-8000-00000000' || club)::uuid,
  'b6004300-0000-4000-8000-00000000e002', '2026-08-01', true
from unnest(array['a001', 'a002', 'a003', 'a004']) club;

-- Prior-season squad rows: the three relegated clubs. They are NOT in the
-- current season, which is exactly the production shape.
insert into app.team_memberships (player_id, team_id, season_id, valid_from, active)
select md5('bg0043-player:' || club)::uuid,
  ('b6004300-0000-4000-8000-00000000' || club)::uuid,
  'b6004300-0000-4000-8000-00000000e001', '2025-08-01', false
from unnest(array['b001', 'b002', 'b003']) club;

-- Current-season fixtures: current-1 v current-2, current-3 v fixture-only.
insert into app.fixtures (id, competition_id, season_id, home_team_id, away_team_id, kickoff_at, provider_updated_at)
values
  ('b6004300-0000-4000-8000-0000000f0001', 'b6004300-0000-4000-8000-00000000d001',
    'b6004300-0000-4000-8000-00000000e002',
    'b6004300-0000-4000-8000-00000000a001', 'b6004300-0000-4000-8000-00000000a002',
    '2026-09-25T18:00:00Z', '2026-09-01T00:00:00Z'),
  ('b6004300-0000-4000-8000-0000000f0002', 'b6004300-0000-4000-8000-00000000d001',
    'b6004300-0000-4000-8000-00000000e002',
    'b6004300-0000-4000-8000-00000000a003', 'b6004300-0000-4000-8000-00000000a005',
    '2026-09-25T20:00:00Z', '2026-09-01T00:00:00Z');

-- Prior-season fixtures for the relegated clubs — history must not protect them.
insert into app.fixtures (id, competition_id, season_id, home_team_id, away_team_id, kickoff_at, provider_updated_at)
values
  ('b6004300-0000-4000-8000-0000000f0003', 'b6004300-0000-4000-8000-00000000d001',
    'b6004300-0000-4000-8000-00000000e001',
    'b6004300-0000-4000-8000-00000000b001', 'b6004300-0000-4000-8000-00000000b002',
    '2025-09-25T18:00:00Z', '2025-09-01T00:00:00Z'),
  ('b6004300-0000-4000-8000-0000000f0004', 'b6004300-0000-4000-8000-00000000d001',
    'b6004300-0000-4000-8000-00000000e001',
    'b6004300-0000-4000-8000-00000000b003', 'b6004300-0000-4000-8000-00000000a001',
    '2025-09-25T20:00:00Z', '2025-09-01T00:00:00Z');

select extensions.is(
  (select count(*)::integer from app.teams where active),
  8,
  'fixture: all 8 synthetic clubs start active'
);

-- =====================================================================
-- 1. HAPPY PATH — exactly the three unreferenced clubs are deactivated,
--    and every club with current-season participation survives.
-- =====================================================================
savepoint bg0043_happy;

select extensions.is(
  (select count(*)::integer from pg_temp.bg0043_deactivate_non_current_teams(3, 5)),
  3,
  'happy path: the maintenance body reports exactly 3 deactivated clubs'
);

select extensions.results_eq(
  $$select name from app.teams where not active order by name$$,
  $$values ('BG0043 Relegated 1'), ('BG0043 Relegated 2'), ('BG0043 Relegated 3')$$,
  'happy path: exactly the three unreferenced clubs are now inactive'
);

select extensions.is(
  (select count(*)::integer from app.teams where active),
  5,
  'happy path: the five participating clubs stay active'
);

select extensions.ok(
  (select active from app.teams where id = 'b6004300-0000-4000-8000-00000000a005'),
  'happy path: a club with a current-season fixture but no squad row is left alone'
);

select extensions.ok(
  (select active from app.teams where id = 'b6004300-0000-4000-8000-00000000a004'),
  'happy path: a club with a current-season squad row but no fixture is left alone'
);

-- 2. IDEMPOTENCE — a second run finds nothing, writes nothing, raises nothing.
select extensions.is(
  (select count(*)::integer from pg_temp.bg0043_deactivate_non_current_teams(3, 5)),
  0,
  'second run: no club is deactivated a second time'
);

select extensions.is(
  (select count(*)::integer from app.teams where active),
  5,
  'second run: the active count is unchanged'
);

select extensions.is(
  (select count(distinct updated_at)::integer from app.teams where not active),
  1,
  'second run: no updated_at is bumped again (all three still share the first run''s timestamp)'
);

rollback to savepoint bg0043_happy;

select extensions.is(
  (select count(*)::integer from app.teams where active),
  8,
  'rollback to savepoint restores all 8 clubs to active'
);

-- =====================================================================
-- 3. COUNT GUARD — the expected count is wrong, so nothing is written and
--    the message names every club that would have been touched.
-- =====================================================================
savepoint bg0043_count_guard;

select extensions.throws_ok(
  $$select * from pg_temp.bg0043_deactivate_non_current_teams(5, 3)$$,
  'bg0043 refused: unexpected_affected_count — expected 5 clubs, found 3: BG0043 Relegated 1 (b6004300-0000-4000-8000-00000000b001), BG0043 Relegated 2 (b6004300-0000-4000-8000-00000000b002), BG0043 Relegated 3 (b6004300-0000-4000-8000-00000000b003). Production drifted (a squad or fixture import may be mid-flight); re-run the review query and get the new list approved instead of loosening this guard.',
  'count guard: the wrong expected count refuses and names every affected club'
);

select extensions.is(
  (select count(*)::integer from app.teams where active),
  8,
  'count guard: the refusal rolled the write back — every club is still active'
);

rollback to savepoint bg0043_count_guard;

-- =====================================================================
-- 4. FANTASY GUARD — a candidate that owns fantasy players stops the whole
--    transaction, so no club is deactivated at all.
-- =====================================================================
savepoint bg0043_fantasy_guard;

insert into app.teams (id, slug, name, short_name, code, country_id, active)
values ('b6004300-0000-4000-8000-00000000b004', 'bg0043-fantasy-club', 'BG0043 Fantasy Club',
  'Fantasy Club', 'BGZ1', 'b6004300-0000-4000-8000-00000000c001', true);

insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('b6004300-0000-4000-8000-00000000fc01', 'b6004300-0000-4000-8000-00000000d001',
  'bg0043-fantasy', 'BG0043 Fantasy', true);

insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at)
select 'b6004300-0000-4000-8000-00000000f501', 'b6004300-0000-4000-8000-00000000fc01',
  'b6004300-0000-4000-8000-00000000e002', ruleset.id, 'BG0043 Fantasy 2026/27',
  'planned', '2026-08-01T00:00:00Z', '2027-05-31T00:00:00Z'
from app.fantasy_rulesets ruleset
order by ruleset.id
limit 1;

insert into app.fantasy_players (fantasy_season_id, football_player_id, football_team_id, position_id, price)
select 'b6004300-0000-4000-8000-00000000f501', md5('bg0043-player:z001')::uuid,
  'b6004300-0000-4000-8000-00000000b004', position.id, 5.0
from app.fantasy_positions position
order by position.display_order
limit 1;

select extensions.is(
  (select count(*)::integer from app.teams where active),
  9,
  'fantasy guard: the fantasy club joins the 8 base clubs as active'
);

select extensions.throws_ok(
  $$select * from pg_temp.bg0043_deactivate_non_current_teams(4, 5)$$,
  'bg0043 refused: affected_club_has_fantasy_player — BG0043 Fantasy Club (b6004300-0000-4000-8000-00000000b004): 1 fantasy player row(s). Deactivating a club that is priced into a fantasy season would strand its players.',
  'fantasy guard: a candidate with a fantasy player refuses and names the club'
);

select extensions.is(
  (select count(*)::integer from app.teams where active),
  9,
  'fantasy guard: a club with a fantasy player is left alone — and so is every other club, because the refusal rolls back'
);

rollback to savepoint bg0043_fantasy_guard;

-- =====================================================================
-- 5. CURRENT-SEASON GUARD — with no current season at all the body refuses
--    rather than treating every club as unreferenced.
-- =====================================================================
savepoint bg0043_no_current_season;

update app.seasons set is_current = false where is_current;

select extensions.throws_ok(
  $$select * from pg_temp.bg0043_deactivate_non_current_teams(3, 5)$$,
  'bg0043 refused: no_current_season — app.seasons holds no row with is_current = true, so non-participation cannot be determined',
  'no current season: the body refuses instead of deactivating every club'
);

select extensions.is(
  (select count(*)::integer from app.teams where active),
  8,
  'no current season: nothing was written'
);

rollback to savepoint bg0043_no_current_season;

-- =====================================================================
-- 6. READ SURFACE — api.football_team_catalog must stop offering the
--    deactivated clubs. This is the whole point of the operation.
-- =====================================================================
savepoint bg0043_catalog;

select extensions.is(
  jsonb_array_length(api.football_team_catalog('fr', 100)),
  8,
  'catalog: all 8 clubs are offered before the deactivation'
);

select extensions.is(
  (select count(*)::integer from pg_temp.bg0043_deactivate_non_current_teams(3, 5)),
  3,
  'catalog: the deactivation runs'
);

select extensions.is(
  jsonb_array_length(api.football_team_catalog('fr', 100)),
  5,
  'catalog: api.football_team_catalog offers only the five participating clubs afterwards'
);

rollback to savepoint bg0043_catalog;

-- No extensions.finish() here, deliberately.
--
-- The plan is declared up front (see the note at the top of this file), so
-- finish() has no plan left to emit. All it would still do is compare its
-- savepoint-reverted counter against the plan and print a misleading
-- "Looks like you planned 20 tests but ran 10" diagnostic on a run where
-- every one of the 20 assertions passed. The plan line already holds the
-- suite to 20 assertions: pg_prove fails this file if fewer (or more) than
-- 20 `ok` lines are emitted, so nothing is lost by omitting finish().
rollback;
