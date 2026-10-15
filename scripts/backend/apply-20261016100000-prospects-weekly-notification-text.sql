-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261016100000_prospects_weekly_notification_text
-- (audit finding LOC-09, owner decision 2026-10-15; docs/audits/2026-10-15-audit-remediation-phase-d.md,
-- owner action 3): the in-app notification of the weekly under-23 list says "Prospects" (French)
-- and "المواهب" (Arabic) instead of "Pépites".
--   The words live in two rows of app.notification_templates (written by 20260926110100): template
--   pepites_weekly, channel in_app, version 1, fr "Pépites : le Top 10 de la semaine {{week}}" and
--   ar "Pépites: توب 10 للأسبوع {{week}}". No function holds them: notification_email_fanout renders
--   the ACTIVE in_app template of the event's type and the reader's language.
--   It does exactly one thing: RETIRES those two rows (kept, not deleted: app.notifications points
--   at them) and INSERTS version 2 of each, active, with the new title and the same body, variables,
--   limits and flags. No function, table, column, job, setting or privilege changes.
--   Notifications already in readers' bells are NOT rewritten: they keep the title they were created
--   with. Only a weekly list published after this is committed gets the new title. The e-mail text
--   already says Prospects / المواهب (supabase/functions/_shared/notification-email-render.ts); it
--   needs the e-mail functions deployed, not this script.
--
-- WHEN
--   Any time of day; it needs well under a second. It needs 20260926110100 (the weekly e-mail, which
--   created the templates) recorded, and nothing else: it does not depend on the Morocco-time scripts
--   or on any other pending migration. Best before the next weekly edition is published (the
--   edition appears at 20:00 Morocco time; a list published before this commits keeps the old title
--   in the bells of its readers).
--
-- WHAT TO PAUSE (AGENTS.md, "One writer at a time, per database")
--   Nothing needs pausing. The script writes only app.notification_templates (two rows retired,
--   two inserted) and its own history row in supabase_migrations.schema_migrations. Nothing else
--   writes app.notification_templates: no pg_cron job names it, and the script stops if any
--   function in the database writes to it. The one reader that matters is the e-mail fan-out
--   (notification-email-tick, every 5 minutes: notification_email_tick -> notification_email_fanout),
--   which turns a published weekly list into bell notifications; it also runs for other
--   notification types and needs the active template of its type. This is one transaction: a
--   fan-out running at the same moment sees either the old pair or the new pair, never none and
--   never both (a unique index allows one active row per key, channel and language). A call already
--   running finishes on the text it read. Still make sure no other schema change (another apply
--   script, a migration, a deploy) is running right now: a rehearsal that ends in rollback takes
--   locks too. The script compares the fan-out functions, every other template and the cron job list
--   before and after and stops if they moved.
--
-- HOW TO RUN
--   0. Supabase dashboard -> project "BotolaGO Production V2" (the address contains
--      tkewgajrljbwgwedqsxn; the database holds no project name this script could check, so look
--      at the address) -> SQL Editor -> New query.
--      Optional read-only pre-check (should return two rows, version 1, both starting "Pépites"):
--        select language, version, active, title_template from app.notification_templates
--        where template_key = 'pepites_weekly' and channel = 'in_app' order by language, version;
--   1. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one transaction, checked, and
--      then ROLLED BACK. The result row should say "Rehearsal passed".
--   2. Change the line `rollback;` near the bottom to `commit;` and press Run again. The result
--      row should say "Applied".
--      Optional read-only post-check (four rows: v1 inactive and retired, v2 active, titles starting
--      "Prospects" and "المواهب"): the pre-check query above.
--   If any check fails, the script stops with a message saying what, and nothing is saved. Do not
--   edit a check to make it pass: a check firing means the database is not in the state this
--   script expects. Send the message.
--
-- WHAT IT DOES
--   * refuses to run twice (history row, or a version 2 already there), before 20260926110100 is
--     recorded, and where the two active pepites_weekly in_app templates are not exactly the
--     reviewed version 1 (title, body, variables, limits, category, flags, all compared);
--   * refuses to run where any function writes app.notification_templates, a cron job names it, or
--     the e-mail fan-out no longer reads the active in_app template of the event's type;
--   * records the migration file in supabase_migrations.schema_migrations, whole as statements[1]
--     (the form the migration promoter and the other apply scripts use), and runs it from that
--     record once its sha256 matches the repository file;
--   * checks the result without writing anything: version 1 retired with its text untouched,
--     version 2 active with the new titles and the old bodies, one active row per language, the
--     titles render with a week number, every other template, both fan-out functions and the cron job
--     list are byte for byte where they were, and the history row is there. It never calls a
--     fan-out (they write), so it sends and stores no notification.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  found text;
  writers text;
  fanout_ok boolean;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261016100000') then
    raise exception 'stop: migration 20261016100000 is already recorded as applied';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260926110100') then
    raise exception 'stop: migration 20260926110100 (the weekly e-mail, which created the templates) is not recorded';
  end if;
  if to_regclass('app.notification_templates') is null
    or to_regprocedure('app_private.render_notification_template(text,text[],jsonb)') is null
    or to_regprocedure('app_private.notification_email_fanout(timestamp with time zone,text,uuid[],timestamp with time zone,integer)') is null
    or to_regprocedure('app_private.notification_push_fanout(timestamp with time zone,text,uuid[],timestamp with time zone,text,timestamp with time zone,integer)') is null then
    raise exception 'stop: the database is missing the notification template table or functions this update needs';
  end if;

  -- Nothing but version 1 of the two rows exists for this key, and it is exactly the reviewed text.
  select string_agg(
           t.language::text || '/v' || t.version::text || '/' || t.active::text
           || '/' || (t.activated_at is not null)::text || '/' || (t.retired_at is null)::text
           || '/' || t.notification_type::text || '/' || t.category::text
           || '/' || t.title_template || '/' || t.body_template
           || '/' || array_to_string(t.required_variables, ',')
           || '/' || t.max_title_length::text || '/' || t.max_body_length::text
           || '/' || t.is_mandatory::text || '/' || t.bypass_quiet_hours::text,
           ' | ' order by t.language::text, t.version)
    into found
  from app.notification_templates t
  where t.template_key = 'pepites_weekly' and t.channel = 'in_app';
  if found is distinct from
    'ar/v1/true/true/true/pepites_weekly/football/Pépites: توب 10 للأسبوع {{week}}/أفضل عشرة لاعبين شباب في البطولة الاحترافية هذا الأسبوع./week/120/300/false/false'
    || ' | '
    || 'fr/v1/true/true/true/pepites_weekly/football/Pépites : le Top 10 de la semaine {{week}}/Les dix meilleurs jeunes de Botola Pro cette semaine./week/120/300/false/false' then
    raise exception 'stop: the pepites_weekly in_app templates are not exactly the reviewed version 1 (found: %)', found;
  end if;

  -- The claim "nothing needs pausing": no other writer of the table.
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into writers
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
    and p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+app\.notification_templates\y';
  if writers is not null then
    raise exception 'stop: functions write app.notification_templates (they may need pausing, and the claim of this script is wrong): %', writers;
  end if;
  select string_agg(j.jobname, ', ' order by j.jobname) into writers
  from cron.job j where j.command ~* 'notification_templates';
  if writers is not null then
    raise exception 'stop: cron jobs mention the template table (check what they do and pause them): %', writers;
  end if;

  -- The fan-out still renders the active in_app template of the event's type and the reader's language.
  select p.prosrc ~ 'template\.template_key = target\.event_type::text'
         and p.prosrc ~ 'template\.channel = ''in_app'''
         and p.prosrc ~ 'template\.language = audience\.language'
         and p.prosrc ~ 'and template\.active'
         and p.prosrc ~ '''pepites_weekly'''
    into fanout_ok
  from pg_catalog.pg_proc p
  where p.oid = to_regprocedure('app_private.notification_email_fanout(timestamp with time zone,text,uuid[],timestamp with time zone,integer)');
  if fanout_ok is not true then
    raise exception 'stop: app_private.notification_email_fanout does not read the active in_app template of the event''s type -- this update would not change what readers see';
  end if;

  -- Baseline, to compare after: what must not move.
  perform set_config('bg.templates_other_before',
    (select md5(coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), ''))
     from app.notification_templates t
     where not (t.template_key = 'pepites_weekly' and t.channel = 'in_app')), true);
  perform set_config('bg.fanouts_before',
    md5(pg_catalog.pg_get_functiondef(to_regprocedure('app_private.notification_email_fanout(timestamp with time zone,text,uuid[],timestamp with time zone,integer)'))) || '/'
    || md5(pg_catalog.pg_get_functiondef(to_regprocedure('app_private.notification_push_fanout(timestamp with time zone,text,uuid[],timestamp with time zone,text,timestamp with time zone,integer)'))), true);
  perform set_config('bg.cron_jobs_before',
    (select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), ''))
     from cron.job j), true);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20261016100000, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261016100000',
  'prospects_weekly_notification_text',
  array[$bg_20261016100000_file$-- The weekly list's in-app notification says "Prospects" / "المواهب".
--
-- Owner decision, 2026-10-15 (audit finding LOC-09): the under-23 section is
-- named Prospects in French and المواهب in Arabic (it was Pépites in both, and
-- the Latin word stood inside the Arabic line). The screens, the page titles
-- and the e-mail text already use the new names (src/i18n/dictionaries,
-- supabase/functions/_shared/notification-email-render.ts). What was left is
-- the in-app notification that the weekly e-mail fan-out stores for each reader
-- (the bell): its title lives in a template row, written by
-- 20260926110100_pepites_weekly_email, in app.notification_templates:
--
--   pepites_weekly / in_app / fr  v1  "Pépites : le Top 10 de la semaine {{week}}"
--   pepites_weekly / in_app / ar  v1  "Pépites: توب 10 للأسبوع {{week}}"
--
-- No later migration touches those rows, and no function holds the words:
-- app_private.notification_email_fanout (last defined by
-- 20261016090100_morocco_time_deadline_text) picks the ACTIVE in_app template of
-- the event's type and the reader's language and renders its title and body
-- with the week number.
--
-- THE CHANGE. A second edition of each template, the way 20261005135000 gave the
-- goal alert its second edition: version 1 is retired (kept, not deleted --
-- app.notifications.template_id points at it and restricts deletion), version 2
-- is active. Only the title changes:
--
--   fr  "Prospects : le Top 10 de la semaine {{week}}"
--   ar  "المواهب: توب 10 للأسبوع {{week}}"
--
-- The bodies carry no brand name and stay exactly as they were. Key, type,
-- category, channel, variables, length limits, mandatory and quiet-hours flags
-- are the same. No function, table, column, job, setting or privilege changes.
--
-- WHAT IT DOES NOT DO. Notifications already stored keep the text they were
-- created with (their title is copied onto app.notifications when they are
-- written, and the version-1 template row they point at is still there). Only
-- notifications created from now on use the new title.
--
-- Forward-only guard: the statement stops unless the two active templates are
-- exactly the reviewed version-1 rows, so it never replaces text it has not
-- seen (and cannot run twice).

do $guard$
declare
  found text;
begin
  select string_agg(t.language::text || '/v' || t.version::text || '/' || t.title_template || '/' || t.body_template,
                    ' | ' order by t.language::text)
    into found
  from app.notification_templates t
  where t.template_key = 'pepites_weekly' and t.channel = 'in_app' and t.active;

  if found is distinct from
    'ar/v1/Pépites: توب 10 للأسبوع {{week}}/أفضل عشرة لاعبين شباب في البطولة الاحترافية هذا الأسبوع.'
    || ' | '
    || 'fr/v1/Pépites : le Top 10 de la semaine {{week}}/Les dix meilleurs jeunes de Botola Pro cette semaine.' then
    raise exception 'pepites_weekly in_app templates are not the reviewed version 1 (found: %)', found;
  end if;
end
$guard$;

update app.notification_templates set
  active = false,
  retired_at = statement_timestamp()
where template_key = 'pepites_weekly' and channel = 'in_app' and version = 1 and active;

insert into app.notification_templates (
  template_key, notification_type, category, channel, language, version,
  title_template, body_template, required_variables, max_title_length,
  max_body_length, active, activated_at
) values
  ('pepites_weekly', 'pepites_weekly', 'football', 'in_app', 'fr', 2,
    'Prospects : le Top 10 de la semaine {{week}}',
    'Les dix meilleurs jeunes de Botola Pro cette semaine.',
    array['week'], 120, 300, true, statement_timestamp()),
  ('pepites_weekly', 'pepites_weekly', 'football', 'in_app', 'ar', 2,
    'المواهب: توب 10 للأسبوع {{week}}',
    'أفضل عشرة لاعبين شباب في البطولة الاحترافية هذا الأسبوع.',
    array['week'], 120, 300, true, statement_timestamp());
$bg_20261016100000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261016100000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261016100000'
  );
begin
  if encode(sha256(convert_to(part_20261016100000, 'UTF8')), 'hex')
    is distinct from '7b0842a33f4d3b896833a014860df32eae31be6237295a0def7d634978cb7448' then
    raise exception 'stop: 20261016100000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261016100000;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (reads only)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  found text;
  fr_title text;
  ar_title text;
begin
  -- Version 1: retired, text untouched.
  select string_agg(t.language::text || '/' || t.active::text || '/' || (t.retired_at is not null)::text
                    || '/' || t.title_template || '/' || t.body_template,
                    ' | ' order by t.language::text)
    into found
  from app.notification_templates t
  where t.template_key = 'pepites_weekly' and t.channel = 'in_app' and t.version = 1;
  if found is distinct from
    'ar/false/true/Pépites: توب 10 للأسبوع {{week}}/أفضل عشرة لاعبين شباب في البطولة الاحترافية هذا الأسبوع.'
    || ' | '
    || 'fr/false/true/Pépites : le Top 10 de la semaine {{week}}/Les dix meilleurs jeunes de Botola Pro cette semaine.' then
    problems := problems || ('version 1 is not retired with its text untouched: ' || coalesce(found, 'absent'));
  end if;

  -- Version 2: the only active rows, new title, old body, same everything else.
  select string_agg(
           t.language::text || '/v' || t.version::text || '/' || t.active::text
           || '/' || (t.activated_at is not null)::text || '/' || (t.retired_at is null)::text
           || '/' || t.notification_type::text || '/' || t.category::text
           || '/' || t.title_template || '/' || t.body_template
           || '/' || array_to_string(t.required_variables, ',')
           || '/' || t.max_title_length::text || '/' || t.max_body_length::text
           || '/' || t.is_mandatory::text || '/' || t.bypass_quiet_hours::text,
           ' | ' order by t.language::text)
    into found
  from app.notification_templates t
  where t.template_key = 'pepites_weekly' and t.channel = 'in_app' and t.active;
  if found is distinct from
    'ar/v2/true/true/true/pepites_weekly/football/المواهب: توب 10 للأسبوع {{week}}/أفضل عشرة لاعبين شباب في البطولة الاحترافية هذا الأسبوع./week/120/300/false/false'
    || ' | '
    || 'fr/v2/true/true/true/pepites_weekly/football/Prospects : le Top 10 de la semaine {{week}}/Les dix meilleurs jeunes de Botola Pro cette semaine./week/120/300/false/false' then
    problems := problems || ('the active templates are not the new version 2: ' || coalesce(found, 'absent'));
  end if;
  if (select count(*) from app.notification_templates t where t.template_key = 'pepites_weekly') <> 4 then
    problems := problems || 'pepites_weekly has other templates than the four expected (two languages, two versions)'::text;
  end if;

  -- The new titles render with a week number, as the fan-out will render them.
  select t.title_template into fr_title from app.notification_templates t
  where t.template_key = 'pepites_weekly' and t.channel = 'in_app' and t.language = 'fr' and t.active;
  select t.title_template into ar_title from app.notification_templates t
  where t.template_key = 'pepites_weekly' and t.channel = 'in_app' and t.language = 'ar' and t.active;
  if app_private.render_notification_template(fr_title, array['week'], '{"week":"16"}'::jsonb)
       is distinct from 'Prospects : le Top 10 de la semaine 16'
    or app_private.render_notification_template(ar_title, array['week'], '{"week":"16"}'::jsonb)
       is distinct from 'المواهب: توب 10 للأسبوع 16' then
    problems := problems || 'the new titles do not render as expected'::text;
  end if;

  -- Nothing else moved.
  if (select md5(coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), ''))
      from app.notification_templates t
      where not (t.template_key = 'pepites_weekly' and t.channel = 'in_app'))
    is distinct from current_setting('bg.templates_other_before', true) then
    problems := problems || 'another notification template moved'::text;
  end if;
  if (md5(pg_catalog.pg_get_functiondef(to_regprocedure('app_private.notification_email_fanout(timestamp with time zone,text,uuid[],timestamp with time zone,integer)'))) || '/'
      || md5(pg_catalog.pg_get_functiondef(to_regprocedure('app_private.notification_push_fanout(timestamp with time zone,text,uuid[],timestamp with time zone,text,timestamp with time zone,integer)'))))
    is distinct from current_setting('bg.fanouts_before', true) then
    problems := problems || 'a fan-out function changed'::text;
  end if;
  if (select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), ''))
      from cron.job j)
    is distinct from current_setting('bg.cron_jobs_before', true) then
    problems := problems || 'the cron job list moved'::text;
  end if;

  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261016100000') then
    problems := problems || 'history row missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261016100000')
    then 'Applied. The weekly list''s bell notification now says Prospects (French) and المواهب (Arabic) for notifications created from now on; the ones already sent are unchanged.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
