begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- api.service_apply_sofascore_standings (20261013120000).
--   1 privileges   2 write + rank swap   3 unknown is not zero   4 unmapped club
--   5 stale table   6 unchanged table touches nothing
-- NOT RUN in the authoring session (no Docker): CI's database-quality job is the authority.

create function pg_temp.id(p_prefix text, n integer) returns uuid language sql immutable as
  $$ select (p_prefix || '000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.id('c0', 1), 'MA', 'MAR')
  on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.id('c0', 2), 'standings-test', 'Standings Test', 'ST', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.id('c0', 3), pg_temp.id('c0', 2), '2026/2027', '2026-08-01', '2027-06-30', 'active', false);
insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.id('c1', i), 'standings-club-' || i, 'Standings Club ' || i, 'SC' || i, 'SC' || i,
  (select id from app.countries where iso_alpha2 = 'MA') from generate_series(1, 4) i;

insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id,
  source_version, last_seen_at)
values ('sofascore', 'season', '990001', pg_temp.id('c0', 3), 'v', '2026-10-01 00:00Z'),
  ('sofascore', 'team', '7001', pg_temp.id('c1', 1), 'v', '2026-10-01 00:00Z'),
  ('sofascore', 'team', '7002', pg_temp.id('c1', 2), 'v', '2026-10-01 00:00Z'),
  ('sofascore', 'team', '7003', pg_temp.id('c1', 3), 'v', '2026-10-01 00:00Z');
-- club 4 has no SofaScore mapping on purpose.

insert into app.standings (competition_id, season_id, team_id, rank, played, won, drawn, lost,
  goals_for, goals_against, points, provider_updated_at)
values
  (pg_temp.id('c0', 2), pg_temp.id('c0', 3), pg_temp.id('c1', 1), 1, 3, 2, 1, 0, 5, 2, 7, '2026-10-01 00:00Z'),
  (pg_temp.id('c0', 2), pg_temp.id('c0', 3), pg_temp.id('c1', 2), 2, 3, 2, 0, 1, 4, 3, 6, '2026-10-01 00:00Z'),
  (pg_temp.id('c0', 2), pg_temp.id('c0', 3), pg_temp.id('c1', 3), 3, 3, 0, 1, 2, 1, 5, 1, '2026-10-01 00:00Z');

-- 1 privileges
select extensions.ok(not has_function_privilege('anon', 'api.service_apply_sofascore_standings(text,jsonb,timestamptz)', 'execute'), '1.1 not callable by visitors');
select extensions.ok(not has_function_privilege('authenticated', 'api.service_apply_sofascore_standings(text,jsonb,timestamptz)', 'execute'), '1.2 not callable by signed-in users');
select extensions.ok(has_function_privilege('service_role', 'api.service_apply_sofascore_standings(text,jsonb,timestamptz)', 'execute'), '1.3 callable by the service role');

-- The calls run as the test owner with service-role claims: service_role has
-- no read on schema app, so the reads that follow could not run as it. Its
-- execute grant is asserted in section 1.
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- 2 two clubs swap places in one call: legal, both written
select extensions.is(
  (api.service_apply_sofascore_standings('990001', jsonb_build_array(
    jsonb_build_object('teamExternalId', '7002', 'rank', 1, 'played', 4, 'won', 3, 'drawn', 0, 'lost', 1, 'goalsFor', 6, 'goalsAgainst', 3, 'points', 9),
    jsonb_build_object('teamExternalId', '7001', 'rank', 2, 'played', 4, 'won', 2, 'drawn', 2, 'lost', 0, 'goalsFor', 5, 'goalsAgainst', 2, 'points', 8),
    jsonb_build_object('teamExternalId', '7003', 'rank', 3, 'played', 4, 'won', 0, 'drawn', 1, 'lost', 3, 'goalsFor', 1, 'goalsAgainst', 7, 'points', 1)
  ), '2026-10-10 12:00Z') ->> 'updated')::integer,
  3, '2.1 three rows updated');
select extensions.is(
  (select rank from app.standings where team_id = pg_temp.id('c1', 2)), 1, '2.2 the clubs swapped places');
select extensions.is(
  (select points from app.standings where team_id = pg_temp.id('c1', 2)), 9, '2.3 and the new figures are stored');

-- 3 a missing figure is skipped, never written as 0
select extensions.is(
  api.service_apply_sofascore_standings('990001', jsonb_build_array(
    jsonb_build_object('teamExternalId', '7003', 'rank', 3, 'played', 5, 'won', 0, 'drawn', 1, 'lost', 4, 'goalsFor', 1, 'goalsAgainst', 9)
  ), '2026-10-11 12:00Z') -> 'skippedIncomplete',
  '["7003"]'::jsonb, '3.1 a row without points is skipped and reported');
select extensions.is(
  (select points from app.standings where team_id = pg_temp.id('c1', 3)), 1, '3.2 its stored points are untouched, not 0');
select extensions.is(
  (select played from app.standings where team_id = pg_temp.id('c1', 3)), 4, '3.3 so is the rest of its row');

-- 4 a club with no SofaScore mapping is skipped, not matched by name
select extensions.is(
  api.service_apply_sofascore_standings('990001', jsonb_build_array(
    jsonb_build_object('teamExternalId', '7999', 'rank', 4, 'played', 1, 'won', 1, 'drawn', 0, 'lost', 0, 'goalsFor', 1, 'goalsAgainst', 0, 'points', 3)
  ), '2026-10-12 12:00Z') -> 'skippedUnmapped',
  '["7999"]'::jsonb, '4.1 an unmapped club is reported');
select extensions.is(
  (select count(*)::integer from app.standings where season_id = pg_temp.id('c0', 3)), 3, '4.2 and no row is created for it');

-- 5 an older table never replaces a newer one
select extensions.throws_ok(
  $$select api.service_apply_sofascore_standings('990001', jsonb_build_array(
    jsonb_build_object('teamExternalId', '7001', 'rank', 1, 'played', 1, 'won', 1, 'drawn', 0, 'lost', 0, 'goalsFor', 1, 'goalsAgainst', 0, 'points', 3)
  ), '2026-09-01 00:00Z')$$,
  'P0001', 'STALE_UPDATE', '5.1 a stale table is refused');

-- 6 the same table again changes nothing
select extensions.is(
  (api.service_apply_sofascore_standings('990001', jsonb_build_array(
    jsonb_build_object('teamExternalId', '7002', 'rank', 1, 'played', 4, 'won', 3, 'drawn', 0, 'lost', 1, 'goalsFor', 6, 'goalsAgainst', 3, 'points', 9)
  ), '2026-10-13 12:00Z') ->> 'unchanged')::integer,
  1, '6.1 an identical row is counted unchanged');
select extensions.is(
  (select provider_updated_at from app.standings where team_id = pg_temp.id('c1', 2)),
  '2026-10-10 12:00Z'::timestamptz, '6.2 and its provider time is not moved');

select * from extensions.finish();
rollback;
