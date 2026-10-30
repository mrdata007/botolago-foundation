-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn), one-off, owner-approved
-- 2026-10-29 ("Yes for both").
--
-- WHY. Maghreb Fès v RSB Berkane (fixture 352a2360-...) was assigned to
-- Journée 5 with kickoff 2026-10-29 20:00 UTC, but it kicked off at 17:00 UTC
-- and finished at 18:53. The calendar sync only realigns kickoffs of
-- scheduled/open gameweeks, so the frozen assignment kept 20:00, and
-- api.service_begin_fantasy_selection_close refuses a fixture whose kickoff
-- differs from its assigned kickoff (fantasy_selection_matches_unfinished).
-- Journée 5 cannot close, so Journée 6 (deadline 2026-10-30 18:30 UTC) cannot
-- open.
--
-- WHAT. Sets that one assignment's assigned_kickoff_at to the fixture's real
-- kickoff, and records an admin audit row. Nothing else. Fair: every Journée 5
-- lineup locked at the 2026-10-24 14:30 deadline, before both times, and the
-- match was completed within the rules' 48 h of its assignment, so it stays in
-- Journée 5 ("A fixture completed within 48 hours of its original assignment
-- remains in that gameweek", FANTASY_RULES_V1.md).
--
-- HOW (one writer at a time, AGENTS.md):
--   1. select app_private.fantasy_automation_configure(false);   -- pause tick + worker
--      check app_private.fantasy_worker_lease shows released_at set
--   2. run the block below with rehearse := true  (raises, rolls back)
--   3. run it with rehearse := false
--   4. select app_private.fantasy_automation_configure(true);    -- restore
-- Permanent fix: Batch 2 item F7.
-- ============================================================================

do $fix$
declare
  rehearse constant boolean := true;
  fixture_uuid constant uuid := '352a2360-0167-44a5-8835-bb5ddcd2b4d5';
  expected_assigned constant timestamptz := '2026-10-29 20:00:00+00';
  expected_kickoff constant timestamptz := '2026-10-29 17:00:00+00';
  g app.fantasy_gameweeks%rowtype;
  a app.fantasy_fixture_assignments%rowtype;
  f app.fixtures%rowtype;
  n integer;
  audit_id bigint;
begin
  if exists (select 1 from app_private.fantasy_automation_settings s where s.lifecycle_tick_enabled) then
    raise exception 'fix_gw5: fantasy tick must be paused first';
  end if;
  if exists (select 1 from app_private.fantasy_worker_lease l
             where l.released_at is null and l.expires_at > statement_timestamp()) then
    raise exception 'fix_gw5: a fantasy worker pass holds the lease';
  end if;
  perform app_private.hold_scheduled_jobs();

  select * into a from app.fantasy_fixture_assignments
  where fixture_id = fixture_uuid and superseded_at is null for update;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'fix_gw5: expected exactly one current assignment, found %', n; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'fantasy:calendar:' || a.fantasy_season_id::text, 0));
  select * into g from app.fantasy_gameweeks where id = a.gameweek_id for update;
  select * into f from app.fixtures where id = fixture_uuid for share;

  if g.sequence_number <> 5 or g.status <> 'provisional' or g.closed_at is not null then
    raise exception 'fix_gw5: gameweek not in the expected state (seq %, status %, closed %)',
      g.sequence_number, g.status, g.closed_at;
  end if;
  if a.assigned_kickoff_at is distinct from expected_assigned
     or f.kickoff_at is distinct from expected_kickoff
     or not a.counts_points or a.frozen_at is null
     or a.assignment_status not in ('assigned', 'confirmed', 'reassigned') then
    raise exception 'fix_gw5: assignment/fixture not as expected (assigned %, kickoff %, counts %, frozen %, status %)',
      a.assigned_kickoff_at, f.kickoff_at, a.counts_points, a.frozen_at, a.assignment_status;
  end if;
  if f.status <> 'finished' or f.finalized_at is null or f.finalized_at < f.kickoff_at
     or f.home_score is null or f.away_score is null then
    raise exception 'fix_gw5: fixture not finished as expected';
  end if;
  if g.deadline_at >= f.kickoff_at then
    raise exception 'fix_gw5: the gameweek locked after the real kickoff; not fair to realign';
  end if;

  update app.fantasy_fixture_assignments
  set assigned_kickoff_at = f.kickoff_at
  where id = a.id and assigned_kickoff_at = expected_assigned and superseded_at is null;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'fix_gw5: update touched % rows', n; end if;

  audit_id := app_private.write_admin_audit(
    p_actor_principal_id => null,
    p_action => 'fantasy_fixture.realign_frozen_kickoff',
    p_target_domain => 'fantasy',
    p_target_entity_id => a.id,
    p_reason => 'Owner-approved 2026-10-29: Maghreb Fes v RSB Berkane kicked off 17:00 UTC, not the assigned 20:00; the stale assigned kickoff blocked the Journee 5 selection close and the Journee 6 opening.',
    p_request_id => pg_catalog.gen_random_uuid(),
    p_correlation_id => pg_catalog.gen_random_uuid(),
    p_approval_id => null,
    p_safe_before => jsonb_build_object('gameweekId', g.id, 'gameweekSequence', g.sequence_number,
      'gameweekStatus', g.status, 'fixtureId', f.id, 'kickoffAt', f.kickoff_at,
      'assignedKickoffAt', a.assigned_kickoff_at, 'deadlineAt', g.deadline_at),
    p_safe_after => jsonb_build_object('assignedKickoffAt', f.kickoff_at),
    p_outcome => 'succeeded'::app_private.admin_audit_outcome,
    p_error_code => null,
    p_synthetic_test => false);

  if rehearse then
    raise exception 'fix_gw5 REHEARSAL OK (rolled back): assignment % assigned % -> %, audit id %',
      a.id, a.assigned_kickoff_at, f.kickoff_at, audit_id;
  end if;
  raise notice 'fix_gw5 DONE: assignment % assigned % -> %, audit id %',
    a.id, a.assigned_kickoff_at, f.kickoff_at, audit_id;
end
$fix$;
