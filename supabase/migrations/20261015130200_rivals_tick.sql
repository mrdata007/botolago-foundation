-- BotolaGO+ Rivaux, migration 3 of 3: the lead-change notification and its two scheduled jobs.
--
-- Both jobs are scheduled but do nothing until the owner switches the tick on
-- (select app_private.rivals_configure(true)): rivals_tick() answers {"outcome": "off"} without
-- writing. cron.schedule with a name replaces a job of that name, so this file can be applied
-- again (apart from the table, which the guarded script refuses to create twice).
--
-- WHAT THE TICK DOES, while switched on. It is state-based. Each pass, for every pinned rival of
-- the season, it reads who leads on the CURRENT published totals (the last evaluable journée's
-- running totals, the very figures api.get_my_rivals reads) and compares that with the leader it
-- last recorded for that pin in app_private.rival_lead_notices. The first time a pin is seen (or
-- after it was pinned again) it only records the leader and tells nobody. When the leader differs
-- from the recorded one the record is updated and, if the member is eligible, ONE notification is
-- created (in-app, plus a push delivery per working phone when the member has push and Fantasy
-- reminders on; no email), once per change, in French or Arabic by the member's language, quiet
-- hours respected. Because the comparison is with the last recorded leader and not with the previous
-- journée, a correction of an OLDER journée that flips the lead after a newer one was published is
-- noticed too. The wording is « Résultat corrigé » (the _corrected template keys) when the latest
-- publication event is a correction, the plain one when it is a newly published journée. A tie
-- changes nothing: the record keeps the last decisive leader.
--
-- Eligible means: a member, who switched the notification on and pinned the rival no later than the
-- publication of the journée that produced the change (finalized_at for a new journée,
-- corrected_at for a correction), still sharing an active private league with the rival, with
-- notifications and in-app notifications on. The state is recorded for every pin whether eligible or
-- not, so the baseline exists when a member opts in. The push follows the Manager Card rating change
-- exactly (20261012200100): the push rules below learn the type (topic "fantasy", life 12 hours), the
-- delivery is created pending, and the push claim sends it only while
-- app_private.notification_push_settings.mode allows ('off' sends nothing) and re-checks the reader.
-- Nothing is told during matches: only a published result can move a total.
--
-- The push rules are replaced here (create or replace, bodies of 20261012200100 plus the new type).
--
-- WRITES: app.notifications, app.notification_deliveries (in_app and push), app_private.notification_events and
-- app_private.rival_lead_notices (its own record of who leads each pin, one row per pin). Nothing of Fantasy,
-- the card or the pins.
--
-- rivals-tick runs at minutes 7, 22, 37 and 52 (off the quarter hours the other ticks use).
-- rivals-history-prune runs daily at 03:59 UTC, whatever the switch says: it deletes only this tick's
-- cron.job_run_details rows older than 7 days and the records of unpinned pairs older than 365 days.

create table app_private.rival_lead_notices (
  user_id uuid not null references app.profiles(id) on delete cascade,
  rival_user_id uuid not null references app.profiles(id) on delete cascade,
  fantasy_season_id uuid not null references app.fantasy_seasons(id) on delete restrict,
  leader text not null,
  changes integer not null default 0,
  gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint rival_lead_notices_pkey primary key (user_id, fantasy_season_id, rival_user_id),
  constraint rival_lead_notices_leader_check check (leader in ('me', 'rival')),
  constraint rival_lead_notices_changes_check check (changes >= 0)
);
alter table app_private.rival_lead_notices enable row level security;
alter table app_private.rival_lead_notices force row level security;
revoke all on app_private.rival_lead_notices from public, anon, authenticated, service_role;
comment on table app_private.rival_lead_notices is
  'BotolaGO+ Rivaux: who leads each pinned pair as the tick last saw it (one row per pin), how many changes it has seen and the journée behind the last one, so the next pass compares the current totals with it. Written only by app_private.rivals_tick. No grant.';

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
  leader_now text;
  st app_private.rival_lead_notices%rowtype;
  eligible boolean;
  corrected boolean;
  template app.notification_templates%rowtype;
  rival_name text;
  event_key text;
  new_event uuid;
  variables jsonb;
  available timestamptz;
  new_notification uuid;
  created integer := 0;
  recorded integer := 0;
begin
  select s.enabled into enabled from app_private.rivals_settings s where s.id;
  if not coalesce(enabled, false) then
    return jsonb_build_object('outcome', 'off');
  end if;
  v_season := app_private.manager_card_fantasy_season();
  if v_season is null then
    return jsonb_build_object('outcome', 'no_season');
  end if;
  -- The journée behind the latest publication event: a newly published one (finalized_at) or an
  -- older one corrected since (corrected_at). Its publication time is the opt-in cutoff.
  select e.gameweek_id, e.seq, g.finalized_at, g.corrected_at into gw
  from app_private.card_evaluable_gameweeks(v_season) e
  join app.fantasy_gameweeks g on g.id = e.gameweek_id
  order by greatest(g.finalized_at, g.corrected_at) desc nulls last, e.seq desc
  limit 1;
  if not found then
    return jsonb_build_object('outcome', 'no_gameweek');
  end if;
  corrected := gw.corrected_at is not null and gw.corrected_at >= gw.finalized_at;
  published := case when corrected then gw.corrected_at else gw.finalized_at end;

  for pin in
    select p.user_id, p.rival_user_id, p.created_at as pinned_at, profile.preferred_language,
      rp.notify_lead_change, rp.notify_changed_at,
      preference.notifications_enabled, preference.in_app_notifications_enabled,
      preference.push_notifications_enabled, preference.fantasy_deadline_reminders,
      preference.notification_timezone, preference.quiet_hours_enabled,
      preference.quiet_hours_start, preference.quiet_hours_end
    from app.pinned_rivals p
    join app.profiles profile on profile.id = p.user_id and profile.deleted_at is null
    join app.profiles rival_profile on rival_profile.id = p.rival_user_id and rival_profile.deleted_at is null
    left join app.rival_preferences rp on rp.user_id = p.user_id
    left join app.user_preferences preference on preference.user_id = p.user_id
    where p.fantasy_season_id = v_season
    order by p.user_id, p.rival_user_id
  loop
    -- Who leads now, on the same running totals the read uses (the last evaluable journée).
    cur_me := null; cur_rival := null;
    select x.me_total, x.rival_total into cur_me, cur_rival
    from app_private.rivals_pair(pin.user_id, pin.rival_user_id, v_season) x
    order by x.seq desc limit 1;
    leader_now := app_private.rivals_leader(cur_me, cur_rival);
    -- A tie or an unknown total changes nothing: the record keeps the last decisive leader.
    if leader_now is null or leader_now = 'tie' then
      continue;
    end if;

    select * into st from app_private.rival_lead_notices n
    where n.user_id = pin.user_id and n.rival_user_id = pin.rival_user_id
      and n.fantasy_season_id = v_season;
    if not found or st.updated_at < pin.pinned_at then
      -- First sight of this pin (or pinned again since): record, tell nobody.
      insert into app_private.rival_lead_notices (
        user_id, rival_user_id, fantasy_season_id, leader, changes, gameweek_id
      ) values (pin.user_id, pin.rival_user_id, v_season, leader_now, 0, gw.gameweek_id)
      on conflict (user_id, fantasy_season_id, rival_user_id) do update
        set leader = excluded.leader, changes = 0, gameweek_id = excluded.gameweek_id,
          updated_at = statement_timestamp();
      recorded := recorded + 1;
      continue;
    end if;
    if st.leader = leader_now then
      continue;
    end if;

    -- The lead changed hands since the last pass: record it, then tell the member if eligible.
    update app_private.rival_lead_notices n
    set leader = leader_now, changes = n.changes + 1, gameweek_id = gw.gameweek_id,
      updated_at = statement_timestamp()
    where n.user_id = pin.user_id and n.rival_user_id = pin.rival_user_id
      and n.fantasy_season_id = v_season;
    recorded := recorded + 1;

    eligible := coalesce(pin.notify_lead_change, false)
      and pin.notify_changed_at <= published
      and pin.pinned_at <= published
      and coalesce(pin.notifications_enabled and pin.in_app_notifications_enabled, false)
      and app_private.has_premium(pin.user_id)
      and exists (select 1 from app_private.rivals_shared_league(pin.user_id, pin.rival_user_id, v_season));
    if not eligible then
      continue;
    end if;

    select * into template from app.notification_templates t
    where t.template_key = case when leader_now = 'rival' then 'rival_lead_rival' else 'rival_lead_you' end
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

    event_key := 'rivals:lead:' || pin.user_id || ':' || pin.rival_user_id || ':' || v_season
      || ':' || (st.changes + 1);
    new_event := null;
    insert into app_private.notification_events (
      id, event_type, source_domain, source_entity_id, target_user_id, occurred_at,
      schema_version, deduplication_key, correlation_id, safe_payload, status,
      processing_started_at, completed_at
    ) values (
      gen_random_uuid(), 'rival_lead_change', 'fantasy', gw.gameweek_id, pin.user_id,
      statement_timestamp(), 1, event_key, gw.gameweek_id,
      jsonb_build_object('gameweek', gw.seq, 'leader', leader_now, 'corrected', corrected,
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
    created := created + 1;
  end loop;
  return jsonb_build_object('outcome', 'ok', 'gameweek', gw.seq, 'created', created, 'recorded', recorded);
end;
$$;
revoke all on function app_private.rivals_tick()
  from public, anon, authenticated, service_role;
grant execute on function app_private.rivals_tick() to postgres;
comment on function app_private.rivals_tick() is
  'While app_private.rivals_settings.enabled is on, creates one rival_lead_change notification (in-app delivery, plus a pending push delivery per working phone with push and Fantasy reminders on) for each pinned rival whose lead changed hands since the last pass (current published totals against the leader last recorded for that pin in rival_lead_notices; the first sight of a pin only records), for members who opted in before the journée that produced the change was published; a correction of any journée that flips the lead is told, in the corrected wording. Answers {outcome: off} without writing while off. Executable by postgres only.';

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
    delete from app_private.rival_lead_notices n
    where n.updated_at < now() - interval '365 days'
      and not exists (
        select 1 from app.pinned_rivals p
        where p.user_id = n.user_id and p.rival_user_id = n.rival_user_id
          and p.fantasy_season_id = n.fantasy_season_id);
  $prune$
);
