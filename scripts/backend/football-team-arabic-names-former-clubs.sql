-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Arabic names for the clubs of past seasons that are not in the league now.
--
-- STATUS: names supplied (Olympic Safi, Olympique Dcheïra, Yacoub El Mansour)
-- or confirmed (Chabab Mohammédia, JS Soualem) by the owner, 2026-09-25.
-- APPLIED to production 2026-09-25 04:52 UTC:
-- docs/production/APPLIED_2026_09_25_FORMER_CLUB_ARABIC_NAMES.md
--
-- WHY
--   Matches -> Classement shows the 2024/25 and 2025/26 tables. BG-0068
--   (scripts/backend/football-team-arabic-names-seed.sql) gave Arabic names to
--   the 16 clubs of the current season only, so the clubs below still show in
--   Latin script on the Arabic page.
--
--   The names go into app.team_translations, the table
--   app_private.football_team_json reads first. The SportsMonks ingestion never
--   writes that table, so these names survive every sync; app.teams.name does
--   not, which is why this file never touches app.teams.
--
--   short_name is set as well, because football_team_json falls back to the
--   Latin short name separately, and the table shows the short name. For these
--   clubs app.teams carries short_name = name (and no code), so the Arabic short
--   name is the Arabic name, except JS Soualem's: its full name is long for a
--   table cell, and الشباب السالمي is the form the press uses.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Make sure no other database work is running right now.
--   2. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is written inside one
--      transaction, checked, and then ROLLED BACK. The result row should say
--      "Rehearsal passed".
--   3. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied".
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * checks each id is the club named beside it, by its Latin name, so a wrong
--     id stops the script instead of naming the wrong club;
--   * writes (or rewrites) one `ar` row per club -- running it again is safe;
--   * checks the rows read back exactly, and that every other translation row
--     is byte-for-byte what it was before the write.
--   Lock and statement timeouts are bounded, so it gives up rather than queue
--   behind a long-running transaction on the live site.
--
-- NOTE FOR BG-0068: that file's final check counts every `ar` row against the
-- clubs of the current season. After this file there are more `ar` rows than
-- current clubs, so re-running BG-0068 as written stops at that check and saves
-- nothing. Its count needs scoping to the current clubs before it is re-run.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create temporary table former_club_arabic_names (
  team_id uuid primary key,
  latin_name text not null,
  name text not null,
  short_name text not null
) on commit drop;

insert into former_club_arabic_names (team_id, latin_name, name, short_name)
values
  -- 2024/25 and 2025/26.
  ('32fb7b61-9af4-4667-8978-b739b5e3f170', 'Olympic Safi', 'أولمبيك أسفي', 'أولمبيك أسفي'),
  -- 2025/26.
  ('f2715f02-38ed-4feb-a4e5-72444ad39529', 'Olympique Dcheïra', 'أولمبيك الدشيرة', 'أولمبيك الدشيرة'),
  -- 2025/26.
  ('e595b91e-4d8f-4f3d-92d7-c23d7e332544', 'Yacoub El Mansour', 'يعقوب المنصور', 'يعقوب المنصور'),
  -- 2024/25.
  ('7ff33380-1236-45e5-9c3e-97e753961cc9', 'Chabab Mohammédia', 'شباب المحمدية', 'شباب المحمدية'),
  -- 2024/25.
  ('318655a9-db9f-4706-abb2-df0fa4b13baf', 'JS Soualem', 'الشباب الرياضي السالمي', 'الشباب السالمي');

-- ---------------------------------------------------------------------------
-- Preflight: the right database, and each id is the club it is meant to be
-- ---------------------------------------------------------------------------
do $preflight$
declare
  mismatched text;
begin
  if to_regclass('app.team_translations') is null then
    raise exception 'stop: app.team_translations does not exist -- is this the BotolaGO database?';
  end if;

  select string_agg(
           format('%s (%s is %s)', wanted.latin_name, wanted.team_id,
                  coalesce(quote_literal(team.name), 'missing')),
           '; ' order by wanted.latin_name)
    into mismatched
  from former_club_arabic_names wanted
  left join app.teams team on team.id = wanted.team_id
  where team.name is distinct from wanted.latin_name;

  if mismatched is not null then
    raise exception 'stop: these ids are not the clubs this file names: %', mismatched;
  end if;
end
$preflight$;

-- Everything else in the table, as it is before the write.
create temporary table other_translations_before on commit drop as
select team_id, language, name, short_name
from app.team_translations
where team_id not in (select team_id from former_club_arabic_names);

-- ---------------------------------------------------------------------------
-- The write
-- ---------------------------------------------------------------------------
insert into app.team_translations (team_id, language, name, short_name)
select team_id, 'ar', name, short_name
from former_club_arabic_names
on conflict (team_id, language) do update
  set name = excluded.name,
      short_name = excluded.short_name,
      updated_at = statement_timestamp();

-- ---------------------------------------------------------------------------
-- Postflight: the rows read back, and nothing else moved
-- ---------------------------------------------------------------------------
do $postflight$
declare
  wrong text;
  moved integer;
begin
  select string_agg(wanted.latin_name, ', ' order by wanted.latin_name)
    into wrong
  from former_club_arabic_names wanted
  left join app.team_translations translation
    on translation.team_id = wanted.team_id and translation.language = 'ar'
  where translation.name is distinct from wanted.name
     or translation.short_name is distinct from wanted.short_name;

  if wrong is not null then
    raise exception 'stop: the Arabic name did not read back for: %', wrong;
  end if;

  -- A changed row shows on both sides of the difference; count it once.
  select count(distinct (team_id, language)) into moved
  from (
    (select team_id, language::text, name, short_name from other_translations_before
     except all
     select team_id, language::text, name, short_name from app.team_translations
     where team_id not in (select team_id from former_club_arabic_names))
    union all
    (select team_id, language::text, name, short_name from app.team_translations
     where team_id not in (select team_id from former_club_arabic_names)
     except all
     select team_id, language::text, name, short_name from other_translations_before)
  ) as difference;

  if moved <> 0 then
    raise exception 'stop: % other translation row(s) changed during the write', moved;
  end if;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select
  case
    when (
      select count(*) from app.team_translations
      where language = 'ar'
        and team_id in (
          '32fb7b61-9af4-4667-8978-b739b5e3f170',
          'f2715f02-38ed-4feb-a4e5-72444ad39529',
          'e595b91e-4d8f-4f3d-92d7-c23d7e332544',
          '7ff33380-1236-45e5-9c3e-97e753961cc9',
          '318655a9-db9f-4706-abb2-df0fa4b13baf'
        )
    ) = 5
      then 'Applied. These clubs now show their Arabic names.'
    else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
  end as result,
  (
    select string_agg(team.name, ', ' order by team.name)
    from app.teams team
    where exists (select 1 from app.team_memberships membership where membership.team_id = team.id)
      and not exists (
        select 1 from app.team_translations translation
        where translation.team_id = team.id and translation.language = 'ar'
      )
  ) as clubs_still_without_an_arabic_name;
