begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- api.football_sofascore_live_snapshot: read-only mappings + mapped fixture state.
--   1 privileges   2 content   3 narrowing (other provider / inactive)   4 read only

create function pg_temp.id(p_prefix text, n integer) returns uuid language sql immutable as
  $$ select (p_prefix || '000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.id('c0', 1), 'MA', 'MAR')
  on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.id('c0', 2), 'snapshot-test', 'Snapshot Test', 'ST', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.id('c0', 3), pg_temp.id('c0', 2), '2026/2027', '2026-08-01', '2027-06-30', 'active', false);
insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.id('c1', i), 'snapshot-club-' || i, 'Snapshot Club ' || i, 'SN' || i, 'SN' || i,
  (select id from app.countries where iso_alpha2 = 'MA') from generate_series(1, 3) i;
insert into app.fixtures (id, competition_id, season_id, home_team_id, away_team_id, kickoff_at, status, period,
  home_score, away_score, provider_updated_at, source_sequence)
values (pg_temp.id('f0', 1), pg_temp.id('c0', 2), pg_temp.id('c0', 3), pg_temp.id('c1', 1), pg_temp.id('c1', 2),
    '2026-10-20 12:00Z', 'live_first_half', 'first_half', 1, 0, '2026-10-20 12:30Z', 7),
  (pg_temp.id('f0', 2), pg_temp.id('c0', 2), pg_temp.id('c0', 3), pg_temp.id('c1', 3), pg_temp.id('c1', 2),
    '2026-10-21 12:00Z', 'scheduled', 'pre_match', null, null, '2026-10-01 00:00Z', 1);

insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id,
  source_version, last_seen_at)
values ('sofascore', 'fixture', '9001', pg_temp.id('f0', 1), 'v', '2026-10-01 00:00Z'),
  ('sofascore', 'team', 'st-1', pg_temp.id('c1', 1), 'v', '2026-10-01 00:00Z'),
  ('sportsmonks', 'fixture', 'sm-2', pg_temp.id('f0', 2), 'v', '2026-10-01 00:00Z'),
  ('sofascore', 'fixture', '9002', pg_temp.id('f0', 2), 'v', '2026-10-01 00:00Z');
update app_private.football_provider_mappings set active = false
where provider_name = 'sofascore' and external_id = '9002';

-- 1 privileges
select extensions.ok(not has_function_privilege('anon', 'api.football_sofascore_live_snapshot()', 'execute'), '1.1 not callable by visitors');
select extensions.ok(not has_function_privilege('authenticated', 'api.football_sofascore_live_snapshot()', 'execute'), '1.2 not callable by signed-in users');
select extensions.ok(has_function_privilege('service_role', 'api.football_sofascore_live_snapshot()', 'execute'), '1.3 callable by the service role');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select extensions.throws_ok($$select api.football_sofascore_live_snapshot()$$, 'PT403', 'forbidden', '1.4 a non-service caller is refused');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- 2 content
create temporary table snap as select api.football_sofascore_live_snapshot() as s;
select extensions.is((select jsonb_array_length(s -> 'mappings') from snap), 2, '2.1 two active sofascore mappings');
select extensions.is((select jsonb_array_length(s -> 'fixtures') from snap), 1, '2.2 one mapped fixture (the inactive mapping is left out)');
select extensions.is((select s -> 'fixtures' -> 0 ->> 'externalId' from snap), '9001', '2.3 the fixture carries its SofaScore event id');
select extensions.is((select s -> 'fixtures' -> 0 ->> 'status' from snap), 'live_first_half', '2.4 status');
select extensions.is((select (s -> 'fixtures' -> 0 ->> 'homeScore')::int from snap), 1, '2.5 score');
select extensions.is((select (s -> 'fixtures' -> 0 ->> 'sourceSequence')::int from snap), 7, '2.6 source sequence');

-- 3 narrowing
select extensions.is((select count(*)::int from snap, jsonb_array_elements(s -> 'mappings') e where e ->> 'provider_name' <> 'sofascore'), 0, '3.1 no other provider');
select extensions.is((select count(*)::int from snap, jsonb_array_elements(s -> 'mappings') e where (e ->> 'active')::boolean is not true), 0, '3.2 no inactive mapping');

-- 4 read only
select extensions.is((select count(*)::int from app_private.football_provider_mappings where provider_name = 'sofascore'), 3, '4.1 mappings untouched');

select * from extensions.finish();
rollback;
