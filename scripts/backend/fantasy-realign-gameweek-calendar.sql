-- RETIRED on 2026-09-24. Do not run; it refuses to.
--
-- This hand-run repair was written for one calendar state that no longer
-- exists (see git history for its text and its reasoning). Since migration
-- 20260924200000_fantasy_postponement_and_enrolment the calendar sync and
-- the lifecycle handle postponed fixtures themselves: a postponed fixture is
-- deferred (resolution provider_postponed), never anchors or freezes a
-- deadline, and never blocks the lock; a new manager joins the next
-- gameweek once the current deadline has passed.
--
-- Production repair of the 2026-09-24 GW1 state: scripts/backend/apply-20260924-launch-fixes.sql
-- Operator procedure: docs/backend/FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md

do $retired$
begin
  raise exception 'retired: scripts/backend/fantasy-realign-gameweek-calendar.sql must not be run -- see its header';
end
$retired$;
