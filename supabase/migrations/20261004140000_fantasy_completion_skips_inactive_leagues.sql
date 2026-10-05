-- BotolaGO Production V2
-- Completing a gameweek no longer waits for rankings of switched-off leagues.
--
-- WHY. The worker ranks the leagues that api.service_fantasy_scoring_league_page
-- lists, and that page lists active leagues only (20260925090500). The
-- completion check (20260914200730) required league rankings for every active
-- membership, whatever the league's state. A team still listed as a member of
-- a switched-off league therefore blocked completion forever
-- (fantasy_rankings_incomplete). Production GW1, 2026-10-04: one team is a
-- member of an inactive end-to-end test league from 2026-09-23.
--
-- WHAT CHANGES. The league part of the check now joins the league and keeps
-- active ones only, the same set the worker ranks. Every other check, and the
-- overall rankings every team needs, are unchanged. The function is patched in
-- place: its exact text is replaced once, and the migration stops if that text
-- is not found exactly once.

do $complete$
declare
  definition text := pg_get_functiondef(
    'api.service_complete_fantasy_gameweek(uuid,bigint)'::regprocedure);
  old_text constant text := '    join app.fantasy_league_memberships membership
      on membership.fantasy_team_id = team.id and membership.status = ''active''
';
  new_text constant text := '    join app.fantasy_league_memberships membership
      on membership.fantasy_team_id = team.id and membership.status = ''active''
    join app.fantasy_leagues league on league.id = membership.league_id and league.active
';
begin
  if (length(definition) - length(replace(definition, old_text, ''))) / length(old_text) <> 1 then
    raise exception 'inactive leagues: service_complete_fantasy_gameweek is not the 20260914200730 version';
  end if;
  execute replace(definition, old_text, new_text);
end
$complete$;
