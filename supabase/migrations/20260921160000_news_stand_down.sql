-- BG-0073 News stand-down.
--
-- The owner has decided to hide News for launch. Every article edition in this
-- database is a machine-ingested third-party link-out stub (created_by is null);
-- none is human-authored editorial work.
--
-- Two halves are required, because either one alone is undone by the other:
--
--   1. api.news_ingest_provider_article hardcoded 'published'/'public' on both
--      its insert and its update branch, so the scheduled GNews and ElBotola
--      runs re-published everything they re-saw within hours. Ingestion now
--      lands editions as 'draft'/'private' and never touches status, visibility
--      or published_at on update, so it can no longer resurrect an edition a
--      human deliberately unpublished. Promotion is from here on only possible
--      through api.editorial_transition_article, which requires a publisher
--      editorial role.
--
--   2. The editions that are already published are moved to
--      'unpublished'/'private'. Nothing is deleted: published -> unpublished ->
--      published is a legal, information-preserving round trip, and the owner
--      may licence this content later. The source timestamp is not lost either
--      - it stays on app_private.news_source_articles.source_published_at.
--
-- Ingestion keeps running and keeps collecting. It simply no longer reaches
-- readers.

-- 1. Stop ingestion from publishing.
--
-- This is api.news_ingest_provider_article exactly as deployed, with two
-- behavioural changes and nothing else:
--   * the insert branch lands 'draft'/'private' with a null published_at
--     (was 'published'/'public' with p_source_published_at);
--   * the update branch no longer writes status, visibility or published_at.
-- The service_role guard, the validation block, the advisory lock, publisher
-- resolution, duplicate detection, taxonomy and source-article bookkeeping and
-- the returned jsonb are unchanged.

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
      'draft', 'private', null, p_reading_time_minutes,
      p_sanitizer_version, p_source_updated_at
    ) returning id into target_edition_id;
  elsif outcome <> 'skipped' then
    update app.article_editions
    set title = p_title,
        summary = p_summary,
        body_html = p_body_html,
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
  'Service-role-only atomic allowlisted provider link/excerpt ingestion with source attribution and idempotent deduplication. Ingested editions land unpublished (draft/private) and are never promoted here; publication requires api.editorial_transition_article.';

-- 2. Unpublish the machine-ingested editions that are already public.
--
-- Kept as a function so that the stand-down can be exercised by the database
-- tests and re-run deliberately, and so that its idempotence is a property of
-- one piece of code rather than of a copied statement. The created_by is null
-- guard is what makes it safe: applied to a database where a human has since
-- published real editorial work, it cannot touch that work, and re-running it
-- finds nothing and writes no audit rows.
--
-- app_private.write_editorial_audit records auth.uid() as the actor. Here that
-- is null, and actor_user_id is nullable, so this records honestly as a system
-- action rather than pretending a user performed it; the metadata says so too.

create or replace function app_private.news_stand_down_machine_editions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  stood_down integer := 0;
  edition record;
begin
  for edition in
    with moved as (
      update app.article_editions
      set status = 'unpublished',
          visibility = 'private',
          unpublished_at = statement_timestamp()
      where status = 'published'
        and created_by is null
      returning id, story_id
    )
    select moved.id, moved.story_id from moved
  loop
    perform app_private.write_editorial_audit(
      'article_status_changed',
      edition.story_id,
      edition.id,
      jsonb_build_object(
        'from', 'published',
        'to', 'unpublished',
        'reason', 'news_stand_down',
        'change', 'bg_0073_news_stand_down',
        'initiated_by', 'operator',
        'actor', 'system'
      )
    );
    stood_down := stood_down + 1;
  end loop;
  return stood_down;
end;
$$;

revoke all on function app_private.news_stand_down_machine_editions()
  from public, anon, authenticated, service_role;

comment on function app_private.news_stand_down_machine_editions() is
  'BG-0073 operator stand-down: moves machine-ingested (created_by is null) published editions to unpublished/private and writes one editorial audit row each. Idempotent, never touches human-authored editions, deletes nothing.';

select app_private.news_stand_down_machine_editions();
