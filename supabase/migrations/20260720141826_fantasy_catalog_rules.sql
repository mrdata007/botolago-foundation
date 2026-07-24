-- BotolaGO V2 — Phase 6: Fantasy catalog, versioned rules, seasons, gameweeks,
-- and the canonical Fantasy player pool. Additive and replayable from zero.

create type app.fantasy_season_status as enum (
  'planned', 'registration_open', 'active', 'completed', 'cancelled'
);
create type app.fantasy_gameweek_status as enum (
  'scheduled', 'open', 'locked', 'live', 'provisional', 'finalizing',
  'finalized', 'corrected', 'cancelled'
);
create type app.fantasy_player_status as enum (
  'available', 'doubtful', 'injured', 'suspended', 'ineligible', 'unavailable'
);
create type app.fantasy_team_status as enum ('active', 'suspended', 'archived');
create type app.fantasy_chip_type as enum (
  'wildcard', 'free_hit', 'bench_boost', 'triple_captain'
);
create type app.fantasy_transfer_batch_status as enum (
  'confirmed', 'reversed_by_correction'
);
create type app.fantasy_points_state as enum ('provisional', 'final');
create type app.fantasy_lineup_slot as enum ('starter', 'bench');
create type app.fantasy_league_visibility as enum ('public', 'private');
create type app.fantasy_league_role as enum ('owner', 'admin', 'member');
create type app.fantasy_league_member_status as enum ('active', 'left', 'removed');
create type app.fantasy_run_status as enum (
  'pending', 'running', 'partial', 'succeeded', 'failed', 'cancelled'
);

create table app.fantasy_competitions (
  id uuid primary key default gen_random_uuid(),
  football_competition_id uuid not null references app.competitions(id) on delete restrict,
  slug text not null,
  name text not null,
  active boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_competitions_football_key unique (football_competition_id),
  constraint fantasy_competitions_slug_key unique (slug),
  constraint fantasy_competitions_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint fantasy_competitions_name_check check (
    name = btrim(name) and char_length(name) between 2 and 120
  )
);

create table app.fantasy_rulesets (
  id uuid primary key default gen_random_uuid(),
  fantasy_competition_id uuid not null references app.fantasy_competitions(id) on delete restrict,
  version integer not null,
  name text not null,
  squad_size integer not null,
  initial_budget numeric(10,2) not null,
  max_players_per_club integer not null,
  initial_free_transfers integer not null,
  max_free_transfer_rollover integer not null,
  transfer_hit_cost integer not null,
  captain_multiplier numeric(4,2) not null default 2,
  triple_captain_multiplier numeric(4,2) not null default 3,
  minimum_minutes_for_appearance integer not null default 1,
  full_appearance_minutes integer not null default 60,
  active boolean not null default false,
  effective_from timestamptz not null,
  retired_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_rulesets_competition_version_key unique (fantasy_competition_id, version),
  constraint fantasy_rulesets_version_check check (version > 0),
  constraint fantasy_rulesets_name_check check (
    name = btrim(name) and char_length(name) between 2 and 120
  ),
  constraint fantasy_rulesets_squad_size_check check (squad_size between 11 and 40),
  constraint fantasy_rulesets_budget_check check (initial_budget > 0),
  constraint fantasy_rulesets_club_limit_check check (max_players_per_club between 1 and squad_size),
  constraint fantasy_rulesets_transfer_check check (
    initial_free_transfers between 0 and 10
    and max_free_transfer_rollover between initial_free_transfers and 20
    and transfer_hit_cost between 0 and 20
  ),
  constraint fantasy_rulesets_multiplier_check check (
    captain_multiplier between 1 and 5 and triple_captain_multiplier >= captain_multiplier
  ),
  constraint fantasy_rulesets_minutes_check check (
    minimum_minutes_for_appearance between 1 and 30
    and full_appearance_minutes between minimum_minutes_for_appearance and 120
  ),
  constraint fantasy_rulesets_retirement_check check (retired_at is null or retired_at > effective_from)
);
create unique index fantasy_rulesets_one_active_per_competition_idx
  on app.fantasy_rulesets (fantasy_competition_id) where active;

create table app.fantasy_positions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  display_order integer not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_positions_code_key unique (code),
  constraint fantasy_positions_code_check check (code ~ '^[A-Z]{2,4}$'),
  constraint fantasy_positions_name_check check (
    name = btrim(name) and char_length(name) between 2 and 40
  ),
  constraint fantasy_positions_display_order_key unique (display_order),
  constraint fantasy_positions_display_order_check check (display_order between 1 and 20)
);

create table app.fantasy_position_rules (
  ruleset_id uuid not null references app.fantasy_rulesets(id) on delete cascade,
  position_id uuid not null references app.fantasy_positions(id) on delete restrict,
  squad_quota integer not null,
  starting_minimum integer not null,
  starting_maximum integer not null,
  goal_points integer not null,
  clean_sheet_points integer not null default 0,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_position_rules_pkey primary key (ruleset_id, position_id),
  constraint fantasy_position_rules_quota_check check (squad_quota > 0),
  constraint fantasy_position_rules_starting_check check (
    starting_minimum >= 0 and starting_maximum >= starting_minimum
    and starting_maximum <= squad_quota
  ),
  constraint fantasy_position_rules_scoring_check check (
    goal_points between -20 and 20 and clean_sheet_points between -20 and 20
  )
);

create table app.fantasy_scoring_rules (
  id uuid primary key default gen_random_uuid(),
  ruleset_id uuid not null references app.fantasy_rulesets(id) on delete cascade,
  category text not null,
  points integer not null,
  threshold numeric(12,4),
  position_id uuid references app.fantasy_positions(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_scoring_rules_category_check check (
    category ~ '^[a-z][a-z0-9_]{2,79}$'
  ),
  constraint fantasy_scoring_rules_points_check check (points between -50 and 50),
  constraint fantasy_scoring_rules_threshold_check check (threshold is null or threshold >= 0),
  constraint fantasy_scoring_rules_key unique nulls not distinct (
    ruleset_id, category, position_id, threshold
  )
);

create table app.fantasy_seasons (
  id uuid primary key default gen_random_uuid(),
  fantasy_competition_id uuid not null references app.fantasy_competitions(id) on delete restrict,
  football_season_id uuid not null references app.seasons(id) on delete restrict,
  ruleset_id uuid not null references app.fantasy_rulesets(id) on delete restrict,
  name text not null,
  status app.fantasy_season_status not null default 'planned',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_seasons_football_key unique (football_season_id),
  constraint fantasy_seasons_competition_name_key unique (fantasy_competition_id, name),
  constraint fantasy_seasons_name_check check (
    name = btrim(name) and char_length(name) between 2 and 80
  ),
  constraint fantasy_seasons_time_check check (ends_at > starts_at)
);
create unique index fantasy_seasons_one_active_idx
  on app.fantasy_seasons (fantasy_competition_id) where status in ('registration_open', 'active');

create table app.fantasy_gameweeks (
  id uuid primary key default gen_random_uuid(),
  fantasy_season_id uuid not null references app.fantasy_seasons(id) on delete restrict,
  football_round_id uuid references app.rounds(id) on delete set null,
  sequence_number integer not null,
  name text not null,
  deadline_at timestamptz not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status app.fantasy_gameweek_status not null default 'scheduled',
  points_state app.fantasy_points_state not null default 'provisional',
  lock_version bigint not null default 1,
  scoring_input_version bigint not null default 0,
  finalized_at timestamptz,
  corrected_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_gameweeks_season_sequence_key unique (fantasy_season_id, sequence_number),
  constraint fantasy_gameweeks_football_round_key unique nulls not distinct (fantasy_season_id, football_round_id),
  constraint fantasy_gameweeks_sequence_check check (sequence_number between 1 and 1000),
  constraint fantasy_gameweeks_name_check check (
    name = btrim(name) and char_length(name) between 1 and 80
  ),
  constraint fantasy_gameweeks_time_check check (
    deadline_at <= starts_at and ends_at > starts_at
  ),
  constraint fantasy_gameweeks_version_check check (lock_version > 0 and scoring_input_version >= 0),
  constraint fantasy_gameweeks_finalized_check check (
    (status in ('finalized', 'corrected') and finalized_at is not null and points_state = 'final')
    or (status not in ('finalized', 'corrected') and finalized_at is null)
  ),
  constraint fantasy_gameweeks_corrected_check check (
    (status = 'corrected' and corrected_at is not null) or status <> 'corrected'
  )
);
create unique index fantasy_gameweeks_one_current_idx
  on app.fantasy_gameweeks (fantasy_season_id)
  where status in ('open', 'locked', 'live', 'provisional', 'finalizing');
create index fantasy_gameweeks_deadline_idx on app.fantasy_gameweeks (status, deadline_at, id);

create table app.fantasy_players (
  id uuid primary key default gen_random_uuid(),
  fantasy_season_id uuid not null references app.fantasy_seasons(id) on delete restrict,
  football_player_id uuid not null references app.players(id) on delete restrict,
  football_team_id uuid not null references app.teams(id) on delete restrict,
  position_id uuid not null references app.fantasy_positions(id) on delete restrict,
  price numeric(8,2) not null,
  status app.fantasy_player_status not null default 'available',
  eligible boolean not null default true,
  active boolean not null default true,
  selected_by_count bigint not null default 0,
  price_version bigint not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_players_season_player_key unique (fantasy_season_id, football_player_id),
  constraint fantasy_players_price_check check (price > 0),
  constraint fantasy_players_selected_check check (selected_by_count >= 0),
  constraint fantasy_players_version_check check (price_version > 0)
);
create index fantasy_players_pool_idx
  on app.fantasy_players (fantasy_season_id, active, eligible, position_id, price, id);
create index fantasy_players_team_idx
  on app.fantasy_players (fantasy_season_id, football_team_id, active, id);

create table app.fantasy_player_price_history (
  id uuid primary key default gen_random_uuid(),
  fantasy_player_id uuid not null references app.fantasy_players(id) on delete restrict,
  gameweek_id uuid references app.fantasy_gameweeks(id) on delete restrict,
  old_price numeric(8,2),
  new_price numeric(8,2) not null,
  reason text not null,
  effective_at timestamptz not null,
  source_version bigint not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint fantasy_player_price_history_new_price_check check (new_price > 0),
  constraint fantasy_player_price_history_old_price_check check (old_price is null or old_price > 0),
  constraint fantasy_player_price_history_reason_check check (reason ~ '^[a-z][a-z0-9_]{2,79}$'),
  constraint fantasy_player_price_history_source_key unique (fantasy_player_id, source_version)
);
create index fantasy_player_price_history_lookup_idx
  on app.fantasy_player_price_history (fantasy_player_id, effective_at desc, id desc);

create trigger fantasy_competitions_set_updated_at before update on app.fantasy_competitions
for each row execute function app_private.set_updated_at();
create trigger fantasy_rulesets_set_updated_at before update on app.fantasy_rulesets
for each row execute function app_private.set_updated_at();
create trigger fantasy_positions_set_updated_at before update on app.fantasy_positions
for each row execute function app_private.set_updated_at();
create trigger fantasy_position_rules_set_updated_at before update on app.fantasy_position_rules
for each row execute function app_private.set_updated_at();
create trigger fantasy_scoring_rules_set_updated_at before update on app.fantasy_scoring_rules
for each row execute function app_private.set_updated_at();
create trigger fantasy_seasons_set_updated_at before update on app.fantasy_seasons
for each row execute function app_private.set_updated_at();
create trigger fantasy_gameweeks_set_updated_at before update on app.fantasy_gameweeks
for each row execute function app_private.set_updated_at();
create trigger fantasy_players_set_updated_at before update on app.fantasy_players
for each row execute function app_private.set_updated_at();

alter table app.fantasy_competitions enable row level security;
alter table app.fantasy_competitions force row level security;
alter table app.fantasy_rulesets enable row level security;
alter table app.fantasy_rulesets force row level security;
alter table app.fantasy_positions enable row level security;
alter table app.fantasy_positions force row level security;
alter table app.fantasy_position_rules enable row level security;
alter table app.fantasy_position_rules force row level security;
alter table app.fantasy_scoring_rules enable row level security;
alter table app.fantasy_scoring_rules force row level security;
alter table app.fantasy_seasons enable row level security;
alter table app.fantasy_seasons force row level security;
alter table app.fantasy_gameweeks enable row level security;
alter table app.fantasy_gameweeks force row level security;
alter table app.fantasy_players enable row level security;
alter table app.fantasy_players force row level security;
alter table app.fantasy_player_price_history enable row level security;
alter table app.fantasy_player_price_history force row level security;

revoke all on table app.fantasy_competitions, app.fantasy_rulesets,
  app.fantasy_positions, app.fantasy_position_rules, app.fantasy_scoring_rules,
  app.fantasy_seasons, app.fantasy_gameweeks, app.fantasy_players,
  app.fantasy_player_price_history from anon, authenticated;
