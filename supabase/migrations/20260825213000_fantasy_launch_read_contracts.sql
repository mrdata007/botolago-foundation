begin;

create or replace function api.get_my_fantasy_points(p_team_id uuid, p_gameweek_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare team app.fantasy_teams%rowtype;
declare result jsonb;
begin
  team := app_private.fantasy_assert_owner(p_team_id);
  select jsonb_build_object(
    'teamId', team.id, 'gameweekId', gameweek.id, 'gameweekStatus', gameweek.status,
    'pointsState', gameweek.points_state,
    'result', case when result_row.id is null then null else jsonb_build_object(
      'startingPoints', result_row.starting_points, 'benchPoints', result_row.bench_points,
      'captainPoints', result_row.captain_points, 'transferHit', result_row.transfer_hit,
      'chipType', result_row.chip_type, 'provisionalScore', result_row.provisional_score,
      'finalScore', result_row.final_score, 'state', result_row.state,
      'rank', result_row.rank, 'overallRank', result_row.overall_rank,
      'calculationVersion', result_row.calculation_version,
      'finalizedAt', result_row.finalized_at
    ) end,
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'fantasyPlayerId', lineup_player.fantasy_player_id, 'slot', lineup_player.slot,
      'slotOrder', lineup_player.slot_order, 'captain', lineup_player.captain,
      'viceCaptain', lineup_player.vice_captain, 'multiplier', lineup_player.multiplier,
      'provisionalPoints', coalesce(points.provisional_points, 0),
      'finalPoints', points.final_points,
      'didPlay', coalesce(points.did_play, false),
      'minutesPlayed', coalesce(points.minutes_played, 0)
    ) order by lineup_player.slot, lineup_player.slot_order)
    from app.fantasy_lineups lineup
    join app.fantasy_lineup_players lineup_player on lineup_player.lineup_id = lineup.id
    left join app.fantasy_player_gameweek_points points
      on points.fantasy_player_id = lineup_player.fantasy_player_id
      and points.gameweek_id = gameweek.id
    where lineup.fantasy_team_id = team.id
      and lineup.gameweek_id = gameweek.id), '[]'::jsonb)
  ) into result
  from app.fantasy_gameweeks gameweek
  left join app.fantasy_team_gameweek_results result_row
    on result_row.fantasy_team_id = team.id
    and result_row.gameweek_id = gameweek.id
  where gameweek.id = p_gameweek_id
    and gameweek.fantasy_season_id = team.fantasy_season_id;

  if result is null then
    raise exception using errcode = 'PT404', message = 'data_unavailable';
  end if;
  return result;
end;
$$;

revoke all on function api.get_my_fantasy_points(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function api.get_my_fantasy_points(uuid, uuid)
to authenticated, service_role;

comment on function api.get_my_fantasy_points(uuid, uuid) is
  'Returns an owner-scoped Fantasy points read model with stable pre-match defaults.';

commit;
