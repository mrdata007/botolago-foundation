-- BotolaGO V2 — Phase 6 closure: published Fantasy Ruleset v1.0.
--
-- This migration is additive for existing seasons. It publishes a reusable,
-- competition-neutral ruleset template, adds relational configuration for
-- chips, prices, rankings, deadlines and exceptional fixtures, and hardens the
-- existing mutation/worker contracts. Production scheduling remains disabled.

alter table app.fantasy_rulesets
  alter column fantasy_competition_id drop not null,
  add column ruleset_code text,
  add column minor_version integer not null default 0,
  add column published_at timestamptz;

alter table app.fantasy_rulesets
  add constraint fantasy_rulesets_code_check check (
    ruleset_code is null or ruleset_code ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'
  ),
  add constraint fantasy_rulesets_minor_version_check check (minor_version between 0 and 999),
  add constraint fantasy_rulesets_publication_check check (
    (ruleset_code is null and published_at is null)
    or (ruleset_code is not null and published_at is not null)
  );

create unique index fantasy_rulesets_code_idx
  on app.fantasy_rulesets (ruleset_code) where ruleset_code is not null;

create table app.fantasy_ruleset_features (
  ruleset_id uuid primary key references app.fantasy_rulesets(id) on delete restrict,
  official_assists_only boolean not null,
  inferred_assists_enabled boolean not null,
  bonus_points_enabled boolean not null,
  player_of_match_enabled boolean not null,
  fixture_difficulty_enabled boolean not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_ruleset_features_assist_check check (
    not (official_assists_only and inferred_assists_enabled)
  )
);

create table app.fantasy_deadline_rules (
  ruleset_id uuid primary key references app.fantasy_rulesets(id) on delete restrict,
  minutes_before_first_fixture integer not null,
  grace_period_seconds integer not null,
  administrative_change_requires_open_gameweek boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_deadline_rules_offset_check check (minutes_before_first_fixture between 0 and 1440),
  constraint fantasy_deadline_rules_grace_check check (grace_period_seconds between 0 and 3600)
);

create table app.fantasy_chip_rules (
  id uuid primary key default gen_random_uuid(),
  ruleset_id uuid not null references app.fantasy_rulesets(id) on delete restrict,
  allocation_code text not null,
  chip_type app.fantasy_chip_type not null,
  starts_at_gameweek integer not null,
  ends_at_gameweek integer,
  use_limit integer not null default 1,
  activation_cancellable boolean not null default false,
  transfer_hit_exempt boolean not null default false,
  permanent_squad_change boolean not null default false,
  post_gameweek_free_transfers integer,
  midpoint_fallback boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_chip_rules_allocation_key unique (ruleset_id, allocation_code),
  constraint fantasy_chip_rules_allocation_check check (allocation_code ~ '^[a-z][a-z0-9_]{2,39}$'),
  constraint fantasy_chip_rules_period_check check (
    starts_at_gameweek > 0 and (ends_at_gameweek is null or ends_at_gameweek >= starts_at_gameweek)
  ),
  constraint fantasy_chip_rules_limit_check check (use_limit = 1),
  constraint fantasy_chip_rules_transfer_check check (
    post_gameweek_free_transfers is null or post_gameweek_free_transfers between 0 and 20
  )
);
create index fantasy_chip_rules_resolution_idx
  on app.fantasy_chip_rules (ruleset_id, chip_type, starts_at_gameweek, ends_at_gameweek);

create table app.fantasy_price_rules (
  ruleset_id uuid primary key references app.fantasy_rulesets(id) on delete restrict,
  initial_minimum numeric(8,2) not null,
  initial_maximum numeric(8,2) not null,
  absolute_minimum numeric(8,2) not null,
  absolute_maximum numeric(8,2) not null,
  price_increment numeric(8,2) not null,
  minimum_net_transfers integer not null,
  small_rate_threshold numeric(8,6) not null,
  large_rate_threshold numeric(8,6) not null,
  small_movement numeric(8,2) not null,
  large_movement numeric(8,2) not null,
  maximum_gameweek_movement numeric(8,2) not null,
  sale_profit_block numeric(8,2) not null,
  sale_profit_increment numeric(8,2) not null,
  exclude_wildcard_demand boolean not null default true,
  exclude_free_hit_demand boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_price_rules_bounds_check check (
    absolute_minimum > 0 and initial_minimum >= absolute_minimum
    and initial_maximum <= absolute_maximum and initial_minimum <= initial_maximum
  ),
  constraint fantasy_price_rules_increment_check check (
    price_increment > 0 and small_movement > 0 and large_movement >= small_movement
    and maximum_gameweek_movement >= large_movement
  ),
  constraint fantasy_price_rules_threshold_check check (
    minimum_net_transfers >= 0 and small_rate_threshold > 0
    and large_rate_threshold > small_rate_threshold and large_rate_threshold <= 1
  ),
  constraint fantasy_price_rules_sale_check check (
    sale_profit_block > 0 and sale_profit_increment > 0
    and sale_profit_increment <= sale_profit_block
  )
);

create table app.fantasy_ranking_tiebreak_rules (
  ruleset_id uuid not null references app.fantasy_rulesets(id) on delete restrict,
  priority integer not null,
  criterion text not null,
  direction text not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint fantasy_ranking_tiebreak_rules_pkey primary key (ruleset_id, priority),
  constraint fantasy_ranking_tiebreak_rules_criterion_key unique (ruleset_id, criterion),
  constraint fantasy_ranking_tiebreak_rules_priority_check check (priority between 1 and 20),
  constraint fantasy_ranking_tiebreak_rules_criterion_check check (
    criterion in (
      'total_points', 'transfer_hit_points', 'confirmed_transfers',
      'latest_finalized_gameweek_score', 'team_created_at', 'team_uuid'
    )
  ),
  constraint fantasy_ranking_tiebreak_rules_direction_check check (direction in ('asc', 'desc'))
);

create table app.fantasy_fixture_rules (
  ruleset_id uuid primary key references app.fantasy_rulesets(id) on delete restrict,
  assignment_frozen_at_deadline boolean not null,
  post_lock_completion_window_hours integer not null,
  correction_window_hours integer not null,
  late_correction_requires_elevated_approval boolean not null,
  unresolved_gameweek_remains_provisional boolean not null,
  aggregate_double_gameweek_fixtures boolean not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_fixture_rules_windows_check check (
    post_lock_completion_window_hours between 0 and 168
    and correction_window_hours between 0 and 720
  )
);

create table app.fantasy_fixture_assignments (
  id uuid primary key default gen_random_uuid(),
  fantasy_season_id uuid not null references app.fantasy_seasons(id) on delete restrict,
  fixture_id uuid not null references app.fixtures(id) on delete restrict,
  gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete restrict,
  original_gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete restrict,
  original_kickoff_at timestamptz not null,
  assigned_kickoff_at timestamptz not null,
  assignment_status text not null default 'assigned',
  resolution text,
  counts_points boolean not null default true,
  frozen_at timestamptz,
  source_version bigint not null,
  superseded_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_fixture_assignments_source_key unique (
    fantasy_season_id, fixture_id, source_version
  ),
  constraint fantasy_fixture_assignments_status_check check (
    assignment_status in ('assigned', 'deferred', 'reassigned', 'voided', 'confirmed')
  ),
  constraint fantasy_fixture_assignments_resolution_check check (
    resolution is null or resolution in (
      'completed_in_window', 'moved_to_actual_gameweek', 'official_result_confirmed',
      'resumed_in_window', 'replayed', 'operator_deferred'
    )
  ),
  constraint fantasy_fixture_assignments_version_check check (source_version > 0),
  constraint fantasy_fixture_assignments_superseded_check check (
    superseded_at is null or superseded_at >= created_at
  )
);
create unique index fantasy_fixture_assignments_current_idx
  on app.fantasy_fixture_assignments (fantasy_season_id, fixture_id)
  where superseded_at is null;
create index fantasy_fixture_assignments_gameweek_idx
  on app.fantasy_fixture_assignments (gameweek_id, counts_points, fixture_id)
  where superseded_at is null;

create table app_private.fantasy_deadline_change_audit (
  id bigint generated always as identity primary key,
  gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete restrict,
  changed_by uuid references auth.users(id) on delete set null,
  previous_deadline_at timestamptz not null,
  new_deadline_at timestamptz not null,
  changed_at timestamptz not null default statement_timestamp(),
  constraint fantasy_deadline_change_audit_value_check check (
    previous_deadline_at <> new_deadline_at
  )
);
comment on table app_private.fantasy_deadline_change_audit is
  'Append-only Fantasy deadline audit. Retain with season history; never contains tokens or credentials.';
create index fantasy_deadline_change_audit_gameweek_idx
  on app_private.fantasy_deadline_change_audit (gameweek_id, changed_at desc, id desc);

create table app_private.fantasy_free_transfer_rollovers (
  fantasy_team_id uuid not null references app.fantasy_teams(id) on delete restrict,
  gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete restrict,
  free_transfers_before integer not null,
  free_transfers_after integer not null,
  chip_rule_id uuid references app.fantasy_chip_rules(id) on delete restrict,
  applied_at timestamptz not null default statement_timestamp(),
  constraint fantasy_free_transfer_rollovers_pkey primary key (fantasy_team_id, gameweek_id),
  constraint fantasy_free_transfer_rollovers_values_check check (
    free_transfers_before between 0 and 20 and free_transfers_after between 0 and 20
  )
);
create index fantasy_free_transfer_rollovers_gameweek_idx
  on app_private.fantasy_free_transfer_rollovers (gameweek_id, fantasy_team_id);

alter table app.fantasy_chip_uses add column chip_rule_id uuid
  references app.fantasy_chip_rules(id) on delete restrict;
alter table app.fantasy_chip_uses drop constraint fantasy_chip_uses_once_key;
create unique index fantasy_chip_uses_allocation_once_idx
  on app.fantasy_chip_uses (fantasy_team_id, chip_rule_id)
  where chip_rule_id is not null;
create unique index fantasy_chip_uses_legacy_once_idx
  on app.fantasy_chip_uses (fantasy_team_id, chip_type)
  where chip_rule_id is null;

alter table app.fantasy_rankings
  add column confirmed_transfers integer not null default 0,
  add column latest_finalized_gameweek_score integer,
  add column team_created_at timestamptz;
alter table app.fantasy_rankings
  add constraint fantasy_rankings_confirmed_transfers_check check (confirmed_transfers >= 0);

alter table app.fantasy_seasons add column wildcard_split_gameweek integer;
alter table app.fantasy_seasons
  add constraint fantasy_seasons_wildcard_split_check check (
    wildcard_split_gameweek is null or wildcard_split_gameweek > 0
  );

alter table app.fantasy_player_price_history
  add column net_transfers integer,
  add column active_team_count integer,
  add column movement numeric(8,2);
alter table app.fantasy_player_price_history
  add constraint fantasy_player_price_history_demand_check check (
    active_team_count is null or active_team_count > 0
  ),
  add constraint fantasy_player_price_history_movement_check check (
    movement is null or movement between -10 and 10
  );

create trigger fantasy_ruleset_features_set_updated_at before update on app.fantasy_ruleset_features
for each row execute function app_private.set_updated_at();
create trigger fantasy_deadline_rules_set_updated_at before update on app.fantasy_deadline_rules
for each row execute function app_private.set_updated_at();
create trigger fantasy_chip_rules_set_updated_at before update on app.fantasy_chip_rules
for each row execute function app_private.set_updated_at();
create trigger fantasy_price_rules_set_updated_at before update on app.fantasy_price_rules
for each row execute function app_private.set_updated_at();
create trigger fantasy_fixture_rules_set_updated_at before update on app.fantasy_fixture_rules
for each row execute function app_private.set_updated_at();
create trigger fantasy_fixture_assignments_set_updated_at before update on app.fantasy_fixture_assignments
for each row execute function app_private.set_updated_at();

alter table app.fantasy_ruleset_features enable row level security;
alter table app.fantasy_ruleset_features force row level security;
alter table app.fantasy_deadline_rules enable row level security;
alter table app.fantasy_deadline_rules force row level security;
alter table app.fantasy_chip_rules enable row level security;
alter table app.fantasy_chip_rules force row level security;
alter table app.fantasy_price_rules enable row level security;
alter table app.fantasy_price_rules force row level security;
alter table app.fantasy_ranking_tiebreak_rules enable row level security;
alter table app.fantasy_ranking_tiebreak_rules force row level security;
alter table app.fantasy_fixture_rules enable row level security;
alter table app.fantasy_fixture_rules force row level security;
alter table app.fantasy_fixture_assignments enable row level security;
alter table app.fantasy_fixture_assignments force row level security;
alter table app_private.fantasy_deadline_change_audit enable row level security;
alter table app_private.fantasy_deadline_change_audit force row level security;
alter table app_private.fantasy_free_transfer_rollovers enable row level security;
alter table app_private.fantasy_free_transfer_rollovers force row level security;

revoke all on table app.fantasy_ruleset_features, app.fantasy_deadline_rules,
  app.fantasy_chip_rules, app.fantasy_price_rules,
  app.fantasy_ranking_tiebreak_rules, app.fantasy_fixture_rules,
  app.fantasy_fixture_assignments from public, anon, authenticated;
revoke all on table app_private.fantasy_deadline_change_audit
  from public, anon, authenticated, service_role;
revoke all on table app_private.fantasy_free_transfer_rollovers
  from public, anon, authenticated, service_role;

-- Published, competition-neutral BotolaGO Fantasy Ruleset v1.0. A future
-- Fantasy season references this UUID directly; no provider or legacy ID is
-- involved.
insert into app.fantasy_rulesets (
  id, fantasy_competition_id, version, minor_version, ruleset_code, name,
  squad_size, initial_budget, max_players_per_club, initial_free_transfers,
  max_free_transfer_rollover, transfer_hit_cost, captain_multiplier,
  triple_captain_multiplier, minimum_minutes_for_appearance,
  full_appearance_minutes, active, effective_from, published_at
) values (
  'f6100000-0000-4000-8000-000000000100', null, 1, 0,
  'botolago-fantasy-v1.0', 'BotolaGO Fantasy Ruleset v1.0',
  15, 100.0, 3, 1, 2, 4, 2, 3, 1, 60, true,
  '2026-07-20T00:00:00Z', '2026-07-20T00:00:00Z'
);

insert into app.fantasy_position_rules (
  ruleset_id, position_id, squad_quota, starting_minimum, starting_maximum,
  goal_points, clean_sheet_points
)
select 'f6100000-0000-4000-8000-000000000100', position.id,
  case position.code when 'GK' then 2 when 'DEF' then 5 when 'MID' then 5 else 3 end,
  case position.code when 'GK' then 1 when 'DEF' then 3 when 'MID' then 2 else 1 end,
  case position.code when 'GK' then 1 when 'DEF' then 5 when 'MID' then 5 else 3 end,
  case position.code when 'GK' then 10 when 'DEF' then 6 when 'MID' then 5 else 4 end,
  case position.code when 'GK' then 4 when 'DEF' then 4 when 'MID' then 1 else 0 end
from app.fantasy_positions position;

insert into app.fantasy_scoring_rules (ruleset_id, category, points, threshold, position_id)
select 'f6100000-0000-4000-8000-000000000100', rule.category, rule.points,
  rule.threshold, position.id
from (values
  ('appearance_short', 1, 1::numeric, null::text),
  ('appearance_full', 2, 60::numeric, null::text),
  ('official_assist', 3, null::numeric, null::text),
  ('saves', 1, 3::numeric, 'GK'),
  ('penalty_save', 5, null::numeric, 'GK'),
  ('goals_conceded', -1, 2::numeric, 'GK'),
  ('goals_conceded', -1, 2::numeric, 'DEF'),
  ('penalty_miss', -2, null::numeric, null::text),
  ('yellow_card', -1, null::numeric, null::text),
  ('direct_red_card', -3, null::numeric, null::text),
  ('second_yellow_dismissal', -3, null::numeric, null::text),
  ('own_goal', -2, null::numeric, null::text)
) as rule(category, points, threshold, position_code)
left join app.fantasy_positions position on position.code = rule.position_code;

insert into app.fantasy_ruleset_features values (
  'f6100000-0000-4000-8000-000000000100', true, false, false, false, false,
  statement_timestamp(), statement_timestamp()
);
insert into app.fantasy_deadline_rules (
  ruleset_id, minutes_before_first_fixture, grace_period_seconds,
  administrative_change_requires_open_gameweek
) values ('f6100000-0000-4000-8000-000000000100', 90, 0, true);

insert into app.fantasy_chip_rules (
  id, ruleset_id, allocation_code, chip_type, starts_at_gameweek, ends_at_gameweek,
  activation_cancellable, transfer_hit_exempt, permanent_squad_change,
  post_gameweek_free_transfers, midpoint_fallback
) values
  ('f6200000-0000-4000-8000-000000000101', 'f6100000-0000-4000-8000-000000000100',
    'wildcard_1', 'wildcard', 1, 15, false, true, true, 1, true),
  ('f6200000-0000-4000-8000-000000000102', 'f6100000-0000-4000-8000-000000000100',
    'wildcard_2', 'wildcard', 16, null, false, true, true, 1, true),
  ('f6200000-0000-4000-8000-000000000103', 'f6100000-0000-4000-8000-000000000100',
    'free_hit', 'free_hit', 1, null, false, true, false, 1, false),
  ('f6200000-0000-4000-8000-000000000104', 'f6100000-0000-4000-8000-000000000100',
    'bench_boost', 'bench_boost', 1, null, false, false, false, null, false),
  ('f6200000-0000-4000-8000-000000000105', 'f6100000-0000-4000-8000-000000000100',
    'triple_captain', 'triple_captain', 1, null, false, false, false, null, false);

insert into app.fantasy_price_rules (
  ruleset_id, initial_minimum, initial_maximum, absolute_minimum, absolute_maximum,
  price_increment, minimum_net_transfers, small_rate_threshold,
  large_rate_threshold, small_movement, large_movement,
  maximum_gameweek_movement, sale_profit_block, sale_profit_increment
) values (
  'f6100000-0000-4000-8000-000000000100', 4.0, 12.5, 3.5, 15.0,
  0.1, 250, 0.03, 0.08, 0.1, 0.2, 0.2, 0.2, 0.1
);

insert into app.fantasy_ranking_tiebreak_rules (ruleset_id, priority, criterion, direction) values
  ('f6100000-0000-4000-8000-000000000100', 1, 'total_points', 'desc'),
  ('f6100000-0000-4000-8000-000000000100', 2, 'transfer_hit_points', 'asc'),
  ('f6100000-0000-4000-8000-000000000100', 3, 'confirmed_transfers', 'asc'),
  ('f6100000-0000-4000-8000-000000000100', 4, 'latest_finalized_gameweek_score', 'desc'),
  ('f6100000-0000-4000-8000-000000000100', 5, 'team_created_at', 'asc'),
  ('f6100000-0000-4000-8000-000000000100', 6, 'team_uuid', 'asc');

insert into app.fantasy_fixture_rules (
  ruleset_id, assignment_frozen_at_deadline, post_lock_completion_window_hours,
  correction_window_hours, late_correction_requires_elevated_approval,
  unresolved_gameweek_remains_provisional, aggregate_double_gameweek_fixtures
) values (
  'f6100000-0000-4000-8000-000000000100', true, 48, 72, true, true, true
);

create or replace function app_private.fantasy_calculate_deadline(
  p_ruleset_id uuid,
  p_first_fixture_at timestamptz
)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select p_first_fixture_at - make_interval(mins => rule.minutes_before_first_fixture)
  from app.fantasy_deadline_rules rule where rule.ruleset_id = p_ruleset_id;
$$;

create or replace function app_private.fantasy_calculate_sale_price(
  p_ruleset_id uuid,
  p_purchase_price numeric,
  p_current_price numeric
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare rule app.fantasy_price_rules%rowtype;
begin
  select * into rule from app.fantasy_price_rules where ruleset_id = p_ruleset_id;
  if not found or p_purchase_price is null or p_current_price is null
    or p_purchase_price <= 0 or p_current_price <= 0 then
    raise exception using errcode = 'PT400', message = 'invalid_price_input';
  end if;
  if p_current_price <= p_purchase_price then return p_current_price; end if;
  return p_purchase_price
    + floor((p_current_price - p_purchase_price) / rule.sale_profit_block)
      * rule.sale_profit_increment;
end;
$$;

create or replace function app_private.fantasy_calculate_price_movement(
  p_ruleset_id uuid,
  p_transfers_in bigint,
  p_transfers_out bigint,
  p_active_teams bigint
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare rule app.fantasy_price_rules%rowtype;
declare net bigint := coalesce(p_transfers_in, 0) - coalesce(p_transfers_out, 0);
declare net_rate numeric;
declare minimum_count bigint;
begin
  select * into rule from app.fantasy_price_rules where ruleset_id = p_ruleset_id;
  if not found then raise exception using errcode = 'PT400', message = 'invalid_price_input'; end if;
  if coalesce(p_active_teams, 0) <= 0 then return 0; end if;
  net_rate := net::numeric / p_active_teams::numeric;
  minimum_count := greatest(
    rule.minimum_net_transfers::bigint,
    ceil(rule.small_rate_threshold * p_active_teams)::bigint
  );
  if abs(net) < minimum_count then return 0; end if;
  if net_rate >= rule.large_rate_threshold then return rule.large_movement; end if;
  if net_rate >= rule.small_rate_threshold then return rule.small_movement; end if;
  if net_rate <= -rule.large_rate_threshold then return -rule.large_movement; end if;
  if net_rate <= -rule.small_rate_threshold then return -rule.small_movement; end if;
  return 0;
end;
$$;

create or replace function app_private.fantasy_enforce_player_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare target_ruleset_id uuid;
declare price_rule app.fantasy_price_rules%rowtype;
begin
  select season.ruleset_id into target_ruleset_id
  from app.fantasy_seasons season where season.id = new.fantasy_season_id;
  select * into price_rule from app.fantasy_price_rules where ruleset_id = target_ruleset_id;
  if found then
    if new.price < price_rule.absolute_minimum or new.price > price_rule.absolute_maximum
      or mod(new.price, price_rule.price_increment) <> 0 then
      raise exception using errcode = 'PT400', message = 'invalid_player_price';
    end if;
    if tg_op = 'INSERT'
      and (new.price < price_rule.initial_minimum or new.price > price_rule.initial_maximum) then
      raise exception using errcode = 'PT400', message = 'invalid_player_price';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.position_id is distinct from old.position_id
    and exists (
      select 1 from app.fantasy_gameweeks gameweek
      where gameweek.fantasy_season_id = new.fantasy_season_id
        and gameweek.status in ('open', 'locked', 'live', 'provisional', 'finalizing')
    ) then
    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_locked';
  end if;
  return new;
end;
$$;
create trigger fantasy_players_enforce_rules
before insert or update of price, position_id on app.fantasy_players
for each row execute function app_private.fantasy_enforce_player_rules();

create or replace function app_private.fantasy_guard_deadline_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deadline_at is not distinct from old.deadline_at then return new; end if;
  if old.status <> 'open' or statement_timestamp() >= old.deadline_at then
    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_locked';
  end if;
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  return new;
end;
$$;
create trigger fantasy_gameweeks_guard_deadline_change
before update of deadline_at on app.fantasy_gameweeks
for each row execute function app_private.fantasy_guard_deadline_change();

create or replace function app_private.fantasy_audit_deadline_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deadline_at is distinct from old.deadline_at then
    insert into app_private.fantasy_deadline_change_audit (
      gameweek_id, changed_by, previous_deadline_at, new_deadline_at
    ) values (new.id, auth.uid(), old.deadline_at, new.deadline_at);
  end if;
  return new;
end;
$$;
create trigger fantasy_gameweeks_audit_deadline_change
after update of deadline_at on app.fantasy_gameweeks
for each row execute function app_private.fantasy_audit_deadline_change();

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
declare season app.fantasy_seasons%rowtype;
declare chip_rule app.fantasy_chip_rules%rowtype;
declare target app.fantasy_chip_uses%rowtype;
begin
  team := app_private.fantasy_assert_owner(p_team_id);
  gameweek := app_private.fantasy_assert_mutable_gameweek(p_gameweek_id);
  if team.fantasy_season_id <> gameweek.fantasy_season_id or p_idempotency_key is null then
    raise exception using errcode = 'PT400', message = 'chip_unavailable';
  end if;
  select * into season from app.fantasy_seasons where id = team.fantasy_season_id;
  select * into chip_rule from app.fantasy_chip_rules rule
  where rule.ruleset_id = season.ruleset_id and rule.chip_type = p_chip_type
    and gameweek.sequence_number >= case
      when rule.allocation_code = 'wildcard_2'
        then coalesce(season.wildcard_split_gameweek + 1, rule.starts_at_gameweek)
      else rule.starts_at_gameweek end
    and (case
      when rule.allocation_code = 'wildcard_1'
        then coalesce(season.wildcard_split_gameweek, rule.ends_at_gameweek)
      else rule.ends_at_gameweek end is null
      or gameweek.sequence_number <= case
        when rule.allocation_code = 'wildcard_1'
          then coalesce(season.wildcard_split_gameweek, rule.ends_at_gameweek)
        else rule.ends_at_gameweek end)
  order by rule.starts_at_gameweek desc limit 1;
  if not found then raise exception using errcode = 'PT409', message = 'chip_unavailable'; end if;
  select * into team from app.fantasy_teams
  where id = p_team_id and user_id = current_user_id for update;
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
      'allocationCode', chip_rule.allocation_code, 'gameweekId', target.gameweek_id,
      'activatedAt', target.activated_at, 'teamVersion', team.version);
  end if;
  if exists (select 1 from app.fantasy_chip_uses use
    where use.fantasy_team_id = team.id and use.chip_rule_id = chip_rule.id) then
    raise exception using errcode = 'PT409', message = 'chip_already_used';
  end if;
  if exists (select 1 from app.fantasy_chip_uses use
    where use.fantasy_team_id = team.id and use.gameweek_id = p_gameweek_id) then
    raise exception using errcode = 'PT409', message = 'chip_conflict';
  end if;
  insert into app.fantasy_chip_uses (
    fantasy_team_id, gameweek_id, chip_type, chip_rule_id, activation_idempotency_key
  ) values (team.id, p_gameweek_id, p_chip_type, chip_rule.id, p_idempotency_key)
  returning * into target;
  update app.fantasy_teams set version = version + 1
  where id = team.id returning version into team.version;
  insert into app_private.fantasy_mutation_audit (
    user_id, fantasy_team_id, operation, accepted, base_version, resulting_version,
    idempotency_key, safe_metadata
  ) values (current_user_id, team.id, 'activate_chip', true, p_expected_version,
    team.version, p_idempotency_key, jsonb_build_object(
      'chipType', p_chip_type, 'allocationCode', chip_rule.allocation_code,
      'gameweekId', p_gameweek_id
    ));
  return jsonb_build_object('chipUseId', target.id, 'chipType', target.chip_type,
    'allocationCode', chip_rule.allocation_code, 'gameweekId', target.gameweek_id,
    'activatedAt', target.activated_at, 'teamVersion', team.version);
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
declare target app.fantasy_chip_uses%rowtype;
declare rule app.fantasy_chip_rules%rowtype;
begin
  team := app_private.fantasy_assert_owner(p_team_id);
  perform app_private.fantasy_assert_mutable_gameweek(p_gameweek_id);
  select * into team from app.fantasy_teams
  where id = p_team_id and user_id = current_user_id for update;
  if team.version <> p_expected_version then
    raise exception using errcode = 'PT409', message = 'version_conflict';
  end if;
  select * into target from app.fantasy_chip_uses use
  where use.fantasy_team_id = team.id and use.gameweek_id = p_gameweek_id
    and use.cancelled_at is null and use.finalized_at is null;
  if not found then raise exception using errcode = 'PT409', message = 'chip_unavailable'; end if;
  if target.chip_rule_id is not null then
    select * into rule from app.fantasy_chip_rules where id = target.chip_rule_id;
    if not rule.activation_cancellable then
      raise exception using errcode = 'PT409', message = 'chip_unavailable';
    end if;
  end if;
  if exists (select 1 from app.fantasy_transfer_batches batch
    where batch.fantasy_team_id = team.id and batch.gameweek_id = p_gameweek_id
      and batch.chip_type in ('wildcard','free_hit')) then
    raise exception using errcode = 'PT409', message = 'chip_unavailable';
  end if;
  update app.fantasy_chip_uses set cancelled_at = statement_timestamp() where id = target.id;
  update app.fantasy_teams set version = version + 1
  where id = team.id returning version into team.version;
  insert into app_private.fantasy_mutation_audit (
    user_id, fantasy_team_id, operation, accepted, base_version, resulting_version, safe_metadata
  ) values (current_user_id, team.id, 'cancel_chip', true, p_expected_version,
    team.version, jsonb_build_object('gameweekId', p_gameweek_id));
  return jsonb_build_object('cancelled', true, 'teamVersion', team.version);
end;
$$;

create or replace function api.service_apply_fantasy_price_changes(
  p_gameweek_id uuid,
  p_source_version bigint,
  p_after_player_id uuid default null,
  p_batch_size integer default 250
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare gameweek app.fantasy_gameweeks%rowtype;
declare season app.fantasy_seasons%rowtype;
declare price_rule app.fantasy_price_rules%rowtype;
declare active_teams bigint;
declare affected integer;
declare last_id uuid;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_source_version <= 0 or p_batch_size not between 1 and 2000 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select * into gameweek from app.fantasy_gameweeks where id = p_gameweek_id for update;
  if not found or gameweek.status not in ('finalized', 'corrected') then
    raise exception using errcode = 'PT409', message = 'gameweek_not_finalizable';
  end if;
  select * into season from app.fantasy_seasons where id = gameweek.fantasy_season_id;
  select * into price_rule from app.fantasy_price_rules where ruleset_id = season.ruleset_id;
  if not found then raise exception using errcode = 'PT400', message = 'invalid_price_input'; end if;
  if exists (select 1 from app.fantasy_gameweeks next_gameweek
    where next_gameweek.fantasy_season_id = season.id
      and next_gameweek.sequence_number > gameweek.sequence_number
      and next_gameweek.status in ('open', 'locked', 'live', 'provisional', 'finalizing')) then
    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_locked';
  end if;
  select count(*) into active_teams from app.fantasy_teams team
  where team.fantasy_season_id = season.id and team.status = 'active';

  with demand as (
    select player.id as fantasy_player_id,
      max(player.price) as current_price,
      count(transfer.id) filter (
        where batch.id is not null and transfer.player_in_id = player.id
      )::bigint as transfers_in,
      count(transfer.id) filter (
        where batch.id is not null and transfer.player_out_id = player.id
      )::bigint as transfers_out
    from app.fantasy_players player
    left join app.fantasy_transfers transfer
      on transfer.player_in_id = player.id or transfer.player_out_id = player.id
    left join app.fantasy_transfer_batches batch
      on batch.id = transfer.transfer_batch_id and batch.gameweek_id = p_gameweek_id
      and batch.status = 'confirmed'
      and (not price_rule.exclude_wildcard_demand or batch.chip_type is distinct from 'wildcard')
      and (not price_rule.exclude_free_hit_demand or batch.chip_type is distinct from 'free_hit')
    where player.fantasy_season_id = season.id
      and (p_after_player_id is null or player.id > p_after_player_id)
      and not exists (select 1 from app.fantasy_player_price_history history
        where history.fantasy_player_id = player.id and history.source_version = p_source_version)
    group by player.id
    order by player.id limit p_batch_size
  ), movements as (
    select demand.*, app_private.fantasy_calculate_price_movement(
      season.ruleset_id, demand.transfers_in, demand.transfers_out, active_teams
    ) as movement
    from demand
  ), changed as (
    update app.fantasy_players player set
      price = least(price_rule.absolute_maximum, greatest(price_rule.absolute_minimum,
        player.price + movement.movement)),
      price_version = player.price_version + 1
    from movements movement
    where player.id = movement.fantasy_player_id and movement.movement <> 0
    returning player.id, movement.current_price as old_price, player.price as new_price,
      movement.transfers_in - movement.transfers_out as net_transfers,
      player.price - movement.current_price as movement
  ), history as (
    insert into app.fantasy_player_price_history (
      fantasy_player_id, gameweek_id, old_price, new_price, reason, effective_at,
      source_version, net_transfers, active_team_count, movement
    ) select changed.id, p_gameweek_id, changed.old_price, changed.new_price,
      'gameweek_market_demand', statement_timestamp(), p_source_version,
      changed.net_transfers, active_teams, changed.movement
    from changed returning fantasy_player_id
  )
  update app.fantasy_squad_memberships membership set current_sale_price =
    app_private.fantasy_calculate_sale_price(
      season.ruleset_id, membership.purchase_price, player.price
    )
  from history join app.fantasy_players player on player.id = history.fantasy_player_id
  where membership.fantasy_player_id = history.fantasy_player_id
    and membership.sold_at is null;
  get diagnostics affected = row_count;
  select (array_agg(fantasy_player_id order by fantasy_player_id desc))[1] into last_id from (
    select player.id as fantasy_player_id from app.fantasy_players player
    where player.fantasy_season_id = season.id
      and (p_after_player_id is null or player.id > p_after_player_id)
    order by player.id limit p_batch_size
  ) page;
  return jsonb_build_object('updatedMemberships', affected, 'afterPlayerId', last_id,
    'hasMore', last_id is not null and exists (
      select 1 from app.fantasy_players player where player.fantasy_season_id = season.id
        and player.id > last_id
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
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_batch_size not between 1 and 2000 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  with candidates as (
    select team.id, rules.max_free_transfer_rollover, rules.initial_free_transfers,
      team.free_transfers as free_transfers_before,
      active_chip.post_gameweek_free_transfers, active_chip.chip_rule_id
    from app.fantasy_teams team
    join app.fantasy_seasons season on season.id = team.fantasy_season_id
    join app.fantasy_rulesets rules on rules.id = season.ruleset_id
    join app.fantasy_gameweeks gameweek on gameweek.id = p_gameweek_id
      and gameweek.fantasy_season_id = team.fantasy_season_id
    left join lateral (
      select chip_rule.post_gameweek_free_transfers, chip_rule.id as chip_rule_id
      from app.fantasy_chip_uses chip_use
      join app.fantasy_chip_rules chip_rule on chip_rule.id = chip_use.chip_rule_id
      where chip_use.fantasy_team_id = team.id
        and chip_use.gameweek_id = p_gameweek_id
        and chip_use.cancelled_at is null
      limit 1
    ) active_chip on true
    where team.status = 'active' and team.current_gameweek_id = p_gameweek_id
      and not exists (select 1 from app_private.fantasy_free_transfer_rollovers rollover
        where rollover.fantasy_team_id = team.id and rollover.gameweek_id = p_gameweek_id)
    order by team.id for update of team skip locked limit p_batch_size
  ), updated as (
    update app.fantasy_teams team set
    free_transfers = coalesce(candidate.post_gameweek_free_transfers,
      least(candidate.max_free_transfer_rollover,
        team.free_transfers + candidate.initial_free_transfers)),
    version = version + 1
    from candidates candidate where team.id = candidate.id
    returning team.id, team.free_transfers
  ), recorded as (
    insert into app_private.fantasy_free_transfer_rollovers (
      fantasy_team_id, gameweek_id, free_transfers_before, free_transfers_after, chip_rule_id
    ) select updated.id, p_gameweek_id, candidate.free_transfers_before,
      updated.free_transfers, candidate.chip_rule_id
    from updated join candidates candidate on candidate.id = updated.id
    on conflict (fantasy_team_id, gameweek_id) do nothing
    returning fantasy_team_id
  )
  select count(*)::integer into updated_count from recorded;
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
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  with eligible_teams as (
    select team.id, team.created_at
    from app.fantasy_teams team
    where team.fantasy_season_id = p_season_id and team.status = 'active'
      and (p_league_id is null or exists (
        select 1 from app.fantasy_league_memberships membership
        where membership.league_id = p_league_id
          and membership.fantasy_team_id = team.id and membership.status = 'active'
      ))
  ), result_totals as (
    select result.fantasy_team_id,
      coalesce(sum(coalesce(result.final_score, result.provisional_score)), 0)::integer as total_points,
      max(coalesce(result.final_score, result.provisional_score))
        filter (where result.gameweek_id = p_gameweek_id) as gameweek_points,
      coalesce(sum(result.transfer_hit), 0)::integer as transfer_hits
    from app.fantasy_team_gameweek_results result
    join eligible_teams team on team.id = result.fantasy_team_id
    group by result.fantasy_team_id
  ), transfer_totals as (
    select batch.fantasy_team_id, sum(batch.transfers_count)::integer as confirmed_transfers
    from app.fantasy_transfer_batches batch
    join eligible_teams team on team.id = batch.fantasy_team_id
    where batch.status = 'confirmed'
    group by batch.fantasy_team_id
  ), latest_scores as (
    select distinct on (result.fantasy_team_id) result.fantasy_team_id,
      result.final_score as latest_finalized_gameweek_score
    from app.fantasy_team_gameweek_results result
    join app.fantasy_gameweeks gameweek on gameweek.id = result.gameweek_id
    join eligible_teams team on team.id = result.fantasy_team_id
    where result.state = 'final'
    order by result.fantasy_team_id, gameweek.sequence_number desc, result.id desc
  ), totals as (
    select team.id as fantasy_team_id, team.created_at as team_created_at,
      coalesce(result.total_points, 0) as total_points, result.gameweek_points,
      coalesce(result.transfer_hits, 0) as transfer_hits,
      coalesce(transfer.confirmed_transfers, 0) as confirmed_transfers,
      latest.latest_finalized_gameweek_score
    from eligible_teams team
    left join result_totals result on result.fantasy_team_id = team.id
    left join transfer_totals transfer on transfer.fantasy_team_id = team.id
    left join latest_scores latest on latest.fantasy_team_id = team.id
  ), ranked as (
    select totals.*, row_number() over (order by
      case when p_gameweek_id is null then total_points else coalesce(gameweek_points, 0) end desc,
      transfer_hits asc, confirmed_transfers asc,
      latest_finalized_gameweek_score desc nulls last,
      team_created_at asc, fantasy_team_id asc
    ) as computed_rank
    from totals
  )
  insert into app.fantasy_rankings (
    fantasy_season_id, gameweek_id, league_id, fantasy_team_id, rank,
    total_points, gameweek_points, transfer_hits, confirmed_transfers,
    latest_finalized_gameweek_score, team_created_at,
    calculation_version, calculated_at
  ) select p_season_id, p_gameweek_id, p_league_id, fantasy_team_id, computed_rank,
    total_points, gameweek_points, transfer_hits, confirmed_transfers,
    latest_finalized_gameweek_score, team_created_at,
    p_calculation_version, statement_timestamp()
  from ranked
  on conflict (fantasy_season_id, gameweek_id, league_id, fantasy_team_id) do update set
    previous_rank = app.fantasy_rankings.rank, rank = excluded.rank,
    total_points = excluded.total_points, gameweek_points = excluded.gameweek_points,
    transfer_hits = excluded.transfer_hits,
    confirmed_transfers = excluded.confirmed_transfers,
    latest_finalized_gameweek_score = excluded.latest_finalized_gameweek_score,
    team_created_at = excluded.team_created_at,
    calculation_version = excluded.calculation_version,
    calculated_at = excluded.calculated_at;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

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
declare last_team_id uuid;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_calculation_version <= 0 or p_batch_size not between 1 and 2000 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select * into gameweek from app.fantasy_gameweeks where id = p_gameweek_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found'; end if;
  if gameweek.status = 'finalized' then
    return jsonb_build_object('finalized', 0, 'afterTeamId', null, 'hasMore', false,
      'stableResult', true);
  end if;
  if gameweek.status not in ('provisional', 'finalizing') then
    raise exception using errcode = 'PT409', message = 'gameweek_not_finalizable';
  end if;
  update app.fantasy_gameweeks set status = 'finalizing'
  where id = gameweek.id and status = 'provisional';

  with candidates as (
    select result.id, result.fantasy_team_id
    from app.fantasy_team_gameweek_results result
    where result.gameweek_id = p_gameweek_id and result.state = 'provisional'
      and (p_after_team_id is null or result.fantasy_team_id > p_after_team_id)
    order by result.fantasy_team_id
    for update skip locked limit p_batch_size
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
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
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
    or exists (select 1 from app.fantasy_free_hit_snapshots snapshot
      where snapshot.gameweek_id = p_gameweek_id and snapshot.restored_at is null) then
    raise exception using errcode = 'PT409', message = 'gameweek_not_finalizable';
  end if;
  update app.fantasy_gameweeks set status = 'finalized', points_state = 'final',
    scoring_input_version = greatest(scoring_input_version, p_calculation_version),
    finalized_at = statement_timestamp()
  where id = target.id returning * into target;
  return jsonb_build_object('finalized', true, 'stableResult', false,
    'finalizedAt', target.finalized_at);
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
    'seasonId', season.id, 'rulesetId', rules.id,
    'rulesetCode', rules.ruleset_code,
    'rulesetVersion', rules.version,
    'rulesetSemanticVersion', rules.version || '.' || rules.minor_version,
    'squadSize', rules.squad_size, 'budget', rules.initial_budget,
    'maxPlayersPerClub', rules.max_players_per_club,
    'initialFreeTransfers', rules.initial_free_transfers,
    'maxFreeTransferRollover', rules.max_free_transfer_rollover,
    'transferHitCost', rules.transfer_hit_cost,
    'captainMultiplier', rules.captain_multiplier,
    'tripleCaptainMultiplier', rules.triple_captain_multiplier,
    'deadline', (select jsonb_build_object(
      'minutesBeforeFirstFixture', deadline.minutes_before_first_fixture,
      'gracePeriodSeconds', deadline.grace_period_seconds
    ) from app.fantasy_deadline_rules deadline where deadline.ruleset_id = rules.id),
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
    where scoring.ruleset_id = rules.id and scoring.active),
    'chips', (select coalesce(jsonb_agg(jsonb_build_object(
      'allocationCode', chip.allocation_code, 'chipType', chip.chip_type,
      'startsAtGameweek', chip.starts_at_gameweek,
      'endsAtGameweek', chip.ends_at_gameweek,
      'cancellable', chip.activation_cancellable
    ) order by chip.starts_at_gameweek, chip.allocation_code), '[]'::jsonb)
    from app.fantasy_chip_rules chip where chip.ruleset_id = rules.id),
    'features', (select to_jsonb(feature) - 'ruleset_id' - 'created_at' - 'updated_at'
      from app.fantasy_ruleset_features feature where feature.ruleset_id = rules.id)
  ) into result
  from app.fantasy_seasons season
  join app.fantasy_rulesets rules on rules.id = season.ruleset_id
  where season.id = p_season_id;
  if result is null then
    raise exception using errcode = 'PT404', message = 'fantasy_season_closed';
  end if;
  return result;
end;
$$;

revoke all on function app_private.fantasy_calculate_deadline(uuid, timestamptz) from public;
revoke all on function app_private.fantasy_calculate_sale_price(uuid, numeric, numeric) from public;
revoke all on function app_private.fantasy_calculate_price_movement(uuid, bigint, bigint, bigint) from public;
revoke all on function api.service_apply_fantasy_price_changes(uuid, bigint, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function api.service_apply_fantasy_price_changes(uuid, bigint, uuid, integer)
  to service_role;
revoke all on function api.service_finalize_fantasy_team_results(uuid, bigint, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function api.service_finalize_fantasy_team_results(uuid, bigint, uuid, integer)
  to service_role;
revoke all on function api.service_complete_fantasy_gameweek(uuid, bigint)
  from public, anon, authenticated, service_role;
grant execute on function api.service_complete_fantasy_gameweek(uuid, bigint)
  to service_role;

comment on table app.fantasy_ruleset_features is
  'Versioned Fantasy feature switches. Ruleset v1.0 disables bonus, player-of-match, inferred assists, and fixture difficulty.';
comment on table app.fantasy_fixture_assignments is
  'Auditable fixture-to-gameweek assignment history. Current membership is the row with superseded_at null.';
