-- BotolaGO Production V2
-- News: tag every existing story again, under the rule of
-- 20260924190000_news_story_team_translation_check.
--
-- That migration changed who decides a story's clubs (the original-language
-- headline, with translations confirmed by the original article) and added
-- four Arabic spellings. New and edited stories follow it at once; this
-- applies it to the stories already there, once.
--
-- A migration of its own for the same reason as
-- 20260924180200_news_story_team_backfill: the rule change holds a lock that
-- makes writers of app.article_editions wait until its transaction ends, so
-- it does no bulk work. This one only adds and removes story_teams rows and
-- refreshes the search documents of the stories whose clubs change; readers
-- are never blocked.
--
-- In production it removes the clubs only a mistranslated headline named
-- (the 11 judged wrong, and one FUS Rabat tag whose original says only
-- "الفتح") and adds the clubs the new spellings find. Editor-tagged stories
-- are untouched. Re-running it changes nothing.

do $retag$
declare
  result record;
begin
  select * into result from app_private.news_retag_all_story_teams();
  raise notice 'news_story_team_retag: % stories read, % tagged from headlines, % club links',
    result.stories, result.tagged_stories, result.headline_rows;
end;
$retag$;
