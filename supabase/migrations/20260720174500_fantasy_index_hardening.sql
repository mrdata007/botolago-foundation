-- Cover Fantasy foreign keys used by referential checks, correction paths,
-- history queries, and bounded workers. These indexes are deliberately
-- additive and do not change domain behavior.

create index fantasy_auto_substitutions_player_in_idx
  on app.fantasy_auto_substitutions (player_in_id);
create index fantasy_auto_substitutions_player_out_idx
  on app.fantasy_auto_substitutions (player_out_id);
create index fantasy_free_hit_snapshot_players_acquired_gameweek_idx
  on app.fantasy_free_hit_snapshot_players (acquired_gameweek_id);
create index fantasy_free_hit_snapshot_players_player_idx
  on app.fantasy_free_hit_snapshot_players (fantasy_player_id);
create index fantasy_free_hit_snapshots_gameweek_idx
  on app.fantasy_free_hit_snapshots (gameweek_id);
create index fantasy_gameweeks_football_round_idx
  on app.fantasy_gameweeks (football_round_id) where football_round_id is not null;
create index fantasy_league_memberships_team_idx
  on app.fantasy_league_memberships (fantasy_team_id);
create index fantasy_leagues_owner_idx
  on app.fantasy_leagues (owner_user_id, active);
create index fantasy_lineup_players_player_idx
  on app.fantasy_lineup_players (fantasy_player_id);
create index fantasy_player_point_events_football_event_idx
  on app.fantasy_player_point_events (football_event_id) where football_event_id is not null;
create index fantasy_player_price_history_gameweek_idx
  on app.fantasy_player_price_history (gameweek_id) where gameweek_id is not null;
create index fantasy_players_football_player_idx
  on app.fantasy_players (football_player_id);
create index fantasy_players_football_team_idx
  on app.fantasy_players (football_team_id);
create index fantasy_players_position_idx
  on app.fantasy_players (position_id);
create index fantasy_position_rules_position_idx
  on app.fantasy_position_rules (position_id);
create index fantasy_rankings_team_idx
  on app.fantasy_rankings (fantasy_team_id);
create index fantasy_rankings_gameweek_idx
  on app.fantasy_rankings (gameweek_id) where gameweek_id is not null;
create index fantasy_rankings_league_idx
  on app.fantasy_rankings (league_id) where league_id is not null;
create index fantasy_scoring_rules_position_idx
  on app.fantasy_scoring_rules (position_id) where position_id is not null;
create index fantasy_seasons_ruleset_idx
  on app.fantasy_seasons (ruleset_id);
create index fantasy_squad_memberships_acquired_gameweek_idx
  on app.fantasy_squad_memberships (acquired_gameweek_id);
create index fantasy_squad_memberships_player_idx
  on app.fantasy_squad_memberships (fantasy_player_id);
create index fantasy_squad_memberships_sold_gameweek_idx
  on app.fantasy_squad_memberships (sold_gameweek_id) where sold_gameweek_id is not null;
create index fantasy_teams_current_gameweek_idx
  on app.fantasy_teams (current_gameweek_id) where current_gameweek_id is not null;
create index fantasy_transfer_batches_gameweek_idx
  on app.fantasy_transfer_batches (gameweek_id);
create index fantasy_transfers_player_in_idx
  on app.fantasy_transfers (player_in_id);
create index fantasy_transfers_player_out_idx
  on app.fantasy_transfers (player_out_id);
create index fantasy_corrections_gameweek_idx
  on app_private.fantasy_corrections (gameweek_id, created_at desc);
create index fantasy_corrections_requested_by_idx
  on app_private.fantasy_corrections (requested_by) where requested_by is not null;
create index fantasy_job_runs_season_idx
  on app_private.fantasy_job_runs (fantasy_season_id) where fantasy_season_id is not null;
create index fantasy_job_runs_gameweek_idx
  on app_private.fantasy_job_runs (gameweek_id) where gameweek_id is not null;
create index fantasy_mutation_audit_user_idx
  on app_private.fantasy_mutation_audit (user_id, occurred_at desc);
