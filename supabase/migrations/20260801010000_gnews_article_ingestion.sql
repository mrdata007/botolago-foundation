-- GNews is a transport provider. Its articles remain attributed to their
-- original publisher and contain only a safe excerpt plus an outbound link.

insert into app.publishers (
  slug, name, source_type, trust_status, ingestion_mode, website_url, active
) values (
  'gnews', 'GNews', 'provider', 'trusted', 'api', 'https://gnews.io', true
)
on conflict (slug) do update
set name = excluded.name,
    source_type = excluded.source_type,
    trust_status = excluded.trust_status,
    ingestion_mode = excluded.ingestion_mode,
    website_url = excluded.website_url,
    active = true,
    updated_at = statement_timestamp();

with taxonomy as (
  insert into app.taxonomies (taxonomy_type, slug, active, display_order)
  values ('category', 'latest', true, 10)
  on conflict (taxonomy_type, slug) do update
    set active = true, display_order = excluded.display_order, updated_at = statement_timestamp()
  returning id
)
insert into app.taxonomy_translations (taxonomy_id, language, display_name, description)
select taxonomy.id, translation.language::app.language_code, translation.display_name, null
from taxonomy
cross join (values ('fr', 'Actualités'), ('ar', 'آخر الأخبار')) translation(language, display_name)
on conflict (taxonomy_id, language) do update
set display_name = excluded.display_name, updated_at = statement_timestamp();

create or replace function api.news_begin_provider_ingestion(
  p_provider_slug text,
  p_job_type text,
  p_target_scope text default 'all'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  provider app.publishers%rowtype;
  run_id uuid;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'news_service_role_required';
  end if;
  if p_provider_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or char_length(p_job_type) not between 2 and 80
    or char_length(p_target_scope) not between 1 and 250
  then
    raise exception using errcode = '22023', message = 'news_invalid_provider_run';
  end if;
  select * into provider from app.publishers
  where slug = p_provider_slug and active and trust_status <> 'blocked'
  for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'news_provider_not_found';
  end if;
  insert into app_private.news_ingestion_runs (
    publisher_id, job_type, target_scope, status, started_at
  ) values (
    provider.id, p_job_type, p_target_scope, 'running', statement_timestamp()
  ) returning id into run_id;
  return jsonb_build_object('runId', run_id, 'publisherId', provider.id);
end;
$$;

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
  if p_provider_slug <> 'gnews'
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
    or p_sanitizer_version <> 'gnews-excerpt-v1'
    or char_length(p_body_html) not between 20 and 3000
    or p_body_html !~ '^<p>.*</p><p><a href="https://'
    or p_body_html ~* '<[[:space:]]*(script|iframe|object|embed|style|form|input|button|textarea|select|meta|link|img)([[:space:]>])'
    or p_body_html ~* 'on[a-z]+[[:space:]]*='
    or p_body_html ~* '(javascript|data[[:space:]]*:[[:space:]]*text/html)[[:space:]]*:'
    or p_source_version is null or char_length(p_source_version) not between 1 and 100
  then
    raise exception using errcode = '22023', message = 'news_invalid_provider_article';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('gnews:' || p_external_id, 0));

  select * into transport_publisher from app.publishers
  where slug = p_provider_slug and active and trust_status <> 'blocked'
  for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'news_provider_not_found';
  end if;

  source_slug := 'gnews-source-' || left(encode(digest(lower(p_source_url), 'sha256'), 'hex'), 20);
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

  select * into mapped from app_private.news_source_articles
  where publisher_id = transport_publisher.id and external_id = p_external_id
  for update;
  if found then
    target_story_id := mapped.story_id;
    target_edition_id := mapped.article_edition_id;
    if mapped.source_updated_at >= p_source_updated_at
      and mapped.content_fingerprint = p_content_fingerprint
    then
      update app_private.news_source_articles
      set last_seen_at = statement_timestamp(), active = true
      where id = mapped.id;
      return jsonb_build_object('outcome', 'skipped', 'storyId', target_story_id, 'articleId', target_edition_id);
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
      select edition.id, edition.source_updated_at into target_edition_id, edition_source_updated_at
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

  stable_slug := 'gnews-' || p_language || '-' || left(encode(digest(p_external_id, 'sha256'), 'hex'), 24);
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

  return jsonb_build_object('outcome', outcome, 'storyId', target_story_id, 'articleId', target_edition_id);
end;
$$;

revoke all on function api.news_begin_provider_ingestion(text, text, text) from public, anon, authenticated;
revoke all on function api.news_ingest_provider_article(
  text, text, text, text, text, text, text, text, text, text, text,
  timestamptz, timestamptz, integer, text
) from public, anon, authenticated;
grant execute on function api.news_begin_provider_ingestion(text, text, text) to service_role;
grant execute on function api.news_ingest_provider_article(
  text, text, text, text, text, text, text, text, text, text, text,
  timestamptz, timestamptz, integer, text
) to service_role;

comment on function api.news_ingest_provider_article(
  text, text, text, text, text, text, text, text, text, text, text,
  timestamptz, timestamptz, integer, text
) is 'Service-role-only atomic GNews excerpt ingestion with source attribution and idempotent deduplication.';
