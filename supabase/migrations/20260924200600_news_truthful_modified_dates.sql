-- Truthful modification dates for articles.
--
-- The sitemap's <lastmod>, the NewsArticle `dateModified`, the
-- `article:modified_time` tag and the visible "Mis à jour" chip all read
-- `article_editions.updated_at`. A bulk update on 2026-09-24 (09:00-12:57Z)
-- touched 15,690 editions without changing a word of them, so every article
-- -- including 2023 stories -- claimed to have been modified that morning
-- (audit 2026-09-24, P1-4). `updated_at` is bookkeeping: any column moving
-- bumps it.
--
-- What does record a real change is app.article_revisions: its trigger
-- (app_private.capture_article_revision) writes a row only when the title,
-- subtitle, summary, body, status or visibility changes, at the moment it
-- changes. Production holds 236 such rows; the 12:57 bulk update wrote none.
-- So an edition's content was last modified at the later of its publication
-- and its latest revision; an article never edited after publishing reports
-- its publication time.
--
-- news_article_detail and news_sitemap_entries gain `contentUpdatedAt`
-- (verbatim otherwise; both verified identical to production by md5 before
-- this migration). `updatedAt` is unchanged for the CMS, which uses it.

create or replace function app_private.news_content_updated_at(edition app.article_editions)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select greatest(
    edition.published_at,
    (select max(revision.created_at) from app.article_revisions revision
     where revision.article_edition_id = edition.id)
  )
$$;
revoke all on function app_private.news_content_updated_at(app.article_editions)
  from public, anon, authenticated, service_role;
comment on function app_private.news_content_updated_at(app.article_editions) is
  'When an edition''s text or status last really changed: the later of published_at and its latest article_revisions row. Not updated_at, which bookkeeping updates bump.';

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
      -- news_content_updated_at, as one join: a per-row look-up cost
      -- ~400 ms over 15,690 editions on production, the join 23 ms.
      'contentUpdatedAt', greatest(edition.published_at, last_revision.created_at),
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
    left join (
      select revision.article_edition_id, max(revision.created_at) as created_at
      from app.article_revisions revision
      group by revision.article_edition_id
    ) last_revision on last_revision.article_edition_id = edition.id
    where edition.visibility = 'public'
      and app_private.news_is_public(edition)
    order by edition.published_at desc, edition.id desc
    limit least(greatest(coalesce(p_limit, 5000), 1), 50000)
  ) entry
$$;
