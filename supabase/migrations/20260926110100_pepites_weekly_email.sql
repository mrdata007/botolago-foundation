-- BotolaGO Production V2
-- Pépites, migration 7 of the v1 sequence: the weekly email.
-- docs/engineering/PEPITES_ARCHITECTURE.md §5.4.
--
-- Owner decision, 2026-09-26: explicit opt-in, off by default, easy to
-- leave, nobody subscribed automatically. Everyone, existing users included,
-- starts with app.user_preferences.pepites_weekly_email = false.
--
-- The email goes through the existing notification pipeline, unchanged in its
-- mechanics. This migration adds:
--
--   - the preference, with its opt-in and opt-out functions;
--   - the in-app templates the fan-out needs;
--   - the event, written when an edition is published (Pépites public only),
--     and the cancellation of unsent mail when it is withdrawn or corrected;
--   - Pépites lines in the fan-out, the claim and the staleness rule;
--   - a Pépites-only unsubscribe token (topic 'pepites_weekly');
--   - retry safety for every email type, inside the provider's 24-hour
--     idempotency window: the first claim time is kept, an ambiguous send is
--     not retried after 23 hours (closed as possibly_sent), and each
--     attempt's request-body hash is stored so a retry can be refused if its
--     body would differ;
--   - a per-edition delivery report.

-- ---------------------------------------------------------------------------
-- Preference
-- ---------------------------------------------------------------------------
alter table app.user_preferences
  add column pepites_weekly_email boolean not null default false,
  add column pepites_weekly_email_changed_at timestamptz;

comment on column app.user_preferences.pepites_weekly_email is
  'Pépites weekly email. Explicit opt-in, off by default for everyone (owner decision 2026-09-26). Changed only by api.set_my_pepites_weekly_email and the Pépites unsubscribe link; the general preference functions leave it alone.';

-- ---------------------------------------------------------------------------
-- Retry safety and topic columns
-- ---------------------------------------------------------------------------
alter table app.notification_deliveries
  add column first_claimed_at timestamptz;
comment on column app.notification_deliveries.first_claimed_at is
  'When the delivery was first claimed for sending: the earliest moment its idempotency key can have reached the provider. Set once by api.service_claim_email_deliveries.';

alter table app_private.notification_delivery_attempts
  add column body_sha256 text,
  add constraint notification_delivery_attempts_body_sha256_check
    check (body_sha256 is null or body_sha256 ~ '^[0-9a-f]{64}$');
comment on column app_private.notification_delivery_attempts.body_sha256 is
  'SHA-256 of the exact request body the dispatcher sent. A retry must send the same body under the same key.';

alter table app_private.notification_email_unsubscribe_tokens
  add column topic text,
  add constraint notification_email_unsubscribe_tokens_topic_check
    check (topic is null or topic = 'pepites_weekly');
comment on column app_private.notification_email_unsubscribe_tokens.topic is
  'Null: the link turns off all product email (as before). pepites_weekly: it turns off only the Pépites weekly email.';

-- ---------------------------------------------------------------------------
-- In-app templates (the fan-out stores the in-app notification that carries
-- each email, and needs an active in_app template per type and language)
-- ---------------------------------------------------------------------------
insert into app.notification_templates (
  template_key, notification_type, category, channel, language, version,
  title_template, body_template, required_variables, max_title_length,
  max_body_length, active, activated_at
) values
  ('pepites_weekly', 'pepites_weekly', 'football', 'in_app', 'fr', 1,
    'Pépites : le Top 10 de la semaine {{week}}',
    'Les dix meilleurs jeunes de Botola Pro cette semaine.',
    array['week'], 120, 300, true, statement_timestamp()),
  ('pepites_weekly', 'pepites_weekly', 'football', 'in_app', 'ar', 1,
    'Pépites: توب 10 للأسبوع {{week}}',
    'أفضل عشرة لاعبين شباب في البطولة الاحترافية هذا الأسبوع.',
    array['week'], 120, 300, true, statement_timestamp());

-- ---------------------------------------------------------------------------
-- Pépites helpers
-- ---------------------------------------------------------------------------
-- Whether an edition's email may still go out: Pépites is public and the
-- edition is the week's published one (not withdrawn, not superseded).
create function app_private.pepites_weekly_email_allowed(p_edition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.pepites_editions edition
    cross join app_private.pepites_settings settings
    where edition.id = p_edition_id and edition.status = 'published'
      and settings.id and settings.mode = 'public'
  );
$$;

-- The event payload: fixed at publication, rendered as is (no live data).
create function app_private.pepites_weekly_email_payload(p_edition_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'editionId', edition.id,
    'seasonId', edition.season_id,
    'week', edition.week_number,
    'round', edition.round_number,
    'publishedAt', edition.published_at,
    'correctsEditionId', edition.corrects_edition_id,
    'entries', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'rank', entry.editorial_rank,
          'playerId', entry.player_id,
          'name', player.display_name,
          'club', case when score.team_id is not null
            then app_private.notification_email_team_json(score.team_id) end,
          'score', round(entry.computed_score)::integer
        ) order by entry.editorial_rank)
      from app.pepites_edition_entries entry
      join app.players player on player.id = entry.player_id
      left join app.pepites_player_scores score
        on score.run_id = edition.run_id and score.player_id = entry.player_id
      where entry.edition_id = edition.id
    ), '[]'::jsonb)
  )
  from app.pepites_editions edition
  where edition.id = p_edition_id;
$$;

-- Cancels an edition's unsent Pépites mail, and its event if it has not
-- fanned out yet. Returns the number of deliveries cancelled.
create function app_private.pepites_weekly_email_cancel(p_edition_id uuid, p_code text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cancelled integer;
begin
  update app_private.notification_events event set
    status = 'cancelled',
    completed_at = greatest(statement_timestamp(), event.received_at),
    sanitized_error_code = p_code
  where event.event_type = 'pepites_weekly' and event.source_entity_id = p_edition_id
    and event.status in ('pending', 'processing');

  update app.notification_deliveries delivery set
    status = 'cancelled', stable_error_code = p_code, next_retry_at = null,
    claimed_at = null, claim_expires_at = null
  from app.notifications notification
  where delivery.notification_id = notification.id
    and notification.notification_type = 'pepites_weekly'
    and notification.source_entity_id = p_edition_id
    and delivery.channel = 'email'
    and (delivery.status in ('pending', 'retry_scheduled')
      or (delivery.status = 'claimed' and delivery.claim_expires_at < statement_timestamp()));
  get diagnostics v_cancelled = row_count;
  return v_cancelled;
end;
$$;

-- Replaces the no-op of 20260926100000: runs inside the publishing or
-- withdrawing transaction (§5.2 step 7, §5.3).
create or replace function app_private.pepites_edition_email_hook(p_edition_id uuid, p_event text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_edition app.pepites_editions%rowtype;
begin
  if p_edition_id is null or p_event not in ('published', 'withdrawn') then
    raise exception using errcode = '22023', message = 'PEPITES_EMAIL_EVENT_INVALID';
  end if;
  select * into v_edition from app.pepites_editions where id = p_edition_id;
  if p_event = 'withdrawn' then
    perform app_private.pepites_weekly_email_cancel(p_edition_id, 'pepites_edition_not_current');
    return;
  end if;
  if v_edition.corrects_edition_id is not null then
    perform app_private.pepites_weekly_email_cancel(v_edition.corrects_edition_id,
      'pepites_edition_not_current');
  end if;
  -- A staff preview never emails anyone.
  if app_private.pepites_weekly_email_allowed(p_edition_id) then
    perform app_private.notification_email_enqueue('pepites_weekly', 'football', p_edition_id,
      'pepites-weekly:' || p_edition_id, app_private.pepites_weekly_email_payload(p_edition_id),
      statement_timestamp());
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staleness: 36 hours after publication
-- ---------------------------------------------------------------------------
create or replace function app_private.notification_email_event_is_stale(
  p_event app_private.notification_events,
  p_now timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_event.event_type::text
    when 'matchday_preview' then p_event.occurred_at < p_now - interval '12 hours'
    when 'matchday_results' then p_event.occurred_at < p_now - interval '18 hours'
    when 'round_preview' then p_event.occurred_at < p_now - interval '36 hours'
    when 'match_starting' then
      coalesce((p_event.safe_payload -> 'fixture' ->> 'kickoffAt')::timestamptz <= p_now, true)
    when 'deadline_24h' then
      coalesce((p_event.safe_payload ->> 'deadlineAt')::timestamptz <= p_now + interval '30 minutes', true)
    when 'gameweek_finalized' then p_event.received_at < p_now - interval '72 hours'
    when 'pepites_weekly' then p_event.occurred_at < p_now - interval '36 hours'
    else true
  end;
$$;

-- ---------------------------------------------------------------------------
-- Fan-out: as in 20260924140100, plus pepites_weekly
-- ---------------------------------------------------------------------------
create or replace function app_private.notification_email_fanout(
  p_now timestamptz,
  p_mode text,
  p_test_user_ids uuid[],
  p_activated_at timestamptz,
  p_budget integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  email_types constant app.notification_type[] := array[
    'matchday_preview', 'matchday_results', 'round_preview',
    'match_starting', 'deadline_24h', 'gameweek_finalized', 'pepites_weekly'
  ]::app.notification_type[];
  target app_private.notification_events%rowtype;
  run app_private.notification_fanout_runs%rowtype;
  budget integer := greatest(p_budget, 0);
  batch_limit integer;
  batch_audience integer;
  created_count integer;
  last_user uuid;
  total_created integer := 0;
  cancelled integer := 0;
  completed integer := 0;
  home_team uuid;
  away_team uuid;
  pepites_allowed boolean;
begin
  if p_mode not in ('test', 'live') or p_activated_at is null then
    return jsonb_build_object('created', 0, 'cancelled', 0, 'completed', 0);
  end if;

  -- Moments whose window has passed are closed, never mailed late.
  with stale as (
    update app_private.notification_events event set
      status = 'cancelled',
      completed_at = greatest(p_now, event.received_at),
      sanitized_error_code = 'email_window_passed'
    where event.event_type = any(email_types)
      and event.status in ('pending', 'processing')
      and event.received_at >= p_activated_at
      and app_private.notification_email_event_is_stale(event, p_now)
    returning 1
  )
  select count(*) into cancelled from stale;

  for target in
    select event.* from app_private.notification_events event
    where event.event_type = any(email_types)
      and event.status in ('pending', 'processing')
      and event.received_at >= p_activated_at
    order by event.received_at, event.id
    for update skip locked
  loop
    exit when budget <= 0;

    insert into app_private.notification_fanout_runs (event_id, status, claimed_at, claim_expires_at, started_at)
    values (target.id, 'processing', p_now, p_now + interval '10 minutes', p_now)
    on conflict (event_id) do update set
      status = 'processing',
      claimed_at = p_now,
      claim_expires_at = p_now + interval '10 minutes',
      started_at = coalesce(app_private.notification_fanout_runs.started_at, p_now)
    returning * into run;
    update app_private.notification_events set
      status = 'processing',
      processing_started_at = coalesce(processing_started_at, p_now)
    where id = target.id and status = 'pending';

    home_team := null;
    away_team := null;
    if target.event_type = 'match_starting' then
      select fixture.home_team_id, fixture.away_team_id into home_team, away_team
      from app.fixtures fixture where fixture.id = target.source_entity_id;
    end if;
    -- Pépites: public, and the edition still the week's published one.
    pepites_allowed := target.event_type = 'pepites_weekly'
      and app_private.pepites_weekly_email_allowed(target.source_entity_id);

    batch_limit := least(budget, 500);

    with audience as (
      select profile.id as user_id, profile.preferred_language as language,
        preference.notification_timezone as timezone
      from app.profiles profile
      join app.user_preferences preference on preference.user_id = profile.id
      join auth.users auth_user on auth_user.id = profile.id
      where profile.deleted_at is null
        and (run.checkpoint_user_id is null or profile.id > run.checkpoint_user_id)
        and preference.notifications_enabled
        and preference.email_notifications_enabled
        and auth_user.email is not null
        and auth_user.email_confirmed_at is not null
        and auth_user.deleted_at is null
        and not coalesce(auth_user.is_anonymous, false)
        and (auth_user.banned_until is null or auth_user.banned_until < p_now)
        and (p_mode = 'live' or profile.id = any(p_test_user_ids))
        and case target.event_type::text
          when 'matchday_preview' then preference.match_alerts
          when 'matchday_results' then preference.match_alerts
          when 'round_preview' then preference.match_alerts
          when 'match_starting' then preference.match_alerts and (
            preference.favorite_team_id in (home_team, away_team)
            or exists (select 1 from app.followed_teams followed
              where followed.user_id = profile.id and followed.team_id in (home_team, away_team))
            or exists (select 1 from app.notification_subscriptions subscription
              where subscription.user_id = profile.id and subscription.enabled
                and (subscription.fixture_id = target.source_entity_id
                  or subscription.team_id in (home_team, away_team))))
          when 'deadline_24h' then preference.fantasy_deadline_reminders
          when 'gameweek_finalized' then preference.fantasy_deadline_reminders
            and profile.id = target.target_user_id
            -- A corrected gameweek emits a new event; the recap is sent once.
            and not exists (
              select 1 from app.notifications earlier
              where earlier.user_id = profile.id
                and earlier.notification_type = 'gameweek_finalized'
                and earlier.source_entity_id = target.source_entity_id
                and earlier.event_id <> target.id
            )
          -- Explicit opt-in only. A correction goes only to readers who have
          -- no Pépites email for that week already sent (or possibly sent).
          when 'pepites_weekly' then preference.pepites_weekly_email and pepites_allowed
            and (target.safe_payload ->> 'correctsEditionId' is null or not exists (
              select 1 from app.notifications earlier
              join app_private.notification_events earlier_event on earlier_event.id = earlier.event_id
              join app.notification_deliveries earlier_delivery
                on earlier_delivery.notification_id = earlier.id and earlier_delivery.channel = 'email'
              where earlier.user_id = profile.id
                and earlier.notification_type = 'pepites_weekly'
                and earlier.event_id <> target.id
                and earlier_event.safe_payload ->> 'seasonId' = target.safe_payload ->> 'seasonId'
                and earlier_event.safe_payload ->> 'week' = target.safe_payload ->> 'week'
                and (earlier_delivery.status in ('sent', 'delivered')
                  or (earlier_delivery.status = 'cancelled'
                    and earlier_delivery.stable_error_code = 'possibly_sent'))
            ))
          else false
        end
      order by profile.id
      limit batch_limit
    ),
    rendered as (
      select audience.user_id, audience.language, template.id as template_id, template.category,
        template.title_template, template.body_template, template.required_variables,
        case target.event_type::text
          when 'round_preview' then jsonb_build_object('round', coalesce(
            target.safe_payload -> 'round' ->> 'number', target.safe_payload -> 'round' ->> 'name'))
          when 'match_starting' then jsonb_build_object(
            'home_team', coalesce(target.safe_payload -> 'fixture' -> 'home' -> 'name' ->> audience.language::text, ''),
            'away_team', coalesce(target.safe_payload -> 'fixture' -> 'away' -> 'name' ->> audience.language::text, ''),
            'minutes', coalesce(target.safe_payload ->> 'minutes', '60'))
          when 'deadline_24h' then jsonb_build_object(
            'gameweek', target.safe_payload -> 'gameweek' ->> 'sequence',
            'deadline', to_char(
              ((target.safe_payload ->> 'deadlineAt')::timestamptz) at time zone audience.timezone,
              'DD/MM HH24:MI'))
          when 'gameweek_finalized' then jsonb_build_object(
            'gameweek', target.safe_payload ->> 'gameweek',
            'points', target.safe_payload ->> 'points')
          when 'pepites_weekly' then jsonb_build_object('week', target.safe_payload ->> 'week')
          else '{}'::jsonb
        end as variables
      from audience
      join app.notification_templates template
        on template.template_key = target.event_type::text
       and template.channel = 'in_app'
       and template.language = audience.language
       and template.active
    ),
    inserted as (
      insert into app.notifications (
        user_id, event_id, template_id, notification_type, category, priority, language,
        title, body, deep_link_target, deep_link_entity_id, source_domain, source_entity_id,
        available_at
      )
      select rendered.user_id, target.id, rendered.template_id, target.event_type, rendered.category,
        'normal', rendered.language,
        app_private.render_notification_template(rendered.title_template, rendered.required_variables, rendered.variables),
        app_private.render_notification_template(rendered.body_template, rendered.required_variables, rendered.variables),
        case target.event_type::text
          when 'match_starting' then 'match_detail'
          when 'deadline_24h' then 'fantasy_transfers'
          when 'gameweek_finalized' then 'fantasy_points'
          else 'none'
        end::app.notification_deep_link_target,
        case when target.event_type = 'match_starting' then target.source_entity_id end,
        target.source_domain, target.source_entity_id, p_now
      from rendered
      on conflict (event_id, user_id) do nothing
      returning id
    ),
    in_app as (
      insert into app.notification_deliveries (
        notification_id, channel, provider_key, status, attempt_count, sent_at, delivered_at
      )
      select id, 'in_app', 'database', 'delivered', 1, p_now, p_now from inserted
      on conflict do nothing
      returning 1
    ),
    email as (
      insert into app.notification_deliveries (notification_id, channel, provider_key, status)
      select id, 'email', 'resend', 'pending' from inserted
      on conflict do nothing
      returning 1
    )
    select
      (select count(*) from audience),
      (select count(*) from email),
      (select audience.user_id from audience order by audience.user_id desc limit 1)
    into batch_audience, created_count, last_user;

    budget := budget - greatest(created_count, 0);
    total_created := total_created + created_count;

    if batch_audience < batch_limit then
      update app_private.notification_fanout_runs set
        status = 'completed',
        checkpoint_user_id = coalesce(last_user, checkpoint_user_id),
        audience_count = audience_count + batch_audience,
        notifications_created = notifications_created + created_count,
        deliveries_queued = deliveries_queued + created_count,
        completed_at = p_now,
        claimed_at = null,
        claim_expires_at = null
      where event_id = target.id;
      update app_private.notification_events set
        status = 'completed', completed_at = greatest(p_now, received_at)
      where id = target.id;
      completed := completed + 1;
    else
      update app_private.notification_fanout_runs set
        checkpoint_user_id = last_user,
        audience_count = audience_count + batch_audience,
        notifications_created = notifications_created + created_count,
        deliveries_queued = deliveries_queued + created_count
      where event_id = target.id;
    end if;
  end loop;

  return jsonb_build_object('created', total_created, 'cancelled', cancelled, 'completed', completed);
end;
$$;

-- ---------------------------------------------------------------------------
-- Claim: as in 20260924140100, plus the Pépites checks, the 23-hour rule,
-- the first claim time, the body hash and the unsubscribe topic
-- ---------------------------------------------------------------------------
create or replace function api.service_claim_email_deliveries(
  p_limit integer default 20,
  p_lease_seconds integer default 180
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings app_private.notification_email_settings%rowtype;
  pepites_mode text;
  quota jsonb;
  allowance integer;
  result jsonb;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'notification_access_denied';
  end if;
  if p_limit not between 1 and 100 or p_lease_seconds not between 30 and 600 then
    raise exception using errcode = 'PT400', message = 'invalid_notification_delivery';
  end if;
  -- One claim at a time, so two overlapping dispatcher passes cannot both
  -- spend the same remaining quota.
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended('botolago:notification-email-claim', 0));
  select * into settings from app_private.notification_email_settings where id;
  if settings.mode = 'off' then
    return '[]'::jsonb;
  end if;
  select pepites.mode into pepites_mode from app_private.pepites_settings pepites where pepites.id;

  -- Pépites mail is sent only to readers still opted in, while Pépites is
  -- public and the edition is still the week's published one. Otherwise it
  -- is cancelled with the reason, never sent.
  update app.notification_deliveries delivery set
    status = 'cancelled',
    stable_error_code = case
      when not preference.pepites_weekly_email then 'pepites_opted_out'
      when coalesce(pepites_mode, 'off') <> 'public' then 'pepites_unavailable'
      else 'pepites_edition_not_current'
    end,
    next_retry_at = null,
    claimed_at = null,
    claim_expires_at = null
  from app.notifications notification
  join app.user_preferences preference on preference.user_id = notification.user_id
  where delivery.notification_id = notification.id
    and notification.notification_type = 'pepites_weekly'
    and delivery.channel = 'email' and delivery.provider_key = 'resend'
    and (delivery.status in ('pending', 'retry_scheduled')
      or (delivery.status = 'claimed' and delivery.claim_expires_at < statement_timestamp()))
    and (not preference.pepites_weekly_email
      or coalesce(pepites_mode, 'off') <> 'public'
      or not exists (
        select 1 from app.pepites_editions edition
        where edition.id = notification.source_entity_id and edition.status = 'published'
      ));

  -- The provider keeps an idempotency key for 24 hours. A send whose outcome
  -- is unknown (timeout, network error, provider error, still in progress,
  -- or a pass that claimed it and never recorded) is retried under the same
  -- key only while its first claim is under 23 hours old: after that the
  -- same key could send a second email. It is closed as possibly_sent.
  update app.notification_deliveries delivery set
    status = 'cancelled',
    stable_error_code = 'possibly_sent',
    next_retry_at = null,
    claimed_at = null,
    claim_expires_at = null
  where delivery.channel = 'email' and delivery.provider_key = 'resend'
    and (delivery.status in ('pending', 'retry_scheduled')
      or (delivery.status = 'claimed' and delivery.claim_expires_at < statement_timestamp()))
    and coalesce(delivery.first_claimed_at, (
      select min(attempt.attempted_at) from app_private.notification_delivery_attempts attempt
      where attempt.delivery_id = delivery.id
    )) <= statement_timestamp() - interval '23 hours'
    and (
      delivery.status = 'claimed'
      or exists (
        select 1 from app_private.notification_delivery_attempts attempt
        where attempt.delivery_id = delivery.id
          and attempt.outcome = 'retryable_failure'
          and attempt.stable_error_code in (
            'delivery_timeout', 'delivery_network_error', 'delivery_provider_error', 'delivery_in_progress')
      )
    );

  -- Waiting mail that is no longer wanted or no longer timely is cancelled,
  -- never sent: the user unsubscribed or switched the topic off, the account
  -- lost its confirmed email, or the moment has passed. That includes mail a
  -- pass claimed and then abandoned (its lease expired unrecorded).
  update app.notification_deliveries delivery set
    status = 'cancelled',
    stable_error_code = 'email_no_longer_eligible',
    next_retry_at = null,
    claimed_at = null,
    claim_expires_at = null
  from app.notifications notification
  join app_private.notification_events event on event.id = notification.event_id
  join app.user_preferences preference on preference.user_id = notification.user_id
  join app.profiles profile on profile.id = notification.user_id
  left join auth.users auth_user on auth_user.id = notification.user_id
  where delivery.notification_id = notification.id
    and delivery.channel = 'email' and delivery.provider_key = 'resend'
    and (delivery.status in ('pending', 'retry_scheduled')
      or (delivery.status = 'claimed' and delivery.claim_expires_at < statement_timestamp()))
    and (
      profile.deleted_at is not null
      or not preference.notifications_enabled
      or not preference.email_notifications_enabled
      or auth_user.id is null or auth_user.email is null or auth_user.email_confirmed_at is null
      or auth_user.deleted_at is not null
      or (notification.notification_type in ('matchday_preview', 'matchday_results', 'round_preview', 'match_starting')
        and not preference.match_alerts)
      or (notification.notification_type in ('deadline_24h', 'gameweek_finalized')
        and not preference.fantasy_deadline_reminders)
      -- The kick-off alert is for fans only: still a favourite, followed or
      -- subscribed club (or match) now, not just when the alert was queued.
      or (notification.notification_type = 'match_starting' and not exists (
        select 1 from app.fixtures fixture
        where fixture.id = notification.source_entity_id
          and (preference.favorite_team_id in (fixture.home_team_id, fixture.away_team_id)
            or exists (select 1 from app.followed_teams followed
              where followed.user_id = notification.user_id
                and followed.team_id in (fixture.home_team_id, fixture.away_team_id))
            or exists (select 1 from app.notification_subscriptions subscription
              where subscription.user_id = notification.user_id and subscription.enabled
                and (subscription.fixture_id = fixture.id
                  or subscription.team_id in (fixture.home_team_id, fixture.away_team_id))))))
      or app_private.notification_email_event_is_stale(event, statement_timestamp())
    );

  quota := app_private.notification_email_quota(statement_timestamp());
  if quota ->> 'pausedUntil' is not null then
    return '[]'::jsonb;
  end if;
  -- dailyRemaining already leaves out the account-email reserve, for every
  -- type: Pépites never spends it.
  allowance := least(p_limit, (quota ->> 'dailyRemaining')::integer,
    (quota ->> 'monthlyRemaining')::integer);
  if allowance <= 0 then
    return '[]'::jsonb;
  end if;

  -- When the allowance is short, retries go first, then the most
  -- time-critical mail; within a kind, the order is a stable shuffle so the
  -- same readers are not always the ones left waiting. Pépites comes last.
  with claimable as (
    select delivery.id
    from app.notification_deliveries delivery
    join app.notifications notification on notification.id = delivery.notification_id
    where delivery.channel = 'email' and delivery.provider_key = 'resend'
      and ((delivery.status in ('pending', 'retry_scheduled')
          and coalesce(delivery.next_retry_at, delivery.created_at) <= statement_timestamp())
        or (delivery.status = 'claimed' and delivery.claim_expires_at < statement_timestamp()))
      and (settings.mode = 'live' or notification.user_id = any(settings.test_user_ids))
    order by
      -- Mail already attempted goes first, so an attempt whose outcome was
      -- unknown is resolved inside the provider's 24-hour idempotency window.
      delivery.attempt_count > 0 desc,
      case notification.notification_type::text
        when 'match_starting' then 1
        when 'deadline_24h' then 2
        when 'matchday_preview' then 3
        when 'matchday_results' then 4
        when 'gameweek_finalized' then 5
        when 'round_preview' then 6
        when 'pepites_weekly' then 8
        else 7
      end,
      md5(delivery.id::text)
    for update of delivery skip locked
    limit allowance
  ),
  claimed as (
    update app.notification_deliveries delivery set
      status = 'claimed',
      claimed_at = statement_timestamp(),
      claim_expires_at = statement_timestamp() + make_interval(secs => p_lease_seconds),
      attempt_count = delivery.attempt_count + 1,
      first_claimed_at = coalesce(delivery.first_claimed_at, statement_timestamp())
    from claimable
    where delivery.id = claimable.id
    returning delivery.id, delivery.notification_id, delivery.attempt_count, delivery.first_claimed_at
  ),
  tokened as materialized (
    select claimed.*, notification.user_id,
      case when notification.notification_type = 'pepites_weekly' then 'pepites_weekly' end as topic,
      app_private.notification_email_unsubscribe_token(claimed.id) as token
    from claimed
    join app.notifications notification on notification.id = claimed.notification_id
  ),
  stored as (
    insert into app_private.notification_email_unsubscribe_tokens (token_hash, user_id, delivery_id, expires_at, topic)
    select extensions.digest(tokened.token, 'sha256'), tokened.user_id, tokened.id,
      statement_timestamp() + interval '365 days', tokened.topic
    from tokened
    on conflict (token_hash) do update set expires_at = excluded.expires_at
    returning 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', tokened.id,
      'notificationId', tokened.notification_id,
      'attemptNumber', tokened.attempt_count,
      'firstAttemptAt', tokened.first_claimed_at,
      -- The body the first attempt sent, when it recorded one: a retry must
      -- send exactly that body under the same key.
      'bodySha256', (
        select attempt.body_sha256 from app_private.notification_delivery_attempts attempt
        where attempt.delivery_id = tokened.id and attempt.body_sha256 is not null
        order by attempt.attempt_number
        limit 1
      ),
      'type', notification.notification_type,
      'language', notification.language,
      'timezone', preference.notification_timezone,
      'recipient', jsonb_build_object('email', auth_user.email, 'displayName', profile.display_name),
      'favoriteTeamId', preference.favorite_team_id,
      'unsubscribeToken', tokened.token,
      'unsubscribeTopic', tokened.topic,
      'payload', case
        when notification.notification_type = 'gameweek_finalized' then event.safe_payload || coalesce((
          select jsonb_build_object(
            'overallRank', result.overall_rank,
            'totalPoints', (
              select sum(season_result.final_score)
              from app.fantasy_team_gameweek_results season_result
              where season_result.fantasy_team_id = result.fantasy_team_id
                and season_result.state = 'final'
            )
          )
          from app.fantasy_team_gameweek_results result
          join app.fantasy_teams team on team.id = result.fantasy_team_id
          where team.user_id = tokened.user_id and result.gameweek_id = event.source_entity_id
          limit 1
        ), jsonb_build_object('overallRank', null, 'totalPoints', null))
        else event.safe_payload
      end
    ) order by tokened.id), '[]'::jsonb)
  into result
  from tokened
  join app.notifications notification on notification.id = tokened.notification_id
  join app_private.notification_events event on event.id = notification.event_id
  join app.user_preferences preference on preference.user_id = tokened.user_id
  join app.profiles profile on profile.id = tokened.user_id
  join auth.users auth_user on auth_user.id = tokened.user_id
  where (select count(*) from stored) >= 0;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Recording an attempt: as before, plus the body hash, and 'cancelled' as a
-- closing outcome (the dispatcher refused to send a changed body)
-- ---------------------------------------------------------------------------
drop function api.service_record_notification_delivery_attempt(
  uuid, text, boolean, text, text, text, integer, integer, integer, integer);

create function api.service_record_notification_delivery_attempt(
  p_delivery_id uuid,
  p_outcome text,
  p_retryable boolean,
  p_provider_message_id text default null,
  p_stable_error_code text default null,
  p_sanitized_summary text default null,
  p_provider_latency_ms integer default null,
  p_rate_limit_remaining integer default null,
  p_max_attempts integer default 5,
  p_retry_after_seconds integer default null,
  p_body_sha256 text default null
)
returns app.notification_delivery_status
language plpgsql
security definer
set search_path = ''
as $$
declare target app.notification_deliveries%rowtype; next_status app.notification_delivery_status; retry_at timestamptz;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'notification_access_denied';
  end if;
  if p_max_attempts not between 1 and 20 or p_sanitized_summary is not null and char_length(p_sanitized_summary) > 500 then
    raise exception using errcode = 'PT400', message = 'invalid_notification_delivery';
  end if;
  if p_outcome not in ('sent', 'delivered', 'retryable_failure', 'permanent_failure', 'cancelled')
    or (p_body_sha256 is not null and p_body_sha256 !~ '^[0-9a-f]{64}$')
  then
    raise exception using errcode = 'PT400', message = 'invalid_notification_delivery';
  end if;
  select * into target from app.notification_deliveries where id = p_delivery_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'notification_not_found'; end if;
  if target.status <> 'claimed' then raise exception using errcode = 'PT409', message = 'notification_duplicate'; end if;
  if p_outcome in ('sent', 'delivered') then
    next_status := case
      when p_outcome = 'delivered' then 'delivered'::app.notification_delivery_status
      else 'sent'::app.notification_delivery_status
    end;
  elsif p_outcome = 'cancelled' then
    next_status := 'cancelled';
  elsif p_retryable and target.attempt_count < p_max_attempts then
    next_status := 'retry_scheduled';
    retry_at := statement_timestamp() + make_interval(secs => coalesce(
      p_retry_after_seconds, least(3600, 15 * (2 ^ greatest(target.attempt_count - 1, 0))::integer)
    ));
  else
    next_status := 'dead_lettered';
  end if;
  insert into app_private.notification_delivery_attempts (
    delivery_id, attempt_number, provider_key, outcome, retryable,
    provider_message_id, stable_error_code, sanitized_summary,
    provider_latency_ms, rate_limit_remaining, body_sha256
  ) values (
    target.id, target.attempt_count, target.provider_key,
    p_outcome::app_private.notification_attempt_outcome, p_retryable and p_outcome <> 'cancelled',
    p_provider_message_id, p_stable_error_code, p_sanitized_summary,
    p_provider_latency_ms, p_rate_limit_remaining, p_body_sha256
  );
  update app.notification_deliveries set
    status = next_status,
    next_retry_at = retry_at,
    claimed_at = null,
    claim_expires_at = null,
    provider_message_id = p_provider_message_id,
    stable_error_code = p_stable_error_code,
    sanitized_failure_summary = p_sanitized_summary,
    sent_at = case when next_status in ('sent', 'delivered') then statement_timestamp() else sent_at end,
    delivered_at = case when next_status = 'delivered' then statement_timestamp() else delivered_at end,
    failed_at = case when next_status = 'dead_lettered' then statement_timestamp() else failed_at end
  where id = target.id;
  if next_status = 'dead_lettered' then
    insert into app_private.notification_dead_letters (
      delivery_id, provider_key, final_error_code, sanitized_summary, attempt_count, failed_at
    ) values (
      target.id, target.provider_key, coalesce(p_stable_error_code, 'delivery_permanently_failed'),
      p_sanitized_summary, target.attempt_count, statement_timestamp()
    ) on conflict (delivery_id) do nothing;
  end if;
  return next_status;
end;
$$;

revoke all on function api.service_record_notification_delivery_attempt(
  uuid, text, boolean, text, text, text, integer, integer, integer, integer, text)
  from public, anon, authenticated;
grant execute on function api.service_record_notification_delivery_attempt(
  uuid, text, boolean, text, text, text, integer, integer, integer, integer, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Unsubscribe: a Pépites token turns off only Pépites
-- ---------------------------------------------------------------------------
create or replace function api.unsubscribe_notification_email(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target app_private.notification_email_unsubscribe_tokens%rowtype;
  currently_enabled boolean;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into target
  from app_private.notification_email_unsubscribe_tokens token
  where token.token_hash = extensions.digest(p_token, 'sha256')
    and token.expires_at > statement_timestamp();
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  if target.topic = 'pepites_weekly' then
    select preference.pepites_weekly_email into currently_enabled
    from app.user_preferences preference
    where preference.user_id = target.user_id
    for update;
    if not found then
      return jsonb_build_object('status', 'invalid');
    end if;
    update app_private.notification_email_unsubscribe_tokens
    set used_at = coalesce(used_at, statement_timestamp())
    where token_hash = target.token_hash;
    if not currently_enabled then
      return jsonb_build_object('status', 'already_unsubscribed', 'topic', 'pepites_weekly');
    end if;
    -- The same waiver as below, for the same kind of write: the token turns
    -- one email off, nothing else.
    perform pg_catalog.set_config('app.mfa_step_up_waiver', 'email_unsubscribe_token', true);
    update app.user_preferences set
      pepites_weekly_email = false,
      pepites_weekly_email_changed_at = statement_timestamp()
    where user_id = target.user_id;
    perform pg_catalog.set_config('app.mfa_step_up_waiver', '', true);
    perform app_private.pepites_weekly_email_cancel_for_user(target.user_id);
    perform app_private.write_notification_audit(
      'pepites_weekly_email_opt_out', target.user_id,
      p_metadata := jsonb_build_object('source', 'email_link')
    );
    return jsonb_build_object('status', 'unsubscribed', 'topic', 'pepites_weekly');
  end if;

  select preference.email_notifications_enabled into currently_enabled
  from app.user_preferences preference
  where preference.user_id = target.user_id
  for update;
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  update app_private.notification_email_unsubscribe_tokens
  set used_at = coalesce(used_at, statement_timestamp())
  where token_hash = target.token_hash;

  if not currently_enabled then
    return jsonb_build_object('status', 'already_unsubscribed');
  end if;

  -- The token, not the session, authorises this one write, and it only turns
  -- e-mail off. The mark exempts it from the MFA step-up
  -- (app_private.refuse_unverified_mfa_actor) and is cleared straight after.
  perform pg_catalog.set_config('app.mfa_step_up_waiver', 'email_unsubscribe_token', true);
  update app.user_preferences set email_notifications_enabled = false
  where user_id = target.user_id;
  perform pg_catalog.set_config('app.mfa_step_up_waiver', '', true);

  update app.notification_deliveries delivery set
    status = 'cancelled', stable_error_code = 'email_unsubscribed', next_retry_at = null,
    claimed_at = null, claim_expires_at = null
  from app.notifications notification
  where delivery.notification_id = notification.id
    and notification.user_id = target.user_id
    and delivery.channel = 'email'
    and (delivery.status in ('pending', 'retry_scheduled')
      or (delivery.status = 'claimed' and delivery.claim_expires_at < statement_timestamp()));
  perform app_private.write_notification_audit(
    'notification_email_unsubscribed', target.user_id,
    p_metadata := jsonb_build_object('source', 'email_link')
  );
  return jsonb_build_object('status', 'unsubscribed');
end;
$$;

-- ---------------------------------------------------------------------------
-- Opt in and out (signed in)
-- ---------------------------------------------------------------------------
create function app_private.pepites_weekly_email_cancel_for_user(p_user_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cancelled integer;
begin
  update app.notification_deliveries delivery set
    status = 'cancelled', stable_error_code = 'pepites_opted_out', next_retry_at = null,
    claimed_at = null, claim_expires_at = null
  from app.notifications notification
  where delivery.notification_id = notification.id
    and notification.user_id = p_user_id
    and notification.notification_type = 'pepites_weekly'
    and delivery.channel = 'email'
    and (delivery.status in ('pending', 'retry_scheduled')
      or (delivery.status = 'claimed' and delivery.claim_expires_at < statement_timestamp()));
  get diagnostics v_cancelled = row_count;
  return v_cancelled;
end;
$$;

-- The preference, and whether email can reach the account at all, so the
-- page can say why nothing arrives.
create function api.my_pepites_weekly_email()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  preference app.user_preferences%rowtype;
  auth_user auth.users%rowtype;
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  select * into preference from app.user_preferences where user_id = current_user_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'notification_not_found';
  end if;
  select * into auth_user from auth.users where id = current_user_id;
  return jsonb_build_object(
    'enabled', preference.pepites_weekly_email,
    'changedAt', preference.pepites_weekly_email_changed_at,
    'emailReachable', preference.notifications_enabled and preference.email_notifications_enabled
      and auth_user.email is not null and auth_user.email_confirmed_at is not null
      and not coalesce(auth_user.is_anonymous, false),
    'blockers', to_jsonb(array_remove(array[
      case when coalesce(auth_user.is_anonymous, false) then 'guest_account' end,
      case when auth_user.email is null or auth_user.email_confirmed_at is null then 'email_unconfirmed' end,
      case when not preference.notifications_enabled then 'notifications_off' end,
      case when not preference.email_notifications_enabled then 'email_off' end
    ], null))
  );
end;
$$;

create function api.set_my_pepites_weekly_email(p_enabled boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  currently_enabled boolean;
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  if p_enabled is null then
    raise exception using errcode = 'PT400', message = 'invalid_notification_preference';
  end if;
  if exists (select 1 from auth.users auth_user where auth_user.id = current_user_id
    and coalesce(auth_user.is_anonymous, false))
  then
    raise exception using errcode = 'PT403', message = 'notification_access_denied';
  end if;
  select preference.pepites_weekly_email into currently_enabled
  from app.user_preferences preference
  where preference.user_id = current_user_id
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'notification_not_found';
  end if;
  -- Idempotent: the same value again changes nothing and records nothing.
  if currently_enabled is distinct from p_enabled then
    perform app_private.assert_notification_user_rate_limit(
      current_user_id, 'pepites_weekly_email_changed', 20, interval '1 hour'
    );
    update app.user_preferences set
      pepites_weekly_email = p_enabled,
      pepites_weekly_email_changed_at = statement_timestamp()
    where user_id = current_user_id;
    if not p_enabled then
      perform app_private.pepites_weekly_email_cancel_for_user(current_user_id);
    end if;
    perform app_private.write_notification_audit(
      case when p_enabled then 'pepites_weekly_email_opt_in' else 'pepites_weekly_email_opt_out' end,
      current_user_id, p_metadata := jsonb_build_object('source', 'app')
    );
  end if;
  return api.my_pepites_weekly_email();
end;
$$;

-- ---------------------------------------------------------------------------
-- Report: one edition's deliveries (the admin wrapper, protected by
-- pepites.publish, comes with the API migration)
-- ---------------------------------------------------------------------------
create function app_private.pepites_email_report(p_edition_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with deliveries as (
    select delivery.status, delivery.stable_error_code, delivery.next_retry_at
    from app.notifications notification
    join app.notification_deliveries delivery
      on delivery.notification_id = notification.id and delivery.channel = 'email'
    where notification.notification_type = 'pepites_weekly'
      and notification.source_entity_id = p_edition_id
  )
  select pg_catalog.jsonb_build_object(
    'editionId', p_edition_id,
    'event', (
      select pg_catalog.jsonb_build_object('status', event.status, 'occurredAt', event.occurred_at,
        'errorCode', event.sanitized_error_code)
      from app_private.notification_events event
      where event.event_type = 'pepites_weekly' and event.source_entity_id = p_edition_id
      order by event.received_at desc
      limit 1
    ),
    'total', (select count(*) from deliveries),
    'queued', (select count(*) from deliveries where status in ('pending', 'retry_scheduled', 'claimed')),
    'sent', (select count(*) from deliveries where status in ('sent', 'delivered')),
    -- Waiting for the next day's allowance: released by a quota pause, or
    -- due later than now.
    'deferred', (select count(*) from deliveries
      where status in ('pending', 'retry_scheduled') and next_retry_at > statement_timestamp()),
    'expired', (select count(*) from deliveries
      where status = 'cancelled' and stable_error_code = 'email_no_longer_eligible'),
    'possiblySent', (select count(*) from deliveries
      where status = 'cancelled' and stable_error_code = 'possibly_sent'),
    'failed', (select count(*) from deliveries where status in ('failed', 'dead_lettered')),
    'cancelled', coalesce((
      select pg_catalog.jsonb_object_agg(code, n)
      from (
        select coalesce(stable_error_code, 'unknown') as code, count(*) as n
        from deliveries
        where status = 'cancelled' and coalesce(stable_error_code, '') not in ('possibly_sent', 'email_no_longer_eligible')
        group by 1
      ) cancelled
    ), '{}'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function app_private.pepites_weekly_email_allowed(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_weekly_email_payload(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_weekly_email_cancel(uuid, text) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_weekly_email_cancel_for_user(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_email_report(uuid) from public, anon, authenticated, service_role;
revoke all on function api.my_pepites_weekly_email() from public, anon, service_role;
revoke all on function api.set_my_pepites_weekly_email(boolean) from public, anon, service_role;
grant execute on function api.my_pepites_weekly_email() to authenticated;
grant execute on function api.set_my_pepites_weekly_email(boolean) to authenticated;
