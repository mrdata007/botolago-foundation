-- BotolaGO News Engine — generation, publication and observability RPCs.
--
-- `api.news_engine_publish_article` is the single publication contract. No
-- pipeline stage writes to `app.stories` or `app.article_editions` directly,
-- and a generated article lands in exactly the same public model a
-- hand-written one does — same table, same statuses, same search documents,
-- same revision history.

-- ---------------------------------------------------------------------------
-- Generation input
-- ---------------------------------------------------------------------------

-- Everything the generator needs about one cluster, in one round trip: the
-- facts extracted from every member item, the resolved entities with their
-- canonical BotolaGO names, and the source texts the originality gate will
-- compare the draft against.
create or replace function api.news_engine_cluster_bundle(p_cluster_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cluster app_private.news_story_clusters%rowtype;
  bundle jsonb;
begin
  perform app_private.news_engine_require_service_role();

  select * into cluster from app_private.news_story_clusters where id = p_cluster_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'news_engine_cluster_not_found';
  end if;

  select jsonb_build_object(
    'cluster', jsonb_build_object(
      'id', cluster.id,
      'clusterKey', cluster.cluster_key,
      'eventType', cluster.event_type,
      'eventDate', cluster.primary_event_date,
      'status', cluster.status,
      'storyId', cluster.story_id,
      'bestClaimStatus', cluster.best_claim_status,
      'itemCount', cluster.item_count,
      'sourceCount', cluster.source_count,
      'hasConflict', cluster.has_conflict,
      'conflictSummary', cluster.conflict_summary
    ),
    'competition', (
      select jsonb_build_object(
        'id', competition.id,
        'slug', competition.slug,
        'name', competition.name,
        'shortName', competition.short_name,
        'translations', coalesce((
          select jsonb_object_agg(translation.language, translation.display_name)
          from app.competition_translations translation
          where translation.competition_id = competition.id
        ), '{}'::jsonb)
      )
      from app.competitions competition where competition.id = cluster.competition_id
    ),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', team.id, 'slug', team.slug, 'name', team.name,
        'shortName', team.short_name, 'code', team.code,
        'aliases', coalesce((
          select jsonb_agg(distinct alias.alias)
          from app_private.news_entity_aliases alias
          where alias.entity_kind = 'team' and alias.entity_id = team.id and alias.active
        ), '[]'::jsonb)
      ) order by team.name)
      from app.teams team where team.id = any (cluster.team_ids)
    ), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', player.id, 'slug', player.slug,
        'fullName', player.full_name, 'displayName', player.display_name,
        'position', player.position
      ) order by player.display_name)
      from app.players player where player.id = any (cluster.player_ids)
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'itemId', item.id,
        'sourceSlug', source.slug,
        'sourceName', source.name,
        'sourceKind', source.source_kind,
        'sourceUrl', item.source_url,
        'sourceTitle', item.source_title,
        'sourceLanguage', item.source_language,
        'sourcePublishedAt', item.source_published_at,
        -- Working material for the originality comparison only. Nothing
        -- returned here is ever persisted as publishable copy.
        'sourceText', item.normalized_source_text,
        'facts', case when facts.id is null then null else jsonb_build_object(
          'eventType', facts.event_type,
          'eventDate', facts.event_date,
          'score', facts.score,
          'claims', facts.claims,
          'quotes', facts.quotes,
          'unresolved', facts.unresolved,
          'bestClaimStatus', facts.best_claim_status,
          'confidence', facts.confidence
        ) end
      ) order by item.source_published_at asc nulls last)
      from app_private.news_cluster_items link
      join app_private.news_source_items item on item.id = link.source_item_id
      join app_private.news_engine_sources source on source.id = item.source_id
      left join app_private.news_extracted_facts facts on facts.source_item_id = item.id
      where link.cluster_id = cluster.id
    ), '[]'::jsonb),
    'policy', (
      select jsonb_build_object(
        'eventType', policy.event_type,
        'minimumClaimStatus', policy.minimum_claim_status,
        'minimumSourceCount', policy.minimum_source_count,
        'autoPublish', policy.auto_publish,
        'requireResolvedEntities', policy.require_resolved_entities
      )
      from app_private.news_publication_policies policy
      where policy.event_type = cluster.event_type
    ),
    'attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', attempt.id,
        'language', attempt.language,
        'attemptNumber', attempt.attempt_number,
        'verdict', attempt.verdict,
        'similarityScore', attempt.similarity_score,
        'articleEditionId', attempt.article_edition_id
      ) order by attempt.created_at desc)
      from app_private.news_generation_attempts attempt
      where attempt.cluster_id = cluster.id
    ), '[]'::jsonb)
  ) into bundle;

  return bundle;
end;
$$;

-- ---------------------------------------------------------------------------
-- Generation attempts and quality gates
-- ---------------------------------------------------------------------------

create or replace function api.news_engine_record_generation(
  p_cluster_id uuid,
  p_language text,
  p_model text,
  p_prompt_version text,
  p_draft jsonb,
  p_similarity_score real,
  p_similarity_detail jsonb,
  p_factual_verdict app_private.news_quality_verdict,
  p_originality_verdict app_private.news_quality_verdict,
  p_verdict app_private.news_quality_verdict,
  p_verdict_reason text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  next_attempt smallint;
  attempt_id uuid;
begin
  perform app_private.news_engine_require_service_role();

  if p_language not in ('fr', 'ar') then
    raise exception using errcode = '22023', message = 'news_engine_unsupported_language';
  end if;
  if jsonb_typeof(coalesce(p_draft, 'null'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'news_engine_invalid_draft';
  end if;
  if p_similarity_score is not null and (p_similarity_score < 0 or p_similarity_score > 1) then
    raise exception using errcode = '22023', message = 'news_engine_invalid_similarity_score';
  end if;
  -- A passing verdict cannot be recorded when either gate failed. The gates
  -- are the point; they must not be reportable as "passed" piecemeal.
  if p_verdict = 'passed'
    and (p_factual_verdict <> 'passed' or p_originality_verdict <> 'passed')
  then
    raise exception using errcode = '22023', message = 'news_engine_verdict_contradicts_gates';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('news_engine_generation:' || p_cluster_id::text || ':' || p_language, 0)
  );

  select coalesce(max(attempt_number), 0)::smallint + 1 into next_attempt
  from app_private.news_generation_attempts
  where cluster_id = p_cluster_id and language = p_language::app.language_code;

  if next_attempt > 20 then
    raise exception using errcode = '54000', message = 'news_engine_generation_attempts_exhausted';
  end if;

  insert into app_private.news_generation_attempts (
    cluster_id, language, attempt_number, model, prompt_version, draft,
    similarity_score, similarity_detail, factual_verdict, originality_verdict,
    verdict, verdict_reason
  ) values (
    p_cluster_id, p_language::app.language_code, next_attempt, p_model, p_prompt_version,
    p_draft, p_similarity_score, coalesce(p_similarity_detail, '{}'::jsonb),
    p_factual_verdict, p_originality_verdict, p_verdict, left(p_verdict_reason, 2000)
  ) returning id into attempt_id;

  update app_private.news_story_clusters set
    status = case
      when p_verdict = 'passed' then 'validated'::app_private.news_item_status
      when p_verdict = 'rejected' then 'rejected'::app_private.news_item_status
      else 'generated'::app_private.news_item_status
    end,
    last_seen_at = statement_timestamp()
  where id = p_cluster_id;

  return jsonb_build_object(
    'attemptId', attempt_id,
    'attemptNumber', next_attempt,
    'verdict', p_verdict
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Publication contract
-- ---------------------------------------------------------------------------

-- The only way engine output becomes a BotolaGO article.
--
-- Idempotent on `(cluster, language)`: the story is keyed by a fingerprint
-- derived from the cluster key, so running the same import ten times updates
-- one story and one edition per language rather than creating ten.
create or replace function api.news_engine_publish_article(
  p_cluster_id uuid,
  p_language text,
  p_slug text,
  p_title text,
  p_subtitle text,
  p_summary text,
  p_body_html text,
  p_reading_time_minutes integer,
  p_sanitizer_version text,
  p_seo_title text,
  p_seo_description text,
  p_category_slug text,
  p_tag_slugs text[],
  p_team_ids uuid[],
  p_player_ids uuid[],
  p_competition_ids uuid[],
  p_hero_asset_id uuid,
  p_publish boolean,
  p_generation_attempt_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cluster app_private.news_story_clusters%rowtype;
  newsroom app.publishers%rowtype;
  target_story_id uuid;
  target_edition_id uuid;
  story_fingerprint text;
  final_slug text;
  slug_owner uuid;
  category_id uuid;
  tag_id uuid;
  tag_slug text;
  outcome text := 'inserted';
  target_status app.publication_status;
  target_visibility app.article_visibility;
  item record;
  relation_count integer;
begin
  perform app_private.news_engine_require_service_role();

  -- --- validation -------------------------------------------------------
  if p_language not in ('fr', 'ar') then
    raise exception using errcode = '22023', message = 'news_engine_unsupported_language';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(p_slug) not between 8 and 180 then
    raise exception using errcode = '22023', message = 'news_engine_invalid_slug';
  end if;
  if p_title is null or p_title <> btrim(p_title) or char_length(p_title) not between 5 and 220 then
    raise exception using errcode = '22023', message = 'news_engine_invalid_title';
  end if;
  if p_summary is null or p_summary <> btrim(p_summary) or char_length(p_summary) not between 10 and 1000 then
    raise exception using errcode = '22023', message = 'news_engine_invalid_summary';
  end if;
  if p_subtitle is not null
    and (p_subtitle <> btrim(p_subtitle) or char_length(p_subtitle) not between 2 and 300)
  then
    raise exception using errcode = '22023', message = 'news_engine_invalid_subtitle';
  end if;
  -- A short body is the signature of a link stub. This engine does not
  -- publish stubs; the floor is deliberately well above excerpt length.
  if p_body_html is null or char_length(p_body_html) not between 400 and 60000 then
    raise exception using errcode = '22023', message = 'news_engine_invalid_body_length';
  end if;
  if p_body_html ~* '<[[:space:]]*(script|iframe|object|embed|style|form|input|button|textarea|select|meta|link)([[:space:]>])'
    or p_body_html ~* 'on[a-z]+[[:space:]]*='
    or p_body_html ~* '(javascript|data[[:space:]]*:[[:space:]]*text/html)[[:space:]]*:'
  then
    raise exception using errcode = '22023', message = 'news_engine_unsafe_body';
  end if;
  if p_sanitizer_version is null or p_sanitizer_version <> 'sanitize-html@2.17.5' then
    raise exception using errcode = '22023', message = 'news_engine_invalid_sanitizer_version';
  end if;
  if p_reading_time_minutes is null or p_reading_time_minutes not between 1 and 180 then
    raise exception using errcode = '22023', message = 'news_engine_invalid_reading_time';
  end if;
  if p_seo_title is not null and char_length(p_seo_title) > 70 then
    raise exception using errcode = '22023', message = 'news_engine_invalid_seo_title';
  end if;
  if p_seo_description is not null and char_length(p_seo_description) > 170 then
    raise exception using errcode = '22023', message = 'news_engine_invalid_seo_description';
  end if;

  relation_count := cardinality(coalesce(p_team_ids, '{}'))
    + cardinality(coalesce(p_player_ids, '{}'))
    + cardinality(coalesce(p_competition_ids, '{}'));
  -- An article nobody can reach from a club, player or competition page is not
  -- useful coverage. Drafts may be entity-less while an editor fixes them;
  -- published ones may not.
  if coalesce(p_publish, false) and relation_count = 0 then
    raise exception using errcode = '22023', message = 'news_engine_publication_requires_entities';
  end if;

  -- --- cluster and newsroom identity ------------------------------------
  select * into cluster from app_private.news_story_clusters where id = p_cluster_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'news_engine_cluster_not_found';
  end if;

  -- BotolaGO is the publisher of its own editorial output. The originating
  -- source keeps its attribution in the private provenance tables, not on the
  -- public story.
  select * into newsroom from app.publishers
  where slug = 'botolago-newsroom' and active and trust_status = 'trusted';
  if not found then
    raise exception using errcode = 'P0002', message = 'news_engine_newsroom_publisher_missing';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('news_engine_publish:' || cluster.cluster_key, 0));

  story_fingerprint := encode(
    extensions.digest(convert_to('news-engine-cluster:' || cluster.cluster_key, 'UTF8'), 'sha256'),
    'hex'
  );

  target_story_id := cluster.story_id;
  if target_story_id is null then
    select id into target_story_id from app.stories
    where content_fingerprint = story_fingerprint and deleted_at is null;
  end if;

  if target_story_id is null then
    insert into app.stories (origin, original_language, publisher_id, content_fingerprint)
    values ('provider', p_language::app.language_code, newsroom.id, story_fingerprint)
    returning id into target_story_id;
  else
    update app.stories
    set publisher_id = newsroom.id, deleted_at = null, updated_at = statement_timestamp()
    where id = target_story_id;
  end if;

  -- --- slug de-collision -------------------------------------------------
  final_slug := p_slug;
  select edition.story_id into slug_owner from app.article_editions edition
  where edition.language = p_language::app.language_code and edition.slug = final_slug;
  if slug_owner is not null and slug_owner <> target_story_id then
    final_slug := left(p_slug, 180 - 9) || '-'
      || left(encode(extensions.digest(convert_to(target_story_id::text, 'UTF8'), 'sha256'), 'hex'), 8);
  end if;

  -- --- edition ------------------------------------------------------------
  if coalesce(p_publish, false) then
    target_status := 'published';
    target_visibility := 'public';
  else
    target_status := 'draft';
    target_visibility := 'private';
  end if;

  select id into target_edition_id from app.article_editions
  where story_id = target_story_id and language = p_language::app.language_code
  for update;

  if target_edition_id is null then
    insert into app.article_editions (
      story_id, language, slug, title, subtitle, summary,
      body_format, body_source, body_html, hero_asset_id,
      status, visibility, published_at, reading_time_minutes,
      seo_title, seo_description, sanitizer_version
    ) values (
      target_story_id, p_language::app.language_code, final_slug, p_title, p_subtitle, p_summary,
      'rich_text', null, p_body_html, p_hero_asset_id,
      target_status, target_visibility,
      case when target_status = 'published' then statement_timestamp() end,
      p_reading_time_minutes, p_seo_title, p_seo_description, p_sanitizer_version
    ) returning id into target_edition_id;
  else
    outcome := 'updated';
    update app.article_editions set
      slug = final_slug,
      title = p_title,
      subtitle = p_subtitle,
      summary = p_summary,
      body_format = 'rich_text',
      body_html = p_body_html,
      hero_asset_id = coalesce(p_hero_asset_id, hero_asset_id),
      status = target_status,
      visibility = target_visibility,
      -- First publication time is editorial history; a later correction must
      -- not silently re-date the story.
      published_at = case
        when target_status = 'published' then coalesce(published_at, statement_timestamp())
        else published_at
      end,
      unpublished_at = case
        when target_status = 'published' then unpublished_at
        else coalesce(unpublished_at, statement_timestamp())
      end,
      reading_time_minutes = p_reading_time_minutes,
      seo_title = p_seo_title,
      seo_description = p_seo_description,
      sanitizer_version = p_sanitizer_version,
      updated_at = statement_timestamp()
    where id = target_edition_id;
  end if;

  -- A draft must not keep a stale `unpublished_at`-free published state; the
  -- table's own checks cover the rest.
  if target_status = 'draft' then
    update app.article_editions set unpublished_at = null where id = target_edition_id and status = 'draft';
  end if;

  -- --- football relations -------------------------------------------------
  insert into app.story_teams (story_id, team_id)
  select target_story_id, team.id from app.teams team
  where team.id = any (coalesce(p_team_ids, '{}'))
  on conflict do nothing;

  insert into app.story_players (story_id, player_id)
  select target_story_id, player.id from app.players player
  where player.id = any (coalesce(p_player_ids, '{}'))
  on conflict do nothing;

  insert into app.story_competitions (story_id, competition_id)
  select target_story_id, competition.id from app.competitions competition
  where competition.id = any (coalesce(p_competition_ids, '{}'))
  on conflict do nothing;

  -- --- taxonomy -----------------------------------------------------------
  if p_category_slug is not null then
    select id into category_id from app.taxonomies
    where taxonomy_type = 'category' and slug = p_category_slug and active;
    if category_id is not null then
      -- One primary category per story; a re-run must move it, not duplicate it.
      update app.story_taxonomies set is_primary = false
      where story_id = target_story_id and taxonomy_id <> category_id and is_primary;
      insert into app.story_taxonomies (story_id, taxonomy_id, is_primary)
      values (target_story_id, category_id, true)
      on conflict (story_id, taxonomy_id) do update set is_primary = true;
    end if;
  end if;

  foreach tag_slug in array coalesce(p_tag_slugs, '{}') loop
    select id into tag_id from app.taxonomies
    where taxonomy_type in ('tag', 'topic') and slug = tag_slug and active;
    if tag_id is not null then
      insert into app.story_taxonomies (story_id, taxonomy_id, is_primary)
      values (target_story_id, tag_id, false)
      on conflict (story_id, taxonomy_id) do nothing;
    end if;
  end loop;

  -- --- provenance ---------------------------------------------------------
  -- Each contributing source article is mapped to the story it fed. This is
  -- what lets an administrator answer "where did this come from" long after
  -- publication, without any of it reaching the public API.
  for item in
    select child.id as item_id, child.source_article_id, child.source_url,
           child.content_hash, child.source_published_at, child.source_updated_at,
           source.publisher_id, source.parser_version
    from app_private.news_cluster_items link
    join app_private.news_source_items child on child.id = link.source_item_id
    join app_private.news_engine_sources source on source.id = child.source_id
    where link.cluster_id = cluster.id and source.publisher_id is not null
  loop
    insert into app_private.news_source_articles (
      publisher_id, external_id, story_id, article_edition_id, canonical_url,
      content_fingerprint, source_version, source_published_at, source_updated_at,
      last_seen_at, active
    ) values (
      item.publisher_id, item.source_article_id, target_story_id, target_edition_id,
      item.source_url,
      coalesce(item.content_hash, story_fingerprint),
      'news-engine:' || coalesce(item.parser_version, 'v1'),
      coalesce(item.source_published_at, statement_timestamp()),
      coalesce(item.source_updated_at, item.source_published_at, statement_timestamp()),
      statement_timestamp(), true
    )
    on conflict (publisher_id, external_id) do update set
      story_id = excluded.story_id,
      article_edition_id = excluded.article_edition_id,
      canonical_url = excluded.canonical_url,
      content_fingerprint = excluded.content_fingerprint,
      source_version = excluded.source_version,
      source_updated_at = greatest(
        app_private.news_source_articles.source_updated_at, excluded.source_updated_at
      ),
      last_seen_at = statement_timestamp(),
      active = true,
      updated_at = statement_timestamp();

    update app_private.news_source_items
    set status = case when target_status = 'published'
                      then 'published'::app_private.news_item_status
                      else 'ready'::app_private.news_item_status end,
        processed_at = statement_timestamp()
    where id = item.item_id;
  end loop;

  -- --- bookkeeping ---------------------------------------------------------
  if p_generation_attempt_id is not null then
    update app_private.news_generation_attempts
    set article_edition_id = target_edition_id
    where id = p_generation_attempt_id and cluster_id = cluster.id;
  end if;

  update app_private.news_story_clusters set
    story_id = target_story_id,
    status = case when target_status = 'published'
                  then 'published'::app_private.news_item_status
                  else 'ready'::app_private.news_item_status end,
    last_seen_at = statement_timestamp()
  where id = cluster.id;

  return jsonb_build_object(
    'outcome', outcome,
    'storyId', target_story_id,
    'articleId', target_edition_id,
    'slug', final_slug,
    'language', p_language,
    'status', target_status,
    'published', target_status = 'published'
  );
end;
$$;

-- Withdraws a published engine article without destroying provenance.
create or replace function api.news_engine_unpublish_article(
  p_article_edition_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare edition app.article_editions%rowtype;
begin
  perform app_private.news_engine_require_service_role();

  if p_reason is null or btrim(p_reason) = '' then
    raise exception using errcode = '22023', message = 'news_engine_unpublish_reason_required';
  end if;

  update app.article_editions set
    status = 'unpublished',
    visibility = 'private',
    unpublished_at = statement_timestamp(),
    updated_at = statement_timestamp()
  where id = p_article_edition_id and status = 'published'
  returning * into edition;

  if not found then
    raise exception using errcode = 'P0002', message = 'news_engine_article_not_published';
  end if;

  return jsonb_build_object('articleId', edition.id, 'status', edition.status);
end;
$$;

-- ---------------------------------------------------------------------------
-- Observability
-- ---------------------------------------------------------------------------

-- One call answering "is the news engine healthy right now": pipeline
-- backlog, today's output, the review queue, open failures and per-source
-- health. The admin dashboard reads this instead of assembling a dozen
-- queries.
create or replace function api.news_engine_status(p_window_hours integer default 24)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  window_start timestamptz;
  latest app_private.news_engine_runs%rowtype;
begin
  perform app_private.news_engine_require_service_role();

  window_start := statement_timestamp()
    - make_interval(hours => greatest(least(coalesce(p_window_hours, 24), 720), 1));

  select * into latest from app_private.news_engine_runs
  order by started_at desc limit 1;

  return jsonb_build_object(
    'generatedAt', statement_timestamp(),
    'windowStart', window_start,
    'latestRun', case when latest.id is null then null else jsonb_build_object(
      'id', latest.id,
      'jobType', latest.job_type,
      'triggerKind', latest.trigger_kind,
      'status', latest.status,
      'dryRun', latest.dry_run,
      'startedAt', latest.started_at,
      'completedAt', latest.completed_at,
      'discovered', latest.discovered_count,
      'fetched', latest.fetched_count,
      'relevant', latest.relevant_count,
      'duplicates', latest.duplicate_count,
      'generated', latest.generated_count,
      'published', latest.published_count,
      'review', latest.review_count,
      'failed', latest.failed_count,
      'errorCode', latest.error_code
    ) end,
    'itemsByStatus', coalesce((
      select jsonb_object_agg(status, total)
      from (
        select status::text as status, count(*) as total
        from app_private.news_source_items group by status
      ) as counts
    ), '{}'::jsonb),
    'clustersByStatus', coalesce((
      select jsonb_object_agg(status, total)
      from (
        select status::text as status, count(*) as total
        from app_private.news_story_clusters group by status
      ) as counts
    ), '{}'::jsonb),
    'reviewQueue', (
      select count(*) from app_private.news_story_clusters
      where status in ('generated', 'validated') and story_id is null
    ),
    'publishedInWindow', (
      select count(*) from app.article_editions edition
      join app_private.news_generation_attempts attempt on attempt.article_edition_id = edition.id
      where edition.status = 'published' and edition.published_at >= window_start
    ),
    'openFailures', coalesce((
      select jsonb_object_agg(failure_code, total)
      from (
        select failure_code::text as failure_code, count(*) as total
        from app_private.news_engine_failures
        where resolved_at is null group by failure_code
      ) as counts
    ), '{}'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', source.slug,
        'name', source.name,
        'enabled', source.enabled,
        'languages', to_jsonb(source.source_languages),
        'discoveryMethod', source.discovery_method,
        'articleFetchApproved', source.article_fetch_approved,
        'lastSuccessfulRunAt', source.last_successful_run_at,
        'lastSuccessfulDiscoveryAt', state.last_successful_discovery_at,
        'lastAttemptedDiscoveryAt', state.last_attempted_discovery_at,
        'consecutiveFailures', coalesce(state.consecutive_failures, 0),
        'lastErrorCode', state.last_error_code,
        'itemsDiscovered', (
          select count(*) from app_private.news_source_items item
          where item.source_id = source.id
        ),
        'health', case
          when not source.enabled then 'disabled'
          when coalesce(state.consecutive_failures, 0) >= 3 then 'failed'
          when coalesce(state.consecutive_failures, 0) > 0 then 'degraded'
          when state.last_successful_discovery_at is null then 'never_run'
          when state.last_successful_discovery_at
               < statement_timestamp() - make_interval(secs => source.poll_interval_seconds * 3)
            then 'stale'
          else 'healthy'
        end
      ) order by source.priority, source.slug)
      from app_private.news_engine_sources source
      left join app_private.news_source_discovery_state state on state.source_id = source.id
    ), '[]'::jsonb)
  );
end;
$$;

-- Open failures for the failure inbox, newest first.
create or replace function api.news_engine_open_failures(
  p_limit integer default 50,
  p_failure_code app_private.news_failure_code default null
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

  select coalesce(jsonb_agg(entry order by entry ->> 'createdAt' desc), '[]'::jsonb) into result
  from (
    select jsonb_build_object(
      'id', failure.id,
      'stage', failure.stage,
      'failureCode', failure.failure_code,
      'message', failure.message,
      'detail', failure.detail,
      'retryCount', failure.retry_count,
      'nextRetryAt', failure.next_retry_at,
      'createdAt', failure.created_at,
      'sourceSlug', source.slug,
      'itemId', failure.source_item_id,
      'clusterId', failure.cluster_id,
      'sourceUrl', item.source_url
    ) as entry
    from app_private.news_engine_failures failure
    left join app_private.news_engine_sources source on source.id = failure.source_id
    left join app_private.news_source_items item on item.id = failure.source_item_id
    where failure.resolved_at is null
      and (p_failure_code is null or failure.failure_code = p_failure_code)
    order by failure.created_at desc
    limit greatest(least(coalesce(p_limit, 50), 200), 1)
  ) as rows;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Source administration
-- ---------------------------------------------------------------------------

create or replace function api.news_engine_set_source_enabled(
  p_source_slug text,
  p_enabled boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare target app_private.news_engine_sources%rowtype;
begin
  perform app_private.news_engine_require_service_role();

  update app_private.news_engine_sources
  set enabled = coalesce(p_enabled, false)
  where slug = p_source_slug
  returning * into target;

  if not found then
    raise exception using errcode = 'P0002', message = 'news_engine_source_not_found';
  end if;

  return jsonb_build_object('slug', target.slug, 'enabled', target.enabled);
end;
$$;

-- Article-page fetching is a separate, revocable permission from listing
-- discovery. Both this flag and the runtime approval must be on before the
-- engine reads an article page.
create or replace function api.news_engine_set_source_article_fetch(
  p_source_slug text,
  p_approved boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare target app_private.news_engine_sources%rowtype;
begin
  perform app_private.news_engine_require_service_role();

  update app_private.news_engine_sources
  set article_fetch_approved = coalesce(p_approved, false)
  where slug = p_source_slug
  returning * into target;

  if not found then
    raise exception using errcode = 'P0002', message = 'news_engine_source_not_found';
  end if;

  return jsonb_build_object(
    'slug', target.slug,
    'articleFetchApproved', target.article_fetch_approved
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function
  api.news_engine_cluster_bundle(uuid),
  api.news_engine_record_generation(uuid, text, text, text, jsonb, real, jsonb, app_private.news_quality_verdict, app_private.news_quality_verdict, app_private.news_quality_verdict, text),
  api.news_engine_publish_article(uuid, text, text, text, text, text, text, integer, text, text, text, text, text[], uuid[], uuid[], uuid[], uuid, boolean, uuid),
  api.news_engine_unpublish_article(uuid, text),
  api.news_engine_status(integer),
  api.news_engine_open_failures(integer, app_private.news_failure_code),
  api.news_engine_set_source_enabled(text, boolean),
  api.news_engine_set_source_article_fetch(text, boolean)
from public, anon, authenticated, service_role;

grant execute on function
  api.news_engine_cluster_bundle(uuid),
  api.news_engine_record_generation(uuid, text, text, text, jsonb, real, jsonb, app_private.news_quality_verdict, app_private.news_quality_verdict, app_private.news_quality_verdict, text),
  api.news_engine_publish_article(uuid, text, text, text, text, text, text, integer, text, text, text, text, text[], uuid[], uuid[], uuid[], uuid, boolean, uuid),
  api.news_engine_unpublish_article(uuid, text),
  api.news_engine_status(integer),
  api.news_engine_open_failures(integer, app_private.news_failure_code),
  api.news_engine_set_source_enabled(text, boolean),
  api.news_engine_set_source_article_fetch(text, boolean)
to service_role;

comment on function api.news_engine_publish_article(uuid, text, text, text, text, text, text, integer, text, text, text, text, text[], uuid[], uuid[], uuid[], uuid, boolean, uuid) is
  'The only path from engine output to a public article; idempotent per (cluster, language) and shares the manual editorial model.';
comment on function api.news_engine_cluster_bundle(uuid) is
  'Service-role generation input: facts, resolved entities and source texts for one story cluster.';
comment on function api.news_engine_status(integer) is
  'Single-call News Engine health: backlog, review queue, open failures and per-source health.';
