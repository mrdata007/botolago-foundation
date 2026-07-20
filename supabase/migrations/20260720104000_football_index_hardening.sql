-- Phase 3: cover Football-domain foreign keys used by delete validation,
-- relationship resolution, future administration, and provider operations.
-- These indexes are additive and intentionally separate from the entity migrations
-- so hosted advisor findings can be validated independently.

create index if not exists competitions_country_idx
  on app.competitions (country_id);
create index if not exists competitions_logo_asset_idx
  on app.competitions (logo_asset_id) where logo_asset_id is not null;
create index if not exists venues_country_idx
  on app.venues (country_id);
create index if not exists venues_media_asset_idx
  on app.venues (media_asset_id) where media_asset_id is not null;
create index if not exists teams_venue_idx
  on app.teams (venue_id) where venue_id is not null;
create index if not exists teams_crest_asset_idx
  on app.teams (crest_asset_id) where crest_asset_id is not null;
create index if not exists players_photo_asset_idx
  on app.players (photo_asset_id) where photo_asset_id is not null;
create index if not exists team_memberships_season_idx
  on app.team_memberships (season_id, team_id, player_id);

create index if not exists fixtures_round_idx
  on app.fixtures (round_id, kickoff_at, id) where round_id is not null;
create index if not exists fixtures_venue_idx
  on app.fixtures (venue_id, kickoff_at, id) where venue_id is not null;
create index if not exists fixtures_winner_team_idx
  on app.fixtures (winner_team_id, kickoff_at, id) where winner_team_id is not null;
create index if not exists lineups_team_idx
  on app.lineups (team_id, fixture_id);
create index if not exists match_events_team_idx
  on app.match_events (team_id, fixture_id, sequence_number) where team_id is not null;
create index if not exists match_events_related_player_idx
  on app.match_events (related_player_id, fixture_id) where related_player_id is not null;
create index if not exists fixture_team_statistics_team_idx
  on app.fixture_team_statistics (team_id, fixture_id, statistic_definition_id);
create index if not exists fixture_team_statistics_definition_idx
  on app.fixture_team_statistics (statistic_definition_id, fixture_id, team_id);
create index if not exists standings_competition_idx
  on app.standings (competition_id, season_id, table_type, rank, id);

create index if not exists football_provider_mappings_corrected_by_idx
  on app_private.football_provider_mappings (corrected_by)
  where corrected_by is not null;

create index if not exists user_preferences_favorite_team_idx
  on app.user_preferences (favorite_team_id) where favorite_team_id is not null;
create index if not exists followed_teams_target_idx
  on app.followed_teams (team_id, user_id);
create index if not exists followed_competitions_target_idx
  on app.followed_competitions (competition_id, user_id);
