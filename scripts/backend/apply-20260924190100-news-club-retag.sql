-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20260924190100_news_story_team_retag: tag every existing
-- story again under the rule of 20260924190000.
--
-- HOW TO RUN
--   1. Run apply-20260924190000-news-club-translation-check.sql first, and
--      commit it.
--   2. Make sure no other database work is running right now.
--   3. Run this WHOLE file. As shipped it is a REHEARSAL: the re-tag runs
--      inside one transaction, is checked, and is ROLLED BACK. The result row
--      should say "Rehearsal passed".
--   4. Change the line `rollback;` near the bottom to `commit;` and run it
--      again. The result row should say "Applied" with the counts.
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass.
--
-- WHAT IT DOES
--   * refuses to run twice, or before 20260924190000 is recorded;
--   * records the migration file and runs it from that record once its
--     sha256 matches the repository file;
--   * checks the result: editors' rows untouched, a small change in the
--     number of links, and, in production (where all 64 must exist), the 64
--     stories of the judged review of 2026-09-24: each mistranslated club
--     gone, each right one kept, except the one whose original says only
--     "الفتح".
--   It takes no lock that blocks readers.
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
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20260924190100') then
    raise exception 'stop: migration 20260924190100 is already recorded as applied';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260924190000') then
    raise exception 'stop: run apply-20260924190000-news-club-translation-check.sql (and commit it) first';
  end if;
end
$preflight$;

-- What story_teams held before, to measure the change.
create temporary table news_retag_before on commit drop as
select story_id, team_id, tagged_by from app.story_teams;

-- ---------------------------------------------------------------------------
-- Migration 20260924190100, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260924190100',
  'news_story_team_retag',
  array[$bg_20260924190100_file$-- BotolaGO Production V2
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
$bg_20260924190100_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  retag_sql text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20260924190100'
  );
begin
  if encode(sha256(convert_to(retag_sql, 'UTF8')), 'hex')
    is distinct from '52306c742524d60ac145e93a4102cc39534fb776f2fa8395b3aa6bbf14bc4440' then
    raise exception 'stop: 20260924190100 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute retag_sql;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  removed integer := (
    select count(*) from (
      select story_id, team_id from news_retag_before
      except select story_id, team_id from app.story_teams
    ) gone
  );
  added integer := (
    select count(*) from (
      select story_id, team_id from app.story_teams
      except select story_id, team_id from news_retag_before
    ) arrived
  );
  wydad uuid := (select id from app.teams where slug = 'wydad-casablanca-80a3fb8202ae');
  expected record;
  reviewed integer := 0;
begin
  if exists (
    select story_id, team_id from news_retag_before where tagged_by = 'editor'
    except select story_id, team_id from app.story_teams where tagged_by = 'editor'
  ) then
    problems := problems || 'an editor''s row was removed or changed'::text;
  end if;

  -- In production: 12 removed (11 judged wrong, 1 known loss), a few dozen
  -- added by the new spellings. Far more means the rule does something else.
  if removed > 40 or added > 200 then
    problems := problems || format('the re-tag changed more than expected: %s links removed, %s added', removed, added);
  end if;

  for expected in
    select * from (values
      ('02ec71f4-163b-431b-9f22-dd519773467c'::uuid, 'difa-el-jadida-d5d8c59bf7ab', true, 'judged right'),
      ('06746a1f-4314-4fa5-ae86-253bfbed6690'::uuid, 'amal-tiznit-1ebd788b9f71', true, 'judged right'),
      ('06b5e135-9e26-4403-abd1-4d5741196870'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('0a16aae7-109c-4c18-b535-9fff7e12d96e'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('0e680d12-6ba8-4f32-af93-ae266a73942b'::uuid, 'raja-casablanca-3b0f1fc95b29', true, 'judged right'),
      ('0edeffd0-7b00-4a63-bc13-4f30726ffb17'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('1741659e-7dd9-469a-90c3-3c6221fdd951'::uuid, 'uts-rabat-b78eaee893af', false, 'judged wrong: a mistranslation'),
      ('1a73446c-4faa-46c6-ac40-2fbfe52a1660'::uuid, 'kawkab-marrakech-d60d9d72cb7a', false, 'judged wrong: a mistranslation'),
      ('1da4974a-6576-4288-8820-07e223a14eed'::uuid, 'difa-el-jadida-d5d8c59bf7ab', true, 'judged right'),
      ('226ae15b-6e25-4431-9cf6-3179af284d81'::uuid, 'amal-tiznit-1ebd788b9f71', true, 'judged right'),
      ('273f6efd-9b58-41fa-8c11-5c33632ebaf0'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('27d291ff-7c98-4fc0-9354-8e80d43c561e'::uuid, 'uts-rabat-b78eaee893af', false, 'judged wrong: a mistranslation'),
      ('2f0eeab9-710a-4908-b35a-ccc217abf103'::uuid, 'uts-rabat-b78eaee893af', false, 'judged wrong: a mistranslation'),
      ('32c1d872-06b8-466f-bded-3a523bb3ad49'::uuid, 'raja-casablanca-3b0f1fc95b29', true, 'judged right'),
      ('354db53a-0f4c-4a14-bf4a-1e4637486d71'::uuid, 'olympic-safi-32fb7b619af4', true, 'judged right'),
      ('37a49531-ec0b-4e2f-8e79-09e564c2dac1'::uuid, 'wydad-casablanca-80a3fb8202ae', true, 'judged right'),
      ('3b18122c-4164-41ad-aa66-514628153715'::uuid, 'uts-rabat-b78eaee893af', false, 'judged wrong: a mistranslation'),
      ('3b45dc1a-02cc-41cd-8320-fa8073b3c079'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('3d1d759c-4a3d-4854-9cd0-2953de112045'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('496d4f0a-dbd7-47eb-b4c5-2e79f51b68e2'::uuid, 'uts-rabat-b78eaee893af', false, 'judged wrong: a mistranslation'),
      ('4d7082a9-35d3-4f6c-8dad-990a3b49632f'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('4dc81cc5-87b6-4e44-9dcc-cfaa5feebb33'::uuid, 'amal-tiznit-1ebd788b9f71', true, 'judged right'),
      ('520f647a-2546-4085-be35-e2784598a772'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('5b4df240-187b-46a4-9ebc-bd48897f6209'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('5c70954e-51a4-405d-8ff0-678cbfe17e3e'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('5c9d668f-2df7-452e-93ad-f58acdef0f54'::uuid, 'wydad-casablanca-80a3fb8202ae', true, 'judged right'),
      ('5def9f71-4341-4c87-a736-12d4a213303d'::uuid, 'fus-rabat-c499006b2af3', false, 'judged right, original says only الفتح: known loss'),
      ('5ed6bdf7-f257-4299-8a57-428c3e899ab7'::uuid, 'uts-rabat-b78eaee893af', false, 'judged wrong: a mistranslation'),
      ('60565297-bf9a-402c-9e52-e520948af918'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('6167cfea-b739-4768-854e-b34f47b307bd'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('66faf2a4-e035-4827-950d-721ccde10a87'::uuid, 'yacoub-el-mansour-e595b91e4d8f', false, 'judged wrong: a mistranslation'),
      ('67139bfe-96d3-44bd-959c-070e893b3078'::uuid, 'difa-el-jadida-d5d8c59bf7ab', true, 'judged right'),
      ('7e16070e-ac49-4bec-9216-8cd81d66a51a'::uuid, 'ittihad-tanger-353e19d70a4b', false, 'judged wrong: a mistranslation'),
      ('80ae714f-7d13-4c12-a03d-d0d39a63a16b'::uuid, 'amal-tiznit-1ebd788b9f71', true, 'judged right'),
      ('846614d0-d708-4012-a449-14bd1a3bedd3'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('85614b32-cf71-42d9-8898-902aa6e457c3'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('87911e78-3339-49e7-b346-4c24324affea'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('8ae83864-cc6a-48ee-9256-4cc4af1969d5'::uuid, 'wydad-casablanca-80a3fb8202ae', true, 'judged right'),
      ('965675fc-7a26-4698-8999-f2900147dc81'::uuid, 'amal-tiznit-1ebd788b9f71', true, 'judged right'),
      ('a47e72d9-e16a-407a-9e93-b4345ffed42b'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('a57cbabc-2f3e-4380-be05-f01a296de8c5'::uuid, 'wydad-casablanca-80a3fb8202ae', true, 'judged right'),
      ('aa6d44a9-3899-4e52-9d43-8c2724f4a4c2'::uuid, 'amal-tiznit-1ebd788b9f71', true, 'judged right'),
      ('ab816a94-d1e1-4967-b140-96a0c5aea7da'::uuid, 'far-rabat-fd6ff8ea898c', true, 'judged right'),
      ('abb339f0-4799-4c2b-83d0-4b86ae75181e'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('ae2edb19-6d82-48ac-8df0-54c965c87b2c'::uuid, 'wydad-casablanca-80a3fb8202ae', true, 'judged right'),
      ('b110468d-3eb3-4f0f-920b-5b83fe755577'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('b672b012-bd1c-4343-bbde-0bbe8c90685f'::uuid, 'wydad-casablanca-80a3fb8202ae', true, 'judged right'),
      ('c019a10c-b43e-4b9a-b337-1f6b972eff55'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('c43ddfc2-3d8c-4adb-9dd9-3da98d1b7abe'::uuid, 'raja-casablanca-3b0f1fc95b29', true, 'judged right'),
      ('c43f4ca7-8a2e-4ecf-a99b-8854fc96f04d'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('c6e258be-0e05-46b4-b0a1-122cb304f1ee'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('cd388a82-5d91-47c0-9dbe-ef90e5359df9'::uuid, 'far-rabat-fd6ff8ea898c', true, 'judged right'),
      ('d368b5f5-22f3-4f69-ac5d-2e01e9df9092'::uuid, 'uts-rabat-b78eaee893af', true, 'judged right'),
      ('d4fccf38-3358-45f7-a8f2-783cf11f3861'::uuid, 'amal-tiznit-1ebd788b9f71', true, 'judged right'),
      ('db44567b-d3ef-47f3-b690-c8c8c67d37a2'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('dbb9ad2c-a337-4f4e-b687-a1d5d94f5dd8'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('dd2f3176-3010-43ed-aa3e-ce9aafb7f474'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('ddb5e388-de76-45e1-b374-25eee95957f9'::uuid, 'amal-tiznit-1ebd788b9f71', true, 'judged right'),
      ('dfdcad06-a957-487b-9514-99be17a3eb57'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('ea0a249b-190b-4aac-aaea-084aec2ae4eb'::uuid, 'kawkab-marrakech-d60d9d72cb7a', false, 'judged wrong: a mistranslation'),
      ('ec7cd092-3f06-4ccd-8779-afd760f0afb0'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right'),
      ('f128752e-98bc-4587-b9b7-6502c2038004'::uuid, 'raja-casablanca-3b0f1fc95b29', true, 'judged right'),
      ('f53afff6-b189-4523-aa46-917053fb54fd'::uuid, 'uts-rabat-b78eaee893af', false, 'judged wrong: a mistranslation'),
      ('f832a12c-1aeb-4be4-8631-fc3c4b07554f'::uuid, 'fus-rabat-c499006b2af3', true, 'judged right')
    ) as review (story_id, slug, tagged, why)
  loop
    continue when not exists (select 1 from app.stories where id = expected.story_id);
    reviewed := reviewed + 1;
    if exists (
      select 1 from app.story_teams relation
      join app.teams team on team.id = relation.team_id
      where relation.story_id = expected.story_id and team.slug = expected.slug
    ) is distinct from expected.tagged then
      problems := problems || format('story %s should %s %s (%s)', expected.story_id,
        case when expected.tagged then 'be tagged' else 'not be tagged' end, expected.slug, expected.why);
    end if;
  end loop;
  -- All 64 (production) or none (a local rehearsal): anything between means
  -- this is not the database the review was made on.
  if reviewed not in (0, 64) then
    problems := problems || format('%s of the 64 reviewed stories exist here; expected all of them (production) or none', reviewed);
  end if;

  if wydad is not null
    and jsonb_array_length(api.news_feed('ar', 3, p_team_id => wydad) -> 'items') <> 3 then
    problems := problems || 'Wydad''s Arabic feed does not fill a page of 3'::text;
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260924190100') then
    problems := problems || 'history row missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the re-tag did not check out: %', problems;
  end if;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20260924190100')
    then format(
      'Applied. %s stories tagged with %s club links.',
      (select count(distinct story_id) from app.story_teams where tagged_by = 'headline'),
      (select count(*) from app.story_teams where tagged_by = 'headline')
    )
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
