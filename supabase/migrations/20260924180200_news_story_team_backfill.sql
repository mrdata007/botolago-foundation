-- BotolaGO Production V2
-- News: tag every existing story with the clubs its headline names.
--
-- 20260924180000_news_story_team_tagging built the tagger; from then on,
-- every edition added, removed or retitled tags its story. This tags the
-- stories that were already there, once.
--
-- It is a migration of its own so that it runs in a transaction of its own.
-- The tagging migration adds a column to app.story_teams, which locks the
-- table against every reader until that transaction ends, and every news
-- card reads the table. Kept apart, that lock lasts about a second; the
-- backfill below then writes rows without blocking any reader.
--
-- In production: 14,302 stories, of which a read-only preview of the same
-- matching tags 11,092 with 16,097 club links, all 23 existing rows kept.
-- Locally, on 15,769 stories and from statistics as stale as production's,
-- it took 16 s; production's CPU measured 1.6x slower. A database with no
-- club alias (a fresh local or CI one) tags nothing.
--
-- Re-running it is harmless: the function only adds what is missing and
-- removes what no headline names any more.

do $backfill$
declare
  result record;
begin
  select * into result from app_private.news_retag_all_story_teams();
  raise notice 'news_story_team_backfill: % stories read, % tagged from headlines, % club links',
    result.stories, result.tagged_stories, result.headline_rows;
end;
$backfill$;
