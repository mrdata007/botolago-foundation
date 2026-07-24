-- Limit ranking rows on their covering keyset indexes before joining team data.
-- This preserves the public DTO while preventing 10k-member pages from joining
-- and sorting the full league before applying the requested page size.

create or replace function api.fantasy_league_standings(
  p_league_id uuid,
  p_gameweek_id uuid default null,
  p_after_rank bigint default null,
  p_after_team_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare target app.fantasy_leagues%rowtype;
declare items jsonb;
begin
  if p_limit not between 1 and 100 or ((p_after_rank is null) <> (p_after_team_id is null)) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  select * into target
  from app.fantasy_leagues
  where id = p_league_id and active;

  if not found then
    raise exception using errcode = 'PT404', message = 'league_not_found';
  end if;

  if target.visibility = 'private' and not exists (
    select 1
    from app.fantasy_league_memberships membership
    where membership.league_id = target.id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  ) then
    raise exception using errcode = 'PT403', message = 'league_access_denied';
  end if;

  if p_gameweek_id is null and p_after_rank is null then
    with ranked_page as materialized (
      select ranking.fantasy_team_id, ranking.rank, ranking.previous_rank,
        ranking.total_points, ranking.gameweek_points, ranking.calculated_at
      from app.fantasy_rankings ranking
      where ranking.league_id = target.id
        and ranking.gameweek_id is null
      order by ranking.rank, ranking.fantasy_team_id
      limit p_limit
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'teamId', ranked_page.fantasy_team_id, 'teamName', team.name,
      'rank', ranked_page.rank, 'previousRank', ranked_page.previous_rank,
      'totalPoints', ranked_page.total_points,
      'gameweekPoints', ranked_page.gameweek_points,
      'calculatedAt', ranked_page.calculated_at
    ) order by ranked_page.rank, ranked_page.fantasy_team_id), '[]'::jsonb)
    into items
    from ranked_page
    join app.fantasy_teams team on team.id = ranked_page.fantasy_team_id;
  elsif p_gameweek_id is null then
    with ranked_page as materialized (
      select ranking.fantasy_team_id, ranking.rank, ranking.previous_rank,
        ranking.total_points, ranking.gameweek_points, ranking.calculated_at
      from app.fantasy_rankings ranking
      where ranking.league_id = target.id
        and ranking.gameweek_id is null
        and (ranking.rank, ranking.fantasy_team_id) > (p_after_rank, p_after_team_id)
      order by ranking.rank, ranking.fantasy_team_id
      limit p_limit
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'teamId', ranked_page.fantasy_team_id, 'teamName', team.name,
      'rank', ranked_page.rank, 'previousRank', ranked_page.previous_rank,
      'totalPoints', ranked_page.total_points,
      'gameweekPoints', ranked_page.gameweek_points,
      'calculatedAt', ranked_page.calculated_at
    ) order by ranked_page.rank, ranked_page.fantasy_team_id), '[]'::jsonb)
    into items
    from ranked_page
    join app.fantasy_teams team on team.id = ranked_page.fantasy_team_id;
  elsif p_after_rank is null then
    with ranked_page as materialized (
      select ranking.fantasy_team_id, ranking.rank, ranking.previous_rank,
        ranking.total_points, ranking.gameweek_points, ranking.calculated_at
      from app.fantasy_rankings ranking
      where ranking.league_id = target.id
        and ranking.gameweek_id = p_gameweek_id
      order by ranking.rank, ranking.fantasy_team_id
      limit p_limit
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'teamId', ranked_page.fantasy_team_id, 'teamName', team.name,
      'rank', ranked_page.rank, 'previousRank', ranked_page.previous_rank,
      'totalPoints', ranked_page.total_points,
      'gameweekPoints', ranked_page.gameweek_points,
      'calculatedAt', ranked_page.calculated_at
    ) order by ranked_page.rank, ranked_page.fantasy_team_id), '[]'::jsonb)
    into items
    from ranked_page
    join app.fantasy_teams team on team.id = ranked_page.fantasy_team_id;
  else
    with ranked_page as materialized (
      select ranking.fantasy_team_id, ranking.rank, ranking.previous_rank,
        ranking.total_points, ranking.gameweek_points, ranking.calculated_at
      from app.fantasy_rankings ranking
      where ranking.league_id = target.id
        and ranking.gameweek_id = p_gameweek_id
        and (ranking.rank, ranking.fantasy_team_id) > (p_after_rank, p_after_team_id)
      order by ranking.rank, ranking.fantasy_team_id
      limit p_limit
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'teamId', ranked_page.fantasy_team_id, 'teamName', team.name,
      'rank', ranked_page.rank, 'previousRank', ranked_page.previous_rank,
      'totalPoints', ranked_page.total_points,
      'gameweekPoints', ranked_page.gameweek_points,
      'calculatedAt', ranked_page.calculated_at
    ) order by ranked_page.rank, ranked_page.fantasy_team_id), '[]'::jsonb)
    into items
    from ranked_page
    join app.fantasy_teams team on team.id = ranked_page.fantasy_team_id;
  end if;

  return jsonb_build_object(
    'league', jsonb_build_object(
      'id', target.id,
      'name', target.name,
      'visibility', target.visibility,
      'memberCount', target.member_count
    ),
    'items', items
  );
end;
$$;

revoke all on function api.fantasy_league_standings(uuid, uuid, bigint, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function api.fantasy_league_standings(uuid, uuid, bigint, uuid, integer)
  to anon, authenticated, service_role;
