-- BotolaGO Production V2
-- Phase 4C: controlled News read models and mutation RPCs.
-- Canonical app tables remain outside PostgREST; api functions return stable
-- provider-independent JSON DTOs.

create or replace function app_private.news_language(value text)
returns app.language_code
language plpgsql
stable
strict
set search_path = ''
as $$
begin
  if value not in ('fr', 'ar') then
    raise exception using errcode = '22023', message = 'news_unsupported_language';
  end if;
  return value::app.language_code;
end;
$$;

create or replace function app_private.news_is_public(edition app.article_editions)
returns boolean
language sql
stable
set search_path = ''
as $$
  select edition.status = 'published'
    and edition.visibility in ('public', 'unlisted')
    and edition.published_at is not null
    and edition.published_at <= statement_timestamp()
    and not exists (
      select 1 from app.stories s where s.id = edition.story_id and s.deleted_at is not null
    )
$$;

create or replace function app_private.news_media_dto(asset_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when media.id is null then null else jsonb_build_object(
    'id', media.id,
    'sourceUrl', media.source_url,
    'storagePath', media.storage_path,
    'alt', media.alt_text,
    'caption', media.caption,
    'credit', coalesce(media.credit, media.attribution),
    'width', media.width,
    'height', media.height,
    'mimeType', media.mime_type
  ) end
  from (select 1) seed
  left join app.media_assets media on media.id = asset_id
    and media.validation_status = 'validated'
$$;

create or replace function app_private.news_article_card(
  edition app.article_editions,
  placement app.placement_type default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', edition.id,
    'storyId', edition.story_id,
    'language', edition.language,
    'slug', edition.slug,
    'title', edition.title,
    'subtitle', edition.subtitle,
    'summary', edition.summary,
    'publishedAt', edition.published_at,
    'updatedAt', edition.updated_at,
    'readingTimeMinutes', edition.reading_time_minutes,
    'hero', app_private.news_media_dto(edition.hero_asset_id),
    'author', case when author.id is null then null else jsonb_build_object(
      'id', author.id, 'slug', author.slug, 'name', author.display_name
    ) end,
    'publisher', case when publisher.id is null then null else jsonb_build_object(
      'id', publisher.id, 'slug', publisher.slug, 'name', publisher.name
    ) end,
    'primaryCategory', category.value,
    'tags', coalesce(tags.value, '[]'::jsonb),
    'teamIds', coalesce(teams.value, '[]'::jsonb),
    'competitionIds', coalesce(competitions.value, '[]'::jsonb),
    'placement', placement,
    'isSaved', exists (
      select 1 from app.saved_articles saved
      where saved.user_id = auth.uid() and saved.article_edition_id = edition.id
    )
  )
  from app.stories story
  left join app.authors author on author.id = story.author_id
  left join app.publishers publisher on publisher.id = story.publisher_id
  left join lateral (
    select jsonb_build_object(
      'id', taxonomy.id, 'slug', taxonomy.slug,
      'name', coalesce(translation.display_name, taxonomy.slug)
    ) as value
    from app.story_taxonomies relation
    join app.taxonomies taxonomy on taxonomy.id = relation.taxonomy_id
    left join app.taxonomy_translations translation
      on translation.taxonomy_id = taxonomy.id and translation.language = edition.language
    where relation.story_id = edition.story_id
      and taxonomy.taxonomy_type = 'category'
    order by relation.is_primary desc, taxonomy.display_order, taxonomy.id
    limit 1
  ) category on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', taxonomy.id, 'slug', taxonomy.slug,
      'name', coalesce(translation.display_name, taxonomy.slug)
    ) order by taxonomy.display_order, taxonomy.slug) as value
    from app.story_taxonomies relation
    join app.taxonomies taxonomy on taxonomy.id = relation.taxonomy_id
    left join app.taxonomy_translations translation
      on translation.taxonomy_id = taxonomy.id and translation.language = edition.language
    where relation.story_id = edition.story_id and taxonomy.taxonomy_type = 'tag'
  ) tags on true
  left join lateral (
    select jsonb_agg(relation.team_id order by relation.team_id) as value
    from app.story_teams relation where relation.story_id = edition.story_id
  ) teams on true
  left join lateral (
    select jsonb_agg(relation.competition_id order by relation.competition_id) as value
    from app.story_competitions relation where relation.story_id = edition.story_id
  ) competitions on true
  where story.id = edition.story_id
$$;

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
          and app_private.news_is_public(edition)
        order by edition.published_at desc, edition.id desc limit page_size
      ) latest
    ), '[]'::jsonb),
    'generatedAt', statement_timestamp()
  );
end;
$$;

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
    raise exception using errcode = 'P0002', message = 'news_article_not_found';
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
    where document.language = selected_language
      and document.search_vector @@ search_query
      and app_private.news_is_public(edition)
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

create or replace function api.news_taxonomies(p_language text, p_type text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_language app.language_code := app_private.news_language(p_language);
begin
  if p_type is not null and p_type not in ('category', 'topic', 'tag') then
    raise exception using errcode = '22023', message = 'news_invalid_taxonomy_type';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', taxonomy.id, 'type', taxonomy.taxonomy_type, 'slug', taxonomy.slug,
      'name', coalesce(translation.display_name, taxonomy.slug),
      'description', translation.description
    ) order by taxonomy.taxonomy_type, taxonomy.display_order, taxonomy.slug)
    from app.taxonomies taxonomy
    left join app.taxonomy_translations translation
      on translation.taxonomy_id = taxonomy.id and translation.language = selected_language
    where taxonomy.active and (p_type is null or taxonomy.taxonomy_type::text = p_type)
  ), '[]'::jsonb);
end;
$$;

create or replace function api.news_team_filters(p_language text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_language app.language_code := app_private.news_language(p_language);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', team.id,
      'slug', team.slug,
      'name', team.name,
      'shortName', team.short_name,
      'city', team.city,
      'code', team.code,
      'primaryColor', team.primary_color,
      'secondaryColor', team.secondary_color
    ) order by team.name, team.id)
    from app.teams team
    where team.active and exists (
      select 1 from app.story_teams relation
      join app.article_editions edition on edition.story_id = relation.story_id
      where relation.team_id = team.id
        and edition.language = selected_language
        and app_private.news_is_public(edition)
    )
  ), '[]'::jsonb);
end;
$$;

create or replace function api.news_saved_articles(
  p_limit integer default 20,
  p_after_created_at timestamptz default null,
  p_after_article_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  page_size integer := least(greatest(p_limit, 1), 50);
  result jsonb;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'auth_unauthorized';
  end if;
  if (p_after_created_at is null) <> (p_after_article_id is null) then
    raise exception using errcode = '22023', message = 'news_invalid_cursor';
  end if;

  with selected as (
    select saved.created_at as saved_at, edition as article, edition.id
    from app.saved_articles saved join app.article_editions edition on edition.id = saved.article_edition_id
    where saved.user_id = current_user_id and app_private.news_is_public(edition)
      and (p_after_created_at is null or (saved.created_at, saved.article_edition_id) < (p_after_created_at, p_after_article_id))
    order by saved.created_at desc, saved.article_edition_id desc limit page_size + 1
  ), page as (
    select * from selected order by saved_at desc, id desc limit page_size
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(
      app_private.news_article_card(page.article, null) || jsonb_build_object('savedAt', page.saved_at)
      order by page.saved_at desc, page.id desc) from page), '[]'::jsonb),
    'nextCursor', case when (select count(*) from selected) > page_size then (
      select jsonb_build_object('createdAt', saved_at, 'articleId', id)
      from page order by saved_at, id limit 1
    ) else null end
  ) into result;
  return result;
end;
$$;

create or replace function api.save_article(p_article_edition_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  saved_at timestamptz;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'auth_unauthorized';
  end if;
  if not exists (
    select 1 from app.article_editions
    where id = p_article_edition_id and app_private.news_is_public(article_editions)
  ) then
    raise exception using errcode = 'P0002', message = 'news_article_not_found';
  end if;
  insert into app.saved_articles (user_id, article_edition_id)
  values (current_user_id, p_article_edition_id)
  on conflict (user_id, article_edition_id) do nothing;
  select created_at into saved_at from app.saved_articles
  where user_id = current_user_id and article_edition_id = p_article_edition_id;
  return jsonb_build_object('articleId', p_article_edition_id, 'saved', true, 'savedAt', saved_at);
end;
$$;

create or replace function api.unsave_article(p_article_edition_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'auth_unauthorized';
  end if;
  delete from app.saved_articles
  where user_id = current_user_id and article_edition_id = p_article_edition_id;
  return jsonb_build_object('articleId', p_article_edition_id, 'saved', false);
end;
$$;

create or replace function api.editorial_create_draft(
  p_language text,
  p_slug text,
  p_title text,
  p_summary text,
  p_body_format app.article_body_format,
  p_body_source text,
  p_body_html text,
  p_reading_time_minutes smallint,
  p_sanitizer_version text,
  p_story_id uuid default null,
  p_author_id uuid default null,
  p_publisher_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_language app.language_code := app_private.news_language(p_language);
  target_story_id uuid := p_story_id;
  target_edition_id uuid;
begin
  if not app_private.has_editorial_role('editor') then
    raise exception using errcode = '42501', message = 'news_editorial_forbidden';
  end if;
  if target_story_id is null then
    insert into app.stories (origin, original_language, author_id, publisher_id, created_by)
    values ('manual', selected_language, p_author_id, p_publisher_id, auth.uid()) returning id into target_story_id;
  elsif not exists (select 1 from app.stories where id = target_story_id and deleted_at is null) then
    raise exception using errcode = 'P0002', message = 'news_story_not_found';
  end if;
  insert into app.article_editions (
    story_id, language, slug, title, summary, body_format, body_source, body_html,
    status, visibility, reading_time_minutes, sanitizer_version, created_by, updated_by
  ) values (
    target_story_id, selected_language, p_slug, p_title, p_summary, p_body_format,
    p_body_source, p_body_html, 'draft', 'private', p_reading_time_minutes,
    p_sanitizer_version, auth.uid(), auth.uid()
  ) returning id into target_edition_id;
  perform app_private.write_editorial_audit(
    'article_draft_created', target_story_id, target_edition_id, jsonb_build_object('language', selected_language)
  );
  return jsonb_build_object('storyId', target_story_id, 'articleId', target_edition_id, 'status', 'draft');
exception when unique_violation then
  raise exception using errcode = '23505', message = 'news_slug_or_translation_conflict';
end;
$$;

create or replace function api.editorial_transition_article(
  p_article_edition_id uuid,
  p_target_status app.publication_status,
  p_scheduled_at timestamptz default null,
  p_visibility app.article_visibility default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  edition app.article_editions%rowtype;
  required_role app_private.editorial_role;
  next_visibility app.article_visibility;
begin
  required_role := case when p_target_status in ('published', 'scheduled', 'unpublished', 'archived')
    then 'publisher'::app_private.editorial_role else 'editor'::app_private.editorial_role end;
  if not app_private.has_editorial_role(required_role) then
    raise exception using errcode = '42501', message = 'news_editorial_forbidden';
  end if;
  select * into edition from app.article_editions where id = p_article_edition_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'news_article_not_found'; end if;

  if not (
    (edition.status = 'draft' and p_target_status in ('in_review', 'rejected'))
    or (edition.status = 'in_review' and p_target_status in ('draft', 'scheduled', 'published', 'rejected'))
    or (edition.status = 'scheduled' and p_target_status in ('draft', 'published', 'unpublished'))
    or (edition.status = 'published' and p_target_status in ('unpublished', 'archived'))
    or (edition.status = 'unpublished' and p_target_status in ('draft', 'published', 'archived'))
    or (edition.status = 'rejected' and p_target_status = 'draft')
    or (edition.status = 'archived' and p_target_status = 'draft')
  ) then
    raise exception using errcode = '22023', message = 'news_invalid_status_transition';
  end if;

  next_visibility := coalesce(p_visibility, case when p_target_status in ('published', 'scheduled')
    then 'public'::app.article_visibility else edition.visibility end);
  update app.article_editions set
    status = p_target_status,
    visibility = next_visibility,
    scheduled_at = case when p_target_status = 'scheduled' then p_scheduled_at else null end,
    published_at = case when p_target_status = 'published' then coalesce(edition.published_at, statement_timestamp())
                        else edition.published_at end,
    unpublished_at = case when p_target_status in ('unpublished', 'archived') then statement_timestamp()
                          when p_target_status = 'published' then null else edition.unpublished_at end,
    updated_by = auth.uid()
  where id = edition.id;
  perform app_private.write_editorial_audit(
    'article_status_changed', edition.story_id, edition.id,
    jsonb_build_object('from', edition.status, 'to', p_target_status)
  );
  return jsonb_build_object('articleId', edition.id, 'status', p_target_status, 'visibility', next_visibility);
end;
$$;

create or replace function api.editorial_update_article(
  p_article_edition_id uuid,
  p_expected_updated_at timestamptz,
  p_slug text,
  p_title text,
  p_subtitle text,
  p_summary text,
  p_body_format app.article_body_format,
  p_body_source text,
  p_body_html text,
  p_reading_time_minutes smallint,
  p_sanitizer_version text,
  p_hero_asset_id uuid default null,
  p_seo_title text default null,
  p_seo_description text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare edition app.article_editions%rowtype;
begin
  if not app_private.has_editorial_role('editor') then
    raise exception using errcode = '42501', message = 'news_editorial_forbidden';
  end if;
  select * into edition from app.article_editions where id = p_article_edition_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'news_article_not_found'; end if;
  if edition.updated_at <> p_expected_updated_at then
    raise exception using errcode = '40001', message = 'news_editorial_conflict';
  end if;
  if edition.status not in ('draft', 'in_review', 'rejected', 'unpublished') then
    raise exception using errcode = '22023', message = 'news_article_not_editable';
  end if;
  update app.article_editions set
    slug = p_slug, title = p_title, subtitle = p_subtitle, summary = p_summary,
    body_format = p_body_format, body_source = p_body_source, body_html = p_body_html,
    reading_time_minutes = p_reading_time_minutes, sanitizer_version = p_sanitizer_version,
    hero_asset_id = p_hero_asset_id, seo_title = p_seo_title,
    seo_description = p_seo_description, updated_by = auth.uid()
  where id = edition.id;
  perform app_private.write_editorial_audit(
    'article_content_updated', edition.story_id, edition.id,
    jsonb_build_object('previousUpdatedAt', edition.updated_at)
  );
  return jsonb_build_object(
    'articleId', edition.id, 'status', edition.status,
    'updatedAt', (select updated_at from app.article_editions where id = edition.id)
  );
exception when unique_violation then
  raise exception using errcode = '23505', message = 'news_slug_or_translation_conflict';
end;
$$;

create or replace function api.editorial_set_placement(
  p_article_edition_id uuid,
  p_placement_type app.placement_type,
  p_scope_type app.placement_scope default 'global',
  p_scope_id uuid default null,
  p_priority smallint default 100,
  p_starts_at timestamptz default statement_timestamp(),
  p_ends_at timestamptz default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  edition app.article_editions%rowtype;
  placement_id uuid;
begin
  if not app_private.has_editorial_role('publisher') then
    raise exception using errcode = '42501', message = 'news_editorial_forbidden';
  end if;
  select * into edition from app.article_editions where id = p_article_edition_id;
  if not found then raise exception using errcode = 'P0002', message = 'news_article_not_found'; end if;
  if not app_private.news_is_public(edition) then
    raise exception using errcode = '22023', message = 'news_placement_requires_published_article';
  end if;
  select id into placement_id from app.editorial_placements
  where article_edition_id = edition.id and placement_type = p_placement_type
    and language = edition.language and scope_type = p_scope_type
    and scope_id is not distinct from p_scope_id
    and ends_at is null
  order by starts_at desc, id limit 1 for update;
  if found then
    update app.editorial_placements set priority = p_priority, starts_at = p_starts_at,
      ends_at = p_ends_at, created_by = auth.uid() where id = placement_id;
  else
    insert into app.editorial_placements (
      article_edition_id, placement_type, language, scope_type, scope_id,
      priority, starts_at, ends_at, created_by
    ) values (
      edition.id, p_placement_type, edition.language, p_scope_type, p_scope_id,
      p_priority, p_starts_at, p_ends_at, auth.uid()
    ) returning id into placement_id;
  end if;
  perform app_private.write_editorial_audit(
    'article_placement_set', edition.story_id, edition.id,
    jsonb_build_object('placementId', placement_id, 'type', p_placement_type)
  );
  return jsonb_build_object('placementId', placement_id, 'articleId', edition.id);
end;
$$;

create or replace function api.editorial_soft_delete_story(p_story_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not app_private.has_editorial_role('admin') then
    raise exception using errcode = '42501', message = 'news_editorial_forbidden';
  end if;
  update app.stories set deleted_at = coalesce(deleted_at, statement_timestamp()) where id = p_story_id;
  if not found then raise exception using errcode = 'P0002', message = 'news_story_not_found'; end if;
  delete from app.editorial_placements where article_edition_id in (
    select id from app.article_editions where story_id = p_story_id
  );
  perform app_private.write_editorial_audit('story_soft_deleted', p_story_id, null, '{}'::jsonb);
  return jsonb_build_object('storyId', p_story_id, 'deleted', true);
end;
$$;

create or replace function api.news_begin_ingestion_run(
  p_publisher_id uuid,
  p_job_type text,
  p_target_scope text default 'all',
  p_cursor text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare run_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'news_service_role_required';
  end if;
  insert into app_private.news_ingestion_runs (
    publisher_id, job_type, target_scope, status, cursor_value, started_at
  ) values (p_publisher_id, p_job_type, p_target_scope, 'running', p_cursor, statement_timestamp())
  returning id into run_id;
  return run_id;
end;
$$;

create or replace function api.news_complete_ingestion_run(
  p_run_id uuid,
  p_status app_private.news_ingestion_status,
  p_cursor text,
  p_fetched integer,
  p_validated integer,
  p_inserted integer,
  p_updated integer,
  p_skipped integer,
  p_rejected integer,
  p_error_code text default null,
  p_error_summary text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'news_service_role_required';
  end if;
  if p_status not in ('succeeded', 'partially_succeeded', 'failed', 'cancelled') then
    raise exception using errcode = '22023', message = 'news_invalid_ingestion_terminal_status';
  end if;
  update app_private.news_ingestion_runs set
    status = p_status, cursor_value = nullif(p_cursor, ''), completed_at = statement_timestamp(),
    records_fetched = p_fetched, records_validated = p_validated,
    records_inserted = p_inserted, records_updated = p_updated,
    records_skipped = p_skipped, records_rejected = p_rejected,
    error_code = p_error_code, error_summary = left(p_error_summary, 1000)
  where id = p_run_id and status = 'running';
  if not found then raise exception using errcode = 'P0002', message = 'news_ingestion_run_not_running'; end if;
end;
$$;

create or replace function api.news_record_ingestion_rejection(
  p_run_id uuid,
  p_external_id text,
  p_reason app_private.news_rejection_reason,
  p_error_code text,
  p_sanitized_summary text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'news_service_role_required';
  end if;
  insert into app_private.news_ingestion_rejections (
    run_id, external_id, reason, error_code, sanitized_summary
  ) values (
    p_run_id, nullif(left(p_external_id, 250), ''), p_reason,
    left(p_error_code, 80), left(p_sanitized_summary, 1000)
  );
end;
$$;

create or replace function api.news_register_source_article(
  p_publisher_id uuid,
  p_external_id text,
  p_story_id uuid,
  p_article_edition_id uuid,
  p_canonical_url text,
  p_content_fingerprint text,
  p_source_version text,
  p_source_published_at timestamptz,
  p_source_updated_at timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  existing app_private.news_source_articles%rowtype;
  mapping_existed boolean := false;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'news_service_role_required';
  end if;
  select * into existing from app_private.news_source_articles
  where publisher_id = p_publisher_id and external_id = p_external_id for update;
  mapping_existed := found;
  if found and existing.source_updated_at > p_source_updated_at then
    raise exception using errcode = '40001', message = 'news_stale_update';
  end if;
  if found and (existing.story_id <> p_story_id or existing.article_edition_id <> p_article_edition_id) then
    insert into app_private.news_duplicate_decisions (
      publisher_id, external_id, candidate_story_id, matched_story_id, decision, evidence_code
    ) values (p_publisher_id, p_external_id, p_story_id, existing.story_id, 'rejected_collision', 'external_id_collision');
    raise exception using errcode = '23505', message = 'news_mapping_collision';
  end if;
  insert into app_private.news_source_articles (
    publisher_id, external_id, story_id, article_edition_id, canonical_url,
    content_fingerprint, source_version, source_published_at, source_updated_at
  ) values (
    p_publisher_id, p_external_id, p_story_id, p_article_edition_id, p_canonical_url,
    p_content_fingerprint, p_source_version, p_source_published_at, p_source_updated_at
  ) on conflict (publisher_id, external_id) do update set
    canonical_url = excluded.canonical_url, content_fingerprint = excluded.content_fingerprint,
    source_version = excluded.source_version, source_published_at = excluded.source_published_at,
    source_updated_at = excluded.source_updated_at, last_seen_at = statement_timestamp(), active = true;
  return jsonb_build_object('storyId', p_story_id, 'articleId', p_article_edition_id,
    'created', not mapping_existed, 'sourceUpdatedAt', p_source_updated_at);
end;
$$;

revoke all on function app_private.news_language(text),
  app_private.news_is_public(app.article_editions), app_private.news_media_dto(uuid),
  app_private.news_article_card(app.article_editions, app.placement_type)
from public, anon, authenticated, service_role;
grant execute on function app_private.news_language(text),
  app_private.news_is_public(app.article_editions), app_private.news_media_dto(uuid),
  app_private.news_article_card(app.article_editions, app.placement_type)
to postgres;

revoke all on function api.news_feed(text, integer, timestamptz, uuid, text, text, uuid, uuid, uuid),
  api.news_home_modules(text, integer), api.news_article_detail(text, text),
  api.news_related_articles(uuid, integer),
  api.news_search(text, text, integer, real, timestamptz, uuid),
  api.news_taxonomies(text, text), api.news_team_filters(text),
  api.news_saved_articles(integer, timestamptz, uuid),
  api.save_article(uuid), api.unsave_article(uuid),
  api.editorial_create_draft(text, text, text, text, app.article_body_format, text, text, smallint, text, uuid, uuid, uuid),
  api.editorial_transition_article(uuid, app.publication_status, timestamptz, app.article_visibility),
  api.editorial_update_article(uuid, timestamptz, text, text, text, text, app.article_body_format, text, text, smallint, text, uuid, text, text),
  api.editorial_set_placement(uuid, app.placement_type, app.placement_scope, uuid, smallint, timestamptz, timestamptz),
  api.editorial_soft_delete_story(uuid), api.news_begin_ingestion_run(uuid, text, text, text),
  api.news_complete_ingestion_run(uuid, app_private.news_ingestion_status, text, integer, integer, integer, integer, integer, integer, text, text),
  api.news_record_ingestion_rejection(uuid, text, app_private.news_rejection_reason, text, text),
  api.news_register_source_article(uuid, text, uuid, uuid, text, text, text, timestamptz, timestamptz)
from public, anon, authenticated, service_role;

grant execute on function api.news_feed(text, integer, timestamptz, uuid, text, text, uuid, uuid, uuid),
  api.news_home_modules(text, integer), api.news_article_detail(text, text),
  api.news_related_articles(uuid, integer),
  api.news_search(text, text, integer, real, timestamptz, uuid),
  api.news_taxonomies(text, text), api.news_team_filters(text)
to anon, authenticated;
grant execute on function api.news_saved_articles(integer, timestamptz, uuid),
  api.save_article(uuid), api.unsave_article(uuid),
  api.editorial_create_draft(text, text, text, text, app.article_body_format, text, text, smallint, text, uuid, uuid, uuid),
  api.editorial_transition_article(uuid, app.publication_status, timestamptz, app.article_visibility),
  api.editorial_update_article(uuid, timestamptz, text, text, text, text, app.article_body_format, text, text, smallint, text, uuid, text, text),
  api.editorial_set_placement(uuid, app.placement_type, app.placement_scope, uuid, smallint, timestamptz, timestamptz),
  api.editorial_soft_delete_story(uuid)
to authenticated;
grant execute on function api.news_begin_ingestion_run(uuid, text, text, text),
  api.news_complete_ingestion_run(uuid, app_private.news_ingestion_status, text, integer, integer, integer, integer, integer, integer, text, text),
  api.news_record_ingestion_rejection(uuid, text, app_private.news_rejection_reason, text, text),
  api.news_register_source_article(uuid, text, uuid, uuid, text, text, text, timestamptz, timestamptz)
to service_role;

comment on function api.news_feed(text, integer, timestamptz, uuid, text, text, uuid, uuid, uuid) is
  'Keyset-paginated public News feed with taxonomy and Football entity filters.';
comment on function api.news_search(text, text, integer, real, timestamptz, uuid) is
  'Weighted language-aware full-text search; never uses substring LIKE scans.';
