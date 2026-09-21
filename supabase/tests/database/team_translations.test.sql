begin;

select extensions.no_plan();

-- BG-0068. app.team_translations is the club-name half of the translation
-- model that was specified and never built. This file pins the three things
-- that can silently rot: the table's security posture, the fallback
-- (a missing Arabic name must yield the Latin one, never null and never an
-- error), and the row ordering of the reads that now join it.

-- ---------------------------------------------------------------------------
-- Security posture: identical to app.competition_translations
-- ---------------------------------------------------------------------------

select extensions.ok(
  (select relrowsecurity and relforcerowsecurity
     from pg_class relation
     join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'app' and relation.relname = 'team_translations'),
  'team_translations enables and forces row level security'
);

select extensions.ok(
  not exists (
    select 1 from pg_policy
    where polrelid = 'app.team_translations'::regclass
  ),
  'team_translations has no browser policies, like competition_translations'
);

-- Forced RLS with zero policies only denies the browser if the browser also
-- holds no direct object grant. Assert both halves, for every browser role.
select extensions.ok(
  not exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'app'
      and table_name = 'team_translations'
      and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
  ),
  'no browser or service role holds a direct grant on team_translations'
);

-- The BG-0063 trap: an argument is coerced to its parameter type in the
-- CALLER's context, so an app-schema enum in a public signature would force
-- anon to hold USAGE on app. app.language_code must stay inside function
-- bodies.
select extensions.ok(
  not has_schema_privilege('anon', 'app', 'usage'),
  'anon still holds no USAGE on the app schema'
);
select extensions.ok(
  not exists (
    select 1
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'api'
      and 'app.language_code'::regtype::oid = any(procedure.proargtypes)
  ),
  'no api function names app.language_code in its argument list'
);

select extensions.ok(
  not has_function_privilege('anon', 'app_private.football_team_json(uuid,text)', 'execute'),
  'anon cannot call the team DTO helper directly'
);

-- Public routes: /matches, /fantasy/players, /fantasy/rankings and /news are
-- all reachable logged out, so their reads stay anon-callable.
select extensions.ok(
  has_function_privilege('anon', 'api.football_team_catalog(text,integer)', 'execute'),
  'anon can still call football_team_catalog'
);
select extensions.ok(
  has_function_privilege('anon', 'api.football_match_detail(uuid,text)', 'execute'),
  'anon can still call football_match_detail'
);
select extensions.ok(
  has_function_privilege(
    'anon',
    'api.fantasy_player_pool(uuid,text,uuid,numeric,text,numeric,uuid,integer)',
    'execute'
  ),
  'anon can still call fantasy_player_pool'
);

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
-- Three clubs. Alpha and Charlie get Arabic names; Bravo deliberately does
-- not, so the fallback is exercised by a real row rather than by an empty
-- table. Latin names are chosen so that alphabetical order (Alpha, Bravo,
-- Charlie) differs from the Arabic collation order of the translations --
-- if ordering ever started following the translation, the catalog assertion
-- below would flip.

insert into app.countries (id, iso_alpha2, iso_alpha3, flag_emoji)
values ('11000000-0000-4000-8000-000000000001', 'MA', 'MAR', '🇲🇦');
insert into app.competitions (
  id, slug, name, short_name, competition_type, country_id, display_order
) values (
  '31000000-0000-4000-8000-000000000001', 'botola-bg0068',
  'Botola BG0068', 'BG', 'league', '11000000-0000-4000-8000-000000000001', 1
);
insert into app.seasons (
  id, competition_id, label, starts_on, ends_on, status, is_current
) values (
  '41000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '2031/32', '2031-08-01', '2032-06-30', 'active', true
);
insert into app.teams (
  id, slug, name, short_name, code, country_id, city, primary_color
) values
  (
    '61000000-0000-4000-8000-000000000001', 'alpha-bg0068', 'Alpha BG0068',
    'ALPHA', 'ALP', '11000000-0000-4000-8000-000000000001', 'Casablanca', '#112233'
  ),
  (
    '61000000-0000-4000-8000-000000000002', 'bravo-bg0068', 'Bravo BG0068',
    'BRAVO', 'BRV', '11000000-0000-4000-8000-000000000001', 'Rabat', '#334455'
  ),
  (
    '61000000-0000-4000-8000-000000000003', 'charlie-bg0068', 'Charlie BG0068',
    'CHARLIE', 'CHA', '11000000-0000-4000-8000-000000000001', 'Fès', '#556677'
  );

insert into app.team_translations (team_id, language, name, short_name)
values
  ('61000000-0000-4000-8000-000000000001', 'ar', 'ألفا', 'ألف'),
  ('61000000-0000-4000-8000-000000000003', 'ar', 'شارلي', 'شين');

-- ---------------------------------------------------------------------------
-- The helper: translate, fall back, leave French alone
-- ---------------------------------------------------------------------------

select extensions.is(
  app_private.football_team_json('61000000-0000-4000-8000-000000000001', 'ar') ->> 'name',
  'ألفا',
  'a team with an ar translation returns the Arabic name'
);
select extensions.is(
  app_private.football_team_json('61000000-0000-4000-8000-000000000001', 'ar') ->> 'shortName',
  'ألف',
  'a team with an ar translation returns the Arabic short name'
);
select extensions.is(
  app_private.football_team_json('61000000-0000-4000-8000-000000000002', 'ar') ->> 'name',
  'Bravo BG0068',
  'a team without an ar translation falls back to the Latin name'
);
select extensions.is(
  app_private.football_team_json('61000000-0000-4000-8000-000000000002', 'ar') ->> 'shortName',
  'BRAVO',
  'a team without an ar translation falls back to the Latin short name'
);
select extensions.is(
  app_private.football_team_json('61000000-0000-4000-8000-000000000001', 'fr') ->> 'name',
  'Alpha BG0068',
  'fr is unaffected: an ar-only translation never leaks into French'
);
select extensions.is(
  app_private.football_team_json('61000000-0000-4000-8000-000000000001', 'fr') ->> 'shortName',
  'ALPHA',
  'fr short name is unaffected'
);

-- Everything else the DTO carries must be untouched by the new join.
select extensions.is(
  app_private.football_team_json('61000000-0000-4000-8000-000000000001', 'ar') - 'name' - 'shortName',
  app_private.football_team_json('61000000-0000-4000-8000-000000000001', 'fr') - 'name' - 'shortName',
  'only name and shortName differ between the two languages'
);

-- A LEFT JOIN on a composite primary key cannot fan out, but assert it rather
-- than reason about it: a duplicated team row in the catalog would be invisible
-- in French and fatal in Arabic.
select extensions.is(
  (select count(*)::integer
     from app.team_translations
    where team_id = '61000000-0000-4000-8000-000000000001'
      and language = 'ar'),
  1,
  'the translation join key is unique per team and language'
);

-- ---------------------------------------------------------------------------
-- Ordering is pinned to the Latin name, in both languages
-- ---------------------------------------------------------------------------
-- api.football_team_catalog orders by app.teams.name. The translation must not
-- reorder it, or French and Arabic would paginate differently against the same
-- cursor.

select extensions.is(
  (select jsonb_agg(entry ->> 'name')
     from jsonb_array_elements(api.football_team_catalog('fr', 100)) entry
    where entry ->> 'slug' like '%-bg0068'),
  '["Alpha BG0068", "Bravo BG0068", "Charlie BG0068"]'::jsonb,
  'French catalog is ordered by the Latin name'
);
select extensions.is(
  (select jsonb_agg(entry ->> 'slug')
     from jsonb_array_elements(api.football_team_catalog('ar', 100)) entry
    where entry ->> 'slug' like '%-bg0068'),
  (select jsonb_agg(entry ->> 'slug')
     from jsonb_array_elements(api.football_team_catalog('fr', 100)) entry
    where entry ->> 'slug' like '%-bg0068'),
  'Arabic catalog returns the same teams in the same order as French'
);
select extensions.is(
  (select jsonb_agg(entry ->> 'name')
     from jsonb_array_elements(api.football_team_catalog('ar', 100)) entry
    where entry ->> 'slug' like '%-bg0068'),
  '["ألفا", "Bravo BG0068", "شارلي"]'::jsonb,
  'Arabic catalog translates in place, untranslated clubs keeping Latin'
);

-- api.football_team_summary: same helper, PT404 posture unchanged.
select extensions.is(
  api.football_team_summary('61000000-0000-4000-8000-000000000003', 'ar') ->> 'name',
  'شارلي',
  'football_team_summary returns the Arabic name'
);
select extensions.throws_ok(
  $$select api.football_team_summary('61000000-0000-4000-8000-0000000000ff', 'ar')$$,
  'P0002',
  null,
  'football_team_summary still raises for an unknown team'
);
select extensions.throws_ok(
  $$select api.football_team_summary('61000000-0000-4000-8000-000000000001', 'es')$$,
  '22023',
  null,
  'an unsupported language is still rejected'
);

-- ---------------------------------------------------------------------------
-- Standings ordering
-- ---------------------------------------------------------------------------
-- api.football_standings orders by rank, then team_id. Ranks are seeded
-- against the reverse of alphabetical order so that a translation-driven sort
-- could not accidentally agree with the expected result.

-- goal_difference is a generated column; it is deliberately not written here.
insert into app.standings (
  id, season_id, competition_id, team_id, table_type, group_key, rank,
  played, won, drawn, lost, goals_for, goals_against, points, provider_updated_at
) values
  (
    '91000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000003',
    'overall', '', 1, 10, 8, 1, 1, 20, 8, 25, '2031-12-01T12:00:00Z'
  ),
  (
    '91000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000002',
    'overall', '', 2, 10, 6, 2, 2, 15, 10, 20, '2031-12-01T12:00:00Z'
  ),
  (
    '91000000-0000-4000-8000-000000000003', '41000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001',
    'overall', '', 3, 10, 5, 2, 3, 14, 12, 17, '2031-12-01T12:00:00Z'
  );

select extensions.is(
  (select jsonb_agg(entry -> 'team' ->> 'slug')
     from jsonb_array_elements(
       api.football_standings('41000000-0000-4000-8000-000000000001', '', 'overall', 'ar')
     ) entry),
  '["charlie-bg0068", "bravo-bg0068", "alpha-bg0068"]'::jsonb,
  'Arabic standings keep the rank ordering, not a name ordering'
);
select extensions.is(
  (select jsonb_agg(entry -> 'team' ->> 'name')
     from jsonb_array_elements(
       api.football_standings('41000000-0000-4000-8000-000000000001', '', 'overall', 'ar')
     ) entry),
  '["شارلي", "Bravo BG0068", "ألفا"]'::jsonb,
  'Arabic standings carry translated club names with Latin fallback'
);
select extensions.is(
  (select jsonb_agg(entry -> 'team' ->> 'name')
     from jsonb_array_elements(
       api.football_standings('41000000-0000-4000-8000-000000000001', '', 'overall', 'fr')
     ) entry),
  '["Charlie BG0068", "Bravo BG0068", "Alpha BG0068"]'::jsonb,
  'French standings are unchanged'
);

-- ---------------------------------------------------------------------------
-- Match detail
-- ---------------------------------------------------------------------------

insert into app.fixtures (
  id, competition_id, season_id, home_team_id, away_team_id, kickoff_at, status,
  provider_updated_at
) values (
  'a1000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000002',
  '2031-09-01T18:00:00Z', 'scheduled', '2031-08-01T12:00:00Z'
);

select extensions.is(
  api.football_match_detail('a1000000-0000-4000-8000-000000000001', 'ar')
    -> 'homeTeam' ->> 'name',
  'ألفا',
  'match detail translates the home club'
);
select extensions.is(
  api.football_match_detail('a1000000-0000-4000-8000-000000000001', 'ar')
    -> 'awayTeam' ->> 'name',
  'Bravo BG0068',
  'match detail falls back for an untranslated away club'
);
select extensions.is(
  api.football_match_detail('a1000000-0000-4000-8000-000000000001', 'fr')
    -> 'homeTeam' ->> 'name',
  'Alpha BG0068',
  'French match detail is unchanged'
);

-- ---------------------------------------------------------------------------
-- Constraints
-- ---------------------------------------------------------------------------

select extensions.throws_ok(
  $$insert into app.team_translations (team_id, language, name)
    values ('61000000-0000-4000-8000-000000000002', 'ar', '  ')$$,
  '23514',
  null,
  'a blank translated name is rejected'
);
select extensions.throws_ok(
  $$insert into app.team_translations (team_id, language, name)
    values ('61000000-0000-4000-8000-000000000001', 'ar', 'Duplicate')$$,
  '23505',
  null,
  'one translation per team per language'
);

rollback;
