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
select set_config(
  'test.pre_match_points',
  api.get_my_fantasy_points(
    (current_setting('test.fantasy_team_response')::jsonb ->> 'id')::uuid,
    'f6400000-0000-4000-8000-000000000001'
  )::text,
  true
);
select extensions.is(
  current_setting('test.pre_match_points')::jsonb -> 'result',
  'null'::jsonb,
  'pre-match points honestly expose no materialized team result'
);
select extensions.is(
  jsonb_array_length(current_setting('test.pre_match_points')::jsonb -> 'players'),
  15,
  'pre-match points include the complete owned lineup'
);
select extensions.ok(
  (
    select bool_and(
      jsonb_typeof(player -> 'provisionalPoints') = 'number'
      and jsonb_typeof(player -> 'finalPoints') = 'null'
      and jsonb_typeof(player -> 'didPlay') = 'boolean'
      and jsonb_typeof(player -> 'minutesPlayed') = 'number'
    )
    from jsonb_array_elements(
      current_setting('test.pre_match_points')::jsonb -> 'players'
    ) player
  ),
  'pre-match point fields use stable numeric, boolean, and nullable JSON types'
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

insert into app.fantasy_rankings (
  id, fantasy_season_id, gameweek_id, league_id, fantasy_team_id,
  rank, previous_rank, total_points, gameweek_points,
  calculation_version, calculated_at
) values
  (
    'f9300000-0000-4000-8000-000000000001',
    'f6300000-0000-4000-8000-000000000001', null, null,
    (current_setting('test.fantasy_team_response')::jsonb ->> 'id')::uuid,
    1, 2, 100, 50, 1, '2090-01-09T12:00:00Z'
  ),
  (
    'f9300000-0000-4000-8000-000000000002',
    'f6300000-0000-4000-8000-000000000001', null, null,
    (current_setting('test.fantasy_second_team_response')::jsonb ->> 'id')::uuid,
    2, 1, 90, 40, 1, '2090-01-09T12:00:00Z'
  ),
  (
    'f9300000-0000-4000-8000-000000000003',
    'f6300000-0000-4000-8000-000000000001',
    'f6400000-0000-4000-8000-000000000001', null,
    (current_setting('test.fantasy_team_response')::jsonb ->> 'id')::uuid,
    2, 1, 100, 50, 1, '2090-01-09T12:00:00Z'
  ),
  (
    'f9300000-0000-4000-8000-000000000004',
    'f6300000-0000-4000-8000-000000000001',
    'f6400000-0000-4000-8000-000000000001', null,
    (current_setting('test.fantasy_second_team_response')::jsonb ->> 'id')::uuid,
    1, 2, 90, 60, 1, '2090-01-09T12:00:00Z'
  );

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
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
  $select item ->> 'rank'
    from jsonb_array_elements(api.fantasy_league_standings(
      'f9100000-0000-4000-8000-000000000001',
      'f6400000-0000-4000-8000-000000000001', null, null, 2
    ) -> 'items') item$,
  $values ('1'::text), ('2'::text)$,
  'gameweek standings preserve deterministic rank ordering'
);

select extensions.is(
  api.fantasy_global_rankings(
    'f6300000-0000-4000-8000-000000000001', null, 'overall', null, 1, 1
  ) ->> 'total',
  '2',
  'global rankings report the complete filtered count'
);
select extensions.is(
  jsonb_array_length(api.fantasy_global_rankings(
    'f6300000-0000-4000-8000-000000000001', null, 'overall', null, 1, 1
  ) -> 'items'),
  1,
  'global rankings enforce the requested page size'
);
select extensions.results_eq(
  $select item ->> 'teamName'
    from jsonb_array_elements(api.fantasy_global_rankings(
      'f6300000-0000-4000-8000-000000000001',
      null, 'overall', null, 1, 25
    ) -> 'items') item$,
  $values ('Atlas Eleven'::text), ('Rif Eleven'::text)$,
  'overall rankings preserve authoritative rank ordering'
);
select extensions.is(
  api.fantasy_global_rankings(
    'f6300000-0000-4000-8000-000000000001',
    null, 'overall', 'rif', 1, 25
  ) ->> 'total',
  '1',
  'global rankings filter by public team name'
);
select extensions.is(
  jsonb_array_length(api.fantasy_global_rankings(
    'f6300000-0000-4000-8000-000000000001',
    null, 'overall', 'rif', 1, 25
  ) -> 'podium'),
  2,
  'search does not alter the overall podium'
);
select extensions.is(
  api.fantasy_global_rankings(
    'f6300000-0000-4000-8000-000000000001',
    null, 'overall', null, 1, 25
  ) -> 'myRank',
  'null'::jsonb,
  'anonymous rankings do not infer a manager identity'
);
select extensions.is(
  api.fantasy_global_rankings(
    'f6300000-0000-4000-8000-000000000001',
    'f6400000-0000-4000-8000-000000000001',
    'gameweek', null, 1, 25
  ) -> 'items' -> 0 ->> 'teamName',
  'Rif Eleven',
  'gameweek rankings use the authoritative gameweek rank scope'
);
select extensions.throws_ok(
  $select api.fantasy_global_rankings(
    'f6300000-0000-4000-8000-000000000001',
    null, 'overall', repeat('x', 81), 1, 25
  )$,
  'PT400', 'validation_failed',
  'global ranking search input remains bounded'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f8000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select extensions.is(
  api.fantasy_global_rankings(
    'f6300000-0000-4000-8000-000000000001',
    null, 'overall', null, 1, 25
  ) -> 'myRank' ->> 'teamName',
  'Atlas Eleven',
  'authenticated rankings include the caller-owned team rank'
);
reset role;

select * from extensions.finish();
rollback;
