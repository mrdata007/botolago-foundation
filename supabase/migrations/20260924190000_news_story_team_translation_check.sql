-- BotolaGO Production V2
-- News: a translated headline adds a club only if the original article names it.
--
-- 20260924180000_news_story_team_tagging tags a story with the clubs named in
-- the headlines of all its editions. Most stories are ElBotola articles
-- written in Arabic, and some carry a French edition translated from the
-- Arabic. Those translations sometimes name the wrong club, and the tagger
-- believed them:
--
--   * "Union Yacoub El Mansour" (اتحاد يعقوب المنصور) comes out as "Union
--     Touarga", so Yacoub stories were also tagged UTS Rabat;
--   * "Club Meknès" (النادي المكناسي) once came out as "KACM", so a CODM
--     signing appeared on Kawkab Marrakech's page.
--
-- Yet a translation also often names a club more plainly than its original:
-- the Arabic headline says just "الفتح" (not an alias, since it is also
-- Saudi Arabia's Al-Fateh) where the French says "FUS".
--
-- Measured on production (2026-09-24): in 64 stories a translated headline
-- named a club the original headline did not. Two independent readings of
-- each original article agreed on all 64: 53 of those clubs are right and 11
-- wrong. The rule below keeps all 11 wrong clubs out and keeps 43 of the 53
-- right ones. Of the 10 it would lose, 9 come back through the original
-- headline, which names them in spellings the alias list did not have (added
-- below): أمل تزنيت (8 stories) and الاتحاد التوركي (1). The last one says only
-- "الفتح", and stays untagged for FUS Rabat.
--
-- The rule
-- ---------------------------------------------------------------------------
-- A story's clubs are those named by the headlines of its editions in the
-- story's original language, plus any club named by another edition's
-- headline that the original-language article's own text also names.
-- A translation may make a club explicit; it may not introduce one.
--
-- A story with no edition in its original language (none today) is tagged
-- from all its headlines, as before.
--
-- Editor-tagged stories stay untouched, and 'headline' rows stay the
-- tagger's, exactly as in 20260924180000.
--
-- Because the rule now reads the original article's text, the trigger also
-- re-tags when an edition's body changes, not only its title.
--
-- Tagging the existing stories again is 20260924190100_news_story_team_retag,
-- in a transaction of its own: replacing this trigger blocks writes to
-- app.article_editions (never reads) until this transaction ends, and this
-- one does no bulk work.

-- ---------------------------------------------------------------------------
-- 1. Two clubs as Arabic headlines also spell them
-- ---------------------------------------------------------------------------
-- In production headlines: تزنيت 11 times against تيزنيت 4, and Union
-- Touarga as الاتحاد التوركي or الاتحاد الرياضي التوركي 15 times. Named by
-- production slug like the rest of the list; a database without these clubs
-- adds nothing.
insert into app_private.news_team_aliases (team_id, alias, kind)
select team.id, alias.alias, alias.kind
from (
  values
    ('amal-tiznit-1ebd788b9f71', 'أمل تزنيت', 'name'),
    ('amal-tiznit-1ebd788b9f71', 'تزنيت', 'place'),
    ('uts-rabat-b78eaee893af', 'الاتحاد التوركي', 'name'),
    ('uts-rabat-b78eaee893af', 'الاتحاد الرياضي التوركي', 'name')
) as alias (team_slug, alias, kind)
join app.teams team on team.slug = alias.team_slug;

-- ---------------------------------------------------------------------------
-- 2. The text of an edition, for the rule's check
-- ---------------------------------------------------------------------------
-- The body as the matcher can read it: markup turned into spaces. The
-- matcher normalises the rest (entities and punctuation become spaces too).
create or replace function app_private.news_edition_plain_text(p_edition app.article_editions)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_edition.title, '') || ' ' || regexp_replace(
    coalesce(p_edition.body_html, p_edition.body_source, ''), '<[^>]*>', ' ', 'g'
  )
$$;

-- ---------------------------------------------------------------------------
-- 3. The rule, for one story
-- ---------------------------------------------------------------------------
create or replace function app_private.news_retag_story_teams(p_story_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  story_language app.language_code;
  has_original boolean;
  original_clubs uuid[];
  other_clubs uuid[];
  confirmed uuid[] := array[]::uuid[];
  wanted uuid[];
begin
  -- Serialise re-tags of one story, so two editions saved at once cannot each
  -- remove the other's club. NO KEY UPDATE does not block the foreign-key
  -- checks of rows being inserted for the same story. Not found: one
  -- statement deleted the story along with its editions, and those editions'
  -- delete triggers run after it.
  select story.original_language into story_language
  from app.stories story where story.id = p_story_id
  for no key update;
  if not found then
    return;
  end if;

  -- A story an editor has tagged by hand is the editor's.
  if exists (
    select 1 from app.story_teams
    where story_id = p_story_id and tagged_by = 'editor'
  ) then
    return;
  end if;

  has_original := exists (
    select 1 from app.article_editions
    where story_id = p_story_id and language = story_language
  );

  select
    coalesce(array_agg(distinct headline.team_id)
      filter (where edition.language = story_language), array[]::uuid[]),
    coalesce(array_agg(distinct headline.team_id)
      filter (where edition.language <> story_language), array[]::uuid[])
  into original_clubs, other_clubs
  from app.article_editions edition
  cross join lateral unnest(app_private.news_headline_team_ids(edition.title)) as headline(team_id)
  where edition.story_id = p_story_id;

  if not has_original then
    wanted := other_clubs;
  else
    -- Only read the original article when a translation names a club its
    -- headline does not: most stories never get here.
    if exists (select 1 from unnest(other_clubs) as club(id) where not (club.id = any(original_clubs))) then
      select coalesce(array_agg(distinct named.team_id), array[]::uuid[])
      into confirmed
      from app.article_editions edition
      cross join lateral unnest(
        app_private.news_headline_team_ids(app_private.news_edition_plain_text(edition))
      ) as named(team_id)
      where edition.story_id = p_story_id and edition.language = story_language;
    end if;
    wanted := original_clubs || array(
      select club.id from unnest(other_clubs) as club(id)
      where club.id = any(confirmed) and not (club.id = any(original_clubs))
    );
  end if;

  delete from app.story_teams
  where story_id = p_story_id
    and tagged_by = 'headline'
    and not (team_id = any(wanted));

  insert into app.story_teams (story_id, team_id, tagged_by)
  select distinct p_story_id, club.id, 'headline'
  from unnest(wanted) as club(id)
  on conflict (story_id, team_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The trigger: the body now matters too
-- ---------------------------------------------------------------------------
create or replace function app_private.news_retag_story_teams_after_edition_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.title is not distinct from old.title
     and new.story_id is not distinct from old.story_id
     and new.body_html is not distinct from old.body_html
     and new.body_source is not distinct from old.body_source then
    return null;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform app_private.news_retag_story_teams(old.story_id);
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.story_id is distinct from old.story_id) then
    perform app_private.news_retag_story_teams(new.story_id);
  end if;
  return null;
end;
$$;

-- Same name, so it still fires after article_editions_refresh_search_after_write
-- (triggers of one kind run in name order). OR REPLACE takes the same lock as
-- CREATE TRIGGER: writers wait, readers do not.
create or replace trigger article_editions_tag_story_teams_after_write
after insert or delete or update of title, story_id, body_html, body_source on app.article_editions
for each row execute function app_private.news_retag_story_teams_after_edition_write();

-- ---------------------------------------------------------------------------
-- 5. The rule, for every story in one pass
-- ---------------------------------------------------------------------------
-- Set-based for the reason given in 20260924180000. Every edition's headline
-- is matched once (the CTE is read three times, so it is materialised); the
-- original article's text is matched only for the stories where a
-- translation names a club its original headline does not.
create or replace function app_private.news_retag_all_story_teams()
returns table (stories integer, tagged_stories integer, headline_rows integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  with hand_tagged as (
    select distinct relation.story_id
    from app.story_teams relation
    where relation.tagged_by = 'editor'
  ), headline_club as materialized (
    select edition.story_id, headline.team_id,
      edition.language = story.original_language as original
    from app.article_editions edition
    join app.stories story on story.id = edition.story_id
    cross join lateral unnest(app_private.news_headline_team_ids(edition.title)) as headline(team_id)
    where not exists (select 1 from hand_tagged where hand_tagged.story_id = edition.story_id)
  ), with_original as (
    select distinct edition.story_id
    from app.article_editions edition
    join app.stories story on story.id = edition.story_id
    where edition.language = story.original_language
  ), to_confirm as (
    select distinct candidate.story_id, candidate.team_id
    from headline_club candidate
    where not candidate.original
      and exists (select 1 from with_original where with_original.story_id = candidate.story_id)
      and not exists (
        select 1 from headline_club original
        where original.story_id = candidate.story_id and original.original
          and original.team_id = candidate.team_id
      )
  ), original_text_club as (
    select distinct edition.story_id, named.team_id
    from app.article_editions edition
    join app.stories story on story.id = edition.story_id
    cross join lateral unnest(
      app_private.news_headline_team_ids(app_private.news_edition_plain_text(edition))
    ) as named(team_id)
    where edition.language = story.original_language
      and edition.story_id in (select to_confirm.story_id from to_confirm)
  ), wanted as (
    select story_id, team_id from headline_club where original
    union
    select headline_club.story_id, headline_club.team_id from headline_club
    where not exists (select 1 from with_original where with_original.story_id = headline_club.story_id)
    union
    select to_confirm.story_id, to_confirm.team_id from to_confirm
    join original_text_club using (story_id, team_id)
  ), removed as (
    delete from app.story_teams relation
    where relation.tagged_by = 'headline'
      and not exists (select 1 from hand_tagged where hand_tagged.story_id = relation.story_id)
      and not exists (
        select 1 from wanted
        where wanted.story_id = relation.story_id and wanted.team_id = relation.team_id
      )
  )
  insert into app.story_teams (story_id, team_id, tagged_by)
  select wanted.story_id, wanted.team_id, 'headline'
  from wanted
  on conflict (story_id, team_id) do nothing;

  return query
    select
      (select count(*)::integer from app.stories),
      (select count(distinct relation.story_id)::integer from app.story_teams relation
        where relation.tagged_by = 'headline'),
      (select count(*)::integer from app.story_teams relation
        where relation.tagged_by = 'headline');
end;
$$;

revoke all on function app_private.news_edition_plain_text(app.article_editions)
from public, anon, authenticated, service_role;
grant execute on function app_private.news_edition_plain_text(app.article_editions) to postgres;
