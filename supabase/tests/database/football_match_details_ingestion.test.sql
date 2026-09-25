-- Regression suite for 20260925141500_football_match_details_ingestion.
--
-- Provider ids are 99xxxxx so no seeded mapping is touched. Fixture times
-- are relative to statement_timestamp(), with odd seconds; provider times
-- use now(), which holds for the whole transaction, so "the same provider
-- version" is exactly the same instant from one statement to the next.
begin;
select extensions.no_plan();

-- ---------------------------------------------------------------------------
-- Who may call what.
-- ---------------------------------------------------------------------------
select extensions.ok(
  has_function_privilege('service_role', 'api.ingest_football_match_details(text, text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'api.ingest_football_match_details(text, text, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'api.ingest_football_match_details(text, text, jsonb)', 'execute'),
  'only the service role stores match details');
select extensions.ok(
  has_function_privilege('service_role',
    'api.service_football_match_details_due(text, text, text, integer)', 'execute')
  and not has_function_privilege('anon',
    'api.service_football_match_details_due(text, text, text, integer)', 'execute')
  and not has_function_privilege('authenticated',
    'api.service_football_match_details_due(text, text, text, integer)', 'execute'),
  'only the service role lists the fixtures due');
select extensions.ok(
  has_function_privilege('anon', 'api.football_match_pressure(uuid, text)', 'execute')
  and has_function_privilege('anon', 'api.football_match_absences(uuid, text)', 'execute'),
  'visitors read the pressure curve and the absent players, as they read the other tabs');
select extensions.ok(
  (select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
   where oid in ('app.fixture_pressure'::regclass, 'app.fixture_absences'::regclass))
  and not has_table_privilege('anon', 'app.fixture_pressure', 'select')
  and not has_table_privilege('service_role', 'app.fixture_absences', 'insert'),
  'the two new tables are reached only through their functions');
select extensions.ok(
  (select prosecdef and proconfig = array['search_path=""'] from pg_proc
   where oid = 'api.ingest_football_match_details(text, text, jsonb)'::regprocedure),
  'the ingestion runs as definer with an empty search_path');

-- ---------------------------------------------------------------------------
-- One current season, two clubs and a third, six known players, one match
-- finalized half an hour ago.
-- ---------------------------------------------------------------------------
insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('f7000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('f7100000-0000-4000-8000-000000000001', 'details-league', 'Details League', 'DL', 'league',
  'f7000000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('f7200000-0000-4000-8000-000000000001', 'f7100000-0000-4000-8000-000000000001',
  'Details season', current_date - 30, current_date + 200, 'active', true);
insert into app.teams (id, slug, name, short_name, code, country_id)
select ('f7400000-0000-4000-8000-00000000000' || n)::uuid, 'details-club-' || n, 'Details Club ' || n,
  'DC' || n, 'DC' || n, 'f7000000-0000-4000-8000-000000000001'
from generate_series(1, 3) n;
insert into app.players (id, slug, full_name, display_name, position)
values
  ('f7600000-0000-4000-8000-000000000401', 'home-keeper', 'Home Keeper', 'H. Keeper', 'goalkeeper'),
  ('f7600000-0000-4000-8000-000000000402', 'home-striker', 'Home Striker', 'H. Striker', 'forward'),
  ('f7600000-0000-4000-8000-000000000403', 'home-sub', 'Home Sub', 'H. Sub', 'midfielder'),
  ('f7600000-0000-4000-8000-000000000501', 'away-scorer', 'Away Scorer', 'A. Scorer', 'forward'),
  ('f7600000-0000-4000-8000-000000000502', 'away-maker', 'Away Maker', 'A. Maker', 'midfielder'),
  ('f7600000-0000-4000-8000-000000000503', 'away-sub', 'Away Sub', 'A. Sub', 'forward'),
  ('f7600000-0000-4000-8000-000000000404', 'home-injured', 'Home Injured', 'H. Injured', 'defender');

insert into app.fixtures (id, competition_id, season_id, home_team_id, away_team_id, kickoff_at,
  status, period, home_score, away_score, provider_updated_at, source_sequence, finalized_at)
values ('f7500000-0000-4000-8000-000000000001', 'f7100000-0000-4000-8000-000000000001',
  'f7200000-0000-4000-8000-000000000001', 'f7400000-0000-4000-8000-000000000001',
  'f7400000-0000-4000-8000-000000000002', statement_timestamp() - interval '2 hours 37 seconds',
  'finished', 'post_match', 1, 3, statement_timestamp() - interval '31 minutes', 1,
  statement_timestamp() - interval '30 minutes 7 seconds');

insert into app_private.football_provider_mappings
  (provider_name, entity_type, external_id, internal_entity_id, last_seen_at)
values
  ('sportsmonks', 'season', '9928647', 'f7200000-0000-4000-8000-000000000001', now()),
  ('sportsmonks', 'fixture', '9907001', 'f7500000-0000-4000-8000-000000000001', now()),
  ('sportsmonks', 'team', '9901001', 'f7400000-0000-4000-8000-000000000001', now()),
  ('sportsmonks', 'team', '9901002', 'f7400000-0000-4000-8000-000000000002', now()),
  ('sportsmonks', 'team', '9901003', 'f7400000-0000-4000-8000-000000000003', now()),
  ('sportsmonks', 'player', '9900401', 'f7600000-0000-4000-8000-000000000401', now()),
  ('sportsmonks', 'player', '9900402', 'f7600000-0000-4000-8000-000000000402', now()),
  ('sportsmonks', 'player', '9900403', 'f7600000-0000-4000-8000-000000000403', now()),
  ('sportsmonks', 'player', '9900501', 'f7600000-0000-4000-8000-000000000501', now()),
  ('sportsmonks', 'player', '9900502', 'f7600000-0000-4000-8000-000000000502', now()),
  ('sportsmonks', 'player', '9900503', 'f7600000-0000-4000-8000-000000000503', now()),
  ('sportsmonks', 'player', '9900404', 'f7600000-0000-4000-8000-000000000404', now());

create function pg_temp.store(p_details jsonb) returns jsonb language sql as $$
  select api.ingest_football_match_details('sportsmonks', '9907001', p_details)
$$;
create function pg_temp.timeline() returns jsonb language sql as $$
  select api.football_match_timeline('f7500000-0000-4000-8000-000000000001', 'fr')
$$;
create function pg_temp.event(p_key text) returns jsonb language sql as $$
  select item from jsonb_array_elements(pg_temp.timeline()) item
  join app.match_events event on event.id = (item ->> 'id')::uuid
  where event.provider_event_key = p_key
$$;

-- ---------------------------------------------------------------------------
-- First delivery.
-- ---------------------------------------------------------------------------
create temporary table first_result as
select pg_temp.store(jsonb_build_object(
  'providerUpdatedAt', now() - interval '20 minutes',
  'sourceSequence', 1000,
  'events', jsonb_build_array(
    jsonb_build_object('key', '1', 'type', 'goal', 'teamExternalId', '9901002',
      'playerExternalId', '9900501', 'relatedPlayerExternalId', '9900502',
      'detail', 'Provider Spelling', 'minute', 12, 'addedTime', 0, 'period', 'first_half', 'sequence', 1),
    jsonb_build_object('key', '2', 'type', 'yellow_card', 'teamExternalId', '9901001',
      'playerExternalId', '9900405', 'detail', 'Unknown Player', 'minute', 30, 'addedTime', 0,
      'period', 'first_half', 'sequence', 2),
    jsonb_build_object('key', '3', 'type', 'own_goal', 'teamExternalId', '9901002',
      'playerExternalId', '9900401', 'minute', 45, 'addedTime', 2, 'period', 'first_half', 'sequence', 3),
    jsonb_build_object('key', '4', 'type', 'substitution', 'teamExternalId', '9901002',
      'playerExternalId', '9900503', 'relatedPlayerExternalId', '9900501', 'minute', 75,
      'addedTime', 0, 'period', 'second_half', 'sequence', 4),
    jsonb_build_object('key', '5', 'type', 'var', 'teamExternalId', null, 'detail', null,
      'minute', 80, 'addedTime', 0, 'period', 'second_half', 'sequence', 5)
  ),
  'statistics', jsonb_build_array(
    jsonb_build_object('code', 'possession', 'teamExternalId', '9901001', 'value', 44),
    jsonb_build_object('code', 'possession', 'teamExternalId', '9901002', 'value', 56),
    jsonb_build_object('code', 'shots', 'teamExternalId', '9901001', 'value', 9),
    jsonb_build_object('code', 'shots', 'teamExternalId', '9901002', 'value', 14),
    jsonb_build_object('code', 'attacks', 'teamExternalId', '9901002', 'value', 90),
    jsonb_build_object('code', 'expected_goals', 'teamExternalId', '9901001', 'value', 0.731),
    jsonb_build_object('code', 'expected_goals', 'teamExternalId', '9901002', 'value', 1.8421)
  ),
  'pressure', jsonb_build_array(
    jsonb_build_object('teamExternalId', '9901001', 'minute', 1, 'value', 0),
    jsonb_build_object('teamExternalId', '9901002', 'minute', 1, 'value', 12.5),
    jsonb_build_object('teamExternalId', '9901001', 'minute', 2, 'value', 30.25)
  ),
  'absences', jsonb_build_array(
    jsonb_build_object('key', '81', 'teamExternalId', '9901001', 'playerExternalId', '9900404',
      'playerName', 'Provider Injured', 'category', 'injury', 'expectedReturnOn', '2026-10-12',
      'gamesMissed', 3),
    jsonb_build_object('key', '82', 'teamExternalId', '9901002', 'playerExternalId', '9900999',
      'playerName', 'Unknown Suspended', 'category', 'suspension', 'expectedReturnOn', null,
      'gamesMissed', null)
  ),
  'lineups', jsonb_build_array(
    jsonb_build_object('teamExternalId', '9901001', 'formation', '4-3-3', 'confirmed', true,
      'players', jsonb_build_array(
        jsonb_build_object('playerExternalId', '9900402', 'slot', 'starting', 'position', 'forward',
          'shirtNumber', 9, 'order', 11),
        jsonb_build_object('playerExternalId', '9900401', 'slot', 'starting', 'position', 'goalkeeper',
          'shirtNumber', 1, 'order', 1),
        jsonb_build_object('playerExternalId', '9900405', 'slot', 'starting', 'order', 6),
        jsonb_build_object('playerExternalId', null, 'slot', 'starting', 'order', 7),
        jsonb_build_object('playerExternalId', '9900403', 'slot', 'bench', 'shirtNumber', 0, 'order', 103)
      )),
    jsonb_build_object('teamExternalId', '9901002', 'formation', 'not-a-formation',
      'players', jsonb_build_array(
        jsonb_build_object('playerExternalId', '9900501', 'slot', 'starting', 'position', 'forward',
          'order', 10),
        jsonb_build_object('playerExternalId', '9900502', 'slot', 'bench', 'order', 101)
      ))
  )
)) as result;

select extensions.is((select result from first_result),
  jsonb_build_object('outcome', 'stored', 'fixtureId', 'f7500000-0000-4000-8000-000000000001',
    'events', 5, 'eventsRemoved', 0, 'statistics', 6, 'lineups', 2, 'lineupPlayers', 5,
    'unmappedPlayers', 2, 'pressure', 3, 'absences', 2, 'absencesRemoved', 0),
  'the first delivery is stored whole; the unknown statistic and the two unknown players are left out');

select extensions.is(jsonb_array_length(pg_temp.timeline()), 5, 'the Résumé reads five events');
select extensions.is(pg_temp.event('1') ->> 'detail', 'A. Scorer',
  'a known scorer carries the catalogue''s name, as the lineups spell it');
select extensions.is(pg_temp.event('1') ->> 'relatedPlayerId', 'f7600000-0000-4000-8000-000000000502',
  'and the assist');
select extensions.ok((pg_temp.event('2') ->> 'playerId') is null
  and pg_temp.event('2') ->> 'detail' = 'Unknown Player',
  'a player the catalogue does not know keeps the provider''s name');
select extensions.is(pg_temp.event('3') ->> 'teamId', 'f7400000-0000-4000-8000-000000000002',
  'the own goal stays on the side it was delivered for');
select extensions.ok((pg_temp.event('5') ->> 'teamId') is null and (pg_temp.event('5') ->> 'detail') is null,
  'an event with no club has no side');

select extensions.is(
  (select jsonb_agg(jsonb_build_array(item ->> 'code', (item ->> 'homeValue')::numeric,
     (item ->> 'awayValue')::numeric) order by item ->> 'code')
   from jsonb_array_elements(api.football_match_statistics('f7500000-0000-4000-8000-000000000001', 'fr')) item),
  '[["expected_goals", 0.731, 1.8421], ["possession", 44, 56], ["shots", 9, 14]]'::jsonb,
  'the Stats tab reads expected goals, possession and shots for both clubs');
select extensions.is(
  (select array_agg(item ->> 'code' order by ordinality)
   from jsonb_array_elements(api.football_match_statistics('f7500000-0000-4000-8000-000000000001', 'fr'))
     with ordinality as listed(item, ordinality)),
  array['possession', 'expected_goals', 'shots'], 'xG is listed right after possession');

select extensions.is(api.football_match_pressure('f7500000-0000-4000-8000-000000000001', 'fr'),
  '[{"minute": 1, "homeValue": 0, "awayValue": 12.5}, {"minute": 2, "homeValue": 30.25, "awayValue": null}]'::jsonb,
  'the pressure chart reads one row a minute with both clubs');
select extensions.is(
  (select jsonb_agg(jsonb_build_array(item ->> 'playerName', item ->> 'category', item ->> 'position',
     item ->> 'expectedReturnOn', (item ->> 'gamesMissed')::int, item ->> 'teamId')
     order by item ->> 'playerName')
   from jsonb_array_elements(api.football_match_absences('f7500000-0000-4000-8000-000000000001', 'fr')) item),
  jsonb_build_array(
    jsonb_build_array('H. Injured', 'injury', 'defender', '2026-10-12', 3, 'f7400000-0000-4000-8000-000000000001'),
    jsonb_build_array('Unknown Suspended', 'suspension', null, null, null, 'f7400000-0000-4000-8000-000000000002')),
  'the Compos tab reads the absent players: a known one by the catalogue''s name, an unknown one by the provider''s');

select extensions.is(
  (select jsonb_agg(jsonb_build_object('formation', lineup ->> 'formation',
     'players', (select jsonb_agg(jsonb_build_array(p ->> 'displayName', p ->> 'slot', (p ->> 'order')::int,
       p ->> 'position', p -> 'shirtNumber') order by p ->> 'slot' desc, (p ->> 'order')::int)
       from jsonb_array_elements(lineup -> 'players') p)) order by lineup -> 'team' ->> 'slug')
   from jsonb_array_elements(api.football_match_lineups('f7500000-0000-4000-8000-000000000001', 'fr')) lineup),
  jsonb_build_array(
    jsonb_build_object('formation', '4-3-3', 'players', jsonb_build_array(
      jsonb_build_array('H. Keeper', 'starting', 1, 'goalkeeper', 1),
      jsonb_build_array('H. Striker', 'starting', 2, 'forward', 9),
      jsonb_build_array('H. Sub', 'bench', 1, 'midfielder', null))),
    jsonb_build_object('formation', null, 'players', jsonb_build_array(
      jsonb_build_array('A. Scorer', 'starting', 1, 'forward', null),
      jsonb_build_array('A. Maker', 'bench', 1, 'midfielder', null)))),
  'the Compos tab reads each club''s known players in the provider''s order, positions filled from the catalogue');

-- ---------------------------------------------------------------------------
-- A later delivery: one event corrected, two withdrawn, one new; one
-- statistic gone; no lineups at all.
-- ---------------------------------------------------------------------------
create temporary table kept as
select event.provider_event_key, event.id from app.match_events event
where event.fixture_id = 'f7500000-0000-4000-8000-000000000001';
create temporary table kept_absence as
select provider_key, id from app.fixture_absences
where fixture_id = 'f7500000-0000-4000-8000-000000000001' and provider_key = 'sportsmonks:sidelined:81';

select extensions.is(pg_temp.store(jsonb_build_object(
  'providerUpdatedAt', now() - interval '10 minutes',
  'sourceSequence', 2000,
  'events', jsonb_build_array(
    jsonb_build_object('key', '1', 'type', 'goal', 'teamExternalId', '9901002',
      'playerExternalId', '9900501', 'minute', 13, 'addedTime', 0, 'period', 'first_half', 'sequence', 1),
    jsonb_build_object('key', '3', 'type', 'own_goal', 'teamExternalId', '9901002',
      'playerExternalId', '9900401', 'minute', 45, 'addedTime', 2, 'period', 'first_half', 'sequence', 2),
    jsonb_build_object('key', '4', 'type', 'substitution', 'teamExternalId', '9901002',
      'playerExternalId', '9900503', 'relatedPlayerExternalId', '9900501', 'minute', 75,
      'addedTime', 0, 'period', 'second_half', 'sequence', 3),
    jsonb_build_object('key', '6', 'type', 'penalty_goal', 'teamExternalId', '9901001',
      'playerExternalId', '9900402', 'minute', 88, 'addedTime', 0, 'period', 'second_half', 'sequence', 4)
  ),
  'statistics', jsonb_build_array(
    jsonb_build_object('code', 'possession', 'teamExternalId', '9901001', 'value', 45),
    jsonb_build_object('code', 'possession', 'teamExternalId', '9901002', 'value', 55)
  ),
  'lineups', '[]'::jsonb,
  'pressure', jsonb_build_array(
    jsonb_build_object('teamExternalId', '9901001', 'minute', 1, 'value', 0),
    jsonb_build_object('teamExternalId', '9901002', 'minute', 1, 'value', 11),
    jsonb_build_object('teamExternalId', '9901001', 'minute', 2, 'value', 30.25),
    jsonb_build_object('teamExternalId', '9901002', 'minute', 3, 'value', 40)
  ),
  'absences', jsonb_build_array(
    jsonb_build_object('key', '81', 'teamExternalId', '9901001', 'playerExternalId', '9900404',
      'category', 'injury', 'expectedReturnOn', '2026-10-19', 'gamesMissed', 4))
)) ->> 'eventsRemoved', '2', 'a later delivery removes the two events it no longer reports');

select extensions.ok(
  (select bool_and(event.id = kept.id) from app.match_events event
   join kept using (provider_event_key)
   where event.fixture_id = 'f7500000-0000-4000-8000-000000000001'),
  'an event keeps its id from one delivery to the next (the goal takeover is keyed on it)');
select extensions.is((pg_temp.event('1') ->> 'minute')::int, 13, 'a corrected minute is applied');
select extensions.ok((pg_temp.event('1') ->> 'relatedPlayerId') is null, 'and a withdrawn assist');
select extensions.is(
  (select array_agg(provider_event_key order by sequence_number) from app.match_events
   where fixture_id = 'f7500000-0000-4000-8000-000000000001'),
  array['1', '3', '4', '6'], 'the new event joins, in order');
select extensions.is(
  (select count(*)::int from app.fixture_team_statistics
   where fixture_id = 'f7500000-0000-4000-8000-000000000001'), 2,
  'a statistic the provider no longer sends is removed');
select extensions.is(
  (select count(*)::int from app.lineup_players selection
   join app.lineups lineup on lineup.id = selection.lineup_id
   where lineup.fixture_id = 'f7500000-0000-4000-8000-000000000001'), 5,
  'an empty lineups section keeps the stored lineups');
select extensions.is(
  (select array_agg(minute || ':' || pressure order by minute, team_id) from app.fixture_pressure
   where fixture_id = 'f7500000-0000-4000-8000-000000000001'),
  array['1:0.000', '1:11.000', '2:30.250', '3:40.000'], 'the pressure curve is replaced whole, revised minute included');
select extensions.ok(
  (select count(*) = 1 from app.fixture_absences where fixture_id = 'f7500000-0000-4000-8000-000000000001')
  and (select id = (select id from kept_absence) and expected_return_on = date '2026-10-19'
       from app.fixture_absences where provider_key = 'sportsmonks:sidelined:81'),
  'a player no longer listed is no longer absent; the one still out keeps his row, with the new return date');
-- ---------------------------------------------------------------------------
-- An older reply, and an empty one.
-- ---------------------------------------------------------------------------
select extensions.is(pg_temp.store(jsonb_build_object(
  'providerUpdatedAt', now() - interval '15 minutes',
  'sourceSequence', 9999,
  'events', jsonb_build_array(jsonb_build_object('key', '9', 'type', 'goal', 'teamExternalId', '9901001',
    'minute', 1, 'addedTime', 0, 'period', 'first_half', 'sequence', 1))
)) ->> 'outcome', 'stale', 'an older reply is refused as stale');
select extensions.is(pg_temp.store(jsonb_build_object(
  'providerUpdatedAt', now() - interval '10 minutes',
  'sourceSequence', 1999
)) ->> 'outcome', 'stale', 'as is the same provider version read earlier');
select extensions.is(pg_temp.store(jsonb_build_object(
  'providerUpdatedAt', now() - interval '5 minutes',
  'sourceSequence', 3000,
  'events', '[]'::jsonb, 'statistics', '[]'::jsonb, 'lineups', '[]'::jsonb
)) ->> 'events', '0', 'an empty reply is accepted');
select extensions.ok(
  (select count(*) = 4 from app.match_events where fixture_id = 'f7500000-0000-4000-8000-000000000001')
  and (select count(*) = 2 from app.fixture_team_statistics
       where fixture_id = 'f7500000-0000-4000-8000-000000000001'),
  'but wipes nothing');
select extensions.ok(
  (select count(*) = 1 from app.fixture_absences where fixture_id = 'f7500000-0000-4000-8000-000000000001')
  and (select count(*) = 4 from app.fixture_pressure where fixture_id = 'f7500000-0000-4000-8000-000000000001'),
  'no absences section and no pressure keep what is stored');
select extensions.is(pg_temp.store(jsonb_build_object(
  'providerUpdatedAt', now() - interval '4 minutes',
  'sourceSequence', 3100,
  'absences', '[]'::jsonb
)) ->> 'absencesRemoved', '1', 'an empty absences list means nobody is out any more');
-- ---------------------------------------------------------------------------
-- Refusals: the whole delivery, nothing half-written.
-- ---------------------------------------------------------------------------
select extensions.throws_ok($$ select pg_temp.store(jsonb_build_object(
  'providerUpdatedAt', now(), 'sourceSequence', 4000,
  'statistics', jsonb_build_array(
    jsonb_build_object('code', 'shots', 'teamExternalId', '9901003', 'value', 1)))) $$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'a club that is not in the match is refused');
select extensions.throws_ok($$ select pg_temp.store(jsonb_build_object(
  'providerUpdatedAt', now(), 'sourceSequence', 4000,
  'statistics', jsonb_build_array(jsonb_build_object('code', 'shots', 'value', 1)))) $$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'a statistic without a club is refused');
select extensions.throws_ok($$ select pg_temp.store(jsonb_build_object(
  'providerUpdatedAt', now(), 'sourceSequence', 4000,
  'events', jsonb_build_array(jsonb_build_object('key', '7', 'type', 'header', 'minute', 1,
    'period', 'first_half', 'sequence', 1)))) $$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'an event type the page does not know is refused');
select extensions.throws_ok($$ select pg_temp.store(jsonb_build_object(
  'providerUpdatedAt', now(), 'sourceSequence', 4000,
  'events', jsonb_build_array(
    jsonb_build_object('key', '7', 'type', 'goal', 'minute', 1, 'period', 'first_half', 'sequence', 1),
    jsonb_build_object('key', '7', 'type', 'goal', 'minute', 2, 'period', 'first_half', 'sequence', 2)))) $$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'two events with one key are refused');
select extensions.throws_ok($$ select pg_temp.store(jsonb_build_object(
  'providerUpdatedAt', now(), 'sourceSequence', 4000,
  'events', jsonb_build_array(
    jsonb_build_object('key', '7', 'type', 'goal', 'minute', 181, 'period', 'first_half', 'sequence', 1)))) $$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'a minute out of range is refused');
select extensions.throws_ok($$ select api.ingest_football_match_details('sportsmonks', '9907999',
  jsonb_build_object('providerUpdatedAt', now(), 'sourceSequence', 1)) $$,
  'P0002', 'MAPPING_NOT_FOUND', 'a fixture BotolaGO does not know is refused');
select extensions.throws_ok($$ select pg_temp.store(jsonb_build_object(
  'providerUpdatedAt', now(), 'sourceSequence', 4000,
  'pressure', jsonb_build_array(
    jsonb_build_object('teamExternalId', '9901001', 'minute', 5, 'value', 1),
    jsonb_build_object('teamExternalId', '9901001', 'minute', 5, 'value', 2)))) $$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'two pressure values for one club and minute are refused');
select extensions.throws_ok($$ select pg_temp.store(jsonb_build_object(
  'providerUpdatedAt', now(), 'sourceSequence', 4000,
  'absences', jsonb_build_array(jsonb_build_object('key', '90', 'teamExternalId', '9901001',
    'playerName', 'Someone', 'category', 'holiday')))) $$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'an absence that is neither an injury nor a suspension is refused');
select extensions.throws_ok($$ select pg_temp.store(jsonb_build_object(
  'providerUpdatedAt', now(), 'sourceSequence', 4000,
  'absences', jsonb_build_array(jsonb_build_object('key', '90', 'teamExternalId', '9901001',
    'playerName', 'Someone', 'category', 'injury', 'expectedReturnOn', 'soon')))) $$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'as is a return date that is not a date');
select extensions.throws_ok($$ select pg_temp.store('[]'::jsonb) $$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'a payload that is not an object is refused');
select extensions.is(
  (select count(*)::int from app.match_events where fixture_id = 'f7500000-0000-4000-8000-000000000001'), 4,
  'and none of them changed anything');

-- ---------------------------------------------------------------------------
-- Which fixtures are due.
-- ---------------------------------------------------------------------------
create function pg_temp.due(p_scope text) returns text[] language sql as $$
  select coalesce(array_agg(due.item ->> 'externalId' order by due.position), '{}')
  from jsonb_array_elements(
    api.service_football_match_details_due('sportsmonks', '9928647', p_scope, 8)
  ) with ordinality as due(item, position)
$$;

select extensions.is(pg_temp.due('live'), array['9907001'],
  'a match finalized half an hour ago is still refreshed');
select extensions.is(pg_temp.due('backfill'), '{}'::text[],
  'and it has details, so there is nothing to backfill');

insert into app.fixtures (id, competition_id, season_id, home_team_id, away_team_id, kickoff_at,
  status, period, home_score, away_score, provider_updated_at, source_sequence, finalized_at)
values
  -- in play
  ('f7500000-0000-4000-8000-000000000002', 'f7100000-0000-4000-8000-000000000001',
   'f7200000-0000-4000-8000-000000000001', 'f7400000-0000-4000-8000-000000000003',
   'f7400000-0000-4000-8000-000000000001', statement_timestamp() - interval '30 minutes 7 seconds',
   'live_first_half', 'first_half', 0, 0, statement_timestamp(), 1, null),
  -- finished last week, no details
  ('f7500000-0000-4000-8000-000000000003', 'f7100000-0000-4000-8000-000000000001',
   'f7200000-0000-4000-8000-000000000001', 'f7400000-0000-4000-8000-000000000002',
   'f7400000-0000-4000-8000-000000000003', statement_timestamp() - interval '7 days 37 seconds',
   'finished', 'post_match', 2, 2, statement_timestamp() - interval '7 days', 1,
   statement_timestamp() - interval '7 days'),
  -- kicks off in ten minutes
  ('f7500000-0000-4000-8000-000000000004', 'f7100000-0000-4000-8000-000000000001',
   'f7200000-0000-4000-8000-000000000001', 'f7400000-0000-4000-8000-000000000002',
   'f7400000-0000-4000-8000-000000000001', statement_timestamp() + interval '10 minutes 7 seconds',
   'not_started', 'pre_match', null, null, statement_timestamp(), 1, null),
  -- tomorrow
  ('f7500000-0000-4000-8000-000000000005', 'f7100000-0000-4000-8000-000000000001',
   'f7200000-0000-4000-8000-000000000001', 'f7400000-0000-4000-8000-000000000003',
   'f7400000-0000-4000-8000-000000000002', statement_timestamp() + interval '1 day 7 seconds',
   'not_started', 'pre_match', null, null, statement_timestamp(), 1, null);
insert into app_private.football_provider_mappings
  (provider_name, entity_type, external_id, internal_entity_id, last_seen_at)
values
  ('sportsmonks', 'fixture', '9907002', 'f7500000-0000-4000-8000-000000000002', now()),
  ('sportsmonks', 'fixture', '9907003', 'f7500000-0000-4000-8000-000000000003', now()),
  ('sportsmonks', 'fixture', '9907004', 'f7500000-0000-4000-8000-000000000004', now()),
  ('sportsmonks', 'fixture', '9907005', 'f7500000-0000-4000-8000-000000000005', now());

select extensions.is(pg_temp.due('live'), array['9907001', '9907002', '9907004'],
  'live: the match just over, the one in play and the one about to start, in kick-off order');
select extensions.is(pg_temp.due('backfill'), array['9907003'],
  'backfill: only the finished match with nothing stored');

update app.fixtures set finalized_at = statement_timestamp() - interval '2 hours 7 seconds'
where id = 'f7500000-0000-4000-8000-000000000001';
select extensions.is(pg_temp.due('live'), array['9907002', '9907004'],
  'two hours after it was finalized, a match is left alone');

select extensions.throws_ok($$ select api.service_football_match_details_due('sportsmonks', '9928647', 'all', 8) $$,
  '22023', 'INVALID_DETAILS_SCOPE', 'an unknown scope is refused');
select extensions.throws_ok($$ select api.service_football_match_details_due('sportsmonks', '9928647', 'live', 21) $$,
  '22023', 'INVALID_PAGE_LIMIT', 'as is a limit over twenty');
select extensions.throws_ok($$ select api.service_football_match_details_due('sportsmonks', '9999999', 'live', 8) $$,
  'P0002', 'MAPPING_NOT_FOUND', 'and a season BotolaGO does not know');

-- ---------------------------------------------------------------------------
-- The tick keeps calling for two hours after the whistle, every 15 minutes.
-- ---------------------------------------------------------------------------
delete from app.fixtures where id in ('f7500000-0000-4000-8000-000000000002',
  'f7500000-0000-4000-8000-000000000004', 'f7500000-0000-4000-8000-000000000005');
select app_private.notification_email_configure('off', 'https://live.example.invalid/functions/v1', null, true);
update app_private.football_live_refresh_heartbeat set last_invoked_at = null, last_outcome = 'never' where id;

select extensions.is(app_private.football_live_refresh_tick(), 'idle',
  'a match finalized more than two hours ago is not polled');

update app.fixtures set finalized_at = statement_timestamp() - interval '30 minutes 7 seconds'
where id = 'f7500000-0000-4000-8000-000000000001';
select extensions.is(app_private.football_live_refresh_tick(), 'invoked',
  'a match finalized half an hour ago is refreshed');
select extensions.is(app_private.football_live_refresh_tick(), 'waiting', 'but not at the next minute');
update app_private.football_live_refresh_heartbeat
set last_invoked_at = statement_timestamp() - interval '10 minutes' where id;
select extensions.is(app_private.football_live_refresh_tick(), 'waiting', 'nor ten minutes later');
update app_private.football_live_refresh_heartbeat
set last_invoked_at = statement_timestamp() - interval '14 minutes 45 seconds' where id;
select extensions.is(app_private.football_live_refresh_tick(), 'invoked', 'but fifteen minutes later');

select * from extensions.finish();
rollback;
