begin;
select extensions.no_plan();

select extensions.is(
  (select title_template from app.notification_templates
   where template_key = 'gameweek_opened' and channel = 'in_app'
     and language = 'fr' and active),
  'Journée {{gameweek}} : à vous de jouer !',
  'new French opening notices use the same form of address as the interface'
);
select extensions.is(
  (select count(*)::integer from app.notification_templates
   where template_key = 'gameweek_opened' and channel = 'in_app'
     and language = 'fr' and version = 1 and not active and retired_at is not null),
  1,
  'the old edition remains available to existing notifications'
);
select extensions.is(
  (select string_agg(language::text || '/v' || version::text, ' | ' order by language::text)
   from app.notification_templates
   where template_key = 'gameweek_opened' and channel = 'in_app' and active),
  'ar/v1 | fr/v2',
  'only the reviewed French edition changes'
);
select extensions.is(
  (select count(*)::integer
   from app.notification_templates newer
   join app.notification_templates older
     on older.template_key = newer.template_key and older.channel = newer.channel
       and older.language = newer.language and older.version = 1
   where newer.template_key = 'gameweek_opened' and newer.channel = 'in_app'
     and newer.language = 'fr' and newer.version = 2
     and newer.notification_type = older.notification_type
     and newer.category = older.category
     and newer.required_variables = older.required_variables
     and newer.max_title_length = older.max_title_length
     and newer.max_body_length = older.max_body_length
     and newer.is_mandatory = older.is_mandatory
     and newer.bypass_quiet_hours = older.bypass_quiet_hours),
  1,
  'variables, delivery flags and limits stay unchanged'
);
select extensions.is(
  app_private.render_notification_template(
    (select body_template from app.notification_templates
     where template_key = 'gameweek_opened' and channel = 'in_app'
       and language = 'fr' and active),
    array['gameweek', 'deadline'],
    '{"gameweek":"5","deadline":"25 octobre à 18:00"}'::jsonb),
  'Vérifiez votre onze, l’ordre des remplaçants et votre capitaine avant le 25 octobre à 18:00.',
  'the revised body keeps the real deadline interpolation'
);

select * from extensions.finish();
rollback;
