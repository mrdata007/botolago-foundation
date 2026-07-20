begin;

select extensions.no_plan();

insert into app.competitions (id, slug, name, short_name, competition_type)
values (
  '32000000-0000-4000-8000-000000000001',
  'rls-football', 'RLS Football', 'RLS', 'league'
);
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (
  '42000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001',
  '2029/30', '2029-08-01', '2030-06-30', 'active', true
);
insert into app.teams (id, slug, name, short_name)
values
  ('62000000-0000-4000-8000-000000000001', 'rls-home', 'RLS Home', 'RH'),
  ('62000000-0000-4000-8000-000000000002', 'rls-away', 'RLS Away', 'RA');
insert into app.fixtures (
  id, competition_id, season_id, home_team_id, away_team_id,
  kickoff_at, status, period, minute, home_score, away_score,
  provider_updated_at, source_sequence
) values (
  '92000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000002',
  '2030-01-02T20:00:00Z', 'live_second_half', 'second_half', 70, 2, 1,
  '2030-01-02T21:30:00Z', 3
);

select extensions.ok(
  not has_table_privilege('anon', 'app.fixtures', 'select'),
  'anonymous has no direct canonical fixture privilege'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'app.fixtures', 'select'),
  'authenticated has no direct canonical fixture privilege'
);
select extensions.ok(
  not has_table_privilege('service_role', 'app.fixtures', 'insert'),
  'service role has no direct canonical write grant'
);
select extensions.ok(
  not has_table_privilege('anon', 'app_private.football_provider_mappings', 'select'),
  'anonymous has no private mapping access'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'app_private.football_ingestion_runs', 'select'),
  'authenticated has no ingestion operations access'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.is(
  jsonb_array_length(api.football_live_matches(10, 'fr')),
  1,
  'anonymous can read the bounded public live-match RPC'
);
select extensions.is(
  (select count(*)::integer from api.live_fixture_updates),
  1,
  'anonymous can read the sanitized Realtime projection'
);
select extensions.is(
  api.football_match_detail('92000000-0000-4000-8000-000000000001', 'fr') ->> 'status',
  'live_second_half',
  'anonymous match detail exposes only normalized status'
);
select extensions.throws_ok(
  $$select * from app.fixtures$$,
  '42501',
  null,
  'anonymous cannot read canonical fixtures directly'
);
select extensions.throws_ok(
  $$insert into api.live_fixture_updates (
      fixture_id, kickoff_at, status, provider_updated_at, source_sequence
    ) values (
      gen_random_uuid(), statement_timestamp(), 'delayed', statement_timestamp(), 1
    )$$,
  '42501',
  null,
  'anonymous cannot forge live projection rows'
);
select extensions.throws_ok(
  $$select api.begin_football_ingestion('fixture', 'fixtures')$$,
  '42501',
  null,
  'anonymous cannot execute trusted ingestion RPCs'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select extensions.is(
  jsonb_array_length(api.football_live_matches(10, 'ar')),
  1,
  'authenticated users receive the same safe public Football read model'
);
select extensions.throws_ok(
  $$update app.fixtures set home_score = 99
    where id = '92000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'authenticated browser cannot modify canonical scores'
);
select extensions.throws_ok(
  $$select * from app_private.football_ingestion_runs$$,
  '42501',
  null,
  'authenticated browser cannot inspect operational ingestion data'
);
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.ok(
  api.begin_football_ingestion('fixture', 'fixtures') is not null,
  'trusted service role can begin a tracked ingestion run through its RPC'
);
select extensions.throws_ok(
  $$insert into app.fixtures (
      competition_id, season_id, home_team_id, away_team_id,
      kickoff_at, provider_updated_at
    ) values (
      '32000000-0000-4000-8000-000000000001',
      '42000000-0000-4000-8000-000000000001',
      '62000000-0000-4000-8000-000000000001',
      '62000000-0000-4000-8000-000000000002',
      statement_timestamp(), statement_timestamp()
    )$$,
  '42501',
  null,
  'service role remains isolated from direct canonical table writes'
);
reset role;

select extensions.ok(
  exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'api'
      and tablename = 'live_fixture_updates'
  ),
  'only the sanitized live projection is published for Realtime'
);
select extensions.ok(
  not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'app'
  ),
  'no canonical app table is published for Realtime'
);

select * from extensions.finish();
rollback;
