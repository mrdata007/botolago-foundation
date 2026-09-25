-- supabase/migrations/20260924190000_news_story_team_translation_check.sql
--
-- A story's clubs come from the headlines of its editions in the story's
-- original language. Another language's headline adds a club only when the
-- original article's text names it too. Every headline and body below is
-- written for this test.
begin;

select extensions.no_plan();

-- ---------------------------------------------------------------------
-- Fixture: five clubs and their aliases (stop phrases come from the
-- tagging migration, which seeds them on every database)
-- ---------------------------------------------------------------------
insert into app.teams (id, slug, name, short_name)
values
  ('7b9b0000-0000-4000-8000-00000000b001', 'check-wydad', 'Wydad Casablanca', 'Wydad'),
  ('7b9b0000-0000-4000-8000-00000000b002', 'check-raja', 'Raja Casablanca', 'Raja'),
  ('7b9b0000-0000-4000-8000-00000000b003', 'check-fus', 'FUS Rabat', 'FUS'),
  ('7b9b0000-0000-4000-8000-00000000b004', 'check-uts', 'UTS Rabat', 'UTS'),
  ('7b9b0000-0000-4000-8000-00000000b005', 'check-yacoub', 'Yacoub El Mansour', 'UYEM');

insert into app_private.news_team_aliases (team_id, alias, kind)
values
  ('7b9b0000-0000-4000-8000-00000000b001', 'Wydad', 'name'),
  ('7b9b0000-0000-4000-8000-00000000b001', 'الوداد', 'name'),
  ('7b9b0000-0000-4000-8000-00000000b002', 'Raja', 'name'),
  ('7b9b0000-0000-4000-8000-00000000b002', 'الرجاء', 'name'),
  ('7b9b0000-0000-4000-8000-00000000b003', 'FUS', 'name'),
  ('7b9b0000-0000-4000-8000-00000000b003', 'الفتح الرياضي', 'name'),
  ('7b9b0000-0000-4000-8000-00000000b004', 'Union Touarga', 'name'),
  ('7b9b0000-0000-4000-8000-00000000b004', 'اتحاد تواركة', 'name'),
  ('7b9b0000-0000-4000-8000-00000000b005', 'Union Yacoub El Mansour', 'name'),
  ('7b9b0000-0000-4000-8000-00000000b005', 'اتحاد يعقوب المنصور', 'name');

create function pg_temp.story_clubs(p_story_id uuid)
returns text[]
language sql
as $$
  select coalesce(array_agg(team.slug || ':' || relation.tagged_by order by team.slug), array[]::text[])
  from app.story_teams relation
  join app.teams team on team.id = relation.team_id
  where relation.story_id = p_story_id
$$;

create function pg_temp.add_story(p_story uuid, p_original text, p_n integer)
returns void
language sql
as $$
  insert into app.stories (id, origin, original_language, canonical_url, content_fingerprint)
  values (p_story, 'provider', p_original::app.language_code,
    'https://example.test/translation-check/' || p_n, repeat(p_n::text, 64))
$$;

create function pg_temp.add_edition(p_story uuid, p_language text, p_slug text, p_title text, p_body text)
returns void
language sql
as $$
  insert into app.article_editions (
    story_id, language, slug, title, summary, body_format, body_source, body_html,
    reading_time_minutes, sanitizer_version
  )
  values (
    p_story, p_language::app.language_code, p_slug, p_title,
    'ملخص قصير كتب لهذا الاختبار فقط.', 'rich_text', null, p_body, 1, 'check-test-v1'
  )
$$;

-- ---------------------------------------------------------------------
-- 1. Who may run the plain-text helper
-- ---------------------------------------------------------------------
select extensions.ok(
  not has_function_privilege('anon', 'app_private.news_edition_plain_text(app.article_editions)', 'execute')
  and not has_function_privilege('authenticated', 'app_private.news_edition_plain_text(app.article_editions)', 'execute')
  and not has_function_privilege('service_role', 'app_private.news_edition_plain_text(app.article_editions)', 'execute'),
  'no API role can run the plain-text helper'
);

-- ---------------------------------------------------------------------
-- 2. A mistranslated club stays out
-- ---------------------------------------------------------------------
-- The Arabic original is about Yacoub El Mansour; its French translation
-- calls the club Union Touarga, which the original never names.
select pg_temp.add_story('7b9b0000-0000-4000-8000-000000006001', 'ar', 1);
select pg_temp.add_edition('7b9b0000-0000-4000-8000-000000006001', 'ar', 'check-yacoub-ar',
  'اتحاد يعقوب المنصور يفوز خارج ملعبه',
  '<p>حقق اتحاد يعقوب المنصور فوزا ثمينا في الجولة الأولى.</p>');
select pg_temp.add_edition('7b9b0000-0000-4000-8000-000000006001', 'fr', 'check-yacoub-fr',
  'L''Union Touarga s''impose à l''extérieur',
  '<p>L''Union Touarga a remporté une victoire précieuse.</p>');

select extensions.is(
  pg_temp.story_clubs('7b9b0000-0000-4000-8000-000000006001'),
  array['check-yacoub:headline'],
  'a club only the translation names is left out'
);

-- ---------------------------------------------------------------------
-- 3. A translation that names the club more plainly counts
-- ---------------------------------------------------------------------
-- The Arabic headline says only "الفتح" (no alias); its body names
-- الفتح الرياضي, and the French headline says FUS.
select pg_temp.add_story('7b9b0000-0000-4000-8000-000000006002', 'ar', 2);
select pg_temp.add_edition('7b9b0000-0000-4000-8000-000000006002', 'ar', 'check-fus-ar',
  'الوداد ينهزم أمام الفتح',
  '<p>انهزم الوداد أمام ضيفه <strong>الفتح الرياضي</strong> في الجولة الأولى.</p>');
select pg_temp.add_edition('7b9b0000-0000-4000-8000-000000006002', 'fr', 'check-fus-fr',
  'Le Wydad battu par le FUS',
  '<p>Le Wydad s''est incliné face au FUS.</p>');

select extensions.is(
  pg_temp.story_clubs('7b9b0000-0000-4000-8000-000000006002'),
  array['check-fus:headline', 'check-wydad:headline'],
  'a club the translation names and the original article also names is added'
);

select extensions.ok(
  (select app_private.news_edition_plain_text(edition) !~ '<'
      and app_private.news_edition_plain_text(edition) like '%الفتح الرياضي%'
    from app.article_editions edition where edition.slug = 'check-fus-ar'),
  'the original is read as plain text: its words without their markup'
);

-- ---------------------------------------------------------------------
-- 4. A stop phrase in the original does not confirm a club
-- ---------------------------------------------------------------------
-- The original's body names الوداد الفاسي (Wydad de Fès, a stop phrase);
-- a translation that says "Wydad" does not make it Wydad Casablanca.
select pg_temp.add_story('7b9b0000-0000-4000-8000-000000006003', 'ar', 3);
select pg_temp.add_edition('7b9b0000-0000-4000-8000-000000006003', 'ar', 'check-stop-ar',
  'الرجاء يتعثر في مباراة ودية',
  '<p>تعادل الرجاء مع الوداد الفاسي في مباراة ودية.</p>');
select pg_temp.add_edition('7b9b0000-0000-4000-8000-000000006003', 'fr', 'check-stop-fr',
  'Le Raja accroché par le Wydad en amical',
  '<p>Le Raja a été tenu en échec.</p>');

select extensions.is(
  pg_temp.story_clubs('7b9b0000-0000-4000-8000-000000006003'),
  array['check-raja:headline'],
  'a club the original names only inside a stop phrase is not confirmed'
);

-- ---------------------------------------------------------------------
-- 5. Without an edition in its original language, every headline counts
-- ---------------------------------------------------------------------
select pg_temp.add_story('7b9b0000-0000-4000-8000-000000006004', 'ar', 4);
select pg_temp.add_edition('7b9b0000-0000-4000-8000-000000006004', 'fr', 'check-fallback-fr',
  'Le Raja prépare son derby',
  '<p>Le Raja se prépare.</p>');

select extensions.is(
  pg_temp.story_clubs('7b9b0000-0000-4000-8000-000000006004'),
  array['check-raja:headline'],
  'a story with no original-language edition is tagged from the others'
);

-- The original edition arrives later: from then on, it decides.
select pg_temp.add_edition('7b9b0000-0000-4000-8000-000000006004', 'ar', 'check-fallback-ar',
  'الوداد يستعد للديربي',
  '<p>يستعد الوداد لمواجهة الديربي.</p>');

select extensions.is(
  pg_temp.story_clubs('7b9b0000-0000-4000-8000-000000006004'),
  array['check-wydad:headline'],
  'once the original arrives, a translation''s club it does not name is dropped'
);

-- ---------------------------------------------------------------------
-- 6. The body decides, and a body edit re-tags
-- ---------------------------------------------------------------------
update app.article_editions
set body_html = '<p>حقق اتحاد يعقوب المنصور فوزا على اتحاد تواركة.</p>'
where story_id = '7b9b0000-0000-4000-8000-000000006001' and language = 'ar';

select extensions.is(
  pg_temp.story_clubs('7b9b0000-0000-4000-8000-000000006001'),
  array['check-uts:headline', 'check-yacoub:headline'],
  'when the original''s body comes to name the translation''s club, it is added'
);

update app.article_editions
set body_html = '<p>حقق اتحاد يعقوب المنصور فوزا ثمينا في الجولة الأولى.</p>'
where story_id = '7b9b0000-0000-4000-8000-000000006001' and language = 'ar';

select extensions.is(
  pg_temp.story_clubs('7b9b0000-0000-4000-8000-000000006001'),
  array['check-yacoub:headline'],
  'and removed when it no longer does'
);

-- ---------------------------------------------------------------------
-- 7. An editor's story is left alone
-- ---------------------------------------------------------------------
select pg_temp.add_story('7b9b0000-0000-4000-8000-000000006005', 'ar', 5);
insert into app.story_teams (story_id, team_id)
values ('7b9b0000-0000-4000-8000-000000006005', '7b9b0000-0000-4000-8000-00000000b004');
select pg_temp.add_edition('7b9b0000-0000-4000-8000-000000006005', 'ar', 'check-editor-ar',
  'اتحاد يعقوب المنصور يفوز',
  '<p>فاز اتحاد يعقوب المنصور.</p>');

select extensions.is(
  pg_temp.story_clubs('7b9b0000-0000-4000-8000-000000006005'),
  array['check-uts:editor'],
  'the rule does not touch a story an editor has tagged'
);

-- ---------------------------------------------------------------------
-- 8. The one-pass re-tag gives the same result as the per-story rule
-- ---------------------------------------------------------------------
create temporary table check_expected as
select story_id, team_id, tagged_by from app.story_teams
where story_id::text like '7b9b0000-%';

delete from app.story_teams
where story_id::text like '7b9b0000-%' and tagged_by = 'headline';

-- A stale row the rule does not want: the full re-tag removes it.
insert into app.story_teams (story_id, team_id, tagged_by)
values ('7b9b0000-0000-4000-8000-000000006001', '7b9b0000-0000-4000-8000-00000000b004', 'headline');

select * from app_private.news_retag_all_story_teams();

select extensions.bag_eq(
  $$select story_id, team_id, tagged_by from app.story_teams where story_id::text like '7b9b0000-%'$$,
  'select story_id, team_id, tagged_by from check_expected',
  'the full re-tag reaches exactly what the per-story rule did'
);

create temporary table check_after as
select story_id, team_id, tagged_by, created_at from app.story_teams;

select * from app_private.news_retag_all_story_teams();

select extensions.bag_eq(
  'select story_id, team_id, tagged_by, created_at from app.story_teams',
  'select story_id, team_id, tagged_by, created_at from check_after',
  'a second full re-tag changes nothing'
);

select * from extensions.finish();

rollback;
