-- Production V2: tkewgajrljbwgwedqsxn. Only notification-template copy/history.
-- Owner-authorized UX writing release (PR #545). No sending/settings changes.
-- Check agents, workflows, active writers and cron first (AGENTS.md).
-- No cron writes notification_templates; readers see the old or new edition
-- atomically. This block also refuses database functions or cron commands
-- that write these templates. Do not pause unrelated live jobs.
-- The default rehearsal runs the full apply/postflight path, then deliberately
-- raises UX_WRITING_REHEARSAL_OK to roll it back. Independently re-read before
-- applying. To apply, change only rehearsal boolean := true to false.
-- A failure means stop and diagnose; never weaken a guard.

do $ux_release$
declare
  rehearsal boolean := true;
  migration_sql text := $ux_migration$-- Match the French interface/email register in future round-opening notices.
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
$ux_migration$;
  original app.notification_templates%rowtype;
  current_template app.notification_templates%rowtype;
  other_templates text;
  cron_state text;
  old_edition jsonb;
  expected_meta jsonb;
begin
  perform set_config('lock_timeout', '5s', true);
  perform set_config('statement_timeout', '60s', true);
  perform pg_advisory_xact_lock(hashtext('botolago-ux-writing-20261020092736'));
  lock table app.notification_templates in share row exclusive mode;

  if exists (select 1 from supabase_migrations.schema_migrations where version='20261020092736') then
    raise exception 'stop: migration 20261020092736 is already recorded';
  end if;
  if encode(sha256(convert_to(migration_sql, 'UTF8')), 'hex') <> 'fc5e70d14cde41dc536ca9bf313e7bf124cb2508e265941a7eba1353540063b7' then
    raise exception 'stop: embedded migration differs from reviewed repository bytes';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('app','app_private','api') and p.prokind='f'
      and p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+app\.notification_templates'
  ) or exists (select 1 from cron.job where command ilike '%notification_templates%') then
    raise exception 'stop: a function or cron command writes notification templates';
  end if;
  if (select count(*) from app.notification_templates
      where template_key='gameweek_opened' and channel='in_app' and language='fr') <> 1 then
    raise exception 'stop: expected exactly one French gameweek_opened edition';
  end if;
  select * into strict original from app.notification_templates
    where template_key='gameweek_opened' and channel='in_app' and language='fr';
  old_edition := to_jsonb(original) - array['active','retired_at'];
  expected_meta := jsonb_build_array(original.template_key,original.notification_type,original.category,
    original.channel,original.language,original.required_variables,original.max_title_length,
    original.max_body_length,original.is_mandatory,original.bypass_quiet_hours);
  select md5(coalesce(string_agg(to_jsonb(t)::text, ',' order by id),'')) into other_templates
    from app.notification_templates t
    where not(template_key='gameweek_opened' and channel='in_app' and language='fr');
  select md5(string_agg(jobname||':'||schedule||':'||active::text,',' order by jobname)) into cron_state
    from cron.job;

  -- Exact reviewed migration, including its own old-copy/variables guards.
  execute migration_sql;
  insert into supabase_migrations.schema_migrations(version,name,statements)
    values ('20261020092736','ux_writing_gameweek_opened_template',array[migration_sql]);

  select * into strict current_template from app.notification_templates where id=original.id;
  if current_template.active or current_template.retired_at is null
    or to_jsonb(current_template) - array['active','retired_at'] is distinct from old_edition then
    raise exception 'stop: original edition not retired with all other values preserved';
  end if;
  select * into strict current_template from app.notification_templates
    where template_key='gameweek_opened' and channel='in_app' and language='fr' and active;
  if current_template.version <> 2 or current_template.activated_at is null
    or current_template.retired_at is not null
    or current_template.title_template is distinct from 'Journée {{gameweek}} : à vous de jouer !'
    or current_template.body_template is distinct from 'Vérifiez votre onze, l’ordre des remplaçants et votre capitaine avant le {{deadline}}.'
    or jsonb_build_array(current_template.template_key,current_template.notification_type,current_template.category,
      current_template.channel,current_template.language,current_template.required_variables,current_template.max_title_length,
      current_template.max_body_length,current_template.is_mandatory,current_template.bypass_quiet_hours)
      is distinct from expected_meta then
    raise exception 'stop: new edition text/metadata did not check out';
  end if;
  if (select count(*) from app.notification_templates
      where template_key='gameweek_opened' and channel='in_app' and language='fr') <> 2 then
    raise exception 'stop: expected exactly two French editions after apply';
  end if;
  if (select md5(coalesce(string_agg(to_jsonb(t)::text, ',' order by id),''))
      from app.notification_templates t
      where not(template_key='gameweek_opened' and channel='in_app' and language='fr')) is distinct from other_templates
    or (select md5(string_agg(jobname||':'||schedule||':'||active::text,',' order by jobname))
      from cron.job) is distinct from cron_state then
    raise exception 'stop: another template or cron configuration changed';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations
      where version='20261020092736' and name='ux_writing_gameweek_opened_template'
        and statements=array[migration_sql]) then
    raise exception 'stop: exact migration history is absent';
  end if;
  if rehearsal then
    raise exception 'UX_WRITING_REHEARSAL_OK: French v2 verified; original metadata, Arabic, other templates and cron preserved; exact history recorded; all rolled back';
  end if;
end
$ux_release$;
