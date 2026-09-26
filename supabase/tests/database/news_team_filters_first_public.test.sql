-- supabase/migrations/20260926130000_news_team_filters_first_public.sql
--
-- api.news_team_filters now stops at each club's first public story. What
-- this file pins is that the answer did not change: a club is listed exactly
-- when it is active and has at least one story that
-- app_private.news_is_public accepts in the language asked for, in name
-- order, with the same fields.
begin;

select extensions.no_plan();

-- ---------------------------------------------------------------------
-- Fixture: five clubs, one per case, and French stories for each
-- ---------------------------------------------------------------------
insert into app.teams (id, slug, name, short_name, active)
values
  ('7a9c0000-0000-4000-8000-00000000a001', 'filter-club-public', 'Filter A Public', 'A', true),
  ('7a9c0000-0000-4000-8000-00000000a002', 'filter-club-hidden', 'Filter B Hidden', 'B', true),
  ('7a9c0000-0000-4000-8000-00000000a003', 'filter-club-inactive', 'Filter C Inactive', 'C', false),
  ('7a9c0000-0000-4000-8000-00000000a004', 'filter-club-arabic', 'Filter D Arabic', 'D', true),
  ('7a9c0000-0000-4000-8000-00000000a005', 'filter-club-late', 'Filter E Late', 'E', true);

create temporary table filter_case (
  n integer primary key,
  club uuid not null,
  language app.language_code not null,
  status app.publication_status not null,
  visibility app.article_visibility not null,
  published_at timestamptz,
  sanitizer text not null
);
insert into filter_case values
  -- A: one public story among hidden ones.
  (1, '7a9c0000-0000-4000-8000-00000000a001', 'fr', 'draft', 'private', null, 'filter-test-v1'),
  (2, '7a9c0000-0000-4000-8000-00000000a001', 'fr', 'published', 'public',
    statement_timestamp() - interval '1 hour', 'filter-test-v1'),
  -- B: only stories that are not public: a draft, one dated in the future,
  -- and a link-out import news_story_is_publishable refuses.
  (3, '7a9c0000-0000-4000-8000-00000000a002', 'fr', 'draft', 'private', null, 'filter-test-v1'),
  (4, '7a9c0000-0000-4000-8000-00000000a002', 'fr', 'published', 'public',
    statement_timestamp() + interval '1 day', 'filter-test-v1'),
  (5, '7a9c0000-0000-4000-8000-00000000a002', 'fr', 'published', 'public',
    statement_timestamp() - interval '2 hours', 'elbotola-link-v1'),
  -- C: public, but the club is inactive.
  (6, '7a9c0000-0000-4000-8000-00000000a003', 'fr', 'published', 'public',
    statement_timestamp() - interval '3 hours', 'filter-test-v1'),
  -- D: public in Arabic only.
  (7, '7a9c0000-0000-4000-8000-00000000a004', 'ar', 'published', 'public',
    statement_timestamp() - interval '4 hours', 'filter-test-v1'),
  -- E: hidden stories first, the public one last: the scan must go past them.
  (8, '7a9c0000-0000-4000-8000-00000000a005', 'fr', 'draft', 'private', null, 'filter-test-v1'),
  (9, '7a9c0000-0000-4000-8000-00000000a005', 'fr', 'published', 'public',
    statement_timestamp() + interval '2 days', 'filter-test-v1'),
  (10, '7a9c0000-0000-4000-8000-00000000a005', 'fr', 'published', 'unlisted',
    statement_timestamp() - interval '5 hours', 'filter-test-v1');

insert into app.stories (id, origin, original_language, canonical_url, content_fingerprint)
select md5('filter-story:' || n)::uuid, 'provider', language,
  'https://example.test/filter/' || n, encode(extensions.digest('filter:' || n, 'sha256'), 'hex')
from filter_case;

insert into app.article_editions (
  id, story_id, language, slug, title, summary, body_format, body_source, body_html,
  status, visibility, published_at, reading_time_minutes, sanitizer_version
)
select md5('filter-edition:' || n)::uuid, md5('filter-story:' || n)::uuid, language,
  'filter-case-' || n, 'Article de test ' || n, 'Résumé court écrit pour ce test.',
  'rich_text', null, '<p>Texte court écrit pour ce test.</p>', status, visibility,
  published_at, 1, sanitizer
from filter_case;

insert into app.story_teams (story_id, team_id)
select md5('filter-story:' || n)::uuid, club from filter_case;

create function pg_temp.filter_ids(p_filters jsonb)
returns uuid[]
language sql
as $$
  select coalesce(array_agg((item ->> 'id')::uuid order by ordinality), array[]::uuid[])
  from jsonb_array_elements(p_filters) with ordinality as filters(item, ordinality)
  where (item ->> 'id')::uuid in (
    '7a9c0000-0000-4000-8000-00000000a001', '7a9c0000-0000-4000-8000-00000000a002',
    '7a9c0000-0000-4000-8000-00000000a003', '7a9c0000-0000-4000-8000-00000000a004',
    '7a9c0000-0000-4000-8000-00000000a005'
  )
$$;

-- The previous definition's rule, written out: active clubs with at least
-- one public story in the language, by name then id.
create function pg_temp.reference(p_language app.language_code)
returns uuid[]
language sql
as $$
  select coalesce(array_agg(team.id order by team.name, team.id), array[]::uuid[])
  from app.teams team
  where team.active
    and team.id in (
      '7a9c0000-0000-4000-8000-00000000a001', '7a9c0000-0000-4000-8000-00000000a002',
      '7a9c0000-0000-4000-8000-00000000a003', '7a9c0000-0000-4000-8000-00000000a004',
      '7a9c0000-0000-4000-8000-00000000a005'
    )
    and exists (
      select 1 from app.story_teams relation
      join app.article_editions edition on edition.story_id = relation.story_id
      where relation.team_id = team.id
        and edition.language = p_language
        and app_private.news_is_public(edition)
    )
$$;

-- ---------------------------------------------------------------------
-- 1. Who is listed
-- ---------------------------------------------------------------------
select extensions.is(
  pg_temp.filter_ids(api.news_team_filters('fr')),
  array[
    '7a9c0000-0000-4000-8000-00000000a001',
    '7a9c0000-0000-4000-8000-00000000a005'
  ]::uuid[],
  'French: the club with a public story and the one whose public story comes after hidden ones'
);

select extensions.is(
  pg_temp.filter_ids(api.news_team_filters('ar')),
  array['7a9c0000-0000-4000-8000-00000000a004']::uuid[],
  'Arabic: only the club with an Arabic public story'
);

select extensions.is(
  pg_temp.filter_ids(api.news_team_filters('fr')),
  pg_temp.reference('fr'),
  'French matches the previous definition'
);

select extensions.is(
  pg_temp.filter_ids(api.news_team_filters('ar')),
  pg_temp.reference('ar'),
  'Arabic matches the previous definition'
);

-- ---------------------------------------------------------------------
-- 2. Same fields
-- ---------------------------------------------------------------------
select extensions.is(
  (
    select array_agg(key order by key)
    from jsonb_array_elements(api.news_team_filters('fr')) item,
      jsonb_object_keys(item) key
    where item ->> 'id' = '7a9c0000-0000-4000-8000-00000000a001'
  ),
  array['city', 'code', 'id', 'name', 'primaryColor', 'secondaryColor', 'shortName', 'slug'],
  'each club keeps the same fields'
);

-- ---------------------------------------------------------------------
-- 3. Still callable by the site
-- ---------------------------------------------------------------------
select extensions.ok(
  has_function_privilege('anon', 'api.news_team_filters(text)', 'execute')
  and has_function_privilege('authenticated', 'api.news_team_filters(text)', 'execute'),
  'visitors and signed-in readers can still read the club filters'
);

select * from extensions.finish();
rollback;
