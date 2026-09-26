begin;

select extensions.no_plan();

-- Following a player, the season figures and the minutes split, and the
-- ranking's new filters (20260926150000).

create function pg_temp.uid(p_prefix text, p_n integer)
returns uuid language sql immutable as $$
  select (p_prefix || lpad(p_n::text, 12, '0'))::uuid;
$$;

-- ===========================================================================
-- Catalog: three clubs over six rounds. A and B meet every round but the
-- fourth, when A plays C instead, so B has five matches (three in the first
-- half, two in the second).
-- ===========================================================================
insert into app.competitions (id, slug, name, competition_type)
values ('d1000000-0000-4000-8000-000000000001', 'pepites-follow-league', 'Pépites Follow League', 'league');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, is_current, status)
values ('d1100000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
  '2026/2027', '2026-07-01', '2027-06-30', true, 'active');
insert into app.teams (id, slug, name, short_name) values
  ('d1200000-0000-4000-8000-000000000001', 'pepites-follow-a', 'Club A', 'A'),
  ('d1200000-0000-4000-8000-000000000002', 'pepites-follow-b', 'Club B', 'B'),
  ('d1200000-0000-4000-8000-000000000003', 'pepites-follow-c', 'Club C', 'C');
insert into app.rounds (id, season_id, round_number, name)
select pg_temp.uid('d1300000-0000-4000-8000-', n), 'd1100000-0000-4000-8000-000000000001', n, 'J' || n
from generate_series(1, 6) n;
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, provider_updated_at, status, home_score, away_score, finalized_at)
select pg_temp.uid('d1400000-0000-4000-8000-', n), 'd1000000-0000-4000-8000-000000000001',
  'd1100000-0000-4000-8000-000000000001', pg_temp.uid('d1300000-0000-4000-8000-', n),
  'd1200000-0000-4000-8000-000000000001',
  case when n = 4 then 'd1200000-0000-4000-8000-000000000003'::uuid
    else 'd1200000-0000-4000-8000-000000000002'::uuid end,
  timestamptz '2026-08-21 19:00:00+00' + ((n - 1) * 7 || ' days')::interval,
  timestamptz '2026-08-21 22:00:00+00' + ((n - 1) * 7 || ' days')::interval,
  'finished', 1, 0, timestamptz '2026-08-21 21:00:00+00' + ((n - 1) * 7 || ' days')::interval
from generate_series(1, 6) n;

-- Players: 1 (A, MID) comes on for 10' in rounds 1-3 and starts rounds 4-6;
-- 2 (B, DEF) plays all B's matches; 3 (A, FWD) plays round 1 only; 4 (B, GK)
-- never plays; 5 is outside the pool; 6-105 fill an account's follows.
insert into app.players (id, slug, full_name, display_name, position)
select pg_temp.uid('d1500000-0000-4000-8000-', n), 'pepites-follow-player-' || n, 'Follow Player ' || n,
  'F. Joueur ' || n,
  case n when 2 then 'defender' when 4 then 'goalkeeper' when 3 then 'forward' else 'midfielder' end::app.football_position
from generate_series(1, 105) n;

create temporary table appearances (player integer, round integer, minutes integer, started boolean,
  goals integer, yellow integer, red integer, own integer) on commit drop;
insert into appearances values
  (1, 1, 10, false, 0, 0, 0, 0), (1, 2, 10, false, 0, 0, 0, 1), (1, 3, 10, false, 0, 0, 0, 0),
  (1, 4, 90, true, 0, 1, 0, 0), (1, 5, 90, true, 1, 0, 0, 0), (1, 6, 90, true, 0, 0, 1, 0),
  (2, 1, 90, true, 0, 0, 0, 0), (2, 2, 90, true, 0, 0, 0, 0), (2, 3, 90, true, 0, 0, 0, 0),
  (2, 5, 90, true, 0, 0, 0, 0), (2, 6, 90, true, 0, 0, 0, 0),
  (3, 1, 90, true, 0, 0, 0, 0);

insert into app.player_fixture_performances (
  football_season_id, fixture_id, player_id, team_id, position, source_provider, source_version,
  started, appeared, minutes, goals, assists, clean_sheets, goals_conceded, saves, penalties_saved,
  penalties_missed, yellow_cards, red_cards, second_yellow_dismissals, own_goals, provider_rating,
  provider_observed_at
)
select 'd1100000-0000-4000-8000-000000000001', pg_temp.uid('d1400000-0000-4000-8000-', a.round),
  pg_temp.uid('d1500000-0000-4000-8000-', a.player),
  case when a.player = 2 then 'd1200000-0000-4000-8000-000000000002'::uuid
    else 'd1200000-0000-4000-8000-000000000001'::uuid end,
  player.position, 'sportsmonks',
  'sportsmonks:' || encode(extensions.digest('follow-' || a.player || '-' || a.round, 'sha256'), 'hex'),
  a.started, true, a.minutes, a.goals, 0, case when a.player = 2 then 0 else 0 end,
  case when a.player = 2 then 1 else 0 end, null, null, 0, a.yellow, a.red, 0, a.own, 6.8,
  timestamptz '2026-08-21 21:00:00+00'
from appearances a
join app.players player on player.id = pg_temp.uid('d1500000-0000-4000-8000-', a.player);

-- A hand-built weekly run as of round 6 (the engine has its own tests).
insert into app.pepites_runs (id, season_id, kind, as_of_round_number, methodology_version,
  revision, input_cutoff_at)
values ('d1600000-0000-4000-8000-000000000001', 'd1100000-0000-4000-8000-000000000001',
  'season_final', 6, 'v1', 1, now());
insert into app_private.pepites_run_players (run_id, player_id, date_of_birth, position_group,
  team_id, membership_id, in_pool)
select 'd1600000-0000-4000-8000-000000000001', pg_temp.uid('d1500000-0000-4000-8000-', n),
  date '2005-01-01' + n,
  case n when 2 then 'DEF' when 4 then 'GK' when 3 then 'FWD' else 'MID' end,
  case when n in (2, 4) then 'd1200000-0000-4000-8000-000000000002'::uuid
    else 'd1200000-0000-4000-8000-000000000001'::uuid end,
  null, n <> 5
from generate_series(1, 105) n;
insert into app_private.pepites_run_team_fixtures (run_id, team_id, fixture_id, round_number)
select 'd1600000-0000-4000-8000-000000000001', side.team_id, fixture.id, round.round_number
from app.fixtures fixture
join app.rounds round on round.id = fixture.round_id
cross join lateral (values (fixture.home_team_id), (fixture.away_team_id)) side(team_id)
where fixture.season_id = 'd1100000-0000-4000-8000-000000000001';
insert into app_private.pepites_run_appearances (run_id, player_id, fixture_id, team_id,
  round_number, kickoff_at, minutes, started, goals, assists, saves, rating, team_conceded)
select 'd1600000-0000-4000-8000-000000000001', pg_temp.uid('d1500000-0000-4000-8000-', a.player),
  pg_temp.uid('d1400000-0000-4000-8000-', a.round),
  case when a.player = 2 then 'd1200000-0000-4000-8000-000000000002'::uuid
    else 'd1200000-0000-4000-8000-000000000001'::uuid end,
  a.round, timestamptz '2026-08-21 19:00:00+00' + ((a.round - 1) * 7 || ' days')::interval,
  a.minutes, a.started, a.goals, 0, null, 6.8, 0
from appearances a;
insert into app.pepites_player_scores (run_id, player_id, team_id, position_group, age_years, apps,
  starts, minutes, goals, assists, saves, clean_sheets, rating_avg, rating_n, form_avg, eligible,
  per90, percentiles, components, flags, score_exact, score, rank, rank_in_position)
values
  ('d1600000-0000-4000-8000-000000000001', pg_temp.uid('d1500000-0000-4000-8000-', 1),
    'd1200000-0000-4000-8000-000000000001', 'MID', 21, 6, 3, 300, 1, 0, null, null, 6.8, 6, 6.8, true,
    '{"goalsAssists": 0.3}', '{}', '{}', '{}', 80, 80, 1, 1),
  ('d1600000-0000-4000-8000-000000000001', pg_temp.uid('d1500000-0000-4000-8000-', 2),
    'd1200000-0000-4000-8000-000000000002', 'DEF', 21, 5, 5, 450, 0, 0, null, 2, 6.8, 5, 6.8, true,
    '{"goalsAssists": 0}', '{}', '{}', '{}', 70, 70, 2, 1),
  ('d1600000-0000-4000-8000-000000000001', pg_temp.uid('d1500000-0000-4000-8000-', 3),
    'd1200000-0000-4000-8000-000000000001', 'FWD', 21, 1, 1, 90, 0, 0, null, null, 6.8, 1, 6.8, true,
    '{"goalsAssists": 0}', '{}', '{}', '{}', 60, 60, 3, 1),
  ('d1600000-0000-4000-8000-000000000001', pg_temp.uid('d1500000-0000-4000-8000-', 4),
    'd1200000-0000-4000-8000-000000000002', 'GK', 21, 0, 0, 0, 0, 0, 0, 0, null, 0, null, false,
    '{}', '{}', '{}', '{below_minutes_floor}', null, null, null, null);
update app.pepites_runs set status = 'succeeded', finished_at = now(), eligible_count = 3,
  ranked_count = 3, input_fingerprint = repeat('0', 64)
where id = 'd1600000-0000-4000-8000-000000000001';
select app_private.pepites_configure('off', false, 'd1000000-0000-4000-8000-000000000001');
select app_private.pepites_activate_season_final('d1600000-0000-4000-8000-000000000001');

-- Player 1 in an open Fantasy game; player 2 is not in it.
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('d1700000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
  'pepites-follow-fantasy', 'Pépites Follow Fantasy', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id, name,
  status, starts_at, ends_at)
values ('d1710000-0000-4000-8000-000000000001', 'd1700000-0000-4000-8000-000000000001',
  'd1100000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000101', '2026/2027',
  'active', current_date - 30, current_date + 200);
insert into app.fantasy_players (id, fantasy_season_id, football_player_id, football_team_id,
  position_id, price)
values ('d1720000-0000-4000-8000-000000000001', 'd1710000-0000-4000-8000-000000000001',
  pg_temp.uid('d1500000-0000-4000-8000-', 1), 'd1200000-0000-4000-8000-000000000001',
  (select id from app.fantasy_positions where code = 'MID'), 5.5);

-- ===========================================================================
-- People: two fans, a guest (anonymous sign-in), and a fan whose account
-- has a second factor it has not given in this session.
-- ===========================================================================
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous)
values
  ('d1800000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated',
    'authenticated', 'pepites-follow-fan@example.test', now(), 'hash', '{}',
    '{"username":"pepites_follow_fan"}', now(), now(), false),
  ('d1800000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated',
    'authenticated', 'pepites-follow-other@example.test', now(), 'hash', '{}',
    '{"username":"pepites_follow_other"}', now(), now(), false),
  ('d1800000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated',
    'authenticated', null, null, null, '{}', '{}', now(), now(), true),
  ('d1800000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated',
    'authenticated', 'pepites-follow-mfa@example.test', now(), 'hash', '{}',
    '{"username":"pepites_follow_mfa"}', now(), now(), false);
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('d1900000-0000-4000-8000-000000000001', 'd1800000-0000-4000-8000-000000000004',
  'Follow TOTP', 'totp', 'verified', now(), now());
insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values ('d1a00000-0000-4000-8000-000000000001', 'd1800000-0000-4000-8000-000000000004',
  now(), now(), 'aal2');

create function pg_temp.act(p_who text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case p_who
    when 'anon' then '{"role":"anon"}'
    when 'fan' then '{"sub":"d1800000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}'
    when 'other' then '{"sub":"d1800000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}'
    when 'guest' then '{"sub":"d1800000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1","is_anonymous":true}'
    when 'mfa' then '{"sub":"d1800000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}'
    when 'mfa2' then '{"sub":"d1800000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2","session_id":"d1a00000-0000-4000-8000-000000000001"}'
  end, true);
end;
$$;

create function pg_temp.p(p_n integer) returns uuid language sql immutable as $$
  select pg_temp.uid('d1500000-0000-4000-8000-', p_n);
$$;

-- ===========================================================================
-- Mode off: nothing
-- ===========================================================================
select pg_temp.act('fan');
select extensions.ok(
  api.pepites_follow_state(pg_temp.p(1)) = '{"available": false}'::jsonb
  and api.pepites_player_stats(null, pg_temp.p(1)) = '{"available": false}'::jsonb,
  'with Pépites off, the follow state and the figures are not available'
);
select extensions.throws_ok(
  $$select api.pepites_set_follow(pg_temp.p(1), true)$$,
  'PT403', 'PEPITES_UNAVAILABLE', 'and nobody can follow'
);
select app_private.pepites_configure('public', null);

-- ===========================================================================
-- Season figures and the minutes split
-- ===========================================================================
select pg_temp.act('anon');
select extensions.is(
  api.pepites_player_stats(null, pg_temp.p(1)) -> 'stats',
  jsonb_build_object('apps', 6, 'starts', 3, 'minutes', 300, 'goals', 1, 'assists', 0,
    'saves', null, 'cleanSheets', 0, 'goalsConceded', 0, 'penaltiesSaved', null,
    'penaltiesMissed', 0, 'yellowCards', 1, 'redCards', 1, 'ownGoals', 1),
  'the figures add up the run''s appearances, with the provider''s cards and own goals beside them'
);
select extensions.is(
  api.pepites_player_stats(null, pg_temp.p(1)) -> 'split',
  '{"firstTo": 3, "lastRound": 6, "firstMinutes": 30, "secondMinutes": 270, "firstMatches": 3, "secondMatches": 3}'::jsonb,
  'the split: rounds 1-3 against 4-6, 30'' then 270'', three club matches in each half'
);
select extensions.is(
  api.pepites_player_stats(null, pg_temp.p(2)) -> 'split',
  '{"firstTo": 3, "lastRound": 6, "firstMinutes": 270, "secondMinutes": 180, "firstMatches": 3, "secondMatches": 2}'::jsonb,
  'a club that sat out round 4 has two matches in the second half, not three'
);
select extensions.ok(
  (select stats #>> '{stats,apps}' = '0' and stats #>> '{stats,minutes}' = '0'
     and stats #>> '{split,firstMinutes}' = '0' and stats #>> '{split,secondMinutes}' = '0'
   from api.pepites_player_stats(null, pg_temp.p(4)) stats),
  'a player in the pool who never played: zeros, not a missing player'
);
select extensions.is(
  api.pepites_player_stats(null, pg_temp.p(5)) ->> 'found', 'false',
  'a player outside the pool is not found'
);
select extensions.ok(
  api.pepites_player_stats(null, pg_temp.p(1)) ->> 'fantasyPlayerId' = 'd1720000-0000-4000-8000-000000000001'
  and api.pepites_player_stats(null, pg_temp.p(2)) -> 'fantasyPlayerId' = 'null'::jsonb,
  'the open Fantasy game''s player, for "＋ Fantasy"; none for a player it does not list'
);
update app.fantasy_seasons set status = 'completed' where id = 'd1710000-0000-4000-8000-000000000001';
select extensions.is(
  api.pepites_player_stats(null, pg_temp.p(1)) -> 'fantasyPlayerId', 'null'::jsonb,
  'nor once that game is over'
);
update app.fantasy_seasons set status = 'active' where id = 'd1710000-0000-4000-8000-000000000001';

-- ===========================================================================
-- Following
-- ===========================================================================
select extensions.is(
  api.pepites_follow_state(pg_temp.p(1)) - 'available' - 'preview',
  '{"found": true, "followers": 0, "following": null}'::jsonb,
  'a visitor sees the count, and no state of their own'
);
select extensions.throws_ok(
  $$select api.pepites_set_follow(pg_temp.p(1), true)$$,
  'PT401', 'PEPITES_SIGN_IN_REQUIRED', 'a visitor cannot follow'
);
select pg_temp.act('guest');
select extensions.throws_ok(
  $$select api.pepites_set_follow(pg_temp.p(1), true)$$,
  'PT403', 'PEPITES_ACCOUNT_REQUIRED', 'nor can a guest: following needs an account'
);
select extensions.is(
  api.pepites_follow_state(pg_temp.p(1)) -> 'following', 'null'::jsonb,
  'and a guest has no state of their own'
);
select pg_temp.act('mfa');
select extensions.is(
  api.pepites_follow_state(pg_temp.p(1)) -> 'following', 'null'::jsonb,
  'an account owing its second factor reads no state of its own'
);
select extensions.throws_ok(
  $$select api.pepites_set_follow(pg_temp.p(1), true)$$,
  'PT403', 'mfa_required', 'and cannot follow until it gives it'
);

select pg_temp.act('fan');
select extensions.is(
  api.pepites_set_follow(pg_temp.p(1), true) - 'available' - 'preview',
  '{"found": true, "followers": 1, "following": true}'::jsonb,
  'a fan follows: one follower, and it is them'
);
select extensions.is(
  api.pepites_set_follow(pg_temp.p(1), true) ->> 'followers', '1',
  'following again changes nothing'
);
select pg_temp.act('other');
select extensions.is(
  api.pepites_follow_state(pg_temp.p(1)) - 'available' - 'preview',
  '{"found": true, "followers": 1, "following": false}'::jsonb,
  'another fan sees one follower, not them'
);
select api.pepites_set_follow(pg_temp.p(1), true);
select pg_temp.act('fan');
select extensions.is(
  api.pepites_set_follow(pg_temp.p(1), false) - 'available' - 'preview',
  '{"found": true, "followers": 1, "following": false}'::jsonb,
  'unfollowing removes only the fan''s own row'
);
select extensions.is(
  api.pepites_set_follow(pg_temp.p(1), false) ->> 'followers', '1',
  'and unfollowing again changes nothing'
);
select extensions.throws_ok(
  $$select api.pepites_set_follow(pg_temp.p(5), true)$$,
  'PT404', 'PEPITES_PLAYER_NOT_FOUND', 'a player the rankings never assessed cannot be followed'
);
select extensions.throws_ok(
  $$select api.pepites_set_follow(pg_temp.p(1), null)$$,
  'PT400', 'PEPITES_FOLLOW_INVALID', 'a missing choice is refused'
);
select extensions.is(
  api.pepites_follow_state(pg_temp.p(5)) ->> 'found', 'false',
  'nor has such a player a follow state'
);

-- The cap: 100 follows an account.
select api.pepites_set_follow(pg_temp.p(n), true) from generate_series(6, 105) n;
select extensions.throws_ok(
  $$select api.pepites_set_follow(pg_temp.p(2), true)$$,
  'PT409', 'PEPITES_FOLLOW_LIMIT', 'the 101st follow is refused'
);
select extensions.is(
  api.pepites_set_follow(pg_temp.p(105), true) ->> 'following', 'true',
  'following one already followed still answers at the cap'
);
select api.pepites_set_follow(pg_temp.p(n), false) from generate_series(6, 105) n;

-- ===========================================================================
-- The ranking: players I follow, minutes floor, second half, clubs
-- ===========================================================================
select api.pepites_set_follow(pg_temp.p(2), true);
select extensions.ok(
  (select ranking ->> 'total' = '1' and ranking #>> '{rows,0,id}' = pg_temp.p(2)::text
   from api.pepites_ranking(null, null, null, null, 'score', 20, 0, null, true) ranking),
  '"players I follow": only the fan''s own'
);
select pg_temp.act('anon');
select extensions.is(
  api.pepites_ranking(null, null, null, null, 'score', 20, 0, null, true) ->> 'total', '0',
  'a visitor follows nobody'
);
select extensions.is(
  api.pepites_ranking(null, null, null, null, 'score', 20, 0, 200, false) ->> 'total', '2',
  'a minutes floor keeps players at or above it'
);
select extensions.ok(
  (select ranking #>> '{rows,0,secondHalfMinutes}' = '270'
     and ranking #>> '{rows,1,secondHalfMinutes}' = '180'
   from api.pepites_ranking(null, null, null, null, 'score', 20, 0) ranking),
  'each row carries its second-half minutes'
);
select extensions.ok(
  (select jsonb_array_length(ranking -> 'teams') = 2
     and ranking #>> '{teams,0,name,fr}' = 'Club A'
   from api.pepites_ranking(null, null, null, null, 'score', 20, 0) ranking)
  and not (api.pepites_ranking(null, null, null, null, 'score', 2, 2) ? 'teams'),
  'the first page lists the ranked players'' clubs; later pages do not'
);
select pg_temp.act('mfa2');
select api.pepites_set_follow(pg_temp.p(3), true);
select extensions.is(
  api.pepites_ranking(null, null, null, null, 'score', 20, 0, null, true) ->> 'total', '1',
  'an account with a second factor, having given it, reads its follows'
);
select pg_temp.act('mfa');
select extensions.is(
  api.pepites_ranking(null, null, null, null, 'score', 20, 0, null, true) ->> 'total', '0',
  'the same account in a session that has not given it reads none, like a visitor'
);
select extensions.throws_ok(
  $$select api.pepites_ranking(null, null, null, null, 'score', 20, 0, -1, false)$$,
  '22023', 'PEPITES_RANKING_INVALID', 'a negative floor is refused'
);

-- ===========================================================================
-- Privacy and grants
-- ===========================================================================
set local role authenticated;
select extensions.throws_ok(
  $$select count(*) from app.pepites_follows$$,
  '42501', null, 'nobody reads the follow rows directly'
);
reset role;
select pg_temp.act('fan');
delete from app.profiles where id = 'd1800000-0000-4000-8000-000000000001';
select extensions.is(
  (select count(*)::integer from app.pepites_follows
   where user_id = 'd1800000-0000-4000-8000-000000000001'),
  0, 'an account''s follows go with its profile'
);
select extensions.ok(
  has_function_privilege('anon', 'api.pepites_follow_state(uuid)', 'execute')
  and has_function_privilege('anon', 'api.pepites_player_stats(text, uuid)', 'execute')
  and has_function_privilege('anon',
    'api.pepites_ranking(text, text, integer, uuid, text, integer, integer, integer, boolean)', 'execute')
  and not has_function_privilege('anon', 'api.pepites_set_follow(uuid, boolean)', 'execute')
  and has_function_privilege('authenticated', 'api.pepites_set_follow(uuid, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'app_private.pepites_minutes_split(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'app_private.pepites_follow_json(uuid)', 'execute'),
  'reads for everyone, following for signed-in accounts, helpers for nobody'
);

select * from extensions.finish();
rollback;
