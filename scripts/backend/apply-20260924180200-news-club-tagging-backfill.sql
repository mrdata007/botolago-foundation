-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20260924180200_news_story_team_backfill (PR #194): tag the
-- stories that already exist with the clubs their headlines name.
--
-- HOW TO RUN
--   1. Run apply-20260924180000-news-club-tagging.sql first, and commit it.
--   2. Make sure no other database work is running right now.
--   3. Run this WHOLE file. As shipped it is a REHEARSAL: the tagging runs
--      inside one transaction, is checked, and is ROLLED BACK. The result row
--      should say "Rehearsal passed".
--   4. Change the line `rollback;` near the bottom to `commit;` and run it
--      again. The result row should say "Applied" with the counts.
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass.
--
-- WHAT IT DOES
--   * refuses to run twice, or before the tagging migrations are recorded;
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result: every story_teams row there before is still there
--     with the same owner, the counts are in the range the read-only preview
--     measured, and a club's feed answers with stories.
--   It takes no lock that blocks readers: news pages keep working while it
--   runs. The statement timeout allows for the whole backfill (about 30 s
--   expected in production).
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '300s';

-- ---------------------------------------------------------------------------
-- Preflight: refuse to run twice or out of order
-- ---------------------------------------------------------------------------
do $preflight$
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20260924180200') then
    raise exception 'stop: migration 20260924180200 is already recorded as applied';
  end if;
  if (
    select count(*) from supabase_migrations.schema_migrations
    where version in ('20260924180000', '20260924180100')
  ) <> 2 then
    raise exception 'stop: run apply-20260924180000-news-club-tagging.sql (and commit it) first';
  end if;
  if to_regprocedure('app_private.news_retag_all_story_teams()') is null
    or (select count(distinct team_id) from app_private.news_team_aliases) <> 21 then
    raise exception 'stop: the tagger or its 21 clubs are missing';
  end if;
end
$preflight$;

-- What story_teams held before, to check nothing of it is lost.
create temporary table news_club_backfill_before on commit drop as
select story_id, team_id, tagged_by from app.story_teams;

-- ---------------------------------------------------------------------------
-- Migration 20260924180200, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260924180200',
  'news_story_team_backfill',
  array[$bg_20260924180200_file$-- BotolaGO Production V2
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
$bg_20260924180200_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  backfill text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20260924180200'
  );
begin
  if encode(sha256(convert_to(backfill, 'UTF8')), 'hex')
    is distinct from '33da33e73de411f87b060cf53494447766f09f81920fe6ce1d03ea21b7443b22' then
    raise exception 'stop: 20260924180200 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute backfill;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  tagged_stories integer;
  links integer;
  wydad uuid := (select id from app.teams where slug = 'wydad-casablanca-80a3fb8202ae');
begin
  select count(distinct story_id), count(*) into tagged_stories, links
  from app.story_teams where tagged_by = 'headline';

  -- The read-only preview of 2026-09-24 tagged 11,092 stories with 16,097
  -- links; stories imported since can only add to that.
  if tagged_stories < 11000 or links < 16000 then
    problems := problems || format('fewer tags than the preview: %s stories, %s links', tagged_stories, links);
  end if;
  if exists (
    select story_id, team_id, tagged_by from news_club_backfill_before
    except select story_id, team_id, tagged_by from app.story_teams
  ) then
    problems := problems || 'a story_teams row there before the backfill was removed or changed owner'::text;
  end if;
  if jsonb_array_length(api.news_feed('ar', 3, p_team_id => wydad) -> 'items') <> 3 then
    problems := problems || 'Wydad''s Arabic feed does not fill a page of 3'::text;
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260924180200') then
    problems := problems || 'history row missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the backfill did not check out: %', problems;
  end if;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20260924180200')
    then format(
      'Applied. %s stories tagged with %s club links.',
      (select count(distinct story_id) from app.story_teams where tagged_by = 'headline'),
      (select count(*) from app.story_teams where tagged_by = 'headline')
    )
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
