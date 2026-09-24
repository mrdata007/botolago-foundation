-- BotolaGO Production V2
-- News feed: apply the club, category and other filters before the
-- publication check.
--
-- A club page lists the club's latest stories through
-- api.news_feed(p_team_id => …), and so does the News page's club filter.
-- In production that call fails: for Wydad in Arabic it returns 57014
-- ("canceling statement due to statement timeout") after the 3 s PostgREST
-- gives the anon role, and in French it takes 1.6-2.2 s to return nothing.
--
-- The reason is the order in which the planner applies the WHERE clause.
-- app_private.news_is_public(edition) cannot be inlined (SET search_path,
-- SECURITY DEFINER helpers underneath), so it is a real call per row. The
-- planner is free to evaluate it before the club filter, and in production
-- it does (read-only EXPLAIN ANALYZE, 2026-09-24, Widad Témara in Arabic):
--
--   Index Scan using article_editions_language_published_idx
--     Filter: visibility = 'public' AND news_is_public(edition.*)
--             AND (ANY (story_id = (hashed SubPlan)))
--     Rows Removed by Filter: 13310        Execution Time: 9176 ms
--
-- so every Arabic edition paid for the publication check before the club
-- was looked at. The same query in the shape below: 15 ms, with the check
-- never called. The unfiltered Arabic feed: 12.6 ms before, 12.9 ms after,
-- on the same plan. The unfiltered feed is unaffected: it stops at its first
-- page (20260924170000_news_feed_indexes). A filter that matches few stories
-- is the worst case, since the scan never fills a page and reads everything.
-- Tagging stories with their clubs (20260924180000_news_story_team_tagging)
-- makes that the normal case for the small clubs.
--
-- Here the scan is split in two levels. The inner one applies every cheap
-- condition (language, date, visibility, status, the cursor and the
-- category, topic, competition, club and player filters) while it walks the
-- editions newest first. `offset 0` makes it a level of its own, which the
-- planner may not flatten or push the outer condition into. The outer level
-- then runs news_is_public, still the one definition of "public", on the
-- rows that got through, in date order, and stops once it has a page.
--
-- The function is otherwise identical to 20260924170000_news_feed_indexes
-- (the production version, checked by hash on 2026-09-24): same signature,
-- same results, same JSON.

create or replace function api.news_feed(
  p_language text,
  p_limit integer default 20,
  p_after_published_at timestamptz default null,
  p_after_id uuid default null,
  p_category_slug text default null,
  p_topic_slug text default null,
  p_competition_id uuid default null,
  p_team_id uuid default null,
  p_player_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_language app.language_code := app_private.news_language(p_language);
  page_size integer := least(greatest(p_limit, 1), 50);
  result jsonb;
begin
  if (p_after_published_at is null) <> (p_after_id is null) then
    raise exception using errcode = '22023', message = 'news_invalid_cursor';
  end if;

  with candidate as (
    select edition as article, edition.published_at, edition.id
    from app.article_editions edition
    where edition.language = selected_language
      -- Stated here, not only inside news_is_public, so the ordered index
      -- scan starts past the null-dated drafts that sort first.
      and edition.published_at is not null
      and edition.status = 'published'
      and edition.visibility = 'public'
      and (p_after_published_at is null or (edition.published_at, edition.id) < (p_after_published_at, p_after_id))
      and (p_category_slug is null or exists (
        select 1 from app.story_taxonomies relation join app.taxonomies taxonomy on taxonomy.id = relation.taxonomy_id
        where relation.story_id = edition.story_id and taxonomy.taxonomy_type = 'category'
          and taxonomy.slug = p_category_slug and taxonomy.active
      ))
      and (p_topic_slug is null or exists (
        select 1 from app.story_taxonomies relation join app.taxonomies taxonomy on taxonomy.id = relation.taxonomy_id
        where relation.story_id = edition.story_id and taxonomy.taxonomy_type = 'topic'
          and taxonomy.slug = p_topic_slug and taxonomy.active
      ))
      and (p_competition_id is null or exists (
        select 1 from app.story_competitions relation
        where relation.story_id = edition.story_id and relation.competition_id = p_competition_id
      ))
      and (p_team_id is null or exists (
        select 1 from app.story_teams relation
        where relation.story_id = edition.story_id and relation.team_id = p_team_id
      ))
      and (p_player_id is null or exists (
        select 1 from app.story_players relation
        where relation.story_id = edition.story_id and relation.player_id = p_player_id
      ))
    order by edition.published_at desc, edition.id desc
    -- A fence: nothing above may be merged into this level, so the
    -- publication check below only ever sees rows these filters kept.
    offset 0
  ), selected as (
    select (candidate.article).*
    from candidate
    where app_private.news_is_public(candidate.article)
    order by candidate.published_at desc, candidate.id desc
    limit page_size + 1
  ), page as (
    select * from selected order by published_at desc, id desc limit page_size
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(app_private.news_article_card(page, null)
      order by page.published_at desc, page.id desc) from page), '[]'::jsonb),
    'nextCursor', case when (select count(*) from selected) > page_size then (
      select jsonb_build_object('publishedAt', published_at, 'id', id)
      from page order by published_at, id limit 1
    ) else null end
  ) into result;
  return result;
end;
$$;
