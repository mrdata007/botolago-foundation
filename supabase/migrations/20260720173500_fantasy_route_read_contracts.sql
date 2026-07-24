-- Phase 6 route cutover contracts. These bounded RPCs complete the existing
-- Fantasy UI repository surface without granting direct access to app tables.

create or replace function api.fantasy_gameweeks(
  p_season_id uuid,
  p_before_sequence integer default null,
  p_limit integer default 40
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if p_limit not between 1 and 100 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  with page as (
    select gameweek.id, gameweek.sequence_number, gameweek.name,
      gameweek.deadline_at, gameweek.starts_at, gameweek.ends_at,
      gameweek.status, gameweek.points_state
    from app.fantasy_gameweeks gameweek
    where gameweek.fantasy_season_id = p_season_id
      and (p_before_sequence is null or gameweek.sequence_number < p_before_sequence)
    order by gameweek.sequence_number desc
    limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'sequence', sequence_number, 'name', name,
      'deadlineAt', deadline_at, 'startsAt', starts_at, 'endsAt', ends_at,
      'status', status, 'pointsState', points_state
    ) order by sequence_number desc), '[]'::jsonb),
    'nextCursor', case when count(*) = p_limit then min(sequence_number) else null end
  ) into result from page;
  return result;
end;
$$;

create or replace function api.fantasy_leagues(
  p_season_id uuid,
  p_visibility app.fantasy_league_visibility default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if p_limit not between 1 and 100 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
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
      and (p_visibility is null or league.visibility = p_visibility)
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
$$;

create or replace function api.fantasy_top_players(
  p_gameweek_id uuid,
  p_limit integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if p_limit not between 1 and 20 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'fantasyPlayerId', points.fantasy_player_id,
    'points', coalesce(points.final_points, points.provisional_points),
    'minutesPlayed', points.minutes_played,
    'state', case when points.final_points is null then 'provisional' else 'final' end
  ) order by coalesce(points.final_points, points.provisional_points) desc,
    points.fantasy_player_id), '[]'::jsonb)
  into result
  from (
    select target.* from app.fantasy_player_gameweek_points target
    where target.gameweek_id = p_gameweek_id
    order by coalesce(target.final_points, target.provisional_points) desc,
      target.fantasy_player_id
    limit p_limit
  ) points;
  return result;
end;
$$;

create or replace function api.archive_fantasy_league(
  p_league_id uuid,
  p_team_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
begin
  perform app_private.fantasy_assert_owner(p_team_id);
  update app.fantasy_leagues league set active = false
  where league.id = p_league_id and league.owner_user_id = current_user_id
    and exists (
      select 1 from app.fantasy_league_memberships membership
      where membership.league_id = league.id
        and membership.fantasy_team_id = p_team_id
        and membership.user_id = current_user_id
        and membership.role = 'owner' and membership.status = 'active'
    );
  if not found then
    raise exception using errcode = 'PT403', message = 'league_access_denied';
  end if;
  insert into app_private.fantasy_mutation_audit (
    user_id, fantasy_team_id, operation, accepted, safe_metadata
  ) values (current_user_id, p_team_id, 'archive_league', true,
    jsonb_build_object('leagueId', p_league_id));
  return true;
end;
$$;

revoke all on function api.fantasy_gameweeks(uuid, integer, integer) from public;
revoke all on function api.fantasy_leagues(uuid, app.fantasy_league_visibility, integer) from public;
revoke all on function api.fantasy_top_players(uuid, integer) from public;
revoke all on function api.archive_fantasy_league(uuid, uuid) from public;

grant execute on function api.fantasy_gameweeks(uuid, integer, integer)
  to anon, authenticated, service_role;
grant execute on function api.fantasy_leagues(uuid, app.fantasy_league_visibility, integer)
  to anon, authenticated, service_role;
grant execute on function api.fantasy_top_players(uuid, integer)
  to anon, authenticated, service_role;
grant execute on function api.archive_fantasy_league(uuid, uuid)
  to authenticated, service_role;
