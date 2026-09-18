-- Fantasy calendar synchronisation.
--
-- Until now only `api.service_stage_fantasy_catalog` (run once at activation)
-- could create Fantasy gameweeks and fixture assignments, and nothing kept an
-- assignment's kickoff aligned with the provider once a fixture time changed.
-- The lifecycle worker refuses to freeze a gameweek whose fixture kickoff
-- differs from its assignment (`fantasy_fixture_resolution_required`), so a
-- season could not run past the activation snapshot.
--
-- This migration adds one idempotent service operation that the scheduled
-- orchestrator calls after every provider ingestion:
--   * stage a `scheduled` gameweek (+ assignments) for every published round
--     whose fixtures are complete and whose kickoff times are confirmed;
--   * keep assignments of `scheduled`/`open` gameweeks aligned with fixtures
--     (new fixtures, voided fixtures, kickoff changes) and re-derive the
--     window and deadline from the ruleset rule;
--   * never touch a gameweek that is locked, live, scoring or has frozen
--     assignments; report every skipped round with a stable reason.
-- Provider midnight-UTC kickoffs are placeholders (no Botola match kicks off
-- at 00:00 UTC); they are reported as `kickoff_unconfirmed` and never create
-- or move a deadline.

create or replace function app_private.fantasy_kickoff_confirmed(p_kickoff_at timestamptz)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_kickoff_at is not null
    and (p_kickoff_at at time zone 'UTC')::time <> time '00:00:00';
$$;
revoke all on function app_private.fantasy_kickoff_confirmed(timestamptz) from public, anon, authenticated, service_role;

-- A scheduled gameweek has no frozen lineups yet: the service may realign its
-- deadline with the provider calendar. An open gameweek may only move while its
-- current deadline is still in the future. Every other state stays locked and
-- the audit trigger keeps recording each change.
create or replace function app_private.fantasy_guard_deadline_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deadline_at is not distinct from old.deadline_at then return new; end if;
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if old.status = 'scheduled' then return new; end if;
  if old.status <> 'open' or statement_timestamp() >= old.deadline_at then
    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_locked';
  end if;
  return new;
end;
$$;

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
  kickoffs_realigned integer := 0;
  deadline_changes integer := 0;
  blocked integer := 0;
  n integer;
  unconfirmed integer;
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
    select
      count(distinct f.id) as fixtures,
      count(distinct f.id) filter (where app_private.fantasy_kickoff_confirmed(f.kickoff_at)) as confirmed,
      count(distinct t.team_id) as participants,
      count(distinct t.team_id) filter (where not exists (
        select 1 from app.fantasy_players fp
        where fp.fantasy_season_id = season.id and fp.football_team_id = t.team_id)) as unknown_clubs,
      min(f.kickoff_at) as first_kickoff,
      max(f.kickoff_at) as last_kickoff
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
      elsif facts.confirmed < facts.fixtures then
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
          and f.status not in ('cancelled', 'abandoned')
          and not exists (select 1 from app.fantasy_fixture_assignments a
            where a.fantasy_season_id = season.id and a.fixture_id = f.id and a.superseded_at is null);
        get diagnostics n = row_count;
        assignments_added := assignments_added + n;
        created := created + 1;
        notes := notes || jsonb_build_object('created', true, 'assignments', n, 'deadlineAt', gw.deadline_at);
      end if;
      if notes @> '"round_incomplete"'::jsonb or notes @> '"kickoff_unconfirmed"'::jsonb then
        blocked := blocked + 1;
      end if;
      rounds := rounds || jsonb_build_object('round', rnd.round_number, 'roundId', rnd.id,
        'gameweekId', gw.id, 'status', gw.status, 'fixtures', facts.fixtures,
        'confirmedKickoffs', facts.confirmed, 'notes', notes);
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
        and f.status not in ('cancelled', 'abandoned')
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

      select min(a.assigned_kickoff_at), max(a.assigned_kickoff_at) + interval '6 hours'
      into new_start, new_end
      from app.fantasy_fixture_assignments a
      where a.gameweek_id = gw.id and a.superseded_at is null and a.counts_points;
      if new_start is not null then
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

    select count(*) into unconfirmed
    from app.fantasy_fixture_assignments a join app.fixtures f on f.id = a.fixture_id
    where a.gameweek_id = gw.id and a.superseded_at is null and a.counts_points
      and not app_private.fantasy_kickoff_confirmed(f.kickoff_at);
    if unconfirmed > 0 then
      notes := notes || jsonb_build_object('kickoffUnconfirmed', unconfirmed,
        'deadlineUnconfirmed', gw.status in ('scheduled', 'open'));
      blocked := blocked + 1;
    end if;
    if facts.fixtures <> (select count(*) from app.fantasy_fixture_assignments a
      where a.gameweek_id = gw.id and a.superseded_at is null and a.counts_points) then
      notes := notes || '"assignments_incomplete"'::jsonb;
    end if;
    rounds := rounds || jsonb_build_object('round', rnd.round_number, 'roundId', rnd.id,
      'gameweekId', gw.id, 'status', gw.status, 'sequence', gw.sequence_number,
      'fixtures', facts.fixtures, 'confirmedKickoffs', facts.confirmed,
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
  'Idempotent service operation: stage scheduled gameweeks for complete, confirmed provider rounds and keep assignments, windows and deadlines of scheduled/open gameweeks aligned with fixture kickoffs. Never touches locked gameweeks or placeholder (00:00 UTC) kickoffs.';
