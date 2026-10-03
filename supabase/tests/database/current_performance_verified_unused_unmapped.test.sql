-- 20261001130000: a named substitute whom the provider shows as unused, and
-- whom the canonical list cannot place, no longer blocks a finished fixture.
-- The rule is narrow and every part of it is tested twice: the case it must
-- take, and the cases that must keep the fixture blocked as today.
--
-- Everything that must REFUSE runs first (nothing is written); the accepted
-- cases follow and share the one fixture, each superseding the last.
begin;
select extensions.no_plan();

-- ---------------------------------------------------------------------------
-- World: one finished fixture, 1-0, 22 mapped starters, one mapped substitute
-- who stayed on the bench, and a handful of provider ids the list does not know.
-- ---------------------------------------------------------------------------
insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('13910000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('33910000-0000-4000-8000-000000000001', 'verified-unused-league',
  'Verified Unused League', 'VUL', 'league', '13910000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('43910000-0000-4000-8000-000000000001', '33910000-0000-4000-8000-000000000001',
  '2026/2027', current_date - 30, current_date + 300, 'active', true);
insert into app.rounds (id, season_id, round_number, name, status)
values ('53910000-0000-4000-8000-000000000001', '43910000-0000-4000-8000-000000000001', 1, 'Round 1', 'active');
insert into app.teams (id, slug, name, short_name, code, country_id)
values
  ('63910000-0000-4000-8000-000000000001', 'vu-home', 'VU Home', 'VU Home', 'VUH', '13910000-0000-4000-8000-000000000001'),
  ('63910000-0000-4000-8000-000000000002', 'vu-away', 'VU Away', 'VU Away', 'VUA', '13910000-0000-4000-8000-000000000001'),
  ('63910000-0000-4000-8000-000000000003', 'vu-other', 'VU Other', 'VU Other', 'VUO', '13910000-0000-4000-8000-000000000001');
insert into app.fixtures (
  id, competition_id, season_id, round_id, home_team_id, away_team_id, kickoff_at, finalized_at, status, period,
  home_score, away_score, provider_updated_at, source_sequence, source_version
) values (
  md5('vu-fixture')::uuid, '33910000-0000-4000-8000-000000000001', '43910000-0000-4000-8000-000000000001',
  '53910000-0000-4000-8000-000000000001', '63910000-0000-4000-8000-000000000001',
  '63910000-0000-4000-8000-000000000002', statement_timestamp() - interval '2 days',
  statement_timestamp() - interval '2 days' + interval '2 hours', 'finished', 'post_match', 1, 0,
  statement_timestamp(), 1, 'vu-fixture');

-- Players 1-22 start (home 1-11, away 12-22); 23 is a mapped substitute who stayed
-- on the bench; 24 is mapped with no club record for this fixture; 25 and 26 are
-- known players whose provider mapping is inactive (one held by a Fantasy team,
-- one in a locked lineup).
insert into app.players (id, slug, full_name, display_name, position)
select md5('vu-player-' || n)::uuid, 'vu-player-' || n, 'VU Player ' || n, 'VU Player ' || n,
  case when n in (1, 12) then 'goalkeeper'::app.football_position
    when n >= 23 then 'midfielder'::app.football_position
    when (n - 1) % 11 < 5 then 'defender'::app.football_position
    when (n - 1) % 11 < 9 then 'midfielder'::app.football_position
    else 'forward'::app.football_position end
from generate_series(1, 26) n;
insert into app.team_memberships (player_id, team_id, season_id, shirt_number, valid_from, active)
select md5('vu-player-' || n)::uuid,
  case when n <= 11 or n = 23 then '63910000-0000-4000-8000-000000000001'::uuid
    when n <= 22 then '63910000-0000-4000-8000-000000000002'::uuid
    else '63910000-0000-4000-8000-000000000003'::uuid end,
  '43910000-0000-4000-8000-000000000001'::uuid, n, current_date - 30, true
from generate_series(1, 26) n where n <> 24;
insert into app_private.football_provider_mappings (
  provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active
) values
  ('sportsmonks', 'competition', '860', '33910000-0000-4000-8000-000000000001', 'vu-competition', statement_timestamp(), true),
  ('sportsmonks', 'season', '28647', '43910000-0000-4000-8000-000000000001', 'vu-season', statement_timestamp(), true),
  ('sportsmonks', 'team', '68911', '63910000-0000-4000-8000-000000000001', 'vu-home', statement_timestamp(), true),
  ('sportsmonks', 'team', '68912', '63910000-0000-4000-8000-000000000002', 'vu-away', statement_timestamp(), true),
  ('sportsmonks', 'team', '68913', '63910000-0000-4000-8000-000000000003', 'vu-other', statement_timestamp(), true),
  ('sportsmonks', 'fixture', '19891001', md5('vu-fixture')::uuid, 'vu-fixture', statement_timestamp(), true);
insert into app_private.football_provider_mappings (
  provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active
)
select 'sportsmonks', 'player', (89100 + n)::text, md5('vu-player-' || n)::uuid, 'vu-player-' || n, statement_timestamp(),
  n not in (25, 26)
from generate_series(1, 26) n;
-- The two inactive mappings carry the provider ids the tests use for them.
update app_private.football_provider_mappings set external_id = '88902'
where provider_name = 'sportsmonks' and entity_type = 'player' and external_id = '89125';
update app_private.football_provider_mappings set external_id = '88903'
where provider_name = 'sportsmonks' and entity_type = 'player' and external_id = '89126';

-- A Fantasy team holds player 25; player 26 sits in a locked lineup.
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('73910000-0000-4000-8000-000000000001', '33910000-0000-4000-8000-000000000001', 'vu-fantasy', 'VU Fantasy', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at)
values ('73910000-0000-4000-8000-000000000002', '73910000-0000-4000-8000-000000000001',
  '43910000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000101', '2026/27', 'active',
  statement_timestamp() - interval '30 days', statement_timestamp() + interval '300 days');
insert into app.fantasy_gameweeks (
  id, fantasy_season_id, football_round_id, sequence_number, name, deadline_at, starts_at, ends_at, status
) values ('73910000-0000-4000-8000-000000000003', '73910000-0000-4000-8000-000000000002',
  '53910000-0000-4000-8000-000000000001', 1, 'Gameweek 1', statement_timestamp() - interval '3 days',
  statement_timestamp() - interval '3 days', statement_timestamp() + interval '3 days', 'provisional');
insert into app.fantasy_players (id, fantasy_season_id, football_player_id, football_team_id, position_id, price)
select md5('vu-fantasy-' || n)::uuid, '73910000-0000-4000-8000-000000000002', md5('vu-player-' || n)::uuid,
  case when n <= 11 or n = 23 then '63910000-0000-4000-8000-000000000001'::uuid
    when n <= 22 then '63910000-0000-4000-8000-000000000002'::uuid
    else '63910000-0000-4000-8000-000000000003'::uuid end,
  (select id from app.fantasy_positions where code = case
    when n in (1, 12) then 'GK' when n >= 23 then 'MID'
    when (n - 1) % 11 < 5 then 'DEF' when (n - 1) % 11 < 9 then 'MID' else 'FWD' end), 6
from generate_series(1, 26) n where n <> 24;
insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values ('93910000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'vu-owner@example.test', statement_timestamp(), 'hash',
  '{}', '{"username":"vu_owner"}', statement_timestamp(), statement_timestamp());
insert into app.fantasy_teams (id, user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers)
values ('93910000-0000-4000-8000-000000000002', '93910000-0000-4000-8000-000000000001',
  '73910000-0000-4000-8000-000000000002', '73910000-0000-4000-8000-000000000003', 'VU XI', 10, 100, 1);
insert into app.fantasy_squad_memberships (fantasy_team_id, fantasy_player_id, purchase_price, current_sale_price, acquired_gameweek_id)
values ('93910000-0000-4000-8000-000000000002', md5('vu-fantasy-25')::uuid, 6, 6, '73910000-0000-4000-8000-000000000003');
insert into app.fantasy_lineups (id, fantasy_team_id, gameweek_id, team_version, locked_at)
values ('93910000-0000-4000-8000-000000000003', '93910000-0000-4000-8000-000000000002',
  '73910000-0000-4000-8000-000000000003', 1, statement_timestamp() - interval '3 days');
insert into app.fantasy_lineup_players (lineup_id, fantasy_player_id, slot, slot_order, captain, vice_captain, snapshot_price)
values ('93910000-0000-4000-8000-000000000003', md5('vu-fantasy-26')::uuid, 'bench', 1, false, false, 6);

-- ---------------------------------------------------------------------------
-- Builders. A starter, a bench row that never played, the coverage, a declaration.
-- ---------------------------------------------------------------------------
create function pg_temp.starter(n integer) returns jsonb language sql as $$
  select jsonb_build_object('externalPlayerId', (89100 + n)::text,
    'externalTeamId', case when n <= 11 then '68911' else '68912' end,
    'started', true, 'appeared', true, 'minutes', 90,
    'goals', case when n = 11 then 1 else 0 end, 'assists', 0,
    'cleanSheets', case when n <= 11 then 1 else 0 end, 'goalsConceded', case when n <= 11 then 0 else 1 end,
    'saves', case when n in (1, 12) then 2 else 0 end, 'penaltiesSaved', 0, 'penaltiesMissed', 0,
    'yellowCards', 0, 'redCards', 0, 'secondYellowDismissals', 0, 'ownGoals', 0, 'providerRating', null)
$$;
create function pg_temp.bench(ext text, team text) returns jsonb language sql as $$
  select jsonb_build_object('externalPlayerId', ext, 'externalTeamId', team, 'started', false, 'appeared', false,
    'minutes', 0, 'goals', 0, 'assists', 0, 'cleanSheets', 0, 'goalsConceded', 0, 'saves', 0, 'penaltiesSaved', 0,
    'penaltiesMissed', 0, 'yellowCards', 0, 'redCards', 0, 'secondYellowDismissals', 0, 'ownGoals', 0,
    'providerRating', null)
$$;
-- 22 starters (optionally leaving some out), then the given extra rows.
create function pg_temp.rows(extra jsonb default '[]', skip integer[] default '{}') returns jsonb language sql as $$
  select coalesce(jsonb_agg(pg_temp.starter(n) order by n) filter (where n <> all (skip)), '[]'::jsonb)
    || coalesce(extra, '[]'::jsonb)
  from generate_series(1, 22) n
$$;
create function pg_temp.coverage(lineup integer, valid integer, excluded integer default 0,
  starters integer default 22, anonymous integer default 0, declaration jsonb default null) returns jsonb language sql as $$
  select jsonb_build_object('lineupRowsSeen', lineup, 'validPlayerRows', valid, 'excludedIncompleteRows', excluded,
    'starterRows', starters, 'identifiedStarterRows', starters, 'anonymousStarterRows', anonymous,
    'teamCount', 2, 'detailRows', 264, 'invalidDetailRows', 0, 'missingStatisticRows', 0,
    'scoringStatisticsComplete', true, 'cleanSheetSource', 'official_minutes_and_on_pitch_goals_conceded',
    'goalkeeperStatistics', 'explicit_value_or_null_canonical_position_checked_in_database')
    || case when declaration is null then '{}'::jsonb else jsonb_build_object('verifiedUnusedSubstitutes', declaration) end
$$;
-- A declaration as the importer sends it, with the digest of its own facts
-- (recomputed after the patch, unless the patch sets its own).
create function pg_temp.declare(ext text, team text, patch jsonb default '{}') returns jsonb language sql as $$
  with merged as (
    select jsonb_build_object('fixtureExternalId', '19891001', 'externalPlayerId', ext, 'externalTeamId', team,
      'role', 'substitute', 'scoringStatisticTypeIds', '[]'::jsonb, 'unknownStatisticTypeIds', '[]'::jsonb,
      'eventTypeIds', '[]'::jsonb, 'zeroStatisticTypeIds', '[119]'::jsonb,
      'preflightDigest', encode(extensions.digest('vu-preflight', 'sha256'), 'hex')) || patch as m)
  select m || case when m ? 'evidenceDigest' then '{}'::jsonb else jsonb_build_object('evidenceDigest',
    encode(extensions.digest(
      'sportsmonks-verified-unused:v1|fixture=' || (m ->> 'fixtureExternalId') || '|player=' || (m ->> 'externalPlayerId')
      || '|team=' || (m ->> 'externalTeamId') || '|role=substitute|minutes='
      || case when coalesce(m -> 'officialMinutes', 'null'::jsonb) = 'null'::jsonb then '-' else '0' end
      || '|scoring=|unknown=|events=|zero='
      || coalesce((select string_agg(z #>> '{}', ',' order by z #>> '{}')
           from jsonb_array_elements(case when jsonb_typeof(m -> 'zeroStatisticTypeIds') = 'array'
             then m -> 'zeroStatisticTypeIds' else '[]'::jsonb end) z), ''), 'sha256'), 'hex')) end
  from merged
$$;
create function pg_temp.ingest(p_rows jsonb, p_coverage jsonb) returns jsonb language sql as $$
  select api.ingest_current_player_fixture_performance('sportsmonks', '28647', '19891001', p_rows, p_coverage,
    statement_timestamp() - interval '30 seconds')
$$;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- The unknown player (no canonical player, no mapping row at all).
create function pg_temp.one_unknown(patch jsonb default '{}', declaration_patch jsonb default '{}') returns jsonb language sql as $$
  select pg_temp.ingest(
    pg_temp.rows(jsonb_build_array(pg_temp.bench('89123', '68911'), pg_temp.bench('88901', '68911') || patch)),
    pg_temp.coverage(24, 24, 0, 22, 0, jsonb_build_array(pg_temp.declare('88901', '68911', declaration_patch))))
$$;

-- ---------------------------------------------------------------------------
-- REFUSE: the fixture stays blocked exactly as today.
-- ---------------------------------------------------------------------------
select extensions.throws_ok(
  $$select pg_temp.ingest(pg_temp.rows(jsonb_build_array(pg_temp.bench('89123','68911'), pg_temp.bench('88901','68911'))),
    pg_temp.coverage(24, 24))$$,
  'P0002', 'PLAYER_MAPPING_NOT_FOUND', 'today: an unknown named substitute that nobody declared blocks the fixture');
select extensions.throws_ok(
  $$select pg_temp.one_unknown('{"started":true,"appeared":true,"minutes":90}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'B: a starter is never left out, even if declared');
select extensions.throws_ok(
  $$select pg_temp.ingest(pg_temp.rows(jsonb_build_array(pg_temp.bench('89123','68911'),
      pg_temp.bench('88901','68911') || '{"started":true,"appeared":true,"minutes":90,"cleanSheets":1}')),
    pg_temp.coverage(24, 24))$$,
  'P0002', 'PLAYER_MAPPING_NOT_FOUND', 'B: an undeclared unknown starter still needs a mapping');
select extensions.throws_ok(
  $$select pg_temp.one_unknown('{"appeared":true,"minutes":20}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'C: a substitute with minutes is never left out');
-- Each row check is also proven on its own, so no one of them can be removed
-- because another happens to cover it.
select extensions.throws_ok(
  $$select pg_temp.one_unknown('{"started":true}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'B (alone): a starter with no minutes and no events is still never left out');
select extensions.throws_ok(
  $$select pg_temp.one_unknown('{"minutes":20}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'C (alone): minutes on the pitch, nothing else, is still never left out');
select extensions.throws_ok(
  $$select pg_temp.one_unknown('{"appeared":true}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'a bench row marked as having appeared is not an unused substitute');
select extensions.throws_ok($$select pg_temp.one_unknown('{"goals":1}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'D: a goal');
select extensions.throws_ok($$select pg_temp.one_unknown('{"assists":1}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'E: an assist');
select extensions.throws_ok($$select pg_temp.one_unknown('{"yellowCards":1}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'F: a yellow card');
select extensions.throws_ok($$select pg_temp.one_unknown('{"redCards":1}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'G: a direct red card');
select extensions.throws_ok($$select pg_temp.one_unknown('{"secondYellowDismissals":1}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'G2: a second-yellow dismissal');
select extensions.throws_ok($$select pg_temp.one_unknown('{"ownGoals":1}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'H: an own goal');
select extensions.throws_ok($$select pg_temp.one_unknown('{"penaltiesMissed":1}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'I: a missed penalty');
select extensions.throws_ok($$select pg_temp.one_unknown('{"penaltiesSaved":1}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'I: a saved penalty');
select extensions.throws_ok($$select pg_temp.one_unknown('{"saves":1}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'I: a save');
select extensions.throws_ok($$select pg_temp.one_unknown('{"goalsConceded":1}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'goals conceded on the bench is a sign he played');
select extensions.throws_ok($$select pg_temp.one_unknown('{"saves":null}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'an unknown (null) save count is not zero');
select extensions.throws_ok($$select pg_temp.one_unknown('{"penaltiesSaved":null}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'an unknown (null) saved-penalty count is not zero');
select extensions.throws_ok($$select pg_temp.one_unknown('{"providerRating":6.5}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'a provider rating is a sign he played');
select extensions.throws_ok($$select pg_temp.one_unknown('{"cleanSheets":1}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'a clean sheet is not an unused substitute');
select extensions.throws_ok($$select pg_temp.one_unknown('{"externalTeamId":"68912"}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'the declaration and the row must name the same club');
-- The declaration itself.
select extensions.throws_ok($$select pg_temp.one_unknown('{}', '{"role":"starter"}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'the declared role must be substitute');
select extensions.throws_ok($$select pg_temp.one_unknown('{}', '{"officialMinutes":5}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'official minutes must be zero or absent');
select extensions.throws_ok($$select pg_temp.one_unknown('{}', '{"scoringStatisticTypeIds":[84]}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'a scoring statistic with a value is refused');
select extensions.throws_ok($$select pg_temp.one_unknown('{}', '{"unknownStatisticTypeIds":[57]}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'a scoring statistic with an unknown value is refused');
select extensions.throws_ok($$select pg_temp.one_unknown('{}', '{"zeroStatisticTypeIds":["x"]}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'type ids must be numbers');
select extensions.throws_ok($$select pg_temp.one_unknown('{}', '{"externalPlayerId":"88999"}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'a declared player must be one of the rows');
select extensions.throws_ok(
  $$select pg_temp.ingest(pg_temp.rows(jsonb_build_array(pg_temp.bench('89123','68911'), pg_temp.bench('88901','68911'))),
    pg_temp.coverage(24, 24, 0, 22, 0, jsonb_build_array(pg_temp.declare('88901','68911'), pg_temp.declare('88901','68911'))))$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'a player cannot be declared twice');
select extensions.throws_ok(
  $$select pg_temp.ingest(pg_temp.rows(jsonb_build_array(pg_temp.bench('89123','68911'), pg_temp.bench('88901','68911'))),
    pg_temp.coverage(24, 24, 0, 22, 0, '"88901"'::jsonb))$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'the declaration must be a list of objects');

-- Known players: never left out, they take the normal rules and their refusals.
-- J: held by a Fantasy team (mapping inactive): known to the list, so not "unknown".
select extensions.throws_ok(
  $$select pg_temp.ingest(pg_temp.rows(jsonb_build_array(pg_temp.bench('89123','68911'), pg_temp.bench('88902','68912'))),
    pg_temp.coverage(24, 24, 0, 22, 0, jsonb_build_array(pg_temp.declare('88902','68912'))))$$,
  '55000', 'VERIFIED_UNUSED_EXCEPTION_PRECONDITION_FAILED', 'J: a player a Fantasy team holds is never left out: the approved exception is refused');
-- K: in a locked Fantasy lineup.
select extensions.throws_ok(
  $$select pg_temp.ingest(pg_temp.rows(jsonb_build_array(pg_temp.bench('89123','68911'), pg_temp.bench('88903','68912'))),
    pg_temp.coverage(24, 24, 0, 22, 0, jsonb_build_array(pg_temp.declare('88903','68912'))))$$,
  '55000', 'VERIFIED_UNUSED_EXCEPTION_PRECONDITION_FAILED', 'K: a player in a locked lineup is never left out: the approved exception is refused');
-- L: mapped, but no club record for this club on this date.
select extensions.throws_ok(
  $$select pg_temp.ingest(pg_temp.rows(jsonb_build_array(pg_temp.bench('89123','68911'), pg_temp.bench('89124','68911'))),
    pg_temp.coverage(24, 24, 0, 22, 0, jsonb_build_array(pg_temp.declare('89124','68911'))))$$,
  '55000', 'VERIFIED_UNUSED_EXCEPTION_PRECONDITION_FAILED', 'L: a mapped player is never left out: the approved exception is refused');
-- ...and, undeclared, he takes the existing path and its refusal exactly as before.
select extensions.throws_ok(
  $$select pg_temp.ingest(pg_temp.rows(jsonb_build_array(pg_temp.bench('89123','68911'), pg_temp.bench('89124','68911'))),
    pg_temp.coverage(24, 24))$$,
  'P0002', 'PLAYER_MEMBERSHIP_NOT_FOUND', 'L: the same mapped player, undeclared, still fails the membership check');
-- A club the list does not map.
select extensions.throws_ok(
  $$select pg_temp.ingest(pg_temp.rows(jsonb_build_array(pg_temp.bench('89123','68911'), pg_temp.bench('88901','68999'))),
    pg_temp.coverage(24, 24, 0, 22, 0, jsonb_build_array(pg_temp.declare('88901','68999'))))$$,
  '55000', 'VERIFIED_UNUSED_EXCEPTION_PRECONDITION_FAILED', 'an unmapped club: the approved exception is refused');
-- More than 2 declared is a defect in the caller: the limit is on the approved list.
select extensions.throws_ok(
  $$select pg_temp.ingest(pg_temp.rows(jsonb_build_array(pg_temp.bench('89123','68911'), pg_temp.bench('88901','68911'),
      pg_temp.bench('88904','68911'), pg_temp.bench('88905','68912'))),
    pg_temp.coverage(26, 26, 0, 22, 0, jsonb_build_array(pg_temp.declare('88901','68911'),
      pg_temp.declare('88904','68911'), pg_temp.declare('88905','68912'))))$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'three declared players are refused: the limit is 2 on the approved list');
-- An unknown substitute nobody approved still blocks the fixture, whoever else was.
select extensions.throws_ok(
  $$select pg_temp.ingest(pg_temp.rows(jsonb_build_array(pg_temp.bench('89123','68911'), pg_temp.bench('88901','68911'),
      pg_temp.bench('88904','68911'), pg_temp.bench('88905','68912'))),
    pg_temp.coverage(26, 26, 0, 22, 0, jsonb_build_array(pg_temp.declare('88901','68911'),
      pg_temp.declare('88904','68911'))))$$,
  'P0002', 'PLAYER_MAPPING_NOT_FOUND', 'a third unknown substitute that was not approved still blocks the fixture');
-- The new declaration contract.
select extensions.throws_ok($$select pg_temp.one_unknown('{}', '{"fixtureExternalId":"19891002"}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'the declaration must name this fixture');
select extensions.throws_ok($$select pg_temp.one_unknown('{}', '{"eventTypeIds":[19]}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'a match event naming him is refused');
select extensions.throws_ok($$select pg_temp.one_unknown('{}', '{"eventTypeIds":null}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'the event list is part of the contract: absent is not empty');
select extensions.throws_ok(
  $$select pg_temp.one_unknown('{}', jsonb_build_object('evidenceDigest', repeat('a', 64)))$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'a digest that is not the digest of the declared facts is refused');
select extensions.throws_ok($$select pg_temp.one_unknown('{}', '{"evidenceDigest":null}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'the evidence digest is required: absent is not a match');
-- Right digest for the real fixture, but the declaration names another fixture: only the
-- fixture binding can stop this one.
select extensions.throws_ok(
  $$select pg_temp.ingest(pg_temp.rows(jsonb_build_array(pg_temp.bench('89123','68911'), pg_temp.bench('88901','68911'))),
    pg_temp.coverage(24, 24, 0, 22, 0, jsonb_build_array(
      pg_temp.declare('88901','68911') || '{"fixtureExternalId":"19891002"}'::jsonb)))$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'a declaration that names another fixture is refused even with a valid digest');
select extensions.throws_ok($$select pg_temp.one_unknown('{}', '{"evidenceDigest":"nothex"}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'a malformed evidence digest is refused');
select extensions.throws_ok($$select pg_temp.one_unknown('{}', '{"preflightDigest":"nothex"}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'a malformed preflight digest is refused');
select extensions.throws_ok($$select pg_temp.one_unknown('{}', '{"preflightDigest":null}')$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'the preflight digest is required');
-- 11 starters per side is still required.
select extensions.throws_ok(
  $$select pg_temp.ingest(pg_temp.rows(jsonb_build_array(pg_temp.bench('89123','68911'), pg_temp.bench('88901','68911')), array[22]),
    pg_temp.coverage(24, 24, 0, 22, 0, jsonb_build_array(pg_temp.declare('88901','68911'))))$$,
  '55000', 'VERIFIED_UNUSED_EXCEPTION_PRECONDITION_FAILED', 'a missing starter is not hidden by the exception: the starters must be the ones reported');
-- No club may have more than 11 starters, whatever else is true.
select extensions.throws_ok(
  $$select pg_temp.ingest(
    (select jsonb_agg(case when n = 12 then pg_temp.starter(n) || '{"externalTeamId":"68911"}'::jsonb
        else pg_temp.starter(n) end order by n) from generate_series(1, 22) n)
      || jsonb_build_array(pg_temp.bench('89123','68911'), pg_temp.bench('88901','68911')),
    pg_temp.coverage(24, 24, 0, 22, 0, jsonb_build_array(pg_temp.declare('88901','68911'))))$$,
  '55000', 'VERIFIED_UNUSED_EXCEPTION_PRECONDITION_FAILED', 'a club with more than 11 starters is refused');
-- The rows seen must still add up.
select extensions.throws_ok(
  $$select pg_temp.ingest(pg_temp.rows(jsonb_build_array(pg_temp.bench('89123','68911'), pg_temp.bench('88901','68911'))),
    pg_temp.coverage(23, 24, 0, 22, 0, jsonb_build_array(pg_temp.declare('88901','68911'))))$$,
  '22023', 'CURRENT_PERFORMANCE_INCOMPLETE', 'the rows seen still have to be the rows plus the rows left out');
select extensions.is(
  (select count(*)::integer from app.player_fixture_performances where fixture_id = md5('vu-fixture')::uuid) +
  (select count(*)::integer from app_private.current_fixture_excluded_participants) +
  (select count(*)::integer from app_private.historical_performance_fixture_coverage where fixture_id = md5('vu-fixture')::uuid),
  0, 'every refusal wrote nothing');

-- Privileges: the new function is the only way in.
select extensions.ok(has_function_privilege('service_role',
  'api.ingest_current_player_fixture_performance(text,text,text,jsonb,jsonb,timestamptz)', 'execute'),
  'service_role can call the ingest function');
select extensions.ok(not has_function_privilege('anon',
  'api.ingest_current_player_fixture_performance(text,text,text,jsonb,jsonb,timestamptz)', 'execute')
  and not has_function_privilege('authenticated',
  'api.ingest_current_player_fixture_performance(text,text,text,jsonb,jsonb,timestamptz)', 'execute'),
  'neither anon nor authenticated can');
select extensions.ok(not has_function_privilege('service_role',
  'api.ingest_current_player_fixture_performance_before_exclusions(text,text,text,jsonb,jsonb,timestamptz)', 'execute'),
  'the existing function behind it is not callable directly');
select extensions.ok(not has_table_privilege('authenticated', 'app_private.current_fixture_excluded_participants', 'select')
  and not has_table_privilege('anon', 'app_private.current_fixture_excluded_participants', 'select')
  and has_table_privilege('service_role', 'app_private.current_fixture_excluded_participants', 'select'),
  'the audit table is for the service role only');

-- A caller that is not the service role is refused before anything else.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select extensions.throws_ok($$select pg_temp.one_unknown()$$, '42501', 'football_service_role_required',
  'only the service role can ingest');
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ---------------------------------------------------------------------------
-- PASS: a named substitute, unknown, unused, no scoring event.
-- ---------------------------------------------------------------------------
select extensions.is(
  pg_temp.ingest(
    pg_temp.rows(jsonb_build_array(pg_temp.bench('89123', '68911'), pg_temp.bench('88901', '68911'))),
    pg_temp.coverage(24, 24, 0, 22, 0, jsonb_build_array(pg_temp.declare('88901', '68911'))))
  - 'fixtureId' - 'sourceVersion',
  '{"active":23,"reconciled":true,"scoringStatisticsComplete":true,"excludedVerifiedUnusedUnmapped":["88901"]}'::jsonb,
  'A: the unknown unused substitute is left out and the other 23 are imported');
select extensions.is(
  (select jsonb_build_object('seen', lineup_rows_seen, 'valid', valid_player_rows, 'excluded', excluded_incomplete_rows,
     'mappingExcluded', excluded_mapping_rows, 'starters', starter_rows, 'unnamed', anonymous_starter_rows,
     'performances', performance_rows, 'outcome', coverage_outcome, 'certified', scoring_statistics_complete and reconciled)
   from app_private.historical_performance_fixture_coverage where fixture_id = md5('vu-fixture')::uuid),
  '{"seen":24,"valid":23,"excluded":1,"mappingExcluded":0,"starters":22,"unnamed":0,"performances":23,"outcome":"accepted","certified":true}'::jsonb,
  'A: the coverage counts the player with the rows left out, and the fixture is certified');
select extensions.is(
  (select count(*)::integer from app.player_fixture_performances where fixture_id = md5('vu-fixture')::uuid and active),
  23, 'A: 23 performance rows are stored, and none for the unknown player');
select extensions.is(
  (select count(*)::integer from app.player_fixture_performances
   where fixture_id = md5('vu-fixture')::uuid and active and started),
  22, 'A: all 22 starters are stored as starters (11 per side)');
select extensions.is(
  (select jsonb_build_object('player', external_player_id, 'club', external_team_id, 'role', participation_role,
     'reason', reason, 'minutes', official_minutes, 'zeroTypes', to_jsonb(zero_statistic_type_ids))
   from app_private.current_fixture_verified_unused_participants where fixture_id = md5('vu-fixture')::uuid),
  '{"player":"88901","club":"68911","role":"substitute","reason":"verified_unused_unmapped","minutes":null,"zeroTypes":[119]}'::jsonb,
  'A: the left-out player is recorded: identified, substitute, verified unused, with the evidence');
select extensions.is(
  (select jsonb_build_object('basis', evidence_basis, 'events', to_jsonb(event_type_ids),
     'evidenceDigest', evidence_digest, 'preflightDigest', preflight_digest)
   from app_private.current_fixture_verified_unused_participants where fixture_id = md5('vu-fixture')::uuid),
  jsonb_build_object('basis', 'importer_declared_digest_bound', 'events', '[]'::jsonb,
    'evidenceDigest', pg_temp.declare('88901', '68911') ->> 'evidenceDigest',
    'preflightDigest', encode(extensions.digest('vu-preflight', 'sha256'), 'hex')),
  'A: the record says what it rests on: importer-declared evidence, bound by digest, and the reviewed preflight');
select extensions.is(
  pg_temp.declare('88901', '68911') ->> 'evidenceDigest',
  'c47774629d2fb31ff88760ff67eb01b11739c856b7613d6b7cfb32e56c65e82f',
  'the digest of these facts is the one the TypeScript test vector pins (the two languages agree)');
select extensions.is(
  (select team_id from app_private.current_fixture_excluded_participants where fixture_id = md5('vu-fixture')::uuid),
  '63910000-0000-4000-8000-000000000001'::uuid, 'A: the record carries the internal club');
select extensions.is(
  (select coverage_source_version from app_private.current_fixture_excluded_participants where fixture_id = md5('vu-fixture')::uuid),
  (select source_version from app_private.historical_performance_fixture_coverage where fixture_id = md5('vu-fixture')::uuid),
  'A: the record is bound to the coverage row''s source version');
select extensions.is(
  (select count(*)::integer from app.player_fixture_performances p
   join app.players pl on pl.id = p.player_id
   where p.fixture_id = md5('vu-fixture')::uuid and pl.full_name = 'VU Player 23' and p.active and not p.appeared and p.minutes = 0),
  1, 'normal path: the known substitute who stayed on the bench is imported as before');

-- The same facts again change nothing and record nothing twice.
select extensions.is(
  (pg_temp.ingest(
    pg_temp.rows(jsonb_build_array(pg_temp.bench('89123', '68911'), pg_temp.bench('88901', '68911'))),
    pg_temp.coverage(24, 24, 0, 22, 0, jsonb_build_array(pg_temp.declare('88901', '68911'))))) -> 'active',
  '23'::jsonb, 'a repeat of the same payload is accepted');
select extensions.is(
  (select count(*)::integer from app_private.current_fixture_excluded_participants where fixture_id = md5('vu-fixture')::uuid),
  1, 'and the left-out player is still recorded once');

-- The declaration does not change the source version when nobody is left out:
-- the same payload without it, and with it declaring only a known player, give
-- the version the existing function always gave.
create temp table expected_version as
select 'sportsmonks-current-fixture:' || encode(extensions.digest(jsonb_build_object(
  'fixtureId', md5('vu-fixture')::uuid,
  'rows', pg_temp.rows(jsonb_build_array(pg_temp.bench('89123', '68911'))),
  'coverage', pg_temp.coverage(23, 23))::text, 'sha256'), 'hex') as version;
select extensions.is(
  pg_temp.ingest(pg_temp.rows(jsonb_build_array(pg_temp.bench('89123', '68911'))), pg_temp.coverage(23, 23)) ->> 'sourceVersion',
  (select version from expected_version), 'no declaration: the existing function gives the version it always gave');
select extensions.is(
  pg_temp.ingest(pg_temp.rows(jsonb_build_array(pg_temp.bench('89123', '68911'))),
    pg_temp.coverage(23, 23) || '{"verifiedUnusedSubstitutes":[]}'::jsonb) ->> 'sourceVersion',
  (select version from expected_version),
  'an empty declaration leaves the source version, the rows and the coverage as they were');
select extensions.throws_ok(
  $$select pg_temp.ingest(pg_temp.rows(jsonb_build_array(pg_temp.bench('89123', '68911'))),
    pg_temp.coverage(23, 23, 0, 22, 0, jsonb_build_array(pg_temp.declare('89123', '68911'))))$$,
  '55000', 'VERIFIED_UNUSED_EXCEPTION_PRECONDITION_FAILED',
  'a declaration for a KNOWN player is refused: never ingested around, never dropped');
select extensions.is(
  (select count(*)::integer from app_private.historical_performance_fixture_coverage
   where fixture_id = md5('vu-fixture')::uuid and excluded_incomplete_rows = 0 and performance_rows = 23),
  1, 'and nobody is left out: the mapped bench player is stored like any other');
select extensions.is(
  (select count(*)::integer from app_private.current_fixture_verified_unused_participants where fixture_id = md5('vu-fixture')::uuid),
  0, 'the earlier record describes an earlier version, so the current view shows none');
select extensions.is(
  (select count(*)::integer from app_private.current_fixture_excluded_participants where fixture_id = md5('vu-fixture')::uuid),
  1, 'the history of what was left out is kept');

-- M: an unnamed lineup row (no provider id) keeps going through the unnamed-row
-- rule; only the named, declared player is recorded.
select extensions.is(
  pg_temp.ingest(
    pg_temp.rows(jsonb_build_array(pg_temp.bench('89123', '68911'), pg_temp.bench('88901', '68911')), array[22]),
    pg_temp.coverage(24, 23, 1, 21, 1, jsonb_build_array(pg_temp.declare('88901', '68911')))) -> 'active',
  '22'::jsonb, 'M: one unnamed starter and one unused unknown substitute: 22 rows imported');
select extensions.is(
  (select jsonb_build_object('seen', lineup_rows_seen, 'valid', valid_player_rows, 'excluded', excluded_incomplete_rows,
     'starters', starter_rows, 'unnamed', anonymous_starter_rows)
   from app_private.historical_performance_fixture_coverage where fixture_id = md5('vu-fixture')::uuid),
  '{"seen":24,"valid":22,"excluded":2,"starters":21,"unnamed":1}'::jsonb,
  'M: the unnamed starter is counted as unnamed; the unused substitute only with the rows left out');
select extensions.is(
  (select array_agg(external_player_id order by external_player_id) from app_private.current_fixture_verified_unused_participants
   where fixture_id = md5('vu-fixture')::uuid),
  array['88901'], 'M: only the named, declared player is recorded');

-- The limit is on the approved list, not on how many substitutes were unused: seven
-- known substitutes who stayed on the bench do not stop the one approved exclusion.
insert into app.players (id, slug, full_name, display_name, position)
select md5('vu-player-' || n)::uuid, 'vu-player-' || n, 'VU Player ' || n, 'VU Player ' || n, 'midfielder'
from generate_series(27, 33) n;
insert into app.team_memberships (player_id, team_id, season_id, shirt_number, valid_from, active)
select md5('vu-player-' || n)::uuid, '63910000-0000-4000-8000-000000000001'::uuid,
  '43910000-0000-4000-8000-000000000001'::uuid, n, current_date - 30, true
from generate_series(27, 33) n;
insert into app_private.football_provider_mappings (
  provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active
)
select 'sportsmonks', 'player', (89100 + n)::text, md5('vu-player-' || n)::uuid, 'vu-player-' || n, statement_timestamp(), true
from generate_series(27, 33) n;
select extensions.is(
  pg_temp.ingest(
    pg_temp.rows(jsonb_build_array(pg_temp.bench('89123', '68911'), pg_temp.bench('89127', '68911'),
      pg_temp.bench('89128', '68911'), pg_temp.bench('89129', '68911'), pg_temp.bench('89130', '68911'),
      pg_temp.bench('89131', '68911'), pg_temp.bench('89132', '68911'), pg_temp.bench('89133', '68911'),
      pg_temp.bench('88901', '68911'))),
    pg_temp.coverage(31, 31, 0, 22, 0, jsonb_build_array(pg_temp.declare('88901', '68911')))) -> 'excludedVerifiedUnusedUnmapped',
  '["88901"]'::jsonb,
  'eight unused substitutes in the payload, one approved and unplaceable: only he is left out, and the other seven are imported');
select extensions.is(
  (select count(*)::integer from app.player_fixture_performances where fixture_id = md5('vu-fixture')::uuid and active and not appeared),
  8, 'the eight known bench players are stored as before');

-- ---------------------------------------------------------------------------
-- Fantasy: what scoring reads is unchanged, and it accepts this coverage.
-- ---------------------------------------------------------------------------
-- Back to the accepted case (22 starters, 23 rows, 1 left out), assigned to a gameweek.
select pg_temp.ingest(
  pg_temp.rows(jsonb_build_array(pg_temp.bench('89123', '68911'), pg_temp.bench('88901', '68911'))),
  pg_temp.coverage(24, 24, 0, 22, 0, jsonb_build_array(pg_temp.declare('88901', '68911'))));
insert into app.fantasy_fixture_assignments (
  fantasy_season_id, fixture_id, gameweek_id, original_gameweek_id, original_kickoff_at, assigned_kickoff_at,
  frozen_at, source_version
) values ('73910000-0000-4000-8000-000000000002', md5('vu-fixture')::uuid, '73910000-0000-4000-8000-000000000003',
  '73910000-0000-4000-8000-000000000003', statement_timestamp() - interval '2 days',
  statement_timestamp() - interval '2 days', statement_timestamp() - interval '3 days', 1);
create temp table scoring_doc as
select app_private.fantasy_scoring_input_document_v1('73910000-0000-4000-8000-000000000003') as doc;
select extensions.lives_ok(
  $$select app_private.fantasy_validate_scoring_document_v1((select doc from scoring_doc))$$,
  'scoring accepts the certified coverage that leaves the unused player out');
select extensions.is(
  (select doc #>> '{fixtures,0,coverage,excluded_incomplete_rows}' from scoring_doc), '1',
  'scoring sees one row left out, within the range it already allows');
select extensions.is(
  (select doc -> 'fixtures' -> 0 -> 'coverage' ? 'verifiedUnusedUnmappedExcluded' from scoring_doc), false,
  'the scoring document gains no new keys: its digests for every other fixture are unchanged');
select extensions.is(
  (select jsonb_array_length(doc -> 'playerFixtures') from scoring_doc), 23,
  'one scoring row for each of the 23 Fantasy players of the two clubs, and none for the player left out');
select extensions.is(
  (select count(*)::integer from scoring_doc, jsonb_array_elements(doc -> 'playerFixtures') pf
   where pf ->> 'fantasyPlayerId' = md5('vu-fantasy-23')::text::uuid::text
     and (pf #>> '{stats,minutes}')::integer = 0 and (pf #>> '{stats,goals}')::integer = 0
     and (pf #>> '{stats,yellowCards}')::integer = 0),
  1, 'a known bench player is scored from his own zero row, as before');

-- Adaptive scoring has its own participation evidence and is not reviewed for this rule.
insert into app_private.fantasy_adaptive_policy (season_id, from_gameweek, ruleset_id, activated_at, paused)
values ('73910000-0000-4000-8000-000000000002', 1,
  (select id from app.fantasy_rulesets order by version desc, minor_version desc limit 1),
  statement_timestamp(), false);
select extensions.ok(app_private.fantasy_adaptive_enabled('73910000-0000-4000-8000-000000000003'),
  'fixture: the gameweek is now under adaptive scoring');
-- The payload is a valid adaptive one: the exception is refused outright, never
-- applied under a scoring path whose participation evidence it was not reviewed for.
select extensions.throws_ok(
  $$select pg_temp.ingest(pg_temp.rows(jsonb_build_array(pg_temp.bench('89123','68911'), pg_temp.bench('88901','68911'))),
    pg_temp.coverage(24, 24, 0, 22, 0, jsonb_build_array(pg_temp.declare('88901','68911')))
      || '{"adaptiveFieldEvidence":{}}'::jsonb)$$,
  '55000', 'VERIFIED_UNUSED_EXCEPTION_PRECONDITION_FAILED',
  'adaptive scoring: the exception is refused (that path is not reviewed for it)');

select * from extensions.finish();
rollback;
