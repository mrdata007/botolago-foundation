-- News article detail: an edition id opened in the other language.
--
-- Found by read-only QA on 2026-10-11 (an auto-written match report). In
-- Arabic mode the site called api.news_article_detail('ar', <French edition
-- id>); the function only looks in the requested language, so it answered
-- 404 (NEWS404) and the client retried in French. The retry worked, but the
-- 404 appeared in the browser console, and the reader got the French text
-- even though the story has a public Arabic edition.
--
-- Now an edition id that is not in the requested language resolves, in order,
-- to (1) the requested language's public edition of the same story, then (2)
-- the edition the id names, if public. Anything else is still NEWS404.
-- Slug lookups are unchanged (slugs are language-specific). The function body
-- is otherwise verbatim from 20260924200600. Grants are preserved by
-- CREATE OR REPLACE.

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

  -- An edition id shared with a reader in the other language: serve that
  -- reader's own edition of the same story when one is public, otherwise the
  -- edition the id names (the page marks its language). Before this, the
  -- request answered 404 and the client retried in the other language, which
  -- left a failed request in the reader's console and showed the untranslated
  -- text even when a translation existed. Slugs stay language-specific.
  if not found and p_identifier ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select sibling.* into edition
    from app.article_editions named
    join app.article_editions sibling
      on sibling.story_id = named.story_id and sibling.language = selected_language
    where named.id = p_identifier::uuid
      and sibling.visibility = 'public'
      and app_private.news_is_public(sibling)
    limit 1;

    if not found then
      select candidate.* into edition
      from app.article_editions candidate
      where candidate.id = p_identifier::uuid
        and app_private.news_is_public(candidate)
      limit 1;
    end if;
  end if;

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
    -- When the article's text last really changed (see the header).
    'contentUpdatedAt', app_private.news_content_updated_at(edition),
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
      where relation.story_id = edition.story_id), '[]'::jsonb),
    -- The other-language editions of the same story that a reader could open
    -- right now. An unpublished, scheduled, private or unlisted sibling is
    -- never listed, so hreflang can never point at something not public.
    'translations', coalesce((select jsonb_agg(jsonb_build_object(
      'id', sibling.id, 'language', sibling.language, 'slug', sibling.slug
    ) order by sibling.language)
      from app.article_editions sibling
      where sibling.story_id = edition.story_id
        and sibling.id <> edition.id
        and sibling.visibility = 'public'
        and app_private.news_is_public(sibling)), '[]'::jsonb)
  );
end;
$$;
