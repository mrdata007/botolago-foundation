-- The current-season statistics page only offers fixtures that can still score.
--
-- The hourly orchestrator reads at most 10 pages of 5 from a null cursor. When
-- the page offered every finished fixture of the season, a season past 50
-- finished fixtures left the newest ones unreachable. Here 56 finished
-- fixtures sit in a finalized gameweek and 8 have just finished in a live
-- one: the first page must be exactly those 8.
begin;
select extensions.no_plan();

create function pg_temp.scope_id(n integer) returns uuid language sql immutable as $$
  select ('5c000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

insert into app.countries(id, iso_alpha2, iso_alpha3) values (pg_temp.scope_id(1), 'MA', 'MAR');
insert into app.competitions(id, slug, name, short_name, competition_type, country_id)
values (pg_temp.scope_id(2), 'scope-league', 'Scope League', 'SCL', 'league', pg_temp.scope_id(1));
insert into app.seasons(id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.scope_id(3), pg_temp.scope_id(2), '2026/2027', current_date - 200, current_date + 100,
  'active', true);
insert into app.rounds(id, season_id, round_number, name)
values (pg_temp.scope_id(4), pg_temp.scope_id(3), 1, 'Earlier rounds'),
  (pg_temp.scope_id(5), pg_temp.scope_id(3), 2, 'This round');
insert into app.teams(id, slug, name, short_name, code, country_id)
select pg_temp.scope_id(10 + n), 'scope-club-' || n, 'Scope Club ' || n, 'SC' || n, 'S' || n,
  pg_temp.scope_id(1)
from generate_series(1, 2) n;
insert into app_private.football_provider_mappings(provider_name, entity_type, external_id,
  internal_entity_id, last_seen_at)
values ('sportsmonks', 'competition', '860', pg_temp.scope_id(2), statement_timestamp()),
  ('sportsmonks', 'season', '28647', pg_temp.scope_id(3), statement_timestamp());

-- 56 finished fixtures from earlier rounds (provider ids 1001..1056) and the
-- 8 that just finished (provider ids 2001..2008), all in the past.
insert into app.fixtures(id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, period, home_score, away_score, provider_updated_at, source_sequence)
select pg_temp.scope_id(1000 + n), pg_temp.scope_id(2), pg_temp.scope_id(3),
  case when n <= 56 then pg_temp.scope_id(4) else pg_temp.scope_id(5) end,
  pg_temp.scope_id(11), pg_temp.scope_id(12),
  statement_timestamp() - make_interval(days => 70 - n), 'finished', 'post_match', 1, 0,
  statement_timestamp() - interval '1 hour', 1
from generate_series(1, 64) n;
insert into app_private.football_provider_mappings(provider_name, entity_type, external_id,
  internal_entity_id, last_seen_at)
select 'sportsmonks', 'fixture', case when n <= 56 then (1000 + n)::text else (1944 + n)::text end,
  pg_temp.scope_id(1000 + n), statement_timestamp()
from generate_series(1, 64) n;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  jsonb_array_length(api.football_current_performance_fixture_batch('sportsmonks', '28647', null, 10) -> 'items'),
  10, 'with no Fantasy calendar every finished fixture is still offered, in provider order');

-- The Fantasy calendar: the earlier fixtures belong to a finalized gameweek,
-- the new ones to the gameweek that is live now.
insert into app.fantasy_competitions(id, football_competition_id, slug, name, active)
values (pg_temp.scope_id(20), pg_temp.scope_id(2), 'scope-league', 'Scope League', true);
insert into app.fantasy_seasons(id, fantasy_competition_id, football_season_id, ruleset_id, name,
  status, starts_at, ends_at)
values (pg_temp.scope_id(21), pg_temp.scope_id(20), pg_temp.scope_id(3),
  'f6100000-0000-4000-8000-000000000101', '2026/2027', 'active', current_date - 200, current_date + 100);
insert into app.fantasy_gameweeks(id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status)
values (pg_temp.scope_id(31), pg_temp.scope_id(21), pg_temp.scope_id(4), 1, '1',
  statement_timestamp() - interval '80 days', statement_timestamp() - interval '79 days',
  statement_timestamp() - interval '8 days', 'open'),
  (pg_temp.scope_id(32), pg_temp.scope_id(21), pg_temp.scope_id(5), 2, '2',
  statement_timestamp() - interval '7 days', statement_timestamp() - interval '6 days',
  statement_timestamp() + interval '1 day', 'scheduled');
insert into app.fantasy_fixture_assignments(fantasy_season_id, fixture_id, gameweek_id,
  original_gameweek_id, original_kickoff_at, assigned_kickoff_at, source_version)
select pg_temp.scope_id(21), fixture.id,
  case when fixture.round_id = pg_temp.scope_id(4) then pg_temp.scope_id(31) else pg_temp.scope_id(32) end,
  case when fixture.round_id = pg_temp.scope_id(4) then pg_temp.scope_id(31) else pg_temp.scope_id(32) end,
  fixture.kickoff_at, fixture.kickoff_at, 1
from app.fixtures fixture where fixture.season_id = pg_temp.scope_id(3);
-- Status set directly: this test is about which fixtures are offered, not how
-- a gameweek reaches its state (the lifecycle tests cover that).
alter table app.fantasy_gameweeks disable trigger user;
update app.fantasy_gameweeks set status = 'finalized', points_state = 'final',
  finalized_at = statement_timestamp() - interval '7 days'
where id = pg_temp.scope_id(31);
update app.fantasy_gameweeks set status = 'live' where id = pg_temp.scope_id(32);
alter table app.fantasy_gameweeks enable trigger user;

select extensions.is(
  (select jsonb_agg(item ->> 'externalFixtureId' order by (item ->> 'externalFixtureId')::bigint)
   from jsonb_array_elements(
     api.football_current_performance_fixture_batch('sportsmonks', '28647', null, 10) -> 'items') item),
  '["2001","2002","2003","2004","2005","2006","2007","2008"]'::jsonb,
  'the first page is exactly the fixtures of the live gameweek, past 56 finalized ones');
select extensions.is(
  api.football_current_performance_fixture_batch('sportsmonks', '28647', null, 10) ->> 'hasMore',
  'false', 'nothing else is waiting behind them');
select extensions.is(
  api.football_current_performance_fixture_batch('sportsmonks', '28647', null, 5) ->> 'nextCursor',
  '2005', 'paging over what remains is unchanged');

-- A gameweek that is not final keeps its fixtures offered: a provider
-- correction before the seal is still picked up.
alter table app.fantasy_gameweeks disable trigger user;
update app.fantasy_gameweeks set status = 'scheduled' where id = pg_temp.scope_id(32);
update app.fantasy_gameweeks set status = 'provisional', points_state = 'provisional', finalized_at = null
where id = pg_temp.scope_id(31);
alter table app.fantasy_gameweeks enable trigger user;
select extensions.is(
  api.football_current_performance_fixture_batch('sportsmonks', '28647', null, 5) -> 'items' -> 0 ->> 'externalFixtureId',
  '1001', 'fixtures of a gameweek that is not yet final are still re-read');

select * from extensions.finish();
rollback;
