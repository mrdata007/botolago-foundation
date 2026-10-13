begin;

create or replace function api.news_article_detail(p_language text, p_identifier text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_language app.language_code := app_private.news_language(p_language);
  source app.article_editions%rowtype;
  edition app.article_editions%rowtype;
  identifier_is_uuid boolean :=
    p_identifier ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  card jsonb;
begin
  select candidate.* into source
  from app.article_editions candidate
  where candidate.id = case
      when identifier_is_uuid then p_identifier::uuid
      else candidate.id
    end
    and (identifier_is_uuid or candidate.slug = p_identifier)
    and app_private.news_is_public(candidate)
  order by (candidate.language = selected_language) desc,
    candidate.published_at desc,
    candidate.id desc
  limit 1;

  if not found then
    raise exception using errcode = 'P0002', message = 'news_article_not_found';
  end if;

  select candidate.* into edition
  from app.article_editions candidate
  where candidate.story_id = source.story_id
    and candidate.language = selected_language
    and app_private.news_is_public(candidate)
  order by candidate.published_at desc, candidate.id desc
  limit 1;

  if not found then
    edition := source;
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
      from app.story_taxonomies relation
      join app.taxonomies taxonomy on taxonomy.id = relation.taxonomy_id
      left join app.taxonomy_translations translation
        on translation.taxonomy_id = taxonomy.id and translation.language = edition.language
      where relation.story_id = edition.story_id
    ), '[]'::jsonb),
    'competitions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', competition.id, 'slug', competition.slug, 'name', competition.name
      ) order by competition.display_order, competition.name)
      from app.story_competitions relation
      join app.competitions competition on competition.id = relation.competition_id
      where relation.story_id = edition.story_id
    ), '[]'::jsonb),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', team.id, 'slug', team.slug, 'name', team.name
      ) order by team.name)
      from app.story_teams relation
      join app.teams team on team.id = relation.team_id
      where relation.story_id = edition.story_id
    ), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', player.id, 'slug', player.slug, 'name', player.display_name
      ) order by player.display_name)
      from app.story_players relation
      join app.players player on player.id = relation.player_id
      where relation.story_id = edition.story_id
    ), '[]'::jsonb)
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
  select * into source
  from app.article_editions
  where id = p_article_edition_id
    and app_private.news_is_public(article_editions);

  if not found then
    raise exception using errcode = 'P0002', message = 'news_article_not_found';
  end if;

  return coalesce((
    with candidates as (
      select
        candidate as article,
        candidate.published_at,
        candidate.id,
        coalesce(
          nullif(
            btrim(regexp_replace(
              app_private.normalize_news_text(candidate.title, candidate.language),
              '\s+', ' ', 'g'
            )),
            ''
          ),
          candidate.id::text
        ) as normalized_title,
        (select count(*)
          from app.story_taxonomies left_relation
          join app.story_taxonomies right_relation
            on right_relation.taxonomy_id = left_relation.taxonomy_id
          where left_relation.story_id = source.story_id
            and right_relation.story_id = candidate.story_id) * 4
        + (select count(*)
          from app.story_teams left_relation
          join app.story_teams right_relation
            on right_relation.team_id = left_relation.team_id
          where left_relation.story_id = source.story_id
            and right_relation.story_id = candidate.story_id) * 5
        + (select count(*)
          from app.story_competitions left_relation
          join app.story_competitions right_relation
            on right_relation.competition_id = left_relation.competition_id
          where left_relation.story_id = source.story_id
            and right_relation.story_id = candidate.story_id) * 3
        + (select count(*)
          from app.story_players left_relation
          join app.story_players right_relation
            on right_relation.player_id = left_relation.player_id
          where left_relation.story_id = source.story_id
            and right_relation.story_id = candidate.story_id) * 5 as relevance
      from app.article_editions candidate
      where candidate.id <> source.id
        and candidate.story_id <> source.story_id
        and candidate.language = source.language
        and app_private.news_is_public(candidate)
        and candidate.published_at >= source.published_at - interval '180 days'
    ),
    deduplicated as (
      select candidates.*,
        row_number() over (
          partition by normalized_title
          order by relevance desc, published_at desc, id desc
        ) as title_rank
      from candidates
      where relevance > 0
    )
    select jsonb_agg(
      app_private.news_article_card(candidate.article, null)
      order by candidate.relevance desc, candidate.published_at desc, candidate.id desc
    )
    from (
      select *
      from deduplicated
      where title_rank = 1
      order by relevance desc, published_at desc, id desc
      limit least(greatest(p_limit, 1), 12)
    ) candidate
  ), '[]'::jsonb);
end;
$$;

comment on function api.news_article_detail(text, text) is
  'Returns the requested published article translation, falling back to the published source edition.';
comment on function api.news_related_articles(uuid, integer) is
  'Returns bounded related articles with syndicated duplicate titles removed before limiting.';

commit;
