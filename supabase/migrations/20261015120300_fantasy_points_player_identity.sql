-- FANT-07 (part): an old round can name a player who has left today's buying pool.
--
-- api.get_my_fantasy_points returns each lineup player's id and points, and the
-- screen used to look the id up in api.fantasy_player_pool, which lists only
-- players who are active and eligible today. A player who has since been
-- retired, delisted or made ineligible was dropped from the pitch of a round
-- he scored in, while his points stayed in the total.
--
-- Each player of the payload now also carries `identity`: his name, position,
-- club and club short name, read from his own app.fantasy_players row whether
-- or not that row is active or eligible today. The wrapped function (with its
-- ownership and step-up guards), every existing key, the order of the players
-- and the grants are as they were. It is a read. The one other difference: a
-- payload with no `players` key now has `players: []` (coalesce below).
--
-- What this does NOT do: it is not the player as of that round. `identity` is
-- the season's current catalogue row of the fantasy player, and a mid-season
-- transfer updates football_team_id on that same row (20260925200000,
-- 20260926060000), so a transferred player's old round shows his CURRENT club;
-- a position edit would show the same way. The database keeps no per-round copy
-- (app.fantasy_lineup_players freezes only the price). Club history for
-- transferred players needs either a snapshot taken when the lineup is saved or
-- the app.team_memberships row valid at the gameweek's date, the way
-- app_private.fantasy_player_fixture_modes reads it. Neither is done here.
-- It never reactivates or changes a player.
--
-- Same wrapping pattern as 20260927140000 and 20261013160200. The outer
-- function applies the ordinary-account step-up itself (as 20261013160200
-- does): ordinary_account_mfa_step_up_reads.test.sql counts the api functions
-- whose own code does, and the renamed inner function is no longer executable.

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
  perform app_private.assert_mfa_step_up();
  -- Ownership, authentication and the same step-up also remain in the wrapped RPC.
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
