-- BG-0073 -- api.fantasy_overall_standings.
--
-- The season-wide board reads the `league_id is null` rows that
-- api.service_recalculate_fantasy_rankings already writes. These assertions
-- pin the four things a later change could silently break:
--
--   1. scope   -- league rows and other seasons never leak into the board;
--   2. paging  -- the keyset cursor walks (rank, fantasy_team_id) exactly once;
--   3. identity-- myRank resolves for the owning manager and is null for anon,
--                 and display_name never reaches an anonymous caller;
--   4. status  -- PT404 for a foreign season, PT400 for a bad page size, and a
--                 plain empty page (never an error) when nothing is ranked yet.
begin;

select extensions.no_plan();

insert into app.countries (id, iso_alpha2, iso_alpha3) values
  ('c0000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('c1000000-0000-4000-8000-000000000001', 'overall-standings-test',
  'Overall Standings Test', 'OST', 'league', 'c0000000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values
  ('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
    '2089/90', '2089-08-01', '2090-06-30', 'active', true),
  ('c2000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001',
    '2090/91', '2090-08-01', '2091-06-30', 'scheduled', false);
insert into app.rounds (id, season_id, round_number, name, status) values
  ('c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
    1, 'Gameweek 1', 'completed'),
  ('c3000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001',
    2, 'Gameweek 2', 'active');

insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('c6000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
  'overall-standings-test', 'Overall Standings Test', true);

-- Two fantasy seasons: the board must never mix them.
insert into app.fantasy_seasons (
  id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at
) values
  ('c6300000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000100',
    '2089/90', 'active', '2089-08-01', '2090-06-30'),
  ('c6300000-0000-4000-8000-000000000002', 'c6000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000002', 'f6100000-0000-4000-8000-000000000100',
    '2090/91', 'draft', '2090-08-01', '2091-06-30');

insert into app.fantasy_gameweeks (
  id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status
) values
  ('c6400000-0000-4000-8000-000000000001', 'c6300000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001', 1, 'Gameweek 1',
    '2090-01-01T11:00:00Z', '2090-01-01T12:00:00Z', '2090-01-08T12:00:00Z', 'finalized'),
  ('c6400000-0000-4000-8000-000000000002', 'c6300000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000002', 2, 'Gameweek 2',
    '2090-01-08T11:00:00Z', '2090-01-08T12:00:00Z', '2090-01-15T12:00:00Z', 'finalized');

insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select ('c8000000-0000-4000-8000-00000000000' || i)::uuid,
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'overall-' || i || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'overall_' || i), statement_timestamp(), statement_timestamp()
from generate_series(1, 4) i;

-- The identity trigger creates one app.profiles row per auth.users row. Give
-- manager 1 a display name and manager 2 a blank one (the only blank the
-- profiles_display_name_check constraint permits) so both the happy path and
-- the team-name fallback are exercised.
update app.profiles set display_name = 'Manager One'
where id = 'c8000000-0000-4000-8000-000000000001';
update app.profiles set display_name = ''
where id = 'c8000000-0000-4000-8000-000000000002';
update app.profiles set display_name = 'Manager Three'
where id = 'c8000000-0000-4000-8000-000000000003';
update app.profiles set display_name = 'Manager Four'
where id = 'c8000000-0000-4000-8000-000000000004';

insert into app.fantasy_teams (
  id, user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value,
  free_transfers, status
) values
  ('c9000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001',
    'c6300000-0000-4000-8000-000000000001', 'c6400000-0000-4000-8000-000000000002',
    'Atlas Eleven', 0, 100, 1, 'active'),
  ('c9000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000002',
    'c6300000-0000-4000-8000-000000000001', 'c6400000-0000-4000-8000-000000000002',
    'Nameless FC', 0, 100, 1, 'active'),
  ('c9000000-0000-4000-8000-000000000003', 'c8000000-0000-4000-8000-000000000003',
    'c6300000-0000-4000-8000-000000000001', 'c6400000-0000-4000-8000-000000000002',
    'Rif Rovers', 0, 100, 1, 'active'),
  ('c9000000-0000-4000-8000-000000000004', 'c8000000-0000-4000-8000-000000000004',
    'c6300000-0000-4000-8000-000000000001', 'c6400000-0000-4000-8000-000000000002',
    'Souss United', 0, 100, 1, 'active');

insert into app.fantasy_leagues (
  id, fantasy_season_id, owner_user_id, name, visibility, member_count, active
) values ('ca000000-0000-4000-8000-000000000001', 'c6300000-0000-4000-8000-000000000001',
  'c8000000-0000-4000-8000-000000000001', 'Scoped League', 'public', 2, true);

-- Nothing is ranked yet: the empty page is the primary case, not an edge case.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.is(
  api.fantasy_overall_standings('c6300000-0000-4000-8000-000000000001') -> 'items',
  '[]'::jsonb,
  'an unranked season returns an empty item list to an anonymous caller'
);
select extensions.is(
  (api.fantasy_overall_standings('c6300000-0000-4000-8000-000000000001') ->> 'total')::integer,
  0, 'an unranked season reports a zero total rather than raising'
);
select extensions.is(
  api.fantasy_overall_standings('c6300000-0000-4000-8000-000000000001') -> 'myRank',
  'null'::jsonb, 'an unranked season has no myRank'
);
select extensions.is(
  api.fantasy_overall_standings('c6300000-0000-4000-8000-000000000001') -> 'nextCursor',
  'null'::jsonb, 'an unranked season advertises no cursor'
);
reset role;

-- Two gameweeks of overall rows (league_id is null) plus the season cumulative
-- rows, and one league's rows that must never appear on the overall board.
insert into app.fantasy_rankings (
  fantasy_season_id, gameweek_id, league_id, fantasy_team_id, rank, previous_rank,
  total_points, gameweek_points, transfer_hits, calculation_version, calculated_at
) values
  -- season cumulative, overall
  ('c6300000-0000-4000-8000-000000000001', null, null,
    'c9000000-0000-4000-8000-000000000001', 1, 2, 120, 60, 0, 1, '2090-01-15T13:00:00Z'),
  ('c6300000-0000-4000-8000-000000000001', null, null,
    'c9000000-0000-4000-8000-000000000002', 2, 1, 110, 50, 0, 1, '2090-01-15T13:00:00Z'),
  ('c6300000-0000-4000-8000-000000000001', null, null,
    'c9000000-0000-4000-8000-000000000003', 3, 3, 100, 40, 4, 1, '2090-01-15T13:00:00Z'),
  ('c6300000-0000-4000-8000-000000000001', null, null,
    'c9000000-0000-4000-8000-000000000004', 4, 4, 90, 30, 0, 1, '2090-01-15T13:00:00Z'),
  -- gameweek 1, overall
  ('c6300000-0000-4000-8000-000000000001', 'c6400000-0000-4000-8000-000000000001', null,
    'c9000000-0000-4000-8000-000000000004', 1, null, 60, 60, 0, 1, '2090-01-08T13:00:00Z'),
  ('c6300000-0000-4000-8000-000000000001', 'c6400000-0000-4000-8000-000000000001', null,
    'c9000000-0000-4000-8000-000000000003', 2, null, 60, 60, 0, 1, '2090-01-08T13:00:00Z'),
  -- gameweek 2, overall
  ('c6300000-0000-4000-8000-000000000001', 'c6400000-0000-4000-8000-000000000002', null,
    'c9000000-0000-4000-8000-000000000001', 1, 3, 120, 60, 0, 1, '2090-01-15T13:00:00Z'),
  ('c6300000-0000-4000-8000-000000000001', 'c6400000-0000-4000-8000-000000000002', null,
    'c9000000-0000-4000-8000-000000000002', 2, 4, 110, 50, 0, 1, '2090-01-15T13:00:00Z'),
  -- one league's own board: never part of the overall board
  ('c6300000-0000-4000-8000-000000000001', null, 'ca000000-0000-4000-8000-000000000001',
    'c9000000-0000-4000-8000-000000000003', 1, 1, 100, 40, 4, 1, '2090-01-15T13:00:00Z'),
  ('c6300000-0000-4000-8000-000000000001', null, 'ca000000-0000-4000-8000-000000000001',
    'c9000000-0000-4000-8000-000000000004', 2, 2, 90, 30, 0, 1, '2090-01-15T13:00:00Z'),
  -- another season entirely
  ('c6300000-0000-4000-8000-000000000002', null, null,
    'c9000000-0000-4000-8000-000000000001', 1, 1, 999, 99, 0, 1, '2090-08-15T13:00:00Z');

-- Scope: only the four `league_id is null` cumulative rows of this season.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.is(
  (api.fantasy_overall_standings('c6300000-0000-4000-8000-000000000001') ->> 'total')::integer,
  4, 'the overall board counts only league_id is null rows of the requested season'
);
select extensions.is(
  (select jsonb_agg(item ->> 'teamId' order by (item ->> 'rank')::bigint)
   from jsonb_array_elements(
     api.fantasy_overall_standings('c6300000-0000-4000-8000-000000000001') -> 'items') item),
  jsonb_build_array(
    'c9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000002',
    'c9000000-0000-4000-8000-000000000003', 'c9000000-0000-4000-8000-000000000004'),
  'the default page is the season cumulative board ordered by rank'
);
select extensions.is(
  api.fantasy_overall_standings('c6300000-0000-4000-8000-000000000001') -> 'gameweekId',
  'null'::jsonb,
  'a null p_gameweek_id resolves to the season cumulative rows, mirroring api.fantasy_league_standings'
);

-- display_name must not reach an anonymous caller: every managerName is the
-- team name for anon.
select extensions.is(
  (select count(*)::integer from jsonb_array_elements(
     api.fantasy_overall_standings('c6300000-0000-4000-8000-000000000001') -> 'items') item
   where item ->> 'managerName' = item ->> 'teamName'),
  4, 'an anonymous caller only ever sees fantasy team names as managerName'
);
select extensions.is(
  (select count(*)::integer from jsonb_array_elements(
     api.fantasy_overall_standings('c6300000-0000-4000-8000-000000000001') -> 'items') item
   where item ->> 'managerName' = 'Manager One'),
  0, 'app.profiles.display_name is never exposed to anon'
);
select extensions.is(
  api.fantasy_overall_standings('c6300000-0000-4000-8000-000000000001') -> 'myRank',
  'null'::jsonb, 'an anonymous caller has no myRank'
);

-- Keyset pagination by (rank, fantasy_team_id).
select set_config('test.overall_page_one',
  api.fantasy_overall_standings('c6300000-0000-4000-8000-000000000001', null, null, null, 2)::text,
  true);
select extensions.is(
  jsonb_array_length(current_setting('test.overall_page_one')::jsonb -> 'items'), 2,
  'p_limit bounds the page'
);
select extensions.is(
  (current_setting('test.overall_page_one')::jsonb -> 'nextCursor' ->> 'rank')::bigint, 2::bigint,
  'the cursor carries the last rank of the page'
);
select extensions.is(
  current_setting('test.overall_page_one')::jsonb -> 'nextCursor' ->> 'teamId',
  'c9000000-0000-4000-8000-000000000002',
  'the cursor carries the last team id of the page'
);
select set_config('test.overall_page_two', api.fantasy_overall_standings(
  'c6300000-0000-4000-8000-000000000001', null, 2, 'c9000000-0000-4000-8000-000000000002', 2
)::text, true);
select extensions.is(
  (select jsonb_agg(item ->> 'teamId' order by (item ->> 'rank')::bigint)
   from jsonb_array_elements(current_setting('test.overall_page_two')::jsonb -> 'items') item),
  jsonb_build_array(
    'c9000000-0000-4000-8000-000000000003', 'c9000000-0000-4000-8000-000000000004'),
  'the second page continues after the cursor without repeating a row'
);
select extensions.is(
  current_setting('test.overall_page_two')::jsonb -> 'nextCursor', 'null'::jsonb,
  'the last page advertises no cursor'
);

-- An explicit gameweek reads that gameweek's overall rows only.
select extensions.is(
  (api.fantasy_overall_standings(
     'c6300000-0000-4000-8000-000000000001', 'c6400000-0000-4000-8000-000000000001'
   ) ->> 'total')::integer,
  2, 'an explicit gameweek reads only that gameweek overall rows'
);
select extensions.is(
  api.fantasy_overall_standings(
    'c6300000-0000-4000-8000-000000000001', 'c6400000-0000-4000-8000-000000000001'
  ) -> 'items' -> 0 ->> 'teamId',
  'c9000000-0000-4000-8000-000000000004',
  'a gameweek board is ordered by that gameweek rank, not the season rank'
);

-- Foreign / unknown ids are 404, bad page sizes are 400.
select extensions.throws_ok(
  $$select api.fantasy_overall_standings('c6300000-0000-4000-8000-0000000000ff')$$,
  'PT404', 'fantasy_season_not_found', 'an unknown season id raises PT404');
select extensions.throws_ok(
  $$select api.fantasy_overall_standings(
      'c6300000-0000-4000-8000-000000000002', 'c6400000-0000-4000-8000-000000000001')$$,
  'PT404', 'fantasy_gameweek_not_found',
  'a gameweek belonging to another season raises PT404');
select extensions.throws_ok(
  $$select api.fantasy_overall_standings(
      'c6300000-0000-4000-8000-000000000001', null, null, null, 999)$$,
  'PT400', 'validation_failed', 'p_limit above 100 raises PT400');
select extensions.throws_ok(
  $$select api.fantasy_overall_standings(
      'c6300000-0000-4000-8000-000000000001', null, null, null, 0)$$,
  'PT400', 'validation_failed', 'p_limit below 1 raises PT400');
select extensions.throws_ok(
  $$select api.fantasy_overall_standings(
      'c6300000-0000-4000-8000-000000000001', null, 2, null, 50)$$,
  'PT400', 'validation_failed', 'half a cursor raises PT400');
reset role;

-- myRank resolves for the owning manager, from their own profile.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c8000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select extensions.is(
  (api.fantasy_overall_standings('c6300000-0000-4000-8000-000000000001') -> 'myRank' ->> 'rank')::bigint,
  3::bigint, 'myRank resolves to the signed-in manager active team standing'
);
select extensions.is(
  api.fantasy_overall_standings('c6300000-0000-4000-8000-000000000001') -> 'myRank' ->> 'teamId',
  'c9000000-0000-4000-8000-000000000003', 'myRank identifies the caller own team'
);
select extensions.is(
  api.fantasy_overall_standings('c6300000-0000-4000-8000-000000000001') -> 'myRank' ->> 'managerName',
  'Manager Three', 'a signed-in caller sees the profile display name');
select extensions.is(
  (select item ->> 'managerName' from jsonb_array_elements(
     api.fantasy_overall_standings('c6300000-0000-4000-8000-000000000001') -> 'items') item
   where item ->> 'teamId' = 'c9000000-0000-4000-8000-000000000002'),
  'Nameless FC',
  'a blank display name falls back to the fantasy team name for signed-in callers'
);
select extensions.is(
  (select item ->> 'managerName' from jsonb_array_elements(
     api.fantasy_overall_standings('c6300000-0000-4000-8000-000000000001') -> 'items') item
   where item ->> 'teamId' = 'c9000000-0000-4000-8000-000000000001'),
  'Manager One', 'a signed-in caller sees other managers display names'
);
reset role;

-- A manager whose team is no longer active has no myRank.
update app.fantasy_teams set status = 'archived'
where id = 'c9000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c8000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select extensions.is(
  api.fantasy_overall_standings('c6300000-0000-4000-8000-000000000001') -> 'myRank',
  'null'::jsonb, 'an inactive team yields no myRank'
);
reset role;

-- Declared surface: the function is stable, security definer, search_path
-- pinned, and callable by exactly anon, authenticated and service_role.
select extensions.is(
  (select provolatile::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'api' and p.proname = 'fantasy_overall_standings'),
  's', 'api.fantasy_overall_standings is stable'
);
select extensions.ok(
  (select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'api' and p.proname = 'fantasy_overall_standings'),
  'api.fantasy_overall_standings is security definer'
);
select extensions.ok(
  (select 'search_path=""' = any(p.proconfig) from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'api' and p.proname = 'fantasy_overall_standings'),
  'api.fantasy_overall_standings pins an empty search_path'
);
select extensions.ok(
  has_function_privilege('anon', 'api.fantasy_overall_standings(uuid, uuid, bigint, uuid, integer)',
    'execute'), 'anon may execute the overall standings reader');
select extensions.ok(
  has_function_privilege('authenticated',
    'api.fantasy_overall_standings(uuid, uuid, bigint, uuid, integer)', 'execute'),
  'authenticated may execute the overall standings reader');
select extensions.ok(
  not has_function_privilege('public',
    'api.fantasy_overall_standings(uuid, uuid, bigint, uuid, integer)', 'execute'),
  'PUBLIC holds no execute privilege on the overall standings reader');

-- BG-0063 guard: every parameter type lives in pg_catalog, so no caller needs
-- USAGE on schema `app` to coerce an argument, and anon still does not hold it.
select extensions.is(
  (select count(*)::integer
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   cross join lateral unnest(p.proargtypes::oid[]) as argument_type
   join pg_type t on t.oid = argument_type
   join pg_namespace tn on tn.oid = t.typnamespace
   where n.nspname = 'api' and p.proname = 'fantasy_overall_standings'
     and tn.nspname <> 'pg_catalog'),
  0, 'no parameter names an app-schema type (BG-0063 coercion trap)'
);
select extensions.ok(
  not has_schema_privilege('anon', 'app', 'usage'),
  'anon still holds no USAGE on schema app'
);

-- RLS on the underlying tables is unchanged: anon reads nothing directly.
select extensions.ok(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'app' and c.relname = 'fantasy_rankings'),
  'app.fantasy_rankings still enforces row level security'
);
select extensions.ok(
  not has_table_privilege('anon', 'app.fantasy_rankings', 'select'),
  'anon holds no direct select on app.fantasy_rankings'
);
select extensions.ok(
  not has_table_privilege('anon', 'app.profiles', 'select'),
  'anon holds no direct select on app.profiles'
);

select * from extensions.finish();

rollback;
