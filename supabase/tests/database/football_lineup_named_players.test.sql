-- Regression suite for 20260925170000_football_lineup_named_players.
--
-- Provider ids are 98xxxxx so no seeded mapping is touched.
begin;
select extensions.no_plan();

insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('f8000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('f8100000-0000-4000-8000-000000000001', 'named-league', 'Named League', 'NL', 'league',
  'f8000000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('f8200000-0000-4000-8000-000000000001', 'f8100000-0000-4000-8000-000000000001',
  'Named season', current_date - 30, current_date + 200, 'active', true);
insert into app.teams (id, slug, name, short_name, code, country_id)
select ('f8400000-0000-4000-8000-00000000000' || n)::uuid, 'named-club-' || n, 'Named Club ' || n,
  'NC' || n, 'NC' || n, 'f8000000-0000-4000-8000-000000000001'
from generate_series(1, 2) n;
insert into app.players (id, slug, full_name, display_name, position)
values ('f8600000-0000-4000-8000-000000000401', 'named-keeper', 'Named Keeper', 'N. Keeper', 'goalkeeper');
insert into app.fixtures (id, competition_id, season_id, home_team_id, away_team_id, kickoff_at,
  status, period, home_score, away_score, provider_updated_at, source_sequence, finalized_at)
values ('f8500000-0000-4000-8000-000000000001', 'f8100000-0000-4000-8000-000000000001',
  'f8200000-0000-4000-8000-000000000001', 'f8400000-0000-4000-8000-000000000001',
  'f8400000-0000-4000-8000-000000000002', statement_timestamp() - interval '3 days 37 seconds',
  'finished', 'post_match', 1, 0, statement_timestamp() - interval '3 days', 1,
  statement_timestamp() - interval '3 days');
insert into app_private.football_provider_mappings
  (provider_name, entity_type, external_id, internal_entity_id, last_seen_at)
values
  ('sportsmonks', 'season', '9828647', 'f8200000-0000-4000-8000-000000000001', now()),
  ('sportsmonks', 'fixture', '9807001', 'f8500000-0000-4000-8000-000000000001', now()),
  ('sportsmonks', 'team', '9801001', 'f8400000-0000-4000-8000-000000000001', now()),
  ('sportsmonks', 'team', '9801002', 'f8400000-0000-4000-8000-000000000002', now()),
  ('sportsmonks', 'player', '9800401', 'f8600000-0000-4000-8000-000000000401', now());

create function pg_temp.due() returns text[] language sql as $$
  select coalesce(array_agg(item ->> 'externalId'), '{}')
  from jsonb_array_elements(
    api.service_football_match_details_due('sportsmonks', '9828647', 'backfill', 10)
  ) item
$$;

select extensions.is(pg_temp.due(), array['9807001'], 'a finished match never stored is due');

-- ---------------------------------------------------------------------------
-- A home side of one known player and three the catalogue does not know, one
-- of them sent twice; an away side of unknown players only.
-- ---------------------------------------------------------------------------
select extensions.is(
  api.ingest_football_match_details('sportsmonks', '9807001', jsonb_build_object(
    'providerUpdatedAt', now() - interval '1 hour',
    'sourceSequence', 1,
    'lineups', jsonb_build_array(
      jsonb_build_object('teamExternalId', '9801001', 'formation', '4-3-3', 'players', jsonb_build_array(
        jsonb_build_object('playerExternalId', '9800401', 'playerName', 'Provider Keeper',
          'slot', 'starting', 'position', 'goalkeeper', 'shirtNumber', 1, 'order', 1),
        jsonb_build_object('playerExternalId', '9800402', 'playerName', '  Soufiane El Azhari ',
          'slot', 'starting', 'position', 'forward', 'shirtNumber', 9, 'order', 11),
        jsonb_build_object('playerExternalId', '9800402', 'playerName', 'Soufiane El Azhari',
          'slot', 'bench', 'order', 101),
        jsonb_build_object('playerExternalId', '9800403', 'playerName', 'Home Defender',
          'slot', 'starting', 'position', 'defender', 'shirtNumber', 4, 'order', 4),
        jsonb_build_object('playerExternalId', '9800404', 'slot', 'bench', 'order', 102),
        jsonb_build_object('playerExternalId', null, 'playerName', 'Anonymous Sub',
          'slot', 'bench', 'order', 103)
      )),
      jsonb_build_object('teamExternalId', '9801002', 'players', jsonb_build_array(
        jsonb_build_object('playerExternalId', '9800501', 'playerName', 'Away Keeper',
          'slot', 'starting', 'position', 'goalkeeper', 'order', 1)
      ))
    )
  )) - 'fixtureId',
  jsonb_build_object('outcome', 'stored', 'events', 0, 'eventsRemoved', 0, 'statistics', 0,
    'lineups', 2, 'lineupPlayers', 5, 'unmappedPlayers', 6, 'pressure', 0, 'absences', 0,
    'absencesRemoved', 0),
  'unknown players are stored by name; one sent twice once; one with neither id nor name left out');

create temporary table read as
select lineup from jsonb_array_elements(
  api.football_match_lineups('f8500000-0000-4000-8000-000000000001', 'fr')) lineup;

select extensions.is(
  (select lineup -> 'players' from read where lineup -> 'team' ->> 'id' = 'f8400000-0000-4000-8000-000000000001'),
  jsonb_build_array(jsonb_build_object('id', 'f8600000-0000-4000-8000-000000000401', 'slug', 'named-keeper',
    'displayName', 'N. Keeper', 'slot', 'starting', 'position', 'goalkeeper', 'shirtNumber', 1,
    'order', 1, 'captain', false)),
  '`players` keeps its shape: catalogue players only, with their page');
select extensions.is(
  (select jsonb_agg(jsonb_build_array(p ->> 'displayName', p ->> 'slot', (p ->> 'order')::int,
     p ->> 'position', p -> 'shirtNumber') order by p ->> 'slot' desc, (p ->> 'order')::int)
   from read, jsonb_array_elements(lineup -> 'unlistedPlayers') p
   where lineup -> 'team' ->> 'id' = 'f8400000-0000-4000-8000-000000000001'),
  jsonb_build_array(
    jsonb_build_array('Home Defender', 'starting', 2, 'defender', 4),
    jsonb_build_array('Soufiane El Azhari', 'starting', 3, 'forward', 9),
    jsonb_build_array('Anonymous Sub', 'bench', 1, null, null)),
  '`unlistedPlayers` names the others, trimmed, numbered with the known ones in the provider''s order');
select extensions.ok(
  (select bool_and(not (p ? 'slug') and (p ->> 'id')::uuid is not null)
   from read, jsonb_array_elements(lineup -> 'unlistedPlayers') p),
  'an unlisted player has no page (no slug) and the lineup row''s id');
select extensions.is(
  (select jsonb_array_length(lineup -> 'unlistedPlayers') from read
   where lineup -> 'team' ->> 'id' = 'f8400000-0000-4000-8000-000000000002'), 1,
  'a side of unknown players only is stored, where it used to be skipped');

select extensions.ok(
  has_function_privilege('anon', 'api.football_match_lineups(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'api.ingest_football_match_details(text, text, jsonb)', 'execute'),
  'visitors read the lineups; only the service role stores them');

select extensions.throws_ok($$
  insert into app.lineup_players (lineup_id, slot, display_order)
  select id, 'bench', 99 from app.lineups where fixture_id = 'f8500000-0000-4000-8000-000000000001' limit 1
$$, '23514', null, 'a lineup row names a player one way or the other');

-- ---------------------------------------------------------------------------
-- The backfill's done mark.
-- ---------------------------------------------------------------------------
select extensions.is(pg_temp.due(), '{}'::text[], 'once stored, the match is done');
delete from app_private.football_match_details_syncs
where fixture_id = 'f8500000-0000-4000-8000-000000000001';
select extensions.is(pg_temp.due(), array['9807001'],
  'removing the mark has the backfill fetch it again, details or not');
select extensions.is(
  api.ingest_football_match_details('sportsmonks', '9807001', jsonb_build_object(
    'providerUpdatedAt', now() - interval '1 hour', 'sourceSequence', 2,
    'lineups', jsonb_build_array(
      jsonb_build_object('teamExternalId', '9801002', 'players', jsonb_build_array(
        jsonb_build_object('playerExternalId', '9800501', 'playerName', 'Away Keeper',
          'slot', 'starting', 'position', 'goalkeeper', 'order', 1))))
  )) ->> 'outcome', 'stored', 'fetched again, the same reply is stored over what was there');
select extensions.is(pg_temp.due(), '{}'::text[], 'and the match is done again');

select * from extensions.finish();
rollback;
