-- BotolaGO Production V2
-- News activation: the public data technical SEO needs.
--
--   * api.news_article_detail gains `translations`: the other-language
--     editions of the same story that are public right now (published,
--     visibility public, publishable story). hreflang is built from this, so an
--     unpublished counterpart can never leak through metadata. The function is
--     otherwise identical to 20260921140000.
--   * api.news_sitemap_entries(): every edition that is public and listed
--     (visibility 'public'; 'unlisted' is readable by link but not advertised),
--     with its other-language counterparts, for /sitemap.xml. Bounded.

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

create or replace function api.news_sitemap_entries(p_limit integer default 5000)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(entry.value order by entry.published_at desc, entry.id desc), '[]'::jsonb)
  from (
    select edition.id, edition.published_at, jsonb_build_object(
      'id', edition.id,
      'language', edition.language,
      'slug', edition.slug,
      'publishedAt', edition.published_at,
      'updatedAt', edition.updated_at,
      'translations', coalesce((select jsonb_agg(jsonb_build_object(
        'id', sibling.id, 'language', sibling.language
      ) order by sibling.language)
        from app.article_editions sibling
        where sibling.story_id = edition.story_id
          and sibling.id <> edition.id
          and sibling.visibility = 'public'
          and app_private.news_is_public(sibling)), '[]'::jsonb)
    ) as value
    from app.article_editions edition
    where edition.visibility = 'public'
      and app_private.news_is_public(edition)
    order by edition.published_at desc, edition.id desc
    limit least(greatest(coalesce(p_limit, 5000), 1), 50000)
  ) entry
$$;

comment on function api.news_sitemap_entries(integer) is
  'Public, listed News editions (and their public counterparts) for /sitemap.xml. Never returns drafts, scheduled, unpublished, archived, unlisted or unconverted imported editions.';

revoke all on function api.news_sitemap_entries(integer) from public, anon, authenticated, service_role;
grant execute on function api.news_sitemap_entries(integer) to anon, authenticated;
