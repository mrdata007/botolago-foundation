-- 20261030210000: while a journée is held, the shown season and league totals
-- sum the same re-scored rows fans see (app_private.fantasy_visible_team_results,
-- which the ranking writer also sums), not the raw results table.
begin;
select extensions.plan(3);

select extensions.ok(
  position('app_private.fantasy_visible_team_results t' in (select prosrc from pg_proc
    where oid = 'app_private.fantasy_refresh_shown_rankings(boolean,uuid[],uuid[])'::regprocedure)) > 0,
  'the shown totals sum the visible (re-scored) results');
select extensions.ok(
  position('from app.fantasy_team_gameweek_results t' in (select prosrc from pg_proc
    where oid = 'app_private.fantasy_refresh_shown_rankings(boolean,uuid[],uuid[])'::regprocedure)) = 0,
  'and no longer the raw results table');
select extensions.ok(
  position('fantasy_unpublished_gameweeks' in (select prosrc from pg_proc
    where oid = 'app_private.fantasy_refresh_shown_rankings(boolean,uuid[],uuid[])'::regprocedure)) > 0,
  'the held journée is still left out');

select * from extensions.finish();
rollback;
