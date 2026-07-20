-- BotolaGO V2 — Phase 6: controlled Fantasy API, database-time deadline
-- enforcement, optimistic concurrency, idempotency, and explicit authority.

create or replace function app_private.fantasy_assert_owner(p_team_id uuid)
returns app.fantasy_teams
language plpgsql
stable
security definer
set search_path = ''
as $$
declare target app.fantasy_teams%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'fantasy_team_not_found';
  end if;
  select * into target from app.fantasy_teams
  where id = p_team_id and user_id = (select auth.uid()) and status = 'active';
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_team_not_found';
  end if;
  return target;
end;
$$;

create or replace function app_private.fantasy_assert_mutable_gameweek(p_gameweek_id uuid)
returns app.fantasy_gameweeks
language plpgsql
stable
security definer
set search_path = ''
as $$
declare target app.fantasy_gameweeks%rowtype;
begin
  select * into target from app.fantasy_gameweeks where id = p_gameweek_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found';
  end if;
  if target.status <> 'open' or statement_timestamp() >= target.deadline_at then
    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_locked';
  end if;
  return target;
end;
$$;

create or replace function app_private.fantasy_selection_hash(
  p_team_name text,
  p_gameweek_id uuid,
  p_selection jsonb
)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select encode(extensions.digest(
    convert_to(coalesce(p_team_name, '') || ':' || coalesce(p_gameweek_id::text, '') || ':' || coalesce(p_selection, 'null'::jsonb)::text, 'UTF8'),
    'sha256'
  ), 'hex');
$$;

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

create or replace function app_private.fantasy_team_dto(p_team_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'id', team.id, 'seasonId', team.fantasy_season_id,
    'currentGameweekId', team.current_gameweek_id, 'name', team.name,
    'bank', team.bank, 'teamValue', team.team_value,
    'freeTransfers', team.free_transfers, 'version', team.version,
    'status', team.status, 'createdAt', team.created_at, 'updatedAt', team.updated_at,
    'squad', coalesce((
      select jsonb_agg(jsonb_build_object(
        'membershipId', membership.id, 'fantasyPlayerId', player.id,
        'footballPlayerId', player.football_player_id,
        'footballTeamId', player.football_team_id, 'position', position.code,
        'price', player.price, 'purchasePrice', membership.purchase_price,
        'salePrice', membership.current_sale_price, 'status', player.status
      ) order by position.display_order, player.price desc, player.id)
      from app.fantasy_squad_memberships membership
      join app.fantasy_players player on player.id = membership.fantasy_player_id
      join app.fantasy_positions position on position.id = player.position_id
      where membership.fantasy_team_id = team.id and membership.sold_at is null
    ), '[]'::jsonb),
    'lineup', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fantasyPlayerId', lineup_player.fantasy_player_id,
        'slot', lineup_player.slot, 'slotOrder', lineup_player.slot_order,
        'captain', lineup_player.captain, 'viceCaptain', lineup_player.vice_captain,
        'multiplier', lineup_player.multiplier
      ) order by lineup_player.slot, lineup_player.slot_order)
      from app.fantasy_lineups lineup
      join app.fantasy_lineup_players lineup_player on lineup_player.lineup_id = lineup.id
      where lineup.fantasy_team_id = team.id and lineup.gameweek_id = team.current_gameweek_id
    ), '[]'::jsonb)
  ) into result from app.fantasy_teams team where team.id = p_team_id;
  return result;
end;
$$;

create or replace function api.fantasy_hub(p_language text default 'fr')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
declare result jsonb;
begin
  if p_language not in ('fr', 'ar') then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select jsonb_build_object(
    'season', jsonb_build_object('id', season.id, 'name', season.name, 'status', season.status),
    'gameweek', case when gameweek.id is null then null else jsonb_build_object(
      'id', gameweek.id, 'sequence', gameweek.sequence_number, 'name', gameweek.name,
      'deadlineAt', gameweek.deadline_at, 'status', gameweek.status,
      'pointsState', gameweek.points_state
    ) end,
    'team', case when team.id is null then null else app_private.fantasy_team_dto(team.id) end,
    'rankingAvailable', exists (
      select 1 from app.fantasy_rankings ranking
      where ranking.fantasy_season_id = season.id and ranking.league_id is null
    )
  ) into result
  from app.fantasy_seasons season
  left join lateral (
    select * from app.fantasy_gameweeks target
    where target.fantasy_season_id = season.id
      and target.status in ('open','locked','live','provisional','finalizing','finalized','corrected')
    order by target.sequence_number desc limit 1
  ) gameweek on true
  left join app.fantasy_teams team on team.fantasy_season_id = season.id
    and team.user_id = current_user_id and team.status = 'active'
  where season.status in ('registration_open','active')
  order by season.starts_at desc limit 1;
  if result is null then raise exception using errcode = 'PT404', message = 'fantasy_season_closed'; end if;
  return result;
end;
$$;

create or replace function api.fantasy_player_pool(
  p_season_id uuid,
  p_position text default null,
  p_team_id uuid default null,
  p_max_price numeric default null,
  p_search text default null,
  p_after_price numeric default null,
  p_after_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare items jsonb;
begin
  if p_limit not between 1 and 100 or ((p_after_price is null) <> (p_after_id is null))
    or (p_position is not null and p_position not in ('GK','DEF','MID','FWD'))
  then raise exception using errcode = 'PT400', message = 'validation_failed'; end if;
  with candidates as (
    select fantasy_player.*, position.code as position_code,
      football_player.display_name, football_player.full_name, football_player.photo_asset_id,
      football_team.name as team_name, football_team.short_name as team_short_name,
      football_team.crest_asset_id
    from app.fantasy_players fantasy_player
    join app.fantasy_positions position on position.id = fantasy_player.position_id
    join app.players football_player on football_player.id = fantasy_player.football_player_id
    join app.teams football_team on football_team.id = fantasy_player.football_team_id
    where fantasy_player.fantasy_season_id = p_season_id
      and fantasy_player.active and fantasy_player.eligible
      and (p_position is null or position.code = p_position)
      and (p_team_id is null or football_team.id = p_team_id)
      and (p_max_price is null or fantasy_player.price <= p_max_price)
      and (p_search is null or
        to_tsvector('simple', coalesce(football_player.display_name, '') || ' ' || coalesce(football_player.full_name, ''))
          @@ websearch_to_tsquery('simple', left(p_search, 80)))
      and (p_after_price is null or (fantasy_player.price, fantasy_player.id) < (p_after_price, p_after_id))
    order by fantasy_player.price desc, fantasy_player.id desc limit p_limit + 1
  ), page as (select * from candidates limit p_limit)
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'footballPlayerId', football_player_id, 'footballTeamId', football_team_id,
      'name', display_name, 'fullName', full_name, 'position', position_code,
      'price', price, 'status', status, 'teamName', team_name,
      'teamShortName', team_short_name, 'photoAssetId', photo_asset_id,
      'crestAssetId', crest_asset_id, 'selectedByCount', selected_by_count
    ) order by price desc, id desc), '[]'::jsonb),
    'nextCursor', case when (select count(*) from candidates) > p_limit then
      (select jsonb_build_object('price', price, 'id', id) from page order by price, id limit 1)
      else null end
  ) into items from page;
  return items;
end;
$$;

create or replace function api.get_my_fantasy_team(p_season_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare target_id uuid;
begin
  if auth.uid() is null then raise exception using errcode = 'PT401', message = 'fantasy_team_not_found'; end if;
  select id into target_id from app.fantasy_teams
  where user_id = (select auth.uid()) and fantasy_season_id = p_season_id and status = 'active';
  if target_id is null then raise exception using errcode = 'PT404', message = 'fantasy_team_not_found'; end if;
  return app_private.fantasy_team_dto(target_id);
end;
$$;

create or replace function api.create_fantasy_team(
  p_season_id uuid,
  p_gameweek_id uuid,
  p_team_name text,
  p_selection jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
declare season app.fantasy_seasons%rowtype;
declare gameweek app.fantasy_gameweeks%rowtype;
declare rules app.fantasy_rulesets%rowtype;
declare request_hash text;
declare existing_hash text;
declare cached_response jsonb;
declare target_team_id uuid;
declare target_lineup_id uuid;
declare squad_cost numeric(10,2);
begin
  if current_user_id is null then raise exception using errcode = 'PT401', message = 'fantasy_team_not_found'; end if;
  if p_idempotency_key is null or p_team_name is null
    or p_team_name <> btrim(p_team_name) or char_length(p_team_name) not between 3 and 40
    or p_team_name !~ '^[[:alnum:]][[:alnum:] _''.-]{1,38}[[:alnum:]]$'
  then raise exception using errcode = 'PT400', message = 'invalid_team_name'; end if;
  select * into season from app.fantasy_seasons where id = p_season_id and status in ('registration_open','active');
  if not found then raise exception using errcode = 'PT409', message = 'fantasy_season_closed'; end if;
  gameweek := app_private.fantasy_assert_mutable_gameweek(p_gameweek_id);
  if gameweek.fantasy_season_id <> season.id then raise exception using errcode = 'PT400', message = 'invalid_squad'; end if;
  select * into rules from app.fantasy_rulesets where id = season.ruleset_id;
  request_hash := app_private.fantasy_selection_hash(p_team_name, p_gameweek_id, p_selection);
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(current_user_id::text || ':fantasy:create:' || p_season_id::text, 0));
  select fantasy_idempotency.request_hash, fantasy_idempotency.response_body
  into existing_hash, cached_response
  from app_private.fantasy_idempotency_keys fantasy_idempotency
  where fantasy_idempotency.user_id = current_user_id
    and fantasy_idempotency.operation = 'create_team'
    and fantasy_idempotency.idempotency_key = p_idempotency_key;
  if found then
    if existing_hash <> request_hash then raise exception using errcode = 'PT409', message = 'idempotency_conflict'; end if;
    return cached_response;
  end if;
  if exists (select 1 from app.fantasy_teams where user_id = current_user_id and fantasy_season_id = season.id) then
    raise exception using errcode = 'PT409', message = 'fantasy_team_already_exists';
  end if;
  perform app_private.fantasy_validate_selection(season.id, season.ruleset_id, p_selection);
  select sum(player.price) into squad_cost
  from jsonb_to_recordset(p_selection) as item(fantasy_player_id uuid)
  join app.fantasy_players player on player.id = item.fantasy_player_id;
  if squad_cost > rules.initial_budget then raise exception using errcode = 'PT400', message = 'budget_exceeded'; end if;
  insert into app.fantasy_teams (
    user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers
  ) values (
    current_user_id, season.id, gameweek.id, p_team_name,
    rules.initial_budget - squad_cost, squad_cost, rules.initial_free_transfers
  ) returning id into target_team_id;
  insert into app.fantasy_squad_memberships (
    fantasy_team_id, fantasy_player_id, purchase_price, current_sale_price, acquired_gameweek_id
  ) select target_team_id, player.id, player.price, player.price, gameweek.id
  from jsonb_to_recordset(p_selection) as item(fantasy_player_id uuid)
  join app.fantasy_players player on player.id = item.fantasy_player_id;
  insert into app.fantasy_lineups (fantasy_team_id, gameweek_id, team_version)
  values (target_team_id, gameweek.id, 1) returning id into target_lineup_id;
  insert into app.fantasy_lineup_players (
    lineup_id, fantasy_player_id, slot, slot_order, captain, vice_captain, multiplier, snapshot_price
  ) select target_lineup_id, item.fantasy_player_id, item.slot, item.slot_order,
    item.captain, item.vice_captain,
    case when item.captain then rules.captain_multiplier else 1 end, player.price
  from jsonb_to_recordset(p_selection) as item(
    fantasy_player_id uuid, slot app.fantasy_lineup_slot, slot_order integer,
    captain boolean, vice_captain boolean
  ) join app.fantasy_players player on player.id = item.fantasy_player_id;
  cached_response := app_private.fantasy_team_dto(target_team_id);
  insert into app_private.fantasy_idempotency_keys (
    user_id, operation, idempotency_key, request_hash, response_body, expires_at
  ) values (current_user_id, 'create_team', p_idempotency_key, request_hash, cached_response, statement_timestamp() + interval '7 days');
  insert into app_private.fantasy_mutation_audit (
    user_id, fantasy_team_id, operation, accepted, resulting_version, idempotency_key,
    safe_metadata
  ) values (current_user_id, target_team_id, 'create_team', true, 1, p_idempotency_key,
    jsonb_build_object('seasonId', season.id, 'gameweekId', gameweek.id));
  return cached_response;
end;
$$;

create or replace function api.save_fantasy_lineup(
  p_team_id uuid,
  p_gameweek_id uuid,
  p_selection jsonb,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
declare team app.fantasy_teams%rowtype;
declare season app.fantasy_seasons%rowtype;
declare rules app.fantasy_rulesets%rowtype;
declare target_lineup_id uuid;
declare request_hash text;
declare existing_hash text;
declare cached_response jsonb;
begin
  team := app_private.fantasy_assert_owner(p_team_id);
  perform app_private.fantasy_assert_mutable_gameweek(p_gameweek_id);
  if p_expected_version is null or p_idempotency_key is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select * into season from app.fantasy_seasons where id = team.fantasy_season_id;
  select * into rules from app.fantasy_rulesets where id = season.ruleset_id;
  request_hash := app_private.fantasy_selection_hash(team.name, p_gameweek_id, p_selection);
  select fantasy_idempotency.request_hash, fantasy_idempotency.response_body
  into existing_hash, cached_response
  from app_private.fantasy_idempotency_keys fantasy_idempotency
  where fantasy_idempotency.user_id = current_user_id
    and fantasy_idempotency.operation = 'save_lineup'
    and fantasy_idempotency.idempotency_key = p_idempotency_key;
  if found then
    if existing_hash <> request_hash then raise exception using errcode = 'PT409', message = 'idempotency_conflict'; end if;
    return cached_response;
  end if;
  select * into team from app.fantasy_teams
  where id = p_team_id and user_id = current_user_id for update;
  if team.version <> p_expected_version then
    raise exception using errcode = 'PT409', message = 'version_conflict',
      detail = jsonb_build_object('latestVersion', team.version)::text;
  end if;
  perform app_private.fantasy_validate_selection(season.id, season.ruleset_id, p_selection);
  if exists (
    select 1 from jsonb_to_recordset(p_selection) as item(fantasy_player_id uuid)
    where not exists (
      select 1 from app.fantasy_squad_memberships membership
      where membership.fantasy_team_id = team.id
        and membership.fantasy_player_id = item.fantasy_player_id and membership.sold_at is null
    )
  ) then raise exception using errcode = 'PT400', message = 'invalid_squad'; end if;
  insert into app.fantasy_lineups (fantasy_team_id, gameweek_id, team_version)
  values (team.id, p_gameweek_id, team.version + 1)
  on conflict (fantasy_team_id, gameweek_id) do update set team_version = excluded.team_version
  where app.fantasy_lineups.locked_at is null and app.fantasy_lineups.finalized_at is null
  returning id into target_lineup_id;
  if target_lineup_id is null then raise exception using errcode = 'PT409', message = 'fantasy_gameweek_locked'; end if;
  delete from app.fantasy_lineup_players where lineup_id = target_lineup_id;
  insert into app.fantasy_lineup_players (
    lineup_id, fantasy_player_id, slot, slot_order, captain, vice_captain, multiplier, snapshot_price
  ) select target_lineup_id, item.fantasy_player_id, item.slot, item.slot_order,
    item.captain, item.vice_captain,
    case when item.captain then rules.captain_multiplier else 1 end, player.price
  from jsonb_to_recordset(p_selection) as item(
    fantasy_player_id uuid, slot app.fantasy_lineup_slot, slot_order integer,
    captain boolean, vice_captain boolean
  ) join app.fantasy_players player on player.id = item.fantasy_player_id;
  update app.fantasy_teams set version = version + 1, current_gameweek_id = p_gameweek_id
  where id = team.id returning version into team.version;
  cached_response := app_private.fantasy_team_dto(team.id);
  insert into app_private.fantasy_idempotency_keys (
    user_id, operation, idempotency_key, request_hash, response_body, expires_at
  ) values (current_user_id, 'save_lineup', p_idempotency_key, request_hash, cached_response, statement_timestamp() + interval '7 days');
  insert into app_private.fantasy_mutation_audit (
    user_id, fantasy_team_id, operation, accepted, base_version, resulting_version,
    idempotency_key, safe_metadata
  ) values (current_user_id, team.id, 'save_lineup', true, p_expected_version,
    team.version, p_idempotency_key, jsonb_build_object('gameweekId', p_gameweek_id));
  return cached_response;
end;
$$;

create or replace function api.preview_fantasy_transfers(
  p_team_id uuid,
  p_gameweek_id uuid,
  p_transfers jsonb,
  p_expected_version bigint,
  p_chip_type app.fantasy_chip_type default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare team app.fantasy_teams%rowtype;
declare gameweek app.fantasy_gameweeks%rowtype;
declare season app.fantasy_seasons%rowtype;
declare rules app.fantasy_rulesets%rowtype;
declare transfer_count integer;
declare sale_total numeric(10,2);
declare purchase_total numeric(10,2);
declare resulting_bank numeric(10,2);
declare free_used integer;
declare point_hit integer;
begin
  team := app_private.fantasy_assert_owner(p_team_id);
  gameweek := app_private.fantasy_assert_mutable_gameweek(p_gameweek_id);
  if gameweek.fantasy_season_id <> team.fantasy_season_id then
    raise exception using errcode = 'PT400', message = 'invalid_transfer';
  end if;
  if team.version <> p_expected_version then
    raise exception using errcode = 'PT409', message = 'version_conflict',
      detail = jsonb_build_object('latestVersion', team.version)::text;
  end if;
  if jsonb_typeof(p_transfers) <> 'array' then raise exception using errcode = 'PT400', message = 'invalid_transfer'; end if;
  select * into season from app.fantasy_seasons where id = team.fantasy_season_id;
  select * into rules from app.fantasy_rulesets where id = season.ruleset_id;
  with requested as (
    select * from jsonb_to_recordset(p_transfers) as item(player_out_id uuid, player_in_id uuid)
  )
  select count(*), coalesce(sum(out_membership.current_sale_price), 0), coalesce(sum(player_in.price), 0)
  into transfer_count, sale_total, purchase_total
  from requested
  left join app.fantasy_squad_memberships out_membership
    on out_membership.fantasy_team_id = team.id
    and out_membership.fantasy_player_id = requested.player_out_id and out_membership.sold_at is null
  left join app.fantasy_players player_in on player_in.id = requested.player_in_id
    and player_in.fantasy_season_id = team.fantasy_season_id
    and player_in.active and player_in.eligible;
  if transfer_count < 1 or transfer_count > rules.squad_size
    or sale_total is null or purchase_total is null
    or exists (
      select 1 from jsonb_to_recordset(p_transfers) as item(player_out_id uuid, player_in_id uuid)
      where item.player_out_id = item.player_in_id
        or not exists (select 1 from app.fantasy_squad_memberships membership
          where membership.fantasy_team_id = team.id and membership.fantasy_player_id = item.player_out_id and membership.sold_at is null)
        or not exists (select 1 from app.fantasy_players player
          where player.id = item.player_in_id and player.fantasy_season_id = team.fantasy_season_id and player.active and player.eligible)
    )
  then raise exception using errcode = 'PT400', message = 'invalid_transfer'; end if;
  resulting_bank := team.bank + sale_total - purchase_total;
  if resulting_bank < 0 then raise exception using errcode = 'PT400', message = 'budget_exceeded'; end if;
  free_used := least(team.free_transfers, transfer_count);
  point_hit := case when p_chip_type in ('wildcard','free_hit') then 0
    else greatest(transfer_count - free_used, 0) * rules.transfer_hit_cost end;
  return jsonb_build_object(
    'transferCount', transfer_count, 'bankBefore', team.bank,
    'bankAfter', resulting_bank, 'freeTransfersBefore', team.free_transfers,
    'freeTransfersUsed', case when p_chip_type in ('wildcard','free_hit') then 0 else free_used end,
    'pointHit', point_hit, 'resultingVersion', team.version + 1,
    'deadlineAt', gameweek.deadline_at, 'chipType', p_chip_type
  );
end;
$$;

create or replace function api.confirm_fantasy_transfers(
  p_team_id uuid,
  p_gameweek_id uuid,
  p_transfers jsonb,
  p_expected_version bigint,
  p_idempotency_key uuid,
  p_chip_type app.fantasy_chip_type default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
declare team app.fantasy_teams%rowtype;
declare preview jsonb;
declare request_hash text;
declare existing_hash text;
declare cached_response jsonb;
declare target_batch_id uuid;
begin
  team := app_private.fantasy_assert_owner(p_team_id);
  if p_idempotency_key is null then raise exception using errcode = 'PT400', message = 'validation_failed'; end if;
  request_hash := encode(extensions.digest(convert_to(
    team.id::text || ':' || p_gameweek_id::text || ':' || p_transfers::text || ':' || coalesce(p_chip_type::text, ''), 'UTF8'
  ), 'sha256'), 'hex');
  select fantasy_idempotency.request_hash, fantasy_idempotency.response_body
  into existing_hash, cached_response
  from app_private.fantasy_idempotency_keys fantasy_idempotency
  where fantasy_idempotency.user_id = current_user_id
    and fantasy_idempotency.operation = 'confirm_transfers'
    and fantasy_idempotency.idempotency_key = p_idempotency_key;
  if found then
    if existing_hash <> request_hash then raise exception using errcode = 'PT409', message = 'idempotency_conflict'; end if;
    return cached_response;
  end if;
  select * into team from app.fantasy_teams where id = p_team_id and user_id = current_user_id for update;
  preview := api.preview_fantasy_transfers(p_team_id, p_gameweek_id, p_transfers, p_expected_version, p_chip_type);
  if p_chip_type is not null and not exists (
    select 1 from app.fantasy_chip_uses chip
    where chip.fantasy_team_id = team.id and chip.gameweek_id = p_gameweek_id
      and chip.chip_type = p_chip_type and chip.cancelled_at is null
  ) then raise exception using errcode = 'PT409', message = 'chip_unavailable'; end if;
  if p_chip_type = 'free_hit' then
    insert into app.fantasy_free_hit_snapshots (
      chip_use_id, fantasy_team_id, gameweek_id, bank, team_value, free_transfers, team_version
    ) select chip.id, team.id, p_gameweek_id, team.bank, team.team_value, team.free_transfers, team.version
    from app.fantasy_chip_uses chip where chip.fantasy_team_id = team.id
      and chip.gameweek_id = p_gameweek_id and chip.chip_type = 'free_hit' and chip.cancelled_at is null
    on conflict (chip_use_id) do nothing;
    insert into app.fantasy_free_hit_snapshot_players (
      snapshot_id, fantasy_player_id, purchase_price, sale_price, acquired_gameweek_id
    ) select snapshot.id, membership.fantasy_player_id, membership.purchase_price,
      membership.current_sale_price, membership.acquired_gameweek_id
    from app.fantasy_free_hit_snapshots snapshot
    join app.fantasy_squad_memberships membership on membership.fantasy_team_id = team.id and membership.sold_at is null
    where snapshot.fantasy_team_id = team.id and snapshot.gameweek_id = p_gameweek_id
    on conflict (snapshot_id, fantasy_player_id) do nothing;
  end if;
  insert into app.fantasy_transfer_batches (
    fantasy_team_id, gameweek_id, idempotency_key, base_team_version, resulting_team_version,
    transfers_count, free_transfers_before, free_transfers_used, point_hit,
    bank_before, bank_after, chip_type
  ) values (
    team.id, p_gameweek_id, p_idempotency_key, team.version, team.version + 1,
    (preview->>'transferCount')::integer, team.free_transfers,
    (preview->>'freeTransfersUsed')::integer, (preview->>'pointHit')::integer,
    team.bank, (preview->>'bankAfter')::numeric, p_chip_type
  ) returning id into target_batch_id;
  insert into app.fantasy_transfers (
    transfer_batch_id, sequence_number, player_out_id, player_in_id, sale_price, purchase_price
  ) select target_batch_id, item.ordinality::integer,
    (item.value->>'player_out_id')::uuid, (item.value->>'player_in_id')::uuid,
    membership.current_sale_price, player_in.price
  from jsonb_array_elements(p_transfers) with ordinality as item(value, ordinality)
  join app.fantasy_squad_memberships membership on membership.fantasy_team_id = team.id
    and membership.fantasy_player_id = (item.value->>'player_out_id')::uuid and membership.sold_at is null
  join app.fantasy_players player_in on player_in.id = (item.value->>'player_in_id')::uuid;
  update app.fantasy_squad_memberships membership set sold_gameweek_id = p_gameweek_id,
    sold_at = statement_timestamp()
  where membership.fantasy_team_id = team.id and membership.sold_at is null
    and membership.fantasy_player_id in (
      select item.player_out_id from jsonb_to_recordset(p_transfers) as item(player_out_id uuid)
    );
  insert into app.fantasy_squad_memberships (
    fantasy_team_id, fantasy_player_id, purchase_price, current_sale_price, acquired_gameweek_id
  ) select team.id, player.id, player.price, player.price, p_gameweek_id
  from jsonb_to_recordset(p_transfers) as item(player_in_id uuid)
  join app.fantasy_players player on player.id = item.player_in_id;
  update app.fantasy_teams set
    bank = (preview->>'bankAfter')::numeric,
    team_value = team_value + team.bank - (preview->>'bankAfter')::numeric,
    free_transfers = case when p_chip_type in ('wildcard','free_hit') then free_transfers
      else greatest(free_transfers - (preview->>'freeTransfersUsed')::integer, 0) end,
    version = version + 1
  where id = team.id;
  cached_response := jsonb_build_object('transferBatchId', target_batch_id,
    'preview', preview, 'team', app_private.fantasy_team_dto(team.id));
  insert into app_private.fantasy_idempotency_keys (
    user_id, operation, idempotency_key, request_hash, response_body, expires_at
  ) values (current_user_id, 'confirm_transfers', p_idempotency_key, request_hash, cached_response, statement_timestamp() + interval '30 days');
  insert into app_private.fantasy_mutation_audit (
    user_id, fantasy_team_id, operation, accepted, base_version, resulting_version,
    idempotency_key, safe_metadata
  ) values (current_user_id, team.id, 'confirm_transfers', true, team.version,
    team.version + 1, p_idempotency_key, preview);
  return cached_response;
end;
$$;

create or replace function api.activate_fantasy_chip(
  p_team_id uuid,
  p_gameweek_id uuid,
  p_chip_type app.fantasy_chip_type,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
declare team app.fantasy_teams%rowtype;
declare gameweek app.fantasy_gameweeks%rowtype;
declare target app.fantasy_chip_uses%rowtype;
begin
  team := app_private.fantasy_assert_owner(p_team_id);
  gameweek := app_private.fantasy_assert_mutable_gameweek(p_gameweek_id);
  if team.fantasy_season_id <> gameweek.fantasy_season_id or p_idempotency_key is null then
    raise exception using errcode = 'PT400', message = 'chip_unavailable';
  end if;
  select * into team from app.fantasy_teams where id = p_team_id and user_id = current_user_id for update;
  if team.version <> p_expected_version then
    raise exception using errcode = 'PT409', message = 'version_conflict',
      detail = jsonb_build_object('latestVersion', team.version)::text;
  end if;
  select * into target from app.fantasy_chip_uses
  where fantasy_team_id = team.id and activation_idempotency_key = p_idempotency_key;
  if found then
    if target.chip_type <> p_chip_type or target.gameweek_id <> p_gameweek_id then
      raise exception using errcode = 'PT409', message = 'idempotency_conflict';
    end if;
    return jsonb_build_object('chipUseId', target.id, 'chipType', target.chip_type,
      'gameweekId', target.gameweek_id, 'activatedAt', target.activated_at,
      'teamVersion', team.version);
  end if;
  if exists (select 1 from app.fantasy_chip_uses where fantasy_team_id = team.id
    and chip_type = p_chip_type and cancelled_at is null) then
    raise exception using errcode = 'PT409', message = 'chip_already_used';
  end if;
  if exists (select 1 from app.fantasy_chip_uses where fantasy_team_id = team.id
    and gameweek_id = p_gameweek_id and cancelled_at is null) then
    raise exception using errcode = 'PT409', message = 'chip_conflict';
  end if;
  insert into app.fantasy_chip_uses (
    fantasy_team_id, gameweek_id, chip_type, activation_idempotency_key
  ) values (team.id, p_gameweek_id, p_chip_type, p_idempotency_key) returning * into target;
  update app.fantasy_teams set version = version + 1 where id = team.id returning version into team.version;
  insert into app_private.fantasy_mutation_audit (
    user_id, fantasy_team_id, operation, accepted, base_version, resulting_version,
    idempotency_key, safe_metadata
  ) values (current_user_id, team.id, 'activate_chip', true, p_expected_version,
    team.version, p_idempotency_key, jsonb_build_object('chipType', p_chip_type, 'gameweekId', p_gameweek_id));
  return jsonb_build_object('chipUseId', target.id, 'chipType', target.chip_type,
    'gameweekId', target.gameweek_id, 'activatedAt', target.activated_at,
    'teamVersion', team.version);
end;
$$;

create or replace function api.cancel_fantasy_chip(
  p_team_id uuid,
  p_gameweek_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
declare team app.fantasy_teams%rowtype;
declare target_id uuid;
begin
  team := app_private.fantasy_assert_owner(p_team_id);
  perform app_private.fantasy_assert_mutable_gameweek(p_gameweek_id);
  select * into team from app.fantasy_teams where id = p_team_id and user_id = current_user_id for update;
  if team.version <> p_expected_version then raise exception using errcode = 'PT409', message = 'version_conflict'; end if;
  update app.fantasy_chip_uses set cancelled_at = statement_timestamp()
  where fantasy_team_id = team.id and gameweek_id = p_gameweek_id
    and cancelled_at is null and finalized_at is null
    and not exists (select 1 from app.fantasy_transfer_batches batch
      where batch.fantasy_team_id = team.id and batch.gameweek_id = p_gameweek_id
        and batch.chip_type in ('wildcard','free_hit'))
  returning id into target_id;
  if target_id is null then raise exception using errcode = 'PT409', message = 'chip_unavailable'; end if;
  update app.fantasy_teams set version = version + 1 where id = team.id returning version into team.version;
  insert into app_private.fantasy_mutation_audit (
    user_id, fantasy_team_id, operation, accepted, base_version, resulting_version, safe_metadata
  ) values (current_user_id, team.id, 'cancel_chip', true, p_expected_version, team.version,
    jsonb_build_object('gameweekId', p_gameweek_id));
  return jsonb_build_object('cancelled', true, 'teamVersion', team.version);
end;
$$;

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
      'provisionalPoints', points.provisional_points, 'finalPoints', points.final_points,
      'didPlay', points.did_play, 'minutesPlayed', points.minutes_played
    ) order by lineup_player.slot, lineup_player.slot_order)
    from app.fantasy_lineups lineup
    join app.fantasy_lineup_players lineup_player on lineup_player.lineup_id = lineup.id
    left join app.fantasy_player_gameweek_points points
      on points.fantasy_player_id = lineup_player.fantasy_player_id and points.gameweek_id = gameweek.id
    where lineup.fantasy_team_id = team.id and lineup.gameweek_id = gameweek.id), '[]'::jsonb)
  ) into result
  from app.fantasy_gameweeks gameweek
  left join app.fantasy_team_gameweek_results result_row
    on result_row.fantasy_team_id = team.id and result_row.gameweek_id = gameweek.id
  where gameweek.id = p_gameweek_id and gameweek.fantasy_season_id = team.fantasy_season_id;
  if result is null then raise exception using errcode = 'PT404', message = 'data_unavailable'; end if;
  return result;
end;
$$;

create or replace function api.get_my_fantasy_history(
  p_team_id uuid,
  p_before_gameweek_sequence integer default null,
  p_limit integer default 20
)
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
  if p_limit not between 1 and 50 then raise exception using errcode = 'PT400', message = 'validation_failed'; end if;
  with page as (
    select result_row.*, gameweek.sequence_number, gameweek.name as gameweek_name
    from app.fantasy_team_gameweek_results result_row
    join app.fantasy_gameweeks gameweek on gameweek.id = result_row.gameweek_id
    where result_row.fantasy_team_id = team.id
      and (p_before_gameweek_sequence is null or gameweek.sequence_number < p_before_gameweek_sequence)
    order by gameweek.sequence_number desc limit p_limit
  )
  select jsonb_build_object('items', coalesce(jsonb_agg(jsonb_build_object(
    'gameweekId', gameweek_id, 'sequence', sequence_number, 'name', gameweek_name,
    'score', coalesce(final_score, provisional_score), 'state', state,
    'transferHit', transfer_hit, 'chipType', chip_type, 'rank', rank,
    'overallRank', overall_rank, 'teamValue', team.team_value, 'bank', team.bank
  ) order by sequence_number desc), '[]'::jsonb),
  'nextCursor', case when count(*) = p_limit then min(sequence_number) else null end)
  into result from page;
  return result;
end;
$$;

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
declare digest text;
begin
  team := app_private.fantasy_assert_owner(p_team_id);
  if team.fantasy_season_id <> p_season_id or p_idempotency_key is null
    or p_name is null or p_name <> btrim(p_name) or char_length(p_name) not between 3 and 80
  then raise exception using errcode = 'PT400', message = 'validation_failed'; end if;
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(current_user_id::text || ':fantasy:league:' || p_idempotency_key::text, 0));
  select (response_body->>'leagueId')::uuid into league_id
  from app_private.fantasy_idempotency_keys
  where user_id = current_user_id and operation = 'create_league' and idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('leagueId', league_id, 'created', false); end if;
  if p_visibility = 'private' then
    invite_code := upper(encode(extensions.gen_random_bytes(16), 'hex'));
    digest := encode(extensions.digest(convert_to(invite_code, 'UTF8'), 'sha256'), 'hex');
  end if;
  insert into app.fantasy_leagues (
    fantasy_season_id, owner_user_id, name, visibility, invite_code_digest, invite_code_hint
  ) values (p_season_id, current_user_id, p_name, p_visibility, digest,
    case when invite_code is null then null else right(invite_code, 4) end)
  returning id into league_id;
  insert into app.fantasy_league_memberships (league_id, fantasy_team_id, user_id, role)
  values (league_id, team.id, current_user_id, 'owner');
  insert into app_private.fantasy_idempotency_keys (
    user_id, operation, idempotency_key, request_hash, response_body, expires_at
  ) values (current_user_id, 'create_league', p_idempotency_key,
    encode(extensions.digest(convert_to(p_name || ':' || p_visibility::text, 'UTF8'), 'sha256'), 'hex'),
    jsonb_build_object('leagueId', league_id), statement_timestamp() + interval '30 days');
  return jsonb_build_object('leagueId', league_id, 'name', p_name,
    'visibility', p_visibility, 'inviteCode', invite_code, 'created', true);
end;
$$;

create or replace function api.join_fantasy_league(
  p_team_id uuid,
  p_invite_code text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
declare team app.fantasy_teams%rowtype;
declare target app.fantasy_leagues%rowtype;
declare code_digest text;
begin
  team := app_private.fantasy_assert_owner(p_team_id);
  if p_invite_code is null or p_idempotency_key is null then
    raise exception using errcode = 'PT400', message = 'invite_code_invalid';
  end if;
  code_digest := encode(extensions.digest(convert_to(upper(btrim(p_invite_code)), 'UTF8'), 'sha256'), 'hex');
  select * into target from app.fantasy_leagues
  where invite_code_digest = code_digest and visibility = 'private' and active for update;
  if not found or target.fantasy_season_id <> team.fantasy_season_id then
    raise exception using errcode = 'PT404', message = 'invite_code_invalid';
  end if;
  if exists (select 1 from app.fantasy_league_memberships
    where league_id = target.id and user_id = current_user_id and status = 'active') then
    return jsonb_build_object('leagueId', target.id, 'joined', false);
  end if;
  insert into app.fantasy_league_memberships (league_id, fantasy_team_id, user_id)
  values (target.id, team.id, current_user_id)
  on conflict (league_id, user_id) do update set status = 'active', left_at = null, fantasy_team_id = excluded.fantasy_team_id;
  update app.fantasy_leagues set member_count = member_count + 1 where id = target.id;
  return jsonb_build_object('leagueId', target.id, 'joined', true);
end;
$$;

create or replace function api.leave_fantasy_league(p_league_id uuid, p_team_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
begin
  perform app_private.fantasy_assert_owner(p_team_id);
  update app.fantasy_league_memberships set status = 'left', left_at = statement_timestamp()
  where league_id = p_league_id and fantasy_team_id = p_team_id
    and user_id = current_user_id and role <> 'owner' and status = 'active';
  if not found then raise exception using errcode = 'PT403', message = 'league_access_denied'; end if;
  update app.fantasy_leagues set member_count = greatest(member_count - 1, 0) where id = p_league_id;
  return true;
end;
$$;

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
declare result jsonb;
begin
  if p_limit not between 1 and 100 or ((p_after_rank is null) <> (p_after_team_id is null)) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select * into target from app.fantasy_leagues where id = p_league_id and active;
  if not found then raise exception using errcode = 'PT404', message = 'league_not_found'; end if;
  if target.visibility = 'private' and not exists (
    select 1 from app.fantasy_league_memberships membership
    where membership.league_id = target.id and membership.user_id = (select auth.uid()) and membership.status = 'active'
  ) then raise exception using errcode = 'PT403', message = 'league_access_denied'; end if;
  with page as (
    select ranking.*, team.name as team_name
    from app.fantasy_rankings ranking join app.fantasy_teams team on team.id = ranking.fantasy_team_id
    where ranking.league_id = target.id
      and ranking.gameweek_id is not distinct from p_gameweek_id
      and (p_after_rank is null or (ranking.rank, ranking.fantasy_team_id) > (p_after_rank, p_after_team_id))
    order by ranking.rank, ranking.fantasy_team_id limit p_limit
  )
  select jsonb_build_object(
    'league', jsonb_build_object('id', target.id, 'name', target.name,
      'visibility', target.visibility, 'memberCount', target.member_count),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'teamId', fantasy_team_id, 'teamName', team_name, 'rank', rank,
      'previousRank', previous_rank, 'totalPoints', total_points,
      'gameweekPoints', gameweek_points, 'calculatedAt', calculated_at
    ) order by rank, fantasy_team_id), '[]'::jsonb)
  ) into result from page;
  return result;
end;
$$;

create or replace function api.fantasy_rules(p_season_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'seasonId', season.id, 'rulesetId', rules.id, 'rulesetVersion', rules.version,
    'squadSize', rules.squad_size, 'budget', rules.initial_budget,
    'maxPlayersPerClub', rules.max_players_per_club,
    'initialFreeTransfers', rules.initial_free_transfers,
    'maxFreeTransferRollover', rules.max_free_transfer_rollover,
    'transferHitCost', rules.transfer_hit_cost,
    'captainMultiplier', rules.captain_multiplier,
    'tripleCaptainMultiplier', rules.triple_captain_multiplier,
    'positions', (select jsonb_agg(jsonb_build_object(
      'code', position.code, 'squadQuota', position_rule.squad_quota,
      'startingMinimum', position_rule.starting_minimum,
      'startingMaximum', position_rule.starting_maximum,
      'goalPoints', position_rule.goal_points,
      'cleanSheetPoints', position_rule.clean_sheet_points
    ) order by position.display_order)
    from app.fantasy_position_rules position_rule
    join app.fantasy_positions position on position.id = position_rule.position_id
    where position_rule.ruleset_id = rules.id),
    'scoring', (select coalesce(jsonb_agg(jsonb_build_object(
      'category', scoring.category, 'points', scoring.points,
      'threshold', scoring.threshold, 'position', position.code
    ) order by scoring.category, position.code, scoring.threshold), '[]'::jsonb)
    from app.fantasy_scoring_rules scoring
    left join app.fantasy_positions position on position.id = scoring.position_id
    where scoring.ruleset_id = rules.id and scoring.active)
  ) into result
  from app.fantasy_seasons season join app.fantasy_rulesets rules on rules.id = season.ruleset_id
  where season.id = p_season_id;
  if result is null then raise exception using errcode = 'PT404', message = 'fantasy_season_closed'; end if;
  return result;
end;
$$;

create or replace function api.service_begin_fantasy_job(
  p_job_type text,
  p_season_id uuid default null,
  p_gameweek_id uuid default null,
  p_calculation_version bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare run_id uuid;
begin
  if not app_private.is_service_request() then raise exception using errcode = 'PT403', message = 'forbidden'; end if;
  if p_job_type !~ '^(open_gameweek|lock_deadline|recalculate_provisional_points|finalize_gameweek|restore_free_hit|roll_free_transfers|recalculate_rankings|apply_price_changes)$'
  then raise exception using errcode = 'PT400', message = 'validation_failed'; end if;
  insert into app_private.fantasy_job_runs (
    job_type, fantasy_season_id, gameweek_id, status, started_at, calculation_version
  ) values (p_job_type, p_season_id, p_gameweek_id, 'running', statement_timestamp(), p_calculation_version)
  returning id into run_id;
  return run_id;
end;
$$;

create or replace function api.service_complete_fantasy_job(
  p_run_id uuid,
  p_status app.fantasy_run_status,
  p_processed integer,
  p_skipped integer,
  p_failed integer,
  p_error_code text default null,
  p_error_summary text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.is_service_request() then raise exception using errcode = 'PT403', message = 'forbidden'; end if;
  if p_status not in ('succeeded','partial','failed','cancelled')
    or p_processed < 0 or p_skipped < 0 or p_failed < 0
  then raise exception using errcode = 'PT400', message = 'validation_failed'; end if;
  update app_private.fantasy_job_runs set status = p_status, completed_at = statement_timestamp(),
    processed_count = p_processed, skipped_count = p_skipped, failed_count = p_failed,
    stable_error_code = p_error_code, sanitized_error_summary = left(p_error_summary, 500),
    lock_owner = null, lock_expires_at = null
  where id = p_run_id and status in ('pending','running','partial');
  return found;
end;
$$;

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
begin
  if not app_private.is_service_request() then raise exception using errcode = 'PT403', message = 'forbidden'; end if;
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

create or replace function api.service_restore_free_hit(p_gameweek_id uuid, p_batch_size integer default 250)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare snapshot record;
declare restored integer := 0;
begin
  if not app_private.is_service_request() then raise exception using errcode = 'PT403', message = 'forbidden'; end if;
  if p_batch_size not between 1 and 1000 then raise exception using errcode = 'PT400', message = 'validation_failed'; end if;
  for snapshot in
    select target.* from app.fantasy_free_hit_snapshots target
    where target.gameweek_id = p_gameweek_id and target.restored_at is null
    order by target.id for update skip locked limit p_batch_size
  loop
    update app.fantasy_squad_memberships set sold_gameweek_id = p_gameweek_id,
      sold_at = statement_timestamp()
    where fantasy_team_id = snapshot.fantasy_team_id and sold_at is null;
    insert into app.fantasy_squad_memberships (
      fantasy_team_id, fantasy_player_id, purchase_price, current_sale_price,
      acquired_gameweek_id
    ) select snapshot.fantasy_team_id, player.fantasy_player_id,
      player.purchase_price, player.sale_price, player.acquired_gameweek_id
    from app.fantasy_free_hit_snapshot_players player where player.snapshot_id = snapshot.id;
    update app.fantasy_teams set bank = snapshot.bank, team_value = snapshot.team_value,
      free_transfers = snapshot.free_transfers, version = version + 1
    where id = snapshot.fantasy_team_id;
    update app.fantasy_free_hit_snapshots set restored_at = statement_timestamp(),
      restoration_version = (select version from app.fantasy_teams where id = snapshot.fantasy_team_id)
    where id = snapshot.id and restored_at is null;
    restored := restored + 1;
  end loop;
  return jsonb_build_object('restored', restored, 'hasMore', exists (
    select 1 from app.fantasy_free_hit_snapshots where gameweek_id = p_gameweek_id and restored_at is null
  ));
end;
$$;

create or replace function api.service_roll_fantasy_free_transfers(
  p_gameweek_id uuid,
  p_batch_size integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare updated_count integer;
begin
  if not app_private.is_service_request() then raise exception using errcode = 'PT403', message = 'forbidden'; end if;
  if p_batch_size not between 1 and 2000 then raise exception using errcode = 'PT400', message = 'validation_failed'; end if;
  with candidates as (
    select team.id, rules.max_free_transfer_rollover, rules.initial_free_transfers
    from app.fantasy_teams team
    join app.fantasy_seasons season on season.id = team.fantasy_season_id
    join app.fantasy_rulesets rules on rules.id = season.ruleset_id
    join app.fantasy_gameweeks gameweek on gameweek.id = p_gameweek_id
      and gameweek.fantasy_season_id = team.fantasy_season_id
    where team.status = 'active' and team.current_gameweek_id = p_gameweek_id
    order by team.id for update of team skip locked limit p_batch_size
  )
  update app.fantasy_teams team set
    free_transfers = least(candidate.max_free_transfer_rollover,
      team.free_transfers + candidate.initial_free_transfers),
    version = version + 1
  from candidates candidate where team.id = candidate.id;
  get diagnostics updated_count = row_count;
  return jsonb_build_object('updated', updated_count);
end;
$$;

create or replace function api.service_recalculate_fantasy_rankings(
  p_season_id uuid,
  p_gameweek_id uuid default null,
  p_league_id uuid default null,
  p_calculation_version bigint default 1
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare affected integer;
begin
  if not app_private.is_service_request() then raise exception using errcode = 'PT403', message = 'forbidden'; end if;
  with totals as (
    select team.id as fantasy_team_id,
      coalesce(sum(coalesce(result.final_score, result.provisional_score)), 0)::integer as total_points,
      max(result.final_score) filter (where result.gameweek_id = p_gameweek_id) as gameweek_points,
      coalesce(sum(result.transfer_hit), 0)::integer as transfer_hits
    from app.fantasy_teams team
    left join app.fantasy_team_gameweek_results result on result.fantasy_team_id = team.id
    where team.fantasy_season_id = p_season_id and team.status = 'active'
      and (p_league_id is null or exists (select 1 from app.fantasy_league_memberships membership
        where membership.league_id = p_league_id and membership.fantasy_team_id = team.id and membership.status = 'active'))
    group by team.id
  ), ranked as (
    select totals.*, row_number() over (
      order by case when p_gameweek_id is null then total_points else coalesce(gameweek_points, 0) end desc,
        transfer_hits asc, fantasy_team_id asc
    ) as computed_rank
    from totals
  )
  insert into app.fantasy_rankings (
    fantasy_season_id, gameweek_id, league_id, fantasy_team_id, rank,
    total_points, gameweek_points, transfer_hits, calculation_version, calculated_at
  ) select p_season_id, p_gameweek_id, p_league_id, fantasy_team_id, computed_rank,
    total_points, gameweek_points, transfer_hits, p_calculation_version, statement_timestamp()
  from ranked
  on conflict (fantasy_season_id, gameweek_id, league_id, fantasy_team_id) do update set
    previous_rank = app.fantasy_rankings.rank, rank = excluded.rank,
    total_points = excluded.total_points, gameweek_points = excluded.gameweek_points,
    transfer_hits = excluded.transfer_hits, calculation_version = excluded.calculation_version,
    calculated_at = excluded.calculated_at;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- The Notification domain intentionally rejected Fantasy before this phase.
-- Phase 6 activates the already-versioned contract for target-user events only.
insert into app.notification_templates (
  template_key, notification_type, category, channel, language, version,
  title_template, body_template, required_variables, max_title_length,
  max_body_length, active, activated_at
) values
  ('transfer_confirmation', 'transfer_confirmation', 'fantasy', 'in_app', 'fr', 1,
    'Transferts confirmés', '{{transfer_count}} transfert(s), pénalité : {{point_hit}} point(s).',
    array['transfer_count','point_hit'], 120, 300, true, statement_timestamp()),
  ('transfer_confirmation', 'transfer_confirmation', 'fantasy', 'in_app', 'ar', 1,
    'تم تأكيد الانتقالات', '{{transfer_count}} انتقال، خصم {{point_hit}} نقطة.',
    array['transfer_count','point_hit'], 120, 300, true, statement_timestamp()),
  ('chip_activated', 'chip_activated', 'fantasy', 'in_app', 'fr', 1,
    'Chip activé', '{{chip}} est activé pour la journée {{gameweek}}.',
    array['chip','gameweek'], 120, 300, true, statement_timestamp()),
  ('chip_activated', 'chip_activated', 'fantasy', 'in_app', 'ar', 1,
    'تم تفعيل الشريحة', 'تم تفعيل {{chip}} للجولة {{gameweek}}.',
    array['chip','gameweek'], 120, 300, true, statement_timestamp()),
  ('gameweek_finalized', 'gameweek_finalized', 'fantasy', 'in_app', 'fr', 1,
    'Journée finalisée', 'Journée {{gameweek}} : {{points}} points définitifs.',
    array['gameweek','points'], 120, 300, true, statement_timestamp()),
  ('gameweek_finalized', 'gameweek_finalized', 'fantasy', 'in_app', 'ar', 1,
    'تم اعتماد الجولة', 'الجولة {{gameweek}}: {{points}} نقطة نهائية.',
    array['gameweek','points'], 120, 300, true, statement_timestamp()),
  ('league_position_changed', 'league_position_changed', 'fantasy', 'in_app', 'fr', 1,
    'Classement mis à jour', 'Vous êtes #{{rank}} dans {{league_name}}.',
    array['rank','league_name'], 120, 300, true, statement_timestamp()),
  ('league_position_changed', 'league_position_changed', 'fantasy', 'in_app', 'ar', 1,
    'تم تحديث الترتيب', 'ترتيبك #{{rank}} في {{league_name}}.',
    array['rank','league_name'], 120, 300, true, statement_timestamp());

create or replace function api.service_ingest_notification_event(
  p_event_id uuid,
  p_event_type app.notification_type,
  p_source_domain app.notification_source_domain,
  p_source_entity_id uuid,
  p_target_user_id uuid,
  p_occurred_at timestamptz,
  p_schema_version integer,
  p_deduplication_key text,
  p_correlation_id uuid,
  p_safe_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare resolved_id uuid;
begin
  if not app_private.is_service_request() then raise exception using errcode = 'PT403', message = 'notification_access_denied'; end if;
  if p_schema_version <> 1 then raise exception using errcode = 'PT400', message = 'event_schema_unsupported'; end if;
  if p_event_id is null or p_correlation_id is null or p_occurred_at is null
    or char_length(p_deduplication_key) not between 8 and 200
    or jsonb_typeof(coalesce(p_safe_payload, '{}'::jsonb)) <> 'object'
    or pg_column_size(coalesce(p_safe_payload, '{}'::jsonb)) > 16384
    or (p_source_domain in ('identity','fantasy') and p_target_user_id is null)
    or (p_source_domain = 'fantasy' and p_event_type not in (
      'deadline_24h','deadline_1h','team_incomplete','transfer_confirmation',
      'chip_activated','gameweek_finalized','league_position_changed'
    ))
  then raise exception using errcode = 'PT400', message = 'event_schema_unsupported'; end if;
  insert into app_private.notification_events (
    id, event_type, source_domain, source_entity_id, target_user_id,
    occurred_at, schema_version, deduplication_key, correlation_id, safe_payload
  ) values (
    p_event_id, p_event_type, p_source_domain, p_source_entity_id, p_target_user_id,
    p_occurred_at, p_schema_version, p_deduplication_key, p_correlation_id,
    coalesce(p_safe_payload, '{}'::jsonb)
  ) on conflict (deduplication_key) do nothing returning id into resolved_id;
  if resolved_id is null then select id into resolved_id from app_private.notification_events
    where deduplication_key = p_deduplication_key; end if;
  return resolved_id;
end;
$$;

create index players_fantasy_search_idx on app.players using gin (
  to_tsvector('simple', coalesce(display_name, '') || ' ' || coalesce(full_name, ''))
);

-- Defense in depth: policies express ownership/publicity, while canonical
-- tables still have no browser grants. Application reads/writes use API RPCs.
create policy fantasy_teams_owner_select on app.fantasy_teams for select to authenticated
using ((select auth.uid()) = user_id);
create policy fantasy_squad_owner_select on app.fantasy_squad_memberships for select to authenticated
using (exists (select 1 from app.fantasy_teams team where team.id = fantasy_team_id and team.user_id = (select auth.uid())));
create policy fantasy_lineups_owner_select on app.fantasy_lineups for select to authenticated
using (exists (select 1 from app.fantasy_teams team where team.id = fantasy_team_id and team.user_id = (select auth.uid())));
create policy fantasy_lineup_players_owner_select on app.fantasy_lineup_players for select to authenticated
using (exists (select 1 from app.fantasy_lineups lineup join app.fantasy_teams team on team.id = lineup.fantasy_team_id
  where lineup.id = lineup_id and team.user_id = (select auth.uid())));
create policy fantasy_results_owner_select on app.fantasy_team_gameweek_results for select to authenticated
using (exists (select 1 from app.fantasy_teams team where team.id = fantasy_team_id and team.user_id = (select auth.uid())));
create policy fantasy_leagues_visible_select on app.fantasy_leagues for select to authenticated
using (visibility = 'public' or exists (select 1 from app.fantasy_league_memberships membership
  where membership.league_id = id and membership.user_id = (select auth.uid()) and membership.status = 'active'));
create policy fantasy_league_memberships_member_select on app.fantasy_league_memberships for select to authenticated
using (user_id = (select auth.uid()) or exists (select 1 from app.fantasy_leagues league
  where league.id = league_id and league.visibility = 'public'));

revoke all on function api.fantasy_hub(text) from public, anon, authenticated, service_role;
revoke all on function api.fantasy_player_pool(uuid, text, uuid, numeric, text, numeric, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function api.fantasy_rules(uuid) from public, anon, authenticated, service_role;
revoke all on function api.fantasy_league_standings(uuid, uuid, bigint, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function api.get_my_fantasy_team(uuid) from public, anon, authenticated, service_role;
revoke all on function api.create_fantasy_team(uuid, uuid, text, jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function api.save_fantasy_lineup(uuid, uuid, jsonb, bigint, uuid) from public, anon, authenticated, service_role;
revoke all on function api.preview_fantasy_transfers(uuid, uuid, jsonb, bigint, app.fantasy_chip_type) from public, anon, authenticated, service_role;
revoke all on function api.confirm_fantasy_transfers(uuid, uuid, jsonb, bigint, uuid, app.fantasy_chip_type) from public, anon, authenticated, service_role;
revoke all on function api.activate_fantasy_chip(uuid, uuid, app.fantasy_chip_type, bigint, uuid) from public, anon, authenticated, service_role;
revoke all on function api.cancel_fantasy_chip(uuid, uuid, bigint) from public, anon, authenticated, service_role;
revoke all on function api.get_my_fantasy_points(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function api.get_my_fantasy_history(uuid, integer, integer) from public, anon, authenticated, service_role;
revoke all on function api.create_fantasy_league(uuid, uuid, text, app.fantasy_league_visibility, uuid) from public, anon, authenticated, service_role;
revoke all on function api.join_fantasy_league(uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function api.leave_fantasy_league(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function api.service_begin_fantasy_job(text, uuid, uuid, bigint) from public, anon, authenticated, service_role;
revoke all on function api.service_complete_fantasy_job(uuid, app.fantasy_run_status, integer, integer, integer, text, text) from public, anon, authenticated, service_role;
revoke all on function api.service_upsert_fantasy_player_points(uuid, uuid, uuid, text, integer, text, bigint, integer, app.fantasy_points_state) from public, anon, authenticated, service_role;
revoke all on function api.service_restore_free_hit(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function api.service_roll_fantasy_free_transfers(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function api.service_recalculate_fantasy_rankings(uuid, uuid, uuid, bigint) from public, anon, authenticated, service_role;

grant execute on function api.fantasy_hub(text) to anon, authenticated, service_role;
grant execute on function api.fantasy_player_pool(uuid, text, uuid, numeric, text, numeric, uuid, integer) to anon, authenticated, service_role;
grant execute on function api.fantasy_rules(uuid) to anon, authenticated, service_role;
grant execute on function api.fantasy_league_standings(uuid, uuid, bigint, uuid, integer) to anon, authenticated, service_role;
grant execute on function api.get_my_fantasy_team(uuid) to authenticated, service_role;
grant execute on function api.create_fantasy_team(uuid, uuid, text, jsonb, uuid) to authenticated, service_role;
grant execute on function api.save_fantasy_lineup(uuid, uuid, jsonb, bigint, uuid) to authenticated, service_role;
grant execute on function api.preview_fantasy_transfers(uuid, uuid, jsonb, bigint, app.fantasy_chip_type) to authenticated, service_role;
grant execute on function api.confirm_fantasy_transfers(uuid, uuid, jsonb, bigint, uuid, app.fantasy_chip_type) to authenticated, service_role;
grant execute on function api.activate_fantasy_chip(uuid, uuid, app.fantasy_chip_type, bigint, uuid) to authenticated, service_role;
grant execute on function api.cancel_fantasy_chip(uuid, uuid, bigint) to authenticated, service_role;
grant execute on function api.get_my_fantasy_points(uuid, uuid) to authenticated, service_role;
grant execute on function api.get_my_fantasy_history(uuid, integer, integer) to authenticated, service_role;
grant execute on function api.create_fantasy_league(uuid, uuid, text, app.fantasy_league_visibility, uuid) to authenticated, service_role;
grant execute on function api.join_fantasy_league(uuid, text, uuid) to authenticated, service_role;
grant execute on function api.leave_fantasy_league(uuid, uuid) to authenticated, service_role;

grant execute on function api.service_begin_fantasy_job(text, uuid, uuid, bigint) to service_role;
grant execute on function api.service_complete_fantasy_job(uuid, app.fantasy_run_status, integer, integer, integer, text, text) to service_role;
grant execute on function api.service_upsert_fantasy_player_points(uuid, uuid, uuid, text, integer, text, bigint, integer, app.fantasy_points_state) to service_role;
grant execute on function api.service_restore_free_hit(uuid, integer) to service_role;
grant execute on function api.service_roll_fantasy_free_transfers(uuid, integer) to service_role;
grant execute on function api.service_recalculate_fantasy_rankings(uuid, uuid, uuid, bigint) to service_role;

revoke all on function app_private.fantasy_assert_owner(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.fantasy_assert_mutable_gameweek(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.fantasy_selection_hash(text, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function app_private.fantasy_validate_selection(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function app_private.fantasy_team_dto(uuid) from public, anon, authenticated, service_role;

-- Explicitly preserve the Notification worker's service-only execution after
-- replacing its validation function above.
grant execute on function api.service_ingest_notification_event(
  uuid, app.notification_type, app.notification_source_domain, uuid, uuid,
  timestamptz, integer, text, uuid, jsonb
) to service_role;
