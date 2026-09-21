-- BotolaGO News Engine — pipeline RPCs.
--
-- Every function here is `security definer`, pinned to an empty search_path,
-- and refuses anything that is not the service role. The engine runs as a
-- trusted server job; no browser role can reach these, and none of them grant
-- direct table access.
--
-- The write path is modelled on `api.news_ingest_provider_article`: validate
-- exhaustively in SQL first, take an advisory lock on the natural key, then
-- perform an idempotent upsert and return a jsonb outcome. Running the same
-- import ten times must produce the same rows, not ten articles.

-- ---------------------------------------------------------------------------
-- Shared guard
-- ---------------------------------------------------------------------------

-- Fails CLOSED. `auth.role()` is null in a session that carries no JWT at
-- all, and `null <> 'service_role'` is null, not true — a plain `<>` test
-- therefore skips the raise and lets such a session straight through. The
-- comparison must be `is distinct from`, which treats null as "not the
-- service role" rather than as "unknown, carry on".
create or replace function app_private.news_engine_require_service_role()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), auth.role(), '')
     is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'news_service_role_required';
  end if;
end;
$$;

-- Normalises a name for alias matching: case-folds, folds Latin accents,
-- strips Arabic diacritics and tatweel, unifies the alef/ya/ta-marbuta
-- variants, drops punctuation, and collapses whitespace.
--
-- Deliberately built from `translate` rather than `unaccent` so it is genuinely
-- IMMUTABLE and does not depend on a text-search dictionary. The engine applies
-- a character-for-character identical transform in TypeScript before calling
-- in, so both sides agree on what "the same name" means. `unaccent`'s second
-- `translate` argument being shorter than the first deletes the surplus
-- characters, which is how the diacritic strip works.
create or replace function app_private.news_engine_normalize_name(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    btrim(
      regexp_replace(
        regexp_replace(
          -- 3. Unify Arabic letter variants: alef forms, ya, ta marbuta, hamza.
          translate(
            -- 2. Delete Arabic diacritics and tatweel.
            translate(
              -- 1. Case-fold and flatten Latin accents and ligatures.
              translate(
                replace(replace(lower(coalesce(value, '')), 'œ', 'oe'), 'æ', 'ae'),
                'àáâãäåèéêëìíîïòóôõöùúûüýÿñçšžāēīōūğıś',
                'aaaaaaeeeeiiiiooooouuuuyyncszaeiougis'
              ),
              'ًٌٍَُِّْـٰ',
              ''
            ),
            'أإآٱىةؤئ',
            'اااايهءء'
          ),
          -- 4. Punctuation and symbols become separators.
          '[^[:alnum:][:space:]]+',
          ' ',
          'g'
        ),
        '[[:space:]]+',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

-- ---------------------------------------------------------------------------
-- Run ledger
-- ---------------------------------------------------------------------------

create or replace function api.news_engine_begin_run(
  p_source_slug text,
  p_job_type text,
  p_trigger_kind text default 'manual',
  p_target_scope text default 'all',
  p_dry_run boolean default false
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_source app_private.news_engine_sources%rowtype;
  run_id uuid;
begin
  perform app_private.news_engine_require_service_role();

  if p_job_type !~ '^[a-z][a-z0-9_]{2,79}$'
    or p_trigger_kind not in ('manual', 'schedule', 'reconciliation', 'backfill', 'retry')
  then
    raise exception using errcode = '22023', message = 'news_engine_invalid_run_request';
  end if;

  if p_source_slug is not null then
    select * into target_source from app_private.news_engine_sources where slug = p_source_slug;
    if not found then
      raise exception using errcode = 'P0002', message = 'news_engine_source_not_found';
    end if;
  end if;

  insert into app_private.news_engine_runs (
    source_id, job_type, trigger_kind, target_scope, status, dry_run
  ) values (
    target_source.id, p_job_type, p_trigger_kind,
    coalesce(nullif(btrim(p_target_scope), ''), 'all'), 'running', coalesce(p_dry_run, false)
  ) returning id into run_id;

  return run_id;
end;
$$;

create or replace function api.news_engine_complete_run(
  p_run_id uuid,
  p_status app_private.news_ingestion_status,
  p_counts jsonb default '{}'::jsonb,
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
  perform app_private.news_engine_require_service_role();

  if p_status not in ('succeeded', 'partially_succeeded', 'failed', 'cancelled') then
    raise exception using errcode = '22023', message = 'news_engine_invalid_terminal_status';
  end if;
  if jsonb_typeof(coalesce(p_counts, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'news_engine_invalid_counts';
  end if;

  update app_private.news_engine_runs set
    status = p_status,
    completed_at = statement_timestamp(),
    discovered_count = coalesce((p_counts ->> 'discovered')::integer, discovered_count),
    fetched_count = coalesce((p_counts ->> 'fetched')::integer, fetched_count),
    relevant_count = coalesce((p_counts ->> 'relevant')::integer, relevant_count),
    duplicate_count = coalesce((p_counts ->> 'duplicates')::integer, duplicate_count),
    extracted_count = coalesce((p_counts ->> 'extracted')::integer, extracted_count),
    clustered_count = coalesce((p_counts ->> 'clustered')::integer, clustered_count),
    generated_count = coalesce((p_counts ->> 'generated')::integer, generated_count),
    published_count = coalesce((p_counts ->> 'published')::integer, published_count),
    review_count = coalesce((p_counts ->> 'review')::integer, review_count),
    rejected_count = coalesce((p_counts ->> 'rejected')::integer, rejected_count),
    failed_count = coalesce((p_counts ->> 'failed')::integer, failed_count),
    error_code = left(p_error_code, 80),
    error_summary = left(p_error_summary, 2000)
  where id = p_run_id and status = 'running';

  if not found then
    raise exception using errcode = 'P0002', message = 'news_engine_run_not_running';
  end if;
end;
$$;

create or replace function api.news_engine_record_stage(
  p_run_id uuid,
  p_stage app_private.news_pipeline_stage,
  p_status app_private.news_ingestion_status,
  p_input_count integer default 0,
  p_output_count integer default 0,
  p_failed_count integer default 0,
  p_duration_ms integer default null,
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
  perform app_private.news_engine_require_service_role();

  insert into app_private.news_engine_run_stages (
    run_id, stage, status, input_count, output_count, failed_count,
    duration_ms, error_code, error_summary, completed_at
  ) values (
    p_run_id, p_stage, p_status,
    greatest(coalesce(p_input_count, 0), 0),
    greatest(coalesce(p_output_count, 0), 0),
    greatest(coalesce(p_failed_count, 0), 0),
    nullif(greatest(coalesce(p_duration_ms, 0), 0), 0),
    left(p_error_code, 80), left(p_error_summary, 2000),
    case when p_status = 'running' then null else statement_timestamp() end
  )
  on conflict (run_id, stage) do update set
    status = excluded.status,
    input_count = excluded.input_count,
    output_count = excluded.output_count,
    failed_count = excluded.failed_count,
    duration_ms = excluded.duration_ms,
    error_code = excluded.error_code,
    error_summary = excluded.error_summary,
    completed_at = excluded.completed_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Source claim
-- ---------------------------------------------------------------------------

-- Returns a source's full runtime configuration plus its discovery cursor, and
-- takes a transaction-scoped advisory lock so two concurrent runs cannot crawl
-- the same source at once. `p_force` bypasses the poll-interval check for
-- manual and backfill runs.
create or replace function api.news_engine_claim_source(
  p_source_slug text,
  p_force boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target app_private.news_engine_sources%rowtype;
  cursor_state app_private.news_source_discovery_state%rowtype;
begin
  perform app_private.news_engine_require_service_role();

  select * into target from app_private.news_engine_sources where slug = p_source_slug for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'news_engine_source_not_found';
  end if;
  if not target.enabled then
    raise exception using errcode = '42501', message = 'news_engine_source_disabled';
  end if;

  -- Transaction-scoped: released when the caller's transaction ends, so a
  -- crashed worker cannot wedge a source permanently.
  if not pg_try_advisory_xact_lock(hashtextextended('news_engine_source:' || target.slug, 0)) then
    raise exception using errcode = '55P03', message = 'news_engine_source_locked';
  end if;

  insert into app_private.news_source_discovery_state (source_id)
  values (target.id)
  on conflict (source_id) do nothing;

  select * into cursor_state
  from app_private.news_source_discovery_state where source_id = target.id;

  if not coalesce(p_force, false)
    and cursor_state.last_successful_discovery_at is not null
    and cursor_state.last_successful_discovery_at
        > statement_timestamp() - make_interval(secs => target.poll_interval_seconds)
  then
    raise exception using errcode = '55006', message = 'news_engine_source_not_due';
  end if;

  update app_private.news_source_discovery_state
  set last_attempted_discovery_at = statement_timestamp()
  where source_id = target.id;

  return jsonb_build_object(
    'source', jsonb_build_object(
      'id', target.id,
      'slug', target.slug,
      'name', target.name,
      'hostname', target.hostname,
      'publisherId', target.publisher_id,
      'sourceKind', target.source_kind,
      'languages', to_jsonb(target.source_languages),
      'discoveryMethod', target.discovery_method,
      'discoveryUrl', target.discovery_url,
      'articleUrlPattern', target.article_url_pattern,
      'allowedMediaHosts', to_jsonb(target.allowed_media_hosts),
      'priority', target.priority,
      'pollIntervalSeconds', target.poll_interval_seconds,
      'rateLimitPerMinute', target.rate_limit_per_minute,
      'maxConcurrency', target.max_concurrency,
      'requestTimeoutMs', target.request_timeout_ms,
      'maxRetries', target.max_retries,
      'parserVersion', target.parser_version,
      'articleFetchApproved', target.article_fetch_approved,
      'respectRobots', target.respect_robots,
      'config', target.config
    ),
    'discovery', jsonb_build_object(
      'lastSeenItemKey', cursor_state.last_seen_item_key,
      'lastSeenPublishedAt', cursor_state.last_seen_published_at,
      'lastSuccessfulDiscoveryAt', cursor_state.last_successful_discovery_at,
      'etag', cursor_state.http_etag,
      'lastModified', cursor_state.http_last_modified,
      'consecutiveFailures', cursor_state.consecutive_failures
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Discovery
-- ---------------------------------------------------------------------------

-- Records a discovery pass. Items already known by `(source, source_article_id)`
-- or by `(source, url_hash)` are counted as duplicates and left untouched, so a
-- listing that repeats yesterday's articles costs nothing.
create or replace function api.news_engine_record_discovery(
  p_source_slug text,
  p_items jsonb,
  p_last_seen_item_key text default null,
  p_last_seen_published_at timestamptz default null,
  p_etag text default null,
  p_last_modified text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target app_private.news_engine_sources%rowtype;
  item jsonb;
  inserted_count integer := 0;
  duplicate_count integer := 0;
  invalid_count integer := 0;
  new_ids uuid[] := '{}';
  new_id uuid;
  item_url text;
  item_hash text;
begin
  perform app_private.news_engine_require_service_role();

  select * into target from app_private.news_engine_sources where slug = p_source_slug;
  if not found then
    raise exception using errcode = 'P0002', message = 'news_engine_source_not_found';
  end if;
  if jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'news_engine_invalid_discovery_payload';
  end if;
  if jsonb_array_length(p_items) > 500 then
    raise exception using errcode = '22023', message = 'news_engine_discovery_batch_too_large';
  end if;

  for item in select * from jsonb_array_elements(p_items) loop
    item_url := item ->> 'sourceUrl';
    item_hash := item ->> 'urlHash';

    -- A URL that does not match the source's own anchored pattern never enters
    -- the pipeline. This is the boundary that keeps one source's crawler from
    -- wandering onto another host.
    if item_url is null
      or item_hash !~ '^[a-f0-9]{64}$'
      or (item ->> 'sourceArticleId') is null
      or item_url !~ target.article_url_pattern
      or split_part(split_part(item_url, '://', 2), '/', 1) <> target.hostname
      or not ((item ->> 'sourceLanguage') = any (target.source_languages))
    then
      invalid_count := invalid_count + 1;
      continue;
    end if;

    insert into app_private.news_source_items (
      source_id, source_article_id, source_url, url_hash, source_language,
      source_title, source_published_at, source_updated_at, metadata, status
    ) values (
      target.id,
      left(btrim(item ->> 'sourceArticleId'), 250),
      item_url,
      item_hash,
      item ->> 'sourceLanguage',
      nullif(left(btrim(coalesce(item ->> 'sourceTitle', '')), 500), ''),
      (item ->> 'sourcePublishedAt')::timestamptz,
      (item ->> 'sourceUpdatedAt')::timestamptz,
      coalesce(item -> 'metadata', '{}'::jsonb),
      'discovered'
    )
    on conflict do nothing
    returning id into new_id;

    if new_id is null then
      duplicate_count := duplicate_count + 1;
    else
      inserted_count := inserted_count + 1;
      new_ids := new_ids || new_id;
      new_id := null;
    end if;
  end loop;

  update app_private.news_source_discovery_state set
    last_seen_item_key = coalesce(nullif(btrim(coalesce(p_last_seen_item_key, '')), ''), last_seen_item_key),
    last_seen_published_at = greatest(
      coalesce(p_last_seen_published_at, last_seen_published_at),
      coalesce(last_seen_published_at, p_last_seen_published_at)
    ),
    last_successful_discovery_at = statement_timestamp(),
    http_etag = nullif(left(coalesce(p_etag, ''), 250), ''),
    http_last_modified = nullif(left(coalesce(p_last_modified, ''), 120), ''),
    consecutive_failures = 0,
    last_error_code = null
  where source_id = target.id;

  update app_private.news_engine_sources
  set last_successful_run_at = statement_timestamp()
  where id = target.id;

  return jsonb_build_object(
    'discovered', inserted_count,
    'duplicates', duplicate_count,
    'invalid', invalid_count,
    'itemIds', to_jsonb(new_ids)
  );
end;
$$;

create or replace function api.news_engine_record_discovery_failure(
  p_source_slug text,
  p_error_code text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare target_id uuid;
begin
  perform app_private.news_engine_require_service_role();

  select id into target_id from app_private.news_engine_sources where slug = p_source_slug;
  if target_id is null then
    raise exception using errcode = 'P0002', message = 'news_engine_source_not_found';
  end if;

  insert into app_private.news_source_discovery_state (source_id) values (target_id)
  on conflict (source_id) do nothing;

  update app_private.news_source_discovery_state set
    consecutive_failures = least(consecutive_failures + 1, 32767),
    last_error_code = left(p_error_code, 80),
    last_attempted_discovery_at = statement_timestamp()
  where source_id = target_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Work queue
-- ---------------------------------------------------------------------------

-- Bounded read of items waiting at a given stage. Returns the fields the next
-- stage needs and nothing more, so a worker never pulls whole article texts it
-- is not about to use. `p_include_text` is opt-in for the stages that do.
create or replace function api.news_engine_pending_items(
  p_status app_private.news_item_status,
  p_limit integer default 25,
  p_source_slug text default null,
  p_include_text boolean default false,
  p_since timestamptz default null,
  p_until timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform app_private.news_engine_require_service_role();

  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception using errcode = '22023', message = 'news_engine_invalid_limit';
  end if;

  select coalesce(jsonb_agg(entry order by entry ->> 'sourcePublishedAt' desc nulls last), '[]'::jsonb)
  into result
  from (
    select jsonb_build_object(
      'id', item.id,
      'sourceId', item.source_id,
      'sourceSlug', source.slug,
      'sourceName', source.name,
      'sourceArticleId', item.source_article_id,
      'sourceUrl', item.source_url,
      'sourceLanguage', item.source_language,
      'sourceTitle', item.source_title,
      'sourcePublishedAt', item.source_published_at,
      'sourceUpdatedAt', item.source_updated_at,
      'contentHash', item.content_hash,
      'etag', item.http_etag,
      'lastModified', item.http_last_modified,
      'metadata', item.metadata,
      'attemptCount', item.attempt_count,
      'clusterId', item.cluster_id,
      'articleFetchApproved', source.article_fetch_approved,
      'parserVersion', source.parser_version,
      'requestTimeoutMs', source.request_timeout_ms,
      'maxRetries', source.max_retries,
      'rateLimitPerMinute', source.rate_limit_per_minute,
      'allowedMediaHosts', to_jsonb(source.allowed_media_hosts),
      'text', case when coalesce(p_include_text, false) then item.normalized_source_text end
    ) as entry
    from app_private.news_source_items item
    join app_private.news_engine_sources source on source.id = item.source_id
    where item.status = p_status
      and (p_source_slug is null or source.slug = p_source_slug)
      and (p_since is null or item.source_published_at >= p_since)
      and (p_until is null or item.source_published_at <= p_until)
    order by item.source_published_at desc nulls last, item.id
    limit p_limit
  ) as rows;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fetch and parse
-- ---------------------------------------------------------------------------

-- Stores the parsed article. An unchanged `content_hash` short-circuits to
-- 'skipped' so a re-publish with no real change does not re-run extraction,
-- generation and the gates.
create or replace function api.news_engine_record_fetch(
  p_item_id uuid,
  p_content_hash text,
  p_normalized_text text,
  p_metadata jsonb default '{}'::jsonb,
  p_source_title text default null,
  p_source_published_at timestamptz default null,
  p_source_updated_at timestamptz default null,
  p_etag text default null,
  p_last_modified text default null,
  p_parser_version text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  item app_private.news_source_items%rowtype;
  unchanged boolean;
begin
  perform app_private.news_engine_require_service_role();

  if p_content_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'news_engine_invalid_content_hash';
  end if;
  if p_normalized_text is null or char_length(btrim(p_normalized_text)) < 40 then
    raise exception using errcode = '22023', message = 'news_engine_empty_source_text';
  end if;
  if char_length(p_normalized_text) > 200000 then
    raise exception using errcode = '22023', message = 'news_engine_source_text_too_large';
  end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'news_engine_invalid_metadata';
  end if;

  select * into item from app_private.news_source_items where id = p_item_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'news_engine_item_not_found';
  end if;

  unchanged := item.content_hash is not null
    and item.content_hash = p_content_hash
    and item.status not in ('discovered', 'failed');

  update app_private.news_source_items set
    content_hash = p_content_hash,
    normalized_source_text = p_normalized_text,
    metadata = item.metadata || coalesce(p_metadata, '{}'::jsonb),
    source_title = coalesce(nullif(left(btrim(coalesce(p_source_title, '')), 500), ''), item.source_title),
    source_published_at = coalesce(p_source_published_at, item.source_published_at),
    source_updated_at = coalesce(p_source_updated_at, item.source_updated_at),
    http_etag = coalesce(nullif(left(coalesce(p_etag, ''), 250), ''), item.http_etag),
    http_last_modified = coalesce(nullif(left(coalesce(p_last_modified, ''), 120), ''), item.http_last_modified),
    parser_version = coalesce(nullif(btrim(coalesce(p_parser_version, '')), ''), item.parser_version),
    fetched_at = statement_timestamp(),
    attempt_count = least(item.attempt_count + 1, 32767),
    status = case when unchanged then item.status else 'fetched'::app_private.news_item_status end,
    rejection_code = case when unchanged then item.rejection_code else null end,
    rejection_reason = case when unchanged then item.rejection_reason else null end
  where id = item.id;

  return jsonb_build_object(
    'itemId', item.id,
    'outcome', case when unchanged then 'skipped' else 'fetched' end,
    'contentHash', p_content_hash
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Relevance
-- ---------------------------------------------------------------------------

-- BotolaGO is not a general football aggregator. An item that fails the
-- relevance filter is kept with its score and reason so the filter can be
-- tuned from evidence rather than intuition.
create or replace function api.news_engine_record_relevance(
  p_item_id uuid,
  p_relevant boolean,
  p_score real,
  p_reason text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app_private.news_engine_require_service_role();

  if p_score is null or p_score < 0 or p_score > 1 then
    raise exception using errcode = '22023', message = 'news_engine_invalid_relevance_score';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception using errcode = '22023', message = 'news_engine_relevance_reason_required';
  end if;

  update app_private.news_source_items set
    relevance_score = p_score,
    relevance_reason = left(btrim(p_reason), 2000),
    status = case when p_relevant then 'parsed'::app_private.news_item_status
                  else 'irrelevant'::app_private.news_item_status end,
    rejection_code = case when p_relevant then null else 'IRRELEVANT'::app_private.news_failure_code end,
    rejection_reason = case when p_relevant then null else left(btrim(p_reason), 2000) end,
    processed_at = case when p_relevant then processed_at else statement_timestamp() end
  where id = p_item_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'news_engine_item_not_found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Entity resolution
-- ---------------------------------------------------------------------------

-- Resolves free-text mentions to canonical BotolaGO ids through the alias
-- table. Unresolved mentions come back explicitly: the engine records them
-- rather than inventing a new club because a spelling differed.
create or replace function api.news_engine_resolve_entities(
  p_entity_kind app_private.news_entity_kind,
  p_mentions text[],
  p_language text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform app_private.news_engine_require_service_role();

  if p_mentions is null or cardinality(p_mentions) = 0 then
    return '[]'::jsonb;
  end if;
  if cardinality(p_mentions) > 64 then
    raise exception using errcode = '22023', message = 'news_engine_too_many_mentions';
  end if;

  select coalesce(jsonb_agg(entry), '[]'::jsonb) into result
  from (
    select jsonb_build_object(
      'mention', mention.value,
      'normalized', app_private.news_engine_normalize_name(mention.value),
      'entityId', best.entity_id,
      'confidence', best.confidence
    ) as entry
    from unnest(p_mentions) as mention(value)
    left join lateral (
      select alias.entity_id, alias.confidence
      from app_private.news_entity_aliases alias
      where alias.active
        and alias.entity_kind = p_entity_kind
        and alias.normalized_alias = app_private.news_engine_normalize_name(mention.value)
      -- `language` ranks, it does not filter. An alias's script is already
      -- encoded in its normalised form -- "wydad ac" can only ever match a
      -- Latin mention -- so filtering on the article's language would only
      -- drop real matches. Moroccan Arabic copy routinely writes club names
      -- in Latin script, and an Arabic article naming "Wydad AC" must still
      -- resolve to Wydad rather than reporting an unresolved mention.
      order by
        case
          when p_language is null then 1
          when alias.language = p_language then 0
          when alias.language is null then 1
          else 2
        end,
        alias.confidence desc,
        alias.id
      limit 1
    ) as best on true
  ) as rows;

  return result;
end;
$$;

create or replace function api.news_engine_upsert_alias(
  p_entity_kind app_private.news_entity_kind,
  p_entity_id uuid,
  p_alias text,
  p_language text default null,
  p_confidence real default 1,
  p_origin text default 'seed'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  normalized text;
  alias_id uuid;
begin
  perform app_private.news_engine_require_service_role();

  normalized := app_private.news_engine_normalize_name(p_alias);
  if normalized is null or char_length(normalized) < 2 then
    raise exception using errcode = '22023', message = 'news_engine_invalid_alias';
  end if;
  if p_confidence is null or p_confidence <= 0 or p_confidence > 1 then
    raise exception using errcode = '22023', message = 'news_engine_invalid_alias_confidence';
  end if;

  -- The referenced entity must actually exist in the football catalog.
  if p_entity_kind = 'team' then
    perform 1 from app.teams where id = p_entity_id;
  elsif p_entity_kind = 'player' then
    perform 1 from app.players where id = p_entity_id;
  elsif p_entity_kind = 'competition' then
    perform 1 from app.competitions where id = p_entity_id;
  else
    -- Coaches have no catalog table yet; the id is accepted as opaque.
    perform 1;
  end if;
  if p_entity_kind in ('team', 'player', 'competition') and not found then
    raise exception using errcode = 'P0002', message = 'news_engine_alias_entity_not_found';
  end if;

  insert into app_private.news_entity_aliases (
    entity_kind, entity_id, alias, normalized_alias, language, confidence, origin
  ) values (
    p_entity_kind, p_entity_id, btrim(p_alias), normalized,
    p_language, p_confidence, coalesce(p_origin, 'seed')
  )
  on conflict (entity_kind, normalized_alias, entity_id) do update set
    alias = excluded.alias,
    language = coalesce(excluded.language, app_private.news_entity_aliases.language),
    confidence = excluded.confidence,
    origin = excluded.origin,
    active = true,
    updated_at = statement_timestamp()
  returning id into alias_id;

  return alias_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Facts
-- ---------------------------------------------------------------------------

create or replace function api.news_engine_record_facts(
  p_item_id uuid,
  p_event_type text,
  p_event_date date,
  p_competition_id uuid,
  p_fixture_id uuid,
  p_team_ids uuid[],
  p_player_ids uuid[],
  p_unresolved jsonb,
  p_score jsonb,
  p_claims jsonb,
  p_quotes jsonb,
  p_best_claim_status app_private.news_claim_status,
  p_extractor_version text,
  p_model text default null,
  p_confidence real default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  facts_id uuid;
  claim jsonb;
begin
  perform app_private.news_engine_require_service_role();

  if p_event_type !~ '^[a-z][a-z0-9_]{2,39}$' then
    raise exception using errcode = '22023', message = 'news_engine_invalid_event_type';
  end if;
  if jsonb_typeof(coalesce(p_claims, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_quotes, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_unresolved, '[]'::jsonb)) <> 'array'
  then
    raise exception using errcode = '22023', message = 'news_engine_invalid_fact_payload';
  end if;

  -- Every claim must carry a status from the closed vocabulary. This is what
  -- stops "reported" quietly becoming "confirmed" downstream.
  for claim in select * from jsonb_array_elements(coalesce(p_claims, '[]'::jsonb)) loop
    if (claim ->> 'status') is null
      or (claim ->> 'status') not in ('official', 'confirmed', 'reported', 'rumour', 'disputed')
      or (claim ->> 'text') is null
      or char_length(btrim(claim ->> 'text')) < 3
    then
      raise exception using errcode = '22023', message = 'news_engine_invalid_claim';
    end if;
  end loop;

  insert into app_private.news_extracted_facts (
    source_item_id, event_type, event_date, competition_id, fixture_id,
    team_ids, player_ids, unresolved, score, claims, quotes,
    best_claim_status, extractor_version, model, confidence
  ) values (
    p_item_id, p_event_type, p_event_date, p_competition_id, p_fixture_id,
    coalesce(p_team_ids, '{}'), coalesce(p_player_ids, '{}'),
    coalesce(p_unresolved, '[]'::jsonb), p_score,
    coalesce(p_claims, '[]'::jsonb), coalesce(p_quotes, '[]'::jsonb),
    coalesce(p_best_claim_status, 'reported'), p_extractor_version, p_model, p_confidence
  )
  on conflict (source_item_id) do update set
    event_type = excluded.event_type,
    event_date = excluded.event_date,
    competition_id = excluded.competition_id,
    fixture_id = excluded.fixture_id,
    team_ids = excluded.team_ids,
    player_ids = excluded.player_ids,
    unresolved = excluded.unresolved,
    score = excluded.score,
    claims = excluded.claims,
    quotes = excluded.quotes,
    best_claim_status = excluded.best_claim_status,
    extractor_version = excluded.extractor_version,
    model = excluded.model,
    confidence = excluded.confidence,
    updated_at = statement_timestamp()
  returning id into facts_id;

  update app_private.news_source_items
  set status = 'extracted', processed_at = statement_timestamp()
  where id = p_item_id and status in ('parsed', 'fetched', 'extracted');

  return facts_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Clustering
-- ---------------------------------------------------------------------------

-- Candidate clusters for an event, ranked by shared entities. The engine uses
-- this to decide whether a new article joins an existing story or starts one.
create or replace function api.news_engine_match_clusters(
  p_event_type text,
  p_event_date date,
  p_team_ids uuid[],
  p_player_ids uuid[],
  p_window_days integer default 5,
  p_limit integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform app_private.news_engine_require_service_role();

  select coalesce(jsonb_agg(entry order by (entry ->> 'score')::numeric desc), '[]'::jsonb)
  into result
  from (
    select jsonb_build_object(
      'clusterId', cluster.id,
      'clusterKey', cluster.cluster_key,
      'eventType', cluster.event_type,
      'eventDate', cluster.primary_event_date,
      'storyId', cluster.story_id,
      'status', cluster.status,
      'itemCount', cluster.item_count,
      'sharedTeams', cardinality(
        array(select unnest(cluster.team_ids) intersect select unnest(coalesce(p_team_ids, '{}')))
      ),
      'sharedPlayers', cardinality(
        array(select unnest(cluster.player_ids) intersect select unnest(coalesce(p_player_ids, '{}')))
      ),
      'score',
        cardinality(
          array(select unnest(cluster.player_ids) intersect select unnest(coalesce(p_player_ids, '{}')))
        ) * 2
        + cardinality(
          array(select unnest(cluster.team_ids) intersect select unnest(coalesce(p_team_ids, '{}')))
        )
    ) as entry
    from app_private.news_story_clusters cluster
    where cluster.event_type = p_event_type
      and (
        p_event_date is null
        or cluster.primary_event_date is null
        or abs(cluster.primary_event_date - p_event_date) <= greatest(coalesce(p_window_days, 5), 0)
      )
      and (
        cluster.team_ids && coalesce(p_team_ids, '{}')
        or cluster.player_ids && coalesce(p_player_ids, '{}')
      )
    order by cluster.last_seen_at desc
    limit greatest(least(coalesce(p_limit, 5), 25), 1)
  ) as rows;

  return result;
end;
$$;

-- Attaches an item to a cluster, creating the cluster if `p_cluster_key` is
-- new. The key is deterministic, so re-running the same import reuses the same
-- cluster instead of forking a second copy of the story.
create or replace function api.news_engine_assign_cluster(
  p_item_id uuid,
  p_cluster_key text,
  p_event_type text,
  p_event_date date,
  p_competition_id uuid,
  p_team_ids uuid[],
  p_player_ids uuid[],
  p_claim_status app_private.news_claim_status default 'reported',
  p_similarity real default 1,
  p_match_signal text default 'entity_event'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cluster app_private.news_story_clusters%rowtype;
  item app_private.news_source_items%rowtype;
  created boolean := false;
begin
  perform app_private.news_engine_require_service_role();

  if p_cluster_key is null or char_length(btrim(p_cluster_key)) < 8 then
    raise exception using errcode = '22023', message = 'news_engine_invalid_cluster_key';
  end if;

  select * into item from app_private.news_source_items where id = p_item_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'news_engine_item_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('news_engine_cluster:' || btrim(p_cluster_key), 0));

  select * into cluster from app_private.news_story_clusters
  where cluster_key = btrim(p_cluster_key) for update;

  if not found then
    insert into app_private.news_story_clusters (
      cluster_key, event_type, primary_event_date, competition_id,
      team_ids, player_ids, best_claim_status, status
    ) values (
      btrim(p_cluster_key), p_event_type, p_event_date, p_competition_id,
      coalesce(p_team_ids, '{}'), coalesce(p_player_ids, '{}'),
      coalesce(p_claim_status, 'reported'), 'clustered'
    ) returning * into cluster;
    created := true;
  else
    update app_private.news_story_clusters set
      -- Union the entity sets: a later article naming one more player enriches
      -- the story rather than replacing what earlier reporting established.
      team_ids = array(
        select distinct unnest(cluster.team_ids || coalesce(p_team_ids, '{}'))
      ),
      player_ids = array(
        select distinct unnest(cluster.player_ids || coalesce(p_player_ids, '{}'))
      ),
      competition_id = coalesce(cluster.competition_id, p_competition_id),
      primary_event_date = coalesce(cluster.primary_event_date, p_event_date),
      -- Claim strength only ratchets up.
      best_claim_status = case
        when array_position(
               array['rumour', 'disputed', 'reported', 'confirmed', 'official']::text[],
               coalesce(p_claim_status, 'reported')::text
             )
             > array_position(
               array['rumour', 'disputed', 'reported', 'confirmed', 'official']::text[],
               cluster.best_claim_status::text
             )
        then coalesce(p_claim_status, 'reported')
        else cluster.best_claim_status
      end,
      last_seen_at = statement_timestamp()
    where id = cluster.id
    returning * into cluster;
  end if;

  insert into app_private.news_cluster_items (cluster_id, source_item_id, similarity, match_signal)
  values (cluster.id, item.id, greatest(least(coalesce(p_similarity, 1), 1), 0), p_match_signal)
  on conflict (cluster_id, source_item_id) do update set
    similarity = excluded.similarity,
    match_signal = excluded.match_signal;

  update app_private.news_source_items
  set cluster_id = cluster.id,
      status = case when status = 'extracted' then 'clustered'::app_private.news_item_status else status end
  where id = item.id;

  update app_private.news_story_clusters set
    item_count = (select count(*) from app_private.news_cluster_items where cluster_id = cluster.id),
    source_count = (
      select count(distinct child.source_id)
      from app_private.news_cluster_items link
      join app_private.news_source_items child on child.id = link.source_item_id
      where link.cluster_id = cluster.id
    )
  where id = cluster.id;

  return jsonb_build_object(
    'clusterId', cluster.id,
    'clusterKey', cluster.cluster_key,
    'created', created,
    'storyId', cluster.story_id
  );
end;
$$;

create or replace function api.news_engine_flag_cluster_conflict(
  p_cluster_id uuid,
  p_summary text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app_private.news_engine_require_service_role();

  if p_summary is null or btrim(p_summary) = '' then
    raise exception using errcode = '22023', message = 'news_engine_conflict_summary_required';
  end if;

  update app_private.news_story_clusters
  set has_conflict = true, conflict_summary = left(btrim(p_summary), 2000)
  where id = p_cluster_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'news_engine_cluster_not_found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Failure inbox
-- ---------------------------------------------------------------------------

create or replace function api.news_engine_record_failure(
  p_stage app_private.news_pipeline_stage,
  p_failure_code app_private.news_failure_code,
  p_message text,
  p_run_id uuid default null,
  p_source_slug text default null,
  p_item_id uuid default null,
  p_cluster_id uuid default null,
  p_detail jsonb default '{}'::jsonb,
  p_retry_after_seconds integer default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  failure_id uuid;
  target_source_id uuid;
begin
  perform app_private.news_engine_require_service_role();

  if p_message is null or btrim(p_message) = '' then
    raise exception using errcode = '22023', message = 'news_engine_failure_message_required';
  end if;
  -- The failure inbox is read by operators, not by a secret store. Anything
  -- that looks like a credential is rejected at the boundary.
  if p_message ~* '(sb_secret_|sb_publishable_|sbp_|eyJ[A-Za-z0-9_-]{10,}\.|authorization:|bearer )' then
    raise exception using errcode = '22023', message = 'news_engine_failure_message_unsafe';
  end if;

  if p_source_slug is not null then
    select id into target_source_id from app_private.news_engine_sources where slug = p_source_slug;
  end if;

  insert into app_private.news_engine_failures (
    run_id, source_id, source_item_id, cluster_id, stage, failure_code,
    message, detail, next_retry_at
  ) values (
    p_run_id, target_source_id, p_item_id, p_cluster_id, p_stage, p_failure_code,
    left(btrim(p_message), 2000), coalesce(p_detail, '{}'::jsonb),
    case when p_retry_after_seconds is null then null
         else statement_timestamp() + make_interval(secs => greatest(p_retry_after_seconds, 0)) end
  ) returning id into failure_id;

  if p_item_id is not null then
    update app_private.news_source_items set
      status = case
        when p_failure_code = 'IRRELEVANT' then 'irrelevant'::app_private.news_item_status
        when p_failure_code in ('SIMILARITY_TOO_HIGH', 'FACT_CONFLICT', 'ENTITY_UNRESOLVED')
          then 'rejected'::app_private.news_item_status
        else 'failed'::app_private.news_item_status
      end,
      rejection_code = p_failure_code,
      rejection_reason = left(btrim(p_message), 2000),
      processed_at = statement_timestamp()
    where id = p_item_id;
  end if;

  return failure_id;
end;
$$;

-- Returns an item to the stage before the one that failed so a retry can run.
create or replace function api.news_engine_retry_failure(p_failure_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  failure app_private.news_engine_failures%rowtype;
  reset_status app_private.news_item_status;
begin
  perform app_private.news_engine_require_service_role();

  select * into failure from app_private.news_engine_failures
  where id = p_failure_id and resolved_at is null for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'news_engine_failure_not_found';
  end if;

  reset_status := case failure.stage
    when 'fetch' then 'discovered'
    when 'parse' then 'discovered'
    when 'relevance' then 'fetched'
    when 'extraction' then 'parsed'
    when 'entities' then 'parsed'
    when 'clustering' then 'extracted'
    when 'generation' then 'clustered'
    when 'validation' then 'clustered'
    when 'publication' then 'validated'
    else 'discovered'
  end;

  if failure.source_item_id is not null then
    update app_private.news_source_items set
      status = reset_status,
      rejection_code = null,
      rejection_reason = null
    where id = failure.source_item_id;
  end if;

  update app_private.news_engine_failures set
    retry_count = least(retry_count + 1, 100),
    next_retry_at = null,
    resolved_at = statement_timestamp(),
    resolution = 'retry_requeued'
  where id = failure.id;

  return jsonb_build_object(
    'failureId', failure.id,
    'itemId', failure.source_item_id,
    'clusterId', failure.cluster_id,
    'resetStatus', reset_status
  );
end;
$$;

create or replace function api.news_engine_resolve_failure(
  p_failure_id uuid,
  p_resolution text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app_private.news_engine_require_service_role();

  update app_private.news_engine_failures set
    resolved_at = statement_timestamp(),
    resolution = left(btrim(coalesce(p_resolution, 'resolved')), 1000)
  where id = p_failure_id and resolved_at is null;

  if not found then
    raise exception using errcode = 'P0002', message = 'news_engine_failure_not_found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function
  app_private.news_engine_require_service_role(),
  app_private.news_engine_normalize_name(text)
from public, anon, authenticated, service_role;
grant execute on function
  app_private.news_engine_require_service_role(),
  app_private.news_engine_normalize_name(text)
to postgres;

revoke all on function
  api.news_engine_begin_run(text, text, text, text, boolean),
  api.news_engine_complete_run(uuid, app_private.news_ingestion_status, jsonb, text, text),
  api.news_engine_record_stage(uuid, app_private.news_pipeline_stage, app_private.news_ingestion_status, integer, integer, integer, integer, text, text),
  api.news_engine_claim_source(text, boolean),
  api.news_engine_record_discovery(text, jsonb, text, timestamptz, text, text),
  api.news_engine_record_discovery_failure(text, text),
  api.news_engine_pending_items(app_private.news_item_status, integer, text, boolean, timestamptz, timestamptz),
  api.news_engine_record_fetch(uuid, text, text, jsonb, text, timestamptz, timestamptz, text, text, text),
  api.news_engine_record_relevance(uuid, boolean, real, text),
  api.news_engine_resolve_entities(app_private.news_entity_kind, text[], text),
  api.news_engine_upsert_alias(app_private.news_entity_kind, uuid, text, text, real, text),
  api.news_engine_record_facts(uuid, text, date, uuid, uuid, uuid[], uuid[], jsonb, jsonb, jsonb, jsonb, app_private.news_claim_status, text, text, real),
  api.news_engine_match_clusters(text, date, uuid[], uuid[], integer, integer),
  api.news_engine_assign_cluster(uuid, text, text, date, uuid, uuid[], uuid[], app_private.news_claim_status, real, text),
  api.news_engine_flag_cluster_conflict(uuid, text),
  api.news_engine_record_failure(app_private.news_pipeline_stage, app_private.news_failure_code, text, uuid, text, uuid, uuid, jsonb, integer),
  api.news_engine_retry_failure(uuid),
  api.news_engine_resolve_failure(uuid, text)
from public, anon, authenticated, service_role;

grant execute on function
  api.news_engine_begin_run(text, text, text, text, boolean),
  api.news_engine_complete_run(uuid, app_private.news_ingestion_status, jsonb, text, text),
  api.news_engine_record_stage(uuid, app_private.news_pipeline_stage, app_private.news_ingestion_status, integer, integer, integer, integer, text, text),
  api.news_engine_claim_source(text, boolean),
  api.news_engine_record_discovery(text, jsonb, text, timestamptz, text, text),
  api.news_engine_record_discovery_failure(text, text),
  api.news_engine_pending_items(app_private.news_item_status, integer, text, boolean, timestamptz, timestamptz),
  api.news_engine_record_fetch(uuid, text, text, jsonb, text, timestamptz, timestamptz, text, text, text),
  api.news_engine_record_relevance(uuid, boolean, real, text),
  api.news_engine_resolve_entities(app_private.news_entity_kind, text[], text),
  api.news_engine_upsert_alias(app_private.news_entity_kind, uuid, text, text, real, text),
  api.news_engine_record_facts(uuid, text, date, uuid, uuid, uuid[], uuid[], jsonb, jsonb, jsonb, jsonb, app_private.news_claim_status, text, text, real),
  api.news_engine_match_clusters(text, date, uuid[], uuid[], integer, integer),
  api.news_engine_assign_cluster(uuid, text, text, date, uuid, uuid[], uuid[], app_private.news_claim_status, real, text),
  api.news_engine_flag_cluster_conflict(uuid, text),
  api.news_engine_record_failure(app_private.news_pipeline_stage, app_private.news_failure_code, text, uuid, text, uuid, uuid, jsonb, integer),
  api.news_engine_retry_failure(uuid),
  api.news_engine_resolve_failure(uuid, text)
to service_role;

comment on function api.news_engine_claim_source(text, boolean) is
  'Service-role source claim with an advisory lock; two runs cannot crawl one source at once.';
comment on function api.news_engine_record_discovery(text, jsonb, text, timestamptz, text, text) is
  'Idempotent discovery upsert; already-known URLs and source ids are counted as duplicates, not reprocessed.';
comment on function api.news_engine_assign_cluster(uuid, text, text, date, uuid, uuid[], uuid[], app_private.news_claim_status, real, text) is
  'Attaches a source item to a deterministic story cluster; claim strength only ratchets upward.';
