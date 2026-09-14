-- Trusted, resumable lifecycle transitions for an already activated gameweek.
-- This creates no season, opens no registration and installs no schedule.

create table app_private.fantasy_lifecycle_transitions (
  id uuid primary key default gen_random_uuid(),
  gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete restrict,
  previous_status app.fantasy_gameweek_status not null,
  next_status app.fantasy_gameweek_status not null,
  lock_version bigint not null,
  transitioned_at timestamptz not null default statement_timestamp(),
  constraint fantasy_lifecycle_transition_version_key unique (gameweek_id, lock_version),
  constraint fantasy_lifecycle_transition_path_check check (
    (previous_status = 'open' and next_status = 'locked')
    or (previous_status = 'locked' and next_status = 'live')
    or (previous_status = 'live' and next_status = 'provisional')
  )
);
alter table app_private.fantasy_lifecycle_transitions enable row level security;
alter table app_private.fantasy_lifecycle_transitions force row level security;
revoke all on app_private.fantasy_lifecycle_transitions
  from public, anon, authenticated, service_role;

create or replace function api.service_fantasy_lifecycle_state(p_gameweek_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare target app.fantasy_gameweeks%rowtype;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  select * into target from app.fantasy_gameweeks where id = p_gameweek_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found';
  end if;
  return jsonb_build_object(
    'schemaVersion', 1, 'gameweekId', target.id,
    'seasonId', target.fantasy_season_id, 'status', target.status,
    'lockVersion', target.lock_version, 'sequenceNumber', target.sequence_number,
    'scoringInputVersion', target.scoring_input_version, 'deadlineAt', target.deadline_at,
    'serverTime', statement_timestamp(),
    'unlockedLineups', (select count(*) from app.fantasy_lineups lineup
      where lineup.gameweek_id = target.id and lineup.locked_at is null)
  );
end;
$$;

create or replace function api.service_advance_fantasy_lifecycle(
  p_gameweek_id uuid,
  p_expected_lock_version bigint,
  p_batch_size integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target app.fantasy_gameweeks%rowtype;
declare season app.fantasy_seasons%rowtype;
declare previous_status app.fantasy_gameweek_status;
declare locked_count integer := 0;
declare fixture_count integer;
declare next_status app.fantasy_gameweek_status;
declare waiting_reason text;
declare has_more boolean := false;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_gameweek_id is null or p_expected_lock_version is null
    or p_expected_lock_version < 1 or p_batch_size is null
    or p_batch_size not between 1 and 2000 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  -- A row lock serializes workers. The deadline is enforced independently by
  -- every user mutation, so bounded locking cannot extend the edit window.
  select * into target from app.fantasy_gameweeks where id = p_gameweek_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found';
  end if;
  if target.lock_version <> p_expected_lock_version then
    raise exception using errcode = 'PT409', message = 'stale_update';
  end if;
  select * into season from app.fantasy_seasons where id = target.fantasy_season_id;
  if season.status not in ('registration_open', 'active') then
    raise exception using errcode = 'PT409', message = 'fantasy_season_closed';
  end if;
  if target.status not in ('open', 'locked', 'live', 'provisional', 'finalizing', 'finalized') then
    raise exception using errcode = 'PT409', message = 'fantasy_lifecycle_not_activated';
  end if;
  previous_status := target.status;

  select count(*) into fixture_count from app.fantasy_fixture_assignments assignment
  where assignment.gameweek_id = target.id and assignment.superseded_at is null
    and assignment.counts_points;
  if fixture_count = 0 then
    raise exception using errcode = 'PT409', message = 'fantasy_fixture_assignments_missing';
  end if;
  if exists (
    select 1 from app.fantasy_fixture_assignments assignment
    join app.fixtures fixture on fixture.id = assignment.fixture_id
    where assignment.gameweek_id = target.id and assignment.superseded_at is null
      and (assignment.fantasy_season_id <> season.id
        or fixture.season_id <> season.football_season_id)
  ) then
    raise exception using errcode = 'PT409', message = 'fantasy_fixture_assignment_invalid';
  end if;

  if target.status = 'open' then
    if statement_timestamp() < target.deadline_at then
      waiting_reason := 'deadline_not_reached';
    else
      -- Never freeze a stale or exceptional assignment as if it were an
      -- approved fixture. Resolve postponements/replays through their own path.
      if exists (
        select 1 from app.fantasy_fixture_assignments assignment
        join app.fixtures fixture on fixture.id = assignment.fixture_id
        where assignment.gameweek_id = target.id and assignment.superseded_at is null
          and (not assignment.counts_points
            or assignment.assignment_status not in ('assigned', 'confirmed', 'reassigned')
            or fixture.status in ('postponed', 'cancelled', 'suspended', 'abandoned')
            or fixture.kickoff_at is distinct from assignment.assigned_kickoff_at)
      ) then
        raise exception using errcode = 'PT409', message = 'fantasy_fixture_resolution_required';
      end if;
      if exists (select 1 from app.fantasy_teams team
        where team.fantasy_season_id = season.id and team.status = 'active'
          and team.current_gameweek_id = target.id
          and not exists (select 1 from app.fantasy_lineups lineup
            where lineup.fantasy_team_id = team.id and lineup.gameweek_id = target.id)) then
        raise exception using errcode = 'PT409', message = 'fantasy_lineup_missing';
      end if;
      update app.fantasy_fixture_assignments set frozen_at = statement_timestamp()
      where gameweek_id = target.id and superseded_at is null and frozen_at is null;
      with candidates as (
        select lineup.id from app.fantasy_lineups lineup
        where lineup.gameweek_id = target.id and lineup.locked_at is null
        order by lineup.id for update limit p_batch_size
      )
      update app.fantasy_lineups lineup set locked_at = statement_timestamp()
      from candidates candidate where lineup.id = candidate.id;
      get diagnostics locked_count = row_count;
      has_more := exists (select 1 from app.fantasy_lineups lineup
        where lineup.gameweek_id = target.id and lineup.locked_at is null);
      if not has_more then next_status := 'locked'; end if;
    end if;
  elsif target.status = 'locked' then
    -- A clock reaching a scheduled kickoff does not prove the match began.
    if exists (select 1 from app.fantasy_fixture_assignments assignment
      join app.fixtures fixture on fixture.id = assignment.fixture_id
      where assignment.gameweek_id = target.id and assignment.superseded_at is null
        and assignment.counts_points
        and fixture.status in ('live_first_half', 'half_time', 'live_second_half',
          'extra_time', 'penalties', 'finished')) then
      next_status := 'live';
    else
      waiting_reason := 'football_not_started';
    end if;
  elsif target.status = 'live' then
    if not exists (select 1 from app.fantasy_fixture_assignments assignment
      join app.fixtures fixture on fixture.id = assignment.fixture_id
      where assignment.gameweek_id = target.id and assignment.superseded_at is null
        and (not assignment.counts_points or assignment.frozen_at is null
          or assignment.assignment_status not in ('assigned', 'confirmed', 'reassigned')
          or fixture.status <> 'finished' or fixture.finalized_at is null
          or fixture.finalized_at > statement_timestamp())) then
      next_status := 'provisional';
    else
      waiting_reason := 'football_not_final';
    end if;
  else
    waiting_reason := 'scoring_or_finalization_required';
  end if;

  if next_status is not null then
    update app.fantasy_gameweeks set status = next_status, lock_version = lock_version + 1
    where id = target.id returning * into target;
    insert into app_private.fantasy_lifecycle_transitions (
      gameweek_id, previous_status, next_status, lock_version
    ) values (target.id, previous_status, target.status, target.lock_version);
    if target.status = 'live' then
      update app.fantasy_seasons set status = 'active'
      where id = season.id and status = 'registration_open';
    end if;
  end if;
  return jsonb_build_object(
    'schemaVersion', 1, 'gameweekId', target.id, 'seasonId', season.id,
    'status', target.status, 'lockVersion', target.lock_version,
    'sequenceNumber', target.sequence_number, 'scoringInputVersion', target.scoring_input_version,
    'changed', next_status is not null or locked_count > 0,
    'lockedLineups', locked_count, 'hasMore', has_more,
    'waitingReason', waiting_reason
  );
end;
$$;

revoke all on function api.service_fantasy_lifecycle_state(uuid)
  from public, anon, authenticated, service_role;
revoke all on function api.service_advance_fantasy_lifecycle(uuid, bigint, integer)
  from public, anon, authenticated, service_role;
grant execute on function api.service_fantasy_lifecycle_state(uuid) to service_role;
grant execute on function api.service_advance_fantasy_lifecycle(uuid, bigint, integer) to service_role;
