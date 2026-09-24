-- Related articles, ranked without a per-candidate scan.
--
-- `api.news_related_articles` (the "related" rail under every article) was
-- the most expensive public statement per call in pg_stat_statements on
-- 2026-09-24: 696 calls, 776 ms mean, 540 s in total. Measured again on
-- production at quiet time: 608-644 ms and ~30,000 buffer hits per call.
--
-- It visited every public edition of the same language from the last 180
-- days (about 1,000 per language), formed each one as a whole row -- which
-- detoasts its body, about 1 ms per row -- and ran four correlated count
-- subqueries per candidate before keeping the six best.
--
-- This version starts from the source story's own tags, so it only touches
-- stories that share at least one, scores them in one aggregate, sorts ids
-- rather than whole rows, and runs the publication check lazily in rank
-- order until the page is full -- the same fence news_feed uses since
-- 20260924180100. The ranking is unchanged: relevance is still
-- 4 x shared categories/tags + 5 x shared clubs + 3 x shared competitions +
-- 5 x shared players, ties broken by publication time then id, only public
-- editions of the source's language from the 180 days before it, never the
-- source story itself. Measured as a plain query on production, same
-- article: 38 ms and ~10,900 buffer hits. The body replaced here was
-- verified identical to production (md5 of pg_get_functiondef).

create or replace function api.news_related_articles(
  p_article_edition_id uuid,
  p_limit integer default 6
)
returns jsonb
language plpgsql
stable
security definer
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
    with shared as (
      select other.story_id, 4 as weight
      from app.story_taxonomies own
      join app.story_taxonomies other on other.taxonomy_id = own.taxonomy_id
      where own.story_id = source.story_id
      union all
      select other.story_id, 5
      from app.story_teams own
      join app.story_teams other on other.team_id = own.team_id
      where own.story_id = source.story_id
      union all
      select other.story_id, 3
      from app.story_competitions own
      join app.story_competitions other on other.competition_id = own.competition_id
      where own.story_id = source.story_id
      union all
      select other.story_id, 5
      from app.story_players own
      join app.story_players other on other.player_id = own.player_id
      where own.story_id = source.story_id
    ), scored as (
      select shared.story_id, sum(shared.weight) as relevance
      from shared
      where shared.story_id <> source.story_id
      group by shared.story_id
    ), candidate as (
      select edition.id, scored.relevance, edition.published_at
      from scored
      join app.article_editions edition on edition.story_id = scored.story_id
      where edition.language = source.language
        and edition.id <> source.id
        -- Implied by news_is_public; stated here so the rows it has to
        -- check are only those that could pass.
        and edition.status = 'published'
        and edition.visibility in ('public', 'unlisted')
        and edition.published_at is not null
        and edition.published_at >= source.published_at - interval '180 days'
      order by scored.relevance desc, edition.published_at desc, edition.id desc
      -- A fence: the publication check below must not be pushed into this
      -- level, so it runs in rank order and stops once the page is full.
      offset 0
    ), selected as (
      select edition as article, candidate.relevance, candidate.published_at, candidate.id
      from candidate
      join app.article_editions edition on edition.id = candidate.id
      where app_private.news_is_public(edition)
      order by candidate.relevance desc, candidate.published_at desc, candidate.id desc
      limit least(greatest(p_limit, 1), 12)
    )
    select jsonb_agg(app_private.news_article_card(selected.article, null)
      order by selected.relevance desc, selected.published_at desc, selected.id desc)
    from selected
  ), '[]'::jsonb);
end;
$$;
