begin;

create or replace function api.fantasy_global_rankings(
  p_season_id uuid,
  p_gameweek_id uuid default null,
  p_sort text default 'overall',
  p_query text default null,
  p_page integer default 1,
  p_limit integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_query text := nullif(lower(btrim(p_query)), '');
  target_gameweek_id uuid :=
    case when p_sort = 'gameweek' then p_gameweek_id else null end;
  current_user_id uuid := auth.uid();
  page_offset integer;
  result jsonb;
begin
  if p_season_id is null
    or p_sort is null
    or p_sort not in ('overall', 'gameweek')
    or p_page is null
    or p_page not between 1 and 10000
    or p_limit is null
    or p_limit not between 1 and 100
    or (p_query is not null and char_length(p_query) > 80)
  then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  if p_sort = 'gameweek'
    and p_gameweek_id is not null
    and not exists (
      select 1
      from app.fantasy_gameweeks gameweek
      where gameweek.id = p_gameweek_id
        and gameweek.fantasy_season_id = p_season_id
    )
  then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  page_offset := (p_page - 1) * p_limit;

  with scoped as materialized (
    select
      ranking.fantasy_team_id as team_id,
      team.user_id,
      team.name as team_name,
      ranking.rank,
      ranking.previous_rank,
      ranking.total_points,
      coalesce(ranking.gameweek_points, 0) as gameweek_points
    from app.fantasy_rankings ranking
    join app.fantasy_teams team
      on team.id = ranking.fantasy_team_id
    where ranking.fantasy_season_id = p_season_id
      and ranking.league_id is null
      and team.status = 'active'
      and (
        (p_sort = 'overall' and ranking.gameweek_id is null)
        or (
          p_sort = 'gameweek'
          and target_gameweek_id is not null
          and ranking.gameweek_id = target_gameweek_id
        )
      )
  ),
  filtered as materialized (
    select *
    from scoped
    where normalized_query is null
      or strpos(lower(team_name), normalized_query) > 0
  ),
  page_rows as materialized (
    select *
    from filtered
    order by rank, team_id
    offset page_offset
    limit p_limit
  ),
  podium_rows as materialized (
    select
      ranking.fantasy_team_id as team_id,
      team.name as team_name,
      ranking.rank,
      ranking.previous_rank,
      ranking.total_points,
      coalesce(ranking.gameweek_points, 0) as gameweek_points
    from app.fantasy_rankings ranking
    join app.fantasy_teams team
      on team.id = ranking.fantasy_team_id
    where ranking.fantasy_season_id = p_season_id
      and ranking.league_id is null
      and ranking.gameweek_id is null
      and team.status = 'active'
    order by ranking.rank, ranking.fantasy_team_id
    limit 3
  )
  select jsonb_build_object(
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'teamId', team_id,
        'teamName', team_name,
        'rank', rank,
        'previousRank', previous_rank,
        'totalPoints', total_points,
        'gameweekPoints', gameweek_points
      ) order by rank, team_id), '[]'::jsonb)
      from page_rows
    ),
    'total', (select count(*) from filtered),
    'podium', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'teamId', team_id,
        'teamName', team_name,
        'rank', rank,
        'previousRank', previous_rank,
        'totalPoints', total_points,
        'gameweekPoints', gameweek_points
      ) order by rank, team_id), '[]'::jsonb)
      from podium_rows
    ),
    'myRank', (
      select jsonb_build_object(
        'teamId', team_id,
        'teamName', team_name,
        'rank', rank,
        'previousRank', previous_rank,
        'totalPoints', total_points,
        'gameweekPoints', gameweek_points
      )
      from scoped
      where current_user_id is not null
        and user_id = current_user_id
      order by rank, team_id
      limit 1
    )
  )
  into result;

  return result;
end;
$$;

revoke all on function api.fantasy_global_rankings(
  uuid, uuid, text, text, integer, integer
) from public, anon, authenticated, service_role;

grant execute on function api.fantasy_global_rankings(
  uuid, uuid, text, text, integer, integer
) to anon, authenticated, service_role;

comment on function api.fantasy_global_rankings(
  uuid, uuid, text, text, integer, integer
) is
  'Returns a bounded season-wide Fantasy leaderboard without exposing private profile fields.';

commit;
