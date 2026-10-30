-- BotolaGO Production V2
-- Item F7: a counted match whose kickoff moved after the journée locked, and
-- which was completed within the rules' window, no longer blocks the
-- selection close.
--
-- What happened. On 29 Oct 2026 Maghreb Fès v RSB Berkane was booked in the
-- Fantasy calendar for 20:00 and kicked off at 17:00. Every team of the journée
-- had been locked on 24 Oct, before both times. api.service_begin_fantasy_
-- selection_close (20261020103533) refuses a counted match whose kickoff is
-- different from the kickoff the assignment was frozen with
-- (f.kickoff_at is distinct from a.assigned_kickoff_at), so the close, and with
-- it the opening of the next journée, failed on every worker pass.
--
-- The smallest correct change. Keep the guard, relax it for exactly the case
-- the rules already allow: a match that is FINISHED and was completed within
-- the ruleset's post-lock completion window (48 h, app.fantasy_fixture_rules.
-- post_lock_completion_window_hours) of the kickoff the journée locked with
-- stays in the journée. The fairness guard is kept in full: no team's lineup
-- may have locked AFTER the real kickoff (the lock must precede the real
-- kickoff). Nothing is written to the assignment: realigning
-- assigned_kickoff_at would rewrite a frozen record, and the close receipt
-- already carries the input digest.
--
-- Everything else in the function is unchanged. A match moved past the window,
-- one that is not finished, or one that started before a lineup locked still
-- refuses with fantasy_selection_matches_unfinished.

do $f7$
declare
  source text;
  changed text;
  old_check constant text := 'f.kickoff_at is distinct from a.assigned_kickoff_at';
  new_check constant text := $new$(f.kickoff_at is distinct from a.assigned_kickoff_at and not (
         f.status='finished' and f.finalized_at is not null
         and f.finalized_at<=a.assigned_kickoff_at+make_interval(hours=>coalesce(
           (select r.post_lock_completion_window_hours from app.fantasy_fixture_rules r where r.ruleset_id=s.ruleset_id),48))
         and not exists(select 1 from app.fantasy_lineups l where l.gameweek_id=g.id and l.locked_at>f.kickoff_at)))$new$;
begin
  if md5((select prosrc from pg_proc where oid = 'api.service_begin_fantasy_selection_close(uuid,bigint)'::regprocedure))
    is distinct from 'a8ff68656a09cf6a52c30197f42c6cc8' then
    raise exception 'selection_close_moved_match_unexpected_previous_body';
  end if;
  source := pg_get_functiondef('api.service_begin_fantasy_selection_close(uuid,bigint)'::regprocedure);
  if (length(source) - length(replace(source, old_check, ''))) <> length(old_check) then
    raise exception 'selection_close_moved_match_anchor_not_unique';
  end if;
  changed := replace(source, old_check, new_check);
  execute changed;
end
$f7$;

comment on function api.service_begin_fantasy_selection_close(uuid, bigint) is
  'Service role: carry a provisional journée over (selection-only close). A counted match whose kickoff moved after the lock is accepted when it is finished, completed within the ruleset''s post-lock window of the locked kickoff, and every lineup locked before its real kickoff (20261030100100).';
