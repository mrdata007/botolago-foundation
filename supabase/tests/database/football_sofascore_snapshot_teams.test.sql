begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- api.football_sofascore_live_snapshot now names each fixture's two clubs
-- (20261011110000) and carries the stored live minute (20261013190000).
--   1 teams on the fixture   2 privileges unchanged   3 read only   4 stored minute

create function pg_temp.id(p_prefix text, n integer) returns uuid language sql immutable as
  $$ select (p_prefix || '000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.id('c0', 1), 'MA', 'MAR')
  on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.id('c0', 2), 'snapshot-teams-test', 'Snapshot Teams Test', 'STT', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.id('c0', 3), pg_temp.id('c0', 2), '2026/2027', '2026-08-01', '2027-06-30', 'active', false);
insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.id('c1', i), 'snapshot-teams-club-' || i, 'Snapshot Teams Club ' || i, 'TC' || i, 'TC' || i,
  (select id from app.countries where iso_alpha2 = 'MA') from generate_series(1, 2) i;
insert into app.fixtures (id, competition_id, season_id, home_team_id, away_team_id, kickoff_at, status, period,
  home_score, away_score, provider_updated_at, source_sequence)
values (pg_temp.id('f0', 1), pg_temp.id('c0', 2), pg_temp.id('c0', 3), pg_temp.id('c1', 1), pg_temp.id('c1', 2),
  '2026-10-20 12:00Z', 'finished', 'post_match', 2, 1, '2026-10-20 14:00Z', 7);
-- a second fixture in play with a minute, kicked off later (snapshot order: kickoff)
insert into app.fixtures (id, competition_id, season_id, home_team_id, away_team_id, kickoff_at, status, period,
  minute, home_score, away_score, provider_updated_at, source_sequence)
values (pg_temp.id('f0', 2), pg_temp.id('c0', 2), pg_temp.id('c0', 3), pg_temp.id('c1', 2), pg_temp.id('c1', 1),
  '2026-10-21 12:00Z', 'live_first_half', 'first_half', 37, 0, 0, '2026-10-21 12:40Z', 8);
insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id,
  source_version, last_seen_at)
values ('sofascore', 'fixture', '9101', pg_temp.id('f0', 1), 'v', '2026-10-01 00:00Z'),
  ('sofascore', 'fixture', '9102', pg_temp.id('f0', 2), 'v', '2026-10-01 00:00Z'),
  ('sofascore', 'team', '5001', pg_temp.id('c1', 1), 'v', '2026-10-01 00:00Z'),
  ('sofascore', 'team', '5002', pg_temp.id('c1', 2), 'v', '2026-10-01 00:00Z');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temporary table snap as select api.football_sofascore_live_snapshot() as s;

-- 1 teams on the fixture
select extensions.is((select s -> 'fixtures' -> 0 ->> 'homeTeamId' from snap), pg_temp.id('c1', 1)::text, '1.1 home team id (internal)');
select extensions.is((select s -> 'fixtures' -> 0 ->> 'awayTeamId' from snap), pg_temp.id('c1', 2)::text, '1.2 away team id (internal)');
select extensions.is((select count(*)::int from snap, jsonb_array_elements(s -> 'mappings') e
  where e ->> 'entity_type' = 'team'
    and (e ->> 'internal_entity_id') in (s -> 'fixtures' -> 0 ->> 'homeTeamId', s -> 'fixtures' -> 0 ->> 'awayTeamId')), 2,
  '1.3 both clubs resolve to SofaScore team mappings in the same snapshot');
select extensions.is((select s -> 'fixtures' -> 0 ->> 'externalId' from snap), '9101', '1.4 earlier keys unchanged');

-- 2 privileges unchanged
select extensions.ok(not has_function_privilege('anon', 'api.football_sofascore_live_snapshot()', 'execute'), '2.1 not callable by visitors');
select extensions.ok(has_function_privilege('service_role', 'api.football_sofascore_live_snapshot()', 'execute'), '2.2 callable by the service role');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select extensions.throws_ok($$select api.football_sofascore_live_snapshot()$$, 'PT403', 'forbidden', '2.3 a non-service caller is refused');

-- 3 read only
select extensions.is((select count(*)::int from app_private.football_provider_mappings where provider_name = 'sofascore'), 4, '3.1 mappings untouched');

-- 4 stored minute: the key is always there, null when no minute is stored
select extensions.ok((select (s -> 'fixtures' -> 0) ? 'minute' from snap), '4.1 the minute key is present on every fixture');
select extensions.is((select jsonb_typeof(s -> 'fixtures' -> 0 -> 'minute') from snap), 'null', '4.2 no stored minute is a JSON null, not a missing key');
select extensions.is((select s -> 'fixtures' -> 1 ->> 'externalId' from snap), '9102', '4.3 the fixture in play comes second');
select extensions.is((select (s -> 'fixtures' -> 1 -> 'minute')::int from snap), 37, '4.4 the stored minute, as an integer');

select * from extensions.finish();
rollback;
