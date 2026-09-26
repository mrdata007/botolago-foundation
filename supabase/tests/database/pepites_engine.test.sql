begin;

select extensions.no_plan();

-- The Pépites ranking engine (20260926090000).
-- Part 1: the rules on their own. Part 2: exact rules on a hand-built
-- snapshot. Part 3: a generated league, run end to end, replayed, revised and
-- sealed. Part 4: the 2025-26 style season-final run.

-- ===========================================================================
-- Part 1: small rules
-- ===========================================================================
select extensions.is(
  (select array_agg(app_private.pepites_percentile(v, array[0, 0, 0, 5]::numeric[]) order by n)
   from unnest(array[0, 0, 0, 5]::numeric[]) with ordinality as t(v, n)),
  array[37.5, 37.5, 37.5, 87.5]::numeric[],
  'mid-rank percentile: the three tied zeros share 37.5, the 5 gets 87.5'
);
select extensions.is(
  app_private.pepites_percentile(7, array[7]::numeric[]),
  50.0000::numeric,
  'a set of one gets 50'
);
select extensions.is(
  app_private.pepites_percentile(2, array[null, 1, 2]::numeric[]),
  75.0000::numeric,
  'nulls are left out of the set'
);
select extensions.is(
  app_private.pepites_percentile(null, array[1, 2]::numeric[]),
  null::numeric,
  'a null value has no percentile'
);
select extensions.is(
  (select array[
    app_private.pepites_minutes_floor(params, 'weekly', 3),
    app_private.pepites_minutes_floor(params, 'weekly', 10),
    app_private.pepites_minutes_floor(params, 'weekly', 30),
    app_private.pepites_minutes_floor(params, 'season_final', 30)]
   from app.pepites_methodologies where version = 'v1'),
  array[180, 270, 810, 600],
  'minutes floor: 180 after round 3, 270 after 10, 810 after 30, 600 for a season-final run'
);

-- ===========================================================================
-- Shared catalog
-- ===========================================================================
insert into app.competitions (id, slug, name, competition_type)
values ('e0000000-0000-4000-8000-000000000001', 'engine-league', 'Engine League', 'league');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, is_current, status) values
  ('e0100000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
    '2026/2027', '2026-07-01', '2027-06-30', true, 'active'),
  ('e0100000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001',
    '2025/2026', '2025-07-01', '2026-06-30', false, 'completed');

-- ===========================================================================
-- Part 2: exact rules on a hand-built snapshot
-- ===========================================================================
-- A run left running, fed by hand, then scored. Two teams, three rounds.
insert into app.teams (id, slug, name, short_name) values
  ('e0200000-0000-4000-8000-0000000000a1', 'hand-a', 'Hand A', 'A'),
  ('e0200000-0000-4000-8000-0000000000a2', 'hand-b', 'Hand B', 'B');
insert into app.players (id, slug, full_name, display_name, position)
select ('e0300000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  'hand-player-' || n, 'Hand Player ' || n, 'H. ' || n,
  (array['defender', 'defender', 'defender', 'goalkeeper', 'forward']::app.football_position[])[n]
from generate_series(1, 5) n;
insert into app.pepites_runs (id, season_id, kind, as_of_round_number, methodology_version,
  revision, input_cutoff_at)
values ('e0400000-0000-4000-8000-000000000001', 'e0100000-0000-4000-8000-000000000001',
  'weekly', 3, 'v1', 1, '2026-10-01T00:00:00Z');
insert into app_private.pepites_run_team_fixtures (run_id, team_id, fixture_id, round_number)
select 'e0400000-0000-4000-8000-000000000001', team_id, fixture_id::uuid, round_number
from (values
  ('e0200000-0000-4000-8000-0000000000a1'::uuid, 'e0500000-0000-4000-8000-000000000001', 1),
  ('e0200000-0000-4000-8000-0000000000a1'::uuid, 'e0500000-0000-4000-8000-000000000002', 2),
  ('e0200000-0000-4000-8000-0000000000a1'::uuid, 'e0500000-0000-4000-8000-000000000003', 3)
) f(team_id, fixture_id, round_number);
insert into app_private.pepites_run_players (run_id, player_id, date_of_birth, position_group,
  team_id, membership_id, in_pool)
select 'e0400000-0000-4000-8000-000000000001', ('e0300000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  '2005-01-01', (array['DEF', 'DEF', 'DEF', 'GK', 'FWD'])[n], 'e0200000-0000-4000-8000-0000000000a1', null, true
from generate_series(1, 5) n;
-- Round 1 ended 0-0 (conceded 0), round 2 was lost 0-1 (conceded 1), round 3's
-- score is unknown (only possible in a hand-built snapshot: a finished
-- fixture must have a score).
insert into app_private.pepites_run_appearances (run_id, player_id, fixture_id, team_id,
  round_number, kickoff_at, minutes, started, goals, assists, saves, rating, team_conceded)
select 'e0400000-0000-4000-8000-000000000001', player_id::uuid, fixture_id::uuid,
  'e0200000-0000-4000-8000-0000000000a1', round_number, kickoff::timestamptz, minutes, true,
  0, 0, saves, rating, conceded
from (values
  -- Player 1 (DEF): 60 minutes in the 0-0: a clean sheet. 70 in the 0-1: none.
  ('e0300000-0000-4000-8000-000000000001', 'e0500000-0000-4000-8000-000000000001', 1, '2026-09-01T18:00:00Z', 60, null::integer, 7.0, 0),
  ('e0300000-0000-4000-8000-000000000001', 'e0500000-0000-4000-8000-000000000002', 2, '2026-09-08T18:00:00Z', 70, null, 7.0, 1),
  -- Player 2 (DEF): 59 minutes in the 0-0: no clean sheet.
  ('e0300000-0000-4000-8000-000000000002', 'e0500000-0000-4000-8000-000000000001', 1, '2026-09-01T18:00:00Z', 59, null, 7.0, 0),
  -- Player 3 (DEF): 90 minutes in the unknown-score match.
  ('e0300000-0000-4000-8000-000000000003', 'e0500000-0000-4000-8000-000000000003', 3, '2026-09-15T18:00:00Z', 90, null, 7.0, null),
  -- Player 4 (GK): 90 in the 0-0 with 4 saves, 90 in the 0-1 with 2.
  ('e0300000-0000-4000-8000-000000000004', 'e0500000-0000-4000-8000-000000000001', 1, '2026-09-01T18:00:00Z', 90, 4, 6.5, 0),
  ('e0300000-0000-4000-8000-000000000004', 'e0500000-0000-4000-8000-000000000002', 2, '2026-09-08T18:00:00Z', 90, 2, 6.5, 1),
  -- Player 5 (FWD): 19 minutes (not a rated appearance), then 20 (rated).
  ('e0300000-0000-4000-8000-000000000005', 'e0500000-0000-4000-8000-000000000001', 1, '2026-09-01T18:00:00Z', 19, null, 9.0, 0),
  ('e0300000-0000-4000-8000-000000000005', 'e0500000-0000-4000-8000-000000000002', 2, '2026-09-08T18:00:00Z', 20, null, 8.0, 1)
) a(player_id, fixture_id, round_number, kickoff, minutes, saves, rating, conceded);

create temporary table hand on commit drop as
select * from app_private.pepites_compute_v1('e0400000-0000-4000-8000-000000000001');

select extensions.is(
  (select clean_sheets from hand where player_id = 'e0300000-0000-4000-8000-000000000001'),
  1,
  'clean sheet: 60 minutes in a 0-0 counts; 70 minutes in a match lost 0-1 does not (whole-match rule)'
);
select extensions.is(
  (select clean_sheets from hand where player_id = 'e0300000-0000-4000-8000-000000000002'),
  0,
  'clean sheet: 59 minutes is not enough'
);
select extensions.is(
  (select clean_sheets from hand where player_id = 'e0300000-0000-4000-8000-000000000003'),
  null::integer,
  'clean sheet: an unknown final score stays unknown, not 0'
);
select extensions.ok(
  (select 'unknown_clean_sheet' = any(flags) from hand where player_id = 'e0300000-0000-4000-8000-000000000003'),
  'and the row says so'
);
select extensions.is(
  (select saves || '/' || clean_sheets from hand where player_id = 'e0300000-0000-4000-8000-000000000004'),
  '6/1',
  'a goalkeeper''s saves are summed and his clean sheets counted'
);
select extensions.is(
  (select rating_n from hand where player_id = 'e0300000-0000-4000-8000-000000000005'),
  1,
  'only appearances of 20+ minutes are rated'
);
select extensions.ok(
  (select 'low_rating_sample' = any(flags) and rating_avg = 8.0 and form_avg is null
   from hand where player_id = 'e0300000-0000-4000-8000-000000000005'),
  'under 3 rated appearances: rating and form do not count (flag low_rating_sample)'
);
select extensions.ok(
  (select eligible and not ('below_minutes_floor' = any(flags))
   from hand where player_id = 'e0300000-0000-4000-8000-000000000004'),
  'the goalkeeper''s two full matches make exactly 180 minutes: he reaches the floor and is eligible'
);
select extensions.ok(
  (select 'insufficient_data' = any(flags) and score is null and rank is null
     and (components ->> 'weightSum')::numeric = 0.15
   from hand where player_id = 'e0300000-0000-4000-8000-000000000004'),
  'but only his minutes count (0.15 of the weight, under 0.50): not ranked, flag insufficient_data'
);
select extensions.ok(
  (select bool_and('below_minutes_floor' = any(flags) and not eligible and score is null and rank is null)
   from hand where player_id <> 'e0300000-0000-4000-8000-000000000004'),
  'everyone else is under 180 minutes: not eligible, not ranked'
);
select extensions.ok(
  (select bool_and('no_progression_yet' = any(flags)) from hand),
  'after three rounds there are no earlier rounds to compare: no progression yet'
);
-- Leave the hand-built run as failed so it is sealed like any other.
update app.pepites_runs set status = 'failed', finished_at = now(), error = 'hand-built test run'
where id = 'e0400000-0000-4000-8000-000000000001';

-- ===========================================================================
-- Part 3: a generated league, run end to end
-- ===========================================================================
-- 8 teams, 6 rounds, 14 players a team (shirts: 1 GK, 2-5 DEF, 6-9 MID,
-- 10-14 FWD). Even shirts are under 23, and so are the goalkeepers of odd
-- teams. Deterministic, so every number below is stable.
create function pg_temp.uid(p_prefix text, p_n integer)
returns uuid language sql immutable as $$
  select (p_prefix || lpad(p_n::text, 12, '0'))::uuid;
$$;

insert into app.teams (id, slug, name, short_name)
select pg_temp.uid('e1000000-0000-4000-8000-', t), 'league-team-' || t, 'League Team ' || t, 'LT' || t
from generate_series(1, 8) t;

insert into app.players (id, slug, full_name, display_name, position)
select pg_temp.uid('e2000000-0000-4000-8000-', (t - 1) * 14 + k),
  'league-player-' || ((t - 1) * 14 + k), 'League Player ' || ((t - 1) * 14 + k), 'L. ' || ((t - 1) * 14 + k),
  case when k = 1 then 'goalkeeper' when k <= 5 then 'defender' when k <= 9 then 'midfielder'
    else 'forward' end::app.football_position
from generate_series(1, 8) t cross join generate_series(1, 14) k;

-- Dates of birth through the resolver.
do $$
declare
  v_p integer;
begin
  for v_p in 1..112 loop
    perform app_private.record_player_attribute_observation(
      pg_temp.uid('e2000000-0000-4000-8000-', v_p), 'date_of_birth',
      case when v_p % 2 = 0 or (v_p % 14 = 1 and ((v_p - 1) / 14) % 2 = 0)
        then (date '2004-01-01' + v_p)::text else (date '1995-01-01' + v_p)::text end,
      null, 'provider', 'sportsmonks', 'engine-test', '2026-08-01T00:00:00Z');
  end loop;
  perform app_private.resolve_player_attributes(array(
    select pg_temp.uid('e2000000-0000-4000-8000-', n) from generate_series(1, 112) n));
end;
$$;

insert into app.team_memberships (player_id, team_id, season_id, valid_from, active)
select pg_temp.uid('e2000000-0000-4000-8000-', (t - 1) * 14 + k), pg_temp.uid('e1000000-0000-4000-8000-', t),
  'e0100000-0000-4000-8000-000000000001', '2026-07-01', true
from generate_series(1, 8) t cross join generate_series(1, 14) k;

insert into app.rounds (id, season_id, round_number, name)
select pg_temp.uid('e3000000-0000-4000-8000-', r), 'e0100000-0000-4000-8000-000000000001', r, 'Journée ' || r
from generate_series(1, 6) r;

-- Circle-method pairings, deterministic scores, finalised two hours after
-- kick-off.
do $$
declare
  v_round integer;
  v_i integer;
  v_order integer[];
  v_home integer;
  v_away integer;
begin
  for v_round in 1..6 loop
    v_order := array[1] || (
      select array_agg(((x - 2 + v_round - 1) % 7) + 2 order by x) from generate_series(2, 8) x);
    for v_i in 1..4 loop
      v_home := v_order[v_i];
      v_away := v_order[9 - v_i];
      insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
        kickoff_at, provider_updated_at, status, home_score, away_score, finalized_at)
      values (
        pg_temp.uid('e4000000-0000-4000-8000-', v_round * 10 + v_i),
        'e0000000-0000-4000-8000-000000000001', 'e0100000-0000-4000-8000-000000000001',
        pg_temp.uid('e3000000-0000-4000-8000-', v_round),
        pg_temp.uid('e1000000-0000-4000-8000-', v_home), pg_temp.uid('e1000000-0000-4000-8000-', v_away),
        timestamptz '2026-09-01 18:00:00+00' + (v_round * 7 || ' days')::interval + (v_i || ' hours')::interval,
        timestamptz '2026-09-01 22:00:00+00' + (v_round * 7 || ' days')::interval + (v_i || ' hours')::interval,
        'finished', (v_round * 3 + v_i) % 3, (v_round + v_i * 2) % 2,
        timestamptz '2026-09-01 20:00:00+00' + (v_round * 7 || ' days')::interval + (v_i || ' hours')::interval
      );
    end loop;
  end loop;
end;
$$;

-- Appearances. Shirts 1-11 start (90'), except: 8 (MID) plays only rounds 1-3
-- and 10 (FWD) only rounds 4-6 (for progression); 12-14 come on for 15'
-- (unrated).
insert into app.player_fixture_performances (
  football_season_id, fixture_id, player_id, team_id, position, source_provider, source_version,
  started, appeared, minutes, goals, assists, clean_sheets, goals_conceded, saves, penalties_saved,
  penalties_missed, yellow_cards, red_cards, second_yellow_dismissals, own_goals, provider_rating,
  provider_observed_at
)
select 'e0100000-0000-4000-8000-000000000001', fixture.id, player.id, side.team_id,
  player.position, 'sportsmonks',
  'sportsmonks:' || encode(extensions.digest(fixture.id::text || player.id::text, 'sha256'), 'hex'),
  k <= 11, true,
  case when k <= 11 then 90 else 15 end,
  case when k >= 7 and (p + round.round_number) % 5 = 0 then 1 else 0 end,
  case when k >= 5 and (p * 3 + round.round_number) % 7 = 0 then 1 else 0 end,
  0, 0,
  case when k = 1 then (p + round.round_number) % 5 else 0 end, 0, 0, 0, 0, 0, 0,
  6.0 + ((p * 7 + round.round_number * 3) % 25) / 10.0,
  fixture.finalized_at
from app.fixtures fixture
join app.rounds round on round.id = fixture.round_id
cross join lateral (values (fixture.home_team_id), (fixture.away_team_id)) side(team_id)
cross join generate_series(1, 14) k
cross join lateral (
  select ((substring(side.team_id::text from 25))::integer - 1) * 14 + k as p
) numbering
join app.players player on player.id = pg_temp.uid('e2000000-0000-4000-8000-', numbering.p)
where fixture.season_id = 'e0100000-0000-4000-8000-000000000001'
  and not (k = 8 and round.round_number > 3)
  and not (k = 10 and round.round_number <= 3);

-- Boundary players in team 1: born 1 July 2003 (too old) and 2 July 2003 (in),
-- a player with no date of birth, and a player with minutes but no
-- membership (he left the league).
insert into app.players (id, slug, full_name, display_name, position) values
  ('e2100000-0000-4000-8000-000000000001', 'boundary-old', 'Boundary Old', 'B. Old', 'midfielder'),
  ('e2100000-0000-4000-8000-000000000002', 'boundary-in', 'Boundary In', 'B. In', 'midfielder'),
  ('e2100000-0000-4000-8000-000000000003', 'boundary-nodob', 'Boundary NoDob', 'B. NoDob', 'midfielder'),
  ('e2100000-0000-4000-8000-000000000004', 'boundary-left', 'Boundary Left', 'B. Left', 'forward');
do $$
begin
  perform app_private.record_player_attribute_observation('e2100000-0000-4000-8000-000000000001',
    'date_of_birth', '2003-07-01', null, 'provider', 'sportsmonks', 'b', '2026-08-01T00:00:00Z');
  perform app_private.record_player_attribute_observation('e2100000-0000-4000-8000-000000000002',
    'date_of_birth', '2003-07-02', null, 'provider', 'sportsmonks', 'b', '2026-08-01T00:00:00Z');
  perform app_private.record_player_attribute_observation('e2100000-0000-4000-8000-000000000004',
    'date_of_birth', '2006-01-01', null, 'provider', 'sportsmonks', 'b', '2026-08-01T00:00:00Z');
  perform app_private.resolve_player_attributes(array[
    'e2100000-0000-4000-8000-000000000001'::uuid, 'e2100000-0000-4000-8000-000000000002'::uuid,
    'e2100000-0000-4000-8000-000000000004'::uuid]);
end;
$$;
insert into app.team_memberships (player_id, team_id, season_id, valid_from, active)
select player_id, pg_temp.uid('e1000000-0000-4000-8000-', 1), 'e0100000-0000-4000-8000-000000000001',
  '2026-07-01', true
from unnest(array['e2100000-0000-4000-8000-000000000001', 'e2100000-0000-4000-8000-000000000002',
  'e2100000-0000-4000-8000-000000000003']::uuid[]) player_id;
insert into app.player_fixture_performances (
  football_season_id, fixture_id, player_id, team_id, position, source_provider, source_version,
  started, appeared, minutes, goals, assists, clean_sheets, goals_conceded, saves, penalties_saved,
  penalties_missed, yellow_cards, red_cards, second_yellow_dismissals, own_goals, provider_rating,
  provider_observed_at
)
select 'e0100000-0000-4000-8000-000000000001', fixture.id, boundary.player_id,
  case when fixture.home_team_id = pg_temp.uid('e1000000-0000-4000-8000-', 1)
    or fixture.away_team_id = pg_temp.uid('e1000000-0000-4000-8000-', 1)
    then pg_temp.uid('e1000000-0000-4000-8000-', 1) else fixture.home_team_id end,
  boundary.position, 'sportsmonks',
  'sportsmonks:' || encode(extensions.digest(fixture.id::text || boundary.player_id::text, 'sha256'), 'hex'),
  false, true, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7.0, fixture.finalized_at
from app.fixtures fixture
cross join (values
  ('e2100000-0000-4000-8000-000000000001'::uuid, 'midfielder'::app.football_position),
  ('e2100000-0000-4000-8000-000000000002'::uuid, 'midfielder'::app.football_position),
  ('e2100000-0000-4000-8000-000000000003'::uuid, 'midfielder'::app.football_position),
  ('e2100000-0000-4000-8000-000000000004'::uuid, 'forward'::app.football_position)
) boundary(player_id, position)
where fixture.season_id = 'e0100000-0000-4000-8000-000000000001'
  and (fixture.home_team_id = pg_temp.uid('e1000000-0000-4000-8000-', 1)
    or fixture.away_team_id = pg_temp.uid('e1000000-0000-4000-8000-', 1));

-- ---------------------------------------------------------------------------
-- A run as of round 6
-- ---------------------------------------------------------------------------
create temporary table runs (name text primary key, id uuid) on commit drop;
insert into runs values ('r6', app_private.pepites_start_run(
  'e0100000-0000-4000-8000-000000000001', 'weekly', 6, '2026-12-31T00:00:00Z'));

select extensions.is(
  (select status from app.pepites_runs where id = (select id from runs where name = 'r6')),
  'succeeded',
  'the run succeeds'
);
select extensions.ok(
  (select frozen_at is not null from app.pepites_methodologies where version = 'v1'),
  'the methodology is frozen by its first run'
);
select extensions.is(
  (select count(*)::integer from app_private.pepites_run_team_fixtures where run_id = (select id from runs where name = 'r6')),
  48,
  'the snapshot holds every team''s 6 matches'
);
select extensions.ok(
  (select input_fingerprint from app.pepites_runs where id = (select id from runs where name = 'r6'))
    = app_private.pepites_input_fingerprint('e0100000-0000-4000-8000-000000000001', 'weekly', 6,
        '2026-12-31T00:00:00Z', 23),
  'the snapshot''s fingerprint equals the live data''s: nothing changed since gathering'
);
select set_config('timezone', 'Pacific/Auckland', true);
select set_config('datestyle', 'SQL, DMY', true);
select extensions.ok(
  (select input_fingerprint from app.pepites_runs where id = (select id from runs where name = 'r6'))
    = app_private.pepites_input_fingerprint('e0100000-0000-4000-8000-000000000001', 'weekly', 6,
        '2026-12-31T00:00:00Z', 23),
  'the fingerprint does not depend on the session''s time zone or date style'
);
select extensions.ok(
  (app_private.pepites_replay((select id from runs where name = 'r6')) ->> 'matches')::boolean,
  'a replay in another session setting still matches exactly'
);
select set_config('timezone', 'UTC', true);
select set_config('datestyle', 'ISO, MDY', true);

-- Pool and eligibility
select extensions.ok(
  exists (select 1 from app_private.pepites_run_players
    where run_id = (select id from runs where name = 'r6')
      and player_id = 'e2100000-0000-4000-8000-000000000001' and not in_pool)
  and exists (select 1 from app_private.pepites_run_players
    where run_id = (select id from runs where name = 'r6')
      and player_id = 'e2100000-0000-4000-8000-000000000002' and in_pool),
  'born 1 July 2003 is too old for 2026-27; born 2 July 2003 is in'
);
select extensions.ok(
  exists (select 1 from app_private.pepites_run_players
    where run_id = (select id from runs where name = 'r6')
      and player_id = 'e2100000-0000-4000-8000-000000000003' and not in_pool)
  and not exists (select 1 from app.pepites_player_scores
    where run_id = (select id from runs where name = 'r6')
      and player_id = 'e2100000-0000-4000-8000-000000000003'),
  'no date of birth: not in the pool, not scored'
);
select extensions.ok(
  exists (select 1 from app_private.pepites_run_players
    where run_id = (select id from runs where name = 'r6')
      and player_id = 'e2100000-0000-4000-8000-000000000004' and not in_pool),
  'a player who left the league (no membership) is not in a weekly pool'
);

-- Squad places count only inside their dates, on the cutoff's day: one that
-- starts later, one that ended (still flagged active), one that holds. In a
-- season of their own, so the runs above and below are untouched.
insert into app.seasons (id, competition_id, label, starts_on, ends_on, is_current, status) values
  ('e0100000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001',
    '2024/2025', '2024-07-01', '2025-06-30', false, 'completed');
insert into app.players (id, slug, full_name, display_name, position) values
  ('e2100000-0000-4000-8000-000000000006', 'dated-future', 'Dated Future', 'D. Future', 'midfielder'),
  ('e2100000-0000-4000-8000-000000000007', 'dated-ended', 'Dated Ended', 'D. Ended', 'midfielder'),
  ('e2100000-0000-4000-8000-000000000008', 'dated-holds', 'Dated Holds', 'D. Holds', 'midfielder');
do $$
begin
  perform app_private.record_player_attribute_observation(player_id::uuid, 'date_of_birth',
    '2006-05-05', null, 'provider', 'sportsmonks', 'dated', '2026-08-01T00:00:00Z')
  from unnest(array['e2100000-0000-4000-8000-000000000006', 'e2100000-0000-4000-8000-000000000007',
    'e2100000-0000-4000-8000-000000000008']) player_id;
  perform app_private.resolve_player_attributes(array['e2100000-0000-4000-8000-000000000006'::uuid,
    'e2100000-0000-4000-8000-000000000007'::uuid, 'e2100000-0000-4000-8000-000000000008'::uuid]);
end;
$$;
insert into app.team_memberships (player_id, team_id, season_id, valid_from, valid_to, active) values
  ('e2100000-0000-4000-8000-000000000006', pg_temp.uid('e1000000-0000-4000-8000-', 2),
    'e0100000-0000-4000-8000-000000000003', '2025-02-01', null, true),
  ('e2100000-0000-4000-8000-000000000007', pg_temp.uid('e1000000-0000-4000-8000-', 2),
    'e0100000-0000-4000-8000-000000000003', '2024-07-01', '2024-12-31', true),
  ('e2100000-0000-4000-8000-000000000008', pg_temp.uid('e1000000-0000-4000-8000-', 2),
    'e0100000-0000-4000-8000-000000000003', '2024-07-01', '2025-06-30', true);
select extensions.is(
  (select pg_catalog.string_agg(pool.player_id::text || ':' || pool.in_pool, ',' order by pool.player_id)
   from app_private.pepites_source_players('e0100000-0000-4000-8000-000000000003', 'weekly', 6,
     '2025-01-10T00:00:00Z', 23) pool),
  'e2100000-0000-4000-8000-000000000008:true',
  'a squad place counts only between its dates on the cutoff''s day: not one that starts later or ended'
);
select extensions.ok(
  (select bool_and(eligible = (minutes >= 180)) from app.pepites_player_scores
   where run_id = (select id from runs where name = 'r6')),
  'eligible exactly when minutes reach the floor (180 after 6 matches)'
);
select extensions.ok(
  (select count(*) >= 20 from app.pepites_player_scores
   where run_id = (select id from runs where name = 'r6') and rank is not null),
  'enough players are ranked for an edition'
);

-- Scores and ranks
select extensions.ok(
  (select bool_and(score between 0 and 100 and score = round(score_exact)) from app.pepites_player_scores
   where run_id = (select id from runs where name = 'r6') and score is not null),
  'scores are on 0-100 and are the rounded exact score'
);
select extensions.ok(
  (select bool_and(
     score_exact = round(
       (coalesce(0.30 * (percentiles ->> 'rating')::numeric, 0)
        + coalesce(0.20 * (percentiles ->> 'form')::numeric, 0)
        + coalesce(0.20 * (percentiles ->> 'contribution')::numeric, 0)
        + coalesce(0.15 * (percentiles ->> 'progression')::numeric, 0)
        + coalesce(0.15 * (percentiles ->> 'minutes')::numeric, 0))
       / (components ->> 'weightSum')::numeric, 4)
     and (components ->> 'weightSum')::numeric = round(
       case when percentiles ->> 'rating' is not null then 0.30 else 0 end
       + case when percentiles ->> 'form' is not null then 0.20 else 0 end
       + case when percentiles ->> 'contribution' is not null then 0.20 else 0 end
       + case when percentiles ->> 'progression' is not null then 0.15 else 0 end
       + case when percentiles ->> 'minutes' is not null then 0.15 else 0 end, 4))
   from app.pepites_player_scores
   where run_id = (select id from runs where name = 'r6') and score is not null),
  'every score is the weighted mean of its present percentiles, re-normalised'
);
select extensions.is(
  (select array_agg(rank order by rank) from app.pepites_player_scores
   where run_id = (select id from runs where name = 'r6') and rank is not null),
  (select array_agg(n) from generate_series(1, (select count(*)::integer from app.pepites_player_scores
     where run_id = (select id from runs where name = 'r6') and rank is not null)) n),
  'ranks run 1..n without gaps or ties'
);
select extensions.ok(
  (select bool_and(ordered) from (
     select lag(score_exact) over (order by rank) >= score_exact
       or lag(score_exact) over (order by rank) is null as ordered
     from app.pepites_player_scores
     where run_id = (select id from runs where name = 'r6') and rank is not null) ranks),
  'rank follows the exact score'
);
select extensions.ok(
  (select bool_and((percentiles ->> 'minutes')::numeric = app_private.pepites_percentile(
       minutes, (select array_agg(minutes::numeric) from app.pepites_player_scores other
                 where other.run_id = score.run_id and other.eligible)))
   from app.pepites_player_scores score
   where score.run_id = (select id from runs where name = 'r6') and score.eligible),
  'the minutes percentile is taken over the eligible pool'
);
-- The contribution reference is every forward above the floor, of any age.
select extensions.ok(
  (select bool_and((score.percentiles ->> 'contribution')::numeric = app_private.pepites_percentile(
       round((score.goals + score.assists) * 90.0 / score.minutes, 4),
       (select array_agg(round((totals.goals + totals.assists) * 90.0 / totals.minutes, 4))
        from (
          select sum(a.goals) as goals, sum(a.assists) as assists, sum(a.minutes) as minutes
          from app_private.pepites_run_appearances a
          join app_private.pepites_run_players p on p.run_id = a.run_id and p.player_id = a.player_id
          where a.run_id = score.run_id and p.position_group = 'FWD'
          group by a.player_id
          having sum(a.minutes) >= 180
        ) totals)))
   from app.pepites_player_scores score
   where score.run_id = (select id from runs where name = 'r6') and score.eligible
     and score.position_group = 'FWD'),
  'a forward''s contribution is ranked among all forwards above the floor, of any age'
);
select extensions.ok(
  (select (percentiles ->> 'progression')::numeric > 50 from app.pepites_player_scores
   where run_id = (select id from runs where name = 'r6')
     and player_id = pg_temp.uid('e2000000-0000-4000-8000-', 10)),
  'a player who started only in the last three rounds progresses'
);
select extensions.ok(
  (select (components ->> 'progression')::numeric < 0 from app.pepites_player_scores
   where run_id = (select id from runs where name = 'r6')
     and player_id = pg_temp.uid('e2000000-0000-4000-8000-', 8)),
  'a player who stopped playing after round 3 regresses'
);

-- Reproducibility and sealing
select extensions.is(
  app_private.pepites_replay((select id from runs where name = 'r6')) ->> 'matches',
  'true',
  'the stored run replays exactly'
);
select extensions.throws_ok(
  format('insert into app_private.pepites_run_appearances (run_id, player_id, fixture_id, team_id, round_number, kickoff_at, minutes, started) values (%L, %L, %L, %L, 1, now(), 90, true)',
    (select id from runs where name = 'r6'), pg_temp.uid('e2000000-0000-4000-8000-', 2),
    'e5000000-0000-4000-8000-000000000009', pg_temp.uid('e1000000-0000-4000-8000-', 1)),
  '55000', 'PEPITES_RUN_SEALED',
  'a sealed snapshot takes no new rows'
);
select extensions.throws_ok(
  format('update app_private.pepites_run_appearances set minutes = 1 where run_id = %L',
    (select id from runs where name = 'r6')),
  '55000', 'PEPITES_RUN_SEALED',
  'nor updates'
);
select extensions.throws_ok(
  format('delete from app_private.pepites_run_players where run_id = %L', (select id from runs where name = 'r6')),
  '55000', 'PEPITES_RUN_SEALED',
  'nor deletes'
);
select extensions.throws_ok(
  $$truncate app_private.pepites_run_team_fixtures$$,
  '55000', 'PEPITES_RUN_SEALED',
  'snapshots cannot be truncated'
);
select extensions.throws_ok(
  format('update app.pepites_player_scores set score = 100 where run_id = %L', (select id from runs where name = 'r6')),
  '55000', 'PEPITES_RUN_SEALED',
  'a succeeded run''s scores cannot change'
);
select extensions.throws_ok(
  format('insert into app.pepites_player_scores (run_id, player_id, position_group, apps, starts, minutes, goals, assists, rating_n, eligible, per90, percentiles, components, flags) values (%L, %L, %L, 0, 0, 0, 0, 0, 0, false, %L, %L, %L, %L)',
    (select id from runs where name = 'r6'), 'e2100000-0000-4000-8000-000000000003', 'MID', '{}', '{}', '{}', '{}'),
  '55000', 'PEPITES_RUN_SEALED',
  'nor take new score rows'
);
select extensions.throws_ok(
  $$truncate app.pepites_player_scores$$,
  '55000', 'PEPITES_RUN_SEALED',
  'scores cannot be truncated'
);
select extensions.throws_ok(
  format('update app.pepites_runs set status = %L where id = %L', 'running', (select id from runs where name = 'r6')),
  '55000', 'PEPITES_RUN_SEALED',
  'a succeeded run cannot go back to running'
);
select extensions.throws_ok(
  format('update app.pepites_runs set input_fingerprint = %L where id = %L', repeat('0', 64), (select id from runs where name = 'r6')),
  '55000', 'PEPITES_RUN_SEALED',
  'nor change anything else'
);
select extensions.lives_ok(
  format('update app.pepites_runs set activated_at = now() where id = %L', (select id from runs where name = 'r6')),
  'activated_at can be set once'
);
select extensions.throws_ok(
  format('update app.pepites_runs set activated_at = now() + interval %L where id = %L', '1 day', (select id from runs where name = 'r6')),
  '55000', 'PEPITES_RUN_SEALED',
  'and never changed'
);
select extensions.throws_ok(
  $$update app.pepites_methodologies set params = params || '{"form_window": 5}' where version = 'v1'$$,
  '55000', 'PEPITES_METHODOLOGY_FROZEN',
  'a frozen methodology cannot be edited'
);
select extensions.throws_ok(
  $$delete from app.pepites_methodologies where version = 'v1'$$,
  '55000', 'PEPITES_METHODOLOGY_FROZEN',
  'nor deleted'
);
select extensions.ok(
  (select status = 'failed' from app.pepites_runs where id = 'e0400000-0000-4000-8000-000000000001')
  and (select count(*) = 8 from app_private.pepites_run_appearances where run_id = 'e0400000-0000-4000-8000-000000000001'),
  'a failed run keeps its snapshot'
);
select extensions.throws_ok(
  $$delete from app_private.pepites_run_appearances where run_id = 'e0400000-0000-4000-8000-000000000001'$$,
  '55000', 'PEPITES_RUN_SEALED',
  'and it is sealed too'
);

-- A correction is a new revision; the stored run is untouched.
create temporary table r6_scores on commit drop as
select * from app.pepites_player_scores where run_id = (select id from runs where name = 'r6');
update app.player_fixture_performances set goals = goals + 3
where player_id = pg_temp.uid('e2000000-0000-4000-8000-', 12)
  and fixture_id = pg_temp.uid('e4000000-0000-4000-8000-', 61);
select extensions.ok(
  (select input_fingerprint from app.pepites_runs where id = (select id from runs where name = 'r6'))
    <> app_private.pepites_input_fingerprint('e0100000-0000-4000-8000-000000000001', 'weekly', 6,
        '2026-12-31T00:00:00Z', 23),
  'a corrected appearance changes the live fingerprint'
);
insert into runs values ('r6b', app_private.pepites_start_run(
  'e0100000-0000-4000-8000-000000000001', 'weekly', 6, '2026-12-31T00:00:00Z'));
select extensions.is(
  (select revision from app.pepites_runs where id = (select id from runs where name = 'r6b')),
  2,
  'the next run of the same round is revision 2'
);
select extensions.ok(
  not exists (
    (select * from r6_scores except select * from app.pepites_player_scores where run_id = (select id from runs where name = 'r6'))
    union all
    (select * from app.pepites_player_scores where run_id = (select id from runs where name = 'r6') except select * from r6_scores)
  ),
  'revision 1''s scores are exactly as they were'
);
select extensions.is(
  app_private.pepites_replay((select id from runs where name = 'r6')) ->> 'matches',
  'true',
  'and revision 1 still replays from its own snapshot'
);
select extensions.ok(
  (select goals from app.pepites_player_scores where run_id = (select id from runs where name = 'r6b')
     and player_id = pg_temp.uid('e2000000-0000-4000-8000-', 12))
  = (select goals from r6_scores where player_id = pg_temp.uid('e2000000-0000-4000-8000-', 12)) + 3,
  'revision 2 sees the corrected goals'
);

-- ---------------------------------------------------------------------------
-- An early run: round 3
-- ---------------------------------------------------------------------------
insert into runs values ('r3', app_private.pepites_start_run(
  'e0100000-0000-4000-8000-000000000001', 'weekly', 3, '2026-12-31T00:00:00Z'));
select extensions.ok(
  (select bool_and('no_progression_yet' = any(flags) and percentiles ->> 'progression' is null)
   from app.pepites_player_scores where run_id = (select id from runs where name = 'r3')),
  'as of round 3 progression is null for everyone (no earlier rounds)'
);
select extensions.ok(
  (select bool_and((components ->> 'weightSum')::numeric = 0.85) from app.pepites_player_scores
   where run_id = (select id from runs where name = 'r3') and score is not null),
  'so the other weights are re-normalised over 0.85'
);

-- ---------------------------------------------------------------------------
-- Methodology parameters decide: small reference, insufficient data
-- ---------------------------------------------------------------------------
insert into app.pepites_methodologies (version, engine_function, params, description_fr, description_ar)
select 'v90', engine_function, params || '{"contribution_min_reference": 9}', 'test', 'test'
from app.pepites_methodologies where version = 'v1';
insert into app.pepites_methodologies (version, engine_function, params, description_fr, description_ar)
select 'v91', engine_function, params || '{"min_weight_sum": 0.90}', 'test', 'test'
from app.pepites_methodologies where version = 'v1';
insert into runs values ('small', app_private.pepites_start_run(
  'e0100000-0000-4000-8000-000000000001', 'weekly', 6, '2026-12-31T00:00:00Z', 'v90'));
select extensions.ok(
  (select bool_and('small_reference' = any(flags) and percentiles ->> 'contribution' is null)
   from app.pepites_player_scores
   where run_id = (select id from runs where name = 'small') and position_group = 'GK' and eligible),
  'eight goalkeepers are under a reference of 9: no contribution, flag small_reference'
);
select extensions.ok(
  (select bool_and(percentiles ->> 'contribution' is not null) from app.pepites_player_scores
   where run_id = (select id from runs where name = 'r6') and position_group = 'GK' and eligible),
  'with the v1 reference of 8 the same goalkeepers have a contribution'
);
insert into runs values ('strict', app_private.pepites_start_run(
  'e0100000-0000-4000-8000-000000000001', 'weekly', 3, '2026-12-31T00:00:00Z', 'v91'));
select extensions.ok(
  (select bool_and('insufficient_data' = any(flags) and score is null and rank is null)
   from app.pepites_player_scores
   where run_id = (select id from runs where name = 'strict') and eligible),
  'under the minimum weight (0.85 < 0.90) nobody is ranked: flag insufficient_data'
);

-- A run that fails is recorded as failed, not lost.
insert into app.pepites_methodologies (version, engine_function, params, description_fr, description_ar)
select 'v92', engine_function, params || '{"age_limit": "not a number"}', 'test', 'test'
from app.pepites_methodologies where version = 'v1';
insert into runs values ('broken', app_private.pepites_start_run(
  'e0100000-0000-4000-8000-000000000001', 'weekly', 6, '2026-12-31T00:00:00Z', 'v92'));
select extensions.ok(
  (select status = 'failed' and error is not null and finished_at is not null
   from app.pepites_runs where id = (select id from runs where name = 'broken')),
  'a run that errors is marked failed with its error'
);

-- ===========================================================================
-- Part 4: a completed season's final ranking
-- ===========================================================================
-- Last season: the same league, finished fixtures without finalized_at (as
-- the backfilled 2025-26 data is), and the player who left the league.
insert into app.rounds (id, season_id, round_number, name)
select pg_temp.uid('e3100000-0000-4000-8000-', r), 'e0100000-0000-4000-8000-000000000002', r, 'Journée ' || r
from generate_series(1, 8) r;
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, provider_updated_at, status, home_score, away_score)
select pg_temp.uid('e4100000-0000-4000-8000-', r * 10 + i), 'e0000000-0000-4000-8000-000000000001',
  'e0100000-0000-4000-8000-000000000002', pg_temp.uid('e3100000-0000-4000-8000-', r),
  pg_temp.uid('e1000000-0000-4000-8000-', i), pg_temp.uid('e1000000-0000-4000-8000-', 9 - i),
  timestamptz '2025-10-01 18:00:00+00' + (r * 7 || ' days')::interval + (i || ' hours')::interval,
  timestamptz '2025-10-01 22:00:00+00' + (r * 7 || ' days')::interval + (i || ' hours')::interval,
  'finished', (r + i) % 3, i % 2
from generate_series(1, 8) r cross join generate_series(1, 4) i;
insert into app.player_fixture_performances (
  football_season_id, fixture_id, player_id, team_id, position, source_provider, source_version,
  started, appeared, minutes, goals, assists, clean_sheets, goals_conceded, saves, penalties_saved,
  penalties_missed, yellow_cards, red_cards, second_yellow_dismissals, own_goals, provider_rating,
  provider_observed_at
)
select 'e0100000-0000-4000-8000-000000000002', fixture.id, player.id, side.team_id, player.position,
  'sportsmonks', 'sportsmonks:' || encode(extensions.digest('last' || fixture.id::text || player.id::text, 'sha256'), 'hex'),
  true, true, 90, (numbering.p + 1) % 4 / 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  6.5 + (numbering.p % 10) / 10.0, fixture.provider_updated_at
from app.fixtures fixture
cross join lateral (values (fixture.home_team_id), (fixture.away_team_id)) side(team_id)
cross join generate_series(1, 11) k
cross join lateral (select ((substring(side.team_id::text from 25))::integer - 1) * 14 + k as p) numbering
join app.players player on player.id = pg_temp.uid('e2000000-0000-4000-8000-', numbering.p)
where fixture.season_id = 'e0100000-0000-4000-8000-000000000002';
-- The player who left played all of last season for team 8.
insert into app.player_fixture_performances (
  football_season_id, fixture_id, player_id, team_id, position, source_provider, source_version,
  started, appeared, minutes, goals, assists, clean_sheets, goals_conceded, saves, penalties_saved,
  penalties_missed, yellow_cards, red_cards, second_yellow_dismissals, own_goals, provider_rating,
  provider_observed_at
)
select 'e0100000-0000-4000-8000-000000000002', fixture.id, 'e2100000-0000-4000-8000-000000000004',
  pg_temp.uid('e1000000-0000-4000-8000-', 8), 'forward', 'sportsmonks',
  'sportsmonks:' || encode(extensions.digest('left' || fixture.id::text, 'sha256'), 'hex'),
  true, true, 90, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8.0, fixture.provider_updated_at
from app.fixtures fixture
where fixture.season_id = 'e0100000-0000-4000-8000-000000000002'
  and pg_temp.uid('e1000000-0000-4000-8000-', 8) in (fixture.home_team_id, fixture.away_team_id);

insert into runs values ('final', app_private.pepites_run_season_final('e0100000-0000-4000-8000-000000000002'));
select extensions.is(
  (select kind || ' ' || as_of_round_number || ' ' || status from app.pepites_runs
   where id = (select id from runs where name = 'final')),
  'season_final 8 succeeded',
  'a season-final run ranks the completed season as of its last round'
);
select extensions.ok(
  (select count(*) > 0 from app_private.pepites_run_team_fixtures where run_id = (select id from runs where name = 'final')),
  'finished fixtures without finalized_at count for a completed season'
);
select extensions.ok(
  exists (select 1 from app_private.pepites_run_players
    where run_id = (select id from runs where name = 'final')
      and player_id = 'e2100000-0000-4000-8000-000000000004' and in_pool
      and team_id = pg_temp.uid('e1000000-0000-4000-8000-', 8)),
  'memberships are ignored: the player who left is in, shown with the team he played for'
);
select extensions.ok(
  (select bool_and(eligible = (minutes >= 600)) from app.pepites_player_scores
   where run_id = (select id from runs where name = 'final')),
  'eligible at 600 minutes'
);
select extensions.ok(
  (select count(*) > 0 and bool_and(percentiles ->> 'progression' is not null) from app.pepites_player_scores
   where run_id = (select id from runs where name = 'final') and eligible),
  'players reach 600 minutes, and progression compares the second half of the season with the first'
);
select extensions.is(
  app_private.pepites_replay((select id from runs where name = 'final')) ->> 'matches',
  'true',
  'the season-final run replays exactly'
);

-- ===========================================================================
-- Access
-- ===========================================================================
select extensions.ok(
  (select bool_and(relrowsecurity and relforcerowsecurity) from pg_catalog.pg_class
   where oid in ('app.pepites_methodologies'::regclass, 'app.pepites_runs'::regclass,
     'app.pepites_player_scores'::regclass, 'app_private.pepites_run_players'::regclass,
     'app_private.pepites_run_appearances'::regclass, 'app_private.pepites_run_team_fixtures'::regclass)),
  'RLS enabled and forced on every engine table'
);
select extensions.ok(
  not exists (
    select 1 from unnest(array['anon', 'authenticated', 'service_role']) role_name
    cross join unnest(array['app.pepites_methodologies', 'app.pepites_runs', 'app.pepites_player_scores',
      'app_private.pepites_run_players', 'app_private.pepites_run_appearances',
      'app_private.pepites_run_team_fixtures']) table_name
    where pg_catalog.has_table_privilege(role_name, table_name, 'select')
       or pg_catalog.has_table_privilege(role_name, table_name, 'insert')
  )
  and not exists (
    select 1 from unnest(array['anon', 'authenticated', 'service_role']) role_name
    cross join unnest(array['app_private.pepites_start_run(uuid,text,integer,timestamptz,text)',
      'app_private.pepites_replay(uuid)', 'app_private.pepites_compute(uuid)',
      'app_private.pepites_run_season_final(uuid,text)']) function_signature
    where pg_catalog.has_function_privilege(role_name, function_signature, 'execute')
  ),
  'no client role reads engine tables or runs the engine; reads go through the Pépites API'
);

select * from extensions.finish();

rollback;
