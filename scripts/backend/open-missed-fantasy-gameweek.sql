-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Open a Fantasy gameweek whose deadline passed before it could open, and
-- carry every team's lineup into it (app_private.fantasy_open_missed_gameweek,
-- migration 20261004150000). Filled in for GW2 of 2026/27: GW1 was finalized
-- on 2026-10-04, after GW2's deadline (2026-10-02 14:30 UTC) and after all of
-- its matches. Owner decision 2026-10-03: "GW2 carries over".
--
-- WHAT HAPPENS
--   Every active team still on GW1 gets its locked GW1 lineup (squad, captain,
--   vice-captain, bench order) as its GW2 lineup; a team that already has its
--   own GW2 lineup keeps it. GW2 opens with its deadline already past, so no
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
--   to make it pass. Running it again after it opened changes nothing.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $open$
declare
  -- GW1 -> GW2, 2026/27; GW1's final calculation version.
  previous_id constant uuid := '7fcb28c5-9b69-4591-bcda-437c6c961c5c';
  next_id constant uuid := 'd4324127-ce55-4943-973f-4cf2f9a12780';
  calculation constant bigint := 20;
  reason constant text := 'GW2 deadline passed before GW1 could be finalized; owner decision 2026-10-03: GW2 carries over every GW1 lineup.';
  result jsonb;
  problems text[] := '{}';
begin
  result := app_private.fantasy_open_missed_gameweek(previous_id, next_id, calculation, reason);
  raise notice 'open_missed: %', result;

  if (select status from app.fantasy_gameweeks where id = next_id) <> 'open' then
    problems := problems || 'the gameweek is not open'::text;
  end if;
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
  when (select status from app.fantasy_gameweeks where id = 'd4324127-ce55-4943-973f-4cf2f9a12780') = 'open'
    then 'Opened. GW2 carries every GW1 lineup; the lifecycle locks them on its next pass.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
