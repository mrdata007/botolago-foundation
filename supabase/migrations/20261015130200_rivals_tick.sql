-- BotolaGO+ Rivaux, migration 3 of 3: the lead-change notification and its two scheduled jobs.
--
-- Both jobs are scheduled but do nothing until the owner switches the tick on
-- (select app_private.rivals_configure(true)): rivals_tick() answers {"outcome": "off"} without
-- writing. cron.schedule with a name replaces a job of that name, so this file can be applied
-- again (apart from the table, which the guarded script refuses to create twice).
--
-- WHAT THE TICK DOES, while switched on. For the season's latest published journée (the card's own
-- evaluable test), for each pinned rival whose owner is a member, switched the notification on
-- BEFORE the journée was published, pinned the rival before it too, still shares an active private
-- league with them and has notifications and in-app notifications on: compare who leads after the
-- journée with who led before it (or, after a correction, with who the member was last told leads).
-- When the lead changed hands, create ONE notification (in-app, plus a push delivery per working phone
-- when the member has push and Fantasy reminders on; no email), once per change, in French or Arabic
-- by the member's language, quiet hours respected. The push follows the Manager Card rating change
-- exactly (20261012200100): the push rules below learn the type (topic "fantasy", life 12 hours), the
-- delivery is created pending, and the push claim sends it only while
-- app_private.notification_push_settings.mode allows ('off' sends nothing) and re-checks the reader. A journée published before the
-- member turned the notification on is never told. A corrected result that flips the lead again is
-- told again, in the corrected wording; one that does not flip it says nothing. Nothing is told
-- during matches: only a published result can move a total.
--
-- The push rules are replaced here (create or replace, bodies of 20261012200100 plus the new type).
--
-- WRITES: app.notifications, app.notification_deliveries (in_app and push), app_private.notification_events and
-- app_private.rival_lead_notices (its own record of what each member was told). Nothing of Fantasy,
-- the card or the pins.
--
-- rivals-tick runs at minutes 7, 22, 37 and 52 (off the quarter hours the other ticks use).
-- rivals-history-prune runs daily at 03:59 UTC, whatever the switch says: it deletes only this tick's
-- cron.job_run_details rows older than 7 days and the notice records older than 365 days.

create table app_private.rival_lead_notices (
  id bigint generated always as identity primary key,
  user_id uuid not null references app.profiles(id) on delete cascade,
  rival_user_id uuid not null references app.profiles(id) on delete cascade,
  gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete restrict,
  leader text not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint rival_lead_notices_leader_check check (leader in ('me', 'rival'))
);
create index rival_lead_notices_pair_idx
  on app_private.rival_lead_notices (user_id, rival_user_id, gameweek_id, id);
alter table app_private.rival_lead_notices enable row level security;
alter table app_private.rival_lead_notices force row level security;
revoke all on app_private.rival_lead_notices from public, anon, authenticated, service_role;
comment on table app_private.rival_lead_notices is
  'BotolaGO+ Rivaux: each change of lead a member was told about (who leads after it), so a correction is compared with what they were last told. Written only by app_private.rivals_tick. No grant.';

-- ---------------------------------------------------------------------------
-- The push rules learn the type: a Fantasy message (the Fantasy reminders switch), worth sending for
-- 12 hours (quiet hours included). Otherwise the bodies of 20261012200100.
-- ---------------------------------------------------------------------------
create or replace function app_private.notification_push_topic(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'match_starting' then 'match'
    when 'goal' then 'match'
    when 'goal_cancelled' then 'match'
    when 'full_time' then 'match'
    when 'followed_team_result' then 'match'
    when 'deadline_24h' then 'fantasy'
    when 'deadline_1h' then 'fantasy'
    when 'manager_card_ovr_change' then 'fantasy'
    when 'rival_lead_change' then 'fantasy'
    else null
  end;
$$;

create or replace function app_private.notification_push_ttl(p_type text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'goal' then interval '10 minutes'
    when 'goal_cancelled' then interval '10 minutes'
    when 'match_starting' then interval '20 minutes'
    when 'full_time' then interval '30 minutes'
    when 'followed_team_result' then interval '30 minutes'
    when 'deadline_1h' then interval '30 minutes'
    when 'deadline_24h' then interval '2 hours'
    when 'manager_card_ovr_change' then interval '12 hours'
    when 'rival_lead_change' then interval '12 hours'
    else interval '1 hour'
  end;
$$;

create function app_private.rivals_tick()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  enabled boolean;
  v_season uuid;
  gw record;
  published timestamptz;
  pin record;
  cur_me integer;
  cur_rival integer;
  prv_me integer;
  prv_rival integer;
  leader_after text;
  baseline text;
  told integer;
  last_leader text;
  corrected boolean;
  template app.notification_templates%rowtype;
  rival_name text;
  event_key text;
  new_event uuid;
  variables jsonb;
  available timestamptz;
  new_notification uuid;
  created integer := 0;
begin
  select s.enabled into enabled from app_private.rivals_settings s where s.id;
  if not coalesce(enabled, false) then
    return jsonb_build_object('outcome', 'off');
  end if;
  v_season := app_private.manager_card_fantasy_season();
  if v_season is null then
    return jsonb_build_object('outcome', 'no_season');
  end if;
  select e.gameweek_id, e.seq, g.finalized_at, g.corrected_at into gw
  from app_private.card_evaluable_gameweeks(v_season) e
  join app.fantasy_gameweeks g on g.id = e.gameweek_id
  order by e.seq desc
  limit 1;
  if not found then
    return jsonb_build_object('outcome', 'no_gameweek');
  end if;
  published := coalesce(gw.corrected_at, gw.finalized_at);
  -- The opt-in cutoff is the journée's first publication: a correction does not reopen it.

  for pin in
    select p.user_id, p.rival_user_id, profile.preferred_language,
      preference.notifications_enabled, preference.in_app_notifications_enabled,
      preference.push_notifications_enabled, preference.fantasy_deadline_reminders,
      preference.notification_timezone, preference.quiet_hours_enabled,
      preference.quiet_hours_start, preference.quiet_hours_end
    from app.pinned_rivals p
    join app.rival_preferences rp on rp.user_id = p.user_id
      and rp.notify_lead_change and rp.notify_changed_at <= gw.finalized_at
    join app.profiles profile on profile.id = p.user_id and profile.deleted_at is null
    join app.profiles rival_profile on rival_profile.id = p.rival_user_id and rival_profile.deleted_at is null
    left join app.user_preferences preference on preference.user_id = p.user_id
    where p.fantasy_season_id = v_season and p.created_at <= gw.finalized_at
    order by p.user_id, p.rival_user_id
  loop
    if not coalesce(pin.notifications_enabled and pin.in_app_notifications_enabled, false)
      or not app_private.has_premium(pin.user_id)
      or not exists (select 1 from app_private.rivals_shared_league(pin.user_id, pin.rival_user_id, v_season)) then
      continue;
    end if;

    cur_me := null; cur_rival := null; prv_me := null; prv_rival := null;
    select x.me_total, x.rival_total into cur_me, cur_rival
    from app_private.rivals_pair(pin.user_id, pin.rival_user_id, v_season) x where x.seq = gw.seq;
    select x.me_total, x.rival_total into prv_me, prv_rival
    from app_private.rivals_pair(pin.user_id, pin.rival_user_id, v_season) x
    where x.seq < gw.seq order by x.seq desc limit 1;

    leader_after := app_private.rivals_leader(cur_me, cur_rival);
    if leader_after is null or leader_after = 'tie' then
      continue;
    end if;
    select count(*)::integer into told from app_private.rival_lead_notices n
    where n.user_id = pin.user_id and n.rival_user_id = pin.rival_user_id and n.gameweek_id = gw.gameweek_id;
    last_leader := null;
    select n.leader into last_leader from app_private.rival_lead_notices n
    where n.user_id = pin.user_id and n.rival_user_id = pin.rival_user_id and n.gameweek_id = gw.gameweek_id
    order by n.id desc limit 1;
    baseline := coalesce(last_leader, app_private.rivals_leader(prv_me, prv_rival));
    if baseline is null or baseline = leader_after then
      continue;
    end if;

    corrected := told > 0 or gw.corrected_at is not null;
    select * into template from app.notification_templates t
    where t.template_key = case when leader_after = 'rival' then 'rival_lead_rival' else 'rival_lead_you' end
        || case when corrected then '_corrected' else '' end
      and t.channel = 'in_app' and t.language = pin.preferred_language and t.active
    order by t.version desc
    limit 1;
    if not found then
      continue;
    end if;

    select coalesce(nullif(btrim(rp.display_name), ''), (
        select t.name from app.fantasy_teams t
        where t.user_id = pin.rival_user_id and t.fantasy_season_id = v_season limit 1))
      into rival_name
    from app.profiles rp where rp.id = pin.rival_user_id;

    event_key := 'rivals:lead:' || pin.user_id || ':' || pin.rival_user_id || ':' || gw.gameweek_id
      || ':' || (told + 1);
    new_event := null;
    insert into app_private.notification_events (
      id, event_type, source_domain, source_entity_id, target_user_id, occurred_at,
      schema_version, deduplication_key, correlation_id, safe_payload, status,
      processing_started_at, completed_at
    ) values (
      gen_random_uuid(), 'rival_lead_change', 'fantasy', gw.gameweek_id, pin.user_id,
      statement_timestamp(), 1, event_key, gw.gameweek_id,
      jsonb_build_object('gameweek', gw.seq, 'leader', leader_after, 'corrected', corrected,
        'myTotal', cur_me, 'rivalTotal', cur_rival),
      'completed', statement_timestamp(), statement_timestamp()
    )
    on conflict (deduplication_key) do nothing
    returning id into new_event;
    if new_event is null then
      continue;
    end if;

    variables := jsonb_build_object(
      'rival', coalesce(rival_name, ''),
      'rival_total', cur_rival::text,
      'my_total', cur_me::text,
      'gameweek', gw.seq::text);
    available := app_private.defer_for_quiet_hours(
      statement_timestamp(), pin.notification_timezone, pin.quiet_hours_enabled,
      pin.quiet_hours_start, pin.quiet_hours_end, false);
    insert into app.notifications (
      user_id, event_id, template_id, notification_type, category, priority, language,
      title, body, deep_link_target, deep_link_entity_id, source_domain, source_entity_id,
      available_at
    ) values (
      pin.user_id, new_event, template.id, 'rival_lead_change', template.category,
      'normal', pin.preferred_language,
      app_private.render_notification_template(template.title_template, template.required_variables, variables),
      app_private.render_notification_template(template.body_template, template.required_variables, variables),
      'none', null, 'fantasy', gw.gameweek_id, available
    )
    on conflict (event_id, user_id) do nothing
    returning id into new_notification;
    if new_notification is null then
      continue;
    end if;
    insert into app.notification_deliveries (
      notification_id, channel, provider_key, status, attempt_count, sent_at, delivered_at
    ) values (new_notification, 'in_app', 'database', 'delivered', 1,
      statement_timestamp(), statement_timestamp());
    -- A push per working phone when the reader has push and Fantasy reminders on; the push claim
    -- sends it only while the push switch allows, and re-checks the reader.
    if coalesce(pin.push_notifications_enabled and pin.fantasy_deadline_reminders, false) then
      insert into app.notification_deliveries (
        notification_id, channel, device_registration_id, provider_key, status
      )
      select new_notification, 'push', device.id, device.push_provider::text, 'pending'
      from app.device_registrations device
      join app_private.push_destinations destination on destination.device_registration_id = device.id
      where device.user_id = pin.user_id
        and device.enabled and device.invalidated_at is null
        and device.push_provider::text in ('fcm', 'apns')
      on conflict do nothing;
    end if;
    insert into app_private.rival_lead_notices (user_id, rival_user_id, gameweek_id, leader)
    values (pin.user_id, pin.rival_user_id, gw.gameweek_id, leader_after);
    created := created + 1;
  end loop;
  return jsonb_build_object('outcome', 'ok', 'gameweek', gw.seq, 'created', created);
end;
$$;
revoke all on function app_private.rivals_tick()
  from public, anon, authenticated, service_role;
grant execute on function app_private.rivals_tick() to postgres;
comment on function app_private.rivals_tick() is
  'While app_private.rivals_settings.enabled is on, creates one rival_lead_change notification (in-app delivery, plus a pending push delivery per working phone with push and Fantasy reminders on) for each pinned rival whose lead changed hands in the season''s latest published journée, for members who opted in before it was published (a correction that flips the lead is told again). Answers {outcome: off} without writing while off. Executable by postgres only.';

select cron.schedule(
  'rivals-tick',
  '7,22,37,52 * * * *',
  $job$select app_private.rivals_tick();$job$
);

select cron.schedule(
  'rivals-history-prune',
  '59 3 * * *',
  $prune$
    delete from cron.job_run_details
    where jobid = (select jobid from cron.job where jobname = 'rivals-tick')
      and end_time < now() - interval '7 days';
    delete from app_private.rival_lead_notices
    where created_at < now() - interval '365 days';
  $prune$
);
