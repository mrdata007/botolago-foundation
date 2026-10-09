-- Production V2: recover GW3 after the durable-progression migration.
-- Rehearse this entire file, reread the baseline, then change only ROLLBACK
-- to COMMIT. Check all external writers immediately before either execution.
-- Existing owner recovery guards remain intact, including refusal of live fixtures.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select app_private.hold_scheduled_jobs();
create temporary table fantasy_recovery_settings on commit drop as
  select lifecycle_tick_enabled from app_private.fantasy_automation_settings where id;
select app_private.fantasy_automation_configure(false);
do $open$
declare
  -- GW2 -> GW3, 2026/27; GW2's final calculation version.
  previous_id constant uuid := 'd4324127-ce55-4943-973f-4cf2f9a12780';
  next_id constant uuid := '0b455d0b-7289-4c93-b237-8f16ce4b159e';
  calculation constant bigint := 2;
  reason constant text := 'Owner-authorized recovery of GW3 after the completed-price catalog replay outage; preserve carried selections and lock the missed deadline.';
  result jsonb;
  problems text[] := '{}';
begin
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


-- Lock in the same transaction: managers never observe an editable window.
do $lock$
declare state jsonb; attempts integer := 0;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  while (select status='open' from app.fantasy_gameweeks where id='0b455d0b-7289-4c93-b237-8f16ce4b159e') loop
    state := api.service_advance_fantasy_lifecycle('0b455d0b-7289-4c93-b237-8f16ce4b159e',
      (select lock_version from app.fantasy_gameweeks where id='0b455d0b-7289-4c93-b237-8f16ce4b159e'),500);
    attempts := attempts + 1;
    if attempts > 20 then raise exception 'stop: recovery lock batch limit'; end if;
  end loop;
  if exists(select 1 from app.fantasy_lineups where gameweek_id='0b455d0b-7289-4c93-b237-8f16ce4b159e' and locked_at is null) then
    raise exception 'stop: an unlocked lineup remains';
  end if;
  perform set_config('request.jwt.claims','',true);
end;
$lock$;
select app_private.fantasy_automation_configure((select lifecycle_tick_enabled from fantasy_recovery_settings));
select status, (select count(*) from app.fantasy_lineups where gameweek_id=g.id and locked_at is not null) as locked_lineups
from app.fantasy_gameweeks g where id='0b455d0b-7289-4c93-b237-8f16ce4b159e';
rollback;
