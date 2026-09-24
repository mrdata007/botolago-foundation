-- BotolaGO Production V2
-- News search: check publication set-based, not once per match.
--
-- api.news_search called app_private.news_is_public() on every edition that
-- matched the query before ranking. That helper is not inlined (SET
-- search_path, SECURITY DEFINER helpers underneath), so a club name, which
-- matches thousands of the imported ElBotola articles, took 2-4 s in
-- production ('الوداد': 4,551 matches, 4.0 s): past the anon role's 3 s
-- statement timeout. Matching and ranking alone take ~40 ms.
--
-- The filter below spells out news_is_public() and news_story_is_publishable()
-- (as of 20260924163000) as joins. The function is otherwise identical to
-- 20260720110107 (checked against production by hash on 2026-09-24). The
-- pgTAP test compares search results with news_is_public(), so the two
-- cannot drift silently.

create or replace function api.news_search(
  p_language text,
  p_query text,
  p_limit integer default 20,
  p_after_rank real default null,
  p_after_published_at timestamptz default null,
  p_after_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_language app.language_code := app_private.news_language(p_language);
  normalized_query text;
  search_query tsquery;
  search_config regconfig;
  page_size integer := least(greatest(p_limit, 1), 50);
  result jsonb;
begin
  normalized_query := app_private.normalize_news_text(btrim(p_query), selected_language);
  if char_length(normalized_query) < 2 or char_length(normalized_query) > 160 then
    raise exception using errcode = '22023', message = 'news_invalid_search_query';
  end if;
  if (p_after_rank is null or p_after_published_at is null or p_after_id is null)
     and num_nonnulls(p_after_rank, p_after_published_at, p_after_id) <> 0 then
    raise exception using errcode = '22023', message = 'news_invalid_cursor';
  end if;

  search_config := case when selected_language = 'fr' then 'pg_catalog.french'::regconfig
                        else 'pg_catalog.simple'::regconfig end;
  search_query := websearch_to_tsquery(search_config, normalized_query);

  with ranked as (
    select edition as article, edition.published_at, edition.id,
      ts_rank_cd(document.search_vector, search_query, 32)::real as rank
    from app.article_search_documents document
    join app.article_editions edition on edition.id = document.article_edition_id
    join app.stories story on story.id = edition.story_id and story.deleted_at is null
    left join app.publishers publisher on publisher.id = story.publisher_id
    where document.language = selected_language
      and document.search_vector @@ search_query
      -- app_private.news_is_public(edition), spelled out set-based: calling
      -- it once per match (thousands for a club name) took 2-4 s.
      and edition.status = 'published'
      and edition.visibility in ('public', 'unlisted')
      and edition.published_at is not null
      and edition.published_at <= statement_timestamp()
      and (
        publisher.id is null
        or publisher.source_type = 'internal'
        or publisher.slug = 'botolago'
        or publisher.slug like 'botolago-%'
        or publisher.syndication_licensed_at is not null
        or story.import_converted_at is not null
      )
      and not (
        story.import_converted_at is null
        and exists (
          select 1 from app.article_editions legacy
          where legacy.story_id = story.id
            and legacy.sanitizer_version in ('gnews-excerpt-v1', 'elbotola-link-v1')
        )
      )
  ), selected as (
    select * from ranked
    where p_after_rank is null or (rank, published_at, id) < (p_after_rank, p_after_published_at, p_after_id)
    order by rank desc, published_at desc, id desc
    limit page_size + 1
  ), page as (
    select * from selected order by rank desc, published_at desc, id desc limit page_size
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(
      app_private.news_article_card(page.article, null) || jsonb_build_object('searchRank', page.rank)
      order by page.rank desc, page.published_at desc, page.id desc) from page), '[]'::jsonb),
    'nextCursor', case when (select count(*) from selected) > page_size then (
      select jsonb_build_object('rank', rank, 'publishedAt', published_at, 'id', id)
      from page order by rank, published_at, id limit 1
    ) else null end
  ) into result;
  return result;
end;
$$;
