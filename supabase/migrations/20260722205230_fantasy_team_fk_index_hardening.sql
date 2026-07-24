-- Cover the full fantasy_squad_memberships -> fantasy_teams foreign-key path.
-- Existing team-leading indexes are partial (sold_at is null) and therefore
-- cannot support parent deletion checks for historical/sold memberships.
create index if not exists fantasy_squad_memberships_team_fk_idx
  on app.fantasy_squad_memberships (fantasy_team_id);
