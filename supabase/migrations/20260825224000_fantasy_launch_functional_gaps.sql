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
    'autoSubs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'playerOutId', substitution.player_out_id,
        'playerInId', substitution.player_in_id,
        'reason', substitution.reason
      ) order by substitution.sequence_number, substitution.id)
      from app.fantasy_lineups lineup
      join app.fantasy_auto_substitutions substitution
        on substitution.lineup_id = lineup.id
      where lineup.fantasy_team_id = team.id
        and lineup.gameweek_id = gameweek.id
        and result_row.id is not null
        and substitution.calculation_version = result_row.calculation_version
    ), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fantasyPlayerId', lineup_player.fantasy_player_id,
        'slot', lineup_player.slot,
        'slotOrder', lineup_player.slot_order,
        'captain', lineup_player.captain,
        'viceCaptain', lineup_player.vice_captain,
        'multiplier', case
          when result_row.id is null then lineup_player.multiplier
          when lineup_player.captain and coalesce(points.did_play, false) then
            case when result_row.chip_type = 'triple_captain'
              then ruleset.triple_captain_multiplier
              else ruleset.captain_multiplier end
          when lineup_player.vice_captain
            and coalesce(points.did_play, false)
            and exists (
              select 1
              from app.fantasy_lineup_players captain
              left join app.fantasy_player_gameweek_points captain_points
                on captain_points.fantasy_player_id = captain.fantasy_player_id
                and captain_points.gameweek_id = gameweek.id
              where captain.lineup_id = lineup.id
                and captain.captain
                and not coalesce(captain_points.did_play, false)
            )
          then ruleset.captain_multiplier
          when result_row.chip_type = 'bench_boost' then 1
          when lineup_player.slot = 'bench'
            and exists (
              select 1
              from app.fantasy_auto_substitutions substitution
              where substitution.lineup_id = lineup.id
                and substitution.player_in_id = lineup_player.fantasy_player_id
                and substitution.calculation_version = result_row.calculation_version
            )
          then 1
          when lineup_player.slot = 'bench' then 0
          when exists (
            select 1
            from app.fantasy_auto_substitutions substitution
            where substitution.lineup_id = lineup.id
              and substitution.player_out_id = lineup_player.fantasy_player_id
              and substitution.calculation_version = result_row.calculation_version
          )
          then 0
          else 1
        end,
        'provisionalPoints', coalesce(points.provisional_points, 0),
        'finalPoints', points.final_points,
        'didPlay', coalesce(points.did_play, false),
        'minutesPlayed', coalesce(points.minutes_played, 0),
        'events', coalesce((
          select jsonb_agg(jsonb_build_object(
            'category', event.category,
            'points', event.points,
            'count', 1
          ) order by event.source_sequence, event.id)
          from app.fantasy_player_point_events event
          where event.fantasy_player_id = lineup_player.fantasy_player_id
            and event.gameweek_id = gameweek.id
            and event.superseded_at is null
            and event.category = any(array[
              'appearance', 'goal', 'assist', 'clean_sheet', 'goals_conceded',
              'saves', 'penalty_save', 'penalty_miss', 'yellow_card', 'red_card',
              'second_yellow_dismissal', 'own_goal'
            ]::text[])
            and (
              exists (
                select 1
                from app_private.fantasy_fixture_scoring_snapshots snapshot
                where snapshot.id = event.scoring_snapshot_id
                  and snapshot.gameweek_id = gameweek.id
                  and snapshot.superseded_at is null
              )
              or (
                event.scoring_snapshot_id is null
                and not exists (
                  select 1
                  from app.fantasy_player_point_events newer
                  where newer.fantasy_player_id = event.fantasy_player_id
                    and newer.gameweek_id = event.gameweek_id
                    and newer.fixture_id = event.fixture_id
                    and newer.source_key = event.source_key
                    and newer.scoring_snapshot_id is null
                    and newer.superseded_at is null
                    and newer.scoring_version > event.scoring_version
                )
              )
            )
        ), '[]'::jsonb)
      ) order by lineup_player.slot, lineup_player.slot_order)
      from app.fantasy_lineups lineup
      join app.fantasy_lineup_players lineup_player on lineup_player.lineup_id = lineup.id
      left join app.fantasy_player_gameweek_points points
        on points.fantasy_player_id = lineup_player.fantasy_player_id
        and points.gameweek_id = gameweek.id
      where lineup.fantasy_team_id = team.id
        and lineup.gameweek_id = gameweek.id
    ), '[]'::jsonb)
  ) into result
  from app.fantasy_gameweeks gameweek
  join app.fantasy_seasons fantasy_season
    on fantasy_season.id = gameweek.fantasy_season_id
  join app.fantasy_rulesets ruleset
    on ruleset.id = fantasy_season.ruleset_id
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
  'Returns owner-scoped Fantasy points, canonical scoring events, and applied auto-substitutions.';

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
    select *
    from scoped
    order by rank, team_id
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
  'Returns a team-name-searchable leaderboard and sort-specific podium without profile fields.';

create or replace function api.fantasy_league_detail(p_league_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare target app.fantasy_leagues%rowtype;
declare result jsonb;
begin
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

  select jsonb_build_object(
    'id', league.id,
    'name', league.name,
    'visibility', league.visibility,
    'memberCount', league.member_count,
    'inviteCodeHint', league.invite_code_hint,
    'role', membership.role,
    'rank', ranking.rank,
    'previousRank', ranking.previous_rank,
    'totalPoints', ranking.total_points,
    'leaderName', leader.name
  )
  into result
  from app.fantasy_leagues league
  left join app.fantasy_league_memberships membership
    on membership.league_id = league.id
    and membership.user_id = (select auth.uid())
    and membership.status = 'active'
  left join app.fantasy_rankings ranking
    on ranking.league_id = league.id
    and ranking.fantasy_team_id = membership.fantasy_team_id
    and ranking.gameweek_id is null
  left join lateral (
    select ranked_team.name
    from app.fantasy_rankings leader_rank
    join app.fantasy_teams ranked_team on ranked_team.id = leader_rank.fantasy_team_id
    where leader_rank.league_id = league.id
      and leader_rank.gameweek_id is null
    order by leader_rank.rank, leader_rank.fantasy_team_id
    limit 1
  ) leader on true
  where league.id = target.id;

  return result;
end;
$$;

revoke all on function api.fantasy_league_detail(uuid)
from public, anon, authenticated, service_role;
grant execute on function api.fantasy_league_detail(uuid)
to anon, authenticated, service_role;

create or replace function api.rotate_fantasy_league_invite(p_league_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
declare target app.fantasy_leagues%rowtype;
declare invite_code text;
declare invite_digest text;
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;

  select * into target
  from app.fantasy_leagues
  where id = p_league_id
    and owner_user_id = current_user_id
    and visibility = 'private'
    and active
  for update;

  if not found then
    raise exception using errcode = 'PT403', message = 'league_invite_rotation_denied';
  end if;

  invite_code := upper(encode(extensions.gen_random_bytes(16), 'hex'));
  invite_digest :=
    encode(extensions.digest(convert_to(invite_code, 'UTF8'), 'sha256'), 'hex');

  update app.fantasy_leagues
  set invite_code_digest = invite_digest,
      invite_code_hint = right(invite_code, 4)
  where id = target.id;

  return jsonb_build_object(
    'leagueId', target.id,
    'inviteCode', invite_code,
    'inviteCodeHint', right(invite_code, 4)
  );
end;
$$;

revoke all on function api.rotate_fantasy_league_invite(uuid)
from public, anon, authenticated, service_role;
grant execute on function api.rotate_fantasy_league_invite(uuid)
to authenticated;

comment on function api.rotate_fantasy_league_invite(uuid) is
  'Owner-only recovery that replaces an unrecoverable private-league invite secret.';

create or replace function api.create_fantasy_league(
  p_season_id uuid,
  p_team_id uuid,
  p_name text,
  p_visibility app.fantasy_league_visibility,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
declare team app.fantasy_teams%rowtype;
declare league_id uuid;
declare invite_code text;
declare invite_digest text;
declare response_body jsonb;
declare request_hash text;
declare stored_request_hash text;
begin
  team := app_private.fantasy_assert_owner(p_team_id);
  if team.fantasy_season_id <> p_season_id or p_idempotency_key is null
    or p_name is null or p_name <> btrim(p_name) or char_length(p_name) not between 3 and 80
  then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  request_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'seasonId', p_season_id,
    'teamId', p_team_id,
    'name', p_name,
    'visibility', p_visibility
  )::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    current_user_id::text || ':fantasy:league:' || p_idempotency_key::text, 0
  ));

  select key_row.request_hash, key_row.response_body
  into stored_request_hash, response_body
  from app_private.fantasy_idempotency_keys key_row
  where key_row.user_id = current_user_id
    and key_row.operation = 'create_league'
    and key_row.idempotency_key = p_idempotency_key;

  if found then
    if stored_request_hash is distinct from request_hash then
      raise exception using errcode = 'PT409', message = 'idempotency_conflict';
    end if;
    return response_body || jsonb_build_object('created', false);
  end if;

  if p_visibility = 'private' then
    invite_code := upper(encode(extensions.gen_random_bytes(16), 'hex'));
    invite_digest :=
      encode(extensions.digest(convert_to(invite_code, 'UTF8'), 'sha256'), 'hex');
  end if;

  insert into app.fantasy_leagues (
    fantasy_season_id, owner_user_id, name, visibility,
    invite_code_digest, invite_code_hint
  ) values (
    p_season_id, current_user_id, p_name, p_visibility,
    invite_digest, case when invite_code is null then null else right(invite_code, 4) end
  )
  returning id into league_id;

  insert into app.fantasy_league_memberships (
    league_id, fantasy_team_id, user_id, role
  ) values (league_id, team.id, current_user_id, 'owner');

  response_body := jsonb_build_object(
    'leagueId', league_id,
    'name', p_name,
    'visibility', p_visibility,
    'inviteCode', invite_code,
    'created', true
  );

  insert into app_private.fantasy_idempotency_keys (
    user_id, operation, idempotency_key, request_hash, response_body, expires_at
  ) values (
    current_user_id, 'create_league', p_idempotency_key,
    request_hash,
    response_body,
    statement_timestamp() + interval '30 days'
  );

  return response_body;
end;
$$;

revoke all on function api.create_fantasy_league(
  uuid, uuid, text, app.fantasy_league_visibility, uuid
) from public, anon, authenticated, service_role;
grant execute on function api.create_fantasy_league(
  uuid, uuid, text, app.fantasy_league_visibility, uuid
) to authenticated;

comment on function api.create_fantasy_league(
  uuid, uuid, text, app.fantasy_league_visibility, uuid
) is
  'Creates a league and preserves the one-time invite code across idempotent retries.';

commit;
