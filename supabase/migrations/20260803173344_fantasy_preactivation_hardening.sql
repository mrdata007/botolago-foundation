-- BotolaGO V2 — Fantasy pre-activation hardening.
--
-- Additive only. This migration does not create a Fantasy season, gameweek,
-- player catalog, worker, or schedule. It keeps the published v1.0 ruleset
-- unchanged and publishes v1.1 for future catalog activation.

create table app.fantasy_fixture_difficulty_rules (
  ruleset_id uuid primary key references app.fantasy_rulesets(id) on delete restrict,
  algorithm_code text not null,
  rank_weight numeric(6,5) not null,
  points_per_match_weight numeric(6,5) not null,
  goal_difference_weight numeric(6,5) not null,
  recent_form_weight numeric(6,5) not null,
  recent_form_matches integer not null,
  minimum_current_season_matches integer not null,
  away_difficulty_adjustment numeric(6,5) not null,
  level_1_upper numeric(6,5) not null,
  level_2_upper numeric(6,5) not null,
  level_3_upper numeric(6,5) not null,
  level_4_upper numeric(6,5) not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_fixture_difficulty_rules_algorithm_check check (
    algorithm_code ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'
  ),
  constraint fantasy_fixture_difficulty_rules_weight_check check (
    rank_weight >= 0 and points_per_match_weight >= 0
    and goal_difference_weight >= 0 and recent_form_weight >= 0
    and rank_weight + points_per_match_weight + goal_difference_weight + recent_form_weight = 1
  ),
  constraint fantasy_fixture_difficulty_rules_sample_check check (
    recent_form_matches between 1 and 20 and minimum_current_season_matches between 1 and 20
  ),
  constraint fantasy_fixture_difficulty_rules_adjustment_check check (
    away_difficulty_adjustment between 0 and 0.25
  ),
  constraint fantasy_fixture_difficulty_rules_threshold_check check (
    0 < level_1_upper and level_1_upper < level_2_upper
    and level_2_upper < level_3_upper and level_3_upper < level_4_upper
    and level_4_upper < 1
  )
);

create trigger fantasy_fixture_difficulty_rules_set_updated_at
before update on app.fantasy_fixture_difficulty_rules
for each row execute function app_private.set_updated_at();

alter table app.fantasy_fixture_difficulty_rules enable row level security;
alter table app.fantasy_fixture_difficulty_rules force row level security;
revoke all on app.fantasy_fixture_difficulty_rules from public, anon, authenticated;

-- Publish v1.1 by cloning the immutable v1.0 rules and enabling only the new
-- fixture-difficulty capability. Existing seasons remain pinned to v1.0.
insert into app.fantasy_rulesets (
  id, fantasy_competition_id, version, minor_version, ruleset_code, name,
  squad_size, initial_budget, max_players_per_club, initial_free_transfers,
  max_free_transfer_rollover, transfer_hit_cost, captain_multiplier,
  triple_captain_multiplier, minimum_minutes_for_appearance,
  full_appearance_minutes, active, effective_from, retired_at, published_at
)
select
  'f6100000-0000-4000-8000-000000000101', fantasy_competition_id, version, 1,
  'botolago-fantasy-v1.1', 'BotolaGO Fantasy Ruleset v1.1', squad_size,
  initial_budget, max_players_per_club, initial_free_transfers,
  max_free_transfer_rollover, transfer_hit_cost, captain_multiplier,
  triple_captain_multiplier, minimum_minutes_for_appearance,
  full_appearance_minutes, true, '2026-08-03T00:00:00Z', null,
  '2026-08-03T00:00:00Z'
from app.fantasy_rulesets
where id = 'f6100000-0000-4000-8000-000000000100';

insert into app.fantasy_position_rules (
  ruleset_id, position_id, squad_quota, starting_minimum, starting_maximum,
  goal_points, clean_sheet_points
)
select 'f6100000-0000-4000-8000-000000000101', position_id, squad_quota,
  starting_minimum, starting_maximum, goal_points, clean_sheet_points
from app.fantasy_position_rules
where ruleset_id = 'f6100000-0000-4000-8000-000000000100';

insert into app.fantasy_scoring_rules (
  ruleset_id, category, points, threshold, position_id, active
)
select 'f6100000-0000-4000-8000-000000000101', category, points, threshold,
  position_id, active
from app.fantasy_scoring_rules
where ruleset_id = 'f6100000-0000-4000-8000-000000000100';

insert into app.fantasy_ruleset_features (
  ruleset_id, official_assists_only, inferred_assists_enabled,
  bonus_points_enabled, player_of_match_enabled, fixture_difficulty_enabled
)
select 'f6100000-0000-4000-8000-000000000101', official_assists_only,
  inferred_assists_enabled, bonus_points_enabled, player_of_match_enabled, true
from app.fantasy_ruleset_features
where ruleset_id = 'f6100000-0000-4000-8000-000000000100';

insert into app.fantasy_deadline_rules (
  ruleset_id, minutes_before_first_fixture, grace_period_seconds,
  administrative_change_requires_open_gameweek
)
select 'f6100000-0000-4000-8000-000000000101', minutes_before_first_fixture,
  grace_period_seconds, administrative_change_requires_open_gameweek
from app.fantasy_deadline_rules
where ruleset_id = 'f6100000-0000-4000-8000-000000000100';

insert into app.fantasy_chip_rules (
  id, ruleset_id, allocation_code, chip_type, starts_at_gameweek,
  ends_at_gameweek, use_limit, activation_cancellable, transfer_hit_exempt,
  permanent_squad_change, post_gameweek_free_transfers, midpoint_fallback
)
select md5('botolago-fantasy-v1.1:' || allocation_code)::uuid,
  'f6100000-0000-4000-8000-000000000101', allocation_code, chip_type,
  starts_at_gameweek, ends_at_gameweek, use_limit, activation_cancellable,
  transfer_hit_exempt, permanent_squad_change, post_gameweek_free_transfers,
  midpoint_fallback
from app.fantasy_chip_rules
where ruleset_id = 'f6100000-0000-4000-8000-000000000100';

insert into app.fantasy_price_rules (
  ruleset_id, initial_minimum, initial_maximum, absolute_minimum,
  absolute_maximum, price_increment, minimum_net_transfers,
  small_rate_threshold, large_rate_threshold, small_movement, large_movement,
  maximum_gameweek_movement, sale_profit_block, sale_profit_increment,
  exclude_wildcard_demand, exclude_free_hit_demand
)
select 'f6100000-0000-4000-8000-000000000101', initial_minimum,
  initial_maximum, absolute_minimum, absolute_maximum, price_increment,
  minimum_net_transfers, small_rate_threshold, large_rate_threshold,
  small_movement, large_movement, maximum_gameweek_movement,
  sale_profit_block, sale_profit_increment, exclude_wildcard_demand,
  exclude_free_hit_demand
from app.fantasy_price_rules
where ruleset_id = 'f6100000-0000-4000-8000-000000000100';

insert into app.fantasy_ranking_tiebreak_rules (
  ruleset_id, priority, criterion, direction
)
select 'f6100000-0000-4000-8000-000000000101', priority, criterion, direction
from app.fantasy_ranking_tiebreak_rules
where ruleset_id = 'f6100000-0000-4000-8000-000000000100';

insert into app.fantasy_fixture_rules (
  ruleset_id, assignment_frozen_at_deadline, post_lock_completion_window_hours,
  correction_window_hours, late_correction_requires_elevated_approval,
  unresolved_gameweek_remains_provisional, aggregate_double_gameweek_fixtures
)
select 'f6100000-0000-4000-8000-000000000101', assignment_frozen_at_deadline,
  post_lock_completion_window_hours, correction_window_hours,
  late_correction_requires_elevated_approval,
  unresolved_gameweek_remains_provisional, aggregate_double_gameweek_fixtures
from app.fantasy_fixture_rules
where ruleset_id = 'f6100000-0000-4000-8000-000000000100';

insert into app.fantasy_fixture_difficulty_rules (
  ruleset_id, algorithm_code, rank_weight, points_per_match_weight,
  goal_difference_weight, recent_form_weight, recent_form_matches,
  minimum_current_season_matches, away_difficulty_adjustment,
  level_1_upper, level_2_upper, level_3_upper, level_4_upper
) values (
  'f6100000-0000-4000-8000-000000000101',
  'table-strength-v1.0', 0.45, 0.25, 0.15, 0.15, 6, 3, 0.07,
  0.20, 0.40, 0.60, 0.80
);

-- Team DTOs now expose only server-derived chip state. The response contains
-- no profile identity and therefore does not widen public manager visibility.
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
    ), '[]'::jsonb),
    'chips', jsonb_build_object(
      'active', (
        select chip.chip_type from app.fantasy_chip_uses chip
        where chip.fantasy_team_id = team.id
          and chip.gameweek_id = team.current_gameweek_id
          and chip.cancelled_at is null and chip.finalized_at is null
        order by chip.activated_at desc limit 1
      ),
      'activeCancellable', coalesce((
        select rule.activation_cancellable
        from app.fantasy_chip_uses chip
        left join app.fantasy_chip_rules rule on rule.id = chip.chip_rule_id
        where chip.fantasy_team_id = team.id
          and chip.gameweek_id = team.current_gameweek_id
          and chip.cancelled_at is null and chip.finalized_at is null
        order by chip.activated_at desc limit 1
      ), false),
      'used', coalesce((
        select jsonb_agg(used.chip_type order by used.chip_type)
        from (
          select distinct chip.chip_type
          from app.fantasy_chip_uses chip
          left join app.fantasy_chip_rules rule on rule.id = chip.chip_rule_id
          left join app.fantasy_gameweeks current_gameweek on current_gameweek.id = team.current_gameweek_id
          where chip.fantasy_team_id = team.id
            and chip.cancelled_at is null
            and chip.finalized_at is not null
            and (
              rule.id is null
              or current_gameweek.id is null
              or current_gameweek.sequence_number between rule.starts_at_gameweek
                and coalesce(rule.ends_at_gameweek, 1000)
            )
        ) used
      ), '[]'::jsonb)
    )
  ) into result from app.fantasy_teams team where team.id = p_team_id;
  return result;
end;
$$;

-- Validate the complete post-transfer squad before returning a preview.
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
declare resulting_count integer;
declare club_violations integer;
declare quota_violations integer;
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
  if jsonb_typeof(p_transfers) <> 'array' then
    raise exception using errcode = 'PT400', message = 'invalid_transfer';
  end if;
  select * into season from app.fantasy_seasons where id = team.fantasy_season_id;
  select * into rules from app.fantasy_rulesets where id = season.ruleset_id;

  with requested as (
    select * from jsonb_to_recordset(p_transfers)
      as item(player_out_id uuid, player_in_id uuid)
  )
  select count(*), coalesce(sum(out_membership.current_sale_price), 0),
    coalesce(sum(player_in.price), 0)
  into transfer_count, sale_total, purchase_total
  from requested
  join app.fantasy_squad_memberships out_membership
    on out_membership.fantasy_team_id = team.id
    and out_membership.fantasy_player_id = requested.player_out_id
    and out_membership.sold_at is null
  join app.fantasy_players player_out on player_out.id = requested.player_out_id
  join app.fantasy_players player_in on player_in.id = requested.player_in_id
    and player_in.fantasy_season_id = team.fantasy_season_id
    and player_in.active and player_in.eligible
    and player_in.status not in ('ineligible', 'unavailable')
  where player_out.position_id = player_in.position_id;

  if transfer_count < 1 or transfer_count > rules.squad_size
    or transfer_count <> jsonb_array_length(p_transfers)
    or (select count(distinct item->>'player_out_id') from jsonb_array_elements(p_transfers) item) <> transfer_count
    or (select count(distinct item->>'player_in_id') from jsonb_array_elements(p_transfers) item) <> transfer_count
    or exists (
      select 1 from jsonb_to_recordset(p_transfers)
        as item(player_out_id uuid, player_in_id uuid)
      where item.player_out_id = item.player_in_id
        or exists (
          select 1 from app.fantasy_squad_memberships membership
          where membership.fantasy_team_id = team.id
            and membership.fantasy_player_id = item.player_in_id
            and membership.sold_at is null
        )
    )
  then
    raise exception using errcode = 'PT400', message = 'invalid_transfer';
  end if;

  with requested as (
    select * from jsonb_to_recordset(p_transfers)
      as item(player_out_id uuid, player_in_id uuid)
  ), resulting as (
    select membership.fantasy_player_id
    from app.fantasy_squad_memberships membership
    where membership.fantasy_team_id = team.id and membership.sold_at is null
      and not exists (
        select 1 from requested where requested.player_out_id = membership.fantasy_player_id
      )
    union all
    select requested.player_in_id from requested
  ), resolved as (
    select player.position_id, player.football_team_id
    from resulting join app.fantasy_players player on player.id = resulting.fantasy_player_id
  )
  select count(*),
    (select count(*) from (
      select football_team_id from resolved group by football_team_id
      having count(*) > rules.max_players_per_club
    ) clubs),
    (select count(*) from app.fantasy_position_rules position_rule
      left join (
        select position_id, count(*) as player_count from resolved group by position_id
      ) position_count on position_count.position_id = position_rule.position_id
      where position_rule.ruleset_id = rules.id
        and coalesce(position_count.player_count, 0) <> position_rule.squad_quota)
  into resulting_count, club_violations, quota_violations
  from resolved;

  if resulting_count <> rules.squad_size or club_violations > 0 or quota_violations > 0 then
    raise exception using errcode = 'PT400', message = case
      when club_violations > 0 then 'club_limit_exceeded' else 'invalid_squad' end;
  end if;

  if p_chip_type is not null and not exists (
    select 1 from app.fantasy_chip_uses chip
    where chip.fantasy_team_id = team.id and chip.gameweek_id = gameweek.id
      and chip.chip_type = p_chip_type and chip.cancelled_at is null
      and chip.finalized_at is null
  ) then
    raise exception using errcode = 'PT409', message = 'chip_unavailable';
  end if;

  resulting_bank := team.bank + sale_total - purchase_total;
  if resulting_bank < 0 then
    raise exception using errcode = 'PT400', message = 'budget_exceeded';
  end if;
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

-- Confirm the transfer batch, active memberships, and current lineup in one
-- transaction. No client-provided budget, hit, or lineup total is trusted.
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
declare target_lineup_id uuid;
declare updated_lineup_players integer;
declare resulting_team_value numeric(10,2);
begin
  team := app_private.fantasy_assert_owner(p_team_id);
  if p_idempotency_key is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  request_hash := encode(extensions.digest(convert_to(
    team.id::text || ':' || p_gameweek_id::text || ':' || p_transfers::text || ':'
      || coalesce(p_chip_type::text, ''), 'UTF8'
  ), 'sha256'), 'hex');
  select idempotency.request_hash, idempotency.response_body
  into existing_hash, cached_response
  from app_private.fantasy_idempotency_keys idempotency
  where idempotency.user_id = current_user_id
    and idempotency.operation = 'confirm_transfers'
    and idempotency.idempotency_key = p_idempotency_key;
  if found then
    if existing_hash <> request_hash then
      raise exception using errcode = 'PT409', message = 'idempotency_conflict';
    end if;
    return cached_response;
  end if;

  select * into team from app.fantasy_teams
  where id = p_team_id and user_id = current_user_id for update;
  preview := api.preview_fantasy_transfers(
    p_team_id, p_gameweek_id, p_transfers, p_expected_version, p_chip_type
  );
  select lineup.id into target_lineup_id
  from app.fantasy_lineups lineup
  where lineup.fantasy_team_id = team.id and lineup.gameweek_id = p_gameweek_id
    and lineup.locked_at is null and lineup.finalized_at is null
  for update;
  if target_lineup_id is null then
    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_locked';
  end if;

  if p_chip_type = 'free_hit' then
    insert into app.fantasy_free_hit_snapshots (
      chip_use_id, fantasy_team_id, gameweek_id, bank, team_value,
      free_transfers, team_version
    ) select chip.id, team.id, p_gameweek_id, team.bank, team.team_value,
      team.free_transfers, team.version
    from app.fantasy_chip_uses chip
    where chip.fantasy_team_id = team.id and chip.gameweek_id = p_gameweek_id
      and chip.chip_type = 'free_hit' and chip.cancelled_at is null
    on conflict (chip_use_id) do nothing;
    insert into app.fantasy_free_hit_snapshot_players (
      snapshot_id, fantasy_player_id, purchase_price, sale_price,
      acquired_gameweek_id
    ) select snapshot.id, membership.fantasy_player_id,
      membership.purchase_price, membership.current_sale_price,
      membership.acquired_gameweek_id
    from app.fantasy_free_hit_snapshots snapshot
    join app.fantasy_squad_memberships membership
      on membership.fantasy_team_id = team.id and membership.sold_at is null
    where snapshot.fantasy_team_id = team.id and snapshot.gameweek_id = p_gameweek_id
    on conflict (snapshot_id, fantasy_player_id) do nothing;
  end if;

  insert into app.fantasy_transfer_batches (
    fantasy_team_id, gameweek_id, idempotency_key, base_team_version,
    resulting_team_version, transfers_count, free_transfers_before,
    free_transfers_used, point_hit, bank_before, bank_after, chip_type
  ) values (
    team.id, p_gameweek_id, p_idempotency_key, team.version, team.version + 1,
    (preview->>'transferCount')::integer, team.free_transfers,
    (preview->>'freeTransfersUsed')::integer, (preview->>'pointHit')::integer,
    team.bank, (preview->>'bankAfter')::numeric, p_chip_type
  ) returning id into target_batch_id;

  insert into app.fantasy_transfers (
    transfer_batch_id, sequence_number, player_out_id, player_in_id,
    sale_price, purchase_price
  ) select target_batch_id, item.ordinality::integer,
    (item.value->>'player_out_id')::uuid,
    (item.value->>'player_in_id')::uuid,
    membership.current_sale_price, player_in.price
  from jsonb_array_elements(p_transfers) with ordinality as item(value, ordinality)
  join app.fantasy_squad_memberships membership
    on membership.fantasy_team_id = team.id
    and membership.fantasy_player_id = (item.value->>'player_out_id')::uuid
    and membership.sold_at is null
  join app.fantasy_players player_in
    on player_in.id = (item.value->>'player_in_id')::uuid;

  update app.fantasy_lineup_players lineup_player set
    fantasy_player_id = requested.player_in_id,
    snapshot_price = player_in.price,
    updated_at = statement_timestamp()
  from jsonb_to_recordset(p_transfers)
    as requested(player_out_id uuid, player_in_id uuid)
  join app.fantasy_players player_in on player_in.id = requested.player_in_id
  where lineup_player.lineup_id = target_lineup_id
    and lineup_player.fantasy_player_id = requested.player_out_id;
  get diagnostics updated_lineup_players = row_count;
  if updated_lineup_players <> (preview->>'transferCount')::integer then
    raise exception using errcode = 'PT400', message = 'invalid_squad';
  end if;

  update app.fantasy_squad_memberships membership set
    sold_gameweek_id = p_gameweek_id, sold_at = statement_timestamp()
  where membership.fantasy_team_id = team.id and membership.sold_at is null
    and membership.fantasy_player_id in (
      select item.player_out_id from jsonb_to_recordset(p_transfers)
        as item(player_out_id uuid)
    );
  insert into app.fantasy_squad_memberships (
    fantasy_team_id, fantasy_player_id, purchase_price, current_sale_price,
    acquired_gameweek_id
  ) select team.id, player.id, player.price, player.price, p_gameweek_id
  from jsonb_to_recordset(p_transfers) as item(player_in_id uuid)
  join app.fantasy_players player on player.id = item.player_in_id;

  select sum(player.price) into resulting_team_value
  from app.fantasy_squad_memberships membership
  join app.fantasy_players player on player.id = membership.fantasy_player_id
  where membership.fantasy_team_id = team.id and membership.sold_at is null;
  update app.fantasy_teams set
    bank = (preview->>'bankAfter')::numeric,
    team_value = resulting_team_value,
    free_transfers = case when p_chip_type in ('wildcard','free_hit') then free_transfers
      else greatest(free_transfers - (preview->>'freeTransfersUsed')::integer, 0) end,
    version = version + 1
  where id = team.id returning version into team.version;
  update app.fantasy_lineups set team_version = team.version,
    updated_at = statement_timestamp() where id = target_lineup_id;

  cached_response := jsonb_build_object(
    'transferBatchId', target_batch_id, 'preview', preview,
    'team', app_private.fantasy_team_dto(team.id)
  );
  insert into app_private.fantasy_idempotency_keys (
    user_id, operation, idempotency_key, request_hash, response_body, expires_at
  ) values (
    current_user_id, 'confirm_transfers', p_idempotency_key, request_hash,
    cached_response, statement_timestamp() + interval '30 days'
  );
  insert into app_private.fantasy_mutation_audit (
    user_id, fantasy_team_id, operation, accepted, base_version,
    resulting_version, idempotency_key, safe_metadata
  ) values (
    current_user_id, team.id, 'confirm_transfers', true, p_expected_version,
    team.version, p_idempotency_key, preview
  );
  return cached_response;
end;
$$;

create or replace function api.fantasy_fixture_difficulty(
  p_season_id uuid,
  p_from_gameweek integer,
  p_gameweek_count integer default 6
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if p_from_gameweek < 1 or p_gameweek_count not between 1 and 12 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if not exists (
    select 1
    from app.fantasy_seasons fantasy_season
    join app.fantasy_ruleset_features feature on feature.ruleset_id = fantasy_season.ruleset_id
    join app.fantasy_fixture_difficulty_rules rule on rule.ruleset_id = fantasy_season.ruleset_id
    where fantasy_season.id = p_season_id and feature.fixture_difficulty_enabled
  ) then
    raise exception using errcode = 'PT404', message = 'data_unavailable';
  end if;

  with context as (
    select fantasy_season.id as fantasy_season_id,
      fantasy_season.football_season_id, football_season.competition_id,
      football_season.starts_on, difficulty_rule.*
    from app.fantasy_seasons fantasy_season
    join app.seasons football_season on football_season.id = fantasy_season.football_season_id
    join app.fantasy_fixture_difficulty_rules difficulty_rule
      on difficulty_rule.ruleset_id = fantasy_season.ruleset_id
    where fantasy_season.id = p_season_id
  ), assigned as (
    select assignment.fixture_id, assignment.gameweek_id,
      gameweek.sequence_number, fixture.kickoff_at,
      fixture.home_team_id, fixture.away_team_id
    from context
    join app.fantasy_fixture_assignments assignment
      on assignment.fantasy_season_id = context.fantasy_season_id
      and assignment.superseded_at is null and assignment.counts_points
    join app.fantasy_gameweeks gameweek on gameweek.id = assignment.gameweek_id
    join app.fixtures fixture on fixture.id = assignment.fixture_id
    where gameweek.sequence_number between p_from_gameweek
      and p_from_gameweek + p_gameweek_count - 1
  ), sides as (
    select fixture_id, gameweek_id, sequence_number, kickoff_at,
      home_team_id as club_id, away_team_id as opponent_club_id, true as is_home
    from assigned
    union all
    select fixture_id, gameweek_id, sequence_number, kickoff_at,
      away_team_id, home_team_id, false
    from assigned
  ), facts as (
    select sides.*, standing.rank, standing.played, standing.points,
      standing.goal_difference, team_count.value as team_count,
      recent.games as recent_games, recent.points as recent_points,
      standing.season_id = context.football_season_id as current_standing,
      context.*
    from sides
    cross join context
    left join lateral (
      select candidate.*
      from app.standings candidate
      join app.seasons candidate_season on candidate_season.id = candidate.season_id
      where candidate.team_id = sides.opponent_club_id
        and candidate.competition_id = context.competition_id
        and candidate.table_type = 'overall' and candidate.group_key = ''
        and (
          (candidate.season_id = context.football_season_id
            and candidate.played >= context.minimum_current_season_matches)
          or candidate_season.ends_on < context.starts_on
        )
      order by (candidate.season_id = context.football_season_id) desc,
        candidate_season.ends_on desc
      limit 1
    ) standing on true
    left join lateral (
      select count(*)::numeric as value from app.standings peer
      where peer.season_id = standing.season_id
        and peer.table_type = standing.table_type and peer.group_key = standing.group_key
    ) team_count on true
    left join lateral (
      select count(*)::numeric as games, coalesce(sum(recent_fixture.points), 0)::numeric as points
      from (
        select case
          when fixture.home_team_id = sides.opponent_club_id and fixture.home_score > fixture.away_score then 3
          when fixture.away_team_id = sides.opponent_club_id and fixture.away_score > fixture.home_score then 3
          when fixture.home_score = fixture.away_score then 1 else 0 end as points
        from app.fixtures fixture
        where sides.opponent_club_id in (fixture.home_team_id, fixture.away_team_id)
          and fixture.competition_id = context.competition_id
          and fixture.status = 'finished' and fixture.kickoff_at < sides.kickoff_at
        order by fixture.kickoff_at desc, fixture.id desc
        limit context.recent_form_matches
      ) recent_fixture
    ) recent on true
  ), scored as (
    select facts.*,
      least(1, greatest(0,
        rank_weight * case when team_count > 1 and rank is not null
          then 1 - ((rank - 1)::numeric / (team_count - 1)) else 0.5 end
        + points_per_match_weight * case when played > 0
          then least(1, greatest(0, points::numeric / (played * 3)::numeric)) else 0.5 end
        + goal_difference_weight * case when played > 0
          then least(1, greatest(0, ((goal_difference::numeric / played) + 2) / 4)) else 0.5 end
        + recent_form_weight * case when recent_games > 0
          then least(1, greatest(0, recent_points / (recent_games * 3))) else 0.5 end
        + case when is_home then 0 else away_difficulty_adjustment end
      )) as strength
    from facts
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'fixtureId', fixture_id, 'gameweekId', gameweek_id,
    'gameweek', sequence_number, 'clubId', club_id,
    'opponentClubId', opponent_club_id, 'kickoffAt', kickoff_at,
    'isHome', is_home,
    'difficulty', case
      when strength < level_1_upper then 1
      when strength < level_2_upper then 2
      when strength < level_3_upper then 3
      when strength < level_4_upper then 4 else 5 end,
    'confidence', case
      when current_standing and played >= minimum_current_season_matches
        and recent_games >= minimum_current_season_matches then 'high'
      when rank is not null or recent_games > 0 then 'medium' else 'low' end,
    'algorithmVersion', algorithm_code
  ) order by sequence_number, club_id, kickoff_at, fixture_id), '[]'::jsonb)
  into result
  from scored;
  return result;
end;
$$;

revoke all on function api.fantasy_fixture_difficulty(uuid, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function api.fantasy_fixture_difficulty(uuid, integer, integer)
  to anon, authenticated, service_role;
