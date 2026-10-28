-- Pépites reads this season's minutes, starts and ratings from SportAPI's
-- captures (migration 20261028140000). Three finished matches of one round:
--   fixture 1: a ready SportAPI capture and no performance rows, goals and
--              assists in the match events;
--   fixture 2: a ready capture and performance rows: minutes and rating from
--              the capture, goals, assists and saves from the rows;
--   fixture 3: only a capture that is not ready, so the rows are read as before.
-- A season-final run ignores the captures. Rows written in this transaction
-- are stamped after its start, so the weekly cutoff is an hour ahead of now().
begin;
select extensions.no_plan();

create function pg_temp.rid(n integer) returns uuid language sql immutable as $$
  select ('cd000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;

insert into app.competitions (id, slug, name, competition_type)
values (pg_temp.rid(1), 'pepites-sportapi-test', 'Pépites SportAPI Test', 'league');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.rid(2), pg_temp.rid(1), '2026/2027', '2026-08-01', '2027-06-30', 'active', false);
insert into app.rounds (id, season_id, round_number, name, status)
values (pg_temp.rid(3), pg_temp.rid(2), 1, 'Round 1', 'completed');
insert into app.teams (id, slug, name, short_name)
select pg_temp.rid(10 + i), 'sportapi-club-' || i, 'SportAPI Club ' || i, 'S' || i
from generate_series(1, 6) i;
-- Players 1-11 club 11, 12-22 club 12 (fixture 1); 23-33 club 13, 34-44 club 14
-- (fixture 2); 45-55 club 15, 56-66 club 16 (fixture 3). The first of each
-- eleven is a goalkeeper.
insert into app.players (id, slug, full_name, display_name, position)
select pg_temp.rid(1000 + i), 'sportapi-player-' || i, 'SportAPI Player ' || i, 'SP' || i,
  case when (i - 1) % 11 = 0 then 'goalkeeper'::app.football_position
    else 'forward'::app.football_position end
from generate_series(1, 66) i;
-- Every player but 66 has a SportAPI identity (external id = 5000 + i).
insert into app_private.football_provider_mappings (provider_name, entity_type, external_id,
  internal_entity_id, source_version, last_seen_at)
select 'sofascore', 'player', (5000 + i)::text, pg_temp.rid(1000 + i), 'test', now()
from generate_series(1, 65) i;

insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, home_score, away_score, provider_updated_at, source_sequence, finalized_at)
values
  (pg_temp.rid(101), pg_temp.rid(1), pg_temp.rid(2), pg_temp.rid(3), pg_temp.rid(11), pg_temp.rid(12),
    '2026-08-10 12:00Z', 'finished', 2, 0, '2026-08-10 14:00Z', 10, '2026-08-10 14:00Z'),
  (pg_temp.rid(102), pg_temp.rid(1), pg_temp.rid(2), pg_temp.rid(3), pg_temp.rid(13), pg_temp.rid(14),
    '2026-08-10 15:00Z', 'finished', 1, 0, '2026-08-10 17:00Z', 10, '2026-08-10 17:00Z'),
  (pg_temp.rid(103), pg_temp.rid(1), pg_temp.rid(2), pg_temp.rid(3), pg_temp.rid(15), pg_temp.rid(16),
    '2026-08-10 18:00Z', 'finished', 0, 0, '2026-08-10 20:00Z', 10, '2026-08-10 20:00Z');

-- A capture: 22 players from p_first, the home eleven first. Each played 90
-- except the last of each side (0 minutes, unused) and the tenth (30, a sub).
create function pg_temp.capture(p_first integer, p_ready boolean) returns void language sql as $$
  insert into app_private.fantasy_api_rating_sources (fixture_id, event_id, digest, players, ready, captured_at)
  select pg_temp.rid(100 + (p_first + 21) / 22), (9000 + p_first)::text, repeat('a', 64),
    jsonb_agg(jsonb_build_object(
      'externalId', (5000 + i)::text,
      'side', case when i - p_first < 11 then 'home' else 'away' end,
      'starter', (i - p_first) % 11 < 9,
      'minutes', case (i - p_first) % 11 when 10 then 0 when 9 then 30 else 90 end,
      'rating', case (i - p_first) % 11 when 10 then null else round(6.0 + ((i - p_first) % 11) / 10.0, 1) end,
      'appeared', (i - p_first) % 11 <> 10,
      'uncertain', false) order by i),
    p_ready, now() - interval '1 hour'
  from generate_series(p_first, p_first + 21) i;
$$;
select pg_temp.capture(1, true);
select pg_temp.capture(23, true);
select pg_temp.capture(45, false);

-- Fixture 1 events: player 2 scores twice, the first assisted by player 3.
insert into app.match_events (fixture_id, team_id, player_id, related_player_id, event_type,
  minute, sequence_number, period, idempotency_key, provider_updated_at)
values
  (pg_temp.rid(101), pg_temp.rid(11), pg_temp.rid(1002), pg_temp.rid(1003), 'goal', 10, 1,
    'first_half', 'sportapi-test:1', '2026-08-10 12:10Z'),
  (pg_temp.rid(101), pg_temp.rid(11), pg_temp.rid(1002), null, 'penalty_goal', 70, 2,
    'second_half', 'sportapi-test:2', '2026-08-10 13:10Z');

-- Fixtures 2 and 3: performance rows, 60 minutes each and a rating of 5.0;
-- player 24 scored, the goalkeepers made 3 saves.
insert into app.player_fixture_performances (
  football_season_id, fixture_id, player_id, team_id, position, source_provider, source_version,
  started, appeared, minutes, goals, assists, clean_sheets, goals_conceded, saves, penalties_saved,
  penalties_missed, yellow_cards, red_cards, second_yellow_dismissals, own_goals, provider_rating,
  provider_observed_at
)
select pg_temp.rid(2), pg_temp.rid(100 + f), pg_temp.rid(1000 + i),
  pg_temp.rid(10 + (i - 1) / 11 + 1), player.position, 'sportsmonks', 'test:' || repeat('b', 64),
  true, true, 60, case when i = 24 then 1 else 0 end, 0, 0, 0,
  case when player.position = 'goalkeeper' then 3 end, 0, 0, 0, 0, 0, 0, 5.0, now()
from generate_series(23, 66) i
cross join lateral (select case when i <= 44 then 2 else 3 end as f) fx
join app.players player on player.id = pg_temp.rid(1000 + i);

create temporary table weekly on commit drop as
select * from app_private.pepites_source_appearances(pg_temp.rid(2), 'weekly', 1, now() + interval '1 hour');

-- 1. A ready capture with no performance rows.
select extensions.is((select count(*)::int from weekly where fixture_id = pg_temp.rid(101)), 20,
  '1.1 every player of the capture who played is counted, unused substitutes are not');
select extensions.is(
  (select minutes || '/' || started || '/' || rating from weekly where player_id = pg_temp.rid(1010)),
  '30/false/6.9', '1.2 minutes, start and rating come from the capture');
select extensions.is(
  (select team_id from weekly where player_id = pg_temp.rid(1015)), pg_temp.rid(12),
  '1.3 an away player counts for the away team');
select extensions.is(
  (select goals || '/' || assists from weekly where player_id = pg_temp.rid(1002)), '2/0',
  '1.4 goals come from the match events, a penalty included');
select extensions.is(
  (select goals || '/' || assists from weekly where player_id = pg_temp.rid(1003)), '0/1',
  '1.5 and assists');
select extensions.is(
  (select saves from weekly where player_id = pg_temp.rid(1001)), null::integer,
  '1.6 a goalkeeper''s saves are unknown, not 0');
select extensions.is(
  (select team_conceded from weekly where player_id = pg_temp.rid(1012)), 2,
  '1.7 the team''s goals conceded still come from the final score');

-- 2. A ready capture and performance rows.
select extensions.is(
  (select minutes || '/' || rating from weekly where player_id = pg_temp.rid(1024)), '90/6.1',
  '2.1 minutes and rating come from the capture, not the rows');
select extensions.is(
  (select goals from weekly where player_id = pg_temp.rid(1024)), 1,
  '2.2 goals come from the performance row');
select extensions.is(
  (select saves from weekly where player_id = pg_temp.rid(1023)), 3,
  '2.3 and saves');
select extensions.is((select count(*)::int from weekly where fixture_id = pg_temp.rid(102)), 20,
  '2.4 one row per player: the capture replaces the rows of that match');

-- 3. A capture that is not ready.
select extensions.is(
  (select count(*)::int || '/' || min(minutes) || '/' || min(rating)::numeric(3, 1)
   from weekly where fixture_id = pg_temp.rid(103)), '22/60/5.0',
  '3.1 the match is read from the performance rows as before');
select extensions.is(
  (select count(*)::int from weekly where player_id = pg_temp.rid(1066)), 1,
  '3.2 including a player SportAPI does not know');

-- 4. Before the cutoff only, and never for a season-final run.
select extensions.is(
  (select count(*)::int from app_private.pepites_source_appearances(pg_temp.rid(2), 'weekly', 1,
    now() - interval '1 day') where minutes = 90 or minutes = 30), 0,
  '4.1 a capture stored after the run''s cutoff is not used');
select extensions.is(
  (select count(*)::int from app_private.pepites_source_appearances(pg_temp.rid(2), 'season_final', 1, now())
   where rating = 5.0 and minutes = 60), 44,
  '4.2 a season-final run reads the performance rows only');

-- 5. The run's inputs still agree with what it gathered.
select extensions.ok(
  app_private.pepites_input_fingerprint(pg_temp.rid(2), 'weekly', 1, now() + interval '1 hour', 23) ~ '^[0-9a-f]{64}$',
  '5.1 the fingerprint reads the new source');
select extensions.ok(
  not has_function_privilege('anon', 'app_private.pepites_source_appearances(uuid,text,integer,timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'app_private.pepites_source_appearances(uuid,text,integer,timestamptz)', 'execute'),
  '5.2 visitors and signed-in users cannot call it');

select * from extensions.finish();
rollback;
