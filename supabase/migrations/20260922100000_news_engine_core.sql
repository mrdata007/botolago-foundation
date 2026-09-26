-- BotolaGO News Engine — operational core.
--
-- This migration adds the ingestion/editorial pipeline that turns public
-- third-party reporting into independently written BotolaGO articles.
--
-- Design rules this schema enforces:
--   * Every table lives in `app_private`. The pipeline's working state is
--     operational provenance, never public content. Published output lands in
--     the existing `app.stories` / `app.article_editions` model through the
--     publication RPC added by the companion `news_engine_api` migration, so
--     generated and hand-written articles share one public shape.
--   * Nothing here is reachable from the browser. RLS is enabled and forced on
--     every table and no policy is created, so only the SECURITY DEFINER
--     functions in `api` (service-role gated) can touch these rows.
--   * A source article's body is working material for fact extraction. It is
--     kept for provenance and quality review; it is never a publishable field
--     and no read path returns it to a client.
--   * Fantasy is untouched. Nothing in this migration references a fantasy
--     table, type, or function, so the engine can fail without affecting it.

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------

-- How a source is reached. Ordered by preference in the discovery layer:
-- structured feeds first, public HTML last.
create type app_private.news_discovery_method as enum (
  'news_sitemap', 'sitemap', 'rss', 'api', 'html_listing'
);

-- What kind of publisher a source is. Drives default trust and the claim
-- status the extractor is allowed to assign without corroboration.
create type app_private.news_source_kind as enum (
  'publisher', 'official_club', 'federation', 'confederation', 'aggregator'
);

-- Pipeline position of a single discovered source item. Forward-only except
-- for explicit retries, which reset to the failing stage's input state.
create type app_private.news_item_status as enum (
  'discovered',
  'fetched',
  'parsed',
  'irrelevant',
  'extracted',
  'clustered',
  'generated',
  'validated',
  'ready',
  'published',
  'rejected',
  'failed'
);

-- Confidence attached to an individual extracted claim. The generator may
-- never present a lower-confidence claim as a higher one.
create type app_private.news_claim_status as enum (
  'official', 'confirmed', 'reported', 'rumour', 'disputed'
);

-- Pipeline stages, used for per-stage run metrics and failure attribution.
create type app_private.news_pipeline_stage as enum (
  'discovery',
  'fetch',
  'parse',
  'relevance',
  'extraction',
  'entities',
  'clustering',
  'generation',
  'validation',
  'publication'
);

-- Failure taxonomy for the failure inbox. Stable codes so operators and the
-- admin UI can filter and retry by class.
create type app_private.news_failure_code as enum (
  'DISCOVERY_FAILED',
  'FETCH_FAILED',
  'PARSE_FAILED',
  'IRRELEVANT',
  'ENTITY_UNRESOLVED',
  'FACT_CONFLICT',
  'GENERATION_FAILED',
  'SIMILARITY_TOO_HIGH',
  'MEDIA_FAILED',
  'PUBLICATION_FAILED',
  'VALIDATION_FAILED'
);

-- Which BotolaGO entity an alias points at.
create type app_private.news_entity_kind as enum (
  'team', 'player', 'competition', 'coach'
);

-- Outcome of the originality / factual gates for one generated edition.
create type app_private.news_quality_verdict as enum (
  'passed', 'needs_review', 'needs_regeneration', 'rejected'
);

-- ---------------------------------------------------------------------------
-- Source registry
-- ---------------------------------------------------------------------------

-- One row per configured news source. ElBotola is seeded by the companion
-- seed migration; adding FRMF, CAF, a club site or Hespress later is a row
-- plus a parser profile, not an architecture change.
create table app_private.news_engine_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  hostname text not null,
  -- The publisher this source attributes to. Reuses the existing publisher
  -- identity so provenance joins the editorial model already in place.
  publisher_id uuid references app.publishers(id) on delete restrict,
  source_kind app_private.news_source_kind not null default 'publisher',
  -- Languages the source publishes that this engine will consume.
  source_languages text[] not null default array['ar'],
  discovery_method app_private.news_discovery_method not null,
  -- Absolute HTTPS entry point for discovery (news sitemap, RSS, listing).
  discovery_url text not null,
  -- Anchored regex an article URL must match before it is ever fetched.
  article_url_pattern text not null,
  -- Exact hostnames a hero image may be referenced from. Empty means no
  -- source media is permitted at all.
  allowed_media_hosts text[] not null default '{}',
  enabled boolean not null default false,
  -- Lower runs first when several sources are due in the same pass.
  priority smallint not null default 100,
  poll_interval_seconds integer not null default 1800,
  rate_limit_per_minute smallint not null default 20,
  max_concurrency smallint not null default 2,
  request_timeout_ms integer not null default 15000,
  max_retries smallint not null default 2,
  -- Bumped whenever the parser profile changes so already-parsed items can be
  -- re-parsed deliberately instead of silently drifting.
  parser_version text not null default 'v1',
  -- Server-side approval flag mirror. The engine additionally requires an
  -- environment approval; both must agree before any article page is read.
  article_fetch_approved boolean not null default false,
  respect_robots boolean not null default true,
  last_successful_run_at timestamptz,
  -- Human notes on permission, cadence, attribution and access limits. This is
  -- an operational record, never a substitute for the private legal record.
  access_notes text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint news_engine_sources_slug_key unique (slug),
  constraint news_engine_sources_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint news_engine_sources_name_check check (
    name = btrim(name) and char_length(name) between 2 and 160
  ),
  constraint news_engine_sources_hostname_check check (
    hostname = lower(btrim(hostname))
    and hostname ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
  ),
  constraint news_engine_sources_languages_check check (
    cardinality(source_languages) between 1 and 4
    and source_languages <@ array['ar', 'fr', 'en', 'es']
  ),
  constraint news_engine_sources_discovery_url_check check (
    discovery_url ~ '^https://[^[:space:]]+$'
    and discovery_url !~* '(access[_-]?token|api[_-]?key|signature|credential)='
  ),
  constraint news_engine_sources_pattern_check check (
    article_url_pattern like '^https://%' and char_length(article_url_pattern) between 12 and 400
  ),
  constraint news_engine_sources_media_hosts_check check (
    cardinality(allowed_media_hosts) <= 8
  ),
  constraint news_engine_sources_priority_check check (priority between 1 and 1000),
  constraint news_engine_sources_poll_check check (poll_interval_seconds between 300 and 604800),
  constraint news_engine_sources_rate_check check (rate_limit_per_minute between 1 and 120),
  constraint news_engine_sources_concurrency_check check (max_concurrency between 1 and 8),
  constraint news_engine_sources_timeout_check check (request_timeout_ms between 1000 and 60000),
  constraint news_engine_sources_retries_check check (max_retries between 0 and 5),
  constraint news_engine_sources_parser_version_check check (
    parser_version ~ '^[a-z0-9][a-z0-9._-]{0,39}$'
  ),
  constraint news_engine_sources_notes_check check (
    access_notes is null or char_length(access_notes) <= 4000
  )
);

create index news_engine_sources_due_idx
  on app_private.news_engine_sources (enabled, priority, last_successful_run_at);

-- Incremental discovery cursor. One row per source: the engine compares each
-- listing against this instead of recrawling history on every scheduled run.
create table app_private.news_source_discovery_state (
  source_id uuid primary key references app_private.news_engine_sources(id) on delete cascade,
  last_seen_item_key text,
  last_seen_published_at timestamptz,
  last_successful_discovery_at timestamptz,
  last_attempted_discovery_at timestamptz,
  -- Conditional-request validators so an unchanged listing costs one 304.
  http_etag text,
  http_last_modified text,
  consecutive_failures smallint not null default 0,
  last_error_code text,
  updated_at timestamptz not null default statement_timestamp(),
  constraint news_source_discovery_state_key_check check (
    last_seen_item_key is null or char_length(last_seen_item_key) between 1 and 250
  ),
  constraint news_source_discovery_state_etag_check check (
    http_etag is null or char_length(http_etag) between 1 and 250
  ),
  constraint news_source_discovery_state_modified_check check (
    http_last_modified is null or char_length(http_last_modified) between 1 and 120
  ),
  constraint news_source_discovery_state_failures_check check (
    consecutive_failures between 0 and 32767
  ),
  constraint news_source_discovery_state_error_check check (
    last_error_code is null or char_length(last_error_code) between 1 and 80
  )
);

-- ---------------------------------------------------------------------------
-- Story clusters
-- ---------------------------------------------------------------------------

-- One real-world event, however many source articles describe it.
-- "Player X joins Raja", "Raja complete X signing" and "Official: Raja
-- announce X" collapse to one cluster, and therefore one BotolaGO story.
create table app_private.news_story_clusters (
  id uuid primary key default gen_random_uuid(),
  -- Deterministic identity derived from event type + resolved entities +
  -- event date. Recomputing it for the same event yields the same key, which
  -- is what makes repeated imports idempotent.
  cluster_key text not null,
  event_type text not null,
  primary_event_date date,
  competition_id uuid references app.competitions(id) on delete set null,
  -- Denormalised resolved entities; the ranked signal for cluster matching
  -- and, later, for the story's public Football relations.
  team_ids uuid[] not null default '{}',
  player_ids uuid[] not null default '{}',
  -- Highest claim status seen across the cluster's items. A cluster that has
  -- reached 'official' never regresses to 'reported' on a later weak item.
  best_claim_status app_private.news_claim_status not null default 'reported',
  item_count integer not null default 0,
  source_count integer not null default 0,
  -- Set once the cluster has produced a BotolaGO story.
  story_id uuid references app.stories(id) on delete set null,
  status app_private.news_item_status not null default 'clustered',
  has_conflict boolean not null default false,
  conflict_summary text,
  first_seen_at timestamptz not null default statement_timestamp(),
  last_seen_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint news_story_clusters_key_unique unique (cluster_key),
  constraint news_story_clusters_key_check check (
    cluster_key = btrim(cluster_key) and char_length(cluster_key) between 8 and 250
  ),
  constraint news_story_clusters_event_type_check check (
    event_type ~ '^[a-z][a-z0-9_]{2,39}$'
  ),
  constraint news_story_clusters_counts_check check (
    item_count >= 0 and source_count >= 0 and source_count <= item_count
  ),
  constraint news_story_clusters_entities_check check (
    cardinality(team_ids) <= 16 and cardinality(player_ids) <= 32
  ),
  constraint news_story_clusters_conflict_check check (
    (has_conflict and conflict_summary is not null and char_length(conflict_summary) <= 2000)
    or (not has_conflict and conflict_summary is null)
  ),
  constraint news_story_clusters_seen_check check (last_seen_at >= first_seen_at)
);

create index news_story_clusters_status_idx
  on app_private.news_story_clusters (status, last_seen_at desc, id);
create index news_story_clusters_story_idx
  on app_private.news_story_clusters (story_id) where story_id is not null;
create index news_story_clusters_event_idx
  on app_private.news_story_clusters (event_type, primary_event_date desc);
create index news_story_clusters_teams_idx
  on app_private.news_story_clusters using gin (team_ids);
create index news_story_clusters_players_idx
  on app_private.news_story_clusters using gin (player_ids);

-- ---------------------------------------------------------------------------
-- Source items
-- ---------------------------------------------------------------------------

-- A single discovered article from a single source. This is the provenance
-- record: it is never rendered publicly and never becomes a public article by
-- itself.
create table app_private.news_source_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references app_private.news_engine_sources(id) on delete restrict,
  -- The source's own stable identifier for the article.
  source_article_id text not null,
  source_url text not null,
  -- sha256 of the normalised URL; the cheap duplicate check before any fetch.
  url_hash text not null,
  source_language text not null,
  source_title text,
  source_published_at timestamptz,
  source_updated_at timestamptz,
  -- Plain text extracted from the article page, used only as extraction input
  -- and as the comparison corpus for the originality gate.
  normalized_source_text text,
  -- Parser output that is not itself article prose: byline, section, tags,
  -- JSON-LD fields, declared hero URL.
  metadata jsonb not null default '{}'::jsonb,
  -- sha256 of the normalised text; detects a re-publish with no real change.
  content_hash text,
  http_etag text,
  http_last_modified text,
  parser_version text,
  status app_private.news_item_status not null default 'discovered',
  -- Why an item was dropped. Kept so relevance tuning is evidence-based.
  rejection_code app_private.news_failure_code,
  rejection_reason text,
  relevance_score real,
  relevance_reason text,
  cluster_id uuid references app_private.news_story_clusters(id) on delete set null,
  discovered_at timestamptz not null default statement_timestamp(),
  fetched_at timestamptz,
  processed_at timestamptz,
  attempt_count smallint not null default 0,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint news_source_items_source_article_key unique (source_id, source_article_id),
  constraint news_source_items_url_hash_key unique (source_id, url_hash),
  constraint news_source_items_article_id_check check (
    source_article_id = btrim(source_article_id)
    and char_length(source_article_id) between 1 and 250
  ),
  constraint news_source_items_url_check check (
    source_url ~ '^https://[^[:space:]]+$'
    and source_url !~* '(access[_-]?token|api[_-]?key|signature|credential)='
  ),
  constraint news_source_items_url_hash_check check (url_hash ~ '^[a-f0-9]{64}$'),
  constraint news_source_items_content_hash_check check (
    content_hash is null or content_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint news_source_items_language_check check (source_language in ('ar', 'fr', 'en', 'es')),
  constraint news_source_items_title_check check (
    source_title is null or char_length(source_title) between 1 and 500
  ),
  constraint news_source_items_text_check check (
    normalized_source_text is null or char_length(normalized_source_text) <= 200000
  ),
  constraint news_source_items_relevance_check check (
    relevance_score is null or (relevance_score >= 0 and relevance_score <= 1)
  ),
  constraint news_source_items_rejection_check check (
    rejection_reason is null or char_length(rejection_reason) <= 2000
  ),
  constraint news_source_items_relevance_reason_check check (
    relevance_reason is null or char_length(relevance_reason) <= 2000
  ),
  constraint news_source_items_attempts_check check (attempt_count between 0 and 32767),
  constraint news_source_items_parser_version_check check (
    parser_version is null or char_length(parser_version) between 1 and 40
  ),
  -- A terminal rejection must say why. Silent drops are the failure mode this
  -- constraint exists to prevent.
  constraint news_source_items_rejection_code_check check (
    status not in ('rejected', 'irrelevant', 'failed') or rejection_code is not null
  )
);

create index news_source_items_status_idx
  on app_private.news_source_items (status, discovered_at desc, id);
create index news_source_items_source_status_idx
  on app_private.news_source_items (source_id, status, source_published_at desc);
create index news_source_items_cluster_idx
  on app_private.news_source_items (cluster_id) where cluster_id is not null;
create index news_source_items_content_hash_idx
  on app_private.news_source_items (content_hash) where content_hash is not null;
create index news_source_items_published_idx
  on app_private.news_source_items (source_published_at desc, id);

-- Cluster membership with the score that put an item there, so a bad merge can
-- be explained rather than guessed at.
create table app_private.news_cluster_items (
  cluster_id uuid not null references app_private.news_story_clusters(id) on delete cascade,
  source_item_id uuid not null references app_private.news_source_items(id) on delete cascade,
  similarity real not null default 1,
  match_signal text not null,
  joined_at timestamptz not null default statement_timestamp(),
  constraint news_cluster_items_pkey primary key (cluster_id, source_item_id),
  constraint news_cluster_items_similarity_check check (similarity >= 0 and similarity <= 1),
  constraint news_cluster_items_signal_check check (
    match_signal ~ '^[a-z][a-z0-9_]{2,39}$'
  )
);

create index news_cluster_items_item_idx on app_private.news_cluster_items (source_item_id);

-- ---------------------------------------------------------------------------
-- Extracted facts
-- ---------------------------------------------------------------------------

-- Structured facts distilled from one source item. This is the boundary that
-- keeps BotolaGO output original: generation reads facts, never source prose.
create table app_private.news_extracted_facts (
  id uuid primary key default gen_random_uuid(),
  source_item_id uuid not null references app_private.news_source_items(id) on delete cascade,
  event_type text not null,
  event_date date,
  competition_id uuid references app.competitions(id) on delete set null,
  fixture_id uuid references app.fixtures(id) on delete set null,
  -- Resolved BotolaGO entity ids; unresolved mentions stay in `unresolved`.
  team_ids uuid[] not null default '{}',
  player_ids uuid[] not null default '{}',
  -- [{ "kind": "team"|"player"|..., "mention": "...", "language": "ar" }]
  unresolved jsonb not null default '[]'::jsonb,
  -- { "home": 2, "away": 1 } or null.
  score jsonb,
  -- [{ "text": "...", "status": "official", "confidence": 0.9 }]
  claims jsonb not null default '[]'::jsonb,
  -- [{ "speaker": "...", "text": "...", "attribution": "..." }]
  quotes jsonb not null default '[]'::jsonb,
  -- Corroboration notes across sources within the cluster.
  verification jsonb not null default '[]'::jsonb,
  -- Strongest status across all claims; drives the publication policy.
  best_claim_status app_private.news_claim_status not null default 'reported',
  extractor_version text not null,
  model text,
  confidence real,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint news_extracted_facts_item_key unique (source_item_id),
  constraint news_extracted_facts_event_type_check check (
    event_type ~ '^[a-z][a-z0-9_]{2,39}$'
  ),
  constraint news_extracted_facts_entities_check check (
    cardinality(team_ids) <= 16 and cardinality(player_ids) <= 32
  ),
  constraint news_extracted_facts_claims_check check (
    jsonb_typeof(claims) = 'array' and jsonb_array_length(claims) <= 40
  ),
  constraint news_extracted_facts_quotes_check check (
    jsonb_typeof(quotes) = 'array' and jsonb_array_length(quotes) <= 20
  ),
  constraint news_extracted_facts_unresolved_check check (
    jsonb_typeof(unresolved) = 'array' and jsonb_array_length(unresolved) <= 40
  ),
  constraint news_extracted_facts_verification_check check (
    jsonb_typeof(verification) = 'array' and jsonb_array_length(verification) <= 40
  ),
  constraint news_extracted_facts_score_check check (
    score is null or jsonb_typeof(score) = 'object'
  ),
  constraint news_extracted_facts_version_check check (
    extractor_version ~ '^[a-z0-9][a-z0-9._-]{0,39}$'
  ),
  constraint news_extracted_facts_model_check check (
    model is null or char_length(model) between 1 and 80
  ),
  constraint news_extracted_facts_confidence_check check (
    confidence is null or (confidence >= 0 and confidence <= 1)
  )
);

create index news_extracted_facts_event_idx
  on app_private.news_extracted_facts (event_type, event_date desc);

-- ---------------------------------------------------------------------------
-- Entity aliases
-- ---------------------------------------------------------------------------

-- "الوداد الرياضي", "Wydad", "Wydad AC" and "WAC" must all resolve to one team
-- id. This table is the single place that mapping lives, so News never invents
-- a duplicate club or player because a spelling differed.
create table app_private.news_entity_aliases (
  id uuid primary key default gen_random_uuid(),
  entity_kind app_private.news_entity_kind not null,
  entity_id uuid not null,
  alias text not null,
  -- Case-folded, diacritic- and tatweel-stripped form used for lookups. The
  -- engine computes it with the same normaliser it applies to source text.
  normalized_alias text not null,
  language text,
  -- Lower for risky short forms so a two-letter code cannot outrank a full
  -- name match.
  confidence real not null default 1,
  origin text not null default 'seed',
  active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint news_entity_aliases_unique unique (entity_kind, normalized_alias, entity_id),
  constraint news_entity_aliases_alias_check check (
    alias = btrim(alias) and char_length(alias) between 2 and 160
  ),
  constraint news_entity_aliases_normalized_check check (
    normalized_alias = btrim(normalized_alias)
    and normalized_alias = lower(normalized_alias)
    and char_length(normalized_alias) between 2 and 160
  ),
  constraint news_entity_aliases_language_check check (
    language is null or language in ('ar', 'fr', 'en', 'es')
  ),
  constraint news_entity_aliases_confidence_check check (confidence > 0 and confidence <= 1),
  constraint news_entity_aliases_origin_check check (origin in ('seed', 'manual', 'catalog', 'learned'))
);

create index news_entity_aliases_lookup_idx
  on app_private.news_entity_aliases (entity_kind, normalized_alias)
  where active;
create index news_entity_aliases_entity_idx
  on app_private.news_entity_aliases (entity_kind, entity_id);

-- ---------------------------------------------------------------------------
-- Generation and quality gates
-- ---------------------------------------------------------------------------

-- One attempt at writing one language edition of one cluster. Kept in full so
-- an editor can see what was tried, what the gates said, and why.
create table app_private.news_generation_attempts (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references app_private.news_story_clusters(id) on delete cascade,
  language app.language_code not null,
  attempt_number smallint not null default 1,
  model text,
  prompt_version text not null,
  -- The generated article fields before publication, so a rejected draft is
  -- still inspectable.
  draft jsonb not null,
  -- Highest normalised overlap against any source item in the cluster.
  similarity_score real,
  similarity_detail jsonb not null default '{}'::jsonb,
  factual_verdict app_private.news_quality_verdict not null default 'needs_review',
  originality_verdict app_private.news_quality_verdict not null default 'needs_review',
  verdict app_private.news_quality_verdict not null default 'needs_review',
  verdict_reason text,
  -- Set when this attempt produced the edition that was published.
  article_edition_id uuid references app.article_editions(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  constraint news_generation_attempts_unique unique (cluster_id, language, attempt_number),
  constraint news_generation_attempts_number_check check (attempt_number between 1 and 20),
  constraint news_generation_attempts_model_check check (
    model is null or char_length(model) between 1 and 80
  ),
  constraint news_generation_attempts_prompt_check check (
    prompt_version ~ '^[a-z0-9][a-z0-9._-]{0,39}$'
  ),
  constraint news_generation_attempts_draft_check check (jsonb_typeof(draft) = 'object'),
  constraint news_generation_attempts_similarity_check check (
    similarity_score is null or (similarity_score >= 0 and similarity_score <= 1)
  ),
  constraint news_generation_attempts_reason_check check (
    verdict_reason is null or char_length(verdict_reason) <= 2000
  )
);

create index news_generation_attempts_cluster_idx
  on app_private.news_generation_attempts (cluster_id, language, attempt_number desc);
create index news_generation_attempts_verdict_idx
  on app_private.news_generation_attempts (verdict, created_at desc);
create index news_generation_attempts_edition_idx
  on app_private.news_generation_attempts (article_edition_id)
  where article_edition_id is not null;

-- ---------------------------------------------------------------------------
-- Run ledger
-- ---------------------------------------------------------------------------

-- One scheduled or manual pass of the engine.
create table app_private.news_engine_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references app_private.news_engine_sources(id) on delete set null,
  job_type text not null,
  trigger_kind text not null default 'manual',
  target_scope text not null default 'all',
  status app_private.news_ingestion_status not null default 'running',
  dry_run boolean not null default false,
  discovered_count integer not null default 0,
  fetched_count integer not null default 0,
  relevant_count integer not null default 0,
  duplicate_count integer not null default 0,
  extracted_count integer not null default 0,
  clustered_count integer not null default 0,
  generated_count integer not null default 0,
  published_count integer not null default 0,
  review_count integer not null default 0,
  rejected_count integer not null default 0,
  failed_count integer not null default 0,
  started_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  error_code text,
  error_summary text,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default statement_timestamp(),
  constraint news_engine_runs_job_check check (job_type ~ '^[a-z][a-z0-9_]{2,79}$'),
  constraint news_engine_runs_trigger_check check (
    trigger_kind in ('manual', 'schedule', 'reconciliation', 'backfill', 'retry')
  ),
  constraint news_engine_runs_scope_check check (
    target_scope = btrim(target_scope) and char_length(target_scope) between 1 and 250
  ),
  constraint news_engine_runs_counts_check check (
    discovered_count >= 0 and fetched_count >= 0 and relevant_count >= 0
    and duplicate_count >= 0 and extracted_count >= 0 and clustered_count >= 0
    and generated_count >= 0 and published_count >= 0 and review_count >= 0
    and rejected_count >= 0 and failed_count >= 0
  ),
  constraint news_engine_runs_time_check check (
    completed_at is null or completed_at >= started_at
  ),
  constraint news_engine_runs_error_check check (
    error_summary is null or char_length(error_summary) <= 2000
  )
);

create index news_engine_runs_recent_idx
  on app_private.news_engine_runs (started_at desc, id);
create index news_engine_runs_source_idx
  on app_private.news_engine_runs (source_id, started_at desc);
create index news_engine_runs_status_idx
  on app_private.news_engine_runs (status, started_at desc);

-- Per-stage timings and counts, so a slow or failing stage is visible without
-- reading production logs.
create table app_private.news_engine_run_stages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references app_private.news_engine_runs(id) on delete cascade,
  stage app_private.news_pipeline_stage not null,
  status app_private.news_ingestion_status not null default 'running',
  input_count integer not null default 0,
  output_count integer not null default 0,
  failed_count integer not null default 0,
  duration_ms integer,
  error_code text,
  error_summary text,
  started_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  constraint news_engine_run_stages_unique unique (run_id, stage),
  constraint news_engine_run_stages_counts_check check (
    input_count >= 0 and output_count >= 0 and failed_count >= 0
  ),
  constraint news_engine_run_stages_duration_check check (
    duration_ms is null or duration_ms >= 0
  ),
  constraint news_engine_run_stages_error_check check (
    error_summary is null or char_length(error_summary) <= 2000
  )
);

create index news_engine_run_stages_run_idx
  on app_private.news_engine_run_stages (run_id, stage);

-- ---------------------------------------------------------------------------
-- Failure inbox
-- ---------------------------------------------------------------------------

-- Every failure the pipeline isolates lands here rather than aborting a batch.
-- One broken article must not end a run; one broken source must not end the
-- engine.
create table app_private.news_engine_failures (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references app_private.news_engine_runs(id) on delete set null,
  source_id uuid references app_private.news_engine_sources(id) on delete set null,
  source_item_id uuid references app_private.news_source_items(id) on delete cascade,
  cluster_id uuid references app_private.news_story_clusters(id) on delete cascade,
  stage app_private.news_pipeline_stage not null,
  failure_code app_private.news_failure_code not null,
  -- Sanitised: no credentials, no raw provider HTML, no stack traces.
  message text not null,
  detail jsonb not null default '{}'::jsonb,
  retry_count smallint not null default 0,
  next_retry_at timestamptz,
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint news_engine_failures_message_check check (
    message = btrim(message) and char_length(message) between 1 and 2000
  ),
  constraint news_engine_failures_retry_check check (retry_count between 0 and 100),
  constraint news_engine_failures_resolution_check check (
    resolution is null or char_length(resolution) <= 1000
  ),
  constraint news_engine_failures_resolved_check check (
    resolved_at is null or resolved_at >= created_at
  )
);

create index news_engine_failures_open_idx
  on app_private.news_engine_failures (failure_code, created_at desc)
  where resolved_at is null;
create index news_engine_failures_retry_idx
  on app_private.news_engine_failures (next_retry_at)
  where resolved_at is null and next_retry_at is not null;
create index news_engine_failures_item_idx
  on app_private.news_engine_failures (source_item_id)
  where source_item_id is not null;
create index news_engine_failures_run_idx
  on app_private.news_engine_failures (run_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Publication policy
-- ---------------------------------------------------------------------------

-- Which event types may auto-publish and which always wait for a human. Rows,
-- not code, so the policy can be tightened without a deploy.
create table app_private.news_publication_policies (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  minimum_claim_status app_private.news_claim_status not null default 'official',
  minimum_source_count smallint not null default 1,
  auto_publish boolean not null default false,
  require_resolved_entities boolean not null default true,
  notes text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint news_publication_policies_event_key unique (event_type),
  constraint news_publication_policies_event_check check (
    event_type ~ '^[a-z][a-z0-9_]{2,39}$'
  ),
  constraint news_publication_policies_sources_check check (
    minimum_source_count between 1 and 10
  ),
  constraint news_publication_policies_notes_check check (
    notes is null or char_length(notes) <= 1000
  )
);

-- ---------------------------------------------------------------------------
-- Updated-at triggers
-- ---------------------------------------------------------------------------
--
-- `app` tables get these from a dynamic loop in the editorial catalog
-- migration; `app_private` tables are wired explicitly, as the existing
-- private news tables already are.

create trigger news_engine_sources_set_updated_at
  before update on app_private.news_engine_sources
  for each row execute function app_private.set_updated_at();
create trigger news_source_discovery_state_set_updated_at
  before update on app_private.news_source_discovery_state
  for each row execute function app_private.set_updated_at();
create trigger news_story_clusters_set_updated_at
  before update on app_private.news_story_clusters
  for each row execute function app_private.set_updated_at();
create trigger news_source_items_set_updated_at
  before update on app_private.news_source_items
  for each row execute function app_private.set_updated_at();
create trigger news_extracted_facts_set_updated_at
  before update on app_private.news_extracted_facts
  for each row execute function app_private.set_updated_at();
create trigger news_entity_aliases_set_updated_at
  before update on app_private.news_entity_aliases
  for each row execute function app_private.set_updated_at();
create trigger news_engine_failures_set_updated_at
  before update on app_private.news_engine_failures
  for each row execute function app_private.set_updated_at();
create trigger news_publication_policies_set_updated_at
  before update on app_private.news_publication_policies
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
--
-- Enabled and forced with no policies. Browser roles hold no privileges on
-- these tables at all; the only access path is a SECURITY DEFINER function in
-- `api` that checks for service_role first.

alter table app_private.news_engine_sources enable row level security;
alter table app_private.news_engine_sources force row level security;
alter table app_private.news_source_discovery_state enable row level security;
alter table app_private.news_source_discovery_state force row level security;
alter table app_private.news_story_clusters enable row level security;
alter table app_private.news_story_clusters force row level security;
alter table app_private.news_source_items enable row level security;
alter table app_private.news_source_items force row level security;
alter table app_private.news_cluster_items enable row level security;
alter table app_private.news_cluster_items force row level security;
alter table app_private.news_extracted_facts enable row level security;
alter table app_private.news_extracted_facts force row level security;
alter table app_private.news_entity_aliases enable row level security;
alter table app_private.news_entity_aliases force row level security;
alter table app_private.news_generation_attempts enable row level security;
alter table app_private.news_generation_attempts force row level security;
alter table app_private.news_engine_runs enable row level security;
alter table app_private.news_engine_runs force row level security;
alter table app_private.news_engine_run_stages enable row level security;
alter table app_private.news_engine_run_stages force row level security;
alter table app_private.news_engine_failures enable row level security;
alter table app_private.news_engine_failures force row level security;
alter table app_private.news_publication_policies enable row level security;
alter table app_private.news_publication_policies force row level security;

revoke all on table
  app_private.news_engine_sources,
  app_private.news_source_discovery_state,
  app_private.news_story_clusters,
  app_private.news_source_items,
  app_private.news_cluster_items,
  app_private.news_extracted_facts,
  app_private.news_entity_aliases,
  app_private.news_generation_attempts,
  app_private.news_engine_runs,
  app_private.news_engine_run_stages,
  app_private.news_engine_failures,
  app_private.news_publication_policies
from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

comment on table app_private.news_engine_sources is
  'Configured news sources. Adding a source is a row plus a parser profile, not an architecture change.';
comment on table app_private.news_source_discovery_state is
  'Per-source incremental discovery cursor; prevents recrawling history on every scheduled run.';
comment on table app_private.news_source_items is
  'Raw discovered source articles. Provenance only: never rendered publicly and never published as-is.';
comment on table app_private.news_story_clusters is
  'One real-world event across many source articles; the unit a BotolaGO story is written from.';
comment on table app_private.news_extracted_facts is
  'Structured facts distilled from a source item. Generation reads these, never source prose.';
comment on table app_private.news_entity_aliases is
  'Arabic, French and abbreviated names mapped to canonical BotolaGO football entity ids.';
comment on table app_private.news_generation_attempts is
  'Every generated draft with its originality and factual gate verdicts, retained for editorial review.';
comment on table app_private.news_engine_failures is
  'Centralised failure inbox. A failed article never ends a batch; a failed source never ends the engine.';
comment on table app_private.news_publication_policies is
  'Per-event-type auto-publish rules. Data, so the policy can be tightened without a deploy.';
