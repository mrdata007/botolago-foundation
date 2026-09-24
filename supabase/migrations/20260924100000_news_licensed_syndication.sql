-- BotolaGO Production V2
-- News: licensed syndication.
--
-- Until now every third-party story was an unlicensed stub, and the product
-- rule (BG-0091) was to show no third-party attribution at all. A publisher
-- that has licensed its articles to BotolaGO is the opposite case: its
-- articles may be published, and they must say where they come from.
--
--   * app.publishers gains the licence record (when, and the permission text)
--     and an Arabic display name, so an Arabic edition can say "البطولة".
--   * The article card gains `source`: {name, url} for a story whose
--     publisher holds a licence, null otherwise. The site shows it as
--     "Source : …" / "المصدر: …" and marks the page noindex, so the original
--     keeps the search credit and the copy does not count against BotolaGO.
--     news_article_card is otherwise identical to 20260720110107.
--   * The sitemap lists only BotolaGO's own stories. A syndicated edition
--     stays readable by link but is never advertised to search engines.
--     news_sitemap_entries is otherwise identical to 20260922180200.
--
-- No licence is granted here: that is a data change for the owner to make,
-- per publisher, with the permission text recorded alongside it.

alter table app.publishers
  add column name_ar text,
  add column syndication_licensed_at timestamptz,
  add column syndication_license_note text,
  add constraint publishers_name_ar_check check (
    name_ar is null or (name_ar = btrim(name_ar) and char_length(name_ar) between 2 and 160)
  ),
  add constraint publishers_syndication_license_check check (
    (syndication_licensed_at is null and syndication_license_note is null)
    or (
      syndication_licensed_at is not null
      and syndication_license_note is not null
      and syndication_license_note = btrim(syndication_license_note)
      and char_length(syndication_license_note) between 10 and 2000
    )
  );

comment on column app.publishers.syndication_licensed_at is
  'When this publisher licensed BotolaGO to republish its articles. Null: no licence, no attribution shown, articles never publishable as syndicated content.';
comment on column app.publishers.syndication_license_note is
  'The permission as given (text, who, how), recorded with the licence.';

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
    -- Attribution for licensed content only; an unlicensed source gets none.
    'source', case when publisher.syndication_licensed_at is null then null else jsonb_build_object(
      'name', case when edition.language = 'ar' then coalesce(publisher.name_ar, publisher.name)
        else publisher.name end,
      -- The original article, or nothing: a homepage is not "the original".
      'url', story.canonical_url
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
    join app.stories story on story.id = edition.story_id
    left join app.publishers publisher on publisher.id = story.publisher_id
    where edition.visibility = 'public'
      and app_private.news_is_public(edition)
      -- Only BotolaGO's own work is advertised; syndicated copies are not.
      and (publisher.id is null or publisher.slug = 'botolago' or publisher.slug like 'botolago-%')
    order by edition.published_at desc, edition.id desc
    limit least(greatest(coalesce(p_limit, 5000), 1), 50000)
  ) entry
$$;

comment on function api.news_sitemap_entries(integer) is
  'Public, listed editions of BotolaGO''s own stories (and their public counterparts) for /sitemap.xml. Never returns drafts, scheduled, unpublished, archived, unlisted, imported or syndicated editions.';
