-- Finalization requires a sealed scoring snapshot and verified downstream work.
-- Registration, season activation, and background schedules are unchanged.
create or replace function api.service_finalize_fantasy_team_results(
  p_gameweek_id uuid,
  p_calculation_version bigint,
  p_after_team_id uuid default null,
  p_batch_size integer default 250
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare gameweek app.fantasy_gameweeks%rowtype;
declare finalized_count integer;
declare snapshot app_private.fantasy_scoring_snapshots%rowtype;
declare last_team_id uuid;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_calculation_version is null or p_calculation_version <= 0
    or p_batch_size is null or p_batch_size not between 1 and 2000 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select * into gameweek from app.fantasy_gameweeks where id = p_gameweek_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found'; end if;
  if gameweek.status = 'finalized' then
    return jsonb_build_object('finalized', 0, 'afterTeamId', null, 'hasMore', false,
      'stableResult', true);
  end if;
  if gameweek.status <> 'finalizing' then
    raise exception using errcode = 'PT409', message = 'gameweek_not_finalizable';
  end if;
  snapshot := app_private.fantasy_assert_scoring_snapshot(gameweek.id, p_calculation_version);
  if snapshot.sealed_at is null or not snapshot.players_persisted then
    raise exception using errcode = 'PT409', message = 'fantasy_scoring_snapshot_not_sealed';
  end if;
  if exists (select 1 from app.fantasy_team_gameweek_results result
    where result.gameweek_id = gameweek.id
      and result.calculation_version <> p_calculation_version) then
    raise exception using errcode = 'PT409', message = 'fantasy_result_version_mismatch';
  end if;

  with candidates as (
    select result.id, result.fantasy_team_id
    from app.fantasy_team_gameweek_results result
    where result.gameweek_id = p_gameweek_id and result.state = 'provisional'
      and (p_after_team_id is null or result.fantasy_team_id > p_after_team_id)
    order by result.fantasy_team_id
    for update limit p_batch_size
  ), finalized as (
    update app.fantasy_team_gameweek_results result set
      final_score = result.provisional_score,
      state = 'final', finalized_at = statement_timestamp(),
      calculation_version = p_calculation_version
    from candidates candidate where result.id = candidate.id
    returning result.fantasy_team_id
  ), finalized_lineups as (
    update app.fantasy_lineups lineup set
      locked_at = coalesce(lineup.locked_at, statement_timestamp()),
      finalized_at = coalesce(lineup.finalized_at, statement_timestamp())
    from finalized result
    where lineup.fantasy_team_id = result.fantasy_team_id
      and lineup.gameweek_id = p_gameweek_id
    returning lineup.fantasy_team_id
  )
  select count(*)::integer,
    (array_agg(fantasy_team_id order by fantasy_team_id desc))[1]
  into finalized_count, last_team_id from finalized;

  update app.fantasy_chip_uses chip set finalized_at = statement_timestamp()
  where chip.gameweek_id = p_gameweek_id and chip.cancelled_at is null
    and chip.finalized_at is null
    and (last_team_id is null or chip.fantasy_team_id <= last_team_id)
    and (p_after_team_id is null or chip.fantasy_team_id > p_after_team_id);

  return jsonb_build_object(
    'finalized', finalized_count,
    'afterTeamId', last_team_id,
    'hasMore', exists (select 1 from app.fantasy_team_gameweek_results result
      where result.gameweek_id = p_gameweek_id and result.state = 'provisional')
  );
end;
$$;

create or replace function api.service_complete_fantasy_gameweek(
  p_gameweek_id uuid,
  p_calculation_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target app.fantasy_gameweeks%rowtype;
declare snapshot app_private.fantasy_scoring_snapshots%rowtype;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_calculation_version is null or p_calculation_version <= 0 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select * into target from app.fantasy_gameweeks where id = p_gameweek_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found'; end if;
  if target.status = 'finalized' then
    return jsonb_build_object('finalized', true, 'stableResult', true,
      'finalizedAt', target.finalized_at);
  end if;
  if target.status <> 'finalizing'
    or exists (select 1 from app.fantasy_team_gameweek_results result
      where result.gameweek_id = p_gameweek_id and result.state <> 'final')
    or exists (select 1 from app.fantasy_free_hit_snapshots free_hit
      where free_hit.gameweek_id = p_gameweek_id and free_hit.restored_at is null) then
    raise exception using errcode = 'PT409', message = 'gameweek_not_finalizable';
  end if;
  snapshot := app_private.fantasy_assert_scoring_snapshot(target.id, p_calculation_version);
  if snapshot.sealed_at is null or not snapshot.players_persisted then
    raise exception using errcode = 'PT409', message = 'fantasy_scoring_snapshot_not_sealed';
  end if;
  -- The seal establishes complete source and provisional-result coverage. Check
  -- every frozen lineup again before the irreversible final state transition.
  if exists (
    select 1 from app.fantasy_lineups lineup
    left join app.fantasy_team_gameweek_results result
      on result.gameweek_id = lineup.gameweek_id
      and result.fantasy_team_id = lineup.fantasy_team_id
    where lineup.gameweek_id = target.id
      and (result.id is null or result.state <> 'final'
        or result.calculation_version <> p_calculation_version
        or result.final_score is null or lineup.finalized_at is null)
  ) or exists (
    select 1 from app.fantasy_team_gameweek_results result
    where result.gameweek_id = target.id
      and result.calculation_version <> p_calculation_version
  ) then
    raise exception using errcode = 'PT409', message = 'fantasy_result_coverage_incomplete';
  end if;
  if exists (
    select 1 from app.fantasy_lineups lineup
    join app.fantasy_teams team on team.id = lineup.fantasy_team_id and team.status = 'active'
    where lineup.gameweek_id = target.id and not exists (
      select 1 from app_private.fantasy_free_transfer_rollovers rollover
      where rollover.gameweek_id = target.id and rollover.fantasy_team_id = team.id
    )
  ) then
    raise exception using errcode = 'PT409', message = 'fantasy_rollover_incomplete';
  end if;
  lock table app.fantasy_league_memberships in share mode;
  if exists (
    select 1 from app.fantasy_lineups lineup
    join app.fantasy_teams team on team.id = lineup.fantasy_team_id and team.status = 'active'
    where lineup.gameweek_id = target.id and (
      not exists (select 1 from app.fantasy_rankings ranking
        where ranking.fantasy_season_id = target.fantasy_season_id
          and ranking.fantasy_team_id = team.id and ranking.gameweek_id = target.id
          and ranking.league_id is null and ranking.calculation_version = p_calculation_version
          and ranking.calculated_at >= snapshot.sealed_at)
      or not exists (select 1 from app.fantasy_rankings ranking
        where ranking.fantasy_season_id = target.fantasy_season_id
          and ranking.fantasy_team_id = team.id and ranking.gameweek_id is null
          and ranking.league_id is null and ranking.calculation_version = p_calculation_version
          and ranking.calculated_at >= snapshot.sealed_at)
    )
  ) then
    raise exception using errcode = 'PT409', message = 'fantasy_rankings_incomplete';
  end if;
  if exists (
    select 1 from app.fantasy_lineups lineup
    join app.fantasy_teams team on team.id = lineup.fantasy_team_id and team.status = 'active'
    join app.fantasy_league_memberships membership
      on membership.fantasy_team_id = team.id and membership.status = 'active'
    where lineup.gameweek_id = target.id and (
      not exists (select 1 from app.fantasy_rankings ranking
        where ranking.fantasy_season_id = target.fantasy_season_id
          and ranking.fantasy_team_id = team.id and ranking.gameweek_id = target.id
          and ranking.league_id = membership.league_id
          and ranking.calculation_version = p_calculation_version
          and ranking.calculated_at >= snapshot.sealed_at)
      or not exists (select 1 from app.fantasy_rankings ranking
        where ranking.fantasy_season_id = target.fantasy_season_id
          and ranking.fantasy_team_id = team.id and ranking.gameweek_id is null
          and ranking.league_id = membership.league_id
          and ranking.calculation_version = p_calculation_version
          and ranking.calculated_at >= snapshot.sealed_at)
    )
  ) then
    raise exception using errcode = 'PT409', message = 'fantasy_rankings_incomplete';
  end if;
  if exists (
    select 1 from jsonb_array_elements(snapshot.payload->'players') player
    left join app.fantasy_player_gameweek_points points
      on points.fantasy_player_id = (player->>'fantasyPlayerId')::uuid
      and points.gameweek_id = target.id
    where points.fantasy_player_id is null
      or points.calculation_version <> p_calculation_version
  ) then
    raise exception using errcode = 'PT409', message = 'fantasy_player_points_incomplete';
  end if;
  update app.fantasy_player_gameweek_points set
    final_points = provisional_points, finalized_at = statement_timestamp()
  where gameweek_id = target.id and calculation_version = p_calculation_version;
  update app.fantasy_player_point_events set state = 'final'
  where gameweek_id = target.id and superseded_at is null;
  update app.fantasy_gameweeks set status = 'finalized', points_state = 'final',
    scoring_input_version = greatest(scoring_input_version, p_calculation_version),
    finalized_at = statement_timestamp()
  where id = target.id returning * into target;
  return jsonb_build_object('finalized', true, 'stableResult', false,
    'finalizedAt', target.finalized_at);
end;
$$;

revoke all on function api.service_finalize_fantasy_team_results(uuid,bigint,uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function api.service_finalize_fantasy_team_results(uuid,bigint,uuid,integer)
  to service_role;
revoke all on function api.service_complete_fantasy_gameweek(uuid,bigint)
  from public,anon,authenticated,service_role;
grant execute on function api.service_complete_fantasy_gameweek(uuid,bigint)
  to service_role;

-- Legacy event callers cannot bypass the trusted snapshot/seal transaction.
create or replace function api.service_upsert_fantasy_player_points(
  p_fantasy_player_id uuid,
  p_gameweek_id uuid,
  p_fixture_id uuid,
  p_category text,
  p_points integer,
  p_source_key text,
  p_source_sequence bigint,
  p_scoring_version integer,
  p_state app.fantasy_points_state default 'provisional'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare target_id uuid;
declare existing_sequence bigint;
declare target_gameweek app.fantasy_gameweeks%rowtype;
begin
  if not app_private.is_service_request() then raise exception using errcode = 'PT403', message = 'forbidden'; end if;
  select * into target_gameweek from app.fantasy_gameweeks where id = p_gameweek_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found';
  end if;
  if target_gameweek.status in ('finalizing','finalized','corrected')
    or exists (select 1 from app_private.fantasy_scoring_snapshots source
      where source.gameweek_id = target_gameweek.id) then
    raise exception using errcode = 'PT409', message = 'fantasy_scoring_managed_snapshot';
  end if;

  select id, source_sequence into target_id, existing_sequence
  from app.fantasy_player_point_events where fantasy_player_id = p_fantasy_player_id
    and fixture_id = p_fixture_id and source_key = p_source_key and scoring_version = p_scoring_version
  for update;
  if found and existing_sequence > p_source_sequence then
    raise exception using errcode = 'PT409', message = 'stale_update';
  end if;
  insert into app.fantasy_player_point_events (
    fantasy_player_id, gameweek_id, fixture_id, category, points, state,
    scoring_version, source_sequence, source_key
  ) values (
    p_fantasy_player_id, p_gameweek_id, p_fixture_id, p_category, p_points,
    p_state, p_scoring_version, p_source_sequence, p_source_key
  ) on conflict (fantasy_player_id, fixture_id, source_key, scoring_version) do update set
    points = excluded.points, state = excluded.state, source_sequence = excluded.source_sequence,
    superseded_at = null
  where app.fantasy_player_point_events.source_sequence <= excluded.source_sequence
  returning id into target_id;
  if target_id is null then raise exception using errcode = 'PT409', message = 'stale_update'; end if;
  insert into app.fantasy_player_gameweek_points (
    fantasy_player_id, gameweek_id, provisional_points, calculation_version,
    football_input_version
  ) select p_fantasy_player_id, p_gameweek_id, coalesce(sum(event.points), 0),
    p_scoring_version, max(event.source_sequence)
  from app.fantasy_player_point_events event
  where event.fantasy_player_id = p_fantasy_player_id and event.gameweek_id = p_gameweek_id
    and event.superseded_at is null
  on conflict (fantasy_player_id, gameweek_id) do update set
    provisional_points = excluded.provisional_points,
    calculation_version = excluded.calculation_version,
    football_input_version = greatest(app.fantasy_player_gameweek_points.football_input_version,
      excluded.football_input_version)
  where app.fantasy_player_gameweek_points.football_input_version <= excluded.football_input_version;
  return target_id;
end;
$$;

revoke all on function api.service_upsert_fantasy_player_points(uuid,uuid,uuid,text,integer,text,bigint,integer,app.fantasy_points_state)
  from public,anon,authenticated,service_role;
grant execute on function api.service_upsert_fantasy_player_points(uuid,uuid,uuid,text,integer,text,bigint,integer,app.fantasy_points_state)
  to service_role;

-- Captains are selected from the starting XI, including under Bench Boost.
create or replace function app_private.fantasy_validate_selection(
  p_fantasy_season_id uuid,
  p_ruleset_id uuid,
  p_selection jsonb
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare rules app.fantasy_rulesets%rowtype;
declare selection_count integer;
declare starter_count integer;
declare captain_count integer;
declare vice_count integer;
declare duplicate_count integer;
declare invalid_count integer;
declare club_over_limit integer;
declare quota_violation integer;
declare formation_violation integer;
begin
  if jsonb_typeof(p_selection) <> 'array' then
    raise exception using errcode = 'PT400', message = 'invalid_squad';
  end if;
  select * into rules from app.fantasy_rulesets where id = p_ruleset_id;
  if not found then raise exception using errcode = 'PT400', message = 'invalid_squad'; end if;

  with selected as (
    select * from jsonb_to_recordset(p_selection) as item(
      fantasy_player_id uuid, slot app.fantasy_lineup_slot, slot_order integer,
      captain boolean, vice_captain boolean
    )
  )
  select count(*), count(*) filter (where slot = 'starter'),
    count(*) filter (where captain), count(*) filter (where vice_captain),
    count(*) - count(distinct fantasy_player_id)
  into selection_count, starter_count, captain_count, vice_count, duplicate_count
  from selected;

  if selection_count <> rules.squad_size or starter_count <> 11 then
    raise exception using errcode = 'PT400', message = 'invalid_squad';
  end if;
  if duplicate_count > 0 then
    raise exception using errcode = 'PT400', message = 'duplicate_player';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_selection) as item(
    slot app.fantasy_lineup_slot, captain boolean, vice_captain boolean
  ) where item.captain and item.slot is distinct from 'starter') then
    raise exception using errcode = 'PT400', message = 'captain_invalid';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_selection) as item(
    slot app.fantasy_lineup_slot, captain boolean, vice_captain boolean
  ) where item.vice_captain and item.slot is distinct from 'starter') then
    raise exception using errcode = 'PT400', message = 'vice_captain_invalid';
  end if;
  if captain_count <> 1 then
    raise exception using errcode = 'PT400', message = 'captain_invalid';
  end if;
  if vice_count <> 1 then
    raise exception using errcode = 'PT400', message = 'vice_captain_invalid';
  end if;

  with selected as (
    select * from jsonb_to_recordset(p_selection) as item(
      fantasy_player_id uuid, slot app.fantasy_lineup_slot, slot_order integer,
      captain boolean, vice_captain boolean
    )
  )
  select count(*) into invalid_count
  from selected item
  left join app.fantasy_players player on player.id = item.fantasy_player_id
    and player.fantasy_season_id = p_fantasy_season_id
    and player.active and player.eligible and player.status not in ('ineligible', 'unavailable')
  where player.id is null
    or item.slot is null or item.slot_order is null
    or item.captain is null or item.vice_captain is null
    or (item.captain and item.vice_captain)
    or (item.slot = 'starter' and item.slot_order not between 1 and 11)
    or (item.slot = 'bench' and item.slot_order not between 1 and 4);
  if invalid_count > 0 then
    raise exception using errcode = 'PT400', message = 'player_not_eligible';
  end if;

  with selected as (
    select * from jsonb_to_recordset(p_selection) as item(fantasy_player_id uuid)
  )
  select count(*) into club_over_limit from (
    select player.football_team_id
    from selected item join app.fantasy_players player on player.id = item.fantasy_player_id
    group by player.football_team_id having count(*) > rules.max_players_per_club
  ) violations;
  if club_over_limit > 0 then
    raise exception using errcode = 'PT400', message = 'club_limit_exceeded';
  end if;

  with selected as (
    select * from jsonb_to_recordset(p_selection) as item(
      fantasy_player_id uuid, slot app.fantasy_lineup_slot
    )
  ), counts as (
    select player.position_id,
      count(*) as squad_count,
      count(*) filter (where selected.slot = 'starter') as starting_count
    from selected join app.fantasy_players player on player.id = selected.fantasy_player_id
    group by player.position_id
  )
  select count(*) filter (where coalesce(counts.squad_count, 0) <> position_rule.squad_quota),
    count(*) filter (where coalesce(counts.starting_count, 0)
      not between position_rule.starting_minimum and position_rule.starting_maximum)
  into quota_violation, formation_violation
  from app.fantasy_position_rules position_rule
  left join counts on counts.position_id = position_rule.position_id
  where position_rule.ruleset_id = p_ruleset_id;
  if quota_violation > 0 then
    raise exception using errcode = 'PT400', message = 'invalid_squad';
  end if;
  if formation_violation > 0 then
    raise exception using errcode = 'PT400', message = 'invalid_formation';
  end if;
end;
$$;
revoke all on function app_private.fantasy_validate_selection(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
