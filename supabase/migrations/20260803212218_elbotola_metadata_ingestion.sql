-- ElBotola is prepared as an attributed link-metadata and remote hero-image
-- source. BotolaGO's owner confirmed permission on 2026-08-03. Article bodies
-- and image binaries are never copied; the publisher and runtime remain
-- disabled until a separate reviewed activation.

insert into app.publishers (
  slug, name, source_type, trust_status, ingestion_mode, website_url, active
) values (
  'elbotola', 'ElBotola', 'provider', 'review_required', 'api',
  'https://www.elbotola.com/', false
)
on conflict (slug) do update
set name = excluded.name,
    source_type = excluded.source_type,
    trust_status = case
      when app.publishers.trust_status = 'blocked' then 'blocked'::app.publisher_trust_status
      else excluded.trust_status
    end,
    ingestion_mode = excluded.ingestion_mode,
    website_url = excluded.website_url,
    active = false,
    updated_at = statement_timestamp();

create or replace function api.news_ingest_provider_article(
  p_provider_slug text,
  p_external_id text,
  p_canonical_url text,
  p_content_fingerprint text,
  p_language text,
  p_title text,
  p_summary text,
  p_body_html text,
  p_source_name text,
  p_source_url text,
  p_source_version text,
  p_source_published_at timestamptz,
  p_source_updated_at timestamptz,
  p_reading_time_minutes integer,
  p_sanitizer_version text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  transport_publisher app.publishers%rowtype;
  source_publisher app.publishers%rowtype;
  source_slug text;
  mapped app_private.news_source_articles%rowtype;
  target_story_id uuid;
  target_edition_id uuid;
  edition_source_updated_at timestamptz;
  latest_taxonomy_id uuid;
  matched_story_ids uuid[];
  outcome text := 'inserted';
  stable_slug text;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'news_service_role_required';
  end if;
  if p_provider_slug not in ('gnews', 'elbotola')
    or p_external_id is null or p_external_id <> btrim(p_external_id)
    or char_length(p_external_id) not between 1 and 250
    or p_language not in ('fr', 'ar')
    or p_title is null or p_title <> btrim(p_title) or char_length(p_title) not between 5 and 220
    or p_summary is null or p_summary <> btrim(p_summary) or char_length(p_summary) not between 10 and 1000
    or p_source_name is null or p_source_name <> btrim(p_source_name) or char_length(p_source_name) not between 2 and 160
    or p_content_fingerprint !~ '^[a-f0-9]{64}$'
    or p_canonical_url !~ '^https://[^[:space:]]+$'
    or p_source_url !~ '^https://[^[:space:]]+$'
    or p_canonical_url ~* '(access[_-]?token|api[_-]?key|signature|credential)='
    or p_source_url ~* '(access[_-]?token|api[_-]?key|signature|credential)='
    or p_source_published_at is null
    or p_source_updated_at is null
    or p_source_updated_at < p_source_published_at
    or p_source_published_at > statement_timestamp() + interval '5 minutes'
    or p_source_published_at < statement_timestamp() - interval '45 days'
    or p_reading_time_minutes not between 1 and 180
    or (
      (p_provider_slug = 'gnews' and p_sanitizer_version <> 'gnews-excerpt-v1')
      or (
        p_provider_slug = 'elbotola'
        and (
          p_sanitizer_version <> 'elbotola-link-v1'
          or p_language <> 'ar'
          or p_source_name <> 'ElBotola'
          or p_source_url <> 'https://www.elbotola.com/'
          or p_canonical_url !~ '^https://www[.]elbotola[.]com/article/[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]+[.]html$'
        )
      )
    )
    or char_length(p_body_html) not between 20 and 3000
    or p_body_html !~ '^<p>.*</p><p><a href="https://'
    or p_body_html ~* '<[[:space:]]*(script|iframe|object|embed|style|form|input|button|textarea|select|meta|link|img)([[:space:]>])'
    or p_body_html ~* 'on[a-z]+[[:space:]]*='
    or p_body_html ~* '(javascript|data[[:space:]]*:[[:space:]]*text/html)[[:space:]]*:'
    or p_source_version is null or char_length(p_source_version) not between 1 and 100
  then
    raise exception using errcode = '22023', message = 'news_invalid_provider_article';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_provider_slug || ':' || p_external_id, 0));

  select * into transport_publisher from app.publishers
  where slug = p_provider_slug and active and trust_status <> 'blocked'
  for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'news_provider_not_found';
  end if;

  if p_provider_slug = 'elbotola' then
    source_publisher := transport_publisher;
  else
    source_slug := 'gnews-source-' || left(encode(extensions.digest(lower(p_source_url), 'sha256'), 'hex'), 20);
    insert into app.publishers (
      slug, name, source_type, trust_status, ingestion_mode, website_url, active
    ) values (
      source_slug, p_source_name, 'provider', 'review_required', 'api', p_source_url, true
    ) on conflict (slug) do update
    set name = excluded.name,
        website_url = excluded.website_url,
        ingestion_mode = 'api',
        updated_at = statement_timestamp()
    where app.publishers.trust_status <> 'blocked'
    returning * into source_publisher;
    if not found or source_publisher.trust_status = 'blocked' then
      raise exception using errcode = '42501', message = 'news_source_blocked';
    end if;
  end if;

  select * into mapped from app_private.news_source_articles
  where publisher_id = transport_publisher.id and external_id = p_external_id
  for update;
  if found then
    target_story_id := mapped.story_id;
    target_edition_id := mapped.article_edition_id;
    if (
      mapped.content_fingerprint = p_content_fingerprint
      and mapped.source_version = p_source_version
    ) or mapped.source_updated_at >= p_source_updated_at
    then
      update app_private.news_source_articles
      set last_seen_at = statement_timestamp(), active = true
      where id = mapped.id;
      return jsonb_build_object(
        'outcome', 'skipped', 'storyId', target_story_id, 'articleId', target_edition_id
      );
    end if;
    outcome := 'updated';
  else
    select coalesce(array_agg(distinct id), '{}'::uuid[]) into matched_story_ids
    from app.stories
    where deleted_at is null
      and (canonical_url = p_canonical_url or content_fingerprint = p_content_fingerprint);
    if cardinality(matched_story_ids) > 1 then
      raise exception using errcode = '23505', message = 'news_duplicate_conflict';
    end if;
    target_story_id := matched_story_ids[1];
    if target_story_id is not null then
      outcome := 'updated';
      select edition.id, edition.source_updated_at
      into target_edition_id, edition_source_updated_at
      from app.article_editions edition
      where edition.story_id = target_story_id
        and language = p_language::app.language_code
      for update;
      if found and edition_source_updated_at >= p_source_updated_at then
        outcome := 'skipped';
      end if;
    end if;
  end if;

  if target_story_id is null then
    insert into app.stories (
      origin, original_language, publisher_id, canonical_url, content_fingerprint
    ) values (
      'provider', p_language::app.language_code, source_publisher.id,
      p_canonical_url, p_content_fingerprint
    ) returning id into target_story_id;
  elsif outcome <> 'skipped' then
    update app.stories
    set publisher_id = source_publisher.id,
        canonical_url = p_canonical_url,
        content_fingerprint = p_content_fingerprint,
        updated_at = statement_timestamp()
    where id = target_story_id;
  end if;

  stable_slug := p_provider_slug || '-' || p_language || '-'
    || left(encode(extensions.digest(p_external_id, 'sha256'), 'hex'), 24);
  if target_edition_id is null then
    insert into app.article_editions (
      story_id, language, slug, title, subtitle, summary,
      body_format, body_source, body_html, hero_asset_id,
      status, visibility, published_at, reading_time_minutes,
      sanitizer_version, source_updated_at
    ) values (
      target_story_id, p_language::app.language_code, stable_slug, p_title, null, p_summary,
      'rich_text', null, p_body_html, null,
      'published', 'public', p_source_published_at, p_reading_time_minutes,
      p_sanitizer_version, p_source_updated_at
    ) returning id into target_edition_id;
  elsif outcome <> 'skipped' then
    update app.article_editions
    set title = p_title,
        summary = p_summary,
        body_html = p_body_html,
        status = 'published',
        visibility = 'public',
        published_at = p_source_published_at,
        reading_time_minutes = p_reading_time_minutes,
        sanitizer_version = p_sanitizer_version,
        source_updated_at = p_source_updated_at,
        updated_at = statement_timestamp()
    where id = target_edition_id;
  end if;

  select id into latest_taxonomy_id from app.taxonomies
  where taxonomy_type = 'category' and slug = 'latest' and active;
  if latest_taxonomy_id is not null then
    insert into app.story_taxonomies (story_id, taxonomy_id, is_primary)
    values (target_story_id, latest_taxonomy_id, true)
    on conflict (story_id, taxonomy_id) do update set is_primary = true;
  end if;

  insert into app_private.news_source_articles (
    publisher_id, external_id, story_id, article_edition_id,
    canonical_url, content_fingerprint, source_version,
    source_published_at, source_updated_at, last_seen_at, active
  ) values (
    transport_publisher.id, p_external_id, target_story_id, target_edition_id,
    p_canonical_url, p_content_fingerprint, p_source_version,
    p_source_published_at, p_source_updated_at, statement_timestamp(), true
  ) on conflict (publisher_id, external_id) do update
  set canonical_url = excluded.canonical_url,
      content_fingerprint = excluded.content_fingerprint,
      source_version = excluded.source_version,
      source_published_at = excluded.source_published_at,
      source_updated_at = excluded.source_updated_at,
      last_seen_at = statement_timestamp(),
      active = true,
      updated_at = statement_timestamp();

  return jsonb_build_object(
    'outcome', outcome, 'storyId', target_story_id, 'articleId', target_edition_id
  );
end;
$$;

revoke all on function api.news_ingest_provider_article(
  text, text, text, text, text, text, text, text, text, text, text,
  timestamptz, timestamptz, integer, text
) from public, anon, authenticated;
grant execute on function api.news_ingest_provider_article(
  text, text, text, text, text, text, text, text, text, text, text,
  timestamptz, timestamptz, integer, text
) to service_role;

comment on function api.news_ingest_provider_article(
  text, text, text, text, text, text, text, text, text, text, text,
  timestamptz, timestamptz, integer, text
) is
  'Service-role-only atomic allowlisted provider link/excerpt ingestion with source attribution and idempotent deduplication.';

create or replace function api.news_attach_elbotola_hero(
  p_external_id text,
  p_source_url text,
  p_alt_text text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_mapping app_private.news_source_articles%rowtype;
  target_asset_id uuid;
  target_mime_type text;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'news_service_role_required';
  end if;
  if p_external_id is null
    or p_external_id <> btrim(p_external_id)
    or p_external_id !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]+$'
    or p_source_url is null
    or p_source_url <> btrim(p_source_url)
    or p_source_url !~* '^https://images2?[.]elbotola[.]com/article/[a-z0-9/_-]+[.](avif|jpg|jpeg|png|webp)$'
    or p_source_url ~* '(access[_-]?token|api[_-]?key|signature|credential)='
    or p_alt_text is null
    or p_alt_text <> btrim(p_alt_text)
    or char_length(p_alt_text) not between 5 and 500
    or p_alt_text ~ '[<>]'
  then
    raise exception using errcode = '22023', message = 'news_invalid_provider_media';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('elbotola-media:' || p_source_url, 0));

  select source_article.* into source_mapping
  from app_private.news_source_articles source_article
  join app.publishers publisher on publisher.id = source_article.publisher_id
  where publisher.slug = 'elbotola'
    and publisher.active
    and publisher.trust_status <> 'blocked'
    and source_article.external_id = p_external_id
    and source_article.active
  for update of source_article;
  if not found then
    raise exception using errcode = 'P0002', message = 'news_source_article_not_found';
  end if;

  target_mime_type := case
    when lower(p_source_url) ~ '[.]avif$' then 'image/avif'
    when lower(p_source_url) ~ '[.]png$' then 'image/png'
    when lower(p_source_url) ~ '[.]webp$' then 'image/webp'
    else 'image/jpeg'
  end;

  select media.id into target_asset_id
  from app.media_assets media
  where media.kind = 'article_hero'
    and media.source_url = p_source_url
  order by media.created_at, media.id
  limit 1
  for update;

  if target_asset_id is null then
    insert into app.media_assets (
      kind, source_url, attribution, license_code, validation_status,
      validated_at, mime_type, alt_text, credit, copyright_owner,
      attribution_url
    ) values (
      'article_hero', p_source_url, 'ElBotola', 'permission-on-file', 'validated',
      statement_timestamp(), target_mime_type, p_alt_text, 'ElBotola', 'ElBotola',
      source_mapping.canonical_url
    ) returning id into target_asset_id;
  else
    update app.media_assets
    set validation_status = 'validated',
        validated_at = statement_timestamp(),
        mime_type = target_mime_type,
        alt_text = p_alt_text,
        attribution = 'ElBotola',
        credit = 'ElBotola',
        copyright_owner = 'ElBotola',
        license_code = 'permission-on-file',
        attribution_url = source_mapping.canonical_url,
        updated_at = statement_timestamp()
    where id = target_asset_id;
  end if;

  update app.article_editions
  set hero_asset_id = target_asset_id,
      updated_at = statement_timestamp()
  where id = source_mapping.article_edition_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'news_article_edition_not_found';
  end if;

  return jsonb_build_object(
    'articleId', source_mapping.article_edition_id,
    'heroAssetId', target_asset_id
  );
end;
$$;

revoke all on function api.news_attach_elbotola_hero(text, text, text)
  from public, anon, authenticated;
grant execute on function api.news_attach_elbotola_hero(text, text, text)
  to service_role;

comment on function api.news_attach_elbotola_hero(text, text, text) is
  'Service-role-only attachment of permissioned, allowlisted ElBotola remote hero images; image binaries are not copied.';
