-- BotolaGO Production V2
-- BG-0012: bridge News editorial authority onto the single Admin staff role
-- source of truth, and add the CMS read/write RPCs the in-app editor needs.
--
-- app_private.editorial_memberships is left in place (no destructive change)
-- but is no longer consulted by has_editorial_role: Admin staff role
-- assignments (app_private.staff_role_assignments / admin_role_permissions)
-- become the only source of editorial authority.

-- 1. Bridge: has_editorial_role now resolves through the Admin permission
--    model instead of the standalone editorial_memberships table.
--    Signature, language "sql", "stable" and "security definer" are
--    preserved so every existing caller (api.editorial_* functions) keeps
--    working unmodified.
create or replace function app_private.has_editorial_role(required_role app_private.editorial_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Admin permissions are not a strict inclusion hierarchy the way the old
  -- editorial_role enum was (e.g. the seeded 'publisher' role has
  -- editorial.publish but NOT editorial.write). To preserve the original
  -- editor ⊂ publisher ⊂ admin caller contract, each tier is satisfied by
  -- holding ANY permission that implies that tier or higher, not just one
  -- fixed permission name.
  select coalesce(
    case required_role
      when 'editor' then
        app_private.admin_has_permission(principal.id, 'editorial.write')
        or app_private.admin_has_permission(principal.id, 'editorial.publish')
      when 'publisher' then
        app_private.admin_has_permission(principal.id, 'editorial.publish')
      -- 'admin' is the highest editorial tier (story deletion). Only the
      -- content_admin and platform_admin Admin roles are seeded with
      -- editorial.manage_placements, so it doubles as the top-tier gate.
      when 'admin' then
        app_private.admin_has_permission(principal.id, 'editorial.manage_placements')
    end,
    false
  )
  from (select 1) seed
  left join app_private.staff_principals principal
    on principal.auth_user_id = auth.uid() and principal.status = 'active'
$$;

comment on function app_private.has_editorial_role(app_private.editorial_role) is
  'Resolves editorial authority from the Admin staff role/permission model '
  '(app_private.staff_role_assignments + admin_role_permissions) instead of '
  'the standalone app_private.editorial_memberships table, so Admin staff '
  'roles are the single source of truth for editorial capability.';

-- 2. api.editorial_list_stories: the CMS dashboard's only view of
--    non-published content (drafts/in_review/scheduled/rejected/archived).
create or replace function api.editorial_list_stories(
  p_language text default null,
  p_status app.publication_status default null,
  p_query text default null,
  p_limit integer default 20,
  p_after_updated_at timestamptz default null,
  p_after_id uuid default null
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
  if p_language is not null then
    selected_language := app_private.news_language(p_language);
  end if;
  if (p_after_updated_at is null) <> (p_after_id is null) then
    raise exception using errcode = '22023', message = 'news_invalid_cursor';
  end if;
  normalized_query := nullif(btrim(coalesce(p_query, '')), '');

  with base as (
    select edition.*, story.author_id, story.publisher_id, story.deleted_at as story_deleted_at
    from app.article_editions edition
    join app.stories story on story.id = edition.story_id
  ), selected as (
    select * from base
    where story_deleted_at is null
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
        'primaryCategory', category.value
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

comment on function api.editorial_list_stories(text, app.publication_status, text, integer, timestamptz, uuid) is
  'Keyset-paginated CMS listing across every publication status, gated by has_editorial_role(editor).';

-- 3. api.editorial_list_revisions: revision history panel for the editor.
create or replace function api.editorial_list_revisions(
  p_article_edition_id uuid,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  page_size integer := least(greatest(p_limit, 1), 50);
begin
  if not app_private.has_editorial_role('editor') then
    raise exception using errcode = '42501', message = 'news_editorial_forbidden';
  end if;
  if not exists (select 1 from app.article_editions where id = p_article_edition_id) then
    raise exception using errcode = 'P0002', message = 'news_article_not_found';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', revision.id,
      'revisionNumber', revision.revision_number,
      'title', revision.title,
      'subtitle', revision.subtitle,
      'summary', revision.summary,
      'bodyHtml', revision.body_html,
      'status', revision.status,
      'visibility', revision.visibility,
      'changedBy', revision.changed_by,
      'createdAt', revision.created_at
    ) order by revision.revision_number desc)
    from (
      select * from app.article_revisions
      where article_edition_id = p_article_edition_id
      order by revision_number desc
      limit page_size
    ) revision
  ), '[]'::jsonb);
end;
$$;

comment on function api.editorial_list_revisions(uuid, integer) is
  'Reads app.article_revisions snapshots for one edition, newest first, gated by has_editorial_role(editor).';

-- 4. api.editorial_register_media: metadata registration for an
--    already-uploaded storage object (bytes move via a trusted Edge
--    Function using the service role; see news-media-upload).
create or replace function api.editorial_register_media(
  p_storage_path text,
  p_mime_type text,
  p_width integer,
  p_height integer,
  p_alt_text text,
  p_caption text default null,
  p_credit text default null,
  p_copyright_owner text default null,
  p_license_url text default null,
  p_attribution_url text default null,
  p_kind app.media_kind default 'article_hero'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  media_id uuid;
  normalized_alt text := btrim(coalesce(p_alt_text, ''));
begin
  if not app_private.has_editorial_role('editor') then
    raise exception using errcode = '42501', message = 'news_editorial_forbidden';
  end if;
  if p_storage_path is null
    or p_storage_path !~ '^(football|news)/[a-z0-9/_-]+[.](avif|jpg|jpeg|png|webp)$'
  then
    raise exception using errcode = '22023', message = 'news_invalid_media_storage_path';
  end if;
  if p_mime_type is null or p_mime_type not in (
    'image/avif', 'image/jpeg', 'image/png', 'image/webp'
  ) then
    raise exception using errcode = '22023', message = 'news_invalid_media_mime_type';
  end if;
  if p_width is null or p_height is null
    or p_width not between 1 and 12000 or p_height not between 1 and 12000
  then
    raise exception using errcode = '22023', message = 'news_invalid_media_dimensions';
  end if;
  if char_length(normalized_alt) < 1 or char_length(normalized_alt) > 300 then
    raise exception using errcode = '22023', message = 'news_invalid_media_alt_text';
  end if;
  if p_license_url is not null and p_license_url !~ '^https://[^[:space:]]+$' then
    raise exception using errcode = '22023', message = 'news_invalid_media_license_url';
  end if;
  if p_attribution_url is not null and p_attribution_url !~ '^https://[^[:space:]]+$' then
    raise exception using errcode = '22023', message = 'news_invalid_media_attribution_url';
  end if;

  insert into app.media_assets (
    kind, storage_path, mime_type, width, height, alt_text, caption, credit,
    copyright_owner, license_url, attribution_url, validation_status, validated_at
  ) values (
    p_kind, p_storage_path, p_mime_type, p_width, p_height, normalized_alt, p_caption, p_credit,
    p_copyright_owner, p_license_url, p_attribution_url, 'validated', statement_timestamp()
  ) returning id into media_id;

  perform app_private.write_editorial_audit(
    'article_media_registered', null, null,
    jsonb_build_object('mediaAssetId', media_id, 'storagePath', p_storage_path)
  );
  return jsonb_build_object('mediaAssetId', media_id);
end;
$$;

comment on function api.editorial_register_media(
  text, text, integer, integer, text, text, text, text, text, text, app.media_kind
) is
  'Registers metadata for an object already uploaded to the news-media bucket by the trusted news-media-upload Edge Function; validates the same shapes as the app.media_assets CHECK constraints before insert.';

-- 5. api.editorial_get_article: not in the original RPC list, but the CMS
--    editor route (item 8 of the brief) cannot prefill its form fields
--    (subtitle/body/SEO/hero) after a page load or direct navigation
--    without a way to fetch one edition's full editable content -- neither
--    editorial_list_stories (summary row) nor editorial_list_revisions
--    (only prior snapshots, empty for a fresh draft) covers that. Added as
--    a small, additive, same-gate RPC to make the editor route functional.
create or replace function api.editorial_get_article(p_article_edition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  edition app.article_editions%rowtype;
begin
  if not app_private.has_editorial_role('editor') then
    raise exception using errcode = '42501', message = 'news_editorial_forbidden';
  end if;
  select * into edition from app.article_editions where id = p_article_edition_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'news_article_not_found';
  end if;
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
    'updatedAt', edition.updated_at
  );
end;
$$;

comment on function api.editorial_get_article(uuid) is
  'Fetches one article edition''s full editable content for the CMS editor, gated by has_editorial_role(editor). Not part of the original RPC brief; added because the editor route cannot prefill without it.';

revoke all on function app_private.has_editorial_role(app_private.editorial_role)
from public, anon, authenticated, service_role;
grant execute on function app_private.has_editorial_role(app_private.editorial_role) to postgres;

revoke all on function
  api.editorial_list_stories(text, app.publication_status, text, integer, timestamptz, uuid),
  api.editorial_list_revisions(uuid, integer),
  api.editorial_register_media(text, text, integer, integer, text, text, text, text, text, text, app.media_kind),
  api.editorial_get_article(uuid)
from public, anon, authenticated, service_role;
grant execute on function
  api.editorial_list_stories(text, app.publication_status, text, integer, timestamptz, uuid),
  api.editorial_list_revisions(uuid, integer),
  api.editorial_register_media(text, text, integer, integer, text, text, text, text, text, text, app.media_kind),
  api.editorial_get_article(uuid)
to authenticated;
