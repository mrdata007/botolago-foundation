-- BG-0012: end-to-end editorial lifecycle through the bridged Admin role
-- model: create draft -> forbidden publish attempt -> publish -> public
-- visibility -> placement -> unpublish -> public visibility withdrawn,
-- while the CMS listing keeps showing the story to editorial staff.
begin;

select extensions.no_plan();

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '92000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'lifecycle-editor@example.test', 'hash',
    statement_timestamp(), '{}', '{"username":"lifecycle_editor"}',
    statement_timestamp(), statement_timestamp()
  ),
  (
    '92000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'lifecycle-publisher@example.test', 'hash',
    statement_timestamp(), '{}', '{"username":"lifecycle_publisher"}',
    statement_timestamp(), statement_timestamp()
  );

insert into app_private.staff_principals (auth_user_id)
values
  ('92000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000002');

insert into app_private.staff_role_assignments (staff_principal_id, role_id, grant_reason)
select principal.id, role.id, 'BG-0012 editorial lifecycle pgTAP fixture.'
from app_private.staff_principals principal
join app_private.admin_roles role on role.name = 'editor'
where principal.auth_user_id = '92000000-0000-4000-8000-000000000001';

insert into app_private.staff_role_assignments (staff_principal_id, role_id, grant_reason)
select principal.id, role.id, 'BG-0012 editorial lifecycle pgTAP fixture.'
from app_private.staff_principals principal
join app_private.admin_roles role on role.name = 'publisher'
where principal.auth_user_id = '92000000-0000-4000-8000-000000000002';

-- Step 1: create draft as editor.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"92000000-0000-4000-8000-000000000001","role":"authenticated"}', true
);
select set_config(
  'test.lifecycle_article_id',
  (
    api.editorial_create_draft(
      'fr', 'lifecycle-derby-preview', 'Avant-match du derby de Casablanca',
      'Résumé complet pour la publication du cycle de vie éditorial.',
      'markdown', repeat('Analyse tactique complète du derby. ', 6),
      '<p>Analyse tactique complète du derby de Casablanca pour le test de cycle de vie.</p>',
      5, 'sanitize-html@2.17.5'
    ) ->> 'articleId'
  ),
  true
);
select extensions.ok(
  current_setting('test.lifecycle_article_id') is not null,
  'editor creates a draft article edition'
);

-- Step 2: editor attempts to publish directly and must be refused.
select extensions.throws_ok(
  $$select api.editorial_transition_article(
    current_setting('test.lifecycle_article_id')::uuid, 'published'
  )$$,
  '42501', 'news_editorial_forbidden',
  'a plain editor cannot publish an article'
);

-- Move to in_review (editor-tier transition) ahead of the publisher's turn.
select extensions.lives_ok(
  $$select api.editorial_transition_article(
    current_setting('test.lifecycle_article_id')::uuid, 'in_review'
  )$$,
  'editor moves the draft into review'
);
reset role;

-- Step 3: publisher publishes the reviewed article.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"92000000-0000-4000-8000-000000000002","role":"authenticated"}', true
);
select extensions.lives_ok(
  $$select api.editorial_transition_article(
    current_setting('test.lifecycle_article_id')::uuid, 'published'
  )$$,
  'publisher publishes the reviewed article'
);
reset role;

-- Step 4: the public read model now returns it.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.is(
  api.news_article_detail('fr', 'lifecycle-derby-preview') ->> 'id',
  current_setting('test.lifecycle_article_id'),
  'the published article is now publicly readable through api.news_article_detail'
);
reset role;

-- Step 5: publisher sets a placement now that the article is public.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"92000000-0000-4000-8000-000000000002","role":"authenticated"}', true
);
select extensions.lives_ok(
  $$select api.editorial_set_placement(
    current_setting('test.lifecycle_article_id')::uuid, 'featured'
  )$$,
  'publisher can set a placement once the article is public'
);

-- Step 6: publisher unpublishes it.
select extensions.lives_ok(
  $$select api.editorial_transition_article(
    current_setting('test.lifecycle_article_id')::uuid, 'unpublished'
  )$$,
  'publisher unpublishes the article'
);
reset role;

-- Step 7: the public read model no longer returns it.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok(
  $$select api.news_article_detail('fr', 'lifecycle-derby-preview')$$,
  'P0002', 'news_article_not_found',
  'an unpublished article disappears from the public read model'
);
reset role;

-- Step 8: editorial_list_stories still shows it to editorial staff.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"92000000-0000-4000-8000-000000000001","role":"authenticated"}', true
);
select extensions.ok(
  (
    select bool_or(item ->> 'id' = current_setting('test.lifecycle_article_id'))
    from jsonb_array_elements(
      api.editorial_list_stories(p_language := 'fr', p_status := 'unpublished') -> 'items'
    ) item
  ),
  'editorial_list_stories still shows the unpublished article to editorial staff'
);
reset role;

select * from extensions.finish();
rollback;
