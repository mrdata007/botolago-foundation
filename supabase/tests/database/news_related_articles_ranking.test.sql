-- Regression suite for 20260924190400_news_related_articles_set_based.
--
-- The rewrite must rank exactly as the per-candidate version it replaced.
-- That version is kept below as pg_temp.related_reference, verbatim, and
-- both are asked the same questions: every source, every limit.
begin;
select extensions.no_plan();

create function pg_temp.related_reference(p_article_edition_id uuid, p_limit integer default 6)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  source app.article_editions%rowtype;
begin
  select * into source from app.article_editions
  where id = p_article_edition_id and app_private.news_is_public(article_editions);
  if not found then
    raise exception using errcode = 'P0002', message = 'news_article_not_found';
  end if;

  return coalesce((
    with candidates as (
      select candidate as article, candidate.published_at, candidate.id,
        (select count(*) from app.story_taxonomies left_relation
          join app.story_taxonomies right_relation on right_relation.taxonomy_id = left_relation.taxonomy_id
          where left_relation.story_id = source.story_id and right_relation.story_id = candidate.story_id) * 4
        + (select count(*) from app.story_teams left_relation
          join app.story_teams right_relation on right_relation.team_id = left_relation.team_id
          where left_relation.story_id = source.story_id and right_relation.story_id = candidate.story_id) * 5
        + (select count(*) from app.story_competitions left_relation
          join app.story_competitions right_relation on right_relation.competition_id = left_relation.competition_id
          where left_relation.story_id = source.story_id and right_relation.story_id = candidate.story_id) * 3
        + (select count(*) from app.story_players left_relation
          join app.story_players right_relation on right_relation.player_id = left_relation.player_id
          where left_relation.story_id = source.story_id and right_relation.story_id = candidate.story_id) * 5 as relevance
      from app.article_editions candidate
      where candidate.id <> source.id and candidate.story_id <> source.story_id
        and candidate.language = source.language and app_private.news_is_public(candidate)
        and candidate.published_at >= source.published_at - interval '180 days'
    )
    select jsonb_agg(app_private.news_article_card(candidate.article, null)
      order by candidate.relevance desc, candidate.published_at desc, candidate.id desc)
    from (select * from candidates where relevance > 0
      order by relevance desc, published_at desc, id desc
      limit least(greatest(p_limit, 1), 12)) candidate
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixture: one source story tagged with a category, two clubs, a competition
-- and a player, and candidates that share some of those, or are excluded for
-- one reason each. Headlines name no club, so no automatic tagging applies.
-- ---------------------------------------------------------------------------
insert into app.publishers (id, slug, name, source_type, trust_status)
values
  ('9e1a0000-0000-4000-8000-0000000000b1', 'related-house', 'Related House', 'internal', 'trusted'),
  ('9e1a0000-0000-4000-8000-0000000000b2', 'related-wire', 'Related Wire', 'provider', 'trusted');
insert into app.taxonomies (id, taxonomy_type, slug, display_order)
values ('9e1a0000-0000-4000-8000-0000000000c1', 'category', 'related-analysis', 1);
insert into app.teams (id, slug, name, short_name)
values
  ('9e1a0000-0000-4000-8000-0000000000d1', 'related-club-one', 'Related Club One', 'RC1'),
  ('9e1a0000-0000-4000-8000-0000000000d2', 'related-club-two', 'Related Club Two', 'RC2');
insert into app.competitions (id, slug, name, competition_type)
values ('9e1a0000-0000-4000-8000-0000000000e1', 'related-cup', 'Related Cup', 'cup');
insert into app.players (id, slug, full_name, display_name, position)
values ('9e1a0000-0000-4000-8000-0000000000f1', 'related-player', 'Related Player', 'R. Player', 'forward');

-- Stories: s0 is the source; k1..k13 are candidates.
insert into app.stories (id, original_language, publisher_id, deleted_at)
select ('9e1a0000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid, 'fr',
  case when n = 13 then '9e1a0000-0000-4000-8000-0000000000b2'::uuid
       else '9e1a0000-0000-4000-8000-0000000000b1'::uuid end,
  case when n = 9 then '2025-05-30T00:00:00Z'::timestamptz end
from generate_series(0, 13) n;

-- Editions: (story, language, status, visibility, published_at, sanitizer).
insert into app.article_editions (
  id, story_id, language, slug, title, summary, body_source, body_html,
  status, visibility, published_at, reading_time_minutes, sanitizer_version
)
select ('9e1a0000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid,
  ('9e1a0000-0000-4000-8000-0000000001' || lpad(story::text, 2, '0'))::uuid,
  language::app.language_code, 'related-edition-' || n, 'Related headline number ' || n,
  'A summary long enough for edition ' || n || '.',
  repeat('Body text for the ranking test. ', 2), '<p>Body text for the ranking test.</p>',
  status::app.publication_status, visibility::app.article_visibility, published_at::timestamptz, 3, sanitizer
from (values
  -- n, story, language, status, visibility, published_at, sanitizer
  (0, 0, 'fr', 'published', 'public', '2025-06-01T10:00:00Z', 'sanitize-html@2.17.0'),   -- the source
  (1, 1, 'fr', 'published', 'public', '2025-05-01T10:00:00Z', 'sanitize-html@2.17.0'),   -- both clubs: 10
  (2, 2, 'fr', 'published', 'public', '2025-05-20T10:00:00Z', 'sanitize-html@2.17.0'),   -- category: 4
  (3, 3, 'fr', 'published', 'public', '2025-05-25T10:00:00Z', 'sanitize-html@2.17.0'),   -- competition: 3
  (4, 4, 'fr', 'published', 'public', '2025-05-10T10:00:00Z', 'sanitize-html@2.17.0'),   -- player: 5
  (5, 5, 'fr', 'published', 'public', '2025-05-10T10:00:00Z', 'sanitize-html@2.17.0'),   -- one club: 5, same time as 4
  (6, 6, 'fr', 'published', 'unlisted', '2025-04-01T10:00:00Z', 'sanitize-html@2.17.0'), -- everything: 17, unlisted
  (7, 7, 'fr', 'draft', 'public', null, 'sanitize-html@2.17.0'),                        -- a draft
  (8, 8, 'fr', 'published', 'public', '2024-11-01T10:00:00Z', 'sanitize-html@2.17.0'),   -- older than 180 days
  (9, 9, 'fr', 'published', 'public', '2025-05-15T10:00:00Z', 'sanitize-html@2.17.0'),   -- story deleted
  (10, 10, 'ar', 'published', 'public', '2025-05-15T10:00:00Z', 'sanitize-html@2.17.0'), -- Arabic only
  (11, 11, 'fr', 'published', 'public', '2025-05-15T10:00:00Z', 'sanitize-html@2.17.0'), -- shares nothing
  (12, 12, 'fr', 'published', 'public', '2025-05-15T10:00:00Z', 'gnews-excerpt-v1'),     -- legacy import
  (13, 13, 'fr', 'published', 'public', '2025-05-15T10:00:00Z', 'sanitize-html@2.17.0'), -- unlicensed wire
  (14, 0, 'ar', 'published', 'public', '2025-06-01T10:00:00Z', 'sanitize-html@2.17.0'),  -- the source in Arabic
  (15, 1, 'ar', 'published', 'public', '2025-05-01T10:00:00Z', 'sanitize-html@2.17.0')   -- k1 in Arabic
) as edition(n, story, language, status, visibility, published_at, sanitizer);

insert into app.story_taxonomies (story_id, taxonomy_id, is_primary)
select ('9e1a0000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid,
  '9e1a0000-0000-4000-8000-0000000000c1', true
from unnest(array[0, 2, 6]) n;
insert into app.story_teams (story_id, team_id)
select ('9e1a0000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid, team::uuid
from (values
  (0, '9e1a0000-0000-4000-8000-0000000000d1'), (0, '9e1a0000-0000-4000-8000-0000000000d2'),
  (1, '9e1a0000-0000-4000-8000-0000000000d1'), (1, '9e1a0000-0000-4000-8000-0000000000d2'),
  (5, '9e1a0000-0000-4000-8000-0000000000d1'), (6, '9e1a0000-0000-4000-8000-0000000000d1'),
  (7, '9e1a0000-0000-4000-8000-0000000000d1'), (8, '9e1a0000-0000-4000-8000-0000000000d1'),
  (9, '9e1a0000-0000-4000-8000-0000000000d1'), (10, '9e1a0000-0000-4000-8000-0000000000d1'),
  (12, '9e1a0000-0000-4000-8000-0000000000d1'), (13, '9e1a0000-0000-4000-8000-0000000000d1')
) as tag(n, team);
insert into app.story_competitions (story_id, competition_id)
select ('9e1a0000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid,
  '9e1a0000-0000-4000-8000-0000000000e1'
from unnest(array[0, 3, 6]) n;
insert into app.story_players (story_id, player_id)
select ('9e1a0000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid,
  '9e1a0000-0000-4000-8000-0000000000f1'
from unnest(array[0, 4, 6]) n;

create function pg_temp.related_ids(p_article_edition_id uuid, p_limit integer)
returns text[]
language sql
as $$
  select coalesce(array_agg(right(card ->> 'id', 2) order by ordinality), '{}')
  from jsonb_array_elements(api.news_related_articles(p_article_edition_id, p_limit))
    with ordinality as item(card, ordinality)
$$;

-- ---------------------------------------------------------------------------
-- The ranking, spelled out.
-- ---------------------------------------------------------------------------
select extensions.is(
  pg_temp.related_ids('9e1a0000-0000-4000-8000-000000000200', 6),
  array['06', '01', '05', '04', '02', '03'],
  'most shared tags first; equal scores by publication time, then id; unlisted editions count');
select extensions.is(
  pg_temp.related_ids('9e1a0000-0000-4000-8000-000000000200', 20),
  array['06', '01', '05', '04', '02', '03'],
  'drafts, old, deleted, other-language, untagged, legacy and unlicensed stories never appear');
select extensions.is(pg_temp.related_ids('9e1a0000-0000-4000-8000-000000000200', 3),
  array['06', '01', '05'], 'the limit keeps the best');
select extensions.is(pg_temp.related_ids('9e1a0000-0000-4000-8000-000000000200', null),
  array['06'], 'a missing limit still means one, as before');
select extensions.is(
  pg_temp.related_ids('9e1a0000-0000-4000-8000-000000000214', 6),
  array['15', '10'], 'an Arabic source gets Arabic editions only');
select extensions.throws_ok(
  $$select api.news_related_articles('9e1a0000-0000-4000-8000-000000000207', 6)$$,
  'P0002', 'news_article_not_found', 'a source that is not public is refused');

-- ---------------------------------------------------------------------------
-- Identical to the version it replaced, card for card.
-- ---------------------------------------------------------------------------
select extensions.is(
  (select count(*)::integer
   from app.article_editions edition
   cross join unnest(array[null, 0, 1, 3, 6, 12, 20]::integer[]) as page(size)
   where edition.id::text like '9e1a0000-0000-4000-8000-0000000002%'
     and app_private.news_is_public(edition)
     and api.news_related_articles(edition.id, page.size)
       is distinct from pg_temp.related_reference(edition.id, page.size)),
  0, 'every public source and every limit returns what the previous version returned');

select * from extensions.finish();
rollback;
