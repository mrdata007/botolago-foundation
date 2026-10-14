-- Regression suite for 20261014120000_football_match_details_partial_sections.
--
-- api.ingest_football_match_details stores each section on its own and leaves
-- out a bad row instead of refusing the whole delivery; the delivery is still
-- refused whole when it cannot be this fixture's. The SofaScore live snapshot
-- tells whether a lineup is stored.
--
-- Provider ids are 98xxxxx (provider sofascore) so no seeded mapping is touched.
-- Each delivery is one second newer than the one before it.
begin;
select extensions.no_plan();
select set_config('app.environment', 'test', true);

insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('e8000000-0000-4000-8000-000000000001', 'MA', 'MAR') on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('e8100000-0000-4000-8000-000000000001', 'partial-league', 'Partial League', 'PL', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('e8200000-0000-4000-8000-000000000001', 'e8100000-0000-4000-8000-000000000001',
  'Partial season', current_date - 30, current_date + 200, 'active', false);
insert into app.teams (id, slug, name, short_name, code, country_id)
select ('e8400000-0000-4000-8000-00000000000' || n)::uuid, 'partial-club-' || n, 'Partial Club ' || n,
  'PC' || n, 'PC' || n, (select id from app.countries where iso_alpha2 = 'MA')
from generate_series(1, 3) n;
insert into app.players (id, slug, full_name, display_name, position)
values ('e8600000-0000-4000-8000-000000000001', 'partial-scorer', 'Partial Scorer', 'P. Scorer', 'forward');
insert into app.fixtures (id, competition_id, season_id, home_team_id, away_team_id, kickoff_at,
  status, period, home_score, away_score, provider_updated_at, source_sequence)
values ('e8500000-0000-4000-8000-000000000001', 'e8100000-0000-4000-8000-000000000001',
  'e8200000-0000-4000-8000-000000000001', 'e8400000-0000-4000-8000-000000000001',
  'e8400000-0000-4000-8000-000000000002', statement_timestamp() - interval '31 minutes',
  'live_first_half', 'first_half', 1, 0, statement_timestamp() - interval '1 minute', 1);
insert into app_private.football_provider_mappings
  (provider_name, entity_type, external_id, internal_entity_id, last_seen_at)
values
  ('sofascore', 'fixture', '9817001', 'e8500000-0000-4000-8000-000000000001', now()),
  ('sofascore', 'team', '9811001', 'e8400000-0000-4000-8000-000000000001', now()),
  ('sofascore', 'team', '9811002', 'e8400000-0000-4000-8000-000000000002', now()),
  ('sofascore', 'team', '9811003', 'e8400000-0000-4000-8000-000000000003', now()),
  ('sofascore', 'player', '9810001', 'e8600000-0000-4000-8000-000000000001', now());

create temporary sequence delivery_clock;
-- One delivery, newer than every one before it.
create function pg_temp.store(p_details jsonb) returns jsonb language sql as $$
  select api.ingest_football_match_details('sofascore', '9817001',
    p_details || jsonb_build_object(
      'providerUpdatedAt', now() - interval '20 minutes' + make_interval(secs => nextval('pg_temp.delivery_clock')),
      'sourceSequence', 1))
$$;
create function pg_temp.goal(p_key text, p_minute integer, p_type text default 'goal') returns jsonb
language sql as $$
  select jsonb_build_object('key', p_key, 'type', p_type, 'teamExternalId', '9811001',
    'playerExternalId', '9810001', 'minute', p_minute, 'addedTime', 0,
    'period', 'first_half', 'sequence', p_minute)
$$;
create function pg_temp.events() returns text[] language sql as $$
  select coalesce(array_agg(provider_event_key || ':' || event_type || ':' || minute
    order by minute, provider_event_key), '{}')
  from app.match_events where fixture_id = 'e8500000-0000-4000-8000-000000000001'
$$;
create function pg_temp.stat_count() returns integer language sql as $$
  select count(*)::integer from app.fixture_team_statistics
  where fixture_id = 'e8500000-0000-4000-8000-000000000001'
$$;
create function pg_temp.lineup_players(p_team text) returns integer language sql as $$
  select count(*)::integer from app.lineup_players player
  join app.lineups lineup on lineup.id = player.lineup_id
  where lineup.fixture_id = 'e8500000-0000-4000-8000-000000000001'
    and lineup.team_id = ('e8400000-0000-4000-8000-00000000000' || p_team)::uuid
$$;
create function pg_temp.snapshot_has_lineups() returns boolean language sql as $$
  select (item ->> 'hasLineups')::boolean
  from jsonb_array_elements(api.football_sofascore_live_snapshot() -> 'fixtures') item
  where item ->> 'externalId' = '9817001'
$$;

-- ---------------------------------------------------------------------------
-- 1 The row checks are private.
-- ---------------------------------------------------------------------------
select extensions.ok(
  not has_function_privilege('anon', 'app_private.football_detail_event_ok(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'app_private.football_detail_statistic_ok(jsonb)', 'execute')
  and not has_function_privilege('service_role', 'app_private.football_detail_lineup_player_ok(jsonb)', 'execute'),
  '1.1 the row checks are not callable from the API roles');
select extensions.ok(
  (select prosecdef and proconfig = array['search_path=""'] from pg_proc
   where oid = 'api.ingest_football_match_details(text, text, jsonb)'::regprocedure)
  and has_function_privilege('service_role', 'api.ingest_football_match_details(text, text, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'api.ingest_football_match_details(text, text, jsonb)', 'execute'),
  '1.2 the ingestion is still definer, empty search_path, service role only');

-- ---------------------------------------------------------------------------
-- 2 The snapshot says whether a lineup is stored.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(pg_temp.snapshot_has_lineups(), false, '2.1 no lineup stored yet: hasLineups false');

-- ---------------------------------------------------------------------------
-- 3 Events: a bad row is left out, the rest stored.
-- ---------------------------------------------------------------------------
create temporary table answer as
select pg_temp.store(jsonb_build_object('events', jsonb_build_array(
  pg_temp.goal('1', 20),
  pg_temp.goal('2', 21, 'header'),
  pg_temp.goal('3', 181),
  pg_temp.goal('4', 30) || jsonb_build_object('addedTime', 61),
  pg_temp.goal('5', 31) || jsonb_build_object('period', 'fourth_half'),
  pg_temp.goal('6', 32) || jsonb_build_object('minute', 32.5)
))) as result;
select extensions.is((select result ->> 'outcome' from answer), 'stored', '3.1 stored');
select extensions.is((select (result ->> 'events')::int from answer), 1, '3.2 the valid goal is stored');
select extensions.is((select (result ->> 'eventsRejected')::int from answer), 5,
  '3.3 the five bad rows (type, minute, added time, period, a minute that is not whole) are counted');
select extensions.is((select result -> 'rejectedSections' from answer), '[]'::jsonb,
  '3.4 no section is refused');
select extensions.is(pg_temp.events(), array['1:goal:20'], '3.5 the timeline has the goal');

-- A row the provider still reports but that cannot be stored keeps the stored version.
select extensions.is(pg_temp.store(jsonb_build_object('events', jsonb_build_array(
  pg_temp.goal('1', 20, 'header'), pg_temp.goal('7', 40)))) ->> 'eventsRemoved', '0',
  '3.6 an event left out is not deleted');
select extensions.is(pg_temp.events(), array['1:goal:20', '7:goal:40'],
  '3.7 it keeps its stored version, and the new goal is added');

-- ---------------------------------------------------------------------------
-- 4 A section that fails is refused alone.
-- ---------------------------------------------------------------------------
drop table answer;
create temporary table answer as
select pg_temp.store(jsonb_build_object(
  'events', jsonb_build_array(pg_temp.goal('8', 41), pg_temp.goal('8', 42)),
  'statistics', jsonb_build_array(
    jsonb_build_object('code', 'shots', 'teamExternalId', '9811001', 'value', 7),
    jsonb_build_object('code', 'shots', 'teamExternalId', '9811002', 'value', 3),
    jsonb_build_object('code', 'fouls', 'teamExternalId', '9811001', 'value', -1),
    jsonb_build_object('code', 'corners', 'teamExternalId', '9811001', 'value', 'many')),
  'lineups', jsonb_build_array(
    jsonb_build_object('teamExternalId', '9811001', 'formation', '4-3-3', 'players', jsonb_build_array(
      jsonb_build_object('playerExternalId', '9810001', 'slot', 'starting', 'position', 'forward',
        'shirtNumber', 9, 'order', 1),
      jsonb_build_object('playerName', 'Named Keeper', 'slot', 'starting', 'position', 'goalkeeper',
        'shirtNumber', 1, 'order', 2),
      jsonb_build_object('playerName', 'Odd Slot', 'slot', 'captain', 'order', 3),
      jsonb_build_object('playerName', 'Odd Shirt', 'slot', 'bench', 'shirtNumber', 'ten', 'order', 4))),
    jsonb_build_object('teamExternalId', '9811002', 'players', 'not a list'::text)),
  'pressure', jsonb_build_array(
    jsonb_build_object('teamExternalId', '9811001', 'minute', 5, 'value', 1),
    jsonb_build_object('teamExternalId', '9811001', 'minute', 5, 'value', 2)),
  'absences', jsonb_build_array(jsonb_build_object('key', '90', 'teamExternalId', '9811001',
    'playerName', 'Someone', 'category', 'holiday'))
)) as result;
select extensions.is((select result ->> 'outcome' from answer), 'stored', '4.1 the delivery is stored');
select extensions.is((select result -> 'rejectedSections' from answer),
  '["events", "lineup:9811002", "pressure", "absences"]'::jsonb,
  '4.2 two events with one key, an unreadable lineup, a doubled pressure minute and an unknown absence category are each refused alone');
select extensions.is(pg_temp.events(), array['1:goal:20', '7:goal:40'],
  '4.3 the refused events section changed nothing');
select extensions.is((select (result ->> 'statistics')::int from answer), 2,
  '4.4 the statistics are stored in the same delivery');
select extensions.is((select (result ->> 'statisticsRejected')::int from answer), 2,
  '4.5 a negative figure and a word are left out and counted');
select extensions.is(pg_temp.stat_count(), 2, '4.6 two statistics rows');
select extensions.is((select (result ->> 'lineups')::int from answer), 1,
  '4.7 the readable lineup is stored');
select extensions.is(pg_temp.lineup_players('1'), 2,
  '4.8 with its known player and its named one');
select extensions.is((select (result ->> 'lineupPlayersRejected')::int from answer), 2,
  '4.9 an unknown slot and a shirt number that is not a number are left out and counted');
select extensions.is(pg_temp.lineup_players('2'), 0, '4.10 the unreadable lineup stored nothing');
select extensions.is(
  (select count(*)::int from app.fixture_pressure where fixture_id = 'e8500000-0000-4000-8000-000000000001')
  + (select count(*)::int from app.fixture_absences where fixture_id = 'e8500000-0000-4000-8000-000000000001'),
  0, '4.11 nothing from the refused pressure and absences sections');
select extensions.is(pg_temp.snapshot_has_lineups(), true, '4.12 a lineup is stored: hasLineups true');

select extensions.is(pg_temp.store(jsonb_build_object('absences', jsonb_build_array(
  jsonb_build_object('key', '91', 'teamExternalId', '9811001', 'playerName', 'Someone',
    'category', 'injury', 'expectedReturnOn', 'soon')))) -> 'rejectedSections',
  '["absences"]'::jsonb, '4.13 a return date that is not a date refuses the absences alone');

-- ---------------------------------------------------------------------------
-- 5 What still refuses the whole delivery.
-- ---------------------------------------------------------------------------
select extensions.throws_ok($$ select pg_temp.store(jsonb_build_object(
  'events', jsonb_build_array(pg_temp.goal('9', 50)),
  'statistics', jsonb_build_array(
    jsonb_build_object('code', 'shots', 'teamExternalId', '9811003', 'value', 1)))) $$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', '5.1 a club that is not in the match refuses everything');
select extensions.throws_ok($$ select pg_temp.store(jsonb_build_object(
  'statistics', jsonb_build_array(jsonb_build_object('code', 'shots', 'value', 1)))) $$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', '5.2 a statistic without a club refuses everything');
select extensions.throws_ok($$ select pg_temp.store(jsonb_build_object('events', '{}'::jsonb)) $$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', '5.3 a section that is not a list refuses everything');
select extensions.throws_ok($$ select api.ingest_football_match_details('sofascore', '9817999',
  jsonb_build_object('providerUpdatedAt', now(), 'sourceSequence', 1)) $$,
  'P0002', 'MAPPING_NOT_FOUND', '5.4 a fixture BotolaGO does not know is refused');
select extensions.is(pg_temp.events(), array['1:goal:20', '7:goal:40'], '5.5 none of them changed anything');

-- ---------------------------------------------------------------------------
-- 6 Order still holds.
-- ---------------------------------------------------------------------------
select extensions.is(api.ingest_football_match_details('sofascore', '9817001', jsonb_build_object(
  'providerUpdatedAt', now() - interval '1 hour', 'sourceSequence', 1,
  'events', '[]'::jsonb)) ->> 'outcome', 'stale', '6.1 an older reply is stale and changes nothing');
select extensions.is(pg_temp.events(), array['1:goal:20', '7:goal:40'], '6.2 the timeline is intact');

select * from extensions.finish();
rollback;
