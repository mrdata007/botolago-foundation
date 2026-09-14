begin;

select extensions.no_plan();

insert into app.countries (id, iso_alpha2, iso_alpha3) values
  ('f0000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('f1000000-0000-4000-8000-000000000001', 'fantasy-test', 'Fantasy Test', 'FT', 'league',
  'f0000000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
  '2089/90', '2089-08-01', '2090-06-30', 'active', true);
insert into app.rounds (id, season_id, round_number, name, status)
values ('f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001',
  1, 'Gameweek 1', 'active');

insert into app.teams (id, slug, name, short_name, code, country_id)
select ('f4' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  'fantasy-club-' || i, 'Fantasy Club ' || i, 'FC' || i, 'F' || lpad(i::text, 2, '0'),
  'f0000000-0000-4000-8000-000000000001'
from generate_series(1, 5) i;

insert into app.players (id, slug, full_name, display_name, position)
select ('f5' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  'fantasy-player-' || i, 'Fantasy Player ' || i, 'Player ' || i,
  case when i <= 2 then 'goalkeeper'::app.football_position
    when i <= 7 then 'defender'::app.football_position
    when i <= 12 then 'midfielder'::app.football_position
    else 'forward'::app.football_position end
from generate_series(1, 16) i;

insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('f6000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
  'fantasy-test', 'Fantasy Test', true);
insert into app.fantasy_seasons (
  id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at
) values ('f6300000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000100',
  '2089/90', 'active', '2089-08-01', '2090-06-30');
insert into app.fantasy_gameweeks (
  id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status
) values ('f6400000-0000-4000-8000-000000000001', 'f6300000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001', 1, 'Gameweek 1',
  '2090-01-01T11:00:00Z', '2090-01-01T12:00:00Z', '2090-01-08T12:00:00Z', 'open');

insert into app.fantasy_players (
  id, fantasy_season_id, football_player_id, football_team_id, position_id, price
)
select ('f7' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  'f6300000-0000-4000-8000-000000000001',
  ('f5' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  ('f4' || lpad((case when i = 16 then 5 else ((i - 1) % 5) + 1 end)::text, 6, '0')
    || '-0000-4000-8000-000000000001')::uuid,
  (select id from app.fantasy_positions where code = case
    when i <= 2 then 'GK' when i <= 7 then 'DEF' when i <= 12 then 'MID' else 'FWD' end),
  6
from generate_series(1, 16) i;

insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('f8000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'fantasy-one@example.test', statement_timestamp(), 'hash', '{}',
    '{"username":"fantasy_one"}', statement_timestamp(), statement_timestamp()),
  ('f8000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'fantasy-two@example.test', statement_timestamp(), 'hash', '{}',
    '{"username":"fantasy_two"}', statement_timestamp(), statement_timestamp());

select set_config('test.fantasy_selection', (
  select jsonb_agg(jsonb_build_object(
    'fantasy_player_id', player.id,
    'slot', case when player_number in (1,3,4,5,6,8,9,10,11,13,14) then 'starter' else 'bench' end,
    'slot_order', case player_number
      when 1 then 1 when 3 then 2 when 4 then 3 when 5 then 4 when 6 then 5
      when 8 then 6 when 9 then 7 when 10 then 8 when 11 then 9 when 13 then 10 when 14 then 11
      when 2 then 1 when 7 then 2 when 12 then 3 when 15 then 4 end,
    'captain', player_number = 8, 'vice_captain', player_number = 13
  ) order by player_number)::text from (
    select id, row_number() over (order by id) as player_number from app.fantasy_players
    order by id limit 15
  ) player
), true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('test.fantasy_team_response', api.create_fantasy_team(
  'f6300000-0000-4000-8000-000000000001', 'f6400000-0000-4000-8000-000000000001',
  'Atlas Eleven', current_setting('test.fantasy_selection')::jsonb,
  'f9000000-0000-4000-8000-000000000001'
)::text, true);
select extensions.is(
  jsonb_array_length(current_setting('test.fantasy_team_response')::jsonb -> 'squad'), 15,
  'atomic team creation persists the complete squad'
);
select extensions.is(
  api.create_fantasy_team(
    'f6300000-0000-4000-8000-000000000001', 'f6400000-0000-4000-8000-000000000001',
    'Atlas Eleven', current_setting('test.fantasy_selection')::jsonb,
    'f9000000-0000-4000-8000-000000000001'
  ) ->> 'id',
  current_setting('test.fantasy_team_response')::jsonb ->> 'id',
  'duplicate create retry returns the stable idempotent response'
);
select extensions.throws_ok(
  $$select api.create_fantasy_team(
      'f6300000-0000-4000-8000-000000000001', 'f6400000-0000-4000-8000-000000000001',
      'Different Name', current_setting('test.fantasy_selection')::jsonb,
      'f9000000-0000-4000-8000-000000000001'
    )$$,
  'PT409', 'idempotency_conflict',
  'an idempotency key cannot be reused for a different request'
);
select extensions.is(
  api.activate_fantasy_chip(
    (current_setting('test.fantasy_team_response')::jsonb ->> 'id')::uuid,
    'f6400000-0000-4000-8000-000000000001', 'bench_boost', 1,
    'f9000000-0000-4000-8000-000000000002'
  ) ->> 'teamVersion', '2',
  'chip activation is atomic and advances optimistic version'
);
select extensions.throws_ok(
  $$select api.activate_fantasy_chip(
      (current_setting('test.fantasy_team_response')::jsonb ->> 'id')::uuid,
      'f6400000-0000-4000-8000-000000000001', 'triple_captain', 2,
      'f9000000-0000-4000-8000-000000000003'
    )$$,
  'PT409', 'chip_conflict',
  'only one chip can be active in a gameweek'
);
select extensions.is(
  api.get_my_fantasy_team('f6300000-0000-4000-8000-000000000001')
    -> 'chips' ->> 'active',
  'bench_boost',
  'the canonical team DTO persists the active chip across reloads'
);
select extensions.is(
  api.get_my_fantasy_team('f6300000-0000-4000-8000-000000000001')
    -> 'chips' ->> 'activeCancellable',
  'false',
  'the canonical team DTO exposes the ruleset cancellation decision'
);
select extensions.throws_ok(
  $$select api.cancel_fantasy_chip(
      (current_setting('test.fantasy_team_response')::jsonb ->> 'id')::uuid,
      'f6400000-0000-4000-8000-000000000001', 2
    )$$,
  'PT409', 'chip_unavailable',
  'a non-cancellable active chip cannot be cancelled by the browser'
);
select extensions.throws_ok(
  $$select api.preview_fantasy_transfers(
      (current_setting('test.fantasy_team_response')::jsonb ->> 'id')::uuid,
      'f6400000-0000-4000-8000-000000000001',
      ('[{"player_out_id":"f7000015-0000-4000-8000-000000000001",' ||
        '"player_in_id":"f7000014-0000-4000-8000-000000000001"}]')::jsonb,
      2, null
    )$$,
  'PT400', 'invalid_transfer',
  'the server rejects an incoming player already owned by the squad'
);
select extensions.is(
  api.preview_fantasy_transfers(
    (current_setting('test.fantasy_team_response')::jsonb ->> 'id')::uuid,
    'f6400000-0000-4000-8000-000000000001',
    ('[{"player_out_id":"f7000015-0000-4000-8000-000000000001",' ||
      '"player_in_id":"f7000016-0000-4000-8000-000000000001"}]')::jsonb,
    2, null
  ) ->> 'resultingVersion',
  '3',
  'a valid server-derived transfer preview advances the expected version'
);
select set_config('test.fantasy_transfer_response', api.confirm_fantasy_transfers(
  (current_setting('test.fantasy_team_response')::jsonb ->> 'id')::uuid,
  'f6400000-0000-4000-8000-000000000001',
  ('[{"player_out_id":"f7000015-0000-4000-8000-000000000001",' ||
    '"player_in_id":"f7000016-0000-4000-8000-000000000001"}]')::jsonb,
  2, 'f9000000-0000-4000-8000-000000000005', null
)::text, true);
select extensions.is(
  current_setting('test.fantasy_transfer_response')::jsonb -> 'team' ->> 'version',
  '3',
  'transfer confirmation advances the authoritative team version atomically'
);
select extensions.ok(
  jsonb_path_exists(
    current_setting('test.fantasy_transfer_response')::jsonb,
    '$.team.squad[*] ? (@.fantasyPlayerId == "f7000016-0000-4000-8000-000000000001")'
  ),
  'transfer confirmation replaces active squad membership'
);
select extensions.ok(
  jsonb_path_exists(
    current_setting('test.fantasy_transfer_response')::jsonb,
    '$.team.lineup[*] ? (@.fantasyPlayerId == "f7000016-0000-4000-8000-000000000001")'
  ),
  'transfer confirmation updates the current gameweek lineup in the same transaction'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"f8000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select set_config('test.fantasy_second_team_response', api.create_fantasy_team(
  'f6300000-0000-4000-8000-000000000001', 'f6400000-0000-4000-8000-000000000001',
  'Rif Eleven', current_setting('test.fantasy_selection')::jsonb,
  'f9000000-0000-4000-8000-000000000004'
)::text, true);
reset role;

select extensions.is((select count(*)::integer from app.fantasy_teams), 2,
  'failed mutations do not create partial teams');
select extensions.is((select count(*)::integer from app_private.fantasy_mutation_audit
  where operation in ('create_team','activate_chip','confirm_transfers')), 4,
  'accepted sensitive mutations append audit entries');

insert into app.fantasy_leagues (
  id, fantasy_season_id, owner_user_id, name, visibility, member_count
) values (
  'f9100000-0000-4000-8000-000000000001',
  'f6300000-0000-4000-8000-000000000001',
  'f8000000-0000-4000-8000-000000000001',
  'Public Pagination League', 'public', 2
);

insert into app.fantasy_rankings (
  id, fantasy_season_id, gameweek_id, league_id, fantasy_team_id,
  rank, previous_rank, total_points, gameweek_points,
  calculation_version, calculated_at
) values
  (
    'f9200000-0000-4000-8000-000000000001',
    'f6300000-0000-4000-8000-000000000001', null,
    'f9100000-0000-4000-8000-000000000001',
    (current_setting('test.fantasy_team_response')::jsonb ->> 'id')::uuid,
    1, 2, 100, 50, 1, '2090-01-09T12:00:00Z'
  ),
  (
    'f9200000-0000-4000-8000-000000000002',
    'f6300000-0000-4000-8000-000000000001', null,
    'f9100000-0000-4000-8000-000000000001',
    (current_setting('test.fantasy_second_team_response')::jsonb ->> 'id')::uuid,
    2, 1, 90, 40, 1, '2090-01-09T12:00:00Z'
  ),
  (
    'f9200000-0000-4000-8000-000000000003',
    'f6300000-0000-4000-8000-000000000001',
    'f6400000-0000-4000-8000-000000000001',
    'f9100000-0000-4000-8000-000000000001',
    (current_setting('test.fantasy_second_team_response')::jsonb ->> 'id')::uuid,
    1, null, 90, 40, 1, '2090-01-09T12:00:00Z'
  ),
  (
    'f9200000-0000-4000-8000-000000000004',
    'f6300000-0000-4000-8000-000000000001',
    'f6400000-0000-4000-8000-000000000001',
    'f9100000-0000-4000-8000-000000000001',
    (current_setting('test.fantasy_team_response')::jsonb ->> 'id')::uuid,
    2, null, 100, 50, 1, '2090-01-09T12:00:00Z'
  );

set local role anon;
select extensions.is(
  jsonb_array_length(api.fantasy_league_standings(
    'f9100000-0000-4000-8000-000000000001', null, null, null, 1
  ) -> 'items'),
  1,
  'overall standings applies the page limit before returning its DTO'
);
select extensions.is(
  api.fantasy_league_standings(
    'f9100000-0000-4000-8000-000000000001',
    null,
    1,
    (current_setting('test.fantasy_team_response')::jsonb ->> 'id')::uuid,
    1
  ) -> 'items' -> 0 ->> 'rank',
  '2',
  'overall standings advances with its composite keyset cursor'
);
select extensions.results_eq(
  $$select item ->> 'rank'
    from jsonb_array_elements(api.fantasy_league_standings(
      'f9100000-0000-4000-8000-000000000001',
      'f6400000-0000-4000-8000-000000000001', null, null, 2
    ) -> 'items') item$$,
  $$values ('1'::text), ('2'::text)$$,
  'gameweek standings preserve deterministic rank ordering'
);
reset role;

-- Aggregate scoring snapshots must replace prior values, including zero.
-- These are the stable keys produced by scorePlayerFixture; the service RPC
-- must preserve genuinely additive adjustments and other fixtures.
insert into app.fixtures (
  id,competition_id,season_id,round_id,home_team_id,away_team_id,kickoff_at,
  status,provider_updated_at,source_sequence
)
select ('f9500000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
  'f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001','f4000003-0000-4000-8000-000000000001',
  'f4000004-0000-4000-8000-000000000001',
  '2090-01-01T12:00:00Z'::timestamptz + (i-1)*interval '1 day',
  'not_started',statement_timestamp(),1
from generate_series(1,2) i;

select set_config('test.snapshot_source_key',
  'fixture-stats:f9500000-0000-4000-8000-000000000001:f5000013-0000-4000-8000-000000000001:goal',true);
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select api.service_upsert_fantasy_player_points(
  'f7000013-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000001',
  'f9500000-0000-4000-8000-000000000002','goal',4,
  'fixture-stats:f9500000-0000-4000-8000-000000000002:f5000013-0000-4000-8000-000000000001:goal',1,1);
select api.service_upsert_fantasy_player_points(
  'f7000013-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000001',
  'f9500000-0000-4000-8000-000000000001','adjustment',3,'adjustment:reviewed:independent',1,1);
select set_config('test.snapshot_event_id',api.service_upsert_fantasy_player_points(
  'f7000013-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000001',
  'f9500000-0000-4000-8000-000000000001','goal',4,current_setting('test.snapshot_source_key'),10,1)::text,true);
select extensions.is(api.service_upsert_fantasy_player_points(
  'f7000013-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000001',
  'f9500000-0000-4000-8000-000000000001','goal',4,current_setting('test.snapshot_source_key'),10,1)::text,
  current_setting('test.snapshot_event_id'),'identical scoring snapshot retries preserve the event ID');
reset role;
select extensions.is((select provisional_points from app.fantasy_player_gameweek_points
  where fantasy_player_id='f7000013-0000-4000-8000-000000000001'
    and gameweek_id='f6400000-0000-4000-8000-000000000001'),11,
  'one goal and its retry count once alongside independent contributions');

set local role service_role;
select api.service_upsert_fantasy_player_points(
  'f7000013-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000001',
  'f9500000-0000-4000-8000-000000000001','goal',8,current_setting('test.snapshot_source_key'),11,1);
reset role;
select extensions.is((select provisional_points from app.fantasy_player_gameweek_points
  where fantasy_player_id='f7000013-0000-4000-8000-000000000001'
    and gameweek_id='f6400000-0000-4000-8000-000000000001'),15,
  'a second goal replaces the first aggregate rather than adding another snapshot');

set local role service_role;
select api.service_upsert_fantasy_player_points(
  'f7000013-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000001',
  'f9500000-0000-4000-8000-000000000001','goal',4,current_setting('test.snapshot_source_key'),12,1);
reset role;
select extensions.is((select provisional_points from app.fantasy_player_gameweek_points
  where fantasy_player_id='f7000013-0000-4000-8000-000000000001'
    and gameweek_id='f6400000-0000-4000-8000-000000000001'),11,
  'a downward correction from two goals to one replaces the aggregate');

set local role service_role;
select api.service_upsert_fantasy_player_points(
  'f7000013-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000001',
  'f9500000-0000-4000-8000-000000000001','goal',0,current_setting('test.snapshot_source_key'),13,1);
select extensions.is(api.service_upsert_fantasy_player_points(
  'f7000013-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000001',
  'f9500000-0000-4000-8000-000000000001','goal',0,current_setting('test.snapshot_source_key'),13,1)::text,
  current_setting('test.snapshot_event_id'),'zero corrections and retries preserve the event ID');
select extensions.throws_ok($$select api.service_upsert_fantasy_player_points(
  'f7000013-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000001',
  'f9500000-0000-4000-8000-000000000001','goal',8,current_setting('test.snapshot_source_key'),12,1)$$,
  'PT409','stale_update','an older scoring observation cannot undo the zero correction');
reset role;
select extensions.is((select provisional_points from app.fantasy_player_gameweek_points
  where fantasy_player_id='f7000013-0000-4000-8000-000000000001'
    and gameweek_id='f6400000-0000-4000-8000-000000000001'),7,
  'zero removes all aggregate goal points and preserves independent contributions');
select extensions.is((select count(*)::integer from app.fantasy_player_point_events
  where fantasy_player_id='f7000013-0000-4000-8000-000000000001'),3,
  'corrections do not accumulate obsolete aggregate rows');
select extensions.is((select points from app.fantasy_player_point_events
  where source_key='adjustment:reviewed:independent'),3,
  'the independently identified adjustment remains unchanged');
select extensions.is((select points from app.fantasy_player_point_events
  where fixture_id='f9500000-0000-4000-8000-000000000002'),4,
  'another fixture for the same player remains unchanged');

select * from extensions.finish();
rollback;
