-- FANT-07: an old round names its players without asking today's buying pool.
--
-- api.get_my_fantasy_points returns each lineup player's id and points, and the
-- screen used to look the id up in api.fantasy_player_pool, which lists only
-- players who are active and eligible today. A player who has since been
-- retired, delisted or made ineligible was dropped from the pitch of a round
-- he scored in, while his points stayed in the total.
--
-- Each player of the payload now also carries `identity`: his name, position,
-- club and club short name, read from his own app.fantasy_players row whether
-- or not that row is active or eligible today. Nothing else changes: the
-- wrapped function (and its ownership and step-up guards), every existing key,
-- the order of the players and the grants are as they were. It is a read.
--
-- What `identity` is, exactly: the season's catalogue row of that fantasy
-- player. The database keeps no per-round copy of a player's club or position
-- (app.fantasy_lineup_players freezes only the price), so if a catalogue row
-- were edited mid-season this reflects the edit. It never reactivates or
-- changes a player; it only stops readability depending on `active`.
--
-- Same wrapping pattern as 20260927140000 and 20261013160200.

alter function api.get_my_fantasy_points(uuid, uuid) rename to get_my_fantasy_points_before_identity;
revoke all on function api.get_my_fantasy_points_before_identity(uuid, uuid)
  from public, anon, authenticated, service_role;

create function api.get_my_fantasy_points(p_team_id uuid, p_gameweek_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare d jsonb;
begin
  -- Authentication, ownership and the step-up guard stay in the wrapped chain.
  d := api.get_my_fantasy_points_before_identity(p_team_id, p_gameweek_id);
  return d || jsonb_build_object('players', coalesce((
    select jsonb_agg(
      player || jsonb_build_object('identity', (
        select jsonb_build_object(
          'name', football_player.display_name,
          'position', position.code,
          'footballTeamId', football_team.id,
          'teamName', football_team.name,
          'teamShortName', football_team.short_name
        )
        from app.fantasy_players fantasy_player
        join app.fantasy_positions position on position.id = fantasy_player.position_id
        join app.players football_player on football_player.id = fantasy_player.football_player_id
        join app.teams football_team on football_team.id = fantasy_player.football_team_id
        where fantasy_player.id = (player ->> 'fantasyPlayerId')::uuid
      ))
      order by ordinal
    )
    from jsonb_array_elements(d -> 'players') with ordinality as lineup(player, ordinal)
  ), '[]'::jsonb));
end $$;

revoke all on function api.get_my_fantasy_points(uuid, uuid) from public, anon;
grant execute on function api.get_my_fantasy_points(uuid, uuid) to authenticated, service_role;

comment on function api.get_my_fantasy_points(uuid, uuid) is
  'Owner-scoped gameweek points for one fantasy team, including the per-player scoring events, the auto-substitutions applied at finalization and, per player, his identity (name, position, club) whether or not he is still in the buying pool.';
