-- Fantasy: postponed fixtures never anchor a deadline or block a lock, and a
-- new manager can always join the next gameweek.
--
-- WHAT WENT WRONG ON 2026-09-24 (GW1 of 2026/27)
--
--   * 04:45Z  the calendar sync re-added FAR Rabat v Raja Casablanca (an
--     operator had deferred it on 09-21) because the insert step only skips
--     cancelled/abandoned fixtures; its 15:00Z kickoff became the earliest one
--     and the deadline moved to 13:30Z.
--   * 09:57Z  the provider reported the fixture `postponed` with a placeholder
--     kickoff. The sync did not move the deadline: a counting assignment with
--     an unconfirmed kickoff freezes every window/deadline update
--     (`deadline_unconfirmed`), and postponed fixtures still counted anyway.
--     The deadline watch escalated; the only channel was a red workflow run.
--   * 13:30Z  the deadline passed 6.5 hours before the first real kickoff
--     (Amal Tiznit v Ittihad Tanger, 20:00Z).
--   * 15:03Z  `service_advance_fantasy_lifecycle` refused to lock the week
--     (`fantasy_fixture_resolution_required`) because a counting fixture was
--     postponed; `create_fantasy_team` refused every new manager
--     (`fantasy_gameweek_locked`) and no other gameweek existed to join.
--   * Round 2 could not be staged either: one of its fixtures is postponed
--     with a placeholder kickoff, and staging required every fixture of the
--     round to carry a confirmed kickoff.
--
-- THE RULE THIS MIGRATION ENCODES
--
--   A fixture the provider reports as `postponed` does not count for the
--   gameweek of its round while it is postponed. It never anchors a deadline,
--   never freezes a deadline, never blocks staging, locking or opening. Its
--   assignment is superseded with `assignment_status = 'deferred'` and the
--   new resolution `provider_postponed` (auditable, distinct from an
--   operator's manual `operator_deferred`). If the provider publishes it again
--   (not postponed, confirmed kickoff) while its gameweek is still
--   `scheduled`/`open` and unfrozen, the calendar sync assigns it again and
--   re-derives the window. Once the gameweek has locked, a deferred fixture
--   stays out of it: lineups that were valid at the deadline are never
--   re-opened or invalidated.
--
--   Deadlines keep their existing guards: a scheduled gameweek may move
--   freely, an open one only while its current deadline is still ahead
--   (`app_private.fantasy_guard_deadline_change`), and never into the past.
--
--   A brand-new manager joins the gameweek a squad can still enter: the open
--   gameweek before its deadline, otherwise the staged gameweek directly
--   after the latest one that has started. The client names the gameweek it
--   showed the user; the server refuses any other one with the same
--   `fantasy_gameweek_locked` code as before.
--
-- Replaced functions are the repository definitions, which were verified
-- byte-identical to production (md5 of pg_get_functiondef) before this
-- migration was written; only the lines needed for the rule above change.

-- ---------------------------------------------------------------------------
-- 1. Vocabulary: an automatic deferral is not an operator's decision.
-- ---------------------------------------------------------------------------
alter table app.fantasy_fixture_assignments
  drop constraint fantasy_fixture_assignments_resolution_check,
  add constraint fantasy_fixture_assignments_resolution_check check (
    resolution is null or resolution = any (array[
      'completed_in_window', 'moved_to_actual_gameweek', 'official_result_confirmed',
      'resumed_in_window', 'replayed', 'operator_deferred', 'provider_postponed'
    ]::text[])
  );

-- ---------------------------------------------------------------------------
-- 2. One place that defers postponed fixtures of an unfrozen gameweek.
-- ---------------------------------------------------------------------------
create or replace function app_private.fantasy_defer_postponed_assignments(p_gameweek_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare deferred_count integer;
begin
  update app.fantasy_fixture_assignments assignment
  set superseded_at = statement_timestamp(),
      assignment_status = 'deferred',
      resolution = 'provider_postponed',
      counts_points = false
  from app.fixtures fixture
  where fixture.id = assignment.fixture_id
    and assignment.gameweek_id = p_gameweek_id
    and assignment.superseded_at is null
    and assignment.frozen_at is null
    and fixture.status = 'postponed';
  get diagnostics deferred_count = row_count;
  return deferred_count;
end;
$$;
revoke all on function app_private.fantasy_defer_postponed_assignments(uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.fantasy_defer_postponed_assignments(uuid) is
  'Supersede every active, unfrozen assignment of the gameweek whose fixture the provider reports as postponed (assignment_status deferred, resolution provider_postponed, counts_points false). Returns the number deferred. Frozen assignments are never touched.';

-- ---------------------------------------------------------------------------
-- 3. The gameweek a new team joins now.
-- ---------------------------------------------------------------------------
create or replace function app_private.fantasy_enrolment_gameweek(p_fantasy_season_id uuid)
returns app.fantasy_gameweeks
language plpgsql
stable
security definer
set search_path = ''
as $$
declare target app.fantasy_gameweeks%rowtype;
declare latest_started integer;
begin
  -- The open gameweek whose deadline is still ahead: the ordinary case.
  select * into target from app.fantasy_gameweeks gameweek
  where gameweek.fantasy_season_id = p_fantasy_season_id
    and gameweek.status = 'open'
    and gameweek.deadline_at > statement_timestamp()
  order by gameweek.sequence_number
  limit 1;
  if found then return target; end if;

  -- Otherwise the staged gameweek directly after the latest one that has left
  -- `scheduled`, while its own deadline is still ahead. Never a gameweek two
  -- steps ahead: the next-gameweek progression carries every team from the
  -- previous gameweek into exactly the next one.
  select max(gameweek.sequence_number) into latest_started
  from app.fantasy_gameweeks gameweek
  where gameweek.fantasy_season_id = p_fantasy_season_id
    and gameweek.status not in ('scheduled', 'cancelled');
  if latest_started is null then return null; end if;

  select * into target from app.fantasy_gameweeks gameweek
  where gameweek.fantasy_season_id = p_fantasy_season_id
    and gameweek.status = 'scheduled'
    and gameweek.sequence_number = latest_started + 1
    and gameweek.deadline_at > statement_timestamp();
  if found then return target; end if;
  return null;
end;
$$;
revoke all on function app_private.fantasy_enrolment_gameweek(uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.fantasy_enrolment_gameweek(uuid) is
  'The gameweek a brand-new Fantasy team joins at this instant: the open gameweek before its deadline, otherwise the scheduled gameweek directly after the latest started one while its deadline is ahead; null when neither exists.';

-- ---------------------------------------------------------------------------
-- 4. Calendar sync: postponed fixtures are deferred, never counted.
-- ---------------------------------------------------------------------------
create or replace function api.service_sync_fantasy_calendar(p_fantasy_season_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  season app.fantasy_seasons%rowtype;
  expected_clubs integer;
  rnd record;
  facts record;
  gw app.fantasy_gameweeks%rowtype;
  notes jsonb;
  rounds jsonb := '[]'::jsonb;
  created integer := 0;
  assignments_added integer := 0;
  assignments_superseded integer := 0;
  assignments_deferred integer := 0;
  kickoffs_realigned integer := 0;
  deadline_changes integer := 0;
  blocked integer := 0;
  n integer;
  unconfirmed integer;
  unconfirmed_active integer;
  new_start timestamptz;
  new_end timestamptz;
  new_deadline timestamptz;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
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
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended('fantasy:calendar:' || season.id::text, 0));
  if season.status not in ('planned', 'registration_open', 'active') then
    return jsonb_build_object('schemaVersion', 1, 'seasonId', season.id, 'skipped', 'fantasy_season_closed');
  end if;
  select count(distinct fp.football_team_id) into expected_clubs
  from app.fantasy_players fp where fp.fantasy_season_id = season.id and fp.active;
  if expected_clubs < 2 or mod(expected_clubs, 2) <> 0 then
    raise exception using errcode = 'PT409', message = 'fantasy_catalog_clubs_invalid';
  end if;

  for rnd in
    select r.* from app.rounds r
    where r.season_id = season.football_season_id
    order by r.round_number nulls last, r.name
  loop
    notes := '[]'::jsonb;
    -- A round is complete when every published fixture (postponed included)
    -- is there; it is playable from its fixtures that are not postponed, and
    -- only those carry kickoffs a window or deadline may be derived from.
    select
      count(distinct f.id) as fixtures,
      count(distinct f.id) filter (where f.status <> 'postponed') as playable,
      count(distinct f.id) filter (where f.status = 'postponed') as postponed,
      count(distinct f.id) filter (where f.status <> 'postponed'
        and app_private.fantasy_kickoff_confirmed(f.kickoff_at)) as confirmed,
      count(distinct t.team_id) as participants,
      count(distinct t.team_id) filter (where not exists (
        select 1 from app.fantasy_players fp
        where fp.fantasy_season_id = season.id and fp.football_team_id = t.team_id)) as unknown_clubs,
      min(f.kickoff_at) filter (where f.status <> 'postponed') as first_kickoff,
      max(f.kickoff_at) filter (where f.status <> 'postponed') as last_kickoff
    into facts
    from app.fixtures f
    cross join lateral (values (f.home_team_id), (f.away_team_id)) t(team_id)
    where f.round_id = rnd.id and f.season_id = season.football_season_id
      and f.status not in ('cancelled', 'abandoned');

    select * into gw from app.fantasy_gameweeks
    where fantasy_season_id = season.id and football_round_id = rnd.id
    for update;

    if not found then
      if rnd.round_number is null then
        notes := notes || '"round_number_missing"'::jsonb;
      elsif facts.fixtures = 0 then
        notes := notes || '"no_fixtures_published"'::jsonb;
      elsif facts.fixtures <> expected_clubs / 2 or facts.participants <> expected_clubs
        or facts.unknown_clubs > 0 then
        notes := notes || '"round_incomplete"'::jsonb;
      elsif facts.playable = 0 then
        notes := notes || '"all_fixtures_postponed"'::jsonb;
      elsif facts.confirmed < facts.playable then
        notes := notes || '"kickoff_unconfirmed"'::jsonb;
      elsif exists (select 1 from app.fantasy_gameweeks g
        where g.fantasy_season_id = season.id and g.sequence_number = rnd.round_number) then
        notes := notes || '"sequence_conflict"'::jsonb;
      elsif app_private.fantasy_calculate_deadline(season.ruleset_id, facts.first_kickoff)
        <= statement_timestamp() then
        notes := notes || '"deadline_already_passed"'::jsonb;
      else
        insert into app.fantasy_gameweeks (
          fantasy_season_id, football_round_id, sequence_number, name,
          deadline_at, starts_at, ends_at, status, points_state
        ) values (
          season.id, rnd.id, rnd.round_number, rnd.name,
          app_private.fantasy_calculate_deadline(season.ruleset_id, facts.first_kickoff),
          facts.first_kickoff, facts.last_kickoff + interval '6 hours', 'scheduled', 'provisional'
        ) returning * into gw;
        insert into app.fantasy_fixture_assignments (
          fantasy_season_id, fixture_id, gameweek_id, original_gameweek_id,
          original_kickoff_at, assigned_kickoff_at, assignment_status, counts_points, source_version
        )
        select season.id, f.id, gw.id, gw.id, f.kickoff_at, f.kickoff_at, 'assigned', true,
          greatest(1, f.source_sequence,
            coalesce((select max(p.source_version) from app.fantasy_fixture_assignments p
              where p.fantasy_season_id = season.id and p.fixture_id = f.id), 0) + 1)
        from app.fixtures f
        where f.round_id = rnd.id and f.season_id = season.football_season_id
          and f.status not in ('cancelled', 'abandoned', 'postponed')
          and not exists (select 1 from app.fantasy_fixture_assignments a
            where a.fantasy_season_id = season.id and a.fixture_id = f.id and a.superseded_at is null);
        get diagnostics n = row_count;
        assignments_added := assignments_added + n;
        created := created + 1;
        notes := notes || jsonb_build_object('created', true, 'assignments', n, 'deadlineAt', gw.deadline_at);
      end if;
      if facts.postponed > 0 then
        notes := notes || jsonb_build_object('postponedFixtures', facts.postponed);
      end if;
      if notes @> '"round_incomplete"'::jsonb or notes @> '"kickoff_unconfirmed"'::jsonb
        or notes @> '"all_fixtures_postponed"'::jsonb then
        blocked := blocked + 1;
      end if;
      rounds := rounds || jsonb_build_object('round', rnd.round_number, 'roundId', rnd.id,
        'gameweekId', gw.id, 'status', gw.status, 'fixtures', facts.fixtures,
        'confirmedKickoffs', facts.confirmed, 'postponedFixtures', facts.postponed,
        'notes', notes);
      continue;
    end if;

    if gw.status not in ('scheduled', 'open') or exists (
      select 1 from app.fantasy_fixture_assignments a
      where a.gameweek_id = gw.id and a.superseded_at is null and a.frozen_at is not null
    ) then
      notes := notes || '"gameweek_locked"'::jsonb;
    else
      update app.fantasy_fixture_assignments a
      set superseded_at = statement_timestamp(), assignment_status = 'voided'
      from app.fixtures f
      where f.id = a.fixture_id and a.gameweek_id = gw.id and a.superseded_at is null
        and (f.round_id is distinct from rnd.id or f.status in ('cancelled', 'abandoned'));
      get diagnostics n = row_count;
      assignments_superseded := assignments_superseded + n;
      if n > 0 then notes := notes || jsonb_build_object('assignmentsSuperseded', n); end if;

      -- A postponed fixture stops counting before anything is derived below.
      n := app_private.fantasy_defer_postponed_assignments(gw.id);
      assignments_deferred := assignments_deferred + n;
      if n > 0 then notes := notes || jsonb_build_object('assignmentsDeferred', n); end if;

      insert into app.fantasy_fixture_assignments (
        fantasy_season_id, fixture_id, gameweek_id, original_gameweek_id,
        original_kickoff_at, assigned_kickoff_at, assignment_status, counts_points, source_version
      )
      select season.id, f.id, gw.id, gw.id, f.kickoff_at, f.kickoff_at, 'assigned', true,
        greatest(1, f.source_sequence,
          coalesce((select max(p.source_version) from app.fantasy_fixture_assignments p
            where p.fantasy_season_id = season.id and p.fixture_id = f.id), 0) + 1)
      from app.fixtures f
      where f.round_id = rnd.id and f.season_id = season.football_season_id
        and f.status not in ('cancelled', 'abandoned', 'postponed')
        and app_private.fantasy_kickoff_confirmed(f.kickoff_at)
        and exists (select 1 from app.fantasy_players fp where fp.fantasy_season_id = season.id and fp.football_team_id = f.home_team_id)
        and exists (select 1 from app.fantasy_players fp where fp.fantasy_season_id = season.id and fp.football_team_id = f.away_team_id)
        and not exists (select 1 from app.fantasy_fixture_assignments a
          where a.fantasy_season_id = season.id and a.fixture_id = f.id and a.superseded_at is null);
      get diagnostics n = row_count;
      assignments_added := assignments_added + n;
      if n > 0 then notes := notes || jsonb_build_object('assignmentsAdded', n); end if;

      update app.fantasy_fixture_assignments a
      set assigned_kickoff_at = f.kickoff_at
      from app.fixtures f
      where f.id = a.fixture_id and a.gameweek_id = gw.id and a.superseded_at is null
        and a.assigned_kickoff_at is distinct from f.kickoff_at
        and app_private.fantasy_kickoff_confirmed(f.kickoff_at);
      get diagnostics n = row_count;
      kickoffs_realigned := kickoffs_realigned + n;
      if n > 0 then notes := notes || jsonb_build_object('kickoffsRealigned', n); end if;

      -- A partially published round must never produce a deadline: while any
      -- active counting assignment still carries a placeholder kickoff the
      -- window and the deadline stay exactly as they are. Postponed fixtures
      -- were deferred above, so their placeholders no longer freeze anything.
      select count(*) into unconfirmed_active
      from app.fantasy_fixture_assignments a join app.fixtures f on f.id = a.fixture_id
      where a.gameweek_id = gw.id and a.superseded_at is null and a.counts_points
        and not app_private.fantasy_kickoff_confirmed(f.kickoff_at);

      if unconfirmed_active > 0 then
        notes := notes || '"deadline_unconfirmed"'::jsonb;
      else
        select min(a.assigned_kickoff_at), max(a.assigned_kickoff_at) + interval '6 hours'
        into new_start, new_end
        from app.fantasy_fixture_assignments a
        where a.gameweek_id = gw.id and a.superseded_at is null and a.counts_points
          and app_private.fantasy_kickoff_confirmed(a.assigned_kickoff_at);
        if new_start is null then
          notes := notes || '"no_playable_fixtures"'::jsonb;
        else
          new_deadline := app_private.fantasy_calculate_deadline(season.ruleset_id, new_start);
          if gw.deadline_at is distinct from new_deadline
            or gw.starts_at is distinct from new_start or gw.ends_at is distinct from new_end then
            if gw.status = 'open' and gw.deadline_at <= statement_timestamp() then
              notes := notes || '"deadline_locked"'::jsonb;
            elsif new_deadline <= statement_timestamp() then
              notes := notes || '"new_deadline_in_past"'::jsonb;
            else
              update app.fantasy_gameweeks
              set deadline_at = new_deadline, starts_at = new_start, ends_at = new_end
              where id = gw.id returning * into gw;
              deadline_changes := deadline_changes + 1;
              notes := notes || jsonb_build_object('deadlineAt', new_deadline);
            end if;
          end if;
        end if;
      end if;
    end if;

    select count(*) into unconfirmed
    from app.fantasy_fixture_assignments a join app.fixtures f on f.id = a.fixture_id
    where a.gameweek_id = gw.id and a.superseded_at is null and a.counts_points
      and not app_private.fantasy_kickoff_confirmed(f.kickoff_at);
    if unconfirmed > 0 then
      notes := notes || jsonb_build_object('kickoffUnconfirmed', unconfirmed,
        'deadlineUnconfirmed', gw.status in ('scheduled', 'open'));
      blocked := blocked + 1;
    end if;
    if facts.playable <> (select count(*) from app.fantasy_fixture_assignments a
      where a.gameweek_id = gw.id and a.superseded_at is null and a.counts_points) then
      notes := notes || '"assignments_incomplete"'::jsonb;
    end if;
    if facts.postponed > 0 then
      notes := notes || jsonb_build_object('postponedFixtures', facts.postponed);
    end if;
    rounds := rounds || jsonb_build_object('round', rnd.round_number, 'roundId', rnd.id,
      'gameweekId', gw.id, 'status', gw.status, 'sequence', gw.sequence_number,
      'fixtures', facts.fixtures, 'confirmedKickoffs', facts.confirmed,
      'postponedFixtures', facts.postponed,
      'deadlineAt', gw.deadline_at, 'notes', notes);
  end loop;

  return jsonb_build_object(
    'schemaVersion', 1,
    'seasonId', season.id,
    'seasonStatus', season.status,
    'expectedClubs', expected_clubs,
    'gameweeksCreated', created,
    'assignmentsAdded', assignments_added,
    'assignmentsSuperseded', assignments_superseded,
    'assignmentsDeferred', assignments_deferred,
    'kickoffsRealigned', kickoffs_realigned,
    'deadlineChanges', deadline_changes,
    'blockedRounds', blocked,
    'rounds', rounds,
    'gameweeks', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id, 'sequence', g.sequence_number, 'status', g.status,
        'deadlineAt', g.deadline_at, 'startsAt', g.starts_at,
        'scoringInputVersion', g.scoring_input_version,
        'nextGameweekId', (select nx.id from app.fantasy_gameweeks nx
          where nx.fantasy_season_id = g.fantasy_season_id and nx.sequence_number = g.sequence_number + 1),
        'advancedToGameweekId', (select pr.next_gameweek_id from app_private.fantasy_gameweek_progressions pr
          where pr.previous_gameweek_id = g.id and pr.opened_at is not null)
      ) order by g.sequence_number), '[]'::jsonb)
      from app.fantasy_gameweeks g where g.fantasy_season_id = season.id),
    'serverTime', statement_timestamp()
  );
end;
$$;
revoke all on function api.service_sync_fantasy_calendar(uuid) from public, anon, authenticated;
grant execute on function api.service_sync_fantasy_calendar(uuid) to service_role;
comment on function api.service_sync_fantasy_calendar(uuid) is
  'Idempotent service operation: stage scheduled gameweeks for complete provider rounds whose playable (not postponed) fixtures carry confirmed kickoffs, and keep assignments, windows and deadlines of scheduled/open gameweeks aligned with fixture kickoffs. Postponed fixtures are deferred (resolution provider_postponed) and never anchor or freeze a deadline. Never touches locked gameweeks, and never derives a window or deadline while an active counting assignment still carries a placeholder (00:00 UTC) kickoff.';

-- ---------------------------------------------------------------------------
-- 5. Lifecycle: a postponed fixture no longer blocks the lock at the deadline.
-- ---------------------------------------------------------------------------
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
declare deferred_count integer := 0;
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

  -- At the deadline a postponed fixture cannot be played inside this window.
  -- It is deferred (auditable, resolution provider_postponed) rather than
  -- blocking every lineup from locking; the remaining fixtures decide the
  -- gameweek. Any other anomaly still refuses below.
  if target.status = 'open' and statement_timestamp() >= target.deadline_at then
    deferred_count := app_private.fantasy_defer_postponed_assignments(target.id);
  end if;

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
      -- approved fixture. Resolve replays/suspensions through their own path.
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
    'changed', next_status is not null or locked_count > 0 or deferred_count > 0,
    'lockedLineups', locked_count, 'hasMore', has_more,
    'deferredAssignments', deferred_count,
    'waitingReason', waiting_reason
  );
end;
$$;
revoke all on function api.service_advance_fantasy_lifecycle(uuid, bigint, integer)
  from public, anon, authenticated, service_role;
grant execute on function api.service_advance_fantasy_lifecycle(uuid, bigint, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Next-gameweek opening tolerates a postponed fixture in the next round.
-- ---------------------------------------------------------------------------
create or replace function api.service_prepare_next_fantasy_gameweek(
  p_previous_gameweek_id uuid,p_next_gameweek_id uuid,p_calculation_version bigint,p_batch_size integer default 100
) returns jsonb language plpgsql security definer set search_path='' as $$
declare previous app.fantasy_gameweeks%rowtype; next_week app.fantasy_gameweeks%rowtype;
  season app.fantasy_seasons%rowtype; progress app_private.fantasy_gameweek_progressions%rowtype;
  team app.fantasy_teams%rowtype; source_id uuid; next_lineup_id uuid;
  free_hit_id uuid; selection jsonb; prepared integer:=0; remaining boolean;
  expected_clubs integer; fixture_count integer; first_kickoff timestamptz;
  round_fixture_count integer; round_participant_count integer; playable_unassigned integer;
begin
  if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
  if p_previous_gameweek_id is null or p_next_gameweek_id is null or p_calculation_version is null
    or p_calculation_version<1 or p_batch_size is null or p_batch_size not between 1 and 1000 then
    raise exception using errcode='PT400',message='validation_failed'; end if;
  select * into previous from app.fantasy_gameweeks where id=p_previous_gameweek_id for update;
  select * into next_week from app.fantasy_gameweeks where id=p_next_gameweek_id for update;
  if previous.id is null or next_week.id is null then raise exception using errcode='PT404',message='fantasy_gameweek_not_found'; end if;
  if next_week.fantasy_season_id<>previous.fantasy_season_id or next_week.sequence_number<>previous.sequence_number+1 then
    raise exception using errcode='PT409',message='fantasy_next_gameweek_scope_invalid'; end if;
  select * into progress from app_private.fantasy_gameweek_progressions where previous_gameweek_id=previous.id;
  if found and (progress.next_gameweek_id<>next_week.id or progress.calculation_version<>p_calculation_version) then
    raise exception using errcode='PT409',message='idempotency_conflict'; end if;
  if progress.opened_at is not null then
    return jsonb_build_object('prepared',0,'hasMore',false,'nextGameweekId',next_week.id,'status',next_week.status,'alreadyAdvanced',true);
  end if;
  if previous.status<>'finalized' or previous.scoring_input_version<>p_calculation_version
    or not exists(select 1 from app_private.fantasy_gameweek_postwork work
      where work.gameweek_id=previous.id and work.calculation_version=p_calculation_version and work.completed_at is not null) then
    raise exception using errcode='PT409',message='fantasy_previous_postwork_incomplete'; end if;
  select * into season from app.fantasy_seasons where id=previous.fantasy_season_id;
  if season.status not in ('registration_open','active') or next_week.status<>'scheduled'
    or next_week.deadline_at<=statement_timestamp() then
    raise exception using errcode='PT409',message='fantasy_next_gameweek_not_openable'; end if;
  -- A fixture postponed after the next week was staged stops counting before
  -- the calendar is checked, exactly as the calendar sync would defer it.
  perform app_private.fantasy_defer_postponed_assignments(next_week.id);
  perform a.id from app.fantasy_fixture_assignments a join app.fixtures f on f.id=a.fixture_id
  where a.gameweek_id=next_week.id and a.superseded_at is null order by a.id for share of a,f;
  if exists(select 1 from app.fantasy_fixture_assignments a join app.fixtures f on f.id=a.fixture_id
    where a.gameweek_id=next_week.id and a.superseded_at is null and (
      a.fantasy_season_id<>season.id or f.season_id<>season.football_season_id
      or f.round_id is distinct from next_week.football_round_id or not a.counts_points or a.frozen_at is not null
      or a.assignment_status not in ('assigned','confirmed','reassigned')
      or f.status not in ('scheduled','not_started') or f.kickoff_at is distinct from a.assigned_kickoff_at
      or not exists(select 1 from app.fantasy_players fp where fp.fantasy_season_id=season.id and fp.football_team_id=f.home_team_id)
      or not exists(select 1 from app.fantasy_players fp where fp.fantasy_season_id=season.id and fp.football_team_id=f.away_team_id))) then
    raise exception using errcode='PT409',message='fantasy_next_fixture_unverified'; end if;
  select count(distinct fp.football_team_id) into expected_clubs from app.fantasy_players fp where fp.fantasy_season_id=season.id;
  select count(distinct f.id),min(f.kickoff_at)
  into fixture_count,first_kickoff
  from app.fantasy_fixture_assignments a join app.fixtures f on f.id=a.fixture_id
  where a.gameweek_id=next_week.id and a.superseded_at is null and a.counts_points;
  -- The round must be fully published (postponed fixtures included), and every
  -- fixture of it that is still playable must count for the next week. A
  -- postponed fixture is the only one allowed to be missing.
  select count(distinct f.id),count(distinct t.team_id)
  into round_fixture_count,round_participant_count
  from app.fixtures f
  cross join lateral(values(f.home_team_id),(f.away_team_id)) t(team_id)
  where f.round_id=next_week.football_round_id and f.season_id=season.football_season_id
    and f.status not in ('cancelled','abandoned');
  select count(*) into playable_unassigned
  from app.fixtures f
  where f.round_id=next_week.football_round_id and f.season_id=season.football_season_id
    and f.status not in ('cancelled','abandoned','postponed')
    and not exists(select 1 from app.fantasy_fixture_assignments a
      where a.gameweek_id=next_week.id and a.fixture_id=f.id and a.superseded_at is null and a.counts_points);
  if expected_clubs<2 or mod(expected_clubs,2)<>0
    or round_fixture_count<>expected_clubs/2 or round_participant_count<>expected_clubs
    or fixture_count<1 or playable_unassigned>0
    or next_week.deadline_at is distinct from app_private.fantasy_calculate_deadline(season.ruleset_id,first_kickoff)
    or next_week.starts_at is distinct from first_kickoff then
    raise exception using errcode='PT409',message='fantasy_next_calendar_incomplete'; end if;
  if exists(select 1 from app.fantasy_teams t where t.fantasy_season_id=season.id and t.status='active'
    and (t.current_gameweek_id is null or t.current_gameweek_id not in (previous.id,next_week.id))) then
    raise exception using errcode='PT409',message='fantasy_team_progression_conflict'; end if;
  insert into app_private.fantasy_gameweek_progressions(previous_gameweek_id,next_gameweek_id,calculation_version)
  values(previous.id,next_week.id,p_calculation_version) on conflict(previous_gameweek_id) do nothing;
  for team in select * from app.fantasy_teams where fantasy_season_id=season.id and status='active'
    and current_gameweek_id=previous.id order by id for update limit p_batch_size loop
    select id into next_lineup_id from app.fantasy_lineups where fantasy_team_id=team.id and gameweek_id=next_week.id
      and locked_at is null and finalized_at is null;
    if next_lineup_id is not null then
      selection:=app_private.fantasy_lineup_selection(next_lineup_id);
    else
      select id into free_hit_id from app.fantasy_free_hit_snapshots
      where fantasy_team_id=team.id and gameweek_id=previous.id and restored_at is not null;
      if free_hit_id is not null then
        select captured.selection into selection from app_private.fantasy_free_hit_lineup_snapshots captured where captured.snapshot_id=free_hit_id;
        if selection is null then raise exception using errcode='PT409',message='fantasy_free_hit_selection_unavailable'; end if;
      else
        select id into source_id from app.fantasy_lineups where fantasy_team_id=team.id and gameweek_id=previous.id and locked_at is not null;
        selection:=app_private.fantasy_lineup_selection(source_id);
      end if;
    end if;
    perform app_private.fantasy_validate_carried_selection(team.id,selection);
    if next_lineup_id is null then
      insert into app.fantasy_lineups(fantasy_team_id,gameweek_id,team_version)
      values(team.id,next_week.id,team.version+1) returning id into next_lineup_id;
      insert into app.fantasy_lineup_players(lineup_id,fantasy_player_id,slot,slot_order,captain,vice_captain,multiplier,snapshot_price)
      select next_lineup_id,(v->>'fantasy_player_id')::uuid,(v->>'slot')::app.fantasy_lineup_slot,(v->>'slot_order')::integer,
        (v->>'captain')::boolean,(v->>'vice_captain')::boolean,
        case when (v->>'captain')::boolean then r.captain_multiplier else 1 end,fp.price
      from jsonb_array_elements(selection) v join app.fantasy_players fp on fp.id::text=v->>'fantasy_player_id'
      join app.fantasy_rulesets r on r.id=season.ruleset_id;
    end if;
    update app.fantasy_teams set current_gameweek_id=next_week.id,version=version+1,
      team_value=(select sum(fp.price) from app.fantasy_squad_memberships m join app.fantasy_players fp on fp.id=m.fantasy_player_id
        where m.fantasy_team_id=team.id and m.sold_at is null)
    where id=team.id;
    prepared:=prepared+1;
  end loop;
  remaining:=exists(select 1 from app.fantasy_teams where fantasy_season_id=season.id and status='active' and current_gameweek_id=previous.id);
  if not remaining then
    if exists(select 1 from app.fantasy_teams t where t.fantasy_season_id=season.id and t.status='active'
      and not exists(select 1 from app.fantasy_lineups l where l.fantasy_team_id=t.id and l.gameweek_id=next_week.id and l.locked_at is null)) then
      raise exception using errcode='PT409',message='fantasy_next_lineup_missing'; end if;
    update app.fantasy_gameweeks set status='open',lock_version=lock_version+1 where id=next_week.id;
    update app_private.fantasy_gameweek_progressions set opened_at=statement_timestamp() where previous_gameweek_id=previous.id;
  end if;
  return jsonb_build_object('prepared',prepared,'hasMore',remaining,'nextGameweekId',next_week.id,
    'status',case when remaining then 'scheduled' else 'open' end,'alreadyAdvanced',false);
end;
$$;
revoke all on function api.service_prepare_next_fantasy_gameweek(uuid,uuid,bigint,integer) from public,anon,authenticated,service_role;
grant execute on function api.service_prepare_next_fantasy_gameweek(uuid,uuid,bigint,integer) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Team creation joins the enrolment gameweek.
-- ---------------------------------------------------------------------------
create or replace function api.create_fantasy_team(
  p_season_id uuid,
  p_gameweek_id uuid,
  p_team_name text,
  p_selection jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
declare season app.fantasy_seasons%rowtype;
declare gameweek app.fantasy_gameweeks%rowtype;
declare requested app.fantasy_gameweeks%rowtype;
declare rules app.fantasy_rulesets%rowtype;
declare request_hash text;
declare existing_hash text;
declare cached_response jsonb;
declare target_team_id uuid;
declare target_lineup_id uuid;
declare squad_cost numeric(10,2);
begin
  if current_user_id is null then raise exception using errcode = 'PT401', message = 'fantasy_team_not_found'; end if;
  if p_idempotency_key is null or p_team_name is null
    or p_team_name <> btrim(p_team_name) or char_length(p_team_name) not between 3 and 40
    or p_team_name !~ '^[[:alnum:]][[:alnum:] _''.-]{1,38}[[:alnum:]]$'
  then raise exception using errcode = 'PT400', message = 'invalid_team_name'; end if;
  select * into season from app.fantasy_seasons where id = p_season_id and status in ('registration_open','active');
  if not found then raise exception using errcode = 'PT409', message = 'fantasy_season_closed'; end if;
  select * into requested from app.fantasy_gameweeks where id = p_gameweek_id;
  if not found then raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found'; end if;
  if requested.fantasy_season_id <> season.id then raise exception using errcode = 'PT400', message = 'invalid_squad'; end if;
  -- A new team joins the gameweek a squad can still enter. The client names
  -- the one it showed the manager; any other gameweek -- past its deadline,
  -- or no longer the next one -- is refused with the long-standing code.
  gameweek := app_private.fantasy_enrolment_gameweek(season.id);
  if gameweek.id is null or gameweek.id <> requested.id then
    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_locked';
  end if;
  select * into rules from app.fantasy_rulesets where id = season.ruleset_id;
  request_hash := app_private.fantasy_selection_hash(p_team_name, p_gameweek_id, p_selection);
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(current_user_id::text || ':fantasy:create:' || p_season_id::text, 0));
  select fantasy_idempotency.request_hash, fantasy_idempotency.response_body
  into existing_hash, cached_response
  from app_private.fantasy_idempotency_keys fantasy_idempotency
  where fantasy_idempotency.user_id = current_user_id
    and fantasy_idempotency.operation = 'create_team'
    and fantasy_idempotency.idempotency_key = p_idempotency_key;
  if found then
    if existing_hash <> request_hash then raise exception using errcode = 'PT409', message = 'idempotency_conflict'; end if;
    return cached_response;
  end if;
  if exists (select 1 from app.fantasy_teams where user_id = current_user_id and fantasy_season_id = season.id) then
    raise exception using errcode = 'PT409', message = 'fantasy_team_already_exists';
  end if;
  perform app_private.fantasy_validate_selection(season.id, season.ruleset_id, p_selection);
  select sum(player.price) into squad_cost
  from jsonb_to_recordset(p_selection) as item(fantasy_player_id uuid)
  join app.fantasy_players player on player.id = item.fantasy_player_id;
  if squad_cost > rules.initial_budget then raise exception using errcode = 'PT400', message = 'budget_exceeded'; end if;
  insert into app.fantasy_teams (
    user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers
  ) values (
    current_user_id, season.id, gameweek.id, p_team_name,
    rules.initial_budget - squad_cost, squad_cost, rules.initial_free_transfers
  ) returning id into target_team_id;
  insert into app.fantasy_squad_memberships (
    fantasy_team_id, fantasy_player_id, purchase_price, current_sale_price, acquired_gameweek_id
  ) select target_team_id, player.id, player.price, player.price, gameweek.id
  from jsonb_to_recordset(p_selection) as item(fantasy_player_id uuid)
  join app.fantasy_players player on player.id = item.fantasy_player_id;
  insert into app.fantasy_lineups (fantasy_team_id, gameweek_id, team_version)
  values (target_team_id, gameweek.id, 1) returning id into target_lineup_id;
  insert into app.fantasy_lineup_players (
    lineup_id, fantasy_player_id, slot, slot_order, captain, vice_captain, multiplier, snapshot_price
  ) select target_lineup_id, item.fantasy_player_id, item.slot, item.slot_order,
    item.captain, item.vice_captain,
    case when item.captain then rules.captain_multiplier else 1 end, player.price
  from jsonb_to_recordset(p_selection) as item(
    fantasy_player_id uuid, slot app.fantasy_lineup_slot, slot_order integer,
    captain boolean, vice_captain boolean
  ) join app.fantasy_players player on player.id = item.fantasy_player_id;
  cached_response := app_private.fantasy_team_dto(target_team_id);
  insert into app_private.fantasy_idempotency_keys (
    user_id, operation, idempotency_key, request_hash, response_body, expires_at
  ) values (current_user_id, 'create_team', p_idempotency_key, request_hash, cached_response, statement_timestamp() + interval '7 days');
  insert into app_private.fantasy_mutation_audit (
    user_id, fantasy_team_id, operation, accepted, resulting_version, idempotency_key,
    safe_metadata
  ) values (current_user_id, target_team_id, 'create_team', true, 1, p_idempotency_key,
    jsonb_build_object('seasonId', season.id, 'gameweekId', gameweek.id));
  return cached_response;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. The hub names the gameweek a new team would join.
-- ---------------------------------------------------------------------------
create or replace function api.fantasy_hub(p_language text default 'fr')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
declare result jsonb;
begin
  if p_language not in ('fr', 'ar') then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select jsonb_build_object(
    'season', jsonb_build_object('id', season.id, 'name', season.name, 'status', season.status),
    'gameweek', case when gameweek.id is null then null else jsonb_build_object(
      'id', gameweek.id, 'sequence', gameweek.sequence_number, 'name', gameweek.name,
      'deadlineAt', gameweek.deadline_at, 'status', gameweek.status,
      'pointsState', gameweek.points_state
    ) end,
    'enrolmentGameweek', case when enrolment.id is null then null else jsonb_build_object(
      'id', enrolment.id, 'sequence', enrolment.sequence_number, 'name', enrolment.name,
      'deadlineAt', enrolment.deadline_at, 'status', enrolment.status
    ) end,
    'team', case when team.id is null then null else app_private.fantasy_team_dto(team.id) end,
    'rankingAvailable', exists (
      select 1 from app.fantasy_rankings ranking
      where ranking.fantasy_season_id = season.id and ranking.league_id is null
    )
  ) into result
  from app.fantasy_seasons season
  left join lateral (
    select * from app.fantasy_gameweeks target
    where target.fantasy_season_id = season.id
      and target.status in ('open','locked','live','provisional','finalizing','finalized','corrected')
    order by target.sequence_number desc limit 1
  ) gameweek on true
  left join lateral app_private.fantasy_enrolment_gameweek(season.id) enrolment on true
  left join app.fantasy_teams team on team.fantasy_season_id = season.id
    and team.user_id = current_user_id and team.status = 'active'
  where season.status in ('registration_open','active')
  order by season.starts_at desc limit 1;
  if result is null then raise exception using errcode = 'PT404', message = 'fantasy_season_closed'; end if;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. The deadline watch also flags a gameweek left with no playable fixture.
-- ---------------------------------------------------------------------------
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

    -- Two conditions make a stored deadline untrustworthy: a counting fixture
    -- with a placeholder kickoff, or no counting fixture at all (every one
    -- postponed or voided), which no lock may proceed from.
    continue when coalesce(unconfirmed, 0) = 0 and coalesce(counting, 0) > 0;

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
      'unconfirmedFixtures', coalesce(unconfirmed, 0),
      'totalCountingFixtures', coalesce(counting, 0),
      'noPlayableFixtures', coalesce(counting, 0) = 0,
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
    'remediation', 'docs/backend/FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md',
    'gameweeks', entries
  );
end;
$$;
revoke all on function api.service_fantasy_deadline_watch(uuid, integer, integer) from public, anon, authenticated;
grant execute on function api.service_fantasy_deadline_watch(uuid, integer, integer) to service_role;
comment on function api.service_fantasy_deadline_watch(uuid, integer, integer) is
  'Read-only service guard: scheduled/open gameweeks whose deadline is inside the warning window while an active counting fixture still carries an unconfirmed (00:00 UTC placeholder) kickoff, or while no fixture counts at all, with the affected fixture detail. Never writes, never derives a replacement deadline.';
