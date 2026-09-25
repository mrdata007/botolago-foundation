-- BotolaGO Production V2
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
