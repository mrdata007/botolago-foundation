begin;

select extensions.no_plan();

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '14000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'news-one@example.test', 'hash', '{}',
    '{"username":"news_one"}', statement_timestamp(), statement_timestamp()
  ),
  (
    '14000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'news-two@example.test', 'hash', '{}',
    '{"username":"news_two"}', statement_timestamp(), statement_timestamp()
  );
insert into app.publishers (id, slug, name, source_type, trust_status)
values ('24000000-0000-4000-8000-000000000001', 'rls-news', 'RLS News', 'internal', 'trusted');
insert into app.stories (id, origin, original_language, publisher_id)
values
  ('34000000-0000-4000-8000-000000000001', 'manual', 'fr', '24000000-0000-4000-8000-000000000001'),
  ('34000000-0000-4000-8000-000000000002', 'manual', 'fr', '24000000-0000-4000-8000-000000000001');
insert into app.article_editions (
  id, story_id, language, slug, title, summary, body_source, body_html,
  status, visibility, published_at, reading_time_minutes, sanitizer_version
) values
  (
    '44000000-0000-4000-8000-000000000001', '34000000-0000-4000-8000-000000000001',
    'fr', 'rls-published', 'Article public pour test RLS',
    'Cet article public vérifie les protections de lecture et sauvegarde.',
    repeat('Contenu public de sécurité. ', 3), '<p>Contenu public de sécurité pour le test.</p>',
    'published', 'public', '2025-01-01T00:00:00Z', 3, 'test'
  ),
  (
    '44000000-0000-4000-8000-000000000002', '34000000-0000-4000-8000-000000000002',
    'fr', 'rls-draft', 'Article brouillon pour test RLS',
    'Ce brouillon ne doit jamais apparaître dans une réponse publique.',
    repeat('Contenu privé de brouillon. ', 3), '<p>Contenu privé de brouillon pour le test.</p>',
    'draft', 'private', null, 3, 'test'
  );

select extensions.ok(
  not has_table_privilege('anon', 'app.article_editions', 'select'),
  'anonymous has no direct article table privilege'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'app.article_editions', 'update'),
  'authenticated browsers cannot edit canonical articles directly'
);
select extensions.ok(
  not has_table_privilege('service_role', 'app.article_editions', 'insert'),
  'service role must use trusted ingestion RPCs instead of direct canonical grants'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'app_private.editorial_memberships', 'select'),
  'browser roles cannot inspect editorial authority records'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.is(
  jsonb_array_length(api.news_feed('fr') -> 'items'),
  1,
  'anonymous feed returns only published public content'
);
select extensions.throws_ok(
  $$select * from app.article_editions$$,
  '42501', null,
  'anonymous cannot bypass the public read model'
);
select extensions.throws_ok(
  $$select api.save_article('44000000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'anonymous cannot save content'
);
select extensions.throws_ok(
  $$select api.news_begin_ingestion_run(
      '24000000-0000-4000-8000-000000000001', 'sync_articles'
    )$$,
  '42501', null,
  'anonymous cannot invoke ingestion operations'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"14000000-0000-4000-8000-000000000001","role":"authenticated"}', true
);
select extensions.is(
  api.save_article('44000000-0000-4000-8000-000000000001') ->> 'saved',
  'true',
  'authenticated user can save a public article'
);
select extensions.is(
  api.save_article('44000000-0000-4000-8000-000000000001') ->> 'saved',
  'true',
  'save is idempotent'
);
select extensions.is(
  jsonb_array_length(api.news_saved_articles() -> 'items'),
  1,
  'owner sees exactly their saved article'
);
select extensions.throws_ok(
  $$insert into app.saved_articles (user_id, article_edition_id) values (
      '14000000-0000-4000-8000-000000000002',
      '44000000-0000-4000-8000-000000000001'
    )$$,
  '42501', null,
  'authenticated user cannot forge another user ownership row'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"14000000-0000-4000-8000-000000000002","role":"authenticated"}', true
);
select extensions.is(
  jsonb_array_length(api.news_saved_articles() -> 'items'),
  0,
  'second user cannot read the first user saved content'
);
select extensions.is(
  api.unsave_article('44000000-0000-4000-8000-000000000001') ->> 'saved',
  'false',
  'unfollow-style delete is idempotent even when the owner has no row'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"14000000-0000-4000-8000-000000000001","role":"authenticated"}', true
);
select extensions.is(
  api.unsave_article('44000000-0000-4000-8000-000000000001') ->> 'saved',
  'false',
  'owner can unsave their own article'
);
select extensions.is(
  jsonb_array_length(api.news_saved_articles() -> 'items'),
  0,
  'unsave removes the owner relation'
);
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.ok(
  api.news_begin_ingestion_run(
    '24000000-0000-4000-8000-000000000001', 'sync_articles'
  ) is not null,
  'service role can start ingestion only through the controlled RPC'
);
select extensions.throws_ok(
  $$select * from app_private.news_ingestion_runs$$,
  '42501', null,
  'service role cannot directly inspect private ingestion tables'
);
reset role;

select * from extensions.finish();
rollback;
