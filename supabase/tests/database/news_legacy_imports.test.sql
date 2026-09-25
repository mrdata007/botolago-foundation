-- News activation: imported third-party stories are legacy records
-- (20260922180000). A stub must not become public by any ordinary path.
begin;

select extensions.no_plan();

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  email, 'hash', statement_timestamp(), '{}', jsonb_build_object('username', username),
  statement_timestamp(), statement_timestamp()
from (values
  ('97000000-0000-4000-8000-000000000001'::uuid, 'legacy-editor@example.test', 'legacy_editor'),
  ('97000000-0000-4000-8000-000000000002'::uuid, 'legacy-publisher@example.test', 'legacy_publisher'),
  ('97000000-0000-4000-8000-000000000003'::uuid, 'legacy-admin@example.test', 'legacy_admin')
) fixture(id, email, username);

insert into app_private.staff_principals (auth_user_id)
select id from auth.users where email like 'legacy-%@example.test';

insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
select gen_random_uuid(), id, 'Primary TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp()
from auth.users where email like 'legacy-%@example.test';

insert into app_private.staff_role_assignments (staff_principal_id, role_id, grant_reason)
select principal.id, role.id, 'News legacy imports pgTAP fixture.'
from app_private.staff_principals principal
join auth.users account on account.id = principal.auth_user_id
join app_private.admin_roles role on role.name = case account.email
  when 'legacy-editor@example.test' then 'editor'
  when 'legacy-publisher@example.test' then 'publisher'
  else 'content_admin' end
where account.email like 'legacy-%@example.test';

create function pg_temp.as_user(p_id text) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated","aal":"aal2"}', p_id), true)
$$;

-- A stood-down stub exactly as production holds them: provider story,
-- unpublished/private edition with an original publication time.
insert into app.stories (id, origin, original_language)
values ('97200000-0000-4000-8000-000000000001', 'provider', 'fr');
insert into app.article_editions (
  id, story_id, language, slug, title, summary, body_format, body_source, body_html,
  status, visibility, published_at, unpublished_at, reading_time_minutes, sanitizer_version
) values (
  '97300000-0000-4000-8000-000000000001', '97200000-0000-4000-8000-000000000001', 'fr',
  'qa-legacy-stub', 'Ancien lien importé', 'Résumé importé suffisamment long.',
  'rich_text', null,
  '<p>Extrait importé.</p><p><a href="https://publisher.example/a">Lire l’article original</a></p>',
  'unpublished', 'private', statement_timestamp() - interval '10 days',
  statement_timestamp() - interval '1 day', 1, 'gnews-excerpt-v1'
);

-- Workflow guard.
set local role authenticated;
select pg_temp.as_user('97000000-0000-4000-8000-000000000002');
select throws_ok(
  $$select api.editorial_transition_article('97300000-0000-4000-8000-000000000001', 'published')$$,
  '22023', 'news_imported_story_requires_conversion',
  'one-click republish of an imported stub is refused'
);
select throws_ok(
  $$select api.editorial_transition_article('97300000-0000-4000-8000-000000000001', 'draft')$$,
  '22023', 'news_imported_story_requires_conversion',
  'an imported stub cannot be moved back into the editorial workflow'
);
select is(
  api.editorial_transition_article('97300000-0000-4000-8000-000000000001', 'archived') ->> 'status',
  'archived',
  'an imported stub can still be archived'
);
select throws_ok(
  $$select api.editorial_transition_article('97300000-0000-4000-8000-000000000001', 'draft')$$,
  '22023', 'news_imported_story_requires_conversion',
  'archived -> draft is refused for an imported stub'
);

-- The CMS keeps it, separately.
select pg_temp.as_user('97000000-0000-4000-8000-000000000001');
select ok(
  not exists (
    select 1 from jsonb_array_elements(api.editorial_list_stories() -> 'items') item
    where item ->> 'id' = '97300000-0000-4000-8000-000000000001'
  ),
  'the default CMS list does not show imported stubs among editorial work'
);
select is(
  (select item ->> 'imported' from jsonb_array_elements(
     api.editorial_list_stories(p_query := 'Ancien lien', p_scope := 'imported') -> 'items') item
   where item ->> 'id' = '97300000-0000-4000-8000-000000000001'),
  'true',
  'the imported scope finds it by title, flagged as imported'
);
select throws_ok(
  $$select api.editorial_list_stories(p_scope := 'everything')$$,
  '22023', 'news_invalid_list_scope',
  'an unknown list scope is refused'
);
select is(
  api.editorial_get_article('97300000-0000-4000-8000-000000000001') ->> 'imported',
  'true',
  'the editor is told the edition is an unconverted import'
);

-- Defence in depth: even a direct status change cannot make it public.
reset role;
update app.article_editions set status = 'published', visibility = 'public', unpublished_at = null
where id = '97300000-0000-4000-8000-000000000001';
-- The sitemap is served from a snapshot pg_cron refreshes every minute
-- (20260925180050); refresh it, as the job would, so the check below looks at
-- what the next refresh lists rather than at an older snapshot.
do $$ begin perform app_private.news_sitemap_refresh(true); end $$;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select api.news_article_detail('fr', 'qa-legacy-stub')$$,
  'PGRST', null,
  'a stub forced to published is still not readable'
);
select ok(
  not exists (select 1 from jsonb_array_elements(api.news_feed('fr', 50) -> 'items') item
              where item ->> 'id' = '97300000-0000-4000-8000-000000000001'),
  'a stub forced to published is not in the feed'
);
select ok(
  not exists (select 1 from jsonb_array_elements(api.news_sitemap_entries()) item
              where item ->> 'id' = '97300000-0000-4000-8000-000000000001'),
  'a stub forced to published is not in the sitemap'
);
select ok(
  not exists (select 1 from jsonb_array_elements(api.news_home_modules('fr') -> 'latest') item
              where item ->> 'id' = '97300000-0000-4000-8000-000000000001'),
  'a stub forced to published is not on the home rail'
);
reset role;
update app.article_editions set status = 'archived', visibility = 'private',
  unpublished_at = statement_timestamp()
where id = '97300000-0000-4000-8000-000000000001';

-- Explicit conversion: editorial admins only, with a reason, publishes nothing.
set local role authenticated;
select pg_temp.as_user('97000000-0000-4000-8000-000000000002');
select throws_ok(
  $$select api.editorial_convert_imported_story('97200000-0000-4000-8000-000000000001', 'Licence obtenue auprès de la source.')$$,
  '42501', 'news_editorial_forbidden',
  'a publisher cannot convert an import'
);
select pg_temp.as_user('97000000-0000-4000-8000-000000000001');
select throws_ok(
  $$select api.editorial_convert_imported_story('97200000-0000-4000-8000-000000000001', 'Licence obtenue auprès de la source.')$$,
  '42501', 'news_editorial_forbidden',
  'an editor cannot convert an import'
);
select pg_temp.as_user('97000000-0000-4000-8000-000000000003');
select throws_ok(
  $$select api.editorial_convert_imported_story('97200000-0000-4000-8000-000000000001', 'ok')$$,
  '22023', 'news_conversion_reason_required',
  'a conversion needs a real reason'
);
select is(
  api.editorial_convert_imported_story('97200000-0000-4000-8000-000000000001',
    'Licence écrite obtenue auprès de la source, dossier LIC-001.') ->> 'changed',
  'true',
  'an editorial admin converts it with a reason'
);
select is(
  api.editorial_convert_imported_story('97200000-0000-4000-8000-000000000001',
    'Licence écrite obtenue auprès de la source, dossier LIC-001.') ->> 'changed',
  'false',
  'converting twice changes nothing'
);
reset role;
select ok(
  not app_private.news_is_public(e) and e.status = 'archived',
  'conversion itself publishes nothing'
) from app.article_editions e where e.id = '97300000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from app_private.editorial_audit_events
   where event_type = 'imported_story_converted' and story_id = '97200000-0000-4000-8000-000000000001'),
  1,
  'the conversion is audited once'
);

-- After conversion it follows the ordinary review path.
set local role authenticated;
select pg_temp.as_user('97000000-0000-4000-8000-000000000002');
select api.editorial_transition_article('97300000-0000-4000-8000-000000000001', 'draft');
select api.editorial_transition_article('97300000-0000-4000-8000-000000000001', 'in_review');
select api.editorial_transition_article('97300000-0000-4000-8000-000000000001', 'published');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(
  api.news_article_detail('fr', 'qa-legacy-stub') ->> 'id',
  '97300000-0000-4000-8000-000000000001',
  'a converted, reviewed and published story is public'
);
reset role;

insert into app.stories (id, origin, original_language) values
  ('97200000-0000-4000-8000-000000000002', 'manual', 'fr');
set local role authenticated;
select pg_temp.as_user('97000000-0000-4000-8000-000000000003');
select throws_ok(
  $$select api.editorial_convert_imported_story('97200000-0000-4000-8000-000000000002', 'Rien à convertir ici, histoire manuelle.')$$,
  '22023', 'news_story_not_imported',
  'a manual story cannot be "converted"'
);
reset role;

-- origin alone is not the marker: a 'provider'-origin story written by
-- BotolaGO's own News engine (sanitize-html output, no link-stub version) is
-- ordinary content and stays publishable.
insert into app.stories (id, origin, original_language) values
  ('97200000-0000-4000-8000-000000000003', 'provider', 'fr');
insert into app.article_editions (
  id, story_id, language, slug, title, summary, body_format, body_source, body_html,
  status, visibility, published_at, reading_time_minutes, sanitizer_version
) values (
  '97300000-0000-4000-8000-000000000003', '97200000-0000-4000-8000-000000000003', 'fr',
  'qa-engine-like', 'Article rédigé par BotolaGO', 'Résumé suffisamment long pour le test.',
  'rich_text', null, '<p>Texte original BotolaGO suffisamment long.</p>',
  'published', 'public', statement_timestamp() - interval '1 minute', 1, 'sanitize-html@2.17.5'
);
select ok(
  app_private.news_is_public(e) and not app_private.news_story_is_legacy_import(e.story_id),
  'a provider-origin story that is not a link stub is not treated as a legacy import'
) from app.article_editions e where e.id = '97300000-0000-4000-8000-000000000003';

select ok(
  has_function_privilege('authenticated', 'api.editorial_convert_imported_story(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'api.editorial_convert_imported_story(uuid, text)', 'execute'),
  'the conversion RPC is callable only by signed-in accounts (and then role-gated)'
);

select * from finish();
rollback;
