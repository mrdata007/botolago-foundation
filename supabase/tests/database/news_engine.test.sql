begin;

select extensions.no_plan();

-- ---------------------------------------------------------------------------
-- Grants: the engine plane is service-role only
-- ---------------------------------------------------------------------------

select extensions.ok(
  not has_function_privilege('anon', 'api.news_engine_claim_source(text, boolean)', 'execute'),
  'anonymous clients cannot claim a news source'
);
select extensions.ok(
  not has_function_privilege('authenticated', 'api.news_engine_claim_source(text, boolean)', 'execute'),
  'authenticated users cannot claim a news source'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'api.news_engine_publish_article(uuid, text, text, text, text, text, text, integer, text, text, text, text, text[], uuid[], uuid[], uuid[], uuid, boolean, uuid)',
    'execute'
  ),
  'authenticated users cannot publish engine articles'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'api.news_engine_publish_article(uuid, text, text, text, text, text, text, integer, text, text, text, text, text[], uuid[], uuid[], uuid[], uuid, boolean, uuid)',
    'execute'
  ),
  'the service role can publish engine articles'
);
select extensions.ok(
  not has_table_privilege('anon', 'app_private.news_source_items', 'select'),
  'anonymous clients cannot read raw source items'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'app_private.news_source_items', 'select'),
  'authenticated users cannot read raw source items'
);
select extensions.ok(
  not has_table_privilege('service_role', 'app_private.news_engine_sources', 'select'),
  'even the service role has no direct table access to the source registry'
);

select extensions.ok(
  (select bool_and(relrowsecurity and relforcerowsecurity)
   from pg_class
   join pg_namespace on pg_namespace.oid = pg_class.relnamespace
   where pg_namespace.nspname = 'app_private'
     and pg_class.relname in (
       'news_engine_sources', 'news_source_discovery_state', 'news_story_clusters',
       'news_source_items', 'news_cluster_items', 'news_extracted_facts',
       'news_entity_aliases', 'news_generation_attempts', 'news_engine_runs',
       'news_engine_run_stages', 'news_engine_failures', 'news_publication_policies'
     )),
  'row level security is enabled and forced on every news engine table'
);

-- ---------------------------------------------------------------------------
-- Name normalisation
-- ---------------------------------------------------------------------------

select extensions.is(
  app_private.news_engine_normalize_name('الوِداد الرِّياضي'),
  app_private.news_engine_normalize_name('الوداد الرياضي'),
  'Arabic diacritics do not change a club''s identity'
);
select extensions.is(
  app_private.news_engine_normalize_name('الــوداد'),
  app_private.news_engine_normalize_name('الوداد'),
  'tatweel elongation does not change a club''s identity'
);
select extensions.is(
  app_private.news_engine_normalize_name('Difaâ El Jadida'),
  'difaa el jadida',
  'Latin accents fold to their base letters'
);
select extensions.is(
  app_private.news_engine_normalize_name('  Raja   Club-Athletic!! '),
  'raja club athletic',
  'punctuation becomes a separator and whitespace collapses'
);
select extensions.isnt(
  app_private.news_engine_normalize_name('الوداد'),
  app_private.news_engine_normalize_name('الرجاء'),
  'two different clubs do not collapse onto one key'
);
select extensions.ok(
  app_private.news_engine_normalize_name('   ') is null,
  'a value with no identity normalises to null rather than an empty match'
);

-- ---------------------------------------------------------------------------
-- Entity resolution: language ranks, it does not filter
-- ---------------------------------------------------------------------------

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Seed one club and its Arabic, French and abbreviated forms, exactly as the
-- curated alias set does.
insert into app.teams (slug, name, short_name, code, active)
values ('news-engine-test-club', 'News Engine Test Club', 'NETC', 'NETC', true)
on conflict (slug) do nothing;

select api.news_engine_upsert_alias(
  'team', (select id from app.teams where slug = 'news-engine-test-club'),
  'نادي الاختبار الرياضي', 'ar', 1.0, 'seed'
);
select api.news_engine_upsert_alias(
  'team', (select id from app.teams where slug = 'news-engine-test-club'),
  'Test Club AC', 'fr', 1.0, 'seed'
);
select api.news_engine_upsert_alias(
  'team', (select id from app.teams where slug = 'news-engine-test-club'),
  'TCA', 'fr', 0.7, 'seed'
);

-- Moroccan Arabic sports copy routinely writes club names in Latin script. An
-- Arabic article naming the French form must still resolve, or the story is
-- filed with no club and needlessly held for review.
select extensions.is(
  (api.news_engine_resolve_entities('team', array['نادي الاختبار الرياضي'], 'ar') -> 0 ->> 'entityId'),
  (api.news_engine_resolve_entities('team', array['Test Club AC'], 'ar') -> 0 ->> 'entityId'),
  'a French club form inside an Arabic article resolves to the same club'
);
select extensions.is(
  (api.news_engine_resolve_entities('team', array['TCA'], 'ar') -> 0 ->> 'entityId'),
  (api.news_engine_resolve_entities('team', array['نادي الاختبار الرياضي'], 'fr') -> 0 ->> 'entityId'),
  'an abbreviation and the Arabic full name resolve to the same club in either language'
);
select extensions.ok(
  (api.news_engine_resolve_entities('team', array['Paris Saint-Germain'], 'ar') -> 0 ->> 'entityId') is null,
  'a club outside the catalog stays unresolved rather than being invented'
);

reset role;

-- ---------------------------------------------------------------------------
-- Service-role enforcement
-- ---------------------------------------------------------------------------

set local role anon;
select extensions.throws_ok(
  $$ select api.news_engine_status(24) $$,
  '42501',
  null,
  'anonymous callers are refused by the service-role guard'
);
reset role;

-- ---------------------------------------------------------------------------
-- Pipeline behaviour under the service role
-- ---------------------------------------------------------------------------

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- A disabled source cannot be claimed. This is the switch that keeps a merged
-- migration from starting collection.
select extensions.throws_ok(
  $$ select api.news_engine_claim_source('elbotola') $$,
  '42501',
  null,
  'a disabled source cannot be claimed'
);

select extensions.throws_ok(
  $$ select api.news_engine_claim_source('does-not-exist') $$,
  'P0002',
  null,
  'an unknown source slug is rejected'
);

reset role;

-- Enable the source under the owner so the pipeline assertions can run.
update app_private.news_engine_sources
set enabled = true, article_fetch_approved = true
where slug = 'elbotola';

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select extensions.ok(
  (api.news_engine_claim_source('elbotola', true) -> 'source' ->> 'slug') = 'elbotola',
  'an enabled source can be claimed and returns its configuration'
);

-- Discovery is idempotent: the same listing twice yields one item.
select extensions.is(
  (api.news_engine_record_discovery(
    'elbotola',
    jsonb_build_array(jsonb_build_object(
      'sourceArticleId', '2026-09-21-15-00-907',
      'sourceUrl', 'https://www.elbotola.com/article/2026-09-21-15-00-907.html',
      'urlHash', repeat('a', 64),
      'sourceLanguage', 'ar',
      'sourceTitle', 'عنوان تجريبي',
      'sourcePublishedAt', (statement_timestamp() - interval '1 hour')::text,
      'sourceUpdatedAt', (statement_timestamp() - interval '1 hour')::text,
      'metadata', '{}'::jsonb
    ))
  ) ->> 'discovered')::integer,
  1,
  'a newly discovered article is queued'
);

select extensions.is(
  (api.news_engine_record_discovery(
    'elbotola',
    jsonb_build_array(jsonb_build_object(
      'sourceArticleId', '2026-09-21-15-00-907',
      'sourceUrl', 'https://www.elbotola.com/article/2026-09-21-15-00-907.html',
      'urlHash', repeat('a', 64),
      'sourceLanguage', 'ar',
      'sourceTitle', 'عنوان تجريبي',
      'sourcePublishedAt', (statement_timestamp() - interval '1 hour')::text,
      'sourceUpdatedAt', (statement_timestamp() - interval '1 hour')::text,
      'metadata', '{}'::jsonb
    ))
  ) ->> 'duplicates')::integer,
  1,
  'rediscovering the same article is a duplicate, not a second item'
);

-- A URL from another host is refused even when the payload claims otherwise.
select extensions.is(
  (api.news_engine_record_discovery(
    'elbotola',
    jsonb_build_array(jsonb_build_object(
      'sourceArticleId', 'evil-1',
      'sourceUrl', 'https://evil.example.com/article/2026-09-21-15-00-907.html',
      'urlHash', repeat('b', 64),
      'sourceLanguage', 'ar',
      'metadata', '{}'::jsonb
    ))
  ) ->> 'invalid')::integer,
  1,
  'a url outside the source host never enters the pipeline'
);

-- A URL that does not match the source's article pattern is refused too.
select extensions.is(
  (api.news_engine_record_discovery(
    'elbotola',
    jsonb_build_array(jsonb_build_object(
      'sourceArticleId', 'tag-1',
      'sourceUrl', 'https://www.elbotola.com/tag/botola',
      'urlHash', repeat('c', 64),
      'sourceLanguage', 'ar',
      'metadata', '{}'::jsonb
    ))
  ) ->> 'invalid')::integer,
  1,
  'a url that does not match the article pattern never enters the pipeline'
);

-- Relevance rejections must record why.
select extensions.is(
  jsonb_array_length(api.news_engine_pending_items('discovered', 10, 'elbotola')),
  1,
  'the discovered item is visible to the fetch stage'
);

select extensions.throws_ok(
  $$ select api.news_engine_record_fetch(
       (select id from app_private.news_source_items limit 1),
       'not-a-sha',
       repeat('x', 200)
     ) $$,
  '22023',
  null,
  'a malformed content hash is rejected'
);

select extensions.throws_ok(
  $$ select api.news_engine_record_fetch(
       (select id from app_private.news_source_items limit 1),
       repeat('d', 64),
       'too short'
     ) $$,
  '22023',
  null,
  'an empty or near-empty article body is rejected'
);

select extensions.is(
  api.news_engine_record_fetch(
    (select id from app_private.news_source_items limit 1),
    repeat('d', 64),
    repeat('محتوى المقال ', 40)
  ) ->> 'outcome',
  'fetched',
  'a parsed article is recorded'
);

select extensions.is(
  api.news_engine_record_fetch(
    (select id from app_private.news_source_items limit 1),
    repeat('d', 64),
    repeat('محتوى المقال ', 40)
  ) ->> 'outcome',
  'skipped',
  'an unchanged content hash short-circuits instead of reprocessing'
);

-- Claim statuses are a closed vocabulary; nothing outside it can be stored.
select extensions.throws_ok(
  $$ select api.news_engine_record_facts(
       (select id from app_private.news_source_items limit 1),
       'official_signing', null, null, null, '{}'::uuid[], '{}'::uuid[],
       '[]'::jsonb, null,
       '[{"text":"A claim","status":"definitely_true"}]'::jsonb,
       '[]'::jsonb, 'official', 'facts-v1'
     ) $$,
  '22023',
  null,
  'a claim outside the confidence vocabulary is rejected'
);

-- The publication contract refuses unsafe or stub-shaped bodies.
select extensions.throws_ok(
  $$ select api.news_engine_publish_article(
       gen_random_uuid(), 'ar', 'a-valid-slug', 'A valid headline here',
       null, 'A valid summary for the article.',
       '<p>short</p>', 3, 'sanitize-html@2.17.5', null, null, null,
       '{}'::text[], '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], null, false, null
     ) $$,
  '22023',
  null,
  'a stub-length body is refused by the publication contract'
);

select extensions.throws_ok(
  $$ select api.news_engine_publish_article(
       gen_random_uuid(), 'ar', 'a-valid-slug', 'A valid headline here',
       null, 'A valid summary for the article.',
       '<p>' || repeat('valid body text ', 40) || '</p><script>alert(1)</script>',
       3, 'sanitize-html@2.17.5', null, null, null,
       '{}'::text[], '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], null, false, null
     ) $$,
  '22023',
  null,
  'a body containing a script tag is refused'
);

select extensions.throws_ok(
  $$ select api.news_engine_publish_article(
       gen_random_uuid(), 'ar', 'a-valid-slug', 'A valid headline here',
       null, 'A valid summary for the article.',
       '<p>' || repeat('valid body text ', 40) || '</p>',
       3, 'elbotola-link-v1', null, null, null,
       '{}'::text[], '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], null, false, null
     ) $$,
  '22023',
  null,
  'a link-stub sanitizer contract cannot be used to publish engine articles'
);

select extensions.throws_ok(
  $$ select api.news_engine_publish_article(
       gen_random_uuid(), 'ar', 'a-valid-slug', 'A valid headline here',
       null, 'A valid summary for the article.',
       '<p>' || repeat('valid body text ', 40) || '</p>',
       3, 'sanitize-html@2.17.5', null, null, null,
       '{}'::text[], '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], null, true, null
     ) $$,
  '22023',
  null,
  'publishing with no related club, player or competition is refused'
);

-- Generation verdicts cannot contradict their gates.
select extensions.throws_ok(
  $$ select api.news_engine_record_generation(
       gen_random_uuid(), 'ar', 'model', 'compose-v1', '{}'::jsonb,
       0.9, '{}'::jsonb, 'rejected', 'passed', 'passed'
     ) $$,
  '22023',
  null,
  'a passing verdict cannot be recorded when a gate failed'
);

-- The failure inbox refuses credential-shaped text.
select extensions.throws_ok(
  $$ select api.news_engine_record_failure(
       'fetch', 'FETCH_FAILED',
       'failed with authorization: Bearer sb_secret_abcdefghijklmnop'
     ) $$,
  '22023',
  null,
  'a credential-shaped failure message is refused at the boundary'
);

select extensions.ok(
  api.news_engine_record_failure('fetch', 'FETCH_FAILED', 'Source returned status 503.') is not null,
  'an ordinary failure message is accepted'
);

-- Media never comes from a third-party publisher.
select extensions.is(
  api.news_engine_resolve_hero_asset('{}'::uuid[], '{}'::uuid[], null) ->> 'origin',
  'botolago_editorial_graphic',
  'with no catalog media the hero falls back to BotolaGO''s own graphic'
);

select extensions.ok(
  (api.news_engine_status(24) -> 'sources') is not null,
  'the status read model reports per-source health'
);

reset role;

-- ---------------------------------------------------------------------------
-- The public surface leaks no engine internals
-- ---------------------------------------------------------------------------
--
-- Published articles must read as BotolaGO editorial coverage. No crawler
-- name, parser identifier, source id, source URL or ingestion field may reach
-- a browser. The card DTO is the shape every public feed and detail response
-- is built from, so asserting on its source is the cheapest way to catch a
-- regression that adds one.

select extensions.ok(
  (select prosrc from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app_private' and p.proname = 'news_article_card')
  !~* '(sourceUrl|sourceArticleId|externalId|parserVersion|contentHash|clusterKey|sanitizerVersion|normalized_source_text)',
  'the public article DTO exposes no source, parser or ingestion field'
);

select extensions.ok(
  not has_table_privilege('anon', 'app_private.news_extracted_facts', 'select')
  and not has_table_privilege('anon', 'app_private.news_generation_attempts', 'select')
  and not has_table_privilege('anon', 'app_private.news_engine_runs', 'select'),
  'anonymous clients cannot read facts, generation attempts or run history'
);

-- ---------------------------------------------------------------------------
-- Seeded configuration
-- ---------------------------------------------------------------------------

select extensions.ok(
  exists (
    select 1 from app.publishers
    where slug = 'botolago-newsroom' and active and trust_status = 'trusted'
      and source_type = 'internal'
  ),
  'engine output is published under BotolaGO''s own publisher identity'
);

-- The generator emits these as an article's `tags`, and the public card DTO
-- builds `tags` from taxonomy_type = 'tag'. Seeding them as 'topic' attached
-- them to the story but left every feed card looking untagged.
select extensions.is(
  (select count(*)::integer from app.taxonomies
   where taxonomy_type = 'tag'
     and slug in ('injuries', 'suspensions', 'coaching', 'official-announcement',
                  'fixtures', 'throne-cup')),
  6,
  'the engine''s tag vocabulary is tag-typed so it reaches feed cards'
);
select extensions.is(
  (select count(*)::integer from app.taxonomies
   where taxonomy_type = 'topic'
     and slug in ('injuries', 'suspensions', 'coaching', 'official-announcement',
                  'fixtures', 'throne-cup')),
  0,
  'no stale topic-typed duplicate of a tag slug remains'
);

select extensions.ok(
  exists (
    select 1 from app_private.news_publication_policies
    where event_type = 'transfer_rumour' and not auto_publish
  ),
  'transfer rumours never auto-publish'
);
select extensions.ok(
  exists (
    select 1 from app_private.news_publication_policies
    where event_type = 'injury' and not auto_publish
  ),
  'injury claims never auto-publish'
);
select extensions.ok(
  exists (
    select 1 from app_private.news_publication_policies
    where event_type = 'official_signing' and auto_publish
      and minimum_claim_status = 'official'
  ),
  'an officially announced signing may auto-publish'
);
select extensions.ok(
  exists (
    select 1 from app_private.news_publication_policies
    where event_type = 'other' and not auto_publish
  ),
  'unclassified events never auto-publish'
);

select * from extensions.finish();
rollback;
