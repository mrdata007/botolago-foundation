begin;

select extensions.no_plan();

insert into app.authors (id, slug, display_name)
values ('a4000000-0000-4000-8000-000000000001', 'botolago-editor', 'BotolaGO Editor');
insert into app.publishers (id, slug, name, source_type, trust_status)
values ('b4000000-0000-4000-8000-000000000001', 'botolago', 'BotolaGO', 'internal', 'trusted');
insert into app.taxonomies (id, taxonomy_type, slug, display_order)
values
  ('c4000000-0000-4000-8000-000000000001', 'category', 'analysis', 1),
  ('c4000000-0000-4000-8000-000000000002', 'tag', 'botola-pro', 1);
insert into app.taxonomy_translations (taxonomy_id, language, display_name)
values
  ('c4000000-0000-4000-8000-000000000001', 'fr', 'Analyse'),
  ('c4000000-0000-4000-8000-000000000001', 'ar', 'تحليل'),
  ('c4000000-0000-4000-8000-000000000002', 'fr', 'Botola Pro'),
  ('c4000000-0000-4000-8000-000000000002', 'ar', 'البطولة الاحترافية');

insert into app.stories (
  id, origin, original_language, author_id, publisher_id, canonical_url, content_fingerprint
) values (
  'd4000000-0000-4000-8000-000000000001', 'manual', 'fr',
  'a4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001',
  'https://botolago.test/news/derby-preview', repeat('a', 64)
);
insert into app.article_editions (
  id, story_id, language, slug, title, summary, body_format, body_source, body_html,
  status, visibility, published_at, reading_time_minutes, sanitizer_version
) values
  (
    'e4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001',
    'fr', 'derby-casablanca-analyse', 'Le derby de Casablanca sous la loupe',
    'Une analyse tactique complète du prochain derby de Casablanca.',
    'markdown', repeat('Contenu tactique du derby. ', 4), '<p>Contenu tactique du derby de Casablanca.</p>',
    'published', 'public', '2025-01-01T10:00:00Z', 4, 'sanitize-html@2.17.0'
  ),
  (
    'e4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000001',
    'ar', 'tahlil-derby-casablanca', 'تحليل شامل لديربي الدار البيضاء',
    'تحليل تكتيكي شامل للديربي المقبل في مدينة الدار البيضاء.',
    'markdown', repeat('محتوى تحليلي عن الديربي. ', 4), '<p>محتوى تحليلي عن ديربي الدار البيضاء.</p>',
    'published', 'public', '2025-01-01T10:00:00Z', 4, 'sanitize-html@2.17.0'
  );
insert into app.story_taxonomies (story_id, taxonomy_id, is_primary)
values
  ('d4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', true),
  ('d4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000002', false);

select extensions.is(
  (select count(*)::integer from app.article_editions
    where story_id = 'd4000000-0000-4000-8000-000000000001'),
  2,
  'one canonical story links French and Arabic editions without duplicating identity'
);
select extensions.throws_ok(
  $$insert into app.article_editions (
      story_id, language, slug, title, summary, body_source, body_html,
      reading_time_minutes, sanitizer_version
    ) values (
      'd4000000-0000-4000-8000-000000000001', 'fr', 'another-slug',
      'Duplicate French edition title', 'Duplicate translation must be rejected.',
      'Long enough markdown source content.', '<p>Long enough sanitized body content.</p>', 2, 'test'
    )$$,
  '23505',
  null,
  'a story can have at most one edition per language'
);
select extensions.throws_ok(
  $$insert into app.article_editions (
      story_id, language, slug, title, summary, body_source, body_html,
      reading_time_minutes, sanitizer_version
    ) values (
      gen_random_uuid(), 'fr', 'unsafe-body', 'Unsafe body title',
      'Unsafe content is rejected by a database defense.', 'Long enough markdown source content.',
      '<script>alert(1)</script><p>Unsafe body content.</p>', 2, 'test'
    )$$,
  '23514',
  null,
  'unsafe body is rejected before content persistence'
);
select extensions.throws_ok(
  $$update app.article_editions set body_html = '<p onclick="alert(1)">Unsafe event handler body.</p>'
    where id = 'e4000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'database defense rejects event handlers missed by an application boundary'
);

select extensions.is(
  jsonb_array_length(api.news_search('fr', 'derby Casablanca') -> 'items'),
  1,
  'weighted French FTS returns the canonical published edition'
);
select extensions.is(
  jsonb_array_length(api.news_search('ar', 'ديربي الدار البيضاء') -> 'items'),
  1,
  'normalized Arabic FTS returns the Arabic edition'
);

insert into app.stories (
  id, origin, original_language, author_id, publisher_id, content_fingerprint
) values (
  'd4000000-0000-4000-8000-000000000002', 'manual', 'fr',
  'a4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', repeat('b', 64)
);
insert into app.article_editions (
  id, story_id, language, slug, title, summary, body_source, body_html,
  status, visibility, published_at, reading_time_minutes, sanitizer_version
) values (
  'e4000000-0000-4000-8000-000000000003', 'd4000000-0000-4000-8000-000000000002',
  'fr', 'derby-apres-match', 'Le derby après le coup de sifflet',
  'Les enseignements principaux après le derby de Casablanca.',
  repeat('Analyse après le match. ', 4), '<p>Analyse complète après le match.</p>',
  'published', 'public', '2025-01-02T10:00:00Z', 3, 'sanitize-html@2.17.0'
);
insert into app.story_taxonomies (story_id, taxonomy_id, is_primary)
values ('d4000000-0000-4000-8000-000000000002', 'c4000000-0000-4000-8000-000000000001', true);
insert into app.editorial_placements (
  article_edition_id, placement_type, language, priority, starts_at
) values (
  'e4000000-0000-4000-8000-000000000003', 'home_lead', 'fr', 1, '2025-01-01T00:00:00Z'
);

select extensions.is(
  jsonb_array_length(api.news_related_articles('e4000000-0000-4000-8000-000000000001', 6)),
  1,
  'related-article ranking uses shared normalized taxonomy'
);
select extensions.is(
  api.news_home_modules('fr', 8) -> 'lead' ->> 'id',
  'e4000000-0000-4000-8000-000000000003',
  'backend placement selects the active home lead deterministically'
);
select extensions.throws_ok(
  $$insert into app.editorial_placements (
      article_edition_id, placement_type, language, priority, starts_at
    ) values (
      'e4000000-0000-4000-8000-000000000001', 'home_lead', 'fr', 2,
      '2025-01-01T00:00:00Z'
    )$$,
  '23P01',
  'news_placement_window_conflict',
  'overlapping lead placement windows are rejected transactionally'
);

update app.article_editions
set title = 'Le derby de Casablanca : analyse révisée', updated_by = null
where id = 'e4000000-0000-4000-8000-000000000001';
select extensions.is(
  (select count(*)::integer from app.article_revisions
   where article_edition_id = 'e4000000-0000-4000-8000-000000000001'),
  1,
  'material edits append an immutable revision snapshot'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'f4000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'news-admin@example.test', 'hash', '{}',
  '{"username":"news_admin"}', statement_timestamp(), statement_timestamp()
);
-- BG-0012: has_editorial_role now resolves through the Admin staff role
-- model, not the legacy editorial_memberships table — grant the
-- content_admin role (editorial.write + editorial.publish +
-- editorial.manage_placements) to cover this fixture's full workflow.
insert into app_private.staff_principals (auth_user_id)
values ('f4000000-0000-4000-8000-000000000001');
insert into app_private.staff_role_assignments (staff_principal_id, role_id, grant_reason)
select principal.id, role.id, 'news_domain.test.sql fixture.'
from app_private.staff_principals principal
join app_private.admin_roles role on role.name = 'content_admin'
where principal.auth_user_id = 'f4000000-0000-4000-8000-000000000001';
-- has_editorial_role also requires a verified MFA factor and an aal2
-- session assertion (every editorial.* permission is seeded
-- requires_mfa = true).
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (
  'f4100000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001',
  'Primary TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp()
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f4000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true
);
select set_config(
  'test.news_draft_id',
  api.editorial_create_draft(
    'fr', 'workflow-transition-test', 'Article de workflow éditorial',
    'Un résumé suffisamment long pour tester les transitions éditoriales.',
    'markdown'::app.article_body_format, repeat('Contenu de workflow. ', 4),
    '<p>Contenu de workflow éditorial suffisamment long.</p>', 3::smallint, 'test'
  ) ->> 'articleId',
  true
);
select extensions.is(
  api.editorial_transition_article(
    current_setting('test.news_draft_id')::uuid, 'in_review'
  ) ->> 'status',
  'in_review',
  'editor can submit a draft for review'
);
select extensions.is(
  api.editorial_transition_article(
    current_setting('test.news_draft_id')::uuid, 'published', null, 'public'
  ) ->> 'status',
  'published',
  'publisher can publish an in-review edition'
);
select extensions.is(
  api.editorial_soft_delete_story('d4000000-0000-4000-8000-000000000002') ->> 'deleted',
  'true',
  'admin workflow soft-deletes a story without physical deletion'
);
reset role;
select extensions.ok(
  (select deleted_at is not null from app.stories where id = 'd4000000-0000-4000-8000-000000000002'),
  'soft-deleted story remains available for audit and recovery'
);
select extensions.is(
  (select count(*)::integer from app_private.editorial_audit_events
   where event_type = 'story_soft_deleted'),
  1,
  'sensitive editorial workflow writes an append-only audit event'
);

select * from extensions.finish();
rollback;
