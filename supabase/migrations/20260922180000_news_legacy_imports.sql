-- BotolaGO Production V2
-- News activation: imported (third-party) stories become legacy records.
--
-- Production holds 108 editions ingested from GNews/ElBotola (stories.origin =
-- 'provider'). The stand-down (20260921170000) moved them to 'unpublished', but
-- 'unpublished' -> 'published' is an ordinary one-click transition for any
-- publisher, they filled the CMS list, and they looked like BotolaGO articles.
--
-- This migration:
--   1. archives every unconverted imported edition that is not already
--      archived (nothing is deleted; body, timestamps and source mapping stay);
--   2. makes an imported story unpublishable until an editorial admin
--      explicitly converts it (api.editorial_convert_imported_story), with a
--      recorded reason -- the conversion only unlocks the ordinary
--      draft -> review -> publish path, it publishes nothing;
--   3. adds the same rule to app_private.news_is_public, so even a direct
--      status change can never expose an unconverted import through any public
--      read (feed, detail, home, related, search, sitemap);
--   4. separates imports from editorial work in the CMS list (p_scope) and
--      tells the editor what an edition is (origin, conversion).

alter table app.stories
  add column import_converted_at timestamptz,
  add column import_converted_by uuid references auth.users(id) on delete set null,
  add column import_conversion_reason text,
  add constraint stories_import_conversion_check check (
    (import_converted_at is null and import_converted_by is null and import_conversion_reason is null)
    or (
      origin <> 'manual'
      and import_converted_at is not null
      and import_conversion_reason = btrim(import_conversion_reason)
      and char_length(import_conversion_reason) between 10 and 500
    )
  );

comment on column app.stories.import_converted_at is
  'Set only by api.editorial_convert_imported_story. An imported (origin <> manual) story is never publishable or public while this is null.';

-- 1. The single rule every other function uses.
create or replace function app_private.news_story_is_publishable(p_story_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app.stories story
    where story.id = p_story_id
      and story.deleted_at is null
      and (story.origin = 'manual' or story.import_converted_at is not null)
  )
$$;

revoke all on function app_private.news_story_is_publishable(uuid)
from public, anon, authenticated, service_role;
grant execute on function app_private.news_story_is_publishable(uuid) to postgres;

-- 2. Public visibility: the previous definition plus the publishable-story
--    rule (which already includes "story not deleted").
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
    and app_private.news_story_is_publishable(edition.story_id)
$$;

-- 3. Transitions: an unconverted import may only be withdrawn.
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

  if p_target_status not in ('unpublished', 'archived')
    and not app_private.news_story_is_publishable(edition.story_id)
  then
    raise exception using errcode = '22023', message = 'news_imported_story_requires_conversion';
  end if;

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

-- 4. The explicit, audited conversion. Editorial admins only (the same tier as
--    story deletion). It publishes nothing: the editions stay where they are
--    and must go through draft -> review -> publish like any other article.
create or replace function api.editorial_convert_imported_story(p_story_id uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  story app.stories%rowtype;
  normalized_reason text := btrim(coalesce(p_reason, ''));
begin
  if not app_private.has_editorial_role('admin') then
    raise exception using errcode = '42501', message = 'news_editorial_forbidden';
  end if;
  select * into story from app.stories where id = p_story_id and deleted_at is null for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'news_story_not_found';
  end if;
  if story.origin = 'manual' then
    raise exception using errcode = '22023', message = 'news_story_not_imported';
  end if;
  if story.import_converted_at is not null then
    return jsonb_build_object('storyId', story.id, 'convertedAt', story.import_converted_at, 'changed', false);
  end if;
  if char_length(normalized_reason) not between 10 and 500 then
    raise exception using errcode = '22023', message = 'news_conversion_reason_required';
  end if;
  update app.stories set
    import_converted_at = statement_timestamp(),
    import_converted_by = auth.uid(),
    import_conversion_reason = normalized_reason
  where id = story.id;
  perform app_private.write_editorial_audit(
    'imported_story_converted', story.id, null,
    jsonb_build_object('origin', story.origin, 'reasonLength', char_length(normalized_reason))
  );
  return jsonb_build_object('storyId', story.id, 'convertedAt', statement_timestamp(), 'changed', true);
end;
$$;

revoke all on function api.editorial_convert_imported_story(uuid, text)
from public, anon, authenticated, service_role;
grant execute on function api.editorial_convert_imported_story(uuid, text) to authenticated;

-- 5. CMS list: imports are listed separately. p_scope = 'editorial' (default:
--    manual stories and converted imports), 'imported' (unconverted imports,
--    still searchable), or 'all'.
drop function api.editorial_list_stories(text, app.publication_status, text, integer, timestamptz, uuid);

create function api.editorial_list_stories(
  p_language text default null,
  p_status app.publication_status default null,
  p_query text default null,
  p_limit integer default 20,
  p_after_updated_at timestamptz default null,
  p_after_id uuid default null,
  p_scope text default 'editorial'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_language app.language_code;
  page_size integer := least(greatest(p_limit, 1), 50);
  normalized_query text;
  result jsonb;
begin
  if not app_private.has_editorial_role('editor') then
    raise exception using errcode = '42501', message = 'news_editorial_forbidden';
  end if;
  if p_scope is null or p_scope not in ('editorial', 'imported', 'all') then
    raise exception using errcode = '22023', message = 'news_invalid_list_scope';
  end if;
  if p_language is not null then
    selected_language := app_private.news_language(p_language);
  end if;
  if (p_after_updated_at is null) <> (p_after_id is null) then
    raise exception using errcode = '22023', message = 'news_invalid_cursor';
  end if;
  normalized_query := nullif(btrim(coalesce(p_query, '')), '');

  with base as (
    select edition.*, story.author_id, story.publisher_id, story.deleted_at as story_deleted_at,
      story.origin as story_origin,
      (story.origin <> 'manual' and story.import_converted_at is null) as is_unconverted_import
    from app.article_editions edition
    join app.stories story on story.id = edition.story_id
  ), selected as (
    select * from base
    where story_deleted_at is null
      and (
        p_scope = 'all'
        or (p_scope = 'editorial' and not is_unconverted_import)
        or (p_scope = 'imported' and is_unconverted_import)
      )
      and (selected_language is null or language = selected_language)
      and (p_status is null or status = p_status)
      and (normalized_query is null or title ilike '%' || normalized_query || '%')
      and (p_after_updated_at is null or (updated_at, id) < (p_after_updated_at, p_after_id))
    order by updated_at desc, id desc
    limit page_size + 1
  ), page as (
    select * from selected order by updated_at desc, id desc limit page_size
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', page.id,
        'storyId', page.story_id,
        'language', page.language,
        'slug', page.slug,
        'title', page.title,
        'status', page.status,
        'visibility', page.visibility,
        'updatedAt', page.updated_at,
        'publishedAt', page.published_at,
        'scheduledAt', page.scheduled_at,
        'authorName', author.display_name,
        'publisherName', publisher.name,
        'primaryCategory', category.value,
        'origin', page.story_origin,
        'imported', page.is_unconverted_import
      ) order by page.updated_at desc, page.id desc)
      from page
      left join app.authors author on author.id = page.author_id
      left join app.publishers publisher on publisher.id = page.publisher_id
      left join lateral (
        select jsonb_build_object(
          'id', taxonomy.id, 'slug', taxonomy.slug,
          'name', coalesce(translation.display_name, taxonomy.slug)
        ) as value
        from app.story_taxonomies relation
        join app.taxonomies taxonomy on taxonomy.id = relation.taxonomy_id
        left join app.taxonomy_translations translation
          on translation.taxonomy_id = taxonomy.id and translation.language = page.language
        where relation.story_id = page.story_id and taxonomy.taxonomy_type = 'category'
        order by relation.is_primary desc, taxonomy.display_order, taxonomy.id
        limit 1
      ) category on true
    ), '[]'::jsonb),
    'nextCursor', case when (select count(*) from selected) > page_size then (
      select jsonb_build_object('updatedAt', updated_at, 'id', id)
      from page order by updated_at, id limit 1
    ) else null end
  ) into result;
  return result;
end;
$$;

comment on function api.editorial_list_stories(text, app.publication_status, text, integer, timestamptz, uuid, text) is
  'Keyset-paginated CMS listing, gated by has_editorial_role(editor). p_scope separates editorial work from unconverted imported (third-party) stories.';

revoke all on function api.editorial_list_stories(text, app.publication_status, text, integer, timestamptz, uuid, text)
from public, anon, authenticated, service_role;
grant execute on function api.editorial_list_stories(text, app.publication_status, text, integer, timestamptz, uuid, text)
to authenticated;

-- 6. The editor needs to know what it is looking at.
create or replace function api.editorial_get_article(p_article_edition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  edition app.article_editions%rowtype;
  story app.stories%rowtype;
begin
  if not app_private.has_editorial_role('editor') then
    raise exception using errcode = '42501', message = 'news_editorial_forbidden';
  end if;
  select * into edition from app.article_editions where id = p_article_edition_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'news_article_not_found';
  end if;
  select * into story from app.stories where id = edition.story_id;
  return jsonb_build_object(
    'id', edition.id,
    'storyId', edition.story_id,
    'language', edition.language,
    'slug', edition.slug,
    'title', edition.title,
    'subtitle', edition.subtitle,
    'summary', edition.summary,
    'bodyFormat', edition.body_format,
    'bodySource', edition.body_source,
    'bodyHtml', edition.body_html,
    'heroAssetId', edition.hero_asset_id,
    'hero', app_private.news_media_dto(edition.hero_asset_id),
    'status', edition.status,
    'visibility', edition.visibility,
    'scheduledAt', edition.scheduled_at,
    'publishedAt', edition.published_at,
    'readingTimeMinutes', edition.reading_time_minutes,
    'seoTitle', edition.seo_title,
    'seoDescription', edition.seo_description,
    'sanitizerVersion', edition.sanitizer_version,
    'updatedAt', edition.updated_at,
    'origin', story.origin,
    'imported', story.origin <> 'manual' and story.import_converted_at is null,
    'translations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sibling.id, 'language', sibling.language, 'status', sibling.status
      ) order by sibling.language)
      from app.article_editions sibling
      where sibling.story_id = edition.story_id and sibling.id <> edition.id
    ), '[]'::jsonb)
  );
end;
$$;

-- 7. Archive the imports that are still merely unpublished (or anything else
--    not already archived). A direct update, not the RPC: there is no session
--    user here. The revision trigger snapshots each row as usual.
do $$
declare
  archived_count integer;
begin
  update app.article_editions edition
  set status = 'archived',
      visibility = 'private',
      scheduled_at = null,
      unpublished_at = coalesce(edition.unpublished_at, statement_timestamp())
  from app.stories story
  where story.id = edition.story_id
    and story.origin <> 'manual'
    and story.import_converted_at is null
    and edition.status <> 'archived';
  get diagnostics archived_count = row_count;

  delete from app.editorial_placements placement
  using app.article_editions edition, app.stories story
  where placement.article_edition_id = edition.id
    and story.id = edition.story_id
    and story.origin <> 'manual'
    and story.import_converted_at is null;

  if archived_count > 0 then
    perform app_private.write_editorial_audit(
      'imported_editions_archived', null, null, jsonb_build_object('count', archived_count)
    );
  end if;
end;
$$;
