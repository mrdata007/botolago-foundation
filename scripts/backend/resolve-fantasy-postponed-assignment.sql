-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Take ONE counted match out of a Fantasy gameweek that has already locked,
-- once the rules no longer keep it there: it was not completed within 48 h of
-- the kickoff the gameweek locked with, whatever held it (postponed,
-- cancelled, abandoned, moved, suspended, never started, stuck live).
--
-- WHEN
--   When the ops check `fantasy_scoring` fails saying a counted match was
--   "not completed within the 48 h the rules allow", and names this file.
--   Such a match holds its gameweek: the gameweek is scored only once every
--   counted match is final, the next one opens only after that, and every
--   manager's team stays locked until then. Before that the check warns: at
--   once for a match postponed, cancelled or abandoned after the lock, or
--   moved too late to be completed within the 48 h, saying until when the
--   rules keep it; and 3 h past its due end for any other match not finished
--   (6 h: it fails, but for the provider's data -- see ALERTS.md -- not for
--   this file).
--   When the check says "a developer is needed" instead, this file cannot
--   help: the match is its gameweek's last counted match, or every counted
--   match of the gameweek is past its 48 h, and the tool refuses a
--   gameweek's last counted match (fantasy_gameweek_needs_a_fixture).
--
-- THE RULE (docs/backend/FANTASY_RULES_V1.md, "Exceptional fixtures and
-- corrections"; docs/backend/FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md, "After
-- the lock")
--   "A fixture completed within 48 hours of its original assignment remains
--   in that gameweek." For 48 h after the kickoff the gameweek locked with,
--   every counted match stays in: if it is completed in that time it counts
--   there, and the gameweek waits for it. The tool refuses it until then
--   (fantasy_postponement_window_open: resolvable from ...); STEP 1 below
--   says, for each held match, from when it can be taken out.
--
--   After that, taking it out is final: nothing puts it back. The match stops
--   counting for its gameweek, exactly as a match postponed before the
--   deadline is deferred, but marked as the owner's decision (resolution
--   operator_deferred). Lineups stay as they were at the deadline. The
--   match's players score nothing from it in that gameweek: they did not
--   play, so a starter of it is replaced from the bench in bench order where
--   the formation allows, and the vice-captain takes the armband from a
--   captain of it. No points are written: the season orchestrator scores the
--   gameweek.
--
--   The gap: the rules say a match completed later "moves to a controlled
--   future assignment", and the game cannot do that yet (no double
--   gameweeks). Taken out, the match counts for no gameweek, unless
--   SportsMonks moves it into a round whose gameweek has not locked yet,
--   which then holds a club twice and cannot open (the ops check
--   `fantasy_gameweek_clubs` says so): tell the developers. Left in and
--   completed later, it counts where it is. Check the match at the league and
--   at SportsMonks before you decide.
--
-- HOW TO RUN
--   Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--   New query.
--   1. Paste this WHOLE file and press Run, as it is. It only reads: it stops
--      with "STEP 1" and lists every counted match the ops check holds against
--      a locked or live gameweek, each with its assignment id and from when it
--      can be taken out. This needs nothing paused.
--   2. Before anything else: make sure no other database work is running, and
--      no Fantasy season orchestrator run either (GitHub -> Actions: it is
--      scheduled at minute 12, and GitHub starts it late, at any minute).
--      Then pause the Fantasy lifecycle tick, as AGENTS.md asks before a write
--      that touches Fantasy (from here on this file refuses while it is on).
--      Note first whether it is on, to put it back:
--        select lifecycle_tick_enabled from app_private.fantasy_automation_settings;
--        select app_private.fantasy_automation_configure(false);
--   3. In the block below, set `target_assignment` to the assignment id of
--      the one match you decided to take out, and `reason` to why (8 to 500
--      characters, an apostrophe written twice as SQL wants it: 'l''équipe';
--      it is kept in the audit trail, app_private.admin_audit_events), for
--      example:
--        target_assignment constant uuid := '5d0e1c9a-...';
--        reason constant text := 'Postponed by the league on 26 Sep, no date before the window ends.';
--      Run the whole file again. This is the
--      DRY RUN: the tool really runs, with every guard, and then the block
--      stops on purpose with "DRY RUN, nothing saved", what the tool did and
--      what the gameweek has left. Run it once more as it is: the message
--      must start "Before: ... counted" again, which proves the first dry run
--      left nothing behind.
--   4. Change `dry_run constant boolean := true;` to `false` and run the whole
--      file again. The result row lists the decisions recorded, this one
--      first. Running it again changes nothing: the tool answers
--      alreadyResolved.
--   5. Whatever the result, switch the tick back on if it was on at step 2:
--        select app_private.fantasy_automation_configure(true);
--      Within 5 minutes the tick takes the gameweek to scoring once its other
--      counted matches are final. Then dispatch the orchestrator rather than
--      waiting for GitHub's schedule: Actions -> Fantasy season orchestrator
--      -> Run workflow on `main`, typing RUN_FANTASY_ORCHESTRATOR.
--   If it stops with a message starting "stop:" or with an error code
--   (fantasy_...), nothing was saved: the code says why
--   (supabase/migrations/20260926003500_fantasy_resolve_postponed_after_lock.sql
--   lists them). Do not edit a check to make it pass: a check firing means the
--   database is not in the state this procedure expects.
--
--   To look again later, without changing anything (a new query):
--     select audit.occurred_at, audit.target_entity_id as assignment_id,
--       audit.safe_before ->> 'fixtureId' as fixture_id, audit.safe_before ->> 'hold' as hold,
--       audit.reason
--     from app_private.admin_audit_events audit
--     where audit.action = 'fantasy_fixture.resolve_frozen_assignment'
--     order by audit.id desc limit 10;
-- ============================================================================

do $resolve$
declare
  -- STEP 3: the assignment id of the one match to take out, from STEP 1.
  target_assignment constant uuid := null;
  -- The decision. operator_deferred is the only one that takes a match out.
  decision constant text := 'operator_deferred';
  -- STEP 3: why, in 8 to 500 characters.
  reason constant text := '';
  -- STEP 4: false saves. As shipped, every run is a dry run.
  dry_run constant boolean := true;
  held text;
  before_state text;
  outcome jsonb;
  left_state text;
begin
  if to_regprocedure('app_private.fantasy_resolve_frozen_assignment(uuid,text,text)') is null then
    raise exception 'stop: app_private.fantasy_resolve_frozen_assignment is not installed -- apply scripts/backend/apply-20260926003500-fantasy-resolve-postponed-after-lock.sql first';
  end if;

  -- STEP 1 (reads only): every counted match of a locked or live gameweek
  -- that the ops check holds against it (20260926003400, fantasy_scoring):
  -- postponed, cancelled or abandoned; moved too late to be completed within
  -- the rules' window (its kickoff + 2 h past it); not finished 3 h past its
  -- due end (kickoff + 2 h); or not finished once the window is over. Each
  -- says from when the tool accepts it: the kickoff the gameweek locked with
  -- plus the ruleset's post-lock completion window (48 h), as the tool
  -- computes it, and whether it is its gameweek's last counted match, which
  -- the tool refuses.
  select string_agg(format('%s GW%s (%s): %s v %s, %s, frozen kickoff %s UTC, now %s UTC, %s%s -- assignment %s',
      season.name, gameweek.sequence_number, gameweek.status, home.short_name, away.short_name,
      fixture.status, to_char(assignment.assigned_kickoff_at at time zone 'UTC', 'DD Mon HH24:MI'),
      to_char(fixture.kickoff_at at time zone 'UTC', 'DD Mon HH24:MI'),
      case
        when fixture_rules.post_lock_completion_window_hours is null
          then 'not resolvable: the season''s ruleset has no post-lock completion window'
        when statement_timestamp() < assignment.assigned_kickoff_at
            + make_interval(hours => fixture_rules.post_lock_completion_window_hours)
          then 'resolvable from ' || to_char((assignment.assigned_kickoff_at
            + make_interval(hours => fixture_rules.post_lock_completion_window_hours)) at time zone 'UTC',
            'DD Mon HH24:MI') || ' UTC (the rules keep it '
            || fixture_rules.post_lock_completion_window_hours || ' h)'
        else 'resolvable since ' || to_char((assignment.assigned_kickoff_at
            + make_interval(hours => fixture_rules.post_lock_completion_window_hours)) at time zone 'UTC',
            'DD Mon HH24:MI') || ' UTC'
      end,
      case when not exists (select 1 from app.fantasy_fixture_assignments other
          where other.gameweek_id = gameweek.id and other.superseded_at is null and other.counts_points
            and other.id <> assignment.id)
        then ', its gameweek''s last counted match: the tool refuses it, a developer is needed' else '' end,
      assignment.id),
    E'\n' order by assignment.assigned_kickoff_at, assignment.id)
  into held
  from app.fantasy_fixture_assignments assignment
  join app.fantasy_gameweeks gameweek on gameweek.id = assignment.gameweek_id
    and gameweek.status in ('locked', 'live')
  join app.fantasy_seasons season on season.id = gameweek.fantasy_season_id
    and season.status in ('registration_open', 'active')
  left join app.fantasy_fixture_rules fixture_rules on fixture_rules.ruleset_id = season.ruleset_id
  join app.fixtures fixture on fixture.id = assignment.fixture_id
  join app.teams home on home.id = fixture.home_team_id
  join app.teams away on away.id = fixture.away_team_id
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

  if target_assignment is null then
    raise exception 'STEP 1, nothing saved. Matches held after the lock:%', coalesce(E'\n' || held,
      ' none: no counted match of a locked or live gameweek is called off, moved too late for the rules'' window, overdue or past it.');
  end if;

  -- AGENTS.md: a write that touches Fantasy runs with the Fantasy lifecycle
  -- tick paused. Only the listing above runs without.
  if exists (select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled) then
    raise exception 'stop: the Fantasy lifecycle tick is on -- pause it first with select app_private.fantasy_automation_configure(false); and switch it back on afterwards';
  end if;

  -- The match as it stands now. After a dry run it must still read
  -- "counted": the dry run rolled back.
  select format('%s v %s (%s), assignment %s in GW%s (%s): %s', home.short_name, away.short_name,
      fixture.status, assignment.id, gameweek.sequence_number, gameweek.status,
      case when assignment.superseded_at is null and assignment.counts_points then 'counted'
        else 'not counted (' || assignment.assignment_status || ', ' || coalesce(assignment.resolution, 'no resolution') || ')' end)
  into before_state
  from app.fantasy_fixture_assignments assignment
  join app.fantasy_gameweeks gameweek on gameweek.id = assignment.gameweek_id
  join app.fixtures fixture on fixture.id = assignment.fixture_id
  join app.teams home on home.id = fixture.home_team_id
  join app.teams away on away.id = fixture.away_team_id
  where assignment.id = target_assignment;
  if before_state is null then
    raise exception 'stop: no Fantasy assignment has the id % -- copy it from the STEP 1 list', target_assignment;
  end if;

  -- The one write: the reviewed tool, with its own guards and locks.
  outcome := app_private.fantasy_resolve_frozen_assignment(target_assignment, decision, reason);

  -- What the gameweek counts once the match is out.
  select string_agg(format('%s v %s (%s)', home.short_name, away.short_name, fixture.status), ', '
      order by fixture.kickoff_at, fixture.id)
  into left_state
  from app.fantasy_fixture_assignments assignment
  join app.fixtures fixture on fixture.id = assignment.fixture_id
  join app.teams home on home.id = fixture.home_team_id
  join app.teams away on away.id = fixture.away_team_id
  where assignment.gameweek_id = (outcome ->> 'gameweekId')::uuid
    and assignment.superseded_at is null and assignment.counts_points;

  if dry_run then
    raise exception 'DRY RUN, nothing saved. Before: %. The tool answered: %. GW% would then count: %. To save it, set dry_run to false and run the whole file again.',
      before_state, outcome, outcome ->> 'gameweekSequence', coalesce(left_state, 'nothing');
  end if;
  raise notice 'SAVED. Before: %. The tool answered: %. GW% now counts: %.',
    before_state, outcome, outcome ->> 'gameweekSequence', coalesce(left_state, 'nothing');
end
$resolve$;

-- Reached only when the block above saved (dry_run false): the decisions
-- recorded, the latest first, and each match's assignment as it now stands.
select audit.occurred_at, audit.target_entity_id as assignment_id,
  audit.safe_before ->> 'gameweekSequence' as gameweek, audit.safe_before ->> 'fixtureId' as fixture_id,
  audit.safe_before ->> 'hold' as hold, audit.safe_before ->> 'fixtureStatus' as fixture_status_then,
  assignment.assignment_status, assignment.resolution, assignment.counts_points, audit.reason
from app_private.admin_audit_events audit
left join app.fantasy_fixture_assignments assignment on assignment.id = audit.target_entity_id
where audit.action = 'fantasy_fixture.resolve_frozen_assignment'
order by audit.id desc
limit 10;
