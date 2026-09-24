-- BotolaGO Production V2
-- News: tag every story with the clubs its headline names, automatically.
--
-- A club page (/clubs/$clubId) lists the club's news through app.story_teams,
-- and so do the single-club crest on article plates, the related-articles
-- score and the search document. Production holds 14,302 stories and 23
-- story_teams rows: the BG-0082 seed (20260921220000_story_teams_seed.sql) ran
-- once over 108 stubs, and nothing has written the table since. Every story
-- imported after that, which is almost all of them, names no club.
--
-- This migration makes the association a property of the headline, kept up to
-- date by the database itself:
--
--   * app_private.news_team_aliases holds the names a club goes by in French
--     and Arabic headlines, plus a few "stop phrases" that contain a club's
--     name but mean another club.
--   * app_private.news_headline_team_ids(title) returns the clubs a headline
--     names.
--   * A trigger on app.article_editions re-tags the story whenever an edition
--     is added, removed or retitled. It covers every writer at once: the
--     ElBotola import, provider ingestion and the editorial CMS.
--   * 20260924180200_news_story_team_backfill then tags every existing story,
--     in a transaction of its own: see "Tagging the existing stories" below.
--
-- Only the headline is read. Bodies name every opponent, referee, former club
-- and agent, and a club named in passing in paragraph six is not what the
-- story is about. The headline is the editor's statement of the subject.
--
-- ---------------------------------------------------------------------------
-- How a headline is matched
-- ---------------------------------------------------------------------------
-- Headline and alias are both normalised the same way
-- (app_private.news_team_match_text): accents stripped, lower case, the Arabic
-- letter variants folded onto one form (أ إ آ ٱ -> ا, ى -> ي, ة -> ه, ...),
-- short vowels and tatweel deleted, and every run of other characters turned
-- into one space. "Difaâ d'El Jadida" becomes "difaa d el jadida", and
-- "حسنية أكادير" and "حسنيه اكادير" become the same string.
--
-- An alias only matches whole words: the pattern is the alias with a space on
-- each side, searched in the headline with a space on each side, so "FAR"
-- never matches inside "Farid". Arabic attaches small words to the front of
-- the next one (و "and", ف "so", ب "with/at", ك "like", ل "for/to"), so an
-- Arabic alias also matches with those in front: "الوداد" matches in
-- "والوداد", "بالوداد" and "للوداد". Those variants are precomputed into
-- `patterns` when an alias is saved.
--
-- Patterns are tried longest first, and a match blanks the text it covered.
-- That is what lets "Wydad de Témara" (Widad Témara) and "الوداد الفاسي" (a stop
-- phrase: Wydad de Fès, a different club) win over the shorter "Wydad" and
-- "الوداد" inside them.
--
-- A headline that names two clubs gets both, as the BG-0082 seed decided and
-- for the same reasons: both rows are true, and the single-club crest declines
-- on its own when there are two.
--
-- ---------------------------------------------------------------------------
-- Which names, and which not
-- ---------------------------------------------------------------------------
-- The list was measured before it was written, against the ElBotola archive
-- (2,533 French and 13,236 Arabic headlines) and the club tags ElBotola's own
-- editors attach to those articles. With this list 73% of French and 79% of
-- Arabic headlines name at least one club, and 92% of the French and 94% of
-- the Arabic links are ones ElBotola's editors also made. The rest were read
-- in a random sample: 39 of 40 Arabic and 25 of 25 French were right (clubs
-- ElBotola had left untagged); the one wrong link was a town named as a
-- place ("at the entrance of Tiznit"). The measurement read the archive at
-- run time; no headline text is stored in this repository.
--
--   * Short codes are used only where they are unambiguous in this corpus
--     (WAC, FAR, FUS, MAS, MAT, RSB, HUSA, DHJ, IRT, KACM, UTS, CODM, RCAZ,
--     SCCM, JSS, OCS, UYEM). "RCA" is not one: in French it is also the
--     Central African Republic.
--   * The bare words "الفتح" (also Al-Fateh of Saudi Arabia), "المغرب"
--     (Morocco), "طنجة", "المحمدية", "الجديدة" and "Tanger" are not aliases.
--     Measured, a large share of their headlines are about the city, a stadium
--     hosting someone else's match, or plain Arabic ("الجديدة" means "the new").
--   * kind = 'place' marks a town that headlines use for its club ("face au
--     Zemamra", "أمام بركان"). In Arabic a place alias does not match after ب
--     or ل: "بالزمامرة" is "in Zemamra" (a venue) and "لبركان" is usually "to
--     Berkane" (a trip), where "والزمامرة" is "and Zemamra" (a club in a list).
--   * The abbreviated forms of fixture lists ("ا. طنجة", "ح. أكادير",
--     "ش. المحمدية") are aliases in their own right: the dot becomes a space
--     in normalisation, so "ا.طنجة" matches "ا. طنجة". Like towns, they take
--     only و and ف in front ("وا.طنجة"): other letters before a lone initial
--     spell different words ("ولا طنجة" is "nor Tangier").
--
-- Aliases exist for the 21 clubs in app.teams: the 16 of the current season
-- and 5 that are not in it. BG-0082 restricted itself to the current season;
-- this does not, because a story about Olympic Safi is about Olympic Safi
-- whether or not it plays this season, and the club's page and crest exist
-- either way. A club with no alias is simply never matched.
--
-- A read-only preview of exactly this list against production (2026-09-24,
-- the same matching written as one SELECT) tags 11,092 of 14,302 stories with
-- 16,097 links; 6,640 stories name exactly one club; all 23 existing rows are
-- confirmed and none is removed.
--
-- ---------------------------------------------------------------------------
-- Tagging the existing stories
-- ---------------------------------------------------------------------------
-- Not here: 20260924180200_news_story_team_backfill does it, by calling
-- app_private.news_retag_all_story_teams() in its own transaction. Adding
-- the tagged_by column locks app.story_teams against every reader until the
-- transaction ends, and every news card reads that table. In this migration
-- the lock lasts as long as the DDL, about a second; with the backfill
-- inside it would last the whole backfill (16 s locally on 15,769 stories,
-- more in production), and every news page would wait or time out for that
-- long. The backfill's own inserts block no reader.
--
-- ---------------------------------------------------------------------------
-- Who owns a row
-- ---------------------------------------------------------------------------
-- app.story_teams.tagged_by says who wrote the row. 'headline' rows belong to
-- the tagger: it adds and removes them as titles change. 'editor' is the
-- default, so any other writer's row is an editor's, and a story with even one
-- 'editor' row is left entirely alone. Nothing in the product writes
-- story_teams by hand today; the rule is here so the first tool that does
-- cannot have its choices undone by the next title edit. It should replace a
-- story's full set of rows when it saves.
--
-- The 23 existing rows came from the BG-0082 headline seed and are marked
-- 'headline', so the backfill re-checks them with the rest (the preview above
-- confirms all 23).
--
-- ---------------------------------------------------------------------------
-- Changing the list
-- ---------------------------------------------------------------------------
-- Insert, update or delete rows in app_private.news_team_aliases; the patterns
-- are recomputed by trigger. New and edited stories use the new list at once.
-- To re-tag stories that already exist, run
--   select * from app_private.news_retag_all_story_teams();
-- once, as a database write in its own right (it touches story_teams and the
-- search documents of every story whose tags change).

-- ---------------------------------------------------------------------------
-- 1. Who wrote each story_teams row
-- ---------------------------------------------------------------------------
-- Added with the default 'headline' so the existing BG-0082 rows take it
-- without an update (and without firing the search refresh 23 times), then the
-- default is switched to 'editor' for every later insert that does not say.
alter table app.story_teams
  add column tagged_by text not null default 'headline'
    constraint story_teams_tagged_by_check check (tagged_by in ('editor', 'headline'));
alter table app.story_teams alter column tagged_by set default 'editor';

comment on column app.story_teams.tagged_by is
  'Who wrote the row. headline: the automatic tagger, which adds and removes its rows as titles change. editor: anyone else; a story with an editor row is never re-tagged automatically.';

-- ---------------------------------------------------------------------------
-- 2. Normalisation and patterns
-- ---------------------------------------------------------------------------
-- The two-argument unaccent names its dictionary, because with an empty
-- search_path the one-argument form cannot find it.
create or replace function app_private.news_team_match_text(p_value text)
returns text
language sql
stable
strict
set search_path = ''
as $$
  select btrim(regexp_replace(
    regexp_replace(
      translate(
        lower(extensions.unaccent('extensions.unaccent'::regdictionary, normalize(p_value, nfkc))),
        'أإآٱىةؤئکیڭگ',
        'اااايهويكيكك'
      ),
      -- short vowels and the other Arabic marks, superscript alef, tatweel
      '[\u064B-\u065F\u0670\u0640]', '', 'g'
    ),
    -- anything that is not a Latin letter, a digit or an Arabic letter
    '[^a-z0-9\u0621-\u064A]+', ' ', 'g'
  ))
$$;

create or replace function app_private.news_team_alias_patterns(p_normalized text, p_kind text)
returns text[]
language sql
immutable
strict
set search_path = ''
as $$
  with shape as (
    select
      p_normalized ~ '[\u0621-\u064A]' as arabic,
      -- A town standing for its club, or an abbreviation ("ا. طنجة"): only
      -- "and" / "so" attach. ب or ل before a town mean "in" / "to" it, and
      -- before a lone initial they make other words ("ولا طنجة", "nor Tangier").
      p_kind = 'place' or p_normalized ~ '^[\u0621-\u064A] ' as conjunctions_only,
      p_normalized ~ '^ال' as definite
  )
  select array_agg(' ' || variant.prefix || variant.stem || ' ' order by variant.prefix, variant.stem)
  from shape, lateral (
    -- Latin: the phrase as it stands.
    select '' as prefix, p_normalized as stem
    where not shape.arabic
    union all
    select prefix, p_normalized
    from unnest(array['', 'و', 'ف']) prefix
    where shape.arabic and shape.conjunctions_only
    union all
    -- Arabic name with the article: و ف ب ك and their pairs attach in front...
    select prefix, p_normalized
    from unnest(array['', 'و', 'ف', 'ب', 'ك', 'وب', 'فب', 'وك', 'فك']) prefix
    where shape.arabic and not shape.conjunctions_only and shape.definite
    union all
    -- ...and ل replaces the article's alif: الوداد -> للوداد.
    select prefix || 'ل', substr(p_normalized, 2)
    from unnest(array['', 'و', 'ف']) prefix
    where shape.arabic and not shape.conjunctions_only and shape.definite
    union all
    -- Arabic name without the article: the same set, ل attaching directly.
    select prefix, p_normalized
    from unnest(array['', 'و', 'ف', 'ب', 'ك', 'ل', 'وب', 'فب', 'ول', 'فل', 'وك']) prefix
    where shape.arabic and not shape.conjunctions_only and not shape.definite
  ) variant
$$;

-- ---------------------------------------------------------------------------
-- 3. The alias list
-- ---------------------------------------------------------------------------
create table app_private.news_team_aliases (
  id bigint generated always as identity primary key,
  -- null for a stop phrase
  team_id uuid references app.teams(id) on delete cascade,
  alias text not null,
  kind text not null,
  -- set by trigger from alias and kind
  normalized text not null,
  patterns text[] not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint news_team_aliases_alias_check check (
    alias = btrim(alias) and char_length(alias) between 2 and 80
  ),
  constraint news_team_aliases_kind_check check (kind in ('name', 'place', 'stop')),
  constraint news_team_aliases_stop_check check ((kind = 'stop') = (team_id is null)),
  constraint news_team_aliases_normalized_key unique (normalized)
);
create index news_team_aliases_team_idx on app_private.news_team_aliases (team_id);

comment on table app_private.news_team_aliases is
  'Names clubs go by in headlines. name: a club name or nickname. place: a town used for its club, which in Arabic does not match after ب or ل. stop: a phrase that contains a club alias but names another club; it consumes the text and tags nothing.';

create or replace function app_private.news_team_aliases_prepare()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.normalized := app_private.news_team_match_text(new.alias);
  if coalesce(new.normalized, '') = '' then
    raise exception using errcode = '22023', message = 'news_team_alias_has_no_letters';
  end if;
  new.patterns := app_private.news_team_alias_patterns(new.normalized, new.kind);
  return new;
end;
$$;

create trigger news_team_aliases_prepare_before_write
before insert or update of alias, kind on app_private.news_team_aliases
for each row execute function app_private.news_team_aliases_prepare();

alter table app_private.news_team_aliases enable row level security;
alter table app_private.news_team_aliases force row level security;
revoke all on app_private.news_team_aliases from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Matching and re-tagging
-- ---------------------------------------------------------------------------
create or replace function app_private.news_headline_team_ids(p_title text)
returns uuid[]
language plpgsql
stable
set search_path = ''
as $$
declare
  remaining text := ' ' || coalesce(app_private.news_team_match_text(p_title), '') || ' ';
  candidate record;
  matched uuid[] := array[]::uuid[];
begin
  -- Only patterns present in the headline are fetched, longest first. Each
  -- match blanks its text, so the re-check skips a shorter pattern that only
  -- occurred inside a longer one already taken.
  for candidate in
    select pattern, entry.team_id
    from app_private.news_team_aliases entry
    cross join lateral unnest(entry.patterns) pattern
    where strpos(remaining, pattern) > 0
    order by length(pattern) desc, pattern
  loop
    continue when strpos(remaining, candidate.pattern) = 0;
    -- replace() leaves the second of two back-to-back occurrences (they share
    -- the space between them), so repeat until none is left.
    loop
      remaining := replace(remaining, candidate.pattern, ' ');
      exit when strpos(remaining, candidate.pattern) = 0;
    end loop;
    if candidate.team_id is not null and not (candidate.team_id = any(matched)) then
      matched := matched || candidate.team_id;
    end if;
  end loop;
  return matched;
end;
$$;

create or replace function app_private.news_retag_story_teams(p_story_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted uuid[];
begin
  -- Serialise re-tags of one story, so two editions saved at once cannot each
  -- remove the other's club. NO KEY UPDATE does not block the foreign-key
  -- checks of rows being inserted for the same story. Not found: one
  -- statement deleted the story along with its editions, and those editions'
  -- delete triggers run after it.
  perform 1 from app.stories where id = p_story_id for no key update;
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

  -- Every language's headline counts: the Arabic original and its French
  -- translation are one story.
  select coalesce(array_agg(distinct headline.team_id), array[]::uuid[])
  into wanted
  from app.article_editions edition
  cross join lateral unnest(app_private.news_headline_team_ids(edition.title)) as headline(team_id)
  where edition.story_id = p_story_id;

  delete from app.story_teams
  where story_id = p_story_id
    and tagged_by = 'headline'
    and not (team_id = any(wanted));

  insert into app.story_teams (story_id, team_id, tagged_by)
  select p_story_id, headline.team_id, 'headline'
  from unnest(wanted) as headline(team_id)
  on conflict (story_id, team_id) do nothing;
end;
$$;

create or replace function app_private.news_retag_story_teams_after_edition_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.title is not distinct from old.title
     and new.story_id is not distinct from old.story_id then
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

-- Fires after article_editions_refresh_search_after_write (triggers of one
-- kind run in name order); the story_teams rows it writes refresh the search
-- documents again through story_teams_refresh_search_after_write, so the club
-- names end up in them.
create trigger article_editions_tag_story_teams_after_write
after insert or delete or update of title, story_id on app.article_editions
for each row execute function app_private.news_retag_story_teams_after_edition_write();

-- The same rule as news_retag_story_teams, for every story in one pass. Not
-- a loop over that function: its plans are made once per session from the
-- table's statistics, and in production those say story_teams holds 23 rows.
-- Filled 17,887 rows by a loop planned for an empty table, the local
-- measurement took 40 s; with fresh statistics, 19 s. Set-based, it does not
-- depend on them.
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
  ), wanted as (
    select distinct edition.story_id, headline.team_id
    from app.article_editions edition
    cross join lateral unnest(app_private.news_headline_team_ids(edition.title)) as headline(team_id)
    where not exists (select 1 from hand_tagged where hand_tagged.story_id = edition.story_id)
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

revoke all on function
  app_private.news_team_match_text(text),
  app_private.news_team_alias_patterns(text, text),
  app_private.news_team_aliases_prepare(),
  app_private.news_headline_team_ids(text),
  app_private.news_retag_story_teams(uuid),
  app_private.news_retag_story_teams_after_edition_write(),
  app_private.news_retag_all_story_teams()
from public, anon, authenticated, service_role;
grant execute on function
  app_private.news_team_match_text(text),
  app_private.news_team_alias_patterns(text, text),
  app_private.news_team_aliases_prepare(),
  app_private.news_headline_team_ids(text),
  app_private.news_retag_story_teams(uuid),
  app_private.news_retag_story_teams_after_edition_write(),
  app_private.news_retag_all_story_teams()
to postgres;

-- ---------------------------------------------------------------------------
-- 5. Seed the list
-- ---------------------------------------------------------------------------
-- Clubs are named by production slug. The slugs end in the first 12 hex
-- digits of the team id, so they identify production's rows exactly. On a
-- database with none of these clubs (a fresh local or CI database) no club
-- alias is seeded and nothing is tagged; tests insert their own. Some but not
-- all of them present means the database is not the one this list was written
-- for, and the migration stops rather than seed a partial list.
do $seed$
declare
  listed_clubs integer;
  found_clubs integer;
  missing_slugs text[];
begin
  with seed (team_slug, alias, kind) as (values
    -- Wydad Casablanca
    ('wydad-casablanca-80a3fb8202ae', 'Wydad Casablanca', 'name'),
    ('wydad-casablanca-80a3fb8202ae', 'Wydad AC', 'name'),
    ('wydad-casablanca-80a3fb8202ae', 'Wydad Athletic Club', 'name'),
    ('wydad-casablanca-80a3fb8202ae', 'Wydad', 'name'),
    ('wydad-casablanca-80a3fb8202ae', 'WAC', 'name'),
    ('wydad-casablanca-80a3fb8202ae', 'الوداد الرياضي', 'name'),
    ('wydad-casablanca-80a3fb8202ae', 'الوداد البيضاوي', 'name'),
    ('wydad-casablanca-80a3fb8202ae', 'الوداد', 'name'),
    ('wydad-casablanca-80a3fb8202ae', 'الودادي', 'name'),
    ('wydad-casablanca-80a3fb8202ae', 'وداد الأمة', 'name'),
    -- Raja Casablanca
    ('raja-casablanca-3b0f1fc95b29', 'Raja Casablanca', 'name'),
    ('raja-casablanca-3b0f1fc95b29', 'Raja CA', 'name'),
    ('raja-casablanca-3b0f1fc95b29', 'Raja Club Athletic', 'name'),
    ('raja-casablanca-3b0f1fc95b29', 'Raja', 'name'),
    ('raja-casablanca-3b0f1fc95b29', 'الرجاء الرياضي', 'name'),
    ('raja-casablanca-3b0f1fc95b29', 'الرجاء البيضاوي', 'name'),
    ('raja-casablanca-3b0f1fc95b29', 'الرجاء', 'name'),
    ('raja-casablanca-3b0f1fc95b29', 'الرجاوي', 'name'),
    -- FAR Rabat
    ('far-rabat-fd6ff8ea898c', 'AS FAR', 'name'),
    ('far-rabat-fd6ff8ea898c', 'FAR Rabat', 'name'),
    ('far-rabat-fd6ff8ea898c', 'FAR', 'name'),
    ('far-rabat-fd6ff8ea898c', 'ASFAR', 'name'),
    ('far-rabat-fd6ff8ea898c', 'الجيش الملكي', 'name'),
    ('far-rabat-fd6ff8ea898c', 'الجيش', 'name'),
    ('far-rabat-fd6ff8ea898c', 'الفريق العسكري', 'name'),
    ('far-rabat-fd6ff8ea898c', 'العساكر', 'name'),
    -- FUS Rabat. Not the bare "الفتح": see the header.
    ('fus-rabat-c499006b2af3', 'FUS Rabat', 'name'),
    ('fus-rabat-c499006b2af3', 'FUS', 'name'),
    ('fus-rabat-c499006b2af3', 'Fath Union Sport', 'name'),
    ('fus-rabat-c499006b2af3', 'الفتح الرباطي', 'name'),
    ('fus-rabat-c499006b2af3', 'الفتح الرياضي', 'name'),
    -- Maghreb Fès
    ('maghreb-f-s-0257feb34c16', 'Maghreb de Fès', 'name'),
    ('maghreb-f-s-0257feb34c16', 'Maghreb Fès', 'name'),
    ('maghreb-f-s-0257feb34c16', 'Maghreb Association Sportive', 'name'),
    ('maghreb-f-s-0257feb34c16', 'MAS Fès', 'name'),
    ('maghreb-f-s-0257feb34c16', 'MAS', 'name'),
    ('maghreb-f-s-0257feb34c16', 'المغرب الفاسي', 'name'),
    ('maghreb-f-s-0257feb34c16', 'المغرب الرياضي الفاسي', 'name'),
    ('maghreb-f-s-0257feb34c16', 'الماص', 'name'),
    ('maghreb-f-s-0257feb34c16', 'م. الفاسي', 'name'),
    -- Moghreb Tétouan
    ('moghreb-t-touan-e3beb52dfbfb', 'Moghreb Tétouan', 'name'),
    ('moghreb-t-touan-e3beb52dfbfb', 'Moghreb de Tétouan', 'name'),
    ('moghreb-t-touan-e3beb52dfbfb', 'Moghreb Athletic de Tétouan', 'name'),
    ('moghreb-t-touan-e3beb52dfbfb', 'Maghreb de Tétouan', 'name'),
    ('moghreb-t-touan-e3beb52dfbfb', 'Maghreb Tétouan', 'name'),
    ('moghreb-t-touan-e3beb52dfbfb', 'MA Tétouan', 'name'),
    ('moghreb-t-touan-e3beb52dfbfb', 'MAT', 'name'),
    ('moghreb-t-touan-e3beb52dfbfb', 'المغرب التطواني', 'name'),
    ('moghreb-t-touan-e3beb52dfbfb', 'المغرب أتلتيك تطوان', 'name'),
    ('moghreb-t-touan-e3beb52dfbfb', 'مغرب تطوان', 'name'),
    ('moghreb-t-touan-e3beb52dfbfb', 'الماط', 'name'),
    ('moghreb-t-touan-e3beb52dfbfb', 'م. التطواني', 'name'),
    -- RSB Berkane
    ('rsb-berkane-7b2e23bc450f', 'RS Berkane', 'name'),
    ('rsb-berkane-7b2e23bc450f', 'RSB Berkane', 'name'),
    ('rsb-berkane-7b2e23bc450f', 'RSB', 'name'),
    ('rsb-berkane-7b2e23bc450f', 'Renaissance de Berkane', 'name'),
    ('rsb-berkane-7b2e23bc450f', 'Renaissance Sportive de Berkane', 'name'),
    ('rsb-berkane-7b2e23bc450f', 'Berkane', 'place'),
    ('rsb-berkane-7b2e23bc450f', 'نهضة بركان', 'name'),
    ('rsb-berkane-7b2e23bc450f', 'النهضة البركانية', 'name'),
    ('rsb-berkane-7b2e23bc450f', 'بركان', 'place'),
    -- Hassania Agadir
    ('hassania-agadir-9f8c170d24ed', 'Hassania Agadir', 'name'),
    ('hassania-agadir-9f8c170d24ed', 'Hassania d''Agadir', 'name'),
    ('hassania-agadir-9f8c170d24ed', 'Hassania', 'name'),
    ('hassania-agadir-9f8c170d24ed', 'HUSA', 'name'),
    ('hassania-agadir-9f8c170d24ed', 'حسنية أكادير', 'name'),
    ('hassania-agadir-9f8c170d24ed', 'الحسنية', 'name'),
    ('hassania-agadir-9f8c170d24ed', 'ح. أكادير', 'name'),
    -- Difaâ El Jadida
    ('difa-el-jadida-d5d8c59bf7ab', 'Difaâ El Jadida', 'name'),
    ('difa-el-jadida-d5d8c59bf7ab', 'Difaâ d''El Jadida', 'name'),
    ('difa-el-jadida-d5d8c59bf7ab', 'Difaâ Hassani El Jadidi', 'name'),
    ('difa-el-jadida-d5d8c59bf7ab', 'Difaâ Hassani Jadidi', 'name'),
    ('difa-el-jadida-d5d8c59bf7ab', 'Difaâ', 'name'),
    ('difa-el-jadida-d5d8c59bf7ab', 'DHJ', 'name'),
    ('difa-el-jadida-d5d8c59bf7ab', 'El Jadida', 'place'),
    ('difa-el-jadida-d5d8c59bf7ab', 'الدفاع الحسني الجديدي', 'name'),
    ('difa-el-jadida-d5d8c59bf7ab', 'الدفاع الجديدي', 'name'),
    ('difa-el-jadida-d5d8c59bf7ab', 'الدفاع الحسني', 'name'),
    ('difa-el-jadida-d5d8c59bf7ab', 'د. الجديدي', 'name'),
    -- Ittihad Tanger. Not the bare city: see the header.
    ('ittihad-tanger-353e19d70a4b', 'Ittihad Tanger', 'name'),
    ('ittihad-tanger-353e19d70a4b', 'Ittihad de Tanger', 'name'),
    ('ittihad-tanger-353e19d70a4b', 'Ittihad Riadi de Tanger', 'name'),
    ('ittihad-tanger-353e19d70a4b', 'IR Tanger', 'name'),
    ('ittihad-tanger-353e19d70a4b', 'IRT', 'name'),
    ('ittihad-tanger-353e19d70a4b', 'اتحاد طنجة', 'name'),
    ('ittihad-tanger-353e19d70a4b', 'ا. طنجة', 'name'),
    ('ittihad-tanger-353e19d70a4b', 'فارس البوغاز', 'name'),
    -- Kawkab Marrakech
    ('kawkab-marrakech-d60d9d72cb7a', 'Kawkab Marrakech', 'name'),
    ('kawkab-marrakech-d60d9d72cb7a', 'Kawkab de Marrakech', 'name'),
    ('kawkab-marrakech-d60d9d72cb7a', 'Kawkab', 'name'),
    ('kawkab-marrakech-d60d9d72cb7a', 'KACM', 'name'),
    ('kawkab-marrakech-d60d9d72cb7a', 'الكوكب المراكشي', 'name'),
    ('kawkab-marrakech-d60d9d72cb7a', 'الكوكب', 'name'),
    ('kawkab-marrakech-d60d9d72cb7a', 'ك. المراكشي', 'name'),
    -- UTS Rabat (Union Touarga)
    ('uts-rabat-b78eaee893af', 'Union Touarga Sport', 'name'),
    ('uts-rabat-b78eaee893af', 'Union Touarga', 'name'),
    ('uts-rabat-b78eaee893af', 'UTS Rabat', 'name'),
    ('uts-rabat-b78eaee893af', 'UTS', 'name'),
    ('uts-rabat-b78eaee893af', 'Touarga', 'place'),
    ('uts-rabat-b78eaee893af', 'اتحاد تواركة', 'name'),
    ('uts-rabat-b78eaee893af', 'تواركة', 'place'),
    ('uts-rabat-b78eaee893af', 'التواركة', 'place'),
    -- Widad Témara
    ('widad-t-mara-7d508334d7a9', 'Widad Témara', 'name'),
    ('widad-t-mara-7d508334d7a9', 'Widad de Témara', 'name'),
    ('widad-t-mara-7d508334d7a9', 'Wydad Témara', 'name'),
    ('widad-t-mara-7d508334d7a9', 'Wydad de Témara', 'name'),
    ('widad-t-mara-7d508334d7a9', 'وداد تمارة', 'name'),
    ('widad-t-mara-7d508334d7a9', 'الوداد التماري', 'name'),
    ('widad-t-mara-7d508334d7a9', 'الوداد الرياضي لتمارة', 'name'),
    -- Amal Tiznit
    ('amal-tiznit-1ebd788b9f71', 'Amal Tiznit', 'name'),
    ('amal-tiznit-1ebd788b9f71', 'Amal de Tiznit', 'name'),
    ('amal-tiznit-1ebd788b9f71', 'Tiznit', 'place'),
    ('amal-tiznit-1ebd788b9f71', 'أمل تيزنيت', 'name'),
    ('amal-tiznit-1ebd788b9f71', 'تيزنيت', 'place'),
    -- CODM Meknès
    ('codm-mekn-s-8059c0cf8b7b', 'CODM Meknès', 'name'),
    ('codm-mekn-s-8059c0cf8b7b', 'CODM de Meknès', 'name'),
    ('codm-mekn-s-8059c0cf8b7b', 'Club Omnisports de Meknès', 'name'),
    ('codm-mekn-s-8059c0cf8b7b', 'CODM', 'name'),
    ('codm-mekn-s-8059c0cf8b7b', 'النادي المكناسي', 'name'),
    ('codm-mekn-s-8059c0cf8b7b', 'المكناسي', 'name'),
    ('codm-mekn-s-8059c0cf8b7b', 'الكوديم', 'name'),
    ('codm-mekn-s-8059c0cf8b7b', 'كوديم', 'name'),
    -- CR Khemis Zemamra
    ('cr-khemis-zemamra-dc6fb8196f3e', 'CR Khemis Zemamra', 'name'),
    ('cr-khemis-zemamra-dc6fb8196f3e', 'Khemis Zemamra', 'name'),
    ('cr-khemis-zemamra-dc6fb8196f3e', 'Renaissance Zemamra', 'name'),
    ('cr-khemis-zemamra-dc6fb8196f3e', 'Renaissance de Zemamra', 'name'),
    ('cr-khemis-zemamra-dc6fb8196f3e', 'Nahdat Zemamra', 'name'),
    ('cr-khemis-zemamra-dc6fb8196f3e', 'RCA Zemamra', 'name'),
    ('cr-khemis-zemamra-dc6fb8196f3e', 'RCAZ', 'name'),
    ('cr-khemis-zemamra-dc6fb8196f3e', 'Zemamra', 'place'),
    ('cr-khemis-zemamra-dc6fb8196f3e', 'نهضة الزمامرة', 'name'),
    ('cr-khemis-zemamra-dc6fb8196f3e', 'الزمامرة', 'place'),
    -- Chabab Mohammédia. Not the bare city: see the header.
    ('chabab-mohamm-dia-7ff333801236', 'Chabab Mohammédia', 'name'),
    ('chabab-mohamm-dia-7ff333801236', 'Chabab de Mohammédia', 'name'),
    ('chabab-mohamm-dia-7ff333801236', 'SCCM', 'name'),
    ('chabab-mohamm-dia-7ff333801236', 'شباب المحمدية', 'name'),
    ('chabab-mohamm-dia-7ff333801236', 'ش. المحمدية', 'name'),
    -- JS Soualem
    ('js-soualem-318655a9db9f', 'JS Soualem', 'name'),
    ('js-soualem-318655a9db9f', 'Jeunesse Sportive Soualem', 'name'),
    ('js-soualem-318655a9db9f', 'JSS', 'name'),
    ('js-soualem-318655a9db9f', 'Soualem', 'place'),
    ('js-soualem-318655a9db9f', 'شباب السوالم', 'name'),
    ('js-soualem-318655a9db9f', 'الشباب السالمي', 'name'),
    ('js-soualem-318655a9db9f', 'الشباب الرياضي السالمي', 'name'),
    ('js-soualem-318655a9db9f', 'السوالم', 'place'),
    -- Olympic Safi
    ('olympic-safi-32fb7b619af4', 'Olympic Safi', 'name'),
    ('olympic-safi-32fb7b619af4', 'Olympique Safi', 'name'),
    ('olympic-safi-32fb7b619af4', 'Olympique de Safi', 'name'),
    ('olympic-safi-32fb7b619af4', 'OC Safi', 'name'),
    ('olympic-safi-32fb7b619af4', 'OCS', 'name'),
    ('olympic-safi-32fb7b619af4', 'Safi', 'place'),
    ('olympic-safi-32fb7b619af4', 'أولمبيك آسفي', 'name'),
    ('olympic-safi-32fb7b619af4', 'الأولمبيك الآسفي', 'name'),
    ('olympic-safi-32fb7b619af4', 'آسفي', 'place'),
    -- Olympique Dcheïra
    ('olympique-dche-ra-f2715f0238ed', 'Olympique Dcheïra', 'name'),
    ('olympique-dche-ra-f2715f0238ed', 'Olympique de Dcheïra', 'name'),
    ('olympique-dche-ra-f2715f0238ed', 'Dcheïra', 'place'),
    ('olympique-dche-ra-f2715f0238ed', 'أولمبيك الدشيرة', 'name'),
    ('olympique-dche-ra-f2715f0238ed', 'الدشيرة', 'place'),
    -- Yacoub El Mansour
    ('yacoub-el-mansour-e595b91e4d8f', 'Union Yacoub El Mansour', 'name'),
    ('yacoub-el-mansour-e595b91e4d8f', 'Yacoub El Mansour', 'name'),
    ('yacoub-el-mansour-e595b91e4d8f', 'UYEM', 'name'),
    ('yacoub-el-mansour-e595b91e4d8f', 'اتحاد يعقوب المنصور', 'name'),
    ('yacoub-el-mansour-e595b91e4d8f', 'يعقوب المنصور', 'place')
  ),
  inserted as (
    insert into app_private.news_team_aliases (team_id, alias, kind)
    select team.id, seed.alias, seed.kind
    from seed join app.teams team on team.slug = seed.team_slug
    returning team_id
  )
  select
    (select count(distinct seed.team_slug) from seed),
    (select count(distinct inserted.team_id) from inserted),
    (select array_agg(distinct seed.team_slug order by seed.team_slug) from seed
      where not exists (select 1 from app.teams team where team.slug = seed.team_slug))
  into listed_clubs, found_clubs, missing_slugs;

  if found_clubs > 0 and found_clubs < listed_clubs then
    raise exception 'news_team_aliases: % of % clubs found; missing slugs: %',
      found_clubs, listed_clubs, missing_slugs;
  end if;
  raise notice 'news_team_aliases: aliases seeded for % of % clubs', found_clubs, listed_clubs;
end;
$seed$;

-- Stop phrases: each contains a club alias above but means something else.
insert into app_private.news_team_aliases (team_id, alias, kind)
values
  (null, 'Raja Beni Mellal', 'stop'),
  (null, 'Raja de Beni Mellal', 'stop'),
  (null, 'Raja Agadir', 'stop'),
  (null, 'Raja d''Agadir', 'stop'),
  (null, 'Wydad de Fès', 'stop'),
  (null, 'Wydad Fès', 'stop'),
  (null, 'الرجاء الملالي', 'stop'),
  (null, 'الوداد الفاسي', 'stop'),
  (null, 'الوداد الرياضي الفاسي', 'stop'),
  -- Army clubs abroad: APR FC of Rwanda, Tala'ea El Gaish of Egypt.
  (null, 'الجيش الرواندي', 'stop'),
  (null, 'طلائع الجيش', 'stop'),
  -- Zemamra's stadium hosts other clubs' home games (Difaâ El Jadida and
  -- Olympic Safi while their own grounds were closed), so "in Zemamra" and
  -- "Zemamra's stadium" name a venue, not the club.
  (null, 'في الزمامرة', 'stop'),
  (null, 'ملعب الزمامرة', 'stop'),
  (null, 'مدينة الزمامرة', 'stop'),
  (null, 'à Zemamra', 'stop');
