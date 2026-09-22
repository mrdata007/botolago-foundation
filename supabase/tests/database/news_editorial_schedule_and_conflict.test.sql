-- News CMS activation audit (2026-09-22): what "Programmé" and the editor's
-- optimistic-concurrency token actually do at the database layer.
--
--   1. Every status transition bumps article_editions.updated_at (the
--      set_updated_at trigger), and editorial_update_article refuses a stale
--      expected_updated_at. A client that keeps its pre-transition token gets
--      news_editorial_conflict on its next save -- the CMS editor did exactly
--      that until it started re-reading the edition after a transition.
--   2. A scheduled edition is private before its time, and cancelling a
--      schedule clears it. (Automatic publication of due editions:
--      news_scheduled_publication.test.sql.)
--   3. Linked language editions stay independent.
begin;

select extensions.no_plan();

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '93000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'schedule-editor@example.test', 'hash',
    statement_timestamp(), '{}', '{"username":"schedule_editor"}',
    statement_timestamp(), statement_timestamp()
  ),
  (
    '93000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'schedule-publisher@example.test', 'hash',
    statement_timestamp(), '{}', '{"username":"schedule_publisher"}',
    statement_timestamp(), statement_timestamp()
  );

insert into app_private.staff_principals (auth_user_id)
values
  ('93000000-0000-4000-8000-000000000001'),
  ('93000000-0000-4000-8000-000000000002');

insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values
  (
    '93100000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001',
    'Primary TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp()
  ),
  (
    '93100000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000002',
    'Primary TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp()
  );

insert into app_private.staff_role_assignments (staff_principal_id, role_id, grant_reason)
select principal.id, role.id, 'News CMS schedule/conflict pgTAP fixture.'
from app_private.staff_principals principal
join app_private.admin_roles role on role.name = 'editor'
where principal.auth_user_id = '93000000-0000-4000-8000-000000000001';

insert into app_private.staff_role_assignments (staff_principal_id, role_id, grant_reason)
select principal.id, role.id, 'News CMS schedule/conflict pgTAP fixture.'
from app_private.staff_principals principal
join app_private.admin_roles role on role.name = 'publisher'
where principal.auth_user_id = '93000000-0000-4000-8000-000000000002';

select set_config(
  'test.schedule_body_mac',
  encode(
    extensions.hmac(
      convert_to('<p>Contenu QA pour vérifier la programmation et les conflits.</p>', 'utf8'),
      (select secret from app_private.news_editorial_write_keys where id = true),
      'sha256'
    ),
    'hex'
  ),
  true
);

-- Editor: create a draft and remember its concurrency token.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true
);
select set_config(
  'test.schedule_article_id',
  (
    api.editorial_create_draft(
      'fr', 'qa-programmation-conflit', 'QA programmation et conflit',
      'Résumé QA suffisant pour la contrainte de longueur.',
      'markdown', repeat('Contenu QA pour la programmation. ', 4),
      '<p>Contenu QA pour vérifier la programmation et les conflits.</p>',
      1::smallint, 'sanitize-html@2.17.5',
      p_body_html_mac := current_setting('test.schedule_body_mac')
    ) ->> 'articleId'
  ),
  true
);
select set_config(
  'test.token_before_transition',
  api.editorial_get_article(current_setting('test.schedule_article_id')::uuid) ->> 'updatedAt',
  true
);

select api.editorial_transition_article(
  current_setting('test.schedule_article_id')::uuid, 'in_review'
);

select isnt(
  api.editorial_get_article(current_setting('test.schedule_article_id')::uuid) ->> 'updatedAt',
  current_setting('test.token_before_transition'),
  'a status transition bumps updated_at, so the pre-transition token is stale'
);

select throws_ok(
  format(
    $sql$select api.editorial_update_article(
      %L::uuid, %L::timestamptz, 'qa-programmation-conflit', 'QA programmation et conflit',
      null, 'Résumé QA suffisant pour la contrainte de longueur.', 'markdown',
      %L, '<p>Contenu QA pour vérifier la programmation et les conflits.</p>',
      1::smallint, 'sanitize-html@2.17.5', p_body_html_mac := %L)$sql$,
    current_setting('test.schedule_article_id'),
    current_setting('test.token_before_transition'),
    repeat('Contenu QA pour la programmation. ', 4),
    current_setting('test.schedule_body_mac')
  ),
  '40001',
  'news_editorial_conflict',
  'saving with the token read before the transition is refused as a conflict'
);

select lives_ok(
  format(
    $sql$select api.editorial_update_article(
      %L::uuid, %L::timestamptz, 'qa-programmation-conflit', 'QA programmation et conflit',
      null, 'Résumé QA suffisant pour la contrainte de longueur.', 'markdown',
      %L, '<p>Contenu QA pour vérifier la programmation et les conflits.</p>',
      1::smallint, 'sanitize-html@2.17.5', p_body_html_mac := %L)$sql$,
    current_setting('test.schedule_article_id'),
    api.editorial_get_article(current_setting('test.schedule_article_id')::uuid) ->> 'updatedAt',
    repeat('Contenu QA pour la programmation. ', 4),
    current_setting('test.schedule_body_mac')
  ),
  'saving with the token re-read after the transition succeeds'
);

-- Publisher: schedule one hour ahead.
select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', true
);
select is(
  api.editorial_transition_article(
    current_setting('test.schedule_article_id')::uuid, 'scheduled',
    statement_timestamp() + interval '1 hour'
  ) ->> 'status',
  'scheduled',
  'a publisher can schedule a reviewed edition'
);

reset role;
select is(
  (select visibility::text from app.article_editions
   where id = current_setting('test.schedule_article_id')::uuid),
  'public',
  'scheduling already sets visibility to public (the status is what keeps it hidden)'
);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$select api.news_article_detail('fr', 'qa-programmation-conflit')$$,
  'PGRST', null,
  'a scheduled edition is not publicly readable before its time'
);
select is(
  jsonb_array_length(api.news_feed('fr', 50) -> 'items'),
  0,
  'a scheduled edition is not in the public feed before its time'
);

-- Cancel the schedule: scheduled -> draft -> in_review.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', true
);
select api.editorial_transition_article(current_setting('test.schedule_article_id')::uuid, 'draft');
select api.editorial_transition_article(current_setting('test.schedule_article_id')::uuid, 'in_review');

reset role;
select is(
  (select scheduled_at from app.article_editions
   where id = current_setting('test.schedule_article_id')::uuid),
  null,
  'leaving scheduled clears scheduled_at, so a cancelled schedule cannot fire later'
);

-- Publish explicitly. (Automatic publication of due editions is covered by
-- news_scheduled_publication.test.sql.)
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', true
);
select api.editorial_transition_article(current_setting('test.schedule_article_id')::uuid, 'published');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(
  api.news_article_detail('fr', 'qa-programmation-conflit') ->> 'slug',
  'qa-programmation-conflit',
  'the edition is public once published'
);

-- Linked language editions: the CMS's "Créer l'édition arabe" sends the
-- French edition's story id. The Arabic draft joins that story, and a second
-- edition in a language the story already has is refused.
reset role;
select set_config(
  'test.schedule_story_id',
  (select story_id::text from app.article_editions
   where id = current_setting('test.schedule_article_id')::uuid),
  true
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true
);
select is(
  api.editorial_create_draft(
    'ar', 'qa-barmaja-wa-taarud', 'اختبار الجدولة والتعارض',
    'ملخص اختبار كافٍ لقيد الطول الأدنى.',
    'markdown', repeat('محتوى اختبار الجدولة. ', 4),
    '<p>Contenu QA pour vérifier la programmation et les conflits.</p>',
    1::smallint, 'sanitize-html@2.17.5',
    p_body_html_mac := current_setting('test.schedule_body_mac'),
    p_story_id := current_setting('test.schedule_story_id')::uuid
  ) ->> 'storyId',
  current_setting('test.schedule_story_id'),
  'an Arabic draft created with the French edition''s story id joins that story'
);
select throws_ok(
  format(
    $sql$select api.editorial_create_draft(
      'fr', 'qa-deuxieme-edition-fr', 'Deuxième édition française',
      'Résumé QA suffisant pour la contrainte de longueur.', 'markdown', %L,
      '<p>Contenu QA pour vérifier la programmation et les conflits.</p>',
      1::smallint, 'sanitize-html@2.17.5', p_body_html_mac := %L, p_story_id := %L::uuid)$sql$,
    repeat('Contenu QA pour la programmation. ', 4),
    current_setting('test.schedule_body_mac'),
    current_setting('test.schedule_story_id')
  ),
  '23505',
  'news_slug_or_translation_conflict',
  'a story cannot hold two editions in the same language'
);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select api.news_article_detail('ar', 'qa-barmaja-wa-taarud')$$,
  'PGRST', null,
  'publishing the French edition does not publish the linked Arabic draft'
);

select * from finish();
rollback;
