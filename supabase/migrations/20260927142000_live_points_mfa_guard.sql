-- Keep the public points entry point explicitly covered by the MFA guard.
-- The inner RPC retains its ownership and MFA checks as well.
create or replace function api.get_my_fantasy_points(p_team_id uuid,p_gameweek_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d jsonb; details jsonb;
begin
 perform app_private.assert_mfa_step_up();
 -- Existing ownership, authentication and MFA guards remain in the wrapped RPC.
 d:=api.get_my_fantasy_points_before_live(p_team_id,p_gameweek_id);
 select scoring_details into details from app.fantasy_team_gameweek_results
 where fantasy_team_id=p_team_id and gameweek_id=p_gameweek_id;
 if details is not null then
   d:=d||jsonb_build_object('players',(select jsonb_agg(player||jsonb_build_object('multiplier',
     (select r->'multiplier' from jsonb_array_elements(details->'players') r
       where r->>'fantasyPlayerId'=player->>'fantasyPlayerId')) order by ord)
     from jsonb_array_elements(d->'players') with ordinality x(player,ord)));
 end if;
 return d||jsonb_build_object('incrementalScoring',app_private.fantasy_live_scoring_enabled(p_gameweek_id));
end $$;
revoke all on function api.get_my_fantasy_points(uuid,uuid) from public,anon;
grant execute on function api.get_my_fantasy_points(uuid,uuid) to authenticated,service_role;
