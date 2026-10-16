-- The weekly list's in-app notification says "Prospects" / "المواهب".
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
