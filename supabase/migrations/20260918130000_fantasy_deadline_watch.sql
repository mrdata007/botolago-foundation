-- Fantasy deadline watch (read-only operational guard).
--
-- `api.service_sync_fantasy_calendar` already refuses placeholder kickoffs
-- (00:00:00 UTC) as authoritative and reports them per round, but nothing
-- compares that condition against the gameweek's own deadline. A gameweek that
-- was staged and opened on a placeholder-derived deadline therefore stays
-- silent until the deadline elapses, after which every automated and manual
-- repair path is illegal (`deadline_locked`, `new_deadline_in_past`,
-- `fantasy_gameweek_locked`, `current_deadline_already_passed`).
--
-- This migration is additive and read-only. It adds one STABLE service
-- function that lists scheduled/open gameweeks whose deadline is inside the
-- warning window while at least one active, counting fixture still carries an
-- unconfirmed kickoff, together with the fixture detail an operator needs for
-- scripts/backend/fantasy-realign-gameweek-calendar.sql. It never computes a
-- replacement deadline, never writes and never invents a kickoff: the placeholder
-- predicate is the existing `app_private.fantasy_kickoff_confirmed`.

create or replace function api.service_fantasy_deadline_watch(
  p_fantasy_season_id uuid default null,
  p_warn_hours integer default 72,
  p_escalate_hours integer default 24
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  season app.fantasy_seasons%rowtype;
  gw record;
  entries jsonb := '[]'::jsonb;
  affected_fixtures jsonb;
  unconfirmed integer;
  counting integer;
  first_kickoff timestamptz;
  hours numeric;
  derived boolean;
  severity text;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_warn_hours is null or p_escalate_hours is null
    or p_escalate_hours < 0 or p_warn_hours < p_escalate_hours or p_warn_hours > 720 then
    raise exception using errcode = 'PT400', message = 'fantasy_deadline_watch_window_invalid';
  end if;

  if p_fantasy_season_id is null then
    select * into season from app.fantasy_seasons
    where status in ('planned', 'registration_open', 'active')
    order by created_at desc limit 1;
  else
    select * into season from app.fantasy_seasons where id = p_fantasy_season_id;
  end if;
  if season.id is null then
    raise exception using errcode = 'PT404', message = 'fantasy_season_not_found';
  end if;

  for gw in
    select g.* from app.fantasy_gameweeks g
    where g.fantasy_season_id = season.id and g.status in ('scheduled', 'open')
    order by g.sequence_number
  loop
    select
      count(*) filter (where not app_private.fantasy_kickoff_confirmed(f.kickoff_at)),
      count(*),
      min(a.assigned_kickoff_at)
    into unconfirmed, counting, first_kickoff
    from app.fantasy_fixture_assignments a
    join app.fixtures f on f.id = a.fixture_id
    where a.gameweek_id = gw.id and a.superseded_at is null and a.counts_points;

    continue when coalesce(unconfirmed, 0) = 0;

    hours := round(extract(epoch from (gw.deadline_at - statement_timestamp()))::numeric / 3600, 2);
    continue when hours > p_warn_hours;

    -- Comparison only: the deadline currently stored equals the ruleset rule
    -- applied to a kickoff that is itself a placeholder. No new deadline is
    -- produced here and nothing is written.
    derived := first_kickoff is not null
      and not app_private.fantasy_kickoff_confirmed(first_kickoff)
      and gw.deadline_at is not distinct
        from app_private.fantasy_calculate_deadline(season.ruleset_id, first_kickoff);

    severity := case
      when gw.deadline_at - statement_timestamp() <= make_interval(hours => p_escalate_hours)
        then 'escalate' else 'info' end;

    select coalesce(jsonb_agg(jsonb_build_object(
        'fixtureId', f.id,
        'homeTeam', coalesce(ht.short_name, ht.name),
        'awayTeam', coalesce(awt.short_name, awt.name),
        'providerKickoffAt', f.kickoff_at,
        'assignedKickoffAt', a.assigned_kickoff_at,
        'originalKickoffAt', a.original_kickoff_at,
        'fixtureStatus', f.status,
        'assignmentStatus', a.assignment_status,
        'frozen', a.frozen_at is not null,
        'providerUpdatedAt', f.provider_updated_at,
        'sourceSequence', f.source_sequence
      ) order by f.kickoff_at, f.id), '[]'::jsonb)
    into affected_fixtures
    from app.fantasy_fixture_assignments a
    join app.fixtures f on f.id = a.fixture_id
    left join app.teams ht on ht.id = f.home_team_id
    left join app.teams awt on awt.id = f.away_team_id
    where a.gameweek_id = gw.id and a.superseded_at is null and a.counts_points
      and not app_private.fantasy_kickoff_confirmed(f.kickoff_at);

    entries := entries || jsonb_build_object(
      'gameweekId', gw.id,
      'sequence', gw.sequence_number,
      'status', gw.status,
      'deadlineAt', gw.deadline_at,
      'startsAt', gw.starts_at,
      'hoursToDeadline', hours,
      'deadlinePassed', gw.deadline_at <= statement_timestamp(),
      'unconfirmedFixtures', unconfirmed,
      'totalCountingFixtures', counting,
      'deadlineDerivedFromPlaceholder', derived,
      'severity', severity,
      'fixtures', affected_fixtures
    );
  end loop;

  return jsonb_build_object(
    'schemaVersion', 1,
    'seasonId', season.id,
    'seasonStatus', season.status,
    'warnHours', p_warn_hours,
    'escalateHours', p_escalate_hours,
    'serverTime', statement_timestamp(),
    'remediation', 'scripts/backend/fantasy-realign-gameweek-calendar.sql',
    'gameweeks', entries
  );
end;
$$;
revoke all on function api.service_fantasy_deadline_watch(uuid, integer, integer) from public, anon, authenticated;
grant execute on function api.service_fantasy_deadline_watch(uuid, integer, integer) to service_role;
comment on function api.service_fantasy_deadline_watch(uuid, integer, integer) is
  'Read-only service guard: scheduled/open gameweeks whose deadline is inside the warning window while an active counting fixture still carries an unconfirmed (00:00 UTC placeholder) kickoff, with the affected fixture detail. Never writes, never derives a replacement deadline.';
