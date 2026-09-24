-- BotolaGO Production V2
-- News: ordered indexes so the feed and home rails stop at the first page.
--
-- The public reads filter with app_private.news_is_public(edition), which
-- cannot be inlined (it has SET search_path), so the planner cannot use the
-- partial feed index (its predicate names status, which the query does not).
-- With no other index in (language, published_at) order it read every
-- edition of the language, called news_is_public on each and sorted: after
-- the licensed ElBotola import (13,212 Arabic editions) api.news_feed('ar')
-- took ~9 s, past the 3 s statement timeout PostgREST gives the anon role.
--
-- With these two indexes the planner walks editions newest-first and stops
-- once it has a page. news_feed and the home "latest" rail also state
-- `published_at is not null` outright: a descending key sorts nulls first,
-- and every CMS or ingested draft is null-dated, so without it the scan
-- would walk every draft before the first published row. With it the btree
-- skips them. The two functions are otherwise identical to 20260720110107
-- (checked against production by hash on 2026-09-24). Measured against production data in a rolled-back
-- transaction (2026-09-24): news_feed ar 9.0 s -> 44 ms, fr 1.4 s -> 21 ms,
-- news_home_modules fr 1.1 s -> 9 ms, news_article_detail 77 -> 16 ms.

create index if not exists article_editions_language_published_idx
  on app.article_editions (language, published_at desc, id desc);

create index if not exists article_editions_published_idx
  on app.article_editions (published_at desc, id desc);

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

  with selected as (
    select edition.*
    from app.article_editions edition
    where edition.language = selected_language
      -- Stated here, not only inside news_is_public, so the ordered index
      -- scan starts past the null-dated drafts that sort first.
      and edition.published_at is not null
      and app_private.news_is_public(edition)
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

create or replace function api.news_home_modules(p_language text, p_limit integer default 8)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_language app.language_code := app_private.news_language(p_language);
  page_size integer := least(greatest(p_limit, 1), 20);
begin
  return jsonb_build_object(
    'lead', (
      select app_private.news_article_card(edition, placement.placement_type)
      from app.editorial_placements placement
      join app.article_editions edition on edition.id = placement.article_edition_id
      where placement.language = selected_language
        and placement.placement_type in ('home_lead', 'news_lead')
        and placement.scope_type = 'global'
        and placement.starts_at <= statement_timestamp()
        and (placement.ends_at is null or placement.ends_at > statement_timestamp())
        and app_private.news_is_public(edition)
      order by case placement.placement_type when 'home_lead' then 0 else 1 end,
        placement.priority, placement.starts_at desc, placement.id
      limit 1
    ),
    'featured', coalesce((
      select jsonb_agg(app_private.news_article_card(featured.edition, featured.placement_type)
        order by featured.priority, featured.starts_at desc, featured.id)
      from (
        select edition, placement.placement_type, placement.priority, placement.starts_at, placement.id
        from app.editorial_placements placement
        join app.article_editions edition on edition.id = placement.article_edition_id
        where placement.language = selected_language
          and placement.placement_type in ('featured', 'editors_pick', 'breaking', 'trending')
          and placement.scope_type = 'global'
          and placement.starts_at <= statement_timestamp()
          and (placement.ends_at is null or placement.ends_at > statement_timestamp())
          and app_private.news_is_public(edition)
        order by placement.priority, placement.starts_at desc, placement.id
        limit page_size
      ) featured
    ), '[]'::jsonb),
    'latest', coalesce((
      select jsonb_agg(app_private.news_article_card(latest, null)
        order by latest.published_at desc, latest.id desc)
      from (
        select edition.* from app.article_editions edition
        where edition.language = selected_language
          and edition.visibility = 'public'
          and edition.published_at is not null
          and app_private.news_is_public(edition)
        order by edition.published_at desc, edition.id desc limit page_size
      ) latest
    ), '[]'::jsonb),
    'generatedAt', statement_timestamp()
  );
end;
$$;
