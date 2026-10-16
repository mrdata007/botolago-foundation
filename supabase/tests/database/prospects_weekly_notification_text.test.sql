begin;

select extensions.no_plan();

-- The weekly list's in-app notification text (20261016100000): the section is
-- named Prospects (French) and المواهب (Arabic). The first edition of the
-- template (20260926110100) is retired, not deleted, because notifications
-- already stored point at it.

select extensions.is(
  (select string_agg(language::text || '/v' || version::text || '/' || title_template, ' | ' order by language::text)
   from app.notification_templates
   where template_key = 'pepites_weekly' and channel = 'in_app' and active),
  'ar/v2/المواهب: توب 10 للأسبوع {{week}} | fr/v2/Prospects : le Top 10 de la semaine {{week}}',
  'the active in-app text of the weekly list says Prospects and المواهب'
);
select extensions.is(
  (select count(*)::integer from app.notification_templates
   where template_key = 'pepites_weekly' and channel = 'in_app' and version = 1
     and not active and retired_at is not null
     and title_template like 'Pépites%'),
  2,
  'the first edition, which said Pépites, is retired and still there'
);
select extensions.is(
  (select count(*)::integer from app.notification_templates
   where template_key = 'pepites_weekly' and channel = 'in_app' and active
     and (title_template ~* 'p[ée]pites?' or body_template ~* 'p[ée]pites?')),
  0,
  'no active text of the weekly list names the old section'
);
select extensions.is(
  (select string_agg(language::text || '/' || body_template || '/' || array_to_string(required_variables, ',')
                     || '/' || max_title_length::text || '/' || max_body_length::text
                     || '/' || category::text || '/' || notification_type::text
                     || '/' || is_mandatory::text || '/' || bypass_quiet_hours::text,
                     ' | ' order by language::text)
   from app.notification_templates
   where template_key = 'pepites_weekly' and channel = 'in_app' and active),
  'ar/أفضل عشرة لاعبين شباب في البطولة الاحترافية هذا الأسبوع./week/120/300/football/pepites_weekly/false/false'
  || ' | '
  || 'fr/Les dix meilleurs jeunes de Botola Pro cette semaine./week/120/300/football/pepites_weekly/false/false',
  'the bodies, variables, limits and flags are exactly what they were'
);
select extensions.is(
  app_private.render_notification_template(
    (select title_template from app.notification_templates
     where template_key = 'pepites_weekly' and channel = 'in_app' and language = 'fr' and active),
    array['week'], '{"week":"16"}'::jsonb),
  'Prospects : le Top 10 de la semaine 16',
  'the French title renders with the week'
);
select extensions.is(
  app_private.render_notification_template(
    (select title_template from app.notification_templates
     where template_key = 'pepites_weekly' and channel = 'in_app' and language = 'ar' and active),
    array['week'], '{"week":"16"}'::jsonb),
  'المواهب: توب 10 للأسبوع 16',
  'the Arabic title renders with the week'
);

select * from extensions.finish();
rollback;
