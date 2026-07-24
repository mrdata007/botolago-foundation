-- BotolaGO V2 — Phase 6: explainable scoring, idempotent finalization,
-- authoritative leagues/rankings, and private bounded worker run ledgers.

create table app.fantasy_player_point_events (
  id uuid primary key default gen_random_uuid(),
  fantasy_player_id uuid not null references app.fantasy_players(id) on delete restrict,
  gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete restrict,
  fixture_id uuid not null references app.fixtures(id) on delete restrict,
  football_event_id uuid references app.match_events(id) on delete restrict,
  category text not null,
  points integer not null,
  state app.fantasy_points_state not null default 'provisional',
  scoring_version integer not null,
  source_sequence bigint not null,
  source_key text not null,
  superseded_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_player_point_events_source_key unique (
    fantasy_player_id, fixture_id, source_key, scoring_version
  ),
  constraint fantasy_player_point_events_category_check check (category ~ '^[a-z][a-z0-9_]{2,79}$'),
  constraint fantasy_player_point_events_points_check check (points between -100 and 100),
  constraint fantasy_player_point_events_scoring_version_check check (scoring_version > 0),
  constraint fantasy_player_point_events_source_sequence_check check (source_sequence >= 0),
  constraint fantasy_player_point_events_source_key_check check (
    char_length(source_key) between 8 and 200 and source_key = btrim(source_key)
  )
);
create index fantasy_player_point_events_gameweek_player_idx
  on app.fantasy_player_point_events (gameweek_id, fantasy_player_id, state, id)
  where superseded_at is null;
create index fantasy_player_point_events_fixture_idx
  on app.fantasy_player_point_events (fixture_id, source_sequence, id);

create table app.fantasy_player_gameweek_points (
  fantasy_player_id uuid not null references app.fantasy_players(id) on delete restrict,
  gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete restrict,
  provisional_points integer not null default 0,
  final_points integer,
  minutes_played integer not null default 0,
  did_play boolean not null default false,
  calculation_version bigint not null,
  football_input_version bigint not null,
  finalized_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_player_gameweek_points_pkey primary key (fantasy_player_id, gameweek_id),
  constraint fantasy_player_gameweek_points_minutes_check check (minutes_played between 0 and 180),
  constraint fantasy_player_gameweek_points_versions_check check (
    calculation_version > 0 and football_input_version >= 0
  ),
  constraint fantasy_player_gameweek_points_final_check check (
    (finalized_at is null and final_points is null)
    or (finalized_at is not null and final_points is not null)
  )
);
create index fantasy_player_gameweek_points_gameweek_idx
  on app.fantasy_player_gameweek_points (gameweek_id, provisional_points desc, fantasy_player_id);

create table app.fantasy_auto_substitutions (
  id uuid primary key default gen_random_uuid(),
  lineup_id uuid not null references app.fantasy_lineups(id) on delete restrict,
  player_out_id uuid not null references app.fantasy_players(id) on delete restrict,
  player_in_id uuid not null references app.fantasy_players(id) on delete restrict,
  sequence_number integer not null,
  reason text not null,
  calculation_version bigint not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint fantasy_auto_substitutions_lineup_sequence_key unique (lineup_id, sequence_number),
  constraint fantasy_auto_substitutions_out_key unique (lineup_id, player_out_id),
  constraint fantasy_auto_substitutions_in_key unique (lineup_id, player_in_id),
  constraint fantasy_auto_substitutions_players_check check (player_out_id <> player_in_id),
  constraint fantasy_auto_substitutions_sequence_check check (sequence_number between 1 and 4),
  constraint fantasy_auto_substitutions_reason_check check (reason ~ '^[a-z][a-z0-9_]{2,79}$'),
  constraint fantasy_auto_substitutions_version_check check (calculation_version > 0)
);

create table app.fantasy_team_gameweek_results (
  id uuid primary key default gen_random_uuid(),
  fantasy_team_id uuid not null references app.fantasy_teams(id) on delete restrict,
  gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete restrict,
  starting_points integer not null,
  bench_points integer not null,
  captain_points integer not null,
  transfer_hit integer not null,
  chip_type app.fantasy_chip_type,
  provisional_score integer not null,
  final_score integer,
  state app.fantasy_points_state not null default 'provisional',
  rank bigint,
  overall_rank bigint,
  calculation_version bigint not null,
  finalized_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_team_gameweek_results_team_key unique (fantasy_team_id, gameweek_id),
  constraint fantasy_team_gameweek_results_transfer_hit_check check (transfer_hit >= 0),
  constraint fantasy_team_gameweek_results_rank_check check (
    (rank is null or rank > 0) and (overall_rank is null or overall_rank > 0)
  ),
  constraint fantasy_team_gameweek_results_version_check check (calculation_version > 0),
  constraint fantasy_team_gameweek_results_final_check check (
    (state = 'provisional' and final_score is null and finalized_at is null)
    or (state = 'final' and final_score is not null and finalized_at is not null)
  )
);
create index fantasy_team_gameweek_results_history_idx
  on app.fantasy_team_gameweek_results (fantasy_team_id, gameweek_id, id);
create index fantasy_team_gameweek_results_rank_idx
  on app.fantasy_team_gameweek_results (gameweek_id, final_score desc, transfer_hit, fantasy_team_id)
  where state = 'final';

create table app.fantasy_leagues (
  id uuid primary key default gen_random_uuid(),
  fantasy_season_id uuid not null references app.fantasy_seasons(id) on delete restrict,
  owner_user_id uuid not null references app.profiles(id) on delete restrict,
  name text not null,
  visibility app.fantasy_league_visibility not null,
  invite_code_digest text,
  invite_code_hint text,
  active boolean not null default true,
  member_count integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_leagues_name_check check (
    name = btrim(name) and char_length(name) between 3 and 80
  ),
  constraint fantasy_leagues_invite_check check (
    (visibility = 'private' and invite_code_digest is not null and invite_code_hint is not null)
    or (visibility = 'public' and invite_code_digest is null and invite_code_hint is null)
  ),
  constraint fantasy_leagues_invite_digest_key unique (invite_code_digest),
  constraint fantasy_leagues_invite_digest_check check (
    invite_code_digest is null or invite_code_digest ~ '^[a-f0-9]{64}$'
  ),
  constraint fantasy_leagues_invite_hint_check check (
    invite_code_hint is null or invite_code_hint ~ '^[A-Z0-9]{4}$'
  ),
  constraint fantasy_leagues_member_count_check check (member_count >= 0)
);
create index fantasy_leagues_public_idx
  on app.fantasy_leagues (fantasy_season_id, member_count desc, id) where visibility = 'public' and active;

create table app.fantasy_league_memberships (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references app.fantasy_leagues(id) on delete restrict,
  fantasy_team_id uuid not null references app.fantasy_teams(id) on delete restrict,
  user_id uuid not null references app.profiles(id) on delete restrict,
  role app.fantasy_league_role not null default 'member',
  status app.fantasy_league_member_status not null default 'active',
  joined_at timestamptz not null default statement_timestamp(),
  left_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_league_memberships_team_key unique (league_id, fantasy_team_id),
  constraint fantasy_league_memberships_user_key unique (league_id, user_id),
  constraint fantasy_league_memberships_status_check check (
    (status = 'active' and left_at is null) or (status <> 'active' and left_at is not null)
  )
);
create index fantasy_league_memberships_user_idx
  on app.fantasy_league_memberships (user_id, status, joined_at desc, id);

create table app.fantasy_rankings (
  id uuid primary key default gen_random_uuid(),
  fantasy_season_id uuid not null references app.fantasy_seasons(id) on delete restrict,
  gameweek_id uuid references app.fantasy_gameweeks(id) on delete restrict,
  league_id uuid references app.fantasy_leagues(id) on delete restrict,
  fantasy_team_id uuid not null references app.fantasy_teams(id) on delete restrict,
  rank bigint not null,
  previous_rank bigint,
  total_points integer not null,
  gameweek_points integer,
  transfer_hits integer not null default 0,
  calculation_version bigint not null,
  calculated_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_rankings_scope_key unique nulls not distinct (
    fantasy_season_id, gameweek_id, league_id, fantasy_team_id
  ),
  constraint fantasy_rankings_scope_check check (
    (league_id is null and gameweek_id is null)
    or (league_id is null and gameweek_id is not null)
    or (league_id is not null)
  ),
  constraint fantasy_rankings_rank_check check (rank > 0 and (previous_rank is null or previous_rank > 0)),
  constraint fantasy_rankings_hits_check check (transfer_hits >= 0),
  constraint fantasy_rankings_version_check check (calculation_version > 0)
);
create index fantasy_rankings_scope_idx
  on app.fantasy_rankings (fantasy_season_id, league_id, gameweek_id, rank, fantasy_team_id);

create table app_private.fantasy_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  fantasy_season_id uuid references app.fantasy_seasons(id) on delete restrict,
  gameweek_id uuid references app.fantasy_gameweeks(id) on delete restrict,
  status app.fantasy_run_status not null default 'pending',
  cursor_id uuid,
  lock_owner uuid,
  lock_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  processed_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  retry_count integer not null default 0,
  stable_error_code text,
  sanitized_error_summary text,
  calculation_version bigint,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_job_runs_job_type_check check (job_type ~ '^[a-z][a-z0-9_]{2,79}$'),
  constraint fantasy_job_runs_counts_check check (
    processed_count >= 0 and skipped_count >= 0 and failed_count >= 0 and retry_count >= 0
  ),
  constraint fantasy_job_runs_lock_check check (
    (lock_owner is null and lock_expires_at is null) or (lock_owner is not null and lock_expires_at is not null)
  ),
  constraint fantasy_job_runs_time_check check (
    completed_at is null or (started_at is not null and completed_at >= started_at)
  ),
  constraint fantasy_job_runs_error_check check (
    stable_error_code is null or stable_error_code ~ '^[a-z][a-z0-9_]{2,79}$'
  ),
  constraint fantasy_job_runs_summary_check check (
    sanitized_error_summary is null or char_length(sanitized_error_summary) <= 500
  )
);
create index fantasy_job_runs_claim_idx
  on app_private.fantasy_job_runs (status, lock_expires_at, created_at, id)
  where status in ('pending', 'running', 'partial');

create table app_private.fantasy_corrections (
  id uuid primary key default gen_random_uuid(),
  gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete restrict,
  requested_by uuid references app.profiles(id) on delete restrict,
  reason text not null,
  previous_calculation_version bigint not null,
  new_calculation_version bigint not null,
  status app.fantasy_run_status not null default 'pending',
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  constraint fantasy_corrections_reason_check check (
    reason = btrim(reason) and char_length(reason) between 8 and 500
  ),
  constraint fantasy_corrections_version_check check (
    previous_calculation_version >= 0 and new_calculation_version > previous_calculation_version
  ),
  constraint fantasy_corrections_metadata_check check (
    jsonb_typeof(safe_metadata) = 'object' and pg_column_size(safe_metadata) <= 16384
  )
);

create trigger fantasy_player_point_events_set_updated_at before update on app.fantasy_player_point_events
for each row execute function app_private.set_updated_at();
create trigger fantasy_player_gameweek_points_set_updated_at before update on app.fantasy_player_gameweek_points
for each row execute function app_private.set_updated_at();
create trigger fantasy_team_gameweek_results_set_updated_at before update on app.fantasy_team_gameweek_results
for each row execute function app_private.set_updated_at();
create trigger fantasy_leagues_set_updated_at before update on app.fantasy_leagues
for each row execute function app_private.set_updated_at();
create trigger fantasy_league_memberships_set_updated_at before update on app.fantasy_league_memberships
for each row execute function app_private.set_updated_at();
create trigger fantasy_rankings_set_updated_at before update on app.fantasy_rankings
for each row execute function app_private.set_updated_at();
create trigger fantasy_job_runs_set_updated_at before update on app_private.fantasy_job_runs
for each row execute function app_private.set_updated_at();

alter table app.fantasy_player_point_events enable row level security;
alter table app.fantasy_player_point_events force row level security;
alter table app.fantasy_player_gameweek_points enable row level security;
alter table app.fantasy_player_gameweek_points force row level security;
alter table app.fantasy_auto_substitutions enable row level security;
alter table app.fantasy_auto_substitutions force row level security;
alter table app.fantasy_team_gameweek_results enable row level security;
alter table app.fantasy_team_gameweek_results force row level security;
alter table app.fantasy_leagues enable row level security;
alter table app.fantasy_leagues force row level security;
alter table app.fantasy_league_memberships enable row level security;
alter table app.fantasy_league_memberships force row level security;
alter table app.fantasy_rankings enable row level security;
alter table app.fantasy_rankings force row level security;
alter table app_private.fantasy_job_runs enable row level security;
alter table app_private.fantasy_job_runs force row level security;
alter table app_private.fantasy_corrections enable row level security;
alter table app_private.fantasy_corrections force row level security;

revoke all on table app.fantasy_player_point_events,
  app.fantasy_player_gameweek_points, app.fantasy_auto_substitutions,
  app.fantasy_team_gameweek_results, app.fantasy_leagues,
  app.fantasy_league_memberships, app.fantasy_rankings from anon, authenticated;
revoke all on table app_private.fantasy_job_runs,
  app_private.fantasy_corrections from anon, authenticated;
