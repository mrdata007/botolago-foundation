-- BotolaGO Production V2
-- News club filters: stop at each club's first public story.
--
-- api.news_team_filters(lang) lists the clubs that have at least one public
-- story in that language. The News page and every article page ask for it
-- (src/routes/news.tsx, news.$articleId.tsx), for every visitor.
--
-- It was the most expensive read of the match-day browsing workload:
-- measured locally on 2026-09-26 with 16 clubs and 2,000 stories per
-- language (scripts/backend/browsing-staging-seed.sql), 657 ms a call and
-- 45% of all database time the browsing visitors caused (pg_stat_statements).
-- The planner answered the EXISTS with a hash semi-join:
--
--   Hash Join  (team.id = relation.team_id)
--     -> HashAggregate
--        -> Hash Join (relation.story_id = edition.story_id)   rows=2583
--           -> Bitmap Heap Scan on article_editions edition    rows=2000
--                Filter: app_private.news_is_public(edition.*)
--
-- so app_private.news_is_public, which cannot be inlined (SECURITY DEFINER
-- helpers underneath), ran for every edition in the language, and the cost
-- grew with the whole archive rather than with the number of clubs.
--
-- Here each club looks at its own stories through story_teams_team_story_idx
-- and stops at the first public one (`limit 1` in a lateral subquery, which
-- the planner runs as a nested loop per club). The answer is the same:
-- "at least one public story in the language". News_is_public stays the one
-- definition of public and is still what decides. Same data, same machine:
-- 5.6-17 ms instead of 638-657 ms. A club with no public story still reads
-- all of its own stories, as before; that is bounded by that club's stories,
-- not by the archive.
--
-- Signature, security, grants and the output (fields and order) are
-- unchanged; `create or replace` keeps the existing grants.

create or replace function api.news_team_filters(p_language text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_language app.language_code := app_private.news_language(p_language);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', team.id,
      'slug', team.slug,
      'name', team.name,
      'shortName', team.short_name,
      'city', team.city,
      'code', team.code,
      'primaryColor', team.primary_color,
      'secondaryColor', team.secondary_color
    ) order by team.name, team.id)
    from app.teams team
    cross join lateral (
      select 1
      from app.story_teams relation
      join app.article_editions edition on edition.story_id = relation.story_id
      where relation.team_id = team.id
        and edition.language = selected_language
        and app_private.news_is_public(edition)
      limit 1
    ) first_public
    where team.active
  ), '[]'::jsonb);
end;
$$;
