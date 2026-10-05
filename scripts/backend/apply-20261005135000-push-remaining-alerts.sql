-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261005135000_push_remaining_alerts: the other four push
-- moments (the 1-hour Fantasy deadline, the final score, goals, and the
-- "goal cancelled" correction). It adds their text in French and Arabic (and a
-- second edition of the goal text that names the match), the planner that
-- creates them (app_private.notification_push_plan), a staleness check and two
-- small helpers, and replaces the fan-out and the one-minute tick of
-- 20261005110000 so they handle the new moments.
--
-- WHEN
--   After the pull request that adds this file is merged AND AFTER
--   20261005100000 (push claim), 20261005110000 (fan-out and tick) and
--   20261005120000 (the goal_cancelled type) have been applied and SAVED. Any
--   quiet moment; not at minute 12 of an hour (the Fantasy season
--   orchestrator). Nothing a reader can see changes: the tick still returns at
--   once while the push switch is OFF, and this script REFUSES to run if the
--   switch is not off.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Make sure no other database work is running right now
--      (AGENTS.md, "Before writing": no GitHub Actions run in progress, no
--      pg_cron job mid-run, no other query running).
--   2. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one
--      transaction, checked, and then ROLLED BACK. The result row should say
--      "Rehearsal passed".
--   3. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied".
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, or where the push switch is on, or where any of the
--     objects it creates already exists, or where the pieces it builds on are
--     missing (the claim, the fan-out and tick, the new type, the email
--     planner's helpers and the Fantasy tables);
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result without saving anything: the new functions and the
--     replaced ones can be run by the database owner only, the new texts exist
--     and the old goal text is retired, the new type is pushed under match
--     alerts, the push switch is still one row, off, the job is still scheduled
--     once a minute, and, in a step that is rolled back with a deliberate
--     error, the tick answers "off", the planner runs against today's real
--     data and the fan-out runs without error.
--   Turning push on is a separate, later step
--   (app_private.notification_push_configure) and needs the sender's secrets
--   and the Edge Function deployed first.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  missing text[] := '{}';
  needed text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261005135000') then
    raise exception 'stop: migration 20261005135000 is already recorded as applied';
  end if;
  if to_regclass('app_private.notification_push_settings') is null
    or to_regprocedure('api.service_claim_push_deliveries(integer,integer)') is null then
    raise exception 'stop: the push claim (20261005100000) is not applied yet';
  end if;
  if to_regprocedure('app_private.notification_push_tick()') is null
    or to_regprocedure('app_private.notification_push_fanout(timestamptz,text,uuid[],timestamptz,text,timestamptz,integer)') is null
    or not exists (select 1 from cron.job where jobname = 'notification-push-tick') then
    raise exception 'stop: the push fan-out and tick (20261005110000) are not applied yet';
  end if;
  if not exists (select 1 from pg_enum e where e.enumtypid = 'app.notification_type'::regtype
      and e.enumlabel = 'goal_cancelled') then
    raise exception 'stop: the goal_cancelled type (20261005120000) is not applied and saved yet';
  end if;
  if (select mode from app_private.notification_push_settings where id) is distinct from 'off' then
    raise exception 'stop: push is switched on; switch it off (app_private.notification_push_configure(''off'')) before applying this';
  end if;
  foreach needed in array array[
    'app.notification_templates', 'app.notifications', 'app.notification_deliveries',
    'app.notification_subscriptions', 'app.followed_teams', 'app.device_registrations',
    'app_private.push_destinations', 'app_private.notification_events', 'app.user_preferences',
    'app.profiles', 'app.fixtures', 'app.seasons', 'app.match_events',
    'app.fantasy_gameweeks', 'app.fantasy_seasons', 'app.fantasy_fixture_assignments'
  ] loop
    if to_regclass(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the tables this builds on are missing: %', missing;
  end if;
  foreach needed in array array[
    'app_private.notification_email_plan(timestamptz)',
    'app_private.notification_email_enqueue(app.notification_type,app.notification_source_domain,uuid,text,jsonb,timestamptz)',
    'app_private.notification_email_fixture_json(uuid)',
    'app_private.notification_email_team_json(uuid)',
    'app_private.notification_email_event_is_stale(app_private.notification_events,timestamptz)',
    'app_private.fantasy_kickoff_confirmed(timestamptz)',
    'app_private.invoke_scheduled_function(text,text,jsonb)',
    'app_private.defer_for_quiet_hours(timestamptz,text,boolean,time without time zone,time without time zone,boolean)',
    'app_private.render_notification_template(text,text[],jsonb)',
    'app_private.notification_push_topic(text)',
    'app_private.notification_push_ttl(text)',
    'app_private.notification_push_rank(text)'
  ] loop
    if to_regprocedure(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the functions this builds on are missing: %', missing;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and p.proname in ('notification_push_plan', 'notification_push_event_is_stale',
        'notification_push_fixture_followed', 'notification_push_goal_alert_reached')) then
    raise exception 'stop: one of the functions this adds already exists';
  end if;
  if exists (select 1 from app.notification_templates
    where (template_key = 'goal' and version >= 2)
      or template_key in ('goal_cancelled', 'deadline_1h')) then
    raise exception 'stop: one of the texts this adds already exists';
  end if;
  if (select count(*) from app.notification_templates
      where template_key = 'goal' and channel = 'in_app' and version = 1 and active) <> 2 then
    raise exception 'stop: the first goal text is not active in both languages, as this expects';
  end if;
  if exists (select 1 from app.notifications where notification_type = 'goal') then
    raise exception 'stop: a goal notification already exists, so the first goal text is in use -- review before replacing it';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20261005135000, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261005135000',
  'push_remaining_alerts',
  array[$bg_20261005135000_file$-- Push alerts, the remaining moments, migration 2 of 2.
--
-- Steps 1 and 2 (20261005100000, 20261005110000) gave push the two moments email
-- already plans: the kick-off reminder and the 24-hour Fantasy deadline. This
-- adds the other four, which only push uses, so push plans them itself:
--
--   * deadline_1h   an hour before a Fantasy gameweek's deadline
--   * full_time     the final score of a match someone follows
--   * goal          a goal in a match someone follows
--   * goal_cancelled the correction, to the phones that were told "goal", when
--                   the goal is ruled out (the type is added by 20261005120000)
--
-- Like the earlier steps it changes nothing a reader can see while the push
-- switch is OFF, which is how it ships: the one-minute tick returns at once.
--
-- How a goal is told and corrected (the owner's "option A", 2026-10-04):
--
--   * A goal is told as soon as the match sheet lists it and the scoreboard
--     counts it. The alert shows the scoreboard, which is what the match page
--     header shows, so the two never disagree. A goal the sheet adds late (more
--     than 8 minutes after it was stored), a goal far behind the match clock
--     (a backfill), a penalty shoot-out kick and a match that kicked off over
--     four hours ago are never told.
--   * One goal is told once, whatever happens to its row: it is named by the
--     provider's own key for it, not by the row's id, so a provider that drops
--     and re-adds an event does not cause a second alert.
--   * The ingestion deletes a goal the provider no longer reports. When a goal
--     that was told is gone from the sheet AND the scoreboard no longer counts
--     more goals than the sheet lists (so it is a real ruling, not a gap in the
--     sheet), the phones that were told get one correction, once. Phones whose
--     goal alert had not been sent yet are never told at all: it is withdrawn.
--   * A goal that is later reinstated is on the match page again but is not
--     told a second time.
--
-- Everything else is as in step 2: the same readers, devices, quiet hours (a goal
-- alert held for quiet hours is cancelled as expired, never sent late), and the
-- same one notification per reader per moment.

-- ---------------------------------------------------------------------------
-- Text. Goals get a second edition that names the match: "0–1" alone does not
-- say which side is which. The first edition was a placeholder and nothing
-- has ever been created from it.
-- ---------------------------------------------------------------------------
update app.notification_templates set
  active = false,
  retired_at = statement_timestamp()
where template_key = 'goal' and channel = 'in_app' and version = 1 and active;

insert into app.notification_templates (
  template_key, notification_type, category, channel, language, version,
  title_template, body_template, required_variables, max_title_length,
  max_body_length, active, activated_at
) values
  ('goal', 'goal', 'football', 'in_app', 'fr', 2,
    'But !', '{{team}} marque : {{home_team}} {{home_score}}–{{away_score}} {{away_team}}.',
    array['team', 'home_team', 'away_team', 'home_score', 'away_score'], 120, 500, true, statement_timestamp()),
  ('goal', 'goal', 'football', 'in_app', 'ar', 2,
    'هدف!', 'سجل {{team}}: {{home_team}} {{home_score}}–{{away_score}} {{away_team}}.',
    array['team', 'home_team', 'away_team', 'home_score', 'away_score'], 120, 500, true, statement_timestamp()),
  ('goal_cancelled', 'goal_cancelled', 'football', 'in_app', 'fr', 1,
    'But annulé', 'Le but de {{team}} dans {{home_team}} – {{away_team}} a été refusé.',
    array['team', 'home_team', 'away_team'], 120, 500, true, statement_timestamp()),
  ('goal_cancelled', 'goal_cancelled', 'football', 'in_app', 'ar', 1,
    'تم إلغاء الهدف', 'أُلغي هدف {{team}} في مباراة {{home_team}} – {{away_team}}.',
    array['team', 'home_team', 'away_team'], 120, 500, true, statement_timestamp()),
  ('deadline_1h', 'deadline_1h', 'fantasy', 'in_app', 'fr', 1,
    'Date limite Fantasy dans 1 h', 'Journée {{gameweek}} : dernière chance de valider votre équipe avant {{deadline}}.',
    array['gameweek', 'deadline'], 120, 300, true, statement_timestamp()),
  ('deadline_1h', 'deadline_1h', 'fantasy', 'in_app', 'ar', 1,
    'الموعد النهائي للفانتازي بعد ساعة', 'الجولة {{gameweek}}: آخر فرصة لتثبيت فريقك قبل {{deadline}}.',
    array['gameweek', 'deadline'], 120, 300, true, statement_timestamp());

-- ---------------------------------------------------------------------------
-- What may be pushed, how long it stays worth sending, in what order:
-- as in step 1, plus goal_cancelled (a match alert, as urgent as the goal).
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
    else interval '1 hour'
  end;
$$;

create or replace function app_private.notification_push_rank(p_type text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'goal' then 1
    when 'goal_cancelled' then 1
    when 'match_starting' then 2
    when 'deadline_1h' then 3
    when 'full_time' then 4
    when 'followed_team_result' then 5
    when 'deadline_24h' then 6
    else 7
  end;
$$;

-- ---------------------------------------------------------------------------
-- Small helpers
-- ---------------------------------------------------------------------------

-- Whether anyone has a reason to hear about this match: a favourite club, a
-- followed team or a subscription. The email planner asks the same question.
create or replace function app_private.notification_push_fixture_followed(p_fixture_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.fixtures fixture
    where fixture.id = p_fixture_id
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
  );
$$;

-- Whether a goal alert (named by its moment's deduplication key) was actually
-- sent to this reader, and, when a phone is given, to that phone. Only a phone
-- that was told "goal" is told it was cancelled.
create or replace function app_private.notification_push_goal_alert_reached(
  p_goal_key text,
  p_user_id uuid,
  p_device_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app_private.notification_events goal_event
    join app.notifications notification
      on notification.event_id = goal_event.id and notification.user_id = p_user_id
    join app.notification_deliveries delivery on delivery.notification_id = notification.id
    where goal_event.deduplication_key = p_goal_key
      and delivery.channel = 'push'
      and delivery.status in ('sent', 'delivered')
      and (p_device_id is null or delivery.device_registration_id = p_device_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- When a planned moment is no longer worth pushing. The kick-off reminder and
-- the 24-hour deadline are judged as the email dispatcher judges them; the
-- moments below by their own life (the same as notification_push_ttl).
-- ---------------------------------------------------------------------------
create or replace function app_private.notification_push_event_is_stale(
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
    when 'match_starting' then app_private.notification_email_event_is_stale(p_event, p_now)
    when 'deadline_24h' then app_private.notification_email_event_is_stale(p_event, p_now)
    when 'goal' then p_event.received_at < p_now - interval '10 minutes'
    when 'goal_cancelled' then p_event.received_at < p_now - interval '10 minutes'
    when 'full_time' then p_event.received_at < p_now - interval '30 minutes'
    when 'deadline_1h' then
      p_event.received_at < p_now - interval '30 minutes'
      or coalesce((p_event.safe_payload ->> 'deadlineAt')::timestamptz <= p_now + interval '5 minutes', true)
    else true
  end;
$$;

-- ---------------------------------------------------------------------------
-- Planner: the moments only push uses. It writes events and sends nothing.
-- ---------------------------------------------------------------------------
create or replace function app_private.notification_push_plan(p_now timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  goal_types constant app.match_event_type[] :=
    array['goal', 'own_goal', 'penalty_goal']::app.match_event_type[];
  live_states constant app.fixture_status[] :=
    array['live_first_half', 'half_time', 'live_second_half', 'extra_time', 'penalties']::app.fixture_status[];
  planned jsonb := '[]'::jsonb;
  candidate record;
  first_kickoff timestamptz;
begin
  -- 1. deadline_1h: an hour before an open or scheduled gameweek's deadline,
  --    when the deadline was not derived from a placeholder kick-off. The
  --    window is wide enough to survive a few missed ticks and narrow enough
  --    that "in 1 h" is true.
  for candidate in
    select gameweek.id, gameweek.sequence_number, gameweek.name, gameweek.deadline_at
    from app.fantasy_gameweeks gameweek
    join app.fantasy_seasons season on season.id = gameweek.fantasy_season_id
    where season.status in ('registration_open', 'active')
      and gameweek.status in ('scheduled', 'open')
      and gameweek.deadline_at > p_now + interval '50 minutes'
      and gameweek.deadline_at <= p_now + interval '65 minutes'
  loop
    select min(assignment.assigned_kickoff_at)
    into first_kickoff
    from app.fantasy_fixture_assignments assignment
    where assignment.gameweek_id = candidate.id
      and assignment.superseded_at is null
      and assignment.counts_points;
    continue when first_kickoff is null or not app_private.fantasy_kickoff_confirmed(first_kickoff);
    if app_private.notification_email_enqueue(
      'deadline_1h', 'fantasy', candidate.id, 'push:deadline_1h:' || candidate.id::text,
      jsonb_build_object(
        'gameweek', jsonb_build_object(
          'id', candidate.id, 'sequence', candidate.sequence_number, 'name', candidate.name),
        'deadlineAt', candidate.deadline_at
      ),
      p_now
    ) then
      planned := planned || jsonb_build_object('type', 'deadline_1h', 'gameweekId', candidate.id);
    end if;
  end loop;

  -- 2. full_time: a match of the current season that finished moments ago, for
  --    clubs someone follows. "Moments ago" is the row last changing in the
  --    last 20 minutes, so a result found long after the match (a backfill) is
  --    not announced.
  for candidate in
    select fixture.id
    from app.fixtures fixture
    join app.seasons season on season.id = fixture.season_id and season.is_current
    where fixture.status = 'finished'
      and fixture.kickoff_at > p_now - interval '6 hours'
      and fixture.updated_at >= p_now - interval '20 minutes'
      and app_private.notification_push_fixture_followed(fixture.id)
    order by fixture.kickoff_at, fixture.id
  loop
    if app_private.notification_email_enqueue(
      'full_time', 'football', candidate.id, 'push:full_time:' || candidate.id::text,
      jsonb_build_object('fixture', app_private.notification_email_fixture_json(candidate.id)),
      p_now
    ) then
      planned := planned || jsonb_build_object('type', 'full_time', 'fixtureId', candidate.id);
    end if;
  end loop;

  -- 3. goal: a goal the match sheet has just listed, once the scoreboard counts
  --    it, in a match someone follows. The moment is named by the provider's
  --    own key for the goal (hashed to a fixed length), so the same goal is
  --    never planned twice even if its row is deleted and added again.
  for candidate in
    select goal.id as sheet_id, goal.idempotency_key, goal.team_id, goal.event_type,
      goal.minute, goal.added_time, fixture.id as fixture_id
    from app.fixtures fixture
    join app.seasons season on season.id = fixture.season_id and season.is_current
    join app.match_events goal on goal.fixture_id = fixture.id
    where (fixture.status = any(live_states) or fixture.status = 'finished')
      and fixture.kickoff_at > p_now - interval '4 hours'
      and fixture.home_score is not null
      and goal.event_type = any(goal_types)
      and goal.period <> 'penalties'
      and goal.team_id in (fixture.home_team_id, fixture.away_team_id)
      and goal.created_at >= p_now - interval '8 minutes'
      -- the scoreboard counts this goal: at least as many goals as the sheet
      -- lists up to and including it, in the order the match page shows them
      and fixture.home_score + fixture.away_score >= (
        select count(*) from app.match_events listed
        where listed.fixture_id = fixture.id
          and listed.event_type = any(goal_types)
          and listed.period <> 'penalties'
          and (listed.minute, listed.added_time, listed.sequence_number, listed.id)
            <= (goal.minute, goal.added_time, goal.sequence_number, goal.id)
      )
      -- not a backfill: while the match is live the goal is close to its clock
      and (
        fixture.minute is null
        or not (fixture.status = any(live_states))
        or goal.minute + goal.added_time >= fixture.minute - 10
      )
      and app_private.notification_push_fixture_followed(fixture.id)
    order by goal.created_at, goal.id
  loop
    if app_private.notification_email_enqueue(
      'goal', 'football', candidate.fixture_id,
      'push:goal:' || candidate.fixture_id::text || ':' || md5(candidate.idempotency_key),
      jsonb_build_object(
        'fixture', app_private.notification_email_fixture_json(candidate.fixture_id),
        'goal', jsonb_build_object(
          'id', candidate.sheet_id,
          'idempotencyKey', candidate.idempotency_key,
          'type', candidate.event_type,
          'minute', candidate.minute,
          'addedTime', candidate.added_time,
          'team', app_private.notification_email_team_json(candidate.team_id)
        )
      ),
      p_now
    ) then
      planned := planned || jsonb_build_object('type', 'goal', 'fixtureId', candidate.fixture_id);
    end if;
  end loop;

  -- 4. goal_cancelled: a goal that was told in the last 20 minutes and is no
  --    longer on the sheet, once the scoreboard agrees (it counts no more goals
  --    than the sheet lists: a gap in the sheet, where the scoreboard still
  --    counts the goal, waits). One per match per tick, the latest first.
  for candidate in
    select distinct on (goal_event.source_entity_id)
      goal_event.id as event_id,
      goal_event.source_entity_id as fixture_id,
      goal_event.deduplication_key as goal_key,
      goal_event.safe_payload -> 'goal' as goal
    from app.fixtures fixture
    join app_private.notification_events goal_event
      on goal_event.source_domain = 'football'
     and goal_event.source_entity_id = fixture.id
     and goal_event.event_type = 'goal'
    where fixture.kickoff_at > p_now - interval '4 hours'
      and fixture.home_score is not null
      and goal_event.deduplication_key like 'push:goal:%'
      and goal_event.received_at > p_now - interval '20 minutes'
      and not exists (
        select 1 from app.match_events listed
        where listed.fixture_id = fixture.id
          and listed.idempotency_key = goal_event.safe_payload -> 'goal' ->> 'idempotencyKey'
      )
      and not exists (
        select 1 from app_private.notification_events corrected
        where corrected.deduplication_key
          = replace(goal_event.deduplication_key, 'push:goal:', 'push:goal_cancelled:')
      )
      and fixture.home_score + fixture.away_score <= (
        select count(*) from app.match_events listed
        where listed.fixture_id = fixture.id
          and listed.event_type = any(goal_types)
          and listed.period <> 'penalties'
      )
    order by goal_event.source_entity_id, goal_event.received_at desc, goal_event.id
  loop
    -- Whoever was not told yet is never told: withdraw those alerts.
    update app.notification_deliveries delivery set
      status = 'cancelled',
      stable_error_code = 'push_goal_cancelled',
      next_retry_at = null,
      claimed_at = null,
      claim_expires_at = null
    from app.notifications notification
    where notification.id = delivery.notification_id
      and notification.event_id = candidate.event_id
      and delivery.channel = 'push'
      and delivery.status in ('pending', 'retry_scheduled');

    -- Whoever was told gets one correction.
    if exists (
      select 1
      from app.notifications notification
      join app.notification_deliveries delivery on delivery.notification_id = notification.id
      where notification.event_id = candidate.event_id
        and delivery.channel = 'push'
        and delivery.status in ('sent', 'delivered')
    ) and app_private.notification_email_enqueue(
      'goal_cancelled', 'football', candidate.fixture_id,
      replace(candidate.goal_key, 'push:goal:', 'push:goal_cancelled:'),
      jsonb_build_object(
        'fixture', app_private.notification_email_fixture_json(candidate.fixture_id),
        'goal', candidate.goal
      ),
      p_now
    ) then
      planned := planned || jsonb_build_object('type', 'goal_cancelled', 'fixtureId', candidate.fixture_id);
    end if;
  end loop;

  return jsonb_build_object('planned', planned);
end;
$$;

-- ---------------------------------------------------------------------------
-- Fan-out: as in step 2, for the six moments. The kick-off reminder and the
-- 24-hour deadline are the email fan-out's moments (push waits for it); the
-- four planned above belong to push alone, so push finishes them itself.
-- ---------------------------------------------------------------------------
create or replace function app_private.notification_push_fanout(
  p_now timestamptz,
  p_mode text,
  p_test_user_ids uuid[],
  p_activated_at timestamptz,
  p_email_mode text,
  p_email_activated_at timestamptz,
  p_budget integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  push_only constant text[] := array['goal', 'goal_cancelled', 'full_time', 'deadline_1h'];
  target app_private.notification_events%rowtype;
  budget integer := greatest(p_budget, 0);
  batch_limit integer;
  batch_users integer;
  batch_queued integer;
  total_events integer := 0;
  total_users integer := 0;
  total_queued integer := 0;
  finished boolean;
  home_team uuid;
  away_team uuid;
  goal_key text;
begin
  if p_mode not in ('testers', 'live') or p_activated_at is null then
    return jsonb_build_object('events', 0, 'users', 0, 'queued', 0);
  end if;

  -- A moment of push's own whose time has passed is closed, never pushed late.
  update app_private.notification_events event set
    status = 'cancelled',
    completed_at = greatest(p_now, event.received_at),
    sanitized_error_code = 'push_window_passed'
  where event.event_type::text = any(push_only)
    and event.status in ('pending', 'processing')
    and event.received_at >= p_activated_at
    and app_private.notification_push_event_is_stale(event, p_now);

  for target in
    select event.* from app_private.notification_events event
    where event.received_at >= p_activated_at
      and (
        (
          event.event_type::text in ('match_starting', 'deadline_24h')
          and event.status in ('pending', 'processing', 'completed')
          -- After the email fan-out is done with it; or at once when email is
          -- not going to fan it out at all.
          and (
            event.status = 'completed'
            or p_email_mode = 'off'
            or p_email_activated_at is null
            or event.received_at < p_email_activated_at
          )
        )
        or (event.event_type::text = any(push_only) and event.status = 'pending')
      )
      and not app_private.notification_push_event_is_stale(event, p_now)
    order by app_private.notification_push_rank(event.event_type::text), event.received_at, event.id
  loop
    exit when budget <= 0;
    total_events := total_events + 1;

    home_team := null;
    away_team := null;
    if target.event_type::text in ('match_starting', 'goal', 'goal_cancelled', 'full_time') then
      select fixture.home_team_id, fixture.away_team_id into home_team, away_team
      from app.fixtures fixture where fixture.id = target.source_entity_id;
    end if;
    -- A correction goes only to the phones that were told the goal.
    goal_key := case when target.event_type = 'goal_cancelled'
      then replace(target.deduplication_key, 'push:goal_cancelled:', 'push:goal:') end;

    finished := false;
    loop
      exit when budget <= 0;
      batch_limit := least(budget, 500);

      with audience as (
        select profile.id as user_id, profile.preferred_language as language,
          preference.notification_timezone as timezone,
          preference.quiet_hours_enabled, preference.quiet_hours_start, preference.quiet_hours_end
        from app.profiles profile
        join app.user_preferences preference on preference.user_id = profile.id
        join auth.users auth_user on auth_user.id = profile.id
        where profile.deleted_at is null
          and preference.notifications_enabled
          and preference.push_notifications_enabled
          and auth_user.deleted_at is null
          and not coalesce(auth_user.is_anonymous, false)
          and (auth_user.banned_until is null or auth_user.banned_until < p_now)
          and (p_mode = 'live' or profile.id = any(p_test_user_ids))
          and case app_private.notification_push_topic(target.event_type::text)
            when 'match' then preference.match_alerts
            when 'fantasy' then preference.fantasy_deadline_reminders
            else false
          end
          -- Match alerts are for fans only.
          and (
            target.event_type::text not in ('match_starting', 'goal', 'full_time')
            or preference.favorite_team_id in (home_team, away_team)
            or exists (select 1 from app.followed_teams followed
              where followed.user_id = profile.id and followed.team_id in (home_team, away_team))
            or exists (select 1 from app.notification_subscriptions subscription
              where subscription.user_id = profile.id and subscription.enabled
                and (subscription.fixture_id = target.source_entity_id
                  or subscription.team_id in (home_team, away_team)))
          )
          and exists (
            select 1 from app.notification_templates template
            where template.template_key = target.event_type::text
              and template.channel = 'in_app'
              and template.language = profile.preferred_language
              and template.active
          )
          -- Someone still to do: a working device with no push for this moment
          -- yet (and, for a correction, one that was told the goal). Re-running
          -- finds nobody; a phone registered later is found.
          and exists (
            select 1
            from app.device_registrations device
            join app_private.push_destinations destination
              on destination.device_registration_id = device.id
            where device.user_id = profile.id
              and device.enabled and device.invalidated_at is null
              and device.push_provider::text in ('fcm', 'apns')
              and (
                goal_key is null
                or app_private.notification_push_goal_alert_reached(goal_key, profile.id, device.id)
              )
              and not exists (
                select 1
                from app.notification_deliveries delivery
                join app.notifications notification on notification.id = delivery.notification_id
                where notification.event_id = target.id
                  and notification.user_id = profile.id
                  and delivery.channel = 'push'
                  and delivery.device_registration_id = device.id
              )
          )
        order by profile.id
        limit batch_limit
      ),
      rendered as (
        select audience.user_id, audience.language, template.id as template_id, template.category,
          template.title_template, template.body_template, template.required_variables,
          case target.event_type::text
            when 'match_starting' then jsonb_build_object(
              'home_team', coalesce(target.safe_payload -> 'fixture' -> 'home' -> 'name' ->> audience.language::text, ''),
              'away_team', coalesce(target.safe_payload -> 'fixture' -> 'away' -> 'name' ->> audience.language::text, ''),
              'minutes', coalesce(target.safe_payload ->> 'minutes', '60'))
            when 'deadline_24h' then jsonb_build_object(
              'gameweek', target.safe_payload -> 'gameweek' ->> 'sequence',
              'deadline', to_char(
                ((target.safe_payload ->> 'deadlineAt')::timestamptz) at time zone audience.timezone,
                'DD/MM HH24:MI'))
            when 'deadline_1h' then jsonb_build_object(
              'gameweek', coalesce(target.safe_payload -> 'gameweek' ->> 'sequence', ''),
              'deadline', to_char(
                ((target.safe_payload ->> 'deadlineAt')::timestamptz) at time zone audience.timezone,
                'HH24:MI'))
            when 'goal' then jsonb_build_object(
              'team', coalesce(target.safe_payload -> 'goal' -> 'team' -> 'name' ->> audience.language::text, ''),
              'home_team', coalesce(target.safe_payload -> 'fixture' -> 'home' -> 'name' ->> audience.language::text, ''),
              'away_team', coalesce(target.safe_payload -> 'fixture' -> 'away' -> 'name' ->> audience.language::text, ''),
              'home_score', coalesce(target.safe_payload -> 'fixture' ->> 'homeScore', ''),
              'away_score', coalesce(target.safe_payload -> 'fixture' ->> 'awayScore', ''))
            when 'goal_cancelled' then jsonb_build_object(
              'team', coalesce(target.safe_payload -> 'goal' -> 'team' -> 'name' ->> audience.language::text, ''),
              'home_team', coalesce(target.safe_payload -> 'fixture' -> 'home' -> 'name' ->> audience.language::text, ''),
              'away_team', coalesce(target.safe_payload -> 'fixture' -> 'away' -> 'name' ->> audience.language::text, ''))
            when 'full_time' then jsonb_build_object(
              'home_team', coalesce(target.safe_payload -> 'fixture' -> 'home' -> 'name' ->> audience.language::text, ''),
              'away_team', coalesce(target.safe_payload -> 'fixture' -> 'away' -> 'name' ->> audience.language::text, ''),
              'home_score', coalesce(target.safe_payload -> 'fixture' ->> 'homeScore', ''),
              'away_score', coalesce(target.safe_payload -> 'fixture' ->> 'awayScore', ''))
            else '{}'::jsonb
          end as variables
        from audience
        join app.notification_templates template
          on template.template_key = target.event_type::text
         and template.channel = 'in_app'
         and template.language = audience.language
         and template.active
      ),
      -- Only for readers email did not reach: a reader who already has the
      -- moment's notification keeps that one.
      new_notifications as (
        insert into app.notifications (
          user_id, event_id, template_id, notification_type, category, priority, language,
          title, body, deep_link_target, deep_link_entity_id, source_domain, source_entity_id,
          available_at
        )
        select rendered.user_id, target.id, rendered.template_id, target.event_type, rendered.category,
          'normal', rendered.language,
          app_private.render_notification_template(rendered.title_template, rendered.required_variables, rendered.variables),
          app_private.render_notification_template(rendered.body_template, rendered.required_variables, rendered.variables),
          case
            when target.event_type::text in ('match_starting', 'goal', 'goal_cancelled', 'full_time') then 'match_detail'
            when target.event_type::text in ('deadline_24h', 'deadline_1h') then 'fantasy_transfers'
            else 'none'
          end::app.notification_deep_link_target,
          case
            when target.event_type::text in ('match_starting', 'goal', 'goal_cancelled', 'full_time')
              then target.source_entity_id
          end,
          target.source_domain, target.source_entity_id, p_now
        from rendered
        on conflict (event_id, user_id) do nothing
        returning id, user_id
      ),
      new_in_app as (
        insert into app.notification_deliveries (
          notification_id, channel, provider_key, status, attempt_count, sent_at, delivered_at
        )
        select id, 'in_app', 'database', 'delivered', 1, p_now, p_now from new_notifications
        on conflict do nothing
        returning 1
      ),
      -- The row each reader has for this moment: the one just made, or the one
      -- the email fan-out made earlier (not visible to this statement's
      -- inserts, so the two sets never overlap).
      moment as (
        select id as notification_id, user_id from new_notifications
        union all
        select notification.id, notification.user_id
        from app.notifications notification
        where notification.event_id = target.id
          and notification.user_id in (select user_id from audience)
      ),
      queued as (
        insert into app.notification_deliveries (
          notification_id, channel, device_registration_id, provider_key, status, next_retry_at
        )
        select moment.notification_id, 'push', device.id, device.push_provider::text, 'pending',
          case when quiet.until > p_now then quiet.until end
        from moment
        join audience on audience.user_id = moment.user_id
        join app.device_registrations device
          on device.user_id = moment.user_id
         and device.enabled and device.invalidated_at is null
         and device.push_provider::text in ('fcm', 'apns')
        join app_private.push_destinations destination
          on destination.device_registration_id = device.id
        cross join lateral (
          select app_private.defer_for_quiet_hours(
            p_now, audience.timezone, audience.quiet_hours_enabled,
            audience.quiet_hours_start, audience.quiet_hours_end, false
          ) as until
        ) quiet
        where goal_key is null
          or app_private.notification_push_goal_alert_reached(goal_key, moment.user_id, device.id)
        on conflict do nothing
        returning 1
      )
      select (select count(*) from audience), (select count(*) from queued)
      into batch_users, batch_queued;

      budget := budget - batch_users;
      total_users := total_users + batch_users;
      total_queued := total_queued + batch_queued;
      -- Done with this moment when the batch was not full, or when nothing
      -- could be queued (which would only repeat).
      if batch_users < batch_limit or batch_queued = 0 then
        finished := true;
        exit;
      end if;
    end loop;

    -- A moment of push's own that has been through every reader is finished.
    -- While only testers are on it stays open, so it still reaches everyone if
    -- push goes live before its time is up (it is closed when that passes).
    if finished and p_mode = 'live' and target.event_type::text = any(push_only) then
      update app_private.notification_events set
        status = 'completed',
        completed_at = greatest(p_now, received_at)
      where id = target.id and status = 'pending';
    end if;
  end loop;

  return jsonb_build_object('events', total_events, 'users', total_users, 'queued', total_queued);
end;
$$;

-- ---------------------------------------------------------------------------
-- The one-minute tick: as in step 2, and it now also plans push's own moments
-- (these have no email, so they are planned whether or not email is on).
-- ---------------------------------------------------------------------------
create or replace function app_private.notification_push_tick()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings app_private.notification_push_settings%rowtype;
  email_settings app_private.notification_email_settings%rowtype;
  started timestamptz := clock_timestamp();
  plan_result jsonb := null;
  push_plan_result jsonb := null;
  fanout_result jsonb := null;
  dispatch text := 'not_needed';
  waiting boolean;
  base_url text;
  errors text[] := '{}'::text[];
  outcome text;
  summary jsonb;
begin
  select * into settings from app_private.notification_push_settings where id;

  if settings.mode = 'off' then
    update app_private.notification_push_settings set last_tick_at = started, last_outcome = 'off'
    where id;
    return jsonb_build_object('outcome', 'off');
  end if;

  -- One tick at a time; a tick that overlaps the previous one does nothing.
  if not pg_try_advisory_xact_lock(pg_catalog.hashtextextended('botolago:notification-push-tick', 0)) then
    return jsonb_build_object('outcome', 'busy');
  end if;

  select * into email_settings from app_private.notification_email_settings where id;

  -- The email tick plans the shared moments while email is on. With email off
  -- nobody does, so push does: the planner only writes events and sends nothing.
  if email_settings.mode = 'off' then
    begin
      plan_result := app_private.notification_email_plan(started);
    exception when others then
      errors := errors || left(format('plan %s: %s', sqlstate, sqlerrm), 280);
    end;
  end if;

  -- Push's own moments: goals, results and the 1-hour deadline.
  begin
    push_plan_result := app_private.notification_push_plan(started);
  exception when others then
    errors := errors || left(format('push plan %s: %s', sqlstate, sqlerrm), 280);
  end;

  begin
    fanout_result := app_private.notification_push_fanout(
      started, settings.mode, settings.test_user_ids, settings.activated_at,
      email_settings.mode, email_settings.activated_at, 2000
    );
  exception when others then
    errors := errors || left(format('fanout %s: %s', sqlstate, sqlerrm), 280);
  end;

  -- Wake the sender only when something can be claimed now (the claim also
  -- cancels what is no longer wanted, so those count).
  select exists (
    select 1
    from app.notification_deliveries delivery
    join app.notifications notification on notification.id = delivery.notification_id
    where delivery.channel = 'push' and delivery.provider_key in ('fcm', 'apns')
      and ((delivery.status in ('pending', 'retry_scheduled')
          and coalesce(delivery.next_retry_at, delivery.created_at) <= started)
        or (delivery.status = 'claimed' and delivery.claim_expires_at < started))
      and notification.available_at <= started
      and (settings.mode = 'live' or notification.user_id = any(settings.test_user_ids))
  ) into waiting;

  if waiting then
    base_url := coalesce(settings.functions_base_url, email_settings.functions_base_url);
    if base_url is null or app_private.invoke_scheduled_function(
      base_url, 'notification-push-dispatch', '{"job":"dispatch"}'::jsonb
    ) is null then
      dispatch := 'not_configured';
    else
      dispatch := 'invoked';
    end if;
  end if;

  outcome := case
    when cardinality(errors) > 0 then 'failed'
    when dispatch = 'not_configured' then 'not_configured'
    when dispatch = 'not_needed' and coalesce((fanout_result ->> 'queued')::integer, 0) = 0 then 'idle'
    else 'succeeded'
  end;
  summary := jsonb_build_object(
    'outcome', outcome, 'plan', plan_result, 'pushPlan', push_plan_result,
    'fanout', fanout_result, 'dispatch', dispatch, 'errors', to_jsonb(errors)
  );
  update app_private.notification_push_settings set last_tick_at = started, last_outcome = outcome
  where id;
  return summary;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: owner only, like the rest of the push machinery. (Replacing a
-- function keeps its grants; the new ones get them here.)
-- ---------------------------------------------------------------------------
revoke all on function
  app_private.notification_push_fixture_followed(uuid),
  app_private.notification_push_goal_alert_reached(text, uuid, uuid),
  app_private.notification_push_event_is_stale(app_private.notification_events, timestamptz),
  app_private.notification_push_plan(timestamptz)
from public, anon, authenticated, service_role;
grant execute on function
  app_private.notification_push_fixture_followed(uuid),
  app_private.notification_push_goal_alert_reached(text, uuid, uuid),
  app_private.notification_push_event_is_stale(app_private.notification_events, timestamptz),
  app_private.notification_push_plan(timestamptz)
to postgres;

comment on function app_private.notification_push_plan(timestamptz) is
  'Plans the moments only push uses: the 1-hour Fantasy deadline, the final score and goals of matches someone follows, and the correction when a told goal is ruled out. Writes events only; sends nothing.';
comment on function app_private.notification_push_tick() is
  'Every minute: plans the kick-off and deadline moments when email will not, plans push''s own moments (goals, results, the 1-hour deadline), queues push deliveries for them, and wakes notification-push-dispatch when something can be sent. Returns at once while push is off.';
$bg_20261005135000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261005135000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261005135000'
  );
begin
  if encode(sha256(convert_to(part_20261005135000, 'UTF8')), 'hex')
    is distinct from '315ca2cd070c48a86a0ef5cf1990f4136183d8e6851775847e020f3ac32522b3' then
    raise exception 'stop: 20261005135000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261005135000;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (saves nothing of its own)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  fn text;
  who text;
  job_count integer;
  ticked jsonb;
  planned jsonb;
  fanned jsonb;
begin
  foreach fn in array array[
    'app_private.notification_push_plan(timestamptz)',
    'app_private.notification_push_event_is_stale(app_private.notification_events,timestamptz)',
    'app_private.notification_push_fixture_followed(uuid)',
    'app_private.notification_push_goal_alert_reached(text,uuid,uuid)',
    'app_private.notification_push_fanout(timestamptz,text,uuid[],timestamptz,text,timestamptz,integer)',
    'app_private.notification_push_tick()'
  ] loop
    if to_regprocedure(fn) is null then
      problems := problems || (fn || ' is missing');
      continue;
    end if;
    foreach who in array array['anon', 'authenticated', 'service_role', 'public'] loop
      if has_function_privilege(who, to_regprocedure(fn), 'execute') then
        problems := problems || (who || ' can run ' || fn);
      end if;
    end loop;
  end loop;

  if (select count(*) from app.notification_templates
      where channel = 'in_app' and active
        and ((template_key = 'goal' and version = 2)
          or (template_key in ('goal_cancelled', 'deadline_1h') and version = 1))) <> 6 then
    problems := problems || 'the six new texts are not all active'::text;
  end if;
  if exists (select 1 from app.notification_templates
      where template_key = 'goal' and channel = 'in_app' and version = 1 and active) then
    problems := problems || 'the first goal text is still active'::text;
  end if;
  if (select count(*) from app.notification_templates
      where template_key = 'goal' and channel = 'in_app' and active) <> 2 then
    problems := problems || 'goals do not have exactly one active text per language'::text;
  end if;

  if app_private.notification_push_topic('goal_cancelled') is distinct from 'match'
    or app_private.notification_push_rank('goal_cancelled') <> 1
    or app_private.notification_push_ttl('goal_cancelled') <> interval '10 minutes'
    or app_private.notification_push_topic('breaking_news') is not null
    or app_private.notification_push_topic('password_changed') is not null then
    problems := problems || 'the push rules for the new type are wrong'::text;
  end if;

  if (select count(*) from app_private.notification_push_settings) <> 1
    or (select mode from app_private.notification_push_settings) <> 'off' then
    problems := problems || 'the push switch is not one row, off'::text;
  end if;
  select count(*) into job_count from cron.job
    where jobname = 'notification-push-tick' and schedule = '* * * * *'
      and command like '%app_private.notification_push_tick()%';
  if job_count <> 1 then
    problems := problems || 'the notification-push-tick job is not scheduled once a minute'::text;
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261005135000') then
    problems := problems || 'history row missing'::text;
  end if;

  -- Each probe below writes, and is rolled back with a deliberate error, so
  -- the check leaves nothing behind. The planner runs against today's real
  -- data: it is the first time its queries run anywhere that matters.
  begin
    ticked := app_private.notification_push_tick();
    raise exception 'rollback_probe';
  exception when others then
    if sqlerrm <> 'rollback_probe' then
      problems := problems || ('the tick failed: ' || sqlerrm);
    end if;
  end;
  if ticked is distinct from '{"outcome": "off"}'::jsonb then
    problems := problems || ('the tick while off answered ' || coalesce(ticked::text, 'nothing'));
  end if;

  begin
    planned := app_private.notification_push_plan(statement_timestamp());
    raise exception 'rollback_probe';
  exception when others then
    if sqlerrm <> 'rollback_probe' then
      problems := problems || ('the planner failed: ' || sqlerrm);
    end if;
  end;
  if planned is null or jsonb_typeof(planned -> 'planned') is distinct from 'array' then
    problems := problems || ('the planner answered ' || coalesce(planned::text, 'nothing'));
  end if;

  fanned := app_private.notification_push_fanout(
    statement_timestamp(), 'off', null, null, 'off', null, 100
  );
  if fanned is distinct from '{"events": 0, "users": 0, "queued": 0}'::jsonb then
    problems := problems || ('a fan-out asked to run while off answered ' || fanned::text);
  end if;
  begin
    fanned := app_private.notification_push_fanout(
      statement_timestamp(), 'live', null, statement_timestamp() - interval '1 hour', 'off', null, 100
    );
    raise exception 'rollback_probe';
  exception when others then
    if sqlerrm <> 'rollback_probe' then
      problems := problems || ('the fan-out failed: ' || sqlerrm);
    end if;
  end;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
  raise notice 'push remaining alerts: texts in place, functions owner-only, switch still off, job every minute, the tick, the planner and the fan-out run';
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261005135000')
    then 'Applied. Goals, results and the 1-hour deadline can now be planned and queued; push is still OFF.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
