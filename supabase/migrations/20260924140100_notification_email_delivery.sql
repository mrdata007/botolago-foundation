-- BotolaGO Production V2 — email notifications, part 2 of 2.
--
-- Turns the dormant Phase 5 notification pipeline into real email for six
-- moments, decided with the owner on 2026-09-24:
--
--   matchday_preview    morning of each match day (10:00 Morocco time, or two
--                       hours before the first kick-off if that is earlier)
--   matchday_results    once every match of the day has a result
--   round_preview       10:00, three days before a round's first match
--   match_starting      one hour before the user's favourite club plays
--   deadline_24h        24 hours before each Fantasy gameweek deadline
--   gameweek_finalized  when a gameweek's Fantasy points are final
--
-- How it runs:
--
--   * pg_cron job `notification-email-tick` (every 5 minutes) calls
--     app_private.notification_email_tick(), which
--       1. plans: writes one event per due moment into
--          app_private.notification_events, de-duplicated by key, so a moment
--          can only ever be planned once;
--       2. fans out: for each planned event, creates one app.notifications row
--          per eligible user plus one pending `email` delivery with provider
--          key `resend` — the (event, user) and (notification, channel)
--          unique keys make a second email for the same moment impossible;
--       3. wakes the Edge Function `notification-email-dispatch` through
--          pg_net when email deliveries are waiting.
--   * The Edge Function claims deliveries with
--     api.service_claim_email_deliveries, renders the email, sends it through
--     Resend (idempotency key = delivery id) and records the outcome with the
--     existing api.service_record_notification_delivery_attempt, which already
--     implements bounded retries and the dead-letter queue.
--   * pg_cron job `football-live-refresh` (every 15 minutes) wakes the Edge
--     Function `football-live-refresh` only while a match is on or about to
--     start, so results — and therefore the results email — arrive within
--     minutes of the final whistle instead of at the next GitHub run.
--
-- Everything ships switched OFF. app_private.notification_email_settings.mode
-- is 'off' until an operator runs app_private.notification_email_configure().
-- 'test' mode emails only the listed test accounts; 'live' emails everyone
-- eligible. The live-refresh job is off until the same function enables it.
--
-- Eligibility (checked when the delivery is created AND again when it is
-- claimed, so an unsubscribe takes effect for mail not yet sent):
--   notifications_enabled, email_notifications_enabled, a confirmed and
--   non-anonymous auth email, a non-deleted profile, and the topic switch —
--   match_alerts for the four football emails, fantasy_deadline_reminders for
--   the two Fantasy emails. match_starting additionally needs the club to be
--   the user's favourite, a followed team or a team/match subscription.
--
-- Owner decision (2026-09-24): email is ON by default for everyone. The column
-- default becomes true and existing users are switched on, except anyone who
-- has ever changed their notification preferences through
-- api.update_my_notification_preferences or unsubscribed. Every email carries
-- a one-click unsubscribe link (api.unsubscribe_notification_email).
--
-- Only events received after the first activation are ever emailed, so the
-- backlog of older notification events is never mailed out.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Settings: one row, off by default
-- ---------------------------------------------------------------------------
create table app_private.notification_email_settings (
  id boolean primary key default true,
  mode text not null default 'off',
  test_user_ids uuid[] not null default '{}',
  functions_base_url text,
  football_live_refresh_enabled boolean not null default false,
  max_emails_per_run integer not null default 250,
  activated_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  constraint notification_email_settings_singleton check (id),
  constraint notification_email_settings_mode_check check (mode in ('off', 'test', 'live')),
  constraint notification_email_settings_url_check check (
    functions_base_url is null
    or functions_base_url ~ '^https?://[A-Za-z0-9._:-]+/functions/v1$'
  ),
  constraint notification_email_settings_batch_check check (max_emails_per_run between 1 and 5000),
  constraint notification_email_settings_test_users_check check (cardinality(test_user_ids) <= 20)
);
insert into app_private.notification_email_settings (id) values (true) on conflict do nothing;

create table app_private.notification_email_heartbeat (
  id boolean primary key default true,
  last_run_at timestamptz not null,
  last_outcome text not null,
  last_summary jsonb not null default '{}'::jsonb,
  constraint notification_email_heartbeat_singleton check (id),
  constraint notification_email_heartbeat_outcome_check check (
    last_outcome in ('off', 'idle', 'succeeded', 'partial', 'failed', 'busy')
  )
);

create table app_private.notification_email_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  outcome text not null,
  summary jsonb not null default '{}'::jsonb,
  last_error text,
  constraint notification_email_runs_outcome_check check (outcome in ('succeeded', 'partial', 'failed')),
  constraint notification_email_runs_error_check check (last_error is null or char_length(last_error) <= 600)
);
create index notification_email_runs_started_idx on app_private.notification_email_runs (started_at desc);

-- Raw unsubscribe tokens only ever exist inside a sent email; the database
-- keeps their SHA-256. (They are derived from the delivery id with a key held
-- in Vault; see app_private.notification_email_unsubscribe_token.)
create table app_private.notification_email_unsubscribe_tokens (
  token_hash bytea primary key,
  user_id uuid not null references app.profiles(id) on delete cascade,
  delivery_id uuid references app.notification_deliveries(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  used_at timestamptz,
  constraint notification_email_unsubscribe_tokens_hash_check check (octet_length(token_hash) = 32),
  constraint notification_email_unsubscribe_tokens_expiry_check check (expires_at > created_at)
);
create index notification_email_unsubscribe_tokens_user_idx
  on app_private.notification_email_unsubscribe_tokens (user_id);
create index notification_email_unsubscribe_tokens_expiry_idx
  on app_private.notification_email_unsubscribe_tokens (expires_at);

alter table app_private.notification_email_settings enable row level security;
alter table app_private.notification_email_settings force row level security;
alter table app_private.notification_email_heartbeat enable row level security;
alter table app_private.notification_email_heartbeat force row level security;
alter table app_private.notification_email_runs enable row level security;
alter table app_private.notification_email_runs force row level security;
alter table app_private.notification_email_unsubscribe_tokens enable row level security;
alter table app_private.notification_email_unsubscribe_tokens force row level security;
revoke all on
  app_private.notification_email_settings,
  app_private.notification_email_heartbeat,
  app_private.notification_email_runs,
  app_private.notification_email_unsubscribe_tokens
from public, anon, authenticated, service_role;

-- Finds pending email work quickly without scanning in-app rows.
create index notification_deliveries_email_claim_idx
  on app.notification_deliveries (coalesce(next_retry_at, created_at), id)
  where channel = 'email' and status in ('pending', 'retry_scheduled', 'claimed');

-- ---------------------------------------------------------------------------
-- Scheduler token: generated inside the database, never in git. pg_cron sends
-- it to the scheduled Edge Functions, which check it with
-- api.service_verify_scheduler_token before doing anything.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'botolago_scheduler_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'botolago_scheduler_token',
      'Shared token pg_cron presents to BotolaGO scheduled Edge Functions.'
    );
  end if;
end;
$$;

-- Key for unsubscribe tokens. A token is derived from its delivery id, so a
-- retried send carries exactly the same email as the first attempt and the
-- provider's idempotency check can recognise it.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'botolago_unsubscribe_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'botolago_unsubscribe_key',
      'HMAC key for email unsubscribe tokens.'
    );
  end if;
end;
$$;

create or replace function app_private.notification_email_unsubscribe_token(p_delivery_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select translate(encode(substring(
      extensions.hmac(p_delivery_id::text, secret.decrypted_secret, 'sha256') from 1 for 24
    ), 'base64'), '+/', '-_')
  from vault.decrypted_secrets secret
  where secret.name = 'botolago_unsubscribe_key'
  limit 1;
$$;

create or replace function app_private.scheduler_token()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'botolago_scheduler_token'
  limit 1;
$$;

create or replace function api.service_verify_scheduler_token(p_token text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare expected text;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'notification_access_denied';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  expected := app_private.scheduler_token();
  return expected is not null and expected = p_token;
end;
$$;

-- ---------------------------------------------------------------------------
-- Operator switch
-- ---------------------------------------------------------------------------
create or replace function app_private.notification_email_configure(
  p_mode text,
  p_functions_base_url text default null,
  p_test_user_ids uuid[] default null,
  p_football_live_refresh_enabled boolean default null,
  p_max_emails_per_run integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare result app_private.notification_email_settings%rowtype;
begin
  if p_mode is null or p_mode not in ('off', 'test', 'live') then
    raise exception using errcode = '22023', message = 'notification_email_mode_invalid';
  end if;
  update app_private.notification_email_settings set
    mode = p_mode,
    functions_base_url = coalesce(p_functions_base_url, functions_base_url),
    test_user_ids = coalesce(p_test_user_ids, test_user_ids),
    football_live_refresh_enabled = coalesce(p_football_live_refresh_enabled, football_live_refresh_enabled),
    max_emails_per_run = coalesce(p_max_emails_per_run, max_emails_per_run),
    activated_at = case when p_mode <> 'off' then coalesce(activated_at, statement_timestamp()) else activated_at end,
    updated_at = statement_timestamp()
  where id
  returning * into result;
  perform app_private.write_notification_audit(
    'notification_email_configured', p_metadata := jsonb_build_object(
      'mode', result.mode,
      'testUsers', cardinality(result.test_user_ids),
      'functionsBaseUrlSet', result.functions_base_url is not null,
      'footballLiveRefresh', result.football_live_refresh_enabled
    )
  );
  return jsonb_build_object(
    'mode', result.mode,
    'testUserIds', to_jsonb(result.test_user_ids),
    'functionsBaseUrl', result.functions_base_url,
    'footballLiveRefreshEnabled', result.football_live_refresh_enabled,
    'maxEmailsPerRun', result.max_emails_per_run,
    'activatedAt', result.activated_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Email on by default (owner decision, 2026-09-24)
-- ---------------------------------------------------------------------------
alter table app.user_preferences alter column email_notifications_enabled set default true;

update app.user_preferences preference
set email_notifications_enabled = true
where not preference.email_notifications_enabled
  and not exists (
    select 1 from app_private.notification_operational_audit audit
    where audit.actor_user_id = preference.user_id
      and audit.event_type in ('notification_preferences_updated', 'notification_email_unsubscribed')
  );

comment on column app.user_preferences.email_notifications_enabled is
  'Product notification email. On by default since 2026-09-24 (owner decision); every email has a one-click unsubscribe link. Supabase Auth emails are separate.';

-- ---------------------------------------------------------------------------
-- In-app templates. The fan-out stores the in-app notification that carries
-- each email, and needs an active in_app template per type and language.
-- match_starting and gameweek_finalized already have theirs.
-- ---------------------------------------------------------------------------
insert into app.notification_templates (
  template_key, notification_type, category, channel, language, version,
  title_template, body_template, required_variables, max_title_length,
  max_body_length, active, activated_at
) values
  ('matchday_preview', 'matchday_preview', 'football', 'in_app', 'fr', 1,
    'Les matchs du jour', 'Le programme de Botola Pro d''aujourd''hui est disponible.',
    '{}', 120, 300, true, statement_timestamp()),
  ('matchday_preview', 'matchday_preview', 'football', 'in_app', 'ar', 1,
    'مباريات اليوم', 'برنامج مباريات البطولة الاحترافية لهذا اليوم متاح الآن.',
    '{}', 120, 300, true, statement_timestamp()),
  ('matchday_results', 'matchday_results', 'football', 'in_app', 'fr', 1,
    'Les résultats du jour', 'Tous les scores de Botola Pro d''aujourd''hui.',
    '{}', 120, 300, true, statement_timestamp()),
  ('matchday_results', 'matchday_results', 'football', 'in_app', 'ar', 1,
    'نتائج اليوم', 'جميع نتائج مباريات البطولة الاحترافية لهذا اليوم.',
    '{}', 120, 300, true, statement_timestamp()),
  ('round_preview', 'round_preview', 'football', 'in_app', 'fr', 1,
    'Journée {{round}} : le programme', 'Les dates et horaires de la journée {{round}} de Botola Pro.',
    array['round'], 120, 300, true, statement_timestamp()),
  ('round_preview', 'round_preview', 'football', 'in_app', 'ar', 1,
    'الجولة {{round}}: البرنامج', 'مواعيد مباريات الجولة {{round}} من البطولة الاحترافية.',
    array['round'], 120, 300, true, statement_timestamp()),
  ('deadline_24h', 'deadline_24h', 'fantasy', 'in_app', 'fr', 1,
    'Date limite Fantasy dans 24 h', 'Journée {{gameweek}} : validez votre équipe avant le {{deadline}}.',
    array['gameweek', 'deadline'], 120, 300, true, statement_timestamp()),
  ('deadline_24h', 'deadline_24h', 'fantasy', 'in_app', 'ar', 1,
    'الموعد النهائي للفانتازي بعد 24 ساعة', 'الجولة {{gameweek}}: ثبّت فريقك قبل {{deadline}}.',
    array['gameweek', 'deadline'], 120, 300, true, statement_timestamp());

-- ---------------------------------------------------------------------------
-- Payload builders
-- ---------------------------------------------------------------------------
create or replace function app_private.notification_email_team_json(p_team_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', team.id,
    'name', jsonb_build_object(
      'fr', coalesce(fr.name, team.name),
      'ar', coalesce(ar.name, team.name)
    ),
    'shortName', jsonb_build_object(
      'fr', coalesce(fr.short_name, fr.name, team.short_name),
      'ar', coalesce(ar.short_name, ar.name, team.short_name)
    )
  )
  from app.teams team
  left join app.team_translations fr on fr.team_id = team.id and fr.language = 'fr'
  left join app.team_translations ar on ar.team_id = team.id and ar.language = 'ar'
  where team.id = p_team_id;
$$;

create or replace function app_private.notification_email_fixture_json(p_fixture_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', fixture.id,
    'kickoffAt', fixture.kickoff_at,
    'timeConfirmed', app_private.fantasy_kickoff_confirmed(fixture.kickoff_at),
    'status', fixture.status,
    'home', app_private.notification_email_team_json(fixture.home_team_id),
    'away', app_private.notification_email_team_json(fixture.away_team_id),
    'homeScore', fixture.home_score,
    'awayScore', fixture.away_score
  )
  from app.fixtures fixture
  where fixture.id = p_fixture_id;
$$;

create or replace function app_private.notification_email_enqueue(
  p_type app.notification_type,
  p_source_domain app.notification_source_domain,
  p_source_entity_id uuid,
  p_deduplication_key text,
  p_payload jsonb,
  p_now timestamptz
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare inserted_id uuid;
begin
  insert into app_private.notification_events (
    id, event_type, source_domain, source_entity_id, target_user_id, occurred_at,
    schema_version, deduplication_key, correlation_id, safe_payload
  ) values (
    gen_random_uuid(), p_type, p_source_domain, p_source_entity_id, null,
    least(p_now, statement_timestamp()),
    1, p_deduplication_key, gen_random_uuid(), p_payload
  ) on conflict (deduplication_key) do nothing
  returning id into inserted_id;
  return inserted_id is not null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Planner: which moments are due now
-- ---------------------------------------------------------------------------
-- "Match day" and all send times are Morocco time: the league's local time.
-- A kick-off at exactly 00:00 UTC is the provider's "time not known yet"
-- placeholder (app_private.fantasy_kickoff_confirmed); such a match is shown
-- as "time to be confirmed" and never decides when an email goes out.
create or replace function app_private.notification_email_plan(p_now timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  local_zone constant text := 'Africa/Casablanca';
  local_now timestamp := p_now at time zone local_zone;
  today date := (p_now at time zone local_zone)::date;
  planned jsonb := '[]'::jsonb;
  first_kickoff timestamptz;
  due_local timestamp;
  fixture_payload jsonb;
  match_day date;
  finished_count integer;
  pending_count integer;
  candidate record;
begin
  -- 1. matchday_preview: today's matches, at 10:00 (or 2 h before the first
  --    kick-off if earlier, but never before 07:00), while one is still ahead.
  select min(fixture.kickoff_at)
  into first_kickoff
  from app.fixtures fixture
  join app.seasons season on season.id = fixture.season_id and season.is_current
  where (fixture.kickoff_at at time zone local_zone)::date = today
    and fixture.status in ('scheduled', 'not_started', 'delayed')
    and app_private.fantasy_kickoff_confirmed(fixture.kickoff_at);
  if first_kickoff is not null and first_kickoff > p_now + interval '15 minutes' then
    due_local := greatest(
      today + time '07:00',
      least(today + time '10:00', (first_kickoff at time zone local_zone) - interval '2 hours')
    );
    if local_now >= due_local then
      select coalesce(jsonb_agg(app_private.notification_email_fixture_json(fixture.id)
        order by fixture.kickoff_at, fixture.id), '[]'::jsonb)
      into fixture_payload
      from app.fixtures fixture
      join app.seasons season on season.id = fixture.season_id and season.is_current
      where (fixture.kickoff_at at time zone local_zone)::date = today
        and fixture.status in ('scheduled', 'not_started', 'delayed')
        and (fixture.kickoff_at > p_now or not app_private.fantasy_kickoff_confirmed(fixture.kickoff_at));
      if app_private.notification_email_enqueue(
        'matchday_preview', 'football', null, 'email:matchday_preview:' || today::text,
        jsonb_build_object('date', today::text, 'fixtures', fixture_payload), p_now
      ) then
        planned := planned || jsonb_build_object('type', 'matchday_preview', 'date', today);
      end if;
    end if;
  end if;

  -- 2. matchday_results: yesterday's and today's, once every match of the day
  --    that was due to be played has a result. Not between 00:00 and 08:00,
  --    and not after noon the next day.
  foreach match_day in array array[today - 1, today] loop
    select
      count(*) filter (where fixture.status = 'finished'),
      count(*) filter (where fixture.status in (
          'scheduled', 'not_started', 'delayed', 'live_first_half', 'half_time',
          'live_second_half', 'extra_time', 'penalties')
        and app_private.fantasy_kickoff_confirmed(fixture.kickoff_at))
    into finished_count, pending_count
    from app.fixtures fixture
    join app.seasons season on season.id = fixture.season_id and season.is_current
    where (fixture.kickoff_at at time zone local_zone)::date = match_day;

    continue when finished_count = 0 or pending_count > 0;
    continue when local_now >= (match_day + 1) + time '12:00';
    continue when local_now::time < time '08:00';

    select coalesce(jsonb_agg(app_private.notification_email_fixture_json(fixture.id)
      order by fixture.kickoff_at, fixture.id), '[]'::jsonb)
    into fixture_payload
    from app.fixtures fixture
    join app.seasons season on season.id = fixture.season_id and season.is_current
    where (fixture.kickoff_at at time zone local_zone)::date = match_day
      and (fixture.status in ('finished', 'postponed', 'cancelled', 'abandoned', 'suspended'));
    if app_private.notification_email_enqueue(
      'matchday_results', 'football', null, 'email:matchday_results:' || match_day::text,
      jsonb_build_object('date', match_day::text, 'fixtures', fixture_payload), p_now
    ) then
      planned := planned || jsonb_build_object('type', 'matchday_results', 'date', match_day);
    end if;
  end loop;

  -- 3. round_preview: 10:00 three days before a round's first match, for a
  --    round none of whose matches has been played yet.
  for candidate in
    select fixture.round_id, min(fixture.kickoff_at) as first_kickoff
    from app.fixtures fixture
    join app.seasons season on season.id = fixture.season_id and season.is_current
    where fixture.round_id is not null
      and fixture.status in ('scheduled', 'not_started', 'delayed')
      and app_private.fantasy_kickoff_confirmed(fixture.kickoff_at)
    group by fixture.round_id
    having min(fixture.kickoff_at) > p_now + interval '12 hours'
      and min(fixture.kickoff_at) <= p_now + interval '4 days'
  loop
    continue when exists (
      select 1 from app.fixtures played
      where played.round_id = candidate.round_id
        and played.status in ('finished', 'live_first_half', 'half_time', 'live_second_half',
          'extra_time', 'penalties')
    );
    continue when local_now < ((candidate.first_kickoff at time zone local_zone)::date - 3) + time '10:00';
    select coalesce(jsonb_agg(app_private.notification_email_fixture_json(fixture.id)
      order by fixture.kickoff_at, fixture.id), '[]'::jsonb)
    into fixture_payload
    from app.fixtures fixture
    where fixture.round_id = candidate.round_id
      and fixture.status in ('scheduled', 'not_started', 'delayed');
    if app_private.notification_email_enqueue(
      'round_preview', 'football', candidate.round_id,
      'email:round_preview:' || candidate.round_id::text,
      (
        select jsonb_build_object(
          'round', jsonb_build_object('id', round.id, 'number', round.round_number, 'name', round.name),
          'fixtures', fixture_payload
        )
        from app.rounds round where round.id = candidate.round_id
      ),
      p_now
    ) then
      planned := planned || jsonb_build_object('type', 'round_preview', 'roundId', candidate.round_id);
    end if;
  end loop;

  -- 4. match_starting: an hour before kick-off, only for matches some user
  --    cares about (favourite club, followed team or subscription).
  for candidate in
    select fixture.id, fixture.kickoff_at
    from app.fixtures fixture
    join app.seasons season on season.id = fixture.season_id and season.is_current
    where fixture.status in ('scheduled', 'not_started')
      and app_private.fantasy_kickoff_confirmed(fixture.kickoff_at)
      and fixture.kickoff_at > p_now + interval '10 minutes'
      and fixture.kickoff_at <= p_now + interval '65 minutes'
      and (
        exists (select 1 from app.user_preferences preference
          where preference.favorite_team_id in (fixture.home_team_id, fixture.away_team_id))
        or exists (select 1 from app.followed_teams followed
          where followed.team_id in (fixture.home_team_id, fixture.away_team_id))
        or exists (select 1 from app.notification_subscriptions subscription
          where subscription.enabled
            and (subscription.fixture_id = fixture.id
              or subscription.team_id in (fixture.home_team_id, fixture.away_team_id)))
      )
  loop
    if app_private.notification_email_enqueue(
      'match_starting', 'football', candidate.id, 'email:match_starting:' || candidate.id::text,
      jsonb_build_object(
        'fixture', app_private.notification_email_fixture_json(candidate.id),
        'minutes', least(60, greatest(5,
          (round(extract(epoch from (candidate.kickoff_at - p_now)) / 300) * 5)::integer))
      ),
      p_now
    ) then
      planned := planned || jsonb_build_object('type', 'match_starting', 'fixtureId', candidate.id);
    end if;
  end loop;

  -- 5. deadline_24h: 24 h before an open or scheduled gameweek's deadline,
  --    only when that deadline was not derived from a placeholder kick-off.
  for candidate in
    select gameweek.id, gameweek.sequence_number, gameweek.name, gameweek.deadline_at
    from app.fantasy_gameweeks gameweek
    join app.fantasy_seasons season on season.id = gameweek.fantasy_season_id
    where season.status in ('registration_open', 'active')
      and gameweek.status in ('scheduled', 'open')
      and gameweek.deadline_at > p_now + interval '1 hour'
      and gameweek.deadline_at <= p_now + interval '24 hours'
  loop
    select min(assignment.assigned_kickoff_at)
    into first_kickoff
    from app.fantasy_fixture_assignments assignment
    where assignment.gameweek_id = candidate.id
      and assignment.superseded_at is null
      and assignment.counts_points;
    continue when first_kickoff is null or not app_private.fantasy_kickoff_confirmed(first_kickoff);
    if app_private.notification_email_enqueue(
      'deadline_24h', 'fantasy', candidate.id, 'email:deadline_24h:' || candidate.id::text,
      jsonb_build_object(
        'gameweek', jsonb_build_object(
          'id', candidate.id, 'sequence', candidate.sequence_number, 'name', candidate.name),
        'deadlineAt', candidate.deadline_at
      ),
      p_now
    ) then
      planned := planned || jsonb_build_object('type', 'deadline_24h', 'gameweekId', candidate.id);
    end if;
  end loop;

  -- gameweek_finalized events are written by the Fantasy lifecycle
  -- (api.service_enqueue_gameweek_finalized_notifications); nothing to plan.
  return jsonb_build_object('planned', planned);
end;
$$;

-- ---------------------------------------------------------------------------
-- Fan-out: planned events -> notifications -> pending email deliveries
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
    else true
  end;
$$;

create or replace function app_private.notification_email_fanout(
  p_now timestamptz,
  p_mode text,
  p_test_user_ids uuid[],
  p_activated_at timestamptz,
  p_budget integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  email_types constant app.notification_type[] := array[
    'matchday_preview', 'matchday_results', 'round_preview',
    'match_starting', 'deadline_24h', 'gameweek_finalized'
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
-- Waking the Edge Functions
-- ---------------------------------------------------------------------------
create or replace function app_private.invoke_scheduled_function(
  p_functions_base_url text,
  p_function_name text,
  p_body jsonb
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare token text := app_private.scheduler_token();
begin
  if p_functions_base_url is null or token is null
    or p_function_name !~ '^[a-z][a-z0-9-]{2,62}$' then
    return null;
  end if;
  return net.http_post(
    url := p_functions_base_url || '/' || p_function_name,
    body := coalesce(p_body, '{}'::jsonb),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-botolago-scheduler-token', token
    ),
    timeout_milliseconds := 60000
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The 5-minute tick
-- ---------------------------------------------------------------------------
create or replace function app_private.notification_email_tick()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings app_private.notification_email_settings%rowtype;
  run_started timestamptz := clock_timestamp();
  plan_result jsonb := null;
  fanout_result jsonb := null;
  dispatch text := 'not_needed';
  errors text[] := '{}'::text[];
  outcome text;
  summary jsonb;
begin
  select * into settings from app_private.notification_email_settings where id;

  if settings.mode = 'off' then
    insert into app_private.notification_email_heartbeat (id, last_run_at, last_outcome, last_summary)
    values (true, run_started, 'off', '{}'::jsonb)
    on conflict (id) do update set last_run_at = excluded.last_run_at,
      last_outcome = excluded.last_outcome, last_summary = excluded.last_summary;
    return jsonb_build_object('outcome', 'off');
  end if;

  -- One tick at a time; a tick that overlaps the previous one does nothing.
  if not pg_try_advisory_xact_lock(pg_catalog.hashtextextended('botolago:notification-email-tick', 0)) then
    return jsonb_build_object('outcome', 'busy');
  end if;

  begin
    plan_result := app_private.notification_email_plan(run_started);
  exception when others then
    errors := errors || left(format('plan %s: %s', sqlstate, sqlerrm), 280);
  end;

  begin
    fanout_result := app_private.notification_email_fanout(
      run_started, settings.mode, settings.test_user_ids, settings.activated_at,
      settings.max_emails_per_run
    );
  exception when others then
    errors := errors || left(format('fanout %s: %s', sqlstate, sqlerrm), 280);
  end;

  begin
    if exists (
      select 1 from app.notification_deliveries delivery
      where delivery.channel = 'email' and delivery.provider_key = 'resend'
        and ((delivery.status in ('pending', 'retry_scheduled')
            and coalesce(delivery.next_retry_at, delivery.created_at) <= run_started)
          or (delivery.status = 'claimed' and delivery.claim_expires_at < run_started))
    ) then
      dispatch := case
        when app_private.invoke_scheduled_function(
          settings.functions_base_url, 'notification-email-dispatch', '{"job":"dispatch"}'::jsonb
        ) is null then 'not_configured'
        else 'invoked'
      end;
    end if;
  exception when others then
    errors := errors || left(format('dispatch %s: %s', sqlstate, sqlerrm), 280);
  end;

  summary := jsonb_build_object(
    'mode', settings.mode,
    'plan', plan_result,
    'fanout', fanout_result,
    'dispatch', dispatch
  );
  outcome := case
    when cardinality(errors) = 3 then 'failed'
    when cardinality(errors) > 0 then 'partial'
    when jsonb_array_length(coalesce(plan_result -> 'planned', '[]'::jsonb)) > 0
      or coalesce((fanout_result ->> 'created')::integer, 0) > 0
      or coalesce((fanout_result ->> 'cancelled')::integer, 0) > 0
      or dispatch <> 'not_needed' then 'succeeded'
    else 'idle'
  end;

  insert into app_private.notification_email_heartbeat (id, last_run_at, last_outcome, last_summary)
  values (true, run_started, outcome, summary)
  on conflict (id) do update set last_run_at = excluded.last_run_at,
    last_outcome = excluded.last_outcome, last_summary = excluded.last_summary;

  if outcome <> 'idle' then
    insert into app_private.notification_email_runs (started_at, finished_at, outcome, summary, last_error)
    values (
      run_started, clock_timestamp(), outcome, summary,
      case when cardinality(errors) > 0 then left(array_to_string(errors, ' | '), 600) end
    );
  end if;

  return summary || jsonb_build_object('outcome', outcome);
end;
$$;

-- ---------------------------------------------------------------------------
-- The 15-minute results refresh: only while a match is on or about to start
-- ---------------------------------------------------------------------------
create or replace function app_private.football_live_refresh_tick()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare settings app_private.notification_email_settings%rowtype;
begin
  select * into settings from app_private.notification_email_settings where id;
  if not settings.football_live_refresh_enabled or settings.functions_base_url is null then
    return 'disabled';
  end if;
  if not exists (
    select 1 from app.fixtures fixture
    join app.seasons season on season.id = fixture.season_id and season.is_current
    where fixture.kickoff_at between statement_timestamp() - interval '3 hours'
        and statement_timestamp() + interval '10 minutes'
      and app_private.fantasy_kickoff_confirmed(fixture.kickoff_at)
      and fixture.status not in ('finished', 'postponed', 'cancelled', 'abandoned')
  ) then
    return 'idle';
  end if;
  if app_private.invoke_scheduled_function(
    settings.functions_base_url, 'football-live-refresh', '{"job":"fixtures"}'::jsonb
  ) is null then
    return 'not_configured';
  end if;
  return 'invoked';
end;
$$;

-- ---------------------------------------------------------------------------
-- Dispatcher API (service role only)
-- ---------------------------------------------------------------------------
create or replace function api.service_claim_email_deliveries(
  p_limit integer default 20,
  p_lease_seconds integer default 180
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings app_private.notification_email_settings%rowtype;
  result jsonb;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'notification_access_denied';
  end if;
  if p_limit not between 1 and 100 or p_lease_seconds not between 30 and 600 then
    raise exception using errcode = 'PT400', message = 'invalid_notification_delivery';
  end if;
  select * into settings from app_private.notification_email_settings where id;
  if settings.mode = 'off' then
    return '[]'::jsonb;
  end if;

  -- Waiting mail that is no longer wanted or no longer timely is cancelled,
  -- never sent: the user unsubscribed or switched the topic off, the account
  -- lost its confirmed email, or the moment has passed.
  update app.notification_deliveries delivery set
    status = 'cancelled',
    stable_error_code = 'email_no_longer_eligible',
    next_retry_at = null
  from app.notifications notification
  join app_private.notification_events event on event.id = notification.event_id
  join app.user_preferences preference on preference.user_id = notification.user_id
  join app.profiles profile on profile.id = notification.user_id
  left join auth.users auth_user on auth_user.id = notification.user_id
  where delivery.notification_id = notification.id
    and delivery.channel = 'email' and delivery.provider_key = 'resend'
    and delivery.status in ('pending', 'retry_scheduled')
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
      or app_private.notification_email_event_is_stale(event, statement_timestamp())
    );

  with claimable as (
    select delivery.id
    from app.notification_deliveries delivery
    join app.notifications notification on notification.id = delivery.notification_id
    where delivery.channel = 'email' and delivery.provider_key = 'resend'
      and ((delivery.status in ('pending', 'retry_scheduled')
          and coalesce(delivery.next_retry_at, delivery.created_at) <= statement_timestamp())
        or (delivery.status = 'claimed' and delivery.claim_expires_at < statement_timestamp()))
      and (settings.mode = 'live' or notification.user_id = any(settings.test_user_ids))
    order by coalesce(delivery.next_retry_at, delivery.created_at), delivery.id
    for update of delivery skip locked
    limit p_limit
  ),
  claimed as (
    update app.notification_deliveries delivery set
      status = 'claimed',
      claimed_at = statement_timestamp(),
      claim_expires_at = statement_timestamp() + make_interval(secs => p_lease_seconds),
      attempt_count = delivery.attempt_count + 1
    from claimable
    where delivery.id = claimable.id
    returning delivery.id, delivery.notification_id, delivery.attempt_count
  ),
  tokened as materialized (
    select claimed.*, notification.user_id,
      app_private.notification_email_unsubscribe_token(claimed.id) as token
    from claimed
    join app.notifications notification on notification.id = claimed.notification_id
  ),
  stored as (
    insert into app_private.notification_email_unsubscribe_tokens (token_hash, user_id, delivery_id, expires_at)
    select extensions.digest(tokened.token, 'sha256'), tokened.user_id, tokened.id,
      statement_timestamp() + interval '365 days'
    from tokened
    on conflict (token_hash) do update set expires_at = excluded.expires_at
    returning 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', tokened.id,
      'notificationId', tokened.notification_id,
      'attemptNumber', tokened.attempt_count,
      'type', notification.notification_type,
      'language', notification.language,
      'timezone', preference.notification_timezone,
      'recipient', jsonb_build_object('email', auth_user.email, 'displayName', profile.display_name),
      'favoriteTeamId', preference.favorite_team_id,
      'unsubscribeToken', tokened.token,
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

create or replace function api.service_notification_email_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  settings app_private.notification_email_settings%rowtype;
  heartbeat app_private.notification_email_heartbeat%rowtype;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'notification_access_denied';
  end if;
  select * into settings from app_private.notification_email_settings where id;
  select * into heartbeat from app_private.notification_email_heartbeat where id;
  return jsonb_build_object(
    'mode', settings.mode,
    'activatedAt', settings.activated_at,
    'functionsBaseUrlSet', settings.functions_base_url is not null,
    'footballLiveRefreshEnabled', settings.football_live_refresh_enabled,
    'tickJobActive', exists (select 1 from cron.job where jobname = 'notification-email-tick' and active),
    'lastRunAt', heartbeat.last_run_at,
    'lastOutcome', heartbeat.last_outcome,
    'emailsLast24h', (
      select jsonb_object_agg(status, total) from (
        select delivery.status::text as status, count(*) as total
        from app.notification_deliveries delivery
        where delivery.channel = 'email' and delivery.provider_key = 'resend'
          and delivery.created_at >= statement_timestamp() - interval '24 hours'
        group by delivery.status
      ) counts
    ),
    'unresolvedDeadLetters', (
      select count(*) from app_private.notification_dead_letters dead
      join app.notification_deliveries delivery on delivery.id = dead.delivery_id
      where dead.resolution_status = 'unresolved' and delivery.channel = 'email'
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Unsubscribe (anyone holding a link from an email)
-- ---------------------------------------------------------------------------
create or replace function api.unsubscribe_notification_email(p_token text)
returns jsonb
language plpgsql
volatile
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

  update app.user_preferences set email_notifications_enabled = false
  where user_id = target.user_id;
  update app.notification_deliveries delivery set
    status = 'cancelled', stable_error_code = 'email_unsubscribed', next_retry_at = null
  from app.notifications notification
  where delivery.notification_id = notification.id
    and notification.user_id = target.user_id
    and delivery.channel = 'email'
    and delivery.status in ('pending', 'retry_scheduled');
  perform app_private.write_notification_audit(
    'notification_email_unsubscribed', target.user_id,
    p_metadata := jsonb_build_object('source', 'email_link')
  );
  return jsonb_build_object('status', 'unsubscribed');
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function
  app_private.scheduler_token(),
  app_private.notification_email_unsubscribe_token(uuid),
  app_private.notification_email_configure(text, text, uuid[], boolean, integer),
  app_private.notification_email_team_json(uuid),
  app_private.notification_email_fixture_json(uuid),
  app_private.notification_email_enqueue(app.notification_type, app.notification_source_domain, uuid, text, jsonb, timestamptz),
  app_private.notification_email_plan(timestamptz),
  app_private.notification_email_event_is_stale(app_private.notification_events, timestamptz),
  app_private.notification_email_fanout(timestamptz, text, uuid[], timestamptz, integer),
  app_private.invoke_scheduled_function(text, text, jsonb),
  app_private.notification_email_tick(),
  app_private.football_live_refresh_tick()
from public, anon, authenticated, service_role;
grant execute on function
  app_private.scheduler_token(),
  app_private.notification_email_unsubscribe_token(uuid),
  app_private.notification_email_configure(text, text, uuid[], boolean, integer),
  app_private.notification_email_team_json(uuid),
  app_private.notification_email_fixture_json(uuid),
  app_private.notification_email_enqueue(app.notification_type, app.notification_source_domain, uuid, text, jsonb, timestamptz),
  app_private.notification_email_plan(timestamptz),
  app_private.notification_email_event_is_stale(app_private.notification_events, timestamptz),
  app_private.notification_email_fanout(timestamptz, text, uuid[], timestamptz, integer),
  app_private.invoke_scheduled_function(text, text, jsonb),
  app_private.notification_email_tick(),
  app_private.football_live_refresh_tick()
to postgres;

revoke all on function
  api.service_verify_scheduler_token(text),
  api.service_claim_email_deliveries(integer, integer),
  api.service_notification_email_health(),
  api.unsubscribe_notification_email(text)
from public, anon, authenticated, service_role;
grant execute on function
  api.service_verify_scheduler_token(text),
  api.service_claim_email_deliveries(integer, integer),
  api.service_notification_email_health()
to service_role;
grant execute on function api.unsubscribe_notification_email(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Jobs. cron.schedule with a name replaces a job of that name, so re-applying
-- is harmless. Both jobs do nothing until notification_email_configure runs.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'notification-email-tick',
  '*/5 * * * *',
  'select app_private.notification_email_tick();'
);
select cron.schedule(
  'football-live-refresh',
  '*/15 * * * *',
  'select app_private.football_live_refresh_tick();'
);
-- Keep a week of both jobs' pg_cron history.
select cron.schedule(
  'notification-email-history-prune',
  '37 3 * * *',
  $prune$
    delete from cron.job_run_details
    where jobid in (
      select jobid from cron.job where jobname in ('notification-email-tick', 'football-live-refresh')
    )
      and end_time < now() - interval '7 days'
  $prune$
);
