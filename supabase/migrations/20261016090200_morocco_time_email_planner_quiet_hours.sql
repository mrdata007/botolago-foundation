-- The e-mail planner and quiet hours follow Morocco's clock.
--
-- WHAT WAS WRONG. Two functions turned an instant into Morocco's wall clock with
-- the databases' own `Africa/Casablanca` data, which still say UTC+1 after
-- 2026-09-20 (the app's rule is UTC+0 from 2026-09-20T01:00:00Z, 20261016090000).
--   * app_private.notification_email_plan: "match day" is the Moroccan day, the
--     match-day preview goes out at 10:00 (never before 07:00, or two hours before
--     the first kick-off when that is earlier), the results e-mail not before
--     08:00 and not after noon the next day, the round preview at 10:00 three days
--     before a round. Every one of those times came an hour early, and a kick-off
--     between 23:00 and 24:00 UTC was put in the NEXT day's e-mail.
--   * app_private.defer_for_quiet_hours: a reader's quiet hours (and the instant
--     they end) were an hour off for every reader whose zone is Africa/Casablanca,
--     which is every account's default.
-- E-mail is off and nobody has quiet hours on today; this is fixed before that
-- changes.
--
-- WHAT THIS CHANGES. Two functions, each the latest definition with only the
-- zone expressions replaced by the helpers of 20261016090000:
--   * notification_email_plan (20260924140100): the `local_zone constant
--     'Africa/Casablanca'` and its seven uses become app_private.morocco_local and
--     app_private.morocco_local_date.
--   * defer_for_quiet_hours (20260720121727): `at time zone target_timezone`
--     becomes app_private.zone_local / app_private.zone_instant, which are
--     PostgreSQL's own answer for any zone except Africa/Casablanca.
-- Signatures, volatility, security attributes, search_path and privileges are
-- unchanged. Kick-off windows (10 to 65 minutes, 24 hours) are instants and were
-- never affected.
--
-- Depends on 20261016090000 (the helpers).

do $$
begin
  if to_regprocedure('app_private.morocco_local(timestamp with time zone)') is null
    or to_regprocedure('app_private.zone_local(timestamp with time zone, text)') is null then
    raise exception 'morocco_time_helpers_missing: apply 20261016090000 first';
  end if;
end $$;

create or replace function app_private.notification_email_plan(p_now timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  local_now timestamp := app_private.morocco_local(p_now);
  today date := app_private.morocco_local_date(p_now);
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
  where app_private.morocco_local_date(fixture.kickoff_at) = today
    and fixture.status in ('scheduled', 'not_started', 'delayed')
    and app_private.fantasy_kickoff_confirmed(fixture.kickoff_at);
  if first_kickoff is not null and first_kickoff > p_now + interval '15 minutes' then
    due_local := greatest(
      today + time '07:00',
      least(today + time '10:00', app_private.morocco_local(first_kickoff) - interval '2 hours')
    );
    if local_now >= due_local then
      select coalesce(jsonb_agg(app_private.notification_email_fixture_json(fixture.id)
        order by fixture.kickoff_at, fixture.id), '[]'::jsonb)
      into fixture_payload
      from app.fixtures fixture
      join app.seasons season on season.id = fixture.season_id and season.is_current
      where app_private.morocco_local_date(fixture.kickoff_at) = today
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
  --    that was due to be played has a result. A suspended match may still
  --    resume, so it holds the email back for four hours after its kick-off;
  --    after that it is listed as interrupted. Not between 00:00 and 08:00,
  --    and not after noon the next day.
  foreach match_day in array array[today - 1, today] loop
    select
      count(*) filter (where fixture.status = 'finished'),
      count(*) filter (where (fixture.status in (
          'scheduled', 'not_started', 'delayed', 'live_first_half', 'half_time',
          'live_second_half', 'extra_time', 'penalties')
          or (fixture.status = 'suspended' and fixture.kickoff_at > p_now - interval '4 hours'))
        and app_private.fantasy_kickoff_confirmed(fixture.kickoff_at))
    into finished_count, pending_count
    from app.fixtures fixture
    join app.seasons season on season.id = fixture.season_id and season.is_current
    where app_private.morocco_local_date(fixture.kickoff_at) = match_day;

    continue when finished_count = 0 or pending_count > 0;
    continue when local_now >= (match_day + 1) + time '12:00';
    continue when local_now::time < time '08:00';

    select coalesce(jsonb_agg(app_private.notification_email_fixture_json(fixture.id)
      order by fixture.kickoff_at, fixture.id), '[]'::jsonb)
    into fixture_payload
    from app.fixtures fixture
    join app.seasons season on season.id = fixture.season_id and season.is_current
    where app_private.morocco_local_date(fixture.kickoff_at) = match_day
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
    continue when local_now < (app_private.morocco_local_date(candidate.first_kickoff) - 3) + time '10:00';
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

create or replace function app_private.defer_for_quiet_hours(
  candidate_at timestamptz,
  target_timezone text,
  quiet_enabled boolean,
  quiet_start time,
  quiet_end time,
  bypass_quiet boolean default false
)
returns timestamptz
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  local_candidate timestamp;
  local_time time;
  local_end timestamp;
begin
  perform app_private.assert_valid_timezone(target_timezone);
  if bypass_quiet or not quiet_enabled then
    return candidate_at;
  end if;
  if quiet_start is null or quiet_end is null or quiet_start = quiet_end then
    raise exception using errcode = '22023', message = 'quiet_hours_invalid';
  end if;

  local_candidate := app_private.zone_local(candidate_at, target_timezone);
  local_time := local_candidate::time;

  if quiet_start < quiet_end then
    if local_time < quiet_start or local_time >= quiet_end then
      return candidate_at;
    end if;
    local_end := local_candidate::date + quiet_end;
  else
    if local_time >= quiet_end and local_time < quiet_start then
      return candidate_at;
    end if;
    local_end := case
      when local_time >= quiet_start then local_candidate::date + interval '1 day' + quiet_end
      else local_candidate::date + quiet_end
    end;
  end if;

  return app_private.zone_instant(local_end, target_timezone);
end;
$$;

revoke all on function
  app_private.notification_email_plan(timestamptz),
  app_private.defer_for_quiet_hours(timestamptz, text, boolean, time, time, boolean)
from public, anon, authenticated, service_role;
grant execute on function
  app_private.notification_email_plan(timestamptz),
  app_private.defer_for_quiet_hours(timestamptz, text, boolean, time, time, boolean)
to postgres;
