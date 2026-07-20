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
from generate_series(1, 15) i;

insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('f6000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
  'fantasy-test', 'Fantasy Test', true);
insert into app.fantasy_rulesets (
  id, fantasy_competition_id, version, name, squad_size, initial_budget,
  max_players_per_club, initial_free_transfers, max_free_transfer_rollover,
  transfer_hit_cost, effective_from, active
) values ('f6100000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000001',
  1, 'Test Rules', 15, 100, 3, 1, 2, 4, '2089-01-01', true);
insert into app.fantasy_position_rules (
  ruleset_id, position_id, squad_quota, starting_minimum, starting_maximum,
  goal_points, clean_sheet_points
) select 'f6100000-0000-4000-8000-000000000001', position.id,
  case position.code when 'GK' then 2 when 'DEF' then 5 when 'MID' then 5 else 3 end,
  case position.code when 'GK' then 1 when 'DEF' then 3 when 'MID' then 2 else 1 end,
  case position.code when 'GK' then 1 when 'DEF' then 5 when 'MID' then 5 else 3 end,
  case position.code when 'GK' then 6 when 'DEF' then 6 when 'MID' then 5 else 4 end,
  case position.code when 'GK' then 4 when 'DEF' then 4 when 'MID' then 1 else 0 end
from app.fantasy_positions position;
insert into app.fantasy_seasons (
  id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at
) values ('f6300000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000001',
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
  ('f4' || lpad((((i - 1) % 5) + 1)::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  (select id from app.fantasy_positions where code = case
    when i <= 2 then 'GK' when i <= 7 then 'DEF' when i <= 12 then 'MID' else 'FWD' end),
  6
from generate_series(1, 15) i;

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
reset role;

select extensions.is((select count(*)::integer from app.fantasy_teams), 1,
  'failed mutations do not create partial teams');
select extensions.is((select count(*)::integer from app_private.fantasy_mutation_audit
  where operation in ('create_team','activate_chip')), 2,
  'accepted sensitive mutations append audit entries');

select * from extensions.finish();
rollback;
