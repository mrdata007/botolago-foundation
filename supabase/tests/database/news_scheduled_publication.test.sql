-- News activation: scheduled publication (20260922180100).
--
-- The clock cannot be moved inside a test, so "time has passed" is simulated
-- by moving scheduled_at into the past directly as the table owner, exactly
-- what a waiting edition looks like once its minute arrives. The publishing
-- job is then invoked the way pg_cron invokes it.
begin;

select extensions.no_plan();

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('96000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sched-editor@example.test', 'hash', statement_timestamp(),
   '{}', '{"username":"sched_editor"}', statement_timestamp(), statement_timestamp()),
  ('96000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sched-publisher@example.test', 'hash', statement_timestamp(),
   '{}', '{"username":"sched_publisher"}', statement_timestamp(), statement_timestamp());

insert into app_private.staff_principals (auth_user_id)
values ('96000000-0000-4000-8000-000000000001'), ('96000000-0000-4000-8000-000000000002');

insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values
  ('96100000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000001',
   'Primary TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp()),
  ('96100000-0000-4000-8000-000000000002', '96000000-0000-4000-8000-000000000002',
   'Primary TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp());

insert into app_private.staff_role_assignments (staff_principal_id, role_id, grant_reason)
select principal.id, role.id, 'News scheduled publication pgTAP fixture.'
from app_private.staff_principals principal
join app_private.admin_roles role
  on (principal.auth_user_id = '96000000-0000-4000-8000-000000000001' and role.name = 'editor')
  or (principal.auth_user_id = '96000000-0000-4000-8000-000000000002' and role.name = 'publisher');

select set_config(
  'test.mac',
  encode(extensions.hmac(
    convert_to('<p>Contenu QA de programmation, rédigé pour les tests.</p>', 'utf8'),
    (select secret from app_private.news_editorial_write_keys where id = true), 'sha256'), 'hex'),
  true
);

-- Creates a draft as the editor and moves it to review; returns the id.
create function pg_temp.reviewed_draft(p_language text, p_slug text, p_story uuid default null)
returns uuid language plpgsql as $$
declare created uuid;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"96000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);
  created := (api.editorial_create_draft(
    p_language, p_slug, 'Article QA programmé ' || p_slug,
    'Résumé QA suffisant pour la contrainte de longueur.', 'markdown',
    repeat('Contenu QA de programmation. ', 4),
    '<p>Contenu QA de programmation, rédigé pour les tests.</p>', 1::smallint,
    'sanitize-html@2.17.5', p_body_html_mac := current_setting('test.mac'),
    p_story_id := p_story) ->> 'articleId')::uuid;
  perform api.editorial_transition_article(created, 'in_review');
  return created;
end $$;

create function pg_temp.as_publisher() returns void language sql as $$
  select set_config('request.jwt.claims',
    '{"sub":"96000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', true)
$$;

create function pg_temp.is_public(p_id uuid) returns boolean language sql as $$
  select app_private.news_is_public(e) from app.article_editions e where e.id = p_id
$$;

create function pg_temp.status(p_id uuid) returns text language sql as $$
  select status::text from app.article_editions where id = p_id
$$;

set local role authenticated;
select set_config('test.future', pg_temp.reviewed_draft('fr', 'qa-sched-future')::text, true);
select set_config('test.due', pg_temp.reviewed_draft('fr', 'qa-sched-due')::text, true);
select set_config('test.overdue', pg_temp.reviewed_draft('fr', 'qa-sched-overdue')::text, true);
select set_config('test.published', pg_temp.reviewed_draft('fr', 'qa-sched-already')::text, true);
select set_config('test.cancelled', pg_temp.reviewed_draft('fr', 'qa-sched-cancelled')::text, true);
select set_config('test.withdrawn', pg_temp.reviewed_draft('fr', 'qa-sched-withdrawn')::text, true);
select set_config('test.fr', pg_temp.reviewed_draft('fr', 'qa-sched-paire')::text, true);
reset role;
select set_config('test.story',
  (select story_id::text from app.article_editions where id = current_setting('test.fr')::uuid), true);
set local role authenticated;
select set_config('test.ar',
  pg_temp.reviewed_draft('ar', 'qa-sched-paire-ar', current_setting('test.story')::uuid)::text, true);

select pg_temp.as_publisher();

-- The server now refuses a schedule that is not in the future.
select throws_ok(
  format($$select api.editorial_transition_article(%L::uuid, 'scheduled', statement_timestamp() - interval '1 minute')$$,
    current_setting('test.due')),
  '22023', 'news_schedule_must_be_future',
  'a schedule in the past is refused'
);
select throws_ok(
  format($$select api.editorial_transition_article(%L::uuid, 'scheduled')$$, current_setting('test.due')),
  '22023', 'news_schedule_must_be_future',
  'a schedule without a date is refused'
);

-- Schedule everything one hour ahead (the transition requires a future time).
select api.editorial_transition_article(current_setting(name)::uuid, 'scheduled',
  statement_timestamp() + interval '1 hour')
from unnest(array['test.future', 'test.due', 'test.overdue', 'test.cancelled', 'test.withdrawn', 'test.fr'])
  as name;
select api.editorial_transition_article(current_setting('test.published')::uuid, 'published');

-- Rescheduling no longer needs the draft -> review round trip.
select is(
  api.editorial_transition_article(current_setting('test.future')::uuid, 'scheduled',
    statement_timestamp() + interval '2 hours') ->> 'status',
  'scheduled',
  'a scheduled edition can be rescheduled directly'
);

-- Cancel one (back to draft) and withdraw one (unpublished) before their time.
select api.editorial_transition_article(current_setting('test.cancelled')::uuid, 'draft');
select api.editorial_transition_article(current_setting('test.withdrawn')::uuid, 'unpublished');

reset role;
-- Time passes: 'due' reaches its minute, 'overdue' was missed for two hours,
-- the French pair edition becomes due. The cancelled/withdrawn rows get a
-- past scheduled_at forced on them too, which the job must still ignore.
update app.article_editions set scheduled_at = statement_timestamp() - interval '1 second'
where id = current_setting('test.due')::uuid;
update app.article_editions set scheduled_at = statement_timestamp() - interval '2 hours'
where id = current_setting('test.overdue')::uuid;
update app.article_editions set scheduled_at = statement_timestamp() - interval '1 second'
where id = current_setting('test.fr')::uuid;
update app.article_editions set scheduled_at = statement_timestamp() - interval '1 second'
where id in (current_setting('test.cancelled')::uuid, current_setting('test.withdrawn')::uuid);

select set_config('test.published_before', (
  select to_jsonb(e) - 'search_vector' from app.article_editions e
  where id = current_setting('test.published')::uuid)::text, true);
select set_config('test.revisions_before', (select count(*) from app.article_revisions)::text, true);

-- Before the job runs, nothing due is public.
select ok(not pg_temp.is_public(current_setting('test.due')::uuid),
  'a due edition is still private until the job runs');

select set_config('test.run1', app_private.news_publish_due_editions()::text, true);

-- 1. Future stays private.
select is(pg_temp.status(current_setting('test.future')::uuid), 'scheduled',
  '1. a future scheduled edition is left scheduled');
select ok(not pg_temp.is_public(current_setting('test.future')::uuid),
  '1. a future scheduled edition stays private');

-- 2. Due publishes, with published_at = the scheduled time.
select is(pg_temp.status(current_setting('test.due')::uuid), 'published', '2. a due edition is published');
select ok(pg_temp.is_public(current_setting('test.due')::uuid), '2. a due edition is public');
select ok(
  (select published_at <= statement_timestamp() and published_at > statement_timestamp() - interval '1 minute'
   and scheduled_at is null and unpublished_at is null
   from app.article_editions where id = current_setting('test.due')::uuid),
  '2. published_at is the scheduled minute; scheduled_at is cleared'
);

-- 3. Overdue publishes, dated when it was meant to go out.
select is(pg_temp.status(current_setting('test.overdue')::uuid), 'published', '3. an overdue edition is published');
select ok(
  (select published_at < statement_timestamp() - interval '119 minutes'
   from app.article_editions where id = current_setting('test.overdue')::uuid),
  '3. an overdue edition keeps its intended publication time'
);

-- 4. Already published: untouched.
select is(
  (select to_jsonb(e) - 'search_vector' from app.article_editions e
   where id = current_setting('test.published')::uuid)::text,
  current_setting('test.published_before'),
  '4. an already-published edition is not modified at all'
);

-- 5. Cancelled / withdrawn schedules do not fire.
select is(pg_temp.status(current_setting('test.cancelled')::uuid), 'draft',
  '5. a schedule cancelled back to draft does not publish');
select is(pg_temp.status(current_setting('test.withdrawn')::uuid), 'unpublished',
  '5. a schedule withdrawn to unpublished does not publish');
select is(
  (select count(*)::int from app_private.editorial_audit_events
   where event_type = 'article_scheduled_publication'
     and article_edition_id in (current_setting('test.cancelled')::uuid, current_setting('test.withdrawn')::uuid)),
  0,
  '5. even with a stale past scheduled_at left on them, only status scheduled is ever published'
);

-- 7. French/Arabic independence.
select is(pg_temp.status(current_setting('test.fr')::uuid), 'published', '7. the due French edition publishes');
select is(pg_temp.status(current_setting('test.ar')::uuid), 'in_review',
  '7. its Arabic edition, not scheduled, is untouched');
select ok(not pg_temp.is_public(current_setting('test.ar')::uuid), '7. the Arabic edition stays private');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(
  api.news_article_detail('fr', 'qa-sched-paire') -> 'translations',
  '[]'::jsonb,
  '7. the public French article advertises no Arabic counterpart while it is private'
);
reset role;

-- 6. Idempotency.
select is((current_setting('test.run1')::jsonb ->> 'due')::int, 3, '6. the first run found three due editions');
select is(jsonb_array_length(current_setting('test.run1')::jsonb -> 'published'), 3, '6. and published three');
select set_config('test.run2', app_private.news_publish_due_editions()::text, true);
select is(current_setting('test.run2')::jsonb ->> 'outcome', 'idle', '6. a second run finds nothing to do');
select is(
  (select count(*)::int from app.article_revisions) - current_setting('test.revisions_before')::int,
  3,
  '6. exactly one revision snapshot per publication across both runs'
);
select is(
  (select count(*)::int from app_private.editorial_audit_events
   where event_type = 'article_scheduled_publication'
     and article_edition_id in (current_setting('test.due')::uuid, current_setting('test.overdue')::uuid,
       current_setting('test.fr')::uuid)),
  3,
  '6. exactly one audit event per publication across both runs'
);
select is(
  (select count(*)::int from app_private.news_schedule_runs
   where published_edition_ids && array[current_setting('test.due')::uuid]),
  1,
  '6. the run log records the publishing run once; the idle run adds no row'
);
select is(
  (select last_outcome from app_private.news_schedule_heartbeat),
  'idle',
  '6. the heartbeat records the latest (idle) run'
);

-- 7 (continued). Both editions scheduled: both publish and point at each other.
set local role authenticated;
select pg_temp.as_publisher();
select api.editorial_transition_article(current_setting('test.ar')::uuid, 'scheduled',
  statement_timestamp() + interval '1 hour');
reset role;
update app.article_editions set scheduled_at = statement_timestamp() - interval '1 second'
where id = current_setting('test.ar')::uuid;
select app_private.news_publish_due_editions();
select is(pg_temp.status(current_setting('test.ar')::uuid), 'published',
  '7. once scheduled and due, the Arabic edition publishes too');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(
  api.news_article_detail('fr', 'qa-sched-paire') -> 'translations' -> 0 ->> 'language',
  'ar',
  '7. the French article now lists its public Arabic counterpart'
);
select is(
  api.news_article_detail('ar', 'qa-sched-paire-ar') -> 'translations' -> 0 ->> 'id',
  current_setting('test.fr'),
  '7. and the Arabic article lists the French one'
);
reset role;

-- Failures are recorded, not silent, and do not block other rows.
insert into app.stories (id, origin, original_language) values
  ('96200000-0000-4000-8000-000000000001', 'provider', 'fr');
insert into app.article_editions (
  id, story_id, language, slug, title, summary, body_format, body_source, body_html,
  status, visibility, scheduled_at, reading_time_minutes, sanitizer_version
) values (
  '96300000-0000-4000-8000-000000000001', '96200000-0000-4000-8000-000000000001', 'fr',
  'qa-sched-import-force', 'Import forcé en programmé', 'Résumé QA suffisant pour la contrainte.',
  'markdown', repeat('Texte importé. ', 4), '<p>Texte importé suffisamment long.</p>',
  'scheduled', 'public', statement_timestamp() - interval '1 minute', 1, 'elbotola-link-v1'
);
select set_config('test.run3', app_private.news_publish_due_editions()::text, true);
select is(current_setting('test.run3')::jsonb ->> 'outcome', 'failed',
  'a scheduled edition that cannot be published makes the run fail visibly');
select is(pg_temp.status('96300000-0000-4000-8000-000000000001'), 'scheduled',
  'the failing edition is left as it was, to be retried');
select ok(not pg_temp.is_public('96300000-0000-4000-8000-000000000001'),
  'an imported story forced into scheduled is never published by the job');
select matches(
  (select last_error from app_private.news_schedule_runs order by id desc limit 1),
  'news_imported_story_requires_conversion',
  'the run log carries the reason'
);
set local role authenticated;
select pg_temp.as_publisher();
select is(
  api.editorial_schedule_health() -> 'lastFailure' ->> 'failedCount',
  '1',
  'editorial_schedule_health reports the last failure to the CMS'
);
select is((api.editorial_schedule_health() ->> 'jobActive')::boolean, true,
  'editorial_schedule_health reports the pg_cron job as active');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000ff","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$select api.editorial_schedule_health()$$, '42501', 'news_editorial_forbidden',
  'a non-staff account cannot read the scheduler health');
reset role;

select is(
  (select count(*)::int from cron.job
   where jobname = 'news-publish-due-editions' and schedule = '* * * * *' and active),
  1,
  'the publishing job is registered to run every minute'
);
select is(
  (select count(*)::int from cron.job where jobname = 'news-publish-due-editions-history-prune' and active),
  1,
  'the job history is pruned daily'
);
select ok(
  not has_function_privilege('authenticated', 'app_private.news_publish_due_editions(integer)', 'execute')
  and not has_function_privilege('anon', 'app_private.news_publish_due_editions(integer)', 'execute')
  and not has_function_privilege('service_role', 'app_private.news_publish_due_editions(integer)', 'execute'),
  'no API role can invoke the publishing job directly'
);

select * from finish();
rollback;
