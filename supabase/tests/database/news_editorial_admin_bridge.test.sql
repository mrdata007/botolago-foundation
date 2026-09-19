-- BG-0012: has_editorial_role now resolves through the Admin staff role
-- model (staff_principals + staff_role_assignments + admin_role_permissions)
-- instead of the standalone app_private.editorial_memberships table, and the
-- new editorial_list_stories / editorial_list_revisions / editorial_register_media
-- RPCs are gated by that same bridge.
begin;

select extensions.no_plan();

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '91000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'bridge-editor@example.test', 'hash',
    statement_timestamp(), '{}', '{"username":"bridge_editor"}',
    statement_timestamp(), statement_timestamp()
  ),
  (
    '91000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'bridge-publisher@example.test', 'hash',
    statement_timestamp(), '{}', '{"username":"bridge_publisher"}',
    statement_timestamp(), statement_timestamp()
  ),
  (
    '91000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'bridge-noone@example.test', 'hash',
    statement_timestamp(), '{}', '{"username":"bridge_noone"}',
    statement_timestamp(), statement_timestamp()
  );

insert into app_private.staff_principals (auth_user_id)
values
  ('91000000-0000-4000-8000-000000000001'),
  ('91000000-0000-4000-8000-000000000002');

-- BG-0012: has_editorial_role now also requires a verified MFA factor and
-- an aal2 session assertion (every editorial.* permission is seeded
-- requires_mfa = true) -- mirror the pattern established in
-- admin_authorization.test.sql. bridge_noone (003) is intentionally left
-- without one: it must fail on the missing Admin role regardless.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values
  (
    '91100000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001',
    'Primary TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp()
  ),
  (
    '91100000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002',
    'Primary TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp()
  );

insert into app_private.staff_role_assignments (staff_principal_id, role_id, grant_reason)
select principal.id, role.id, 'BG-0012 editorial bridge pgTAP fixture.'
from app_private.staff_principals principal
join app_private.admin_roles role on role.name = 'editor'
where principal.auth_user_id = '91000000-0000-4000-8000-000000000001';

insert into app_private.staff_role_assignments (staff_principal_id, role_id, grant_reason)
select principal.id, role.id, 'BG-0012 editorial bridge pgTAP fixture.'
from app_private.staff_principals principal
join app_private.admin_roles role on role.name = 'publisher'
where principal.auth_user_id = '91000000-0000-4000-8000-000000000002';

-- No Admin role at all: legacy editorial_memberships must no longer matter.
insert into app_private.editorial_memberships (user_id, role, active)
values ('91000000-0000-4000-8000-000000000003', 'admin', true);

-- The write RPC now requires proof (an HMAC over body_html) that content was
-- sanitized server-side by the news-editorial-write Edge Function -- see
-- app_private.verify_editorial_content_mac. Only a superuser-ish test role
-- can read app_private.news_editorial_write_keys directly; compute it here,
-- before dropping to `authenticated`, for the fixed body_html literal this
-- file's draft-creation calls share.
select set_config(
  'test.bridge_body_mac',
  encode(
    extensions.hmac(
      convert_to('<p>Contenu de brouillon suffisant pour le test du pont.</p>', 'utf8'),
      (select secret from app_private.news_editorial_write_keys where id = true),
      'sha256'
    ),
    'hex'
  ),
  true
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true
);
select extensions.lives_ok(
  $$select api.editorial_create_draft(
    'fr', 'bridge-editor-draft', 'Article de test du pont éditorial',
    'Résumé suffisant pour satisfaire la contrainte de longueur minimale.',
    'markdown', repeat('Contenu de brouillon suffisant. ', 4),
    '<p>Contenu de brouillon suffisant pour le test du pont.</p>',
    2::smallint, 'sanitize-html@2.17.5',
    p_body_html_mac := current_setting('test.bridge_body_mac')
  )$$,
  'an Admin-role editor can create an editorial draft through the bridged has_editorial_role'
);
select set_config(
  'test.bridge_article_id',
  (
    api.editorial_create_draft(
      'fr', 'bridge-editor-draft-2', 'Deuxième article de test du pont',
      'Résumé suffisant pour satisfaire la contrainte de longueur minimale.',
      'markdown', repeat('Contenu de brouillon suffisant. ', 4),
      '<p>Contenu de brouillon suffisant pour le test du pont.</p>',
      2::smallint, 'sanitize-html@2.17.5',
      p_body_html_mac := current_setting('test.bridge_body_mac')
    ) ->> 'articleId'
  ),
  true
);
select extensions.throws_ok(
  $$select api.editorial_transition_article(
    current_setting('test.bridge_article_id')::uuid, 'published'
  )$$,
  '42501', null,
  'a plain Admin-role editor cannot publish (requires the publisher-tier permission)'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000003","role":"authenticated"}', true
);
select extensions.throws_ok(
  $$select api.editorial_create_draft(
    'fr', 'bridge-forbidden-draft', 'Article refusé par le pont éditorial',
    'Résumé suffisant pour satisfaire la contrainte de longueur minimale.',
    'markdown', repeat('Contenu de brouillon suffisant. ', 4),
    '<p>Contenu de brouillon suffisant pour le test du pont.</p>',
    2::smallint, 'sanitize-html@2.17.5',
    p_body_html_mac := 'irrelevant-fails-on-role-check-first'
  )$$,
  '42501', null,
  'a legacy editorial_memberships row with no Admin staff role grants nothing'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', true
);
select extensions.lives_ok(
  $$select api.editorial_transition_article(
    current_setting('test.bridge_article_id')::uuid, 'in_review'
  )$$,
  'setup: move the fixture article to in_review before publishing'
);
select extensions.lives_ok(
  $$select api.editorial_transition_article(
    current_setting('test.bridge_article_id')::uuid, 'published'
  )$$,
  'an Admin-role publisher can publish through the bridged has_editorial_role'
);
reset role;

-- editorial_list_stories / editorial_list_revisions / editorial_register_media
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true
);
select extensions.ok(
  (
    select bool_or(item ->> 'id' = current_setting('test.bridge_article_id'))
    from jsonb_array_elements(
      api.editorial_list_stories(p_language := 'fr', p_status := 'published')
      -> 'items'
    ) item
  ),
  'editorial_list_stories surfaces the freshly published fixture article for an editor'
);
select extensions.throws_ok(
  $$select api.editorial_list_stories(p_after_updated_at := statement_timestamp())$$,
  '22023', 'news_invalid_cursor',
  'editorial_list_stories requires both cursor parameters together'
);

select extensions.ok(
  jsonb_array_length(
    api.editorial_list_revisions(current_setting('test.bridge_article_id')::uuid)
  ) >= 1,
  'editorial_list_revisions returns at least the in_review -> published transition snapshot'
);
select extensions.throws_ok(
  $$select api.editorial_list_revisions(gen_random_uuid())$$,
  'P0002', 'news_article_not_found',
  'editorial_list_revisions rejects an unknown article edition id'
);

select extensions.throws_ok(
  $$select api.editorial_register_media(
    'invalid/path.jpg', 'image/jpeg', 800, 600, 'Texte alternatif valide'
  )$$,
  '22023', 'news_invalid_media_storage_path',
  'editorial_register_media rejects a storage path outside the football/news prefix'
);
select extensions.throws_ok(
  $$select api.editorial_register_media(
    'news/hero.jpg', 'image/gif', 800, 600, 'Texte alternatif valide'
  )$$,
  '22023', 'news_invalid_media_mime_type',
  'editorial_register_media rejects a disallowed mime type'
);
select extensions.throws_ok(
  $$select api.editorial_register_media(
    'news/hero.jpg', 'image/jpeg', 0, 600, 'Texte alternatif valide'
  )$$,
  '22023', 'news_invalid_media_dimensions',
  'editorial_register_media rejects an out-of-bounds width'
);
select extensions.throws_ok(
  $$select api.editorial_register_media(
    'news/hero.jpg', 'image/jpeg', 800, 600, '   '
  )$$,
  '22023', 'news_invalid_media_alt_text',
  'editorial_register_media rejects blank alt text'
);
select extensions.throws_ok(
  $$select api.editorial_register_media(
    'news/hero.jpg', 'image/jpeg', 800, 600, 'Texte alternatif valide',
    p_license_url := 'http://insecure.example.test/license'
  )$$,
  '22023', 'news_invalid_media_license_url',
  'editorial_register_media rejects a non-https license url'
);
select extensions.is(
  api.editorial_get_article(current_setting('test.bridge_article_id')::uuid) ->> 'slug',
  'bridge-editor-draft-2',
  'editorial_get_article returns the full editable content of an edition'
);
select extensions.throws_ok(
  $$select api.editorial_get_article(gen_random_uuid())$$,
  'P0002', 'news_article_not_found',
  'editorial_get_article rejects an unknown article edition id'
);

select extensions.ok(
  (
    api.editorial_register_media(
      'news/hero-bridge-test.jpg', 'image/jpeg', 1200, 630, 'Texte alternatif valide',
      p_credit := 'BotolaGO'
    ) ->> 'mediaAssetId'
  )::uuid is not null,
  'editorial_register_media accepts a valid payload and returns a media asset id'
);
reset role;

select * from extensions.finish();
rollback;
