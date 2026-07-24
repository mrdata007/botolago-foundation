-- Keep 10k+ member league pages on ordered, covering keyset access paths.

create index fantasy_rankings_league_overall_page_idx
  on app.fantasy_rankings (league_id, rank, fantasy_team_id)
  include (previous_rank, total_points, gameweek_points, calculated_at)
  where league_id is not null and gameweek_id is null;

create index fantasy_rankings_league_gameweek_page_idx
  on app.fantasy_rankings (league_id, gameweek_id, rank, fantasy_team_id)
  include (previous_rank, total_points, gameweek_points, calculated_at)
  where league_id is not null and gameweek_id is not null;
