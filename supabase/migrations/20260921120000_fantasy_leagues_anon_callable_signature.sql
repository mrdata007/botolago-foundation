-- api.fantasy_leagues could not be called by an anonymous visitor.
--
-- /fantasy/rankings hung for ~12s and then showed "Une erreur est survenue".
-- The POST came back 401 with Postgres 42501, "permission denied for schema app".
--
-- The function body was never the problem. It is SECURITY DEFINER, owned by
-- postgres, with search_path pinned to '' -- it reads app.* perfectly well. The
-- problem is one step earlier, in the SIGNATURE:
--
--   p_visibility app.fantasy_league_visibility
--
-- An argument is coerced to its parameter type in the CALLER's context, before
-- the definer body is entered. Naming a type in schema `app` therefore requires
-- the caller to hold USAGE on `app` -- and `anon` deliberately does not have it.
-- `authenticated` does, which is why this only ever failed for signed-out
-- visitors, and why it looked like an intermittent regression: the call
-- succeeds when p_visibility is omitted (the DEFAULT is evaluated inside the
-- function), and fails the moment the client sends "public", which the
-- rankings page does.
--
-- Verified against production before this migration:
--   anon,          p_visibility supplied -> 42501 permission denied for schema app
--   anon,          p_visibility omitted  -> OK
--   authenticated, p_visibility supplied -> OK
--
-- The fix is to take the argument as text and resolve the enum INSIDE the
-- definer body, where `app` is reachable. Note what this deliberately does NOT
-- do: it does not grant anon USAGE on schema `app`. That would have fixed the
-- symptom by opening the entire private schema to anonymous callers, which is
-- the opposite of what this API boundary exists for.
--
-- Nothing about who may see which league changes. The grants are identical, the
-- function is still SECURITY DEFINER with an empty search_path, and the
-- visibility predicate below is byte-for-byte the previous one: a league is
-- returned only when it is public, or when the caller is an active member.
--
-- api.fantasy_leagues is the only anon-callable function in `api` that named an
-- app-schema type in its signature; every other one is authenticated-only, and
-- `authenticated` holds USAGE on `app`. So this is the whole blast radius.

-- The parameter type changes, so this is a different signature: drop the old
-- one rather than leaving two overloads for PostgREST to choose between.
drop function if exists api.fantasy_leagues(uuid, app.fantasy_league_visibility, integer);

create function api.fantasy_leagues(
  p_season_id uuid,
  p_visibility text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  result jsonb;
  v_visibility app.fantasy_league_visibility;
begin
  if p_limit not between 1 and 100 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  -- Resolve the enum here, where `app` is in reach. An unknown value is a
  -- client error, not a 500: report it the same way the limit check does,
  -- rather than letting a raw cast failure surface as an invalid_text_-
  -- representation from inside the function.
  if p_visibility is not null then
    begin
      v_visibility := p_visibility::app.fantasy_league_visibility;
    exception when invalid_text_representation then
      raise exception using errcode = 'PT400', message = 'validation_failed';
    end;
  end if;

  with visible as (
    select league.id, league.name, league.visibility, league.member_count,
      league.invite_code_hint, membership.role,
      ranking.rank, ranking.previous_rank, ranking.total_points,
      leader.name as leader_name
    from app.fantasy_leagues league
    left join app.fantasy_league_memberships membership
      on membership.league_id = league.id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
    left join app.fantasy_teams member_team on member_team.id = membership.fantasy_team_id
    left join app.fantasy_rankings ranking
      on ranking.league_id = league.id and ranking.fantasy_team_id = member_team.id
      and ranking.gameweek_id is null
    left join lateral (
      select ranked_team.name
      from app.fantasy_rankings leader_rank
      join app.fantasy_teams ranked_team on ranked_team.id = leader_rank.fantasy_team_id
      where leader_rank.league_id = league.id and leader_rank.gameweek_id is null
      order by leader_rank.rank, leader_rank.fantasy_team_id limit 1
    ) leader on true
    where league.fantasy_season_id = p_season_id and league.active
      and (v_visibility is null or league.visibility = v_visibility)
      and (league.visibility = 'public' or membership.id is not null)
    order by league.member_count desc, league.id
    limit p_limit
  )
  select jsonb_build_object('items', coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'visibility', visibility,
    'memberCount', member_count, 'inviteCodeHint', invite_code_hint,
    'role', role, 'rank', rank, 'previousRank', previous_rank,
    'totalPoints', total_points, 'leaderName', leader_name
  ) order by member_count desc, id), '[]'::jsonb)) into result from visible;

  return result;
end;
$function$;

-- Dropping the function dropped its ACL with it. Restore exactly what was
-- there: {postgres=X, anon=X, authenticated=X, service_role=X}.
revoke all on function api.fantasy_leagues(uuid, text, integer) from public;
grant execute on function api.fantasy_leagues(uuid, text, integer)
  to anon, authenticated, service_role;
