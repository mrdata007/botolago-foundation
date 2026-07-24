-- BotolaGO V2 — Phase 6: authoritative teams, temporal squads, immutable
-- lineups, transactional transfers, chips, and idempotency/audit ledgers.

create table app.fantasy_teams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.profiles(id) on delete restrict,
  fantasy_season_id uuid not null references app.fantasy_seasons(id) on delete restrict,
  current_gameweek_id uuid references app.fantasy_gameweeks(id) on delete restrict,
  name text not null,
  bank numeric(10,2) not null,
  team_value numeric(10,2) not null,
  free_transfers integer not null,
  version bigint not null default 1,
  status app.fantasy_team_status not null default 'active',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_teams_user_season_key unique (user_id, fantasy_season_id),
  constraint fantasy_teams_name_check check (
    name = btrim(name) and char_length(name) between 3 and 40
    and name ~ '^[[:alnum:]][[:alnum:] _''.-]{1,38}[[:alnum:]]$'
  ),
  constraint fantasy_teams_bank_check check (bank >= 0),
  constraint fantasy_teams_value_check check (team_value > 0),
  constraint fantasy_teams_free_transfers_check check (free_transfers between 0 and 20),
  constraint fantasy_teams_version_check check (version > 0)
);
create index fantasy_teams_season_idx
  on app.fantasy_teams (fantasy_season_id, status, id);

create table app.fantasy_squad_memberships (
  id uuid primary key default gen_random_uuid(),
  fantasy_team_id uuid not null references app.fantasy_teams(id) on delete restrict,
  fantasy_player_id uuid not null references app.fantasy_players(id) on delete restrict,
  purchase_price numeric(8,2) not null,
  current_sale_price numeric(8,2) not null,
  acquired_gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete restrict,
  sold_gameweek_id uuid references app.fantasy_gameweeks(id) on delete restrict,
  acquired_at timestamptz not null default statement_timestamp(),
  sold_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_squad_memberships_purchase_check check (purchase_price > 0),
  constraint fantasy_squad_memberships_sale_check check (current_sale_price > 0),
  constraint fantasy_squad_memberships_lifecycle_check check (
    (sold_gameweek_id is null and sold_at is null)
    or (sold_gameweek_id is not null and sold_at is not null and sold_at >= acquired_at)
  )
);
create unique index fantasy_squad_memberships_active_player_idx
  on app.fantasy_squad_memberships (fantasy_team_id, fantasy_player_id)
  where sold_at is null;
create index fantasy_squad_memberships_active_team_idx
  on app.fantasy_squad_memberships (fantasy_team_id, id) where sold_at is null;

create table app.fantasy_lineups (
  id uuid primary key default gen_random_uuid(),
  fantasy_team_id uuid not null references app.fantasy_teams(id) on delete restrict,
  gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete restrict,
  team_version bigint not null,
  locked_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_lineups_team_gameweek_key unique (fantasy_team_id, gameweek_id),
  constraint fantasy_lineups_version_check check (team_version > 0),
  constraint fantasy_lineups_finalized_check check (
    finalized_at is null or (locked_at is not null and finalized_at >= locked_at)
  )
);
create index fantasy_lineups_gameweek_team_idx on app.fantasy_lineups (gameweek_id, fantasy_team_id);

create table app.fantasy_lineup_players (
  lineup_id uuid not null references app.fantasy_lineups(id) on delete restrict,
  fantasy_player_id uuid not null references app.fantasy_players(id) on delete restrict,
  slot app.fantasy_lineup_slot not null,
  slot_order integer not null,
  captain boolean not null default false,
  vice_captain boolean not null default false,
  multiplier numeric(4,2) not null default 1,
  snapshot_price numeric(8,2) not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_lineup_players_pkey primary key (lineup_id, fantasy_player_id),
  constraint fantasy_lineup_players_slot_key unique (lineup_id, slot, slot_order),
  constraint fantasy_lineup_players_order_check check (
    (slot = 'starter' and slot_order between 1 and 11)
    or (slot = 'bench' and slot_order between 1 and 4)
  ),
  constraint fantasy_lineup_players_captain_check check (not (captain and vice_captain)),
  constraint fantasy_lineup_players_multiplier_check check (multiplier between 0 and 5),
  constraint fantasy_lineup_players_price_check check (snapshot_price > 0)
);
create unique index fantasy_lineup_players_one_captain_idx
  on app.fantasy_lineup_players (lineup_id) where captain;
create unique index fantasy_lineup_players_one_vice_captain_idx
  on app.fantasy_lineup_players (lineup_id) where vice_captain;

create table app.fantasy_transfer_batches (
  id uuid primary key default gen_random_uuid(),
  fantasy_team_id uuid not null references app.fantasy_teams(id) on delete restrict,
  gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete restrict,
  idempotency_key uuid not null,
  base_team_version bigint not null,
  resulting_team_version bigint not null,
  transfers_count integer not null,
  free_transfers_before integer not null,
  free_transfers_used integer not null,
  point_hit integer not null,
  bank_before numeric(10,2) not null,
  bank_after numeric(10,2) not null,
  chip_type app.fantasy_chip_type,
  status app.fantasy_transfer_batch_status not null default 'confirmed',
  confirmed_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  constraint fantasy_transfer_batches_idempotency_key unique (fantasy_team_id, idempotency_key),
  constraint fantasy_transfer_batches_versions_check check (
    base_team_version > 0 and resulting_team_version > base_team_version
  ),
  constraint fantasy_transfer_batches_counts_check check (
    transfers_count > 0 and free_transfers_before >= 0
    and free_transfers_used between 0 and transfers_count and point_hit >= 0
  ),
  constraint fantasy_transfer_batches_bank_check check (bank_before >= 0 and bank_after >= 0)
);
create index fantasy_transfer_batches_history_idx
  on app.fantasy_transfer_batches (fantasy_team_id, confirmed_at desc, id desc);

create table app.fantasy_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_batch_id uuid not null references app.fantasy_transfer_batches(id) on delete restrict,
  sequence_number integer not null,
  player_out_id uuid not null references app.fantasy_players(id) on delete restrict,
  player_in_id uuid not null references app.fantasy_players(id) on delete restrict,
  sale_price numeric(8,2) not null,
  purchase_price numeric(8,2) not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint fantasy_transfers_batch_sequence_key unique (transfer_batch_id, sequence_number),
  constraint fantasy_transfers_out_key unique (transfer_batch_id, player_out_id),
  constraint fantasy_transfers_in_key unique (transfer_batch_id, player_in_id),
  constraint fantasy_transfers_players_differ_check check (player_out_id <> player_in_id),
  constraint fantasy_transfers_price_check check (sale_price > 0 and purchase_price > 0),
  constraint fantasy_transfers_sequence_check check (sequence_number between 1 and 100)
);

create table app.fantasy_chip_uses (
  id uuid primary key default gen_random_uuid(),
  fantasy_team_id uuid not null references app.fantasy_teams(id) on delete restrict,
  gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete restrict,
  chip_type app.fantasy_chip_type not null,
  activation_idempotency_key uuid not null,
  activated_at timestamptz not null default statement_timestamp(),
  cancelled_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_chip_uses_activation_key unique (fantasy_team_id, activation_idempotency_key),
  constraint fantasy_chip_uses_once_key unique (fantasy_team_id, chip_type),
  constraint fantasy_chip_uses_gameweek_key unique (fantasy_team_id, gameweek_id),
  constraint fantasy_chip_uses_lifecycle_check check (
    not (cancelled_at is not null and finalized_at is not null)
    and (cancelled_at is null or cancelled_at >= activated_at)
    and (finalized_at is null or finalized_at >= activated_at)
  )
);
create index fantasy_chip_uses_gameweek_idx on app.fantasy_chip_uses (gameweek_id, chip_type, id);

create table app.fantasy_free_hit_snapshots (
  id uuid primary key default gen_random_uuid(),
  chip_use_id uuid not null references app.fantasy_chip_uses(id) on delete restrict,
  fantasy_team_id uuid not null references app.fantasy_teams(id) on delete restrict,
  gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete restrict,
  bank numeric(10,2) not null,
  team_value numeric(10,2) not null,
  free_transfers integer not null,
  team_version bigint not null,
  restored_at timestamptz,
  restoration_version bigint,
  created_at timestamptz not null default statement_timestamp(),
  constraint fantasy_free_hit_snapshots_chip_key unique (chip_use_id),
  constraint fantasy_free_hit_snapshots_team_gameweek_key unique (fantasy_team_id, gameweek_id),
  constraint fantasy_free_hit_snapshots_values_check check (
    bank >= 0 and team_value > 0 and free_transfers >= 0 and team_version > 0
  ),
  constraint fantasy_free_hit_snapshots_restore_check check (
    (restored_at is null and restoration_version is null)
    or (restored_at is not null and restoration_version is not null and restoration_version > team_version)
  )
);

create table app.fantasy_free_hit_snapshot_players (
  snapshot_id uuid not null references app.fantasy_free_hit_snapshots(id) on delete restrict,
  fantasy_player_id uuid not null references app.fantasy_players(id) on delete restrict,
  purchase_price numeric(8,2) not null,
  sale_price numeric(8,2) not null,
  acquired_gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  constraint fantasy_free_hit_snapshot_players_pkey primary key (snapshot_id, fantasy_player_id),
  constraint fantasy_free_hit_snapshot_players_price_check check (purchase_price > 0 and sale_price > 0)
);

create table app_private.fantasy_idempotency_keys (
  user_id uuid not null references app.profiles(id) on delete restrict,
  operation text not null,
  idempotency_key uuid not null,
  request_hash text not null,
  response_body jsonb,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  constraint fantasy_idempotency_keys_pkey primary key (user_id, operation, idempotency_key),
  constraint fantasy_idempotency_keys_operation_check check (operation ~ '^[a-z][a-z0-9_]{2,79}$'),
  constraint fantasy_idempotency_keys_hash_check check (request_hash ~ '^[a-f0-9]{64}$'),
  constraint fantasy_idempotency_keys_response_check check (
    response_body is null or (jsonb_typeof(response_body) = 'object' and pg_column_size(response_body) <= 131072)
  ),
  constraint fantasy_idempotency_keys_expiry_check check (expires_at > created_at)
);
create index fantasy_idempotency_keys_expiry_idx on app_private.fantasy_idempotency_keys (expires_at);

create table app_private.fantasy_mutation_audit (
  id bigint generated always as identity primary key,
  user_id uuid references app.profiles(id) on delete restrict,
  fantasy_team_id uuid references app.fantasy_teams(id) on delete restrict,
  operation text not null,
  accepted boolean not null,
  stable_error_code text,
  base_version bigint,
  resulting_version bigint,
  idempotency_key uuid,
  safe_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default statement_timestamp(),
  constraint fantasy_mutation_audit_operation_check check (operation ~ '^[a-z][a-z0-9_]{2,79}$'),
  constraint fantasy_mutation_audit_error_check check (
    (accepted and stable_error_code is null) or (not accepted and stable_error_code is not null)
  ),
  constraint fantasy_mutation_audit_version_check check (
    base_version is null or base_version > 0
  ),
  constraint fantasy_mutation_audit_result_version_check check (
    resulting_version is null or resulting_version > 0
  ),
  constraint fantasy_mutation_audit_metadata_check check (
    jsonb_typeof(safe_metadata) = 'object' and pg_column_size(safe_metadata) <= 16384
  )
);
comment on table app_private.fantasy_mutation_audit is
  'Append-only Fantasy security/operations audit. Retain 365 days; excludes secrets and raw tokens.';
create index fantasy_mutation_audit_team_time_idx
  on app_private.fantasy_mutation_audit (fantasy_team_id, occurred_at desc, id desc);

create trigger fantasy_teams_set_updated_at before update on app.fantasy_teams
for each row execute function app_private.set_updated_at();
create trigger fantasy_squad_memberships_set_updated_at before update on app.fantasy_squad_memberships
for each row execute function app_private.set_updated_at();
create trigger fantasy_lineups_set_updated_at before update on app.fantasy_lineups
for each row execute function app_private.set_updated_at();
create trigger fantasy_lineup_players_set_updated_at before update on app.fantasy_lineup_players
for each row execute function app_private.set_updated_at();
create trigger fantasy_chip_uses_set_updated_at before update on app.fantasy_chip_uses
for each row execute function app_private.set_updated_at();

alter table app.fantasy_teams enable row level security;
alter table app.fantasy_teams force row level security;
alter table app.fantasy_squad_memberships enable row level security;
alter table app.fantasy_squad_memberships force row level security;
alter table app.fantasy_lineups enable row level security;
alter table app.fantasy_lineups force row level security;
alter table app.fantasy_lineup_players enable row level security;
alter table app.fantasy_lineup_players force row level security;
alter table app.fantasy_transfer_batches enable row level security;
alter table app.fantasy_transfer_batches force row level security;
alter table app.fantasy_transfers enable row level security;
alter table app.fantasy_transfers force row level security;
alter table app.fantasy_chip_uses enable row level security;
alter table app.fantasy_chip_uses force row level security;
alter table app.fantasy_free_hit_snapshots enable row level security;
alter table app.fantasy_free_hit_snapshots force row level security;
alter table app.fantasy_free_hit_snapshot_players enable row level security;
alter table app.fantasy_free_hit_snapshot_players force row level security;
alter table app_private.fantasy_idempotency_keys enable row level security;
alter table app_private.fantasy_idempotency_keys force row level security;
alter table app_private.fantasy_mutation_audit enable row level security;
alter table app_private.fantasy_mutation_audit force row level security;

revoke all on table app.fantasy_teams, app.fantasy_squad_memberships,
  app.fantasy_lineups, app.fantasy_lineup_players, app.fantasy_transfer_batches,
  app.fantasy_transfers, app.fantasy_chip_uses, app.fantasy_free_hit_snapshots,
  app.fantasy_free_hit_snapshot_players from anon, authenticated;
revoke all on table app_private.fantasy_idempotency_keys,
  app_private.fantasy_mutation_audit from anon, authenticated;
