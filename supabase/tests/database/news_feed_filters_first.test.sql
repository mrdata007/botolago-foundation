-- supabase/migrations/20260924180100_news_feed_filters_first.sql
--
-- api.news_feed now applies its filters before app_private.news_is_public.
-- The speed-up is measured in the migration's header; what this file pins is
-- that nothing else changed: the feed a club (or a category) gets is exactly
-- its public stories, newest first, in pages, and the same rows the old
-- single-level query returns.
begin;

select extensions.no_plan();

-- ---------------------------------------------------------------------
-- Fixture: two clubs and seven Arabic stories, one per case
-- ---------------------------------------------------------------------
insert into app.teams (id, slug, name, short_name)
values
  ('7a9b0000-0000-4000-8000-00000000a001', 'feed-club-one', 'Feed Club One', 'One'),
  ('7a9b0000-0000-4000-8000-00000000a002', 'feed-club-two', 'Feed Club Two', 'Two');

insert into app.taxonomies (id, taxonomy_type, slug, display_order)
values ('7a9b0000-0000-4000-8000-00000000c001', 'category', 'feed-analysis', 1);

create temporary table feed_case (
  n integer primary key,
  label text not null,
  status app.publication_status not null,
  visibility app.article_visibility not null,
  published_at timestamptz,
  sanitizer text not null,
  club uuid
);
insert into feed_case values
  (1, 'public, club one', 'published', 'public', statement_timestamp() - interval '1 hour',
    'feed-test-v1', '7a9b0000-0000-4000-8000-00000000a001'),
  (2, 'public, club one, older', 'published', 'public', statement_timestamp() - interval '2 hours',
    'feed-test-v1', '7a9b0000-0000-4000-8000-00000000a001'),
  (3, 'public, club two', 'published', 'public', statement_timestamp() - interval '3 hours',
    'feed-test-v1', '7a9b0000-0000-4000-8000-00000000a002'),
  (4, 'draft, club one', 'draft', 'private', null,
    'feed-test-v1', '7a9b0000-0000-4000-8000-00000000a001'),
  (5, 'unlisted, club one', 'published', 'unlisted', statement_timestamp() - interval '4 hours',
    'feed-test-v1', '7a9b0000-0000-4000-8000-00000000a001'),
  (6, 'dated in the future, club one', 'published', 'public', statement_timestamp() + interval '1 day',
    'feed-test-v1', '7a9b0000-0000-4000-8000-00000000a001'),
  -- A link-out stub never converted: news_story_is_publishable says no.
  (7, 'legacy import, club one', 'published', 'public', statement_timestamp() - interval '5 hours',
    'elbotola-link-v1', '7a9b0000-0000-4000-8000-00000000a001');

insert into app.stories (id, origin, original_language, canonical_url, content_fingerprint)
select md5('feed-story:' || n)::uuid, 'provider', 'ar',
  'https://example.test/feed/' || n, encode(extensions.digest('feed:' || n, 'sha256'), 'hex')
from feed_case;

insert into app.article_editions (
  id, story_id, language, slug, title, summary, body_format, body_source, body_html,
  status, visibility, published_at, reading_time_minutes, sanitizer_version
)
select md5('feed-edition:' || n)::uuid, md5('feed-story:' || n)::uuid, 'ar', 'feed-case-' || n,
  'خبر اختبار رقم ' || n, 'ملخص قصير كتب لهذا الاختبار فقط.', 'rich_text', null,
  '<p>نص قصير كتب لهذا الاختبار فقط.</p>', status, visibility, published_at, 1, sanitizer
from feed_case;

insert into app.story_teams (story_id, team_id)
select md5('feed-story:' || n)::uuid, club from feed_case;

-- Cases 1 and 3 are also analysis pieces.
insert into app.story_taxonomies (story_id, taxonomy_id, is_primary)
select md5('feed-story:' || n)::uuid, '7a9b0000-0000-4000-8000-00000000c001', true
from feed_case where n in (1, 3);

create function pg_temp.feed_ids(p_feed jsonb)
returns uuid[]
language sql
as $$
  select coalesce(array_agg((item ->> 'id')::uuid order by ordinality), array[]::uuid[])
  from jsonb_array_elements(p_feed -> 'items') with ordinality as feed(item, ordinality)
$$;

create function pg_temp.edition(p_case integer)
returns uuid
language sql
as $$ select md5('feed-edition:' || p_case)::uuid $$;

-- ---------------------------------------------------------------------
-- 1. A club's feed is its public stories, newest first
-- ---------------------------------------------------------------------
select extensions.is(
  pg_temp.feed_ids(api.news_feed('ar', p_team_id => '7a9b0000-0000-4000-8000-00000000a001')),
  array[pg_temp.edition(1), pg_temp.edition(2)],
  'a club''s feed holds its public stories only: no draft, unlisted, future-dated or legacy stub'
);

select extensions.is(
  pg_temp.feed_ids(api.news_feed('ar', p_team_id => '7a9b0000-0000-4000-8000-00000000a002')),
  array[pg_temp.edition(3)],
  'and another club''s feed holds only its own'
);

select extensions.is(
  pg_temp.feed_ids(api.news_feed('fr', p_team_id => '7a9b0000-0000-4000-8000-00000000a001')),
  array[]::uuid[],
  'a language with no edition gets an empty feed, not an error'
);

-- ---------------------------------------------------------------------
-- 2. Pages
-- ---------------------------------------------------------------------
select extensions.is(
  pg_temp.feed_ids(api.news_feed('ar', 1, p_team_id => '7a9b0000-0000-4000-8000-00000000a001')),
  array[pg_temp.edition(1)],
  'a page of one holds the newest story'
);

select extensions.isnt(
  api.news_feed('ar', 1, p_team_id => '7a9b0000-0000-4000-8000-00000000a001') -> 'nextCursor',
  'null'::jsonb,
  'and points at the next page'
);

select extensions.is(
  pg_temp.feed_ids(api.news_feed(
    'ar', 1,
    ((api.news_feed('ar', 1, p_team_id => '7a9b0000-0000-4000-8000-00000000a001') -> 'nextCursor') ->> 'publishedAt')::timestamptz,
    ((api.news_feed('ar', 1, p_team_id => '7a9b0000-0000-4000-8000-00000000a001') -> 'nextCursor') ->> 'id')::uuid,
    p_team_id => '7a9b0000-0000-4000-8000-00000000a001'
  )),
  array[pg_temp.edition(2)],
  'the next page holds the one after it'
);

select extensions.is(
  api.news_feed('ar', 2, p_team_id => '7a9b0000-0000-4000-8000-00000000a001') -> 'nextCursor',
  'null'::jsonb,
  'the last page has no cursor'
);

-- ---------------------------------------------------------------------
-- 3. The same rows as the single-level query, for every filter
-- ---------------------------------------------------------------------
create function pg_temp.reference(p_team_id uuid, p_category_slug text)
returns uuid[]
language sql
as $$
  select coalesce(array_agg(id order by published_at desc, id desc), array[]::uuid[])
  from (
    select edition.id, edition.published_at
    from app.article_editions edition
    where edition.language = 'ar'
      and edition.published_at is not null
      and app_private.news_is_public(edition)
      and edition.visibility = 'public'
      and (p_team_id is null or exists (
        select 1 from app.story_teams relation
        where relation.story_id = edition.story_id and relation.team_id = p_team_id
      ))
      and (p_category_slug is null or exists (
        select 1 from app.story_taxonomies relation
        join app.taxonomies taxonomy on taxonomy.id = relation.taxonomy_id
        where relation.story_id = edition.story_id and taxonomy.taxonomy_type = 'category'
          and taxonomy.slug = p_category_slug and taxonomy.active
      ))
    order by edition.published_at desc, edition.id desc
    limit 20
  ) reference
$$;

select extensions.is(
  pg_temp.feed_ids(api.news_feed('ar')),
  pg_temp.reference(null, null),
  'the unfiltered feed is unchanged'
);

select extensions.is(
  pg_temp.feed_ids(api.news_feed('ar', p_team_id => '7a9b0000-0000-4000-8000-00000000a001')),
  pg_temp.reference('7a9b0000-0000-4000-8000-00000000a001', null),
  'the club feed matches the single-level query'
);

select extensions.is(
  pg_temp.feed_ids(api.news_feed('ar', p_category_slug => 'feed-analysis')),
  pg_temp.reference(null, 'feed-analysis'),
  'the category feed matches the single-level query'
);

select extensions.is(
  pg_temp.feed_ids(api.news_feed(
    'ar', p_category_slug => 'feed-analysis', p_team_id => '7a9b0000-0000-4000-8000-00000000a002'
  )),
  array[pg_temp.edition(3)],
  'filters combine'
);

-- ---------------------------------------------------------------------
-- 4. Still callable by the site
-- ---------------------------------------------------------------------
select extensions.ok(
  has_function_privilege('anon', 'api.news_feed(text,integer,timestamptz,uuid,text,text,uuid,uuid,uuid)', 'execute')
  and has_function_privilege('authenticated', 'api.news_feed(text,integer,timestamptz,uuid,text,text,uuid,uuid,uuid)', 'execute'),
  'visitors and signed-in readers can still read the feed'
);

select extensions.throws_ok(
  $$select api.news_feed('ar', 20, statement_timestamp(), null)$$,
  '22023',
  'news_invalid_cursor',
  'a half cursor is still refused'
);

select * from extensions.finish();

rollback;
