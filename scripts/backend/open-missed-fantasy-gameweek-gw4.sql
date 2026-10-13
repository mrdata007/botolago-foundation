-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Open a Fantasy gameweek whose deadline passed before it could open, and
-- carry every team's lineup into it (app_private.fantasy_open_missed_gameweek,
-- migration 20261004150000). Filled in for GW4 of 2026/27: GW3 could not be
-- finalized before GW4's deadline (2026-10-12 18:30 UTC) because three of its
-- matches had no SofaScore statistics yet. Same procedure as GW2 on
-- 2026-10-04: GW4 carries every GW3 lineup.
--
-- WHAT HAPPENS
--   Every active team still on GW3 gets its locked GW3 lineup (squad, captain,
--   vice-captain, bench order) as its GW4 lineup; a team that already has its
--   own GW4 lineup keeps it. GW4 opens with its deadline already past, so no
--   manager can change anything, and the lifecycle (the manual worker, or the
--   tick) locks every lineup on its next pass. Chips are not carried: a chip is
--   played for one gameweek. The owner's reason is kept in
--   app_private.admin_audit_events (fantasy_gameweek.open_missed).
--
-- HOW TO RUN
--   Check nothing else is writing (AGENTS.md): the Fantasy tick off (the tool
--   refuses otherwise), no worker or import running, live refresh paused.
--   Run the WHOLE file. As shipped it is a REHEARSAL (rolled back; "Rehearsal
--   passed"). Change `rollback;` near the bottom to `commit;` and run again
--   ("Opened"). A failed check stops it with nothing saved; do not edit a check
--   to make it pass. Running it again after it opened changes nothing, also
--   once the lifecycle has moved the gameweek on (locked, live, ...).
--
-- AFTERWARDS
--   Put back what you paused, as AGENTS.md says: the live refresh
--   (select app_private.notification_email_configure(<mode>, null, null, true);)
--   and, if it was on before, the Fantasy tick
--   (select app_private.fantasy_automation_configure(true);). Until the tick
--   or the manual worker makes its next pass, the gameweek stays open with
--   its deadline past: nobody can change a lineup, and nothing is scored.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $open$
declare
  -- GW3 -> GW4, 2026/27. GW3's final calculation version is read below: it is
  -- only known once GW3 is finalized, and the tool refuses any other value.
  previous_id constant uuid := '0b455d0b-7289-4c93-b237-8f16ce4b159e';
  next_id constant uuid := '3c37ffb7-e2c8-4662-a1ee-4a52f76ad1c2';
  calculation bigint := (select scoring_input_version from app.fantasy_gameweeks where id = '0b455d0b-7289-4c93-b237-8f16ce4b159e');
  reason constant text := 'GW4 deadline (2026-10-12 18:30 UTC) passed before GW3 could be finalized (three matches waited for SofaScore statistics); owner decision 2026-10-13: GW4 carries over every GW3 lineup.';
  result jsonb;
  problems text[] := '{}';
begin
  if (select status from app.fantasy_gameweeks where id = previous_id) <> 'finalized' then
    raise exception 'stop: GW3 is not finalized yet; finalize it first (the points job), then run this';
  end if;
  result := app_private.fantasy_open_missed_gameweek(previous_id, next_id, calculation, reason);
  raise notice 'open_missed: %', result;

  -- Open now, or already moved on by the lifecycle when this is a repeat.
  if (select status from app.fantasy_gameweeks where id = next_id)
      not in ('open', 'locked', 'live', 'provisional', 'finalizing', 'finalized')
    or not exists (select 1 from app_private.fantasy_gameweek_progressions journal
      where journal.previous_gameweek_id = previous_id and journal.next_gameweek_id = next_id
        and journal.opened_at is not null) then
    problems := problems || 'the gameweek is not opened'::text;
  end if;
  -- The opening run itself: every active team is on the gameweek with a full
  -- lineup. (A repeat checks only the journal above: teams move on later.)
  if not coalesce((result->>'alreadyOpened')::boolean, false) then
    if exists (select 1 from app.fantasy_teams team
      join app.fantasy_gameweeks gameweek on gameweek.id = next_id
      where team.fantasy_season_id = gameweek.fantasy_season_id and team.status = 'active'
        and (team.current_gameweek_id is distinct from next_id
          or not exists (select 1 from app.fantasy_lineups lineup
            where lineup.fantasy_team_id = team.id and lineup.gameweek_id = next_id))) then
      problems := problems || 'an active team has no lineup for the gameweek'::text;
    end if;
    if exists (select 1 from app.fantasy_lineups lineup
      where lineup.gameweek_id = next_id
        and (select count(*) from app.fantasy_lineup_players player where player.lineup_id = lineup.id) <> 15) then
      problems := problems || 'a lineup is not 15 players'::text;
    end if;
  end if;
  if cardinality(problems) > 0 then
    raise exception 'stop: the opening did not check out: %', problems;
  end if;
end
$open$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To open for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from app_private.fantasy_gameweek_progressions journal
    where journal.previous_gameweek_id = '0b455d0b-7289-4c93-b237-8f16ce4b159e'
      and journal.next_gameweek_id = '3c37ffb7-e2c8-4662-a1ee-4a52f76ad1c2' and journal.opened_at is not null)
    then 'Opened. GW4 carries every GW3 lineup; the lifecycle locks them on its next pass.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
