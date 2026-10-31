-- BotolaGO Production V2
-- Fix: while a journée is held, the season and league standings show the
-- re-scored totals fans see everywhere else.
--
-- What went wrong (found on production 30 Oct 2026, right after
-- 20261030100000). app_private.fantasy_refresh_shown_rankings added up the
-- raw rows of app.fantasy_team_gameweek_results. Journées 1 to 3 were later
-- re-scored from player ratings (the rating publications of 20261018215311),
-- and fans see those re-scored points through app_private.
-- fantasy_visible_team_results, which is also what the ranking writer
-- (api.service_recalculate_fantasy_rankings) sums. So while Journée 6 was held
-- the "Général" table showed, for example, 153 for ak47 FC instead of 240.
--
-- The change. The shown total sums app_private.fantasy_visible_team_results,
-- the same rows as the ranking writer; the held journée stays left out (the
-- existing "not in fantasy_unpublished_gameweeks" condition is kept). Nothing
-- else in the function changes. The stored figures are then rebuilt.

do $shown_fix$
declare
  source text;
  old_from constant text := 'from app.fantasy_team_gameweek_results t
    where t.fantasy_team_id in (select b.fantasy_team_id from board b)';
  new_from constant text := 'from app_private.fantasy_visible_team_results t
    where t.fantasy_team_id in (select b.fantasy_team_id from board b)';
begin
  if md5((select prosrc from pg_proc
    where oid = 'app_private.fantasy_refresh_shown_rankings(boolean,uuid[],uuid[])'::regprocedure))
    is distinct from '8510877be1ae113f93ad91ab6db88d9f' then
    raise exception 'shown_rankings_fix_unexpected_previous_body';
  end if;
  source := pg_get_functiondef('app_private.fantasy_refresh_shown_rankings(boolean,uuid[],uuid[])'::regprocedure);
  if (length(source) - length(replace(source, old_from, ''))) <> length(old_from) then
    raise exception 'shown_rankings_fix_anchor_not_unique';
  end if;
  execute replace(source, old_from, new_from);
end
$shown_fix$;

select app_private.fantasy_refresh_shown_rankings();
