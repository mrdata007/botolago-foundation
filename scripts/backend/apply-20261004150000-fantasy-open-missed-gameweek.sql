-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261004150000_fantasy_open_missed_gameweek: adds the owner-only tool that opens a
-- gameweek whose deadline passed before it could open, carrying every team's
-- lineup (roadmap step 5, "GW2 carries over"). Installing it changes nothing
-- else: the tool is used separately (scripts/backend/open-missed-fantasy-gameweek.sql).
--
-- HOW TO RUN
--   Check nothing else is writing (AGENTS.md): no Fantasy worker run, the
--   Fantasy tick off. Then run the WHOLE file. As shipped it is a REHEARSAL
--   (rolled back; "Rehearsal passed"). Change `rollback;` near the bottom to
--   `commit;` and run again ("Applied"). A failed check stops it with nothing
--   saved; do not edit a check to make it pass.
--
-- WHAT IT DOES
--   * refuses to run twice, while the Fantasy tick is on, while a pg_cron job
--     is mid-run, or where the tool already exists;
--   * records the migration file whole in supabase_migrations.schema_migrations
--     and runs it from that record once its sha256 matches the repository file;
--   * checks the result: the tool exists and no API role (not even the service
--     role) can call it.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $hold$
begin
  lock table app.fantasy_gameweeks in share row exclusive mode;
exception when lock_not_available then
  raise exception 'stop: a Fantasy gameweek is being changed right now -- nothing was saved; run this again when that has finished';
end
$hold$;

do $preflight$
begin
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261004150000') then
    raise exception 'stop: migration 20261004150000 is already recorded as applied';
  end if;
  if exists (select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled) then
    raise exception 'stop: the Fantasy lifecycle tick is on -- pause it first with select app_private.fantasy_automation_configure(false);';
  end if;
  -- Any run not finished blocks: a recent one, and an older one whose
  -- backend is still alive (a record left behind by a crash does not).
  if exists (select 1 from cron.job_run_details run
    where run.status not in ('succeeded', 'failed')
      and (run.start_time > statement_timestamp() - interval '15 minutes'
        or exists (select 1 from pg_stat_activity activity where activity.pid = run.job_pid))) then
    raise exception 'stop: a scheduled (pg_cron) job is running right now -- nothing was saved; run this again in a minute';
  end if;
  if to_regprocedure('app_private.fantasy_open_missed_gameweek(uuid,uuid,bigint,text)') is not null then
    raise exception 'stop: app_private.fantasy_open_missed_gameweek already exists';
  end if;
end
$preflight$;

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261004150000',
  'fantasy_open_missed_gameweek',
  array[$bg_20261004150000_file$-- BotolaGO Production V2
-- Carry every team's lineup into a gameweek whose deadline passed before it
-- could open (roadmap step 5, owner decision 2026-10-03: "GW2 carries over").
--
-- WHY. A gameweek opens only through api.service_prepare_next_fantasy_gameweek,
-- and only before its deadline, with none of its matches started
-- (20260924200000). Production GW2 (deadline 2026-10-02 14:30 UTC) could not
-- open in time: GW1 was finalized only on 2026-10-04, after every GW2 match
-- had been played. Nothing else opens a gameweek, so GW2 and every gameweek
-- after it would stay closed.
--
-- WHAT. app_private.fantasy_open_missed_gameweek does what the normal opening
-- does, with the same per-team carry: a team's existing unlocked lineup for
-- the gameweek is kept, otherwise its restored Free Hit selection, otherwise
-- its locked lineup of the previous gameweek, each validated the same way
-- (app_private.fantasy_validate_carried_selection). The progression journal
-- is written as the normal opening writes it, so the normal opening and the
-- worker see the gameweek as opened (alreadyAdvanced). Then the gameweek is
-- open with its deadline already past: the lifecycle (tick or worker) locks
-- every lineup on its next pass, and the lineups are scored as carried. No
-- manager can change anything in between: every user mutation requires an
-- open gameweek before its deadline (app_private.fantasy_assert_mutable_gameweek).
--
-- It differs from the normal opening in these ways only:
--   * it runs only when the deadline HAS passed (fantasy_gameweek_not_missed
--     otherwise: a gameweek still open in time takes the normal path);
--   * its matches may already be finished (still refused: a match live or in
--     any other state, which the lifecycle would have to wait for anyway);
--   * it is the database owner's, from the SQL editor through the guarded
--     script scripts/backend/open-missed-fantasy-gameweek.sql: no API role,
--     not even the service role, can call it, so no schedule ever takes this
--     path on its own;
--   * one writer at a time (AGENTS.md): it refuses while the Fantasy tick is
--     on, holds every pg_cron job off until the transaction ends and takes the
--     season's calendar lock, as fantasy_resolve_frozen_assignment does;
--   * it carries every team in one call, and records the owner's reason in
--     app_private.admin_audit_events (fantasy_gameweek.open_missed).
-- A replay returns the recorded outcome (alreadyOpened) and writes nothing.
--
-- Nothing here changes an existing function, table, grant or schedule.

create function app_private.fantasy_open_missed_gameweek(
  p_previous_gameweek_id uuid,
  p_next_gameweek_id uuid,
  p_calculation_version bigint,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  reason text := btrim(coalesce(p_reason, ''));
  previous app.fantasy_gameweeks%rowtype;
  next_week app.fantasy_gameweeks%rowtype;
  season app.fantasy_seasons%rowtype;
  progress app_private.fantasy_gameweek_progressions%rowtype;
  team app.fantasy_teams%rowtype;
  source_id uuid;
  next_lineup_id uuid;
  free_hit_id uuid;
  selection jsonb;
  carried integer := 0;
  kept integer := 0;
  expected_clubs integer;
  fixture_count integer;
  first_kickoff timestamptz;
  round_fixture_count integer;
  round_participant_count integer;
  playable_unassigned integer;
  audit_id bigint;
begin
  if p_previous_gameweek_id is null or p_next_gameweek_id is null
    or p_calculation_version is null or p_calculation_version < 1 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if char_length(reason) not between 8 and 500 then
    raise exception using errcode = '22023', message = 'fantasy_open_missed_reason_required',
      detail = 'Say why in 8 to 500 characters; it is kept in app_private.admin_audit_events.';
  end if;

  select * into next_week from app.fantasy_gameweeks gameweek where gameweek.id = p_next_gameweek_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found';
  end if;
  -- Already opened (by this function or by the normal opening): the recorded
  -- outcome, before the one-writer checks and without a lock.
  select * into progress from app_private.fantasy_gameweek_progressions journal
  where journal.previous_gameweek_id = p_previous_gameweek_id;
  if progress.opened_at is not null then
    if progress.next_gameweek_id <> p_next_gameweek_id
      or progress.calculation_version <> p_calculation_version then
      raise exception using errcode = 'PT409', message = 'idempotency_conflict';
    end if;
    return jsonb_build_object('schemaVersion', 1, 'nextGameweekId', next_week.id,
      'status', next_week.status, 'alreadyOpened', true);
  end if;

  -- One writer at a time (AGENTS.md).
  if exists (select 1 from app_private.fantasy_automation_settings settings
    where settings.lifecycle_tick_enabled) then
    raise exception using errcode = 'PT409', message = 'fantasy_tick_must_be_paused';
  end if;
  perform app_private.hold_scheduled_jobs();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'fantasy:calendar:' || next_week.fantasy_season_id::text, 0));

  select * into previous from app.fantasy_gameweeks gameweek where gameweek.id = p_previous_gameweek_id for update;
  select * into next_week from app.fantasy_gameweeks gameweek where gameweek.id = p_next_gameweek_id for update;
  if previous.id is null then
    raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found';
  end if;
  if next_week.fantasy_season_id <> previous.fantasy_season_id
    or next_week.sequence_number <> previous.sequence_number + 1 then
    raise exception using errcode = 'PT409', message = 'fantasy_next_gameweek_scope_invalid';
  end if;
  select * into progress from app_private.fantasy_gameweek_progressions journal
  where journal.previous_gameweek_id = previous.id;
  if found and (progress.next_gameweek_id <> next_week.id
    or progress.calculation_version <> p_calculation_version) then
    raise exception using errcode = 'PT409', message = 'idempotency_conflict';
  end if;
  if previous.status <> 'finalized' or previous.scoring_input_version <> p_calculation_version
    or not exists (select 1 from app_private.fantasy_gameweek_postwork work
      where work.gameweek_id = previous.id and work.calculation_version = p_calculation_version
        and work.completed_at is not null) then
    raise exception using errcode = 'PT409', message = 'fantasy_previous_postwork_incomplete';
  end if;
  select * into season from app.fantasy_seasons fantasy_season where fantasy_season.id = previous.fantasy_season_id;
  if season.status not in ('registration_open', 'active') or next_week.status <> 'scheduled' then
    raise exception using errcode = 'PT409', message = 'fantasy_next_gameweek_not_openable';
  end if;
  -- The one condition reversed: this path is for a deadline that has passed.
  if next_week.deadline_at > statement_timestamp() then
    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_not_missed',
      detail = 'Its deadline is still ahead: the normal opening (the worker) opens it.';
  end if;

  -- As the normal opening, except that a match may already be finished.
  perform app_private.fantasy_defer_postponed_assignments(next_week.id);
  perform a.id from app.fantasy_fixture_assignments a join app.fixtures f on f.id = a.fixture_id
  where a.gameweek_id = next_week.id and a.superseded_at is null order by a.id for share of a, f;
  if exists (select 1 from app.fantasy_fixture_assignments a join app.fixtures f on f.id = a.fixture_id
    where a.gameweek_id = next_week.id and a.superseded_at is null and (
      a.fantasy_season_id <> season.id or f.season_id <> season.football_season_id
      or f.round_id is distinct from next_week.football_round_id or not a.counts_points or a.frozen_at is not null
      or a.assignment_status not in ('assigned', 'confirmed', 'reassigned')
      or f.status not in ('scheduled', 'not_started', 'finished') or f.kickoff_at is distinct from a.assigned_kickoff_at
      or not exists (select 1 from app.fantasy_players fp where fp.fantasy_season_id = season.id and fp.football_team_id = f.home_team_id)
      or not exists (select 1 from app.fantasy_players fp where fp.fantasy_season_id = season.id and fp.football_team_id = f.away_team_id))) then
    raise exception using errcode = 'PT409', message = 'fantasy_next_fixture_unverified';
  end if;
  select count(distinct fp.football_team_id) into expected_clubs
  from app.fantasy_players fp where fp.fantasy_season_id = season.id;
  select count(distinct f.id), min(f.kickoff_at) into fixture_count, first_kickoff
  from app.fantasy_fixture_assignments a join app.fixtures f on f.id = a.fixture_id
  where a.gameweek_id = next_week.id and a.superseded_at is null and a.counts_points;
  select count(distinct f.id), count(distinct t.team_id) into round_fixture_count, round_participant_count
  from app.fixtures f
  cross join lateral (values (f.home_team_id), (f.away_team_id)) t(team_id)
  where f.round_id = next_week.football_round_id and f.season_id = season.football_season_id
    and f.status not in ('cancelled', 'abandoned');
  select count(*) into playable_unassigned
  from app.fixtures f
  where f.round_id = next_week.football_round_id and f.season_id = season.football_season_id
    and f.status not in ('cancelled', 'abandoned', 'postponed')
    and not exists (select 1 from app.fantasy_fixture_assignments a
      where a.gameweek_id = next_week.id and a.fixture_id = f.id and a.superseded_at is null and a.counts_points);
  if expected_clubs < 2 or mod(expected_clubs, 2) <> 0
    or round_fixture_count <> expected_clubs / 2 or round_participant_count <> expected_clubs
    or fixture_count < 1 or playable_unassigned > 0
    or next_week.deadline_at is distinct from app_private.fantasy_calculate_deadline(season.ruleset_id, first_kickoff)
    or next_week.starts_at is distinct from first_kickoff then
    raise exception using errcode = 'PT409', message = 'fantasy_next_calendar_incomplete';
  end if;
  if exists (select 1 from app.fantasy_teams t where t.fantasy_season_id = season.id and t.status = 'active'
    and (t.current_gameweek_id is null or t.current_gameweek_id not in (previous.id, next_week.id))) then
    raise exception using errcode = 'PT409', message = 'fantasy_team_progression_conflict';
  end if;

  insert into app_private.fantasy_gameweek_progressions(previous_gameweek_id, next_gameweek_id, calculation_version)
  values (previous.id, next_week.id, p_calculation_version) on conflict (previous_gameweek_id) do nothing;
  -- The normal opening's per-team carry, for every team at once.
  for team in select * from app.fantasy_teams where fantasy_season_id = season.id and status = 'active'
    and current_gameweek_id = previous.id order by id for update loop
    select id into next_lineup_id from app.fantasy_lineups where fantasy_team_id = team.id
      and gameweek_id = next_week.id and locked_at is null and finalized_at is null;
    if next_lineup_id is not null then
      selection := app_private.fantasy_lineup_selection(next_lineup_id);
      kept := kept + 1;
    else
      select id into free_hit_id from app.fantasy_free_hit_snapshots
      where fantasy_team_id = team.id and gameweek_id = previous.id and restored_at is not null;
      if free_hit_id is not null then
        select captured.selection into selection from app_private.fantasy_free_hit_lineup_snapshots captured
        where captured.snapshot_id = free_hit_id;
        if selection is null then
          raise exception using errcode = 'PT409', message = 'fantasy_free_hit_selection_unavailable';
        end if;
      else
        select id into source_id from app.fantasy_lineups where fantasy_team_id = team.id
          and gameweek_id = previous.id and locked_at is not null;
        selection := app_private.fantasy_lineup_selection(source_id);
      end if;
    end if;
    perform app_private.fantasy_validate_carried_selection(team.id, selection);
    if next_lineup_id is null then
      insert into app.fantasy_lineups(fantasy_team_id, gameweek_id, team_version)
      values (team.id, next_week.id, team.version + 1) returning id into next_lineup_id;
      insert into app.fantasy_lineup_players(lineup_id, fantasy_player_id, slot, slot_order, captain, vice_captain, multiplier, snapshot_price)
      select next_lineup_id, (v->>'fantasy_player_id')::uuid, (v->>'slot')::app.fantasy_lineup_slot, (v->>'slot_order')::integer,
        (v->>'captain')::boolean, (v->>'vice_captain')::boolean,
        case when (v->>'captain')::boolean then r.captain_multiplier else 1 end, fp.price
      from jsonb_array_elements(selection) v join app.fantasy_players fp on fp.id::text = v->>'fantasy_player_id'
      join app.fantasy_rulesets r on r.id = season.ruleset_id;
      carried := carried + 1;
    end if;
    update app.fantasy_teams set current_gameweek_id = next_week.id, version = version + 1,
      team_value = (select sum(fp.price) from app.fantasy_squad_memberships m join app.fantasy_players fp on fp.id = m.fantasy_player_id
        where m.fantasy_team_id = team.id and m.sold_at is null)
    where id = team.id;
  end loop;
  if exists (select 1 from app.fantasy_teams t where t.fantasy_season_id = season.id and t.status = 'active'
    and not exists (select 1 from app.fantasy_lineups l where l.fantasy_team_id = t.id
      and l.gameweek_id = next_week.id and l.locked_at is null)) then
    raise exception using errcode = 'PT409', message = 'fantasy_next_lineup_missing';
  end if;
  update app.fantasy_gameweeks set status = 'open', lock_version = lock_version + 1 where id = next_week.id;
  update app_private.fantasy_gameweek_progressions set opened_at = statement_timestamp()
  where previous_gameweek_id = previous.id;

  audit_id := app_private.write_admin_audit(
    p_actor_principal_id => null,
    p_action => 'fantasy_gameweek.open_missed',
    p_target_domain => 'fantasy',
    p_target_entity_id => next_week.id,
    p_reason => reason,
    p_request_id => pg_catalog.gen_random_uuid(),
    p_correlation_id => pg_catalog.gen_random_uuid(),
    p_approval_id => null,
    p_safe_before => jsonb_build_object(
      'previousGameweekId', previous.id, 'nextGameweekId', next_week.id,
      'nextGameweekSequence', next_week.sequence_number, 'nextGameweekStatus', next_week.status,
      'deadlineAt', next_week.deadline_at, 'calculationVersion', p_calculation_version),
    p_safe_after => jsonb_build_object(
      'nextGameweekStatus', 'open', 'carriedLineups', carried, 'keptLineups', kept,
      'openedAt', statement_timestamp()),
    p_outcome => 'succeeded'::app_private.admin_audit_outcome,
    p_error_code => null,
    p_synthetic_test => false
  );

  return jsonb_build_object('schemaVersion', 1, 'nextGameweekId', next_week.id, 'status', 'open',
    'carriedLineups', carried, 'keptLineups', kept, 'deadlineAt', next_week.deadline_at,
    'auditEventId', audit_id, 'alreadyOpened', false);
end;
$$;
revoke all on function app_private.fantasy_open_missed_gameweek(uuid, uuid, bigint, text)
  from public, anon, authenticated, service_role;
comment on function app_private.fantasy_open_missed_gameweek(uuid, uuid, bigint, text) is
  'Owner only, from the SQL editor (scripts/backend/open-missed-fantasy-gameweek.sql): opens the next gameweek after its deadline has passed, carrying every active team''s lineup exactly as api.service_prepare_next_fantasy_gameweek does (existing unlocked lineup kept, else restored Free Hit selection, else the locked previous lineup). Refuses a deadline still ahead (fantasy_gameweek_not_missed) and a match that is neither scheduled, not started nor finished. Writes the progression journal as the normal opening does and records app_private.admin_audit_events (fantasy_gameweek.open_missed) with the reason. Idempotent (alreadyOpened). Refuses while the Fantasy tick is on.';
$bg_20261004150000_file$]
);

do $apply$
declare
  part_20261004150000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261004150000'
  );
begin
  if encode(sha256(convert_to(part_20261004150000, 'UTF8')), 'hex')
    is distinct from '6e50bcbd9f988e568ce119a3c12ee184142743682f5baaed022f319b9f2d6fe7' then
    raise exception 'stop: 20261004150000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261004150000;
end
$apply$;

do $postflight$
declare
  problems text[] := '{}';
  tool regprocedure := to_regprocedure('app_private.fantasy_open_missed_gameweek(uuid,uuid,bigint,text)');
begin
  if tool is null then
    problems := problems || 'the tool was not created'::text;
  elsif has_function_privilege('anon', tool, 'execute')
    or has_function_privilege('authenticated', tool, 'execute')
    or has_function_privilege('service_role', tool, 'execute') then
    problems := problems || 'an API role can call the tool'::text;
  end if;
  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261004150000')
    then 'Applied. The missed-gameweek tool is installed (not used).'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
