-- supabase/migrations/20260924180000_news_story_team_tagging.sql
--
-- Stories are tagged with the clubs their headlines name, by a trigger on
-- app.article_editions. A fresh database has none of production's clubs, so
-- the migration seeds only its stop phrases here; this file adds its own clubs
-- and aliases, shaped like the real ones. Every headline below is written for
-- this test.
begin;

select extensions.no_plan();

-- ---------------------------------------------------------------------
-- Fixture: five clubs and their aliases
-- ---------------------------------------------------------------------
insert into app.teams (id, slug, name, short_name)
values
  ('7a9a0000-0000-4000-8000-00000000a001', 'tagging-wydad', 'Wydad Casablanca', 'Wydad'),
  ('7a9a0000-0000-4000-8000-00000000a002', 'tagging-raja', 'Raja Casablanca', 'Raja'),
  ('7a9a0000-0000-4000-8000-00000000a003', 'tagging-temara', 'Widad Témara', 'Widad Témara'),
  ('7a9a0000-0000-4000-8000-00000000a004', 'tagging-zemamra', 'CR Khemis Zemamra', 'Zemamra'),
  ('7a9a0000-0000-4000-8000-00000000a005', 'tagging-far', 'FAR Rabat', 'FAR'),
  ('7a9a0000-0000-4000-8000-00000000a006', 'tagging-tanger', 'Ittihad Tanger', 'IRT');

insert into app_private.news_team_aliases (team_id, alias, kind)
values
  ('7a9a0000-0000-4000-8000-00000000a001', 'Wydad', 'name'),
  ('7a9a0000-0000-4000-8000-00000000a001', 'الوداد', 'name'),
  ('7a9a0000-0000-4000-8000-00000000a002', 'Raja', 'name'),
  ('7a9a0000-0000-4000-8000-00000000a002', 'الرجاء', 'name'),
  ('7a9a0000-0000-4000-8000-00000000a003', 'Wydad de Témara', 'name'),
  ('7a9a0000-0000-4000-8000-00000000a003', 'وداد تمارة', 'name'),
  ('7a9a0000-0000-4000-8000-00000000a004', 'Zemamra', 'place'),
  ('7a9a0000-0000-4000-8000-00000000a004', 'الزمامرة', 'place'),
  ('7a9a0000-0000-4000-8000-00000000a005', 'FAR', 'name'),
  ('7a9a0000-0000-4000-8000-00000000a005', 'الجيش', 'name'),
  ('7a9a0000-0000-4000-8000-00000000a006', 'ا. طنجة', 'name');

create function pg_temp.clubs(p_title text)
returns text[]
language sql
as $$
  select coalesce(array_agg(team.slug order by team.slug), array[]::text[])
  from unnest(app_private.news_headline_team_ids(p_title)) as found(team_id)
  join app.teams team on team.id = found.team_id
$$;

create function pg_temp.story_clubs(p_story_id uuid)
returns text[]
language sql
as $$
  select coalesce(array_agg(team.slug || ':' || relation.tagged_by order by team.slug), array[]::text[])
  from app.story_teams relation
  join app.teams team on team.id = relation.team_id
  where relation.story_id = p_story_id
$$;

-- ---------------------------------------------------------------------
-- 1. The alias list is private and shaped by its trigger
-- ---------------------------------------------------------------------
select extensions.ok(
  (select relforcerowsecurity from pg_class where oid = 'app_private.news_team_aliases'::regclass),
  'the alias table forces row level security'
);

select extensions.ok(
  not has_table_privilege('anon', 'app_private.news_team_aliases', 'select')
  and not has_table_privilege('authenticated', 'app_private.news_team_aliases', 'select')
  and not has_table_privilege('service_role', 'app_private.news_team_aliases', 'select'),
  'no API role can read the alias list'
);

select extensions.ok(
  not has_function_privilege('authenticated', 'app_private.news_retag_all_story_teams()', 'execute')
  and not has_function_privilege('service_role', 'app_private.news_retag_story_teams(uuid)', 'execute')
  and not has_function_privilege('anon', 'app_private.news_headline_team_ids(text)', 'execute'),
  'no API role can run the tagger'
);

select extensions.is(
  (select count(*)::integer from app_private.news_team_aliases where kind = 'stop'),
  15,
  'the migration seeds its stop phrases on every database'
);

select extensions.is(
  app_private.news_team_match_text('Difaâ d''El-Jadida — FÈS « Dcheïra »'),
  'difaa d el jadida fes dcheira',
  'Latin text loses accents, case and punctuation'
);

select extensions.is(
  app_private.news_team_match_text('حَسَنِيَّة أكـــادير، والرجاء!'),
  'حسنيه اكادير والرجاء',
  'Arabic text loses short vowels and tatweel, and its letter variants fold'
);

select extensions.ok(
  (select patterns @> array[' الوداد ', ' والوداد ', ' بالوداد ', ' للوداد ', ' وللوداد ']
     from app_private.news_team_aliases where alias = 'الوداد'),
  'an Arabic name matches with و ف ب ك ل attached, ل taking the article''s alif'
);

select extensions.ok(
  (select patterns @> array[' الزمامره ', ' والزمامره ', ' فالزمامره ']
      and patterns <@ array[' الزمامره ', ' والزمامره ', ' فالزمامره ']
     from app_private.news_team_aliases where alias = 'الزمامرة'),
  'an Arabic town takes only و and ف: not ب ("in") or ل ("to")'
);

select extensions.ok(
  (select cardinality(patterns) = 3 and not (' ولا طنجه ' = any(patterns))
     from app_private.news_team_aliases where alias = 'ا. طنجة'),
  'an abbreviation takes only و and ف, so it never spells ولا ("nor")'
);

select extensions.is(
  (select patterns from app_private.news_team_aliases where alias = 'Wydad de Témara'),
  array[' wydad de temara '],
  'a Latin alias is the phrase alone'
);

select extensions.throws_ok(
  $$insert into app_private.news_team_aliases (team_id, alias, kind)
    values ('7a9a0000-0000-4000-8000-00000000a002', 'RAJA', 'name')$$,
  '23505',
  null,
  'two aliases that normalise the same are rejected'
);

select extensions.throws_ok(
  $$insert into app_private.news_team_aliases (team_id, alias, kind)
    values ('7a9a0000-0000-4000-8000-00000000a002', 'Raja Club', 'stop')$$,
  '23514',
  null,
  'a stop phrase cannot belong to a club'
);

select extensions.throws_ok(
  $$insert into app_private.news_team_aliases (team_id, alias, kind)
    values ('7a9a0000-0000-4000-8000-00000000a002', '« »', 'name')$$,
  '22023',
  'news_team_alias_has_no_letters',
  'an alias with no letters is rejected'
);

-- ---------------------------------------------------------------------
-- 2. Matching a headline
-- ---------------------------------------------------------------------
select extensions.is(
  pg_temp.clubs('Farid signe au Raja pour trois saisons'),
  array['tagging-raja'],
  'aliases match whole words only: FAR is not found inside Farid'
);

select extensions.is(
  pg_temp.clubs('الوداد يواجه الرجاء في قمة الجولة'),
  array['tagging-raja', 'tagging-wydad'],
  'a headline naming two clubs is tagged with both'
);

select extensions.is(
  pg_temp.clubs('Le Raja affronte le Wydad de Témara en amical'),
  array['tagging-raja', 'tagging-temara'],
  'the longest alias wins: Wydad de Témara is not also Wydad'
);

select extensions.is(
  pg_temp.clubs('مهاجم الوداد الفاسي ينتقل إلى الرجاء'),
  array['tagging-raja'],
  'a stop phrase (Wydad de Fès) consumes the club name inside it'
);

select extensions.is(
  pg_temp.clubs('فوز ثمين للوداد في آخر الجولات'),
  array['tagging-wydad'],
  'an attached ل still names the club'
);

select extensions.is(
  pg_temp.clubs('الرجاء يستعد لمباراته بالزمامرة'),
  array['tagging-raja'],
  'a town after ب is a venue, not its club'
);

select extensions.is(
  pg_temp.clubs('تعادل الرجاء والزمامرة في مباراة مثيرة'),
  array['tagging-raja', 'tagging-zemamra'],
  'a town after و is its club'
);

select extensions.is(
  pg_temp.clubs('الرجاء يواجه الوداد في الزمامرة'),
  array['tagging-raja', 'tagging-wydad'],
  '"in Zemamra" is a borrowed stadium, not the club'
);

select extensions.is(
  pg_temp.clubs('الوداد يستقبل ا.طنجة يوم الأحد'),
  array['tagging-tanger', 'tagging-wydad'],
  'a fixture-list abbreviation matches without its space'
);

select extensions.is(
  pg_temp.clubs('لا طنجة ولا الرباط تحتضن النهائي'),
  array[]::text[],
  'the abbreviation does not match inside ordinary words'
);

select extensions.is(
  pg_temp.clubs('الجيش الرواندي يتأهل إلى الدور المقبل'),
  array[]::text[],
  'a foreign army club is not FAR'
);

-- Contrived on purpose: two back-to-back occurrences share the space between
-- them, which a single replace() leaves behind.
select extensions.is(
  pg_temp.clubs('الوداد الفاسي الوداد الفاسي'),
  array[]::text[],
  'a phrase repeated back to back is consumed every time'
);

select extensions.is(
  pg_temp.clubs('المنتخب الوطني يستعد لكأس إفريقيا'),
  array[]::text[],
  'a headline naming no club is tagged with none'
);

-- ---------------------------------------------------------------------
-- 3. The trigger keeps a story's tags in step with its headlines
-- ---------------------------------------------------------------------
insert into app.stories (id, origin, original_language, canonical_url, content_fingerprint)
values
  ('7a9a0000-0000-4000-8000-000000005001', 'provider', 'ar',
    'https://example.test/tagging/one', repeat('7', 64)),
  ('7a9a0000-0000-4000-8000-000000005002', 'provider', 'ar',
    'https://example.test/tagging/editor', repeat('8', 64));

insert into app.article_editions (
  story_id, language, slug, title, summary, body_format, body_source, body_html,
  reading_time_minutes, sanitizer_version
)
values (
  '7a9a0000-0000-4000-8000-000000005001', 'ar', 'tagging-one-ar',
  'الوداد يتعاقد مع مهاجم جديد',
  'ملخص قصير كتب لهذا الاختبار فقط.',
  'rich_text', null, '<p>نص قصير كتب لهذا الاختبار فقط.</p>', 1, 'tagging-test-v1'
);

select extensions.is(
  pg_temp.story_clubs('7a9a0000-0000-4000-8000-000000005001'),
  array['tagging-wydad:headline'],
  'a new edition tags its story, marked as the tagger''s row'
);

select extensions.ok(
  exists (
    select 1 from app.article_search_documents document
    where document.story_id = '7a9a0000-0000-4000-8000-000000005001'
      and document.search_vector @@ plainto_tsquery('simple', 'casablanca')
  ),
  'the club''s name reaches the story''s search document'
);

update app.article_editions set title = 'الرجاء يتعاقد مع مهاجم جديد'
where story_id = '7a9a0000-0000-4000-8000-000000005001' and language = 'ar';

select extensions.is(
  pg_temp.story_clubs('7a9a0000-0000-4000-8000-000000005001'),
  array['tagging-raja:headline'],
  'a new title replaces the old club with the new one'
);

insert into app.article_editions (
  story_id, language, slug, title, summary, body_format, body_source, body_html,
  reading_time_minutes, sanitizer_version
)
values (
  '7a9a0000-0000-4000-8000-000000005001', 'fr', 'tagging-one-fr',
  'Le Raja et le Wydad se neutralisent',
  'Un court résumé écrit pour ce test.',
  'rich_text', null, '<p>Un court texte écrit pour ce test.</p>', 1, 'tagging-test-v1'
);

select extensions.is(
  pg_temp.story_clubs('7a9a0000-0000-4000-8000-000000005001'),
  array['tagging-raja:headline', 'tagging-wydad:headline'],
  'every language''s headline counts for the story'
);

delete from app.article_editions
where story_id = '7a9a0000-0000-4000-8000-000000005001' and language = 'fr';

select extensions.is(
  pg_temp.story_clubs('7a9a0000-0000-4000-8000-000000005001'),
  array['tagging-raja:headline'],
  'removing an edition removes the clubs only it named'
);

-- With the row removed by hand, only a real title change may bring it back.
delete from app.story_teams where story_id = '7a9a0000-0000-4000-8000-000000005001';

update app.article_editions set summary = 'ملخص آخر كتب لهذا الاختبار فقط.', title = title
where story_id = '7a9a0000-0000-4000-8000-000000005001';

select extensions.is(
  pg_temp.story_clubs('7a9a0000-0000-4000-8000-000000005001'),
  array[]::text[],
  'saving an edition without changing its title does not re-tag'
);

-- ---------------------------------------------------------------------
-- 4. A story an editor has tagged is left alone
-- ---------------------------------------------------------------------
insert into app.story_teams (story_id, team_id)
values ('7a9a0000-0000-4000-8000-000000005002', '7a9a0000-0000-4000-8000-00000000a005');

select extensions.is(
  pg_temp.story_clubs('7a9a0000-0000-4000-8000-000000005002'),
  array['tagging-far:editor'],
  'a row written without saying who wrote it is an editor''s'
);

insert into app.article_editions (
  story_id, language, slug, title, summary, body_format, body_source, body_html,
  reading_time_minutes, sanitizer_version
)
values (
  '7a9a0000-0000-4000-8000-000000005002', 'ar', 'tagging-editor-ar',
  'الرجاء يفوز على الوداد في الديربي',
  'ملخص قصير كتب لهذا الاختبار فقط.',
  'rich_text', null, '<p>نص قصير كتب لهذا الاختبار فقط.</p>', 1, 'tagging-test-v1'
);

select extensions.is(
  pg_temp.story_clubs('7a9a0000-0000-4000-8000-000000005002'),
  array['tagging-far:editor'],
  'the tagger adds nothing to a story an editor has tagged'
);

select * from app_private.news_retag_all_story_teams();

select extensions.is(
  pg_temp.story_clubs('7a9a0000-0000-4000-8000-000000005002'),
  array['tagging-far:editor'],
  'and the full re-tag does not touch it either'
);

-- ---------------------------------------------------------------------
-- 5. The full re-tag restores what is missing and is idempotent
-- ---------------------------------------------------------------------
select extensions.is(
  pg_temp.story_clubs('7a9a0000-0000-4000-8000-000000005001'),
  array['tagging-raja:headline'],
  'the full re-tag restores a story''s missing club'
);

select extensions.results_eq(
  'select stories, tagged_stories, headline_rows from app_private.news_retag_all_story_teams()',
  $$values (2, 1, 1)$$,
  'it reports stories read, stories tagged from headlines and the tagger''s rows'
);

create temporary table tagging_before as
select story_id, team_id, tagged_by, created_at from app.story_teams;

select * from app_private.news_retag_all_story_teams();

select extensions.bag_eq(
  'select story_id, team_id, tagged_by, created_at from app.story_teams',
  'select story_id, team_id, tagged_by, created_at from tagging_before',
  'a second run changes nothing, created_at included'
);

-- ---------------------------------------------------------------------
-- 6. Deleting a story is not blocked by the tagger
-- ---------------------------------------------------------------------
-- The editor-tagged story: its edition was never updated, so it has no
-- article_revisions row holding it in place.
select extensions.lives_ok(
  $$delete from app.article_editions where story_id = '7a9a0000-0000-4000-8000-000000005002'$$,
  'a story''s edition can still be deleted'
);

select extensions.lives_ok(
  $$delete from app.stories where id = '7a9a0000-0000-4000-8000-000000005002'$$,
  'and then the story itself'
);

select extensions.is(
  (select count(*)::integer from app.story_teams
    where story_id = '7a9a0000-0000-4000-8000-000000005002'),
  0,
  'and its club rows go with it'
);

select * from extensions.finish();

rollback;
