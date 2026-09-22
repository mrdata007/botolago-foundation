-- BG-0073 News stand-down.
--
-- Two invariants are under test here, and they only hold together:
--   * provider ingestion can no longer publish anything, on either the insert
--     or the update branch, so a scheduled run cannot undo a stand-down;
--   * the stand-down itself moves only machine-ingested editions, never human
--     editorial work, and is safe to apply more than once.

begin;

select extensions.no_plan();

-- ---------------------------------------------------------------------------
-- A fresh provider ingest lands as an unpublished draft.
-- ---------------------------------------------------------------------------

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select extensions.is(
  api.news_ingest_provider_article(
    'gnews', 'stand-down-1', 'https://publisher.example/stand-down-one', repeat('c', 64),
    'fr', 'Une actualité Botola ingérée',
    'Une description suffisamment longue pour le flux de nouvelles.',
    '<p>Une description suffisamment longue pour le flux de nouvelles.</p><p><a href="https://publisher.example/stand-down-one" rel="nofollow noopener noreferrer">Lire l’article original sur Publisher Example</a></p>',
    'Publisher Example', 'https://publisher.example/', 'gnews:stand-down-1:v1',
    statement_timestamp() - interval '2 hours', statement_timestamp() - interval '2 hours',
    1, 'gnews-excerpt-v1'
  ) ->> 'outcome',
  'inserted',
  'a first provider article is still ingested and persisted'
);
reset role;

select extensions.is(
  (select status::text from app.article_editions where slug like 'gnews-fr-%'),
  'draft',
  'an ingested article arrives as a draft rather than published'
);
select extensions.is(
  (select visibility::text from app.article_editions where slug like 'gnews-fr-%'),
  'private',
  'an ingested article arrives private rather than public'
);
select extensions.ok(
  (select published_at is null from app.article_editions where slug like 'gnews-fr-%'),
  'ingestion never stamps published_at; the source timestamp stays on the private source row'
);
select extensions.ok(
  (select source_published_at is not null from app_private.news_source_articles
   where external_id = 'stand-down-1'),
  'the provider publication timestamp is still preserved on the source article'
);

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.is(
  jsonb_array_length(api.news_feed('fr') -> 'items'),
  0,
  'a freshly ingested article is not reachable through the public News feed'
);
reset role;

-- ---------------------------------------------------------------------------
-- A provider update never resurrects an edition a human has unpublished.
-- ---------------------------------------------------------------------------

update app.article_editions
set status = 'unpublished', visibility = 'private', unpublished_at = statement_timestamp()
where slug like 'gnews-fr-%';

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select extensions.is(
  api.news_ingest_provider_article(
    'gnews', 'stand-down-1', 'https://publisher.example/stand-down-one', repeat('d', 64),
    'fr', 'Une actualité Botola mise à jour',
    'Une description mise à jour, suffisamment longue pour le flux.',
    '<p>Une description mise à jour, suffisamment longue pour le flux.</p><p><a href="https://publisher.example/stand-down-one" rel="nofollow noopener noreferrer">Lire l’article original sur Publisher Example</a></p>',
    'Publisher Example', 'https://publisher.example/', 'gnews:stand-down-1:v2',
    statement_timestamp() - interval '2 hours', statement_timestamp() - interval '1 hour',
    1, 'gnews-excerpt-v1'
  ) ->> 'outcome',
  'updated',
  'a changed provider article is still refreshed'
);
reset role;

select extensions.is(
  (select title from app.article_editions where slug like 'gnews-fr-%'),
  'Une actualité Botola mise à jour',
  'the update branch still refreshes editorial content'
);
select extensions.is(
  (select status::text from app.article_editions where slug like 'gnews-fr-%'),
  'unpublished',
  'a provider update cannot republish an edition that was deliberately unpublished'
);
select extensions.is(
  (select visibility::text from app.article_editions where slug like 'gnews-fr-%'),
  'private',
  'a provider update cannot make an unpublished edition public again'
);
select extensions.ok(
  (select published_at is null from app.article_editions where slug like 'gnews-fr-%'),
  'a provider update never writes published_at'
);

-- ---------------------------------------------------------------------------
-- The stand-down moves machine-ingested editions and leaves human work alone.
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '54000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'stand-down-editor@example.test', 'hash', '{}',
  '{"username":"stand_down_editor"}', statement_timestamp(), statement_timestamp()
);
insert into app.publishers (id, slug, name, source_type, trust_status)
values ('64000000-0000-4000-8000-000000000001', 'stand-down-house', 'Stand Down House',
        'internal', 'trusted');
insert into app.stories (id, origin, original_language, publisher_id)
values
  ('74000000-0000-4000-8000-000000000001', 'manual', 'fr', '64000000-0000-4000-8000-000000000001'),
  ('74000000-0000-4000-8000-000000000002', 'manual', 'fr', '64000000-0000-4000-8000-000000000001'),
  ('74000000-0000-4000-8000-000000000003', 'manual', 'fr', '64000000-0000-4000-8000-000000000001');
insert into app.article_editions (
  id, story_id, language, slug, title, summary, body_source, body_html,
  status, visibility, published_at, reading_time_minutes, sanitizer_version, created_by,
  updated_by
) values
  (
    '84000000-0000-4000-8000-000000000001', '74000000-0000-4000-8000-000000000001',
    'fr', 'stand-down-machine', 'Lien sortant ingéré par une machine',
    'Ce lien sortant a été ingéré sans auteur humain et doit être retiré.',
    repeat('Contenu ingéré automatiquement. ', 3),
    '<p>Contenu ingéré automatiquement pour le test.</p>',
    'published', 'public', '2026-01-01T00:00:00Z', 2, 'test', null, null
  ),
  (
    '84000000-0000-4000-8000-000000000002', '74000000-0000-4000-8000-000000000002',
    'fr', 'stand-down-human', 'Article éditorial écrit par une personne',
    'Cet article éditorial humain doit survivre intact à un arrêt de la rubrique.',
    repeat('Contenu éditorial humain. ', 3),
    '<p>Contenu éditorial humain pour le test.</p>',
    'published', 'public', '2026-01-01T00:00:00Z', 2, 'test',
    '54000000-0000-4000-8000-000000000001', null
  ),
  -- The case the created_by guard alone cannot see, and the reason this test
  -- exists: an edition NO person created, which a person has since reviewed and
  -- published. Any automated producer leaves created_by null, because that
  -- column is a foreign key to auth.users. What separates a newsroom article an
  -- editor approved from a never-reviewed stub is updated_by, which
  -- api.editorial_transition_article stamps on every transition. Without the
  -- updated_by guard this row is swept, and re-running the stand-down once
  -- silently unpublishes everything an editor ever approved.
  (
    '84000000-0000-4000-8000-000000000003', '74000000-0000-4000-8000-000000000003',
    'fr', 'stand-down-editor-approved', 'Article machine approuvé par une éditrice',
    'Cet article a été produit sans auteur humain puis publié par une éditrice.',
    repeat('Contenu produit automatiquement puis relu. ', 3),
    '<p>Contenu produit automatiquement puis approuvé pour publication.</p>',
    'published', 'public', '2026-01-01T00:00:00Z', 2, 'test',
    null, '54000000-0000-4000-8000-000000000001'
  );

select extensions.is(
  app_private.news_stand_down_machine_editions(),
  1,
  'the stand-down moves exactly the machine-ingested published editions'
);
select extensions.is(
  (select status::text from app.article_editions where slug = 'stand-down-machine'),
  'unpublished',
  'the machine-ingested edition is unpublished'
);
select extensions.is(
  (select status::text from app.article_editions where slug = 'stand-down-editor-approved'),
  'published',
  'an edition an editor approved survives, even though no person created it'
);
select extensions.is(
  (select visibility::text from app.article_editions where slug = 'stand-down-editor-approved'),
  'public',
  'the editor-approved edition keeps its public visibility'
);
select extensions.ok(
  (select unpublished_at is null from app.article_editions where slug = 'stand-down-editor-approved'),
  'the editor-approved edition is never stamped as stood down'
);
select extensions.is(
  (select visibility::text from app.article_editions where slug = 'stand-down-machine'),
  'private',
  'the machine-ingested edition is made private'
);
select extensions.ok(
  (select unpublished_at is not null from app.article_editions where slug = 'stand-down-machine'),
  'the machine-ingested edition records when it was stood down'
);
select extensions.ok(
  (select body_html is not null and published_at is not null
   from app.article_editions where slug = 'stand-down-machine'),
  'nothing is deleted: the body and the original publication timestamp are preserved'
);
select extensions.is(
  (select status::text from app.article_editions where slug = 'stand-down-human'),
  'published',
  'a human-authored published edition is never touched by the stand-down'
);
select extensions.ok(
  (select visibility::text = 'public' and unpublished_at is null
   from app.article_editions where slug = 'stand-down-human'),
  'a human-authored published edition keeps its visibility and is never marked unpublished'
);

select extensions.is(
  (select count(*)::integer from app_private.editorial_audit_events
   where event_type = 'article_status_changed'
     and article_edition_id = '84000000-0000-4000-8000-000000000001'),
  1,
  'the stand-down writes exactly one audit row for the edition it moved'
);
select extensions.is(
  (select metadata ->> 'from' from app_private.editorial_audit_events
   where article_edition_id = '84000000-0000-4000-8000-000000000001'),
  'published',
  'the audit row records the status the edition came from'
);
select extensions.is(
  (select metadata ->> 'to' from app_private.editorial_audit_events
   where article_edition_id = '84000000-0000-4000-8000-000000000001'),
  'unpublished',
  'the audit row records the status the edition moved to'
);
select extensions.ok(
  (select metadata ->> 'actor' = 'system' and actor_user_id is null
   from app_private.editorial_audit_events
   where article_edition_id = '84000000-0000-4000-8000-000000000001'),
  'the audit row records an operator stand-down honestly, without inventing a user actor'
);

-- ---------------------------------------------------------------------------
-- The stand-down is idempotent.
-- ---------------------------------------------------------------------------

select extensions.is(
  app_private.news_stand_down_machine_editions(),
  0,
  'a second stand-down finds nothing left to move'
);
select extensions.is(
  (select count(*)::integer from app_private.editorial_audit_events
   where event_type = 'article_status_changed'),
  1,
  'a second stand-down writes no further audit rows'
);
select extensions.is(
  (select status::text from app.article_editions where slug = 'stand-down-human'),
  'published',
  'a repeated stand-down still leaves human editorial work published'
);

select extensions.ok(
  not has_function_privilege(
    'anon', 'app_private.news_stand_down_machine_editions()', 'execute'
  ),
  'the stand-down is not reachable from a browser role'
);
select extensions.ok(
  not has_function_privilege(
    'service_role', 'app_private.news_stand_down_machine_editions()', 'execute'
  ),
  'the stand-down is not reachable from the ingestion service identity either'
);

select * from extensions.finish();
rollback;
