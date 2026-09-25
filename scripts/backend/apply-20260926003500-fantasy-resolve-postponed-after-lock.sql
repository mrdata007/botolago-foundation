-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20260926003500_fantasy_resolve_postponed_after_lock: the
-- owner's tool that takes a counted match out of a Fantasy gameweek that has
-- already locked, once the rules no longer keep it there -- the match was not
-- completed within 48 h of the kickoff the gameweek locked with, whatever held
-- it (postponed, cancelled, abandoned, moved, suspended, never started, stuck
-- live):
--   app_private.fantasy_resolve_frozen_assignment(p_assignment_id uuid,
--     p_resolution text, p_reason text)
--   Database owner only; run through
--   scripts/backend/resolve-fantasy-postponed-assignment.sql.
--   docs/backend/FANTASY_RULES_V1.md keeps a match completed within 48 h of
--   its original assignment in that gameweek, so the tool refuses every
--   counted match (fantasy_postponement_window_open) until 48 h -- the
--   season's ruleset, app.fantasy_fixture_rules.post_lock_completion_window_hours
--   -- after the kickoff the gameweek locked with, and takes out any that is
--   still not finished after that. The rule it applies, its refusals and its
--   locks are in the migration's header.
--   It adds one function and nothing else: no table, grant, schedule or
--   Fantasy row changes, and nothing is resolved by applying it.
--
-- WHEN
--   Right after scripts/backend/apply-20260926003400-ops-health-fantasy-coverage.sql
--   (this one refuses before it): that migration's `fantasy_scoring` check
--   names the procedure this one installs. Not while a Fantasy season
--   orchestrator run is going on (GitHub -> Actions: it is scheduled at
--   minute 12, and GitHub starts it late, at any minute). It needs well
--   under a second.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Make sure no other database work is running right now.
--   2. Pause the Fantasy lifecycle tick, as AGENTS.md asks before a write that
--      touches Fantasy (this script refuses while it is on). Note first
--      whether it is on, to put it back:
--        select lifecycle_tick_enabled from app_private.fantasy_automation_settings;
--        select app_private.fantasy_automation_configure(false);
--   3. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one
--      transaction, checked, and then ROLLED BACK. The result row should say
--      "Rehearsal passed".
--   4. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied", how many counted matches
--      the ops check holds after the lock right now, and how many of them are
--      past their 48 h (the tool refuses the others until then).
--   5. Whatever the result, switch the tick back on if it was on at step 2:
--        select app_private.fantasy_automation_configure(true);
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, before 20260926003400, while the Fantasy tick is
--     on, on a database missing a table or column the tool reads or writes
--     (the ruleset's post-lock completion window included), where the tool
--     already exists, or where what it builds on is not the
--     text production held on 2026-09-25 (md5 read there): the two helpers it
--     calls (app_private.hold_scheduled_jobs, app_private.write_admin_audit),
--     the assignment table's status and resolution checks, and the four
--     functions whose behaviour its rule relies on -- the lifecycle (live to
--     provisional once every counted match is final), the calendar sync
--     (never touches a locked gameweek), and the scoring input and its
--     validation (only current, counted assignments);
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result without writing anything: the tool exists, is
--     SECURITY DEFINER with an empty search_path and carries its comment; no
--     API role can execute it and PUBLIC holds no grant; no api.* function
--     calls it; it refuses a missing assignment, an unsupported resolution, a
--     missing reason and an unknown assignment with its stable codes (all
--     before it reads or locks anything); what it builds on is unchanged; the
--     history row is there. It never resolves anything. It reports how many
--     counted matches the ops check holds after the lock (postponed,
--     cancelled or abandoned; moved too late for the window; not finished 3 h
--     past their due end; or past the window) and how many of them are past
--     their 48 h, so resolvable now.
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
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20260926003500') then
    raise exception 'stop: migration 20260926003500 is already recorded as applied';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260926003400') then
    raise exception 'stop: migration 20260926003400 (the ops checks) is not applied yet -- run scripts/backend/apply-20260926003400-ops-health-fantasy-coverage.sql first';
  end if;

  if to_regclass('app.fantasy_fixture_assignments') is null
    or to_regclass('app.fantasy_gameweeks') is null
    or to_regclass('app.fantasy_seasons') is null
    or to_regclass('app.fantasy_fixture_rules') is null
    or to_regclass('app.fixtures') is null
    or to_regclass('app.fantasy_player_point_events') is null
    or to_regclass('app_private.fantasy_automation_settings') is null
    or to_regclass('app_private.admin_audit_events') is null
    or to_regclass('cron.job_run_details') is null then
    missing := missing || 'a table'::text;
  end if;
  if cardinality(missing) = 0 and (
    select count(*) from pg_catalog.pg_attribute
    where not attisdropped and (attrelid, attname) in (
      ('app.fantasy_fixture_assignments'::regclass, 'fantasy_season_id'),
      ('app.fantasy_fixture_assignments'::regclass, 'gameweek_id'),
      ('app.fantasy_fixture_assignments'::regclass, 'fixture_id'),
      ('app.fantasy_fixture_assignments'::regclass, 'assigned_kickoff_at'),
      ('app.fantasy_fixture_assignments'::regclass, 'assignment_status'),
      ('app.fantasy_fixture_assignments'::regclass, 'resolution'),
      ('app.fantasy_fixture_assignments'::regclass, 'counts_points'),
      ('app.fantasy_fixture_assignments'::regclass, 'frozen_at'),
      ('app.fantasy_fixture_assignments'::regclass, 'superseded_at'),
      ('app.fantasy_gameweeks'::regclass, 'status'),
      ('app.fantasy_seasons'::regclass, 'status'),
      ('app.fantasy_seasons'::regclass, 'ruleset_id'),
      ('app.fantasy_fixture_rules'::regclass, 'ruleset_id'),
      ('app.fantasy_fixture_rules'::regclass, 'post_lock_completion_window_hours'),
      ('app.fixtures'::regclass, 'status'),
      ('app.fixtures'::regclass, 'kickoff_at'),
      ('app.fixtures'::regclass, 'finalized_at'),
      ('app.fantasy_player_point_events'::regclass, 'superseded_at'),
      ('app_private.fantasy_automation_settings'::regclass, 'lifecycle_tick_enabled'),
      ('app_private.admin_audit_events'::regclass, 'safe_before')
    )
  ) <> 20 then
    missing := missing || 'a column'::text;
  end if;
  if to_regprocedure('app_private.hold_scheduled_jobs()') is null
    or to_regprocedure('app_private.write_admin_audit(uuid,text,text,uuid,text,uuid,uuid,uuid,jsonb,jsonb,app_private.admin_audit_outcome,text,boolean)') is null
    or to_regprocedure('api.service_advance_fantasy_lifecycle(uuid,bigint,integer)') is null
    or to_regprocedure('api.service_sync_fantasy_calendar(uuid)') is null
    or to_regprocedure('app_private.fantasy_scoring_input_document(uuid)') is null
    or to_regprocedure('app_private.fantasy_validate_scoring_document(jsonb)') is null then
    missing := missing || 'a function'::text;
  end if;
  if cardinality(missing) > 0 then
    raise exception 'stop: the database is missing what this update builds on: %', missing;
  end if;

  if to_regprocedure('app_private.fantasy_resolve_frozen_assignment(uuid,text,text)') is not null then
    raise exception 'stop: app_private.fantasy_resolve_frozen_assignment already exists, but the migration is not recorded -- find out why before going on';
  end if;

  -- AGENTS.md: a write that touches Fantasy runs with the Fantasy lifecycle
  -- tick paused.
  if exists (select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled) then
    raise exception 'stop: the Fantasy lifecycle tick is on -- pause it first with select app_private.fantasy_automation_configure(false); and switch it back on afterwards';
  end if;

  -- What the tool builds on, as production held it on 2026-09-25 (md5 read
  -- there): the helpers it calls, the assignment checks it writes under, and
  -- the functions whose behaviour its rule relies on.
  if md5(pg_get_functiondef('app_private.hold_scheduled_jobs()'::regprocedure))
      <> 'e0ff799389c935e3844df2620b53ae87'
    or md5(pg_get_functiondef('app_private.write_admin_audit(uuid,text,text,uuid,text,uuid,uuid,uuid,jsonb,jsonb,app_private.admin_audit_outcome,text,boolean)'::regprocedure))
      <> 'a984ded01b8e501ac5264966d05c07fc' then
    raise exception 'stop: a helper the tool calls is not the version this update was reviewed against (20260925200000, 20260724143100)';
  end if;
  if (select md5(pg_get_constraintdef(oid)) from pg_catalog.pg_constraint
      where conrelid = 'app.fantasy_fixture_assignments'::regclass
        and conname = 'fantasy_fixture_assignments_resolution_check')
      is distinct from 'de4222c13d28da1425b2d283c859ead1'
    or (select md5(pg_get_constraintdef(oid)) from pg_catalog.pg_constraint
      where conrelid = 'app.fantasy_fixture_assignments'::regclass
        and conname = 'fantasy_fixture_assignments_status_check')
      is distinct from 'd51423a9c9ab0b0b3eaa80b7508c47a2' then
    raise exception 'stop: the assignment status or resolution check is not the version this update was reviewed against (20260924200000)';
  end if;
  if md5(pg_get_functiondef('api.service_advance_fantasy_lifecycle(uuid,bigint,integer)'::regprocedure))
      <> 'b0d020cfeb680f920cf166aa7d001459'
    or md5(pg_get_functiondef('api.service_sync_fantasy_calendar(uuid)'::regprocedure))
      <> '5eafe7b633373a5001ee0cc8fdece3db'
    or md5(pg_get_functiondef('app_private.fantasy_scoring_input_document(uuid)'::regprocedure))
      <> '9cadeb19011082c929260fc0a5cadd83'
    or md5(pg_get_functiondef('app_private.fantasy_validate_scoring_document(jsonb)'::regprocedure))
      <> '72e4c37911bac985d08267e430569e4e' then
    raise exception 'stop: the lifecycle, the calendar sync or the scoring input is not the version this update was reviewed against (20260924200000, 20260914200719, 20260925110000)';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20260926003500, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260926003500',
  'fantasy_resolve_postponed_after_lock',
  array[$bg_20260926003500_file$-- BotolaGO Production V2
-- Fantasy: the owner can take a counted match out of a gameweek that has
-- already locked, once the rules no longer keep it there: 48 h after the
-- kickoff the gameweek locked with, whatever kept it from finishing
-- (postponed, cancelled, abandoned, moved, suspended, never started, stuck
-- live).
--
-- WHY
--   The lock freezes every assignment of the gameweek (frozen_at), and the
--   lifecycle moves a gameweek from live to provisional only once every
--   counted match is finished and final (20260924200000). Nothing takes a
--   frozen assignment out: the calendar sync and the lock defer postponed
--   matches of unfrozen gameweeks only (fantasy_defer_postponed_assignments),
--   and the sync never touches a locked gameweek. So one match postponed on
--   the day holds its gameweek for as long as it lasts, and with it the next
--   gameweek, which opens only once the previous one is finalized: every
--   manager's team stays locked. Until now the only answer was an owner's
--   hand edit, so the ops check `fantasy_scoring` (20260926003400) was
--   written to warn about such a match without ever failing: a failure would
--   have paged every hour with nothing to run. With this tool it fails again,
--   once the rule below lets the owner act, and names the procedure.
--
-- THE RULE
--   The ruleset's, docs/backend/FANTASY_RULES_V1.md, "Exceptional fixtures
--   and corrections" (the approved launch ruleset; this follows it as written):
--   "Fixture assignment is frozen at the gameweek deadline. A fixture
--   completed within 48 hours of its original assignment remains in that
--   gameweek; later completion moves to a controlled future assignment." The
--   48 h is the ruleset's own post_lock_completion_window_hours
--   (app.fantasy_fixture_rules: 48 in v1.0 and in v1.1, the production
--   season's), counted from the kickoff the gameweek locked with (the
--   assignment's assigned_kickoff_at, frozen at the lock: the calendar sync
--   never realigns it afterwards). The tool and the ops check read that value
--   from the season's ruleset, so they agree. So:
--
--     For 48 h after that kickoff, every counted match of a locked or live
--     gameweek stays in its gameweek, whatever its state: completed in that
--     time, it counts there, and the gameweek waits for it. The tool refuses
--     every one of them (fantasy_postponement_window_open, which says when it
--     becomes resolvable).
--
--     After that, a counted match that is still not finished was not
--     completed within the 48 h, whatever held it -- postponed, cancelled,
--     abandoned, moved, suspended, delayed, never started, or live long after
--     it should have ended -- and the owner takes it out: its assignment is
--     superseded with assignment_status 'deferred', resolution
--     'operator_deferred' and counts_points false -- the row an unfrozen
--     deferral leaves (provider_postponed), marked as the operator's
--     decision. The lineups frozen at the deadline stay exactly as they are.
--     The match's players score nothing from it in that gameweek: for the
--     scoring worker they did not play (no statistics row, 0 minutes), so a
--     starter is replaced from the bench in bench order where the formation
--     allows, the vice-captain takes the armband from a captain who did not
--     play, and Bench Boost counts the bench as usual -- what the site states
--     for a player who does not play ("Le vice-capitaine prend le relais si
--     besoin", fantasy.rules.captaincy_desc; fpl.help.a.captain; "Remplacement
--     automatique"). The site itself states no rule for a postponed match.
--
--   What held the match is recorded as the ops check classes it
--   (20260926003400, fantasy_scoring): 'called_off' (postponed, cancelled or
--   abandoned), 'moved' (a kickoff later than the frozen one and too late for
--   the match to be completed inside the 48 h: kickoff + 2 h, the earliest a
--   match can end, past them), or 'unfinished' (anything else not finished:
--   not started, live, suspended, delayed, or moved to a time at which it
--   could still have been completed in the 48 h). The class describes; it
--   does not decide: after the 48 h every class is resolvable, before them
--   none is.
--
--   The gap. The ruleset says a later completion "moves to a controlled
--   future assignment"; the game cannot do that yet. The calendar sync
--   assigns a match by its provider round and never changes a gameweek that
--   has locked, so once taken out the match counts for no gameweek -- as a
--   deferred match already did once its gameweek had locked. Only if the
--   provider moves it into a round whose gameweek is still scheduled or open
--   does the sync assign it there, and that gameweek then holds a club twice,
--   which the next-gameweek opening refuses (fantasy_next_calendar_incomplete;
--   a round not staged yet is not staged at all, round_incomplete): no double
--   gameweeks yet. The ops check fantasy_gameweek_clubs (20260926003400)
--   reports such a gameweek. Moving a match into a later gameweek is an
--   owner's decision and future work, not this tool's.
--
--   'moved_to_actual_gameweek' is therefore not accepted: it would record
--   that the match moved to the gameweek it is played in, and nothing moves
--   it there. 'provider_postponed' stays the automatic deferral's mark. The
--   other resolutions describe a match that counts where it is. Only
--   'operator_deferred' takes a match out.
--
-- THE TOOL
--   app_private.fantasy_resolve_frozen_assignment(p_assignment_id uuid,
--     p_resolution text, p_reason text) returns jsonb
--   Database owner only (SQL editor), through
--   scripts/backend/resolve-fantasy-postponed-assignment.sql, which lists the
--   candidates and dry-runs it first. No API role can call it, the service
--   role included: taking a match out of a locked gameweek is an owner's
--   decision, never a worker's step.
--
--   It supersedes that one assignment and records an
--   app_private.admin_audit_events row (action
--   fantasy_fixture.resolve_frozen_assignment, the reason, the state before
--   and after), the administrative audit writer the owner-run maintenance
--   scripts use. It writes no points: the scoring worker computes them from
--   the assignments that still count. Called again for an assignment it has
--   resolved, it returns the recorded outcome with alreadyResolved true and
--   writes nothing. It answers that before its one-writer checks and without
--   a lock: a replay needs no paused tick and waits for no scheduled job.
--
--   It refuses, with a stable code and nothing written:
--     22023 fantasy_assignment_required      no assignment named
--     22023 fantasy_resolution_unsupported   any resolution but operator_deferred
--     22023 fantasy_resolution_reason_required  a reason under 8 or over 500
--                                            characters (trimmed)
--     PT404 fantasy_assignment_not_found
--     PT409 fantasy_assignment_not_current   superseded by something else (the
--                                            sync, the lock's deferral, a void)
--     PT409 fantasy_tick_must_be_paused      the Fantasy lifecycle tick is on
--     PT409 scheduled_job_running            a pg_cron job is mid-run (from
--                                            app_private.hold_scheduled_jobs)
--     PT409 fantasy_season_closed
--     PT409 fantasy_gameweek_not_locked      scheduled or open: the calendar
--                                            sync and the lock defer those
--     PT409 fantasy_gameweek_scoring_started provisional or finalizing
--     PT409 fantasy_gameweek_settled         finalized, corrected or cancelled
--     PT409 fantasy_assignment_not_frozen / fantasy_assignment_not_counted
--     PT409 fantasy_fixture_finished         the match counts: nothing to resolve
--     PT409 fantasy_fixture_rules_missing    the season's ruleset has no
--                                            post-lock completion window
--     PT409 fantasy_postponement_window_open: resolvable from DD Mon HH24:MI UTC
--                                            fewer than 48 h (the ruleset's
--                                            window) since the kickoff the
--                                            gameweek locked with: the rules
--                                            keep the match in the gameweek
--     PT409 fantasy_fixture_points_recorded  point events exist for it in this
--                                            gameweek (none should, before
--                                            scoring; the tool never deletes
--                                            points)
--     PT409 fantasy_gameweek_needs_a_fixture it is the gameweek's last counted
--                                            match: with none left the
--                                            lifecycle and the scoring refuse
--                                            the gameweek for good
--   The ops check fantasy_scoring fails for a counted unfinished match exactly
--   when its 48 h end, whatever its class, and names this procedure: the tool
--   accepts a match from that moment and never before. (The check fails
--   earlier, 6 h past a match's due end, when the stored row has stopped
--   following the match: that is the provider data's alarm, not the rules'.)
--   For the gameweek's last counted match, or when every counted match of
--   the gameweek is past its 48 h, the check says a developer is needed
--   instead: this tool refuses the last one, and nothing cancels a gameweek.
--
--   Locks, in the order the other writers take them: the Fantasy tick must be
--   paused (AGENTS.md, one writer at a time) and every pg_cron job is held
--   off until the transaction ends (hold_scheduled_jobs, as the player list
--   update does); then the season's calendar advisory lock (the calendar
--   sync's), the gameweek row FOR UPDATE (the lifecycle's and the scoring
--   worker's), the assignment FOR UPDATE, and the fixture FOR SHARE, so the
--   provider cannot change the match between the check and the write. The
--   gameweek's status, deadline, window and lock_version are left alone.
--
-- Nothing here changes an existing function, table, grant or schedule.

create function app_private.fantasy_resolve_frozen_assignment(
  p_assignment_id uuid,
  p_resolution text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  reason text := btrim(coalesce(p_reason, ''));
  target app.fantasy_fixture_assignments%rowtype;
  gameweek app.fantasy_gameweeks%rowtype;
  season app.fantasy_seasons%rowtype;
  fixture app.fixtures%rowtype;
  hold text;
  audit_id bigint;
  audit_hold text;
  resolved_at timestamptz;
  counted_left integer;
  unfinished_left integer;
  window_hours integer;
  resolvable_at timestamptz;
  touched integer;
begin
  if p_assignment_id is null then
    raise exception using errcode = '22023', message = 'fantasy_assignment_required';
  end if;
  if p_resolution is distinct from 'operator_deferred' then
    raise exception using errcode = '22023', message = 'fantasy_resolution_unsupported',
      detail = 'operator_deferred is the one resolution that takes a match out of a gameweek that has locked.';
  end if;
  if char_length(reason) not between 8 and 500 then
    raise exception using errcode = '22023', message = 'fantasy_resolution_reason_required',
      detail = 'Say why in 8 to 500 characters; it is kept in app_private.admin_audit_events.';
  end if;

  select * into target from app.fantasy_fixture_assignments assignment
  where assignment.id = p_assignment_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_assignment_not_found';
  end if;

  if target.superseded_at is not null then
    -- Already resolved by this tool: the recorded outcome, below. A replay
    -- writes nothing, so it is answered before the one-writer checks and
    -- takes no lock: it needs no paused tick and waits for no scheduled job.
    select audit.id, audit.safe_before ->> 'hold' into audit_id, audit_hold
    from app_private.admin_audit_events audit
    where audit.target_domain = 'fantasy' and audit.target_entity_id = target.id
      and audit.action = 'fantasy_fixture.resolve_frozen_assignment'
      and audit.outcome = 'succeeded'
    order by audit.id desc
    limit 1;
    if audit_id is null or target.frozen_at is null
      or target.assignment_status is distinct from 'deferred'
      or target.resolution is distinct from p_resolution or target.counts_points then
      raise exception using errcode = 'PT409', message = 'fantasy_assignment_not_current';
    end if;
    select * into gameweek from app.fantasy_gameweeks resolved_gameweek
    where resolved_gameweek.id = target.gameweek_id;
    select * into fixture from app.fixtures resolved_fixture
    where resolved_fixture.id = target.fixture_id;
  else
    -- One writer at a time (AGENTS.md): the Fantasy tick paused, no scheduled
    -- job mid-run, and none starts until this transaction ends.
    if exists (select 1 from app_private.fantasy_automation_settings settings
      where settings.lifecycle_tick_enabled) then
      raise exception using errcode = 'PT409', message = 'fantasy_tick_must_be_paused';
    end if;
    perform app_private.hold_scheduled_jobs();
    -- The calendar sync's lock for the season, then the gameweek (the lifecycle
    -- and the scoring worker lock it first), the assignment, and the fixture,
    -- shared, so the provider cannot change the match under the checks below.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'fantasy:calendar:' || target.fantasy_season_id::text, 0));
    select * into gameweek from app.fantasy_gameweeks held_gameweek
    where held_gameweek.id = target.gameweek_id for update;
    select * into target from app.fantasy_fixture_assignments assignment
    where assignment.id = p_assignment_id for update;
    select * into fixture from app.fixtures held_fixture
    where held_fixture.id = target.fixture_id for share;
    -- Superseded between the first read and the lock (the calendar sync, the
    -- lock's deferral, another run of this tool): a new call says by what.
    if target.superseded_at is not null then
      raise exception using errcode = 'PT409', message = 'fantasy_assignment_not_current';
    end if;
  end if;
  select * into season from app.fantasy_seasons fantasy_season
  where fantasy_season.id = gameweek.fantasy_season_id;
  -- FANTASY_RULES_V1.md: a match completed within the ruleset's post-lock
  -- completion window (48 h in v1.0 and v1.1) of the kickoff the gameweek
  -- locked with stays in that gameweek.
  select fixture_rules.post_lock_completion_window_hours into window_hours
  from app.fantasy_fixture_rules fixture_rules
  where fixture_rules.ruleset_id = season.ruleset_id;
  resolvable_at := target.assigned_kickoff_at + make_interval(hours => window_hours);

  select count(*),
    count(*) filter (where not (other_fixture.status = 'finished'
      and other_fixture.finalized_at is not null
      and other_fixture.finalized_at <= statement_timestamp()))
  into counted_left, unfinished_left
  from app.fantasy_fixture_assignments other
  join app.fixtures other_fixture on other_fixture.id = other.fixture_id
  where other.gameweek_id = gameweek.id and other.superseded_at is null
    and other.counts_points and other.id <> target.id;

  if target.superseded_at is not null then
    return jsonb_build_object(
      'schemaVersion', 1, 'assignmentId', target.id, 'fixtureId', fixture.id,
      'gameweekId', gameweek.id, 'gameweekSequence', gameweek.sequence_number,
      'gameweekStatus', gameweek.status, 'fixtureStatus', fixture.status,
      'kickoffAt', fixture.kickoff_at, 'assignedKickoffAt', target.assigned_kickoff_at,
      'hold', audit_hold, 'completionWindowHours', window_hours, 'resolvableFrom', resolvable_at,
      'resolution', target.resolution, 'assignmentStatus', target.assignment_status,
      'countsPoints', target.counts_points, 'resolvedAt', target.superseded_at,
      'countedFixturesLeft', counted_left, 'unfinishedFixturesLeft', unfinished_left,
      'auditEventId', audit_id, 'alreadyResolved', true);
  end if;

  if season.status not in ('registration_open', 'active') then
    raise exception using errcode = 'PT409', message = 'fantasy_season_closed';
  end if;
  if gameweek.status in ('scheduled', 'open') then
    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_not_locked';
  end if;
  if gameweek.status in ('provisional', 'finalizing') then
    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_scoring_started';
  end if;
  if gameweek.status not in ('locked', 'live') then
    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_settled';
  end if;
  if target.frozen_at is null then
    raise exception using errcode = 'PT409', message = 'fantasy_assignment_not_frozen';
  end if;
  if not target.counts_points then
    raise exception using errcode = 'PT409', message = 'fantasy_assignment_not_counted';
  end if;

  -- What held it, as the ops check classes it (20260926003400,
  -- fantasy_scoring): recorded, never decisive.
  hold := case
    when fixture.status = 'finished' then null
    when fixture.status in ('postponed', 'cancelled', 'abandoned') then 'called_off'
    when fixture.kickoff_at > target.assigned_kickoff_at
      and fixture.kickoff_at + interval '2 hours' > resolvable_at then 'moved'
    else 'unfinished' end;
  if hold is null then
    raise exception using errcode = 'PT409', message = 'fantasy_fixture_finished';
  end if;
  -- Inside the window the rules keep the match in the gameweek, whatever
  -- holds it: the gameweek waits for it. After it, whatever holds it, the
  -- match was not completed in time.
  if window_hours is null then
    raise exception using errcode = 'PT409', message = 'fantasy_fixture_rules_missing';
  end if;
  if statement_timestamp() < resolvable_at then
    raise exception using errcode = 'PT409',
      message = 'fantasy_postponement_window_open: resolvable from '
        || to_char(resolvable_at at time zone 'UTC', 'DD Mon HH24:MI') || ' UTC',
      detail = 'The rules keep a match in its gameweek if it is completed within ' || window_hours
        || ' h of the kickoff the gameweek locked with (docs/backend/FANTASY_RULES_V1.md).';
  end if;
  if exists (select 1 from app.fantasy_player_point_events point_event
    where point_event.gameweek_id = gameweek.id and point_event.fixture_id = fixture.id
      and point_event.superseded_at is null) then
    raise exception using errcode = 'PT409', message = 'fantasy_fixture_points_recorded';
  end if;
  if counted_left = 0 then
    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_needs_a_fixture';
  end if;

  update app.fantasy_fixture_assignments assignment
  set superseded_at = statement_timestamp(),
      assignment_status = 'deferred',
      resolution = p_resolution,
      counts_points = false
  where assignment.id = target.id and assignment.superseded_at is null
  returning assignment.superseded_at into resolved_at;
  get diagnostics touched = row_count;
  if touched <> 1 then
    raise exception using errcode = 'PT409', message = 'fantasy_assignment_not_current';
  end if;

  audit_id := app_private.write_admin_audit(
    p_actor_principal_id => null,
    p_action => 'fantasy_fixture.resolve_frozen_assignment',
    p_target_domain => 'fantasy',
    p_target_entity_id => target.id,
    p_reason => reason,
    p_request_id => pg_catalog.gen_random_uuid(),
    p_correlation_id => pg_catalog.gen_random_uuid(),
    p_approval_id => null,
    p_safe_before => jsonb_build_object(
      'gameweekId', gameweek.id, 'gameweekSequence', gameweek.sequence_number,
      'gameweekStatus', gameweek.status, 'fixtureId', fixture.id,
      'fixtureStatus', fixture.status, 'kickoffAt', fixture.kickoff_at,
      'assignedKickoffAt', target.assigned_kickoff_at,
      'hold', hold, 'completionWindowHours', window_hours, 'resolvableFrom', resolvable_at,
      'assignmentStatus', target.assignment_status,
      'resolution', target.resolution, 'countsPoints', target.counts_points,
      'frozenAt', target.frozen_at),
    p_safe_after => jsonb_build_object(
      'assignmentStatus', 'deferred', 'resolution', p_resolution, 'countsPoints', false,
      'supersededAt', resolved_at, 'countedFixturesLeft', counted_left,
      'unfinishedFixturesLeft', unfinished_left),
    p_outcome => 'succeeded'::app_private.admin_audit_outcome,
    p_error_code => null,
    p_synthetic_test => false
  );

  return jsonb_build_object(
    'schemaVersion', 1, 'assignmentId', target.id, 'fixtureId', fixture.id,
    'gameweekId', gameweek.id, 'gameweekSequence', gameweek.sequence_number,
    'gameweekStatus', gameweek.status, 'fixtureStatus', fixture.status,
    'kickoffAt', fixture.kickoff_at, 'assignedKickoffAt', target.assigned_kickoff_at,
    'hold', hold, 'completionWindowHours', window_hours, 'resolvableFrom', resolvable_at,
    'resolution', p_resolution, 'assignmentStatus', 'deferred', 'countsPoints', false,
    'resolvedAt', resolved_at,
    'countedFixturesLeft', counted_left, 'unfinishedFixturesLeft', unfinished_left,
    'auditEventId', audit_id, 'alreadyResolved', false);
end;
$$;
revoke all on function app_private.fantasy_resolve_frozen_assignment(uuid, text, text)
  from public, anon, authenticated, service_role;
comment on function app_private.fantasy_resolve_frozen_assignment(uuid, text, text) is
  'Owner only, from the SQL editor (scripts/backend/resolve-fantasy-postponed-assignment.sql): takes one counted, frozen assignment of a locked or live gameweek out of it once the ruleset''s post-lock completion window (48 h, FANTASY_RULES_V1.md) since the kickoff the gameweek locked with has passed and the match is still not finished, whatever held it (postponed, cancelled, abandoned, moved, suspended, never started, still live: the fantasy_scoring check''s classes, recorded as its hold); before that it refuses every match (fantasy_postponement_window_open). Supersedes it (assignment_status deferred, resolution operator_deferred, counts_points false) and records app_private.admin_audit_events (fantasy_fixture.resolve_frozen_assignment) with the reason. Writes no points and never moves the match to another gameweek. Idempotent: a repeat returns the recorded outcome with alreadyResolved true, before the one-writer checks and without a lock. Otherwise refuses while the Fantasy tick is on.';
$bg_20260926003500_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20260926003500 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20260926003500'
  );
begin
  if encode(sha256(convert_to(part_20260926003500, 'UTF8')), 'hex')
    is distinct from 'f29a54619386d18c31769e88d5cf1f2b5bbbd14aca71ef82f9f1ff94a4e46259' then
    raise exception 'stop: 20260926003500 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20260926003500;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (reads only; the probes are refused before the
-- tool reads or locks anything)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  api_role text;
  probe record;
  held integer;
  resolvable integer;
begin
  -- The tool: owner only, SECURITY DEFINER, empty search_path, documented.
  if not (select prosecdef and proconfig @> array['search_path=""']
          and obj_description(oid, 'pg_proc') is not null
          from pg_catalog.pg_proc
          where oid = 'app_private.fantasy_resolve_frozen_assignment(uuid,text,text)'::regprocedure) then
    problems := problems || 'the tool is not SECURITY DEFINER with an empty search_path and its comment'::text;
  end if;
  foreach api_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(api_role, 'app_private.fantasy_resolve_frozen_assignment(uuid,text,text)', 'execute') then
      problems := problems || (api_role || ' can run the owner-only tool');
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_proc p, aclexplode(p.proacl) acl
    where p.oid = 'app_private.fantasy_resolve_frozen_assignment(uuid,text,text)'::regprocedure
      and acl.grantee = 0) then
    problems := problems || 'PUBLIC holds a grant on the tool'::text;
  end if;
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and p.prosrc like '%fantasy_resolve_frozen_assignment%') then
    problems := problems || 'an api.* function calls the tool'::text;
  end if;

  -- Its refusals, each with its stable code, none of which reads or locks a
  -- row: no assignment, an unsupported resolution, no reason, an unknown id.
  for probe in
    select * from (values
      (null::uuid, 'operator_deferred', 'Postflight probe of the apply script.', '22023', 'fantasy_assignment_required'),
      ('00000000-0000-4000-8000-000000000000'::uuid, 'moved_to_actual_gameweek',
        'Postflight probe of the apply script.', '22023', 'fantasy_resolution_unsupported'),
      ('00000000-0000-4000-8000-000000000000'::uuid, 'operator_deferred', ' short ', '22023',
        'fantasy_resolution_reason_required'),
      ('00000000-0000-4000-8000-000000000000'::uuid, 'operator_deferred',
        'Postflight probe of the apply script.', 'PT404', 'fantasy_assignment_not_found')
    ) as refusal(assignment_id, resolution, reason, code, message)
  loop
    begin
      perform app_private.fantasy_resolve_frozen_assignment(probe.assignment_id, probe.resolution, probe.reason);
      problems := problems || ('not refused: ' || probe.message);
    exception when others then
      if sqlstate <> probe.code or sqlerrm <> probe.message then
        problems := problems || ('refused with ' || sqlstate || ' ' || sqlerrm || ' instead of ' || probe.message);
      end if;
    end;
  end loop;

  -- What it builds on is unchanged.
  if md5(pg_get_functiondef('app_private.hold_scheduled_jobs()'::regprocedure))
      <> 'e0ff799389c935e3844df2620b53ae87'
    or md5(pg_get_functiondef('app_private.write_admin_audit(uuid,text,text,uuid,text,uuid,uuid,uuid,jsonb,jsonb,app_private.admin_audit_outcome,text,boolean)'::regprocedure))
      <> 'a984ded01b8e501ac5264966d05c07fc'
    or md5(pg_get_functiondef('api.service_advance_fantasy_lifecycle(uuid,bigint,integer)'::regprocedure))
      <> 'b0d020cfeb680f920cf166aa7d001459'
    or md5(pg_get_functiondef('api.service_sync_fantasy_calendar(uuid)'::regprocedure))
      <> '5eafe7b633373a5001ee0cc8fdece3db'
    or md5(pg_get_functiondef('app_private.fantasy_scoring_input_document(uuid)'::regprocedure))
      <> '9cadeb19011082c929260fc0a5cadd83'
    or md5(pg_get_functiondef('app_private.fantasy_validate_scoring_document(jsonb)'::regprocedure))
      <> '72e4c37911bac985d08267e430569e4e' then
    problems := problems || 'what the tool builds on changed'::text;
  end if;

  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260926003500') then
    problems := problems || 'history row missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;

  -- For the owner: the counted matches the ops check holds after the lock
  -- right now (20260926003400, fantasy_scoring; the set
  -- scripts/backend/resolve-fantasy-postponed-assignment.sql lists), and how
  -- many of them are past the ruleset's completion window (48 h after the
  -- kickoff the gameweek locked with), so the tool would take them out.
  select count(*),
    count(*) filter (where statement_timestamp() >= assignment.assigned_kickoff_at
      + make_interval(hours => fixture_rules.post_lock_completion_window_hours))
  into held, resolvable
  from app.fantasy_fixture_assignments assignment
  join app.fantasy_gameweeks gameweek on gameweek.id = assignment.gameweek_id
    and gameweek.status in ('locked', 'live')
  join app.fantasy_seasons season on season.id = gameweek.fantasy_season_id
    and season.status in ('registration_open', 'active')
  left join app.fantasy_fixture_rules fixture_rules on fixture_rules.ruleset_id = season.ruleset_id
  join app.fixtures fixture on fixture.id = assignment.fixture_id
  where assignment.superseded_at is null and assignment.counts_points
    and fixture.status <> 'finished'
    and (fixture.status in ('postponed', 'cancelled', 'abandoned')
      or (fixture.kickoff_at > assignment.assigned_kickoff_at
        and fixture.kickoff_at + interval '2 hours' > assignment.assigned_kickoff_at
          + make_interval(hours => coalesce(fixture_rules.post_lock_completion_window_hours, 48)))
      or fixture.kickoff_at + interval '2 hours' < statement_timestamp() - interval '3 hours'
      or assignment.assigned_kickoff_at
        + make_interval(hours => coalesce(fixture_rules.post_lock_completion_window_hours, 48))
        <= statement_timestamp());
  raise notice 'counted matches held after the lock right now: %, past their completion window (resolvable now): %',
    held, resolvable;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20260926003500')
    then 'Applied. app_private.fantasy_resolve_frozen_assignment is installed; ' || (
      select 'counted matches held after the lock right now: ' || count(*)
        || ', past their completion window (resolvable now): '
        || count(*) filter (where statement_timestamp() >= assignment.assigned_kickoff_at
          + make_interval(hours => fixture_rules.post_lock_completion_window_hours))
      from app.fantasy_fixture_assignments assignment
      join app.fantasy_gameweeks gameweek on gameweek.id = assignment.gameweek_id
        and gameweek.status in ('locked', 'live')
      join app.fantasy_seasons season on season.id = gameweek.fantasy_season_id
        and season.status in ('registration_open', 'active')
      left join app.fantasy_fixture_rules fixture_rules on fixture_rules.ruleset_id = season.ruleset_id
      join app.fixtures fixture on fixture.id = assignment.fixture_id
      where assignment.superseded_at is null and assignment.counts_points
        and fixture.status <> 'finished'
        and (fixture.status in ('postponed', 'cancelled', 'abandoned')
          or (fixture.kickoff_at > assignment.assigned_kickoff_at
            and fixture.kickoff_at + interval '2 hours' > assignment.assigned_kickoff_at
              + make_interval(hours => coalesce(fixture_rules.post_lock_completion_window_hours, 48)))
          or fixture.kickoff_at + interval '2 hours' < statement_timestamp() - interval '3 hours'
          or assignment.assigned_kickoff_at
            + make_interval(hours => coalesce(fixture_rules.post_lock_completion_window_hours, 48))
            <= statement_timestamp()))
      || ' (scripts/backend/resolve-fantasy-postponed-assignment.sql lists them)'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
