-- Match the French interface/email register in future round-opening notices.
-- Keep the old edition for stored notifications; do not rewrite their text.
-- No scheduling, delivery, consent, language selection or access rule changes.
-- Arabic already uses the established direct form and remains unchanged.

do $copy$
declare
  previous app.notification_templates%rowtype;
begin
  select * into previous
  from app.notification_templates
  where template_key = 'gameweek_opened' and channel = 'in_app'
    and language = 'fr' and active
  for update;

  if not found
    or previous.version <> 1
    or previous.title_template is distinct from 'Journée {{gameweek}} : à toi de jouer !'
    or previous.body_template is distinct from 'Choisis ton équipe avant le {{deadline}}.'
    or previous.required_variables is distinct from array['gameweek', 'deadline']::text[]
    or exists (
      select 1 from app.notification_templates
      where template_key = 'gameweek_opened' and channel = 'in_app'
        and language = 'fr' and version = 2
    ) then
    raise exception 'gameweek_opened/fr is not the reviewed version 1';
  end if;

  update app.notification_templates
  set active = false, retired_at = statement_timestamp()
  where id = previous.id;

  insert into app.notification_templates (
    template_key, notification_type, category, channel, language, version,
    title_template, body_template, required_variables,
    max_title_length, max_body_length, is_mandatory, bypass_quiet_hours,
    active, activated_at
  ) values (
    previous.template_key, previous.notification_type, previous.category,
    previous.channel, previous.language, 2,
    'Journée {{gameweek}} : à vous de jouer !',
    'Vérifiez votre onze, l’ordre des remplaçants et votre capitaine avant le {{deadline}}.',
    previous.required_variables, previous.max_title_length, previous.max_body_length,
    previous.is_mandatory, previous.bypass_quiet_hours, true, statement_timestamp()
  );
end
$copy$;
