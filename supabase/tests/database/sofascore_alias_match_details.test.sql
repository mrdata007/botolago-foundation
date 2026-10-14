-- SofaScore second player ids on the match page (20261014170100): api.ingest_football_match_details
-- links a lineup player, an event's player and its related player given under a second SofaScore id
-- (app_private.sofascore_player_aliases) to the player of the main link. Everything else the
-- 20261014120000 version does is covered by football_match_details_partial_sections.test.sql.
--
-- Provider ids are 99xxxxx (provider sofascore) so no seeded mapping is touched.
begin;
select extensions.no_plan();
select set_config('app.environment', 'test', true);

insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('e9000000-0000-4000-8000-000000000001', 'MA', 'MAR') on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('e9100000-0000-4000-8000-000000000001', 'alias-league', 'Alias League', 'AL', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('e9200000-0000-4000-8000-000000000001', 'e9100000-0000-4000-8000-000000000001',
  'Alias season', current_date - 30, current_date + 200, 'active', false);
insert into app.teams (id, slug, name, short_name, code, country_id)
select ('e9400000-0000-4000-8000-00000000000' || n)::uuid, 'alias-club-' || n, 'Alias Club ' || n,
  'AC' || n, 'AC' || n, (select id from app.countries where iso_alpha2 = 'MA')
from generate_series(1, 2) n;
insert into app.players (id, slug, full_name, display_name, position)
values ('e9600000-0000-4000-8000-000000000001', 'alias-scorer', 'Alias Scorer', 'A. Scorer', 'forward'),
  ('e9600000-0000-4000-8000-000000000002', 'alias-assist', 'Alias Assist', 'A. Assist', 'midfielder'),
  ('e9600000-0000-4000-8000-000000000003', 'alias-other', 'Alias Other', 'A. Other', 'defender');
insert into app.fixtures (id, competition_id, season_id, home_team_id, away_team_id, kickoff_at,
  status, period, home_score, away_score, provider_updated_at, source_sequence)
values ('e9500000-0000-4000-8000-000000000001', 'e9100000-0000-4000-8000-000000000001',
  'e9200000-0000-4000-8000-000000000001', 'e9400000-0000-4000-8000-000000000001',
  'e9400000-0000-4000-8000-000000000002', statement_timestamp() - interval '31 minutes',
  'live_first_half', 'first_half', 1, 0, statement_timestamp() - interval '1 minute', 1);
insert into app_private.football_provider_mappings
  (id, provider_name, entity_type, external_id, internal_entity_id, last_seen_at)
values
  (gen_random_uuid(), 'sofascore', 'fixture', '9917001', 'e9500000-0000-4000-8000-000000000001', now()),
  (gen_random_uuid(), 'sofascore', 'team', '9911001', 'e9400000-0000-4000-8000-000000000001', now()),
  (gen_random_uuid(), 'sofascore', 'team', '9911002', 'e9400000-0000-4000-8000-000000000002', now()),
  ('e9700000-0000-4000-8000-000000000001', 'sofascore', 'player', '9910001', 'e9600000-0000-4000-8000-000000000001', now()),
  ('e9700000-0000-4000-8000-000000000002', 'sofascore', 'player', '9910002', 'e9600000-0000-4000-8000-000000000002', now());
-- Second ids: 9920001 of the scorer, 9920002 of the assister, each with its staff-alias log row.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('e9e00000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated',
  'authenticated', 'alias-md@example.test', 'hash', now(), '{}', '{"username":"alias_md"}', now(), now());
insert into app_private.sofascore_player_match_log (id, method, mapping_id, sofascore_player_id, player_id, decided_by)
values ('e9d00000-0000-4000-8000-000000000001', 'staff-alias', 'e9700000-0000-4000-8000-000000000001', '9920001',
    'e9600000-0000-4000-8000-000000000001', 'e9e00000-0000-4000-8000-000000000001'),
  ('e9d00000-0000-4000-8000-000000000002', 'staff-alias', 'e9700000-0000-4000-8000-000000000002', '9920002',
    'e9600000-0000-4000-8000-000000000002', 'e9e00000-0000-4000-8000-000000000001');
insert into app_private.sofascore_player_aliases (sofascore_player_id, player_id, log_id)
values ('9920001', 'e9600000-0000-4000-8000-000000000001', 'e9d00000-0000-4000-8000-000000000001'),
  ('9920002', 'e9600000-0000-4000-8000-000000000002', 'e9d00000-0000-4000-8000-000000000002');

create temporary sequence delivery_clock;
create function pg_temp.store(p_details jsonb) returns jsonb language sql as $$
  select api.ingest_football_match_details('sofascore', '9917001',
    p_details || jsonb_build_object(
      'providerUpdatedAt', now() - interval '20 minutes' + make_interval(secs => nextval('pg_temp.delivery_clock')),
      'sourceSequence', 1))
$$;
create function pg_temp.delivery() returns jsonb language sql as $$
  select jsonb_build_object(
    'events', jsonb_build_array(jsonb_build_object('key', '1', 'type', 'goal', 'teamExternalId', '9911001',
      'playerExternalId', '9920001', 'relatedPlayerExternalId', '9920002', 'minute', 20, 'addedTime', 0,
      'period', 'first_half', 'sequence', 20)),
    'lineups', jsonb_build_array(jsonb_build_object('teamExternalId', '9911001', 'formation', '4-3-3',
      'players', jsonb_build_array(
        jsonb_build_object('playerExternalId', '9920001', 'playerName', 'Second Profile', 'slot', 'starting',
          'position', 'forward', 'shirtNumber', 9, 'order', 1),
        jsonb_build_object('playerExternalId', '9910002', 'playerName', 'Main Profile', 'slot', 'starting',
          'position', 'midfielder', 'shirtNumber', 8, 'order', 2),
        jsonb_build_object('playerExternalId', '9930003', 'playerName', 'Nobody Known', 'slot', 'bench',
          'position', 'defender', 'shirtNumber', 4, 'order', 3)))))
$$;
create function pg_temp.event() returns text language sql as $$
  select row(player_id, related_player_id)::text from app.match_events
   where fixture_id = 'e9500000-0000-4000-8000-000000000001' and provider_event_key = '1'
$$;
create function pg_temp.lineup() returns text[] language sql as $$
  select array_agg(coalesce(player.player_id::text, 'none') order by coalesce(player.player_id::text, 'none'))
  from app.lineup_players player join app.lineups lineup on lineup.id = player.lineup_id
  where lineup.fixture_id = 'e9500000-0000-4000-8000-000000000001'
$$;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- 1 The view is private and has one row per id.
select extensions.ok(not has_table_privilege('anon', 'app_private.football_player_provider_links', 'select')
  and not has_table_privilege('authenticated', 'app_private.football_player_provider_links', 'select')
  and not has_table_privilege('service_role', 'app_private.football_player_provider_links', 'select'),
  '1.1 the links view is readable by no API role');
select extensions.is((select row(internal_entity_id, active)::text from app_private.football_player_provider_links
  where provider_name = 'sofascore' and external_id = '9920001'),
  row('e9600000-0000-4000-8000-000000000001'::uuid, true)::text, '1.2 a second id is a row for the main player');

-- 2 Events and lineups under a second id link to the main player.
create temporary table answer as select pg_temp.store(pg_temp.delivery()) as result;
select extensions.is((select result ->> 'outcome' from answer), 'stored', '2.1 the delivery is stored');
select extensions.is((select result -> 'rejectedSections' from answer), '[]'::jsonb, '2.2 no section refused');
select extensions.is(pg_temp.event(), row('e9600000-0000-4000-8000-000000000001'::uuid,
  'e9600000-0000-4000-8000-000000000002'::uuid)::text,
  '2.3 the goal under a second id, and its assist under another, name the main players');
select extensions.is(pg_temp.lineup(), array['e9600000-0000-4000-8000-000000000001',
  'e9600000-0000-4000-8000-000000000002', 'none'],
  '2.4 the lineup links the second id and the main id; an unknown id stays unlinked');

-- 3 A switched-off second id, or a switched-off main link, links nobody.
update app_private.sofascore_player_aliases set active = false where sofascore_player_id = '9920001';
select pg_temp.store(pg_temp.delivery());
select extensions.is(pg_temp.event(), row(null::uuid, 'e9600000-0000-4000-8000-000000000002'::uuid)::text,
  '3.1 the alias switched off: the goal is stored without a player');
update app_private.sofascore_player_aliases set active = true where sofascore_player_id = '9920001';
update app_private.football_provider_mappings set active = false where id = 'e9700000-0000-4000-8000-000000000001';
select pg_temp.store(pg_temp.delivery());
select extensions.is(pg_temp.lineup(), array['e9600000-0000-4000-8000-000000000002', 'none', 'none'], '3.2 the main link switched off: the second id links nobody either');
update app_private.football_provider_mappings set active = true where id = 'e9700000-0000-4000-8000-000000000001';

-- 4 An id that is both a mapping and an alias (a conflict) is never two rows.
insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id, last_seen_at)
values ('sofascore', 'player', '9920002', 'e9600000-0000-4000-8000-000000000003', now());
select extensions.is((select count(*)::int from app_private.football_player_provider_links
  where provider_name = 'sofascore' and external_id = '9920002'), 1, '4.1 the view has one row for it');
drop table answer;
create temporary table answer as select pg_temp.store(pg_temp.delivery()) as result;
select extensions.is((select (result ->> 'events')::int from answer), 1, '4.2 the event is stored once');
select extensions.is((select count(*)::int from app.match_events
  where fixture_id = 'e9500000-0000-4000-8000-000000000001'), 1, '4.3 and only once');

select * from extensions.finish();
rollback;
