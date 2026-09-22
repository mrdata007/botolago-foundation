-- BG-0058: api.news_article_detail returned HTTP 500 for a missing article.
--
-- The function raised SQLSTATE 'P0002' (no_data_found). PostgREST has no
-- mapping for that class, so every "article not found" answer left the edge as
-- a 500 Internal Server Error. That is not an edge case here: the reader-side
-- language fallback (getArticleWithLanguageFallback) asks for the French
-- edition first and only then for the Arabic one, so EVERY Arabic article
-- detail view -- the overwhelming majority of the catalogue -- logged a 500 on
-- the way to rendering correctly. At launch that noise hides real incidents.
--
-- PostgREST reads SQLSTATE 'PGRST' as "the function is choosing the response":
-- MESSAGE carries the JSON body and DETAIL the HTTP status. The body keeps
-- `message = 'news_article_not_found'`, which is exactly what the client's
-- mapNewsError() matches on, so NewsError('article_not_found') and the
-- language-fallback branch behave as before -- only the status code changes,
-- from 500 to 404.
--
-- Scope is deliberately narrow: only this public read path is changed. The
-- editorial RPCs keep P0002; they sit behind staff authentication, where a 500
-- is not on a normal reader path.
create or replace function api.news_article_detail(p_language text, p_identifier text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_language app.language_code := app_private.news_language(p_language);
  edition app.article_editions%rowtype;
  card jsonb;
begin
  select candidate.* into edition
  from app.article_editions candidate
  where candidate.language = selected_language
    and candidate.id = case
      when p_identifier ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then p_identifier::uuid
      else candidate.id
    end
    and (
      candidate.slug = p_identifier
      or p_identifier ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
    and app_private.news_is_public(candidate)
  limit 1;

  if not found then
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'code', 'NEWS404',
        'message', 'news_article_not_found',
        'details', null,
        'hint', null
      )::text,
      detail = json_build_object('status', 404, 'headers', json_build_object())::text;
  end if;

  card := app_private.news_article_card(edition, null);
  return card || jsonb_build_object(
    'bodyHtml', edition.body_html,
    'bodyFormat', edition.body_format,
    'seo', jsonb_build_object('title', edition.seo_title, 'description', edition.seo_description),
    'taxonomies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', taxonomy.id, 'type', taxonomy.taxonomy_type, 'slug', taxonomy.slug,
        'name', coalesce(translation.display_name, taxonomy.slug)
      ) order by taxonomy.taxonomy_type, taxonomy.display_order, taxonomy.slug)
      from app.story_taxonomies relation join app.taxonomies taxonomy on taxonomy.id = relation.taxonomy_id
      left join app.taxonomy_translations translation
        on translation.taxonomy_id = taxonomy.id and translation.language = edition.language
      where relation.story_id = edition.story_id
    ), '[]'::jsonb),
    'competitions', coalesce((select jsonb_agg(jsonb_build_object(
      'id', competition.id, 'slug', competition.slug, 'name', competition.name
    ) order by competition.display_order, competition.name)
      from app.story_competitions relation join app.competitions competition on competition.id = relation.competition_id
      where relation.story_id = edition.story_id), '[]'::jsonb),
    'teams', coalesce((select jsonb_agg(jsonb_build_object(
      'id', team.id, 'slug', team.slug, 'name', team.name
    ) order by team.name)
      from app.story_teams relation join app.teams team on team.id = relation.team_id
      where relation.story_id = edition.story_id), '[]'::jsonb),
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'id', player.id, 'slug', player.slug, 'name', player.display_name
    ) order by player.display_name)
      from app.story_players relation join app.players player on player.id = relation.player_id
      where relation.story_id = edition.story_id), '[]'::jsonb)
  );
end;
$$;
