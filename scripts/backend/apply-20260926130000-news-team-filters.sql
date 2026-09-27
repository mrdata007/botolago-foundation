-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20260926130000_news_team_filters_first_public: the News club filters
-- (api.news_team_filters) stop at each club's first public story instead of
-- checking every story in the language. Same answer; about 650 ms a call
-- becomes about 10 ms (docs/backend/SCALE_AND_COST_REPORT.md, section 3).
--
-- WHEN
--   Any time after the pull request that adds this file is merged. It
--   replaces one read-only function; nothing needs pausing. It holds News
--   writes for its second or two so the before and after answers can be
--   compared (reading News is not held, and the site keeps serving). If a
--   News write is already under way, it stops within 5 seconds and saves
--   nothing: run it again a minute later.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Make sure no other database work is running right now.
--   2. Paste this WHOLE file and press Run. As shipped it is a REHEARSAL:
--      everything is applied inside one transaction, checked, and then
--      ROLLED BACK. The result row should say "Rehearsal passed".
--   3. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied".
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass.
--
-- WHAT IT DOES
--   * refuses to run twice, or where api.news_team_filters is not the version
--     production held on 2026-09-26 (read there: md5 of its definition), or
--     where app_private.news_is_public changed since;
--   * holds News writes until it ends and keeps the current answers for
--     French and Arabic;
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result: the new stop-early version is in place, visitors
--     can still call it, both answers are byte for byte the old ones, and
--     each call takes well under 200 ms.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20260926130000') then
    raise exception 'stop: migration 20260926130000 is already recorded as applied';
  end if;
  if to_regprocedure('api.news_team_filters(text)') is null then
    raise exception 'stop: api.news_team_filters(text) does not exist';
  end if;
  if md5(pg_get_functiondef('api.news_team_filters(text)'::regprocedure))
    <> '14622460d141cd263cbdb6a11892f0d9' then
    raise exception 'stop: api.news_team_filters is not the version this update replaces (production, 2026-09-26)';
  end if;
  if md5(pg_get_functiondef('app_private.news_is_public(app.article_editions)'::regprocedure))
    <> 'd8f9fe167f75fb1a8fb9c68794c0312b' then
    raise exception 'stop: the News eligibility rule changed since this update was written';
  end if;
end
$preflight$;

-- No News write until this transaction ends, so the answers cannot change
-- between the two readings (AGENTS.md, one writer at a time).
lock table app.article_editions, app.stories, app.story_teams, app.teams, app.publishers
  in share mode;

select set_config('botolago.team_filters_fr', md5(api.news_team_filters('fr')::text), true);
select set_config('botolago.team_filters_ar', md5(api.news_team_filters('ar')::text), true);

-- ---------------------------------------------------------------------------
-- Migration 20260926130000, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260926130000',
  'news_team_filters_first_public',
  array[$bg_20260926130000_file$-- BotolaGO Production V2
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
$bg_20260926130000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20260926130000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20260926130000'
  );
begin
  if encode(sha256(convert_to(part_20260926130000, 'UTF8')), 'hex')
    is distinct from '1ea508803aa900f7b8b79b3fca14c1fe465cb81756cc4270e2c526df45d1ed10' then
    raise exception 'stop: 20260926130000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20260926130000;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  signature constant regprocedure := 'api.news_team_filters(text)'::regprocedure;
  definition text := pg_get_functiondef(signature);
  started timestamptz;
  took_ms numeric;
  answer text;
  language_code text;
begin
  if definition not like '%cross join lateral%' or definition not like '%limit 1%' then
    problems := problems || 'the club filters are not the new stop-early version'::text;
  end if;
  if not has_function_privilege('anon', signature, 'execute')
    or not has_function_privilege('authenticated', signature, 'execute') then
    problems := problems || 'visitors can no longer call the club filters'::text;
  end if;
  foreach language_code in array array['fr', 'ar'] loop
    started := clock_timestamp();
    answer := api.news_team_filters(language_code)::text;
    took_ms := round(extract(epoch from clock_timestamp() - started) * 1000);
    if took_ms >= 200 then
      problems := problems || (language_code || ' took ' || took_ms || ' ms; expected well under 200');
    end if;
    if md5(answer) is distinct from current_setting('botolago.team_filters_' || language_code, true) then
      problems := problems || ('the ' || language_code || ' answer differs from the old one');
    end if;
    raise notice 'club filters %: % clubs in % ms, same answer as before',
      language_code, jsonb_array_length(answer::jsonb), took_ms;
  end loop;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260926130000') then
    problems := problems || 'history row missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20260926130000')
    then 'Applied. The News club filters stop at each club''s first public story.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
