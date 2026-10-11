-- Regression suite for 20261011170000_news_article_detail_other_language_id.
begin;
select extensions.no_plan();

insert into app.publishers (id, slug, name, source_type, trust_status)
values ('9e1a0000-0000-4000-8000-0000000000b1', 'xlang-house', 'Xlang House', 'internal', 'trusted');
insert into app.stories (id, original_language, publisher_id) values
  ('9e1a0000-0000-4000-8000-000000000101', 'fr', '9e1a0000-0000-4000-8000-0000000000b1'),
  ('9e1a0000-0000-4000-8000-000000000102', 'fr', '9e1a0000-0000-4000-8000-0000000000b1');
insert into app.article_editions (
  id, story_id, language, slug, title, summary, body_source, body_html,
  status, visibility, published_at, reading_time_minutes, sanitizer_version
) values
  ('9e1a0000-0000-4000-8000-000000000201', '9e1a0000-0000-4000-8000-000000000101', 'fr',
   'xlang-fr', 'Un titre français de test', 'Un résumé assez long pour passer.',
   repeat('Corps du texte. ', 4), '<p>Corps du texte.</p>',
   'published', 'public', '2026-10-10T18:30:00Z', 1, 'sanitize-html@2.17.0'),
  ('9e1a0000-0000-4000-8000-000000000202', '9e1a0000-0000-4000-8000-000000000101', 'ar',
   'xlang-ar', 'عنوان عربي للاختبار', 'ملخص طويل بما يكفي للاختبار.',
   repeat('نص المقال. ', 6), '<p>نص المقال.</p>',
   'published', 'public', '2026-10-10T18:30:00Z', 1, 'sanitize-html@2.17.0'),
  -- A story with a French edition only.
  ('9e1a0000-0000-4000-8000-000000000203', '9e1a0000-0000-4000-8000-000000000102', 'fr',
   'xlang-only-fr', 'Un autre titre français', 'Un résumé assez long pour passer.',
   repeat('Corps du texte. ', 4), '<p>Corps du texte.</p>',
   'published', 'public', '2026-10-10T18:30:00Z', 1, 'sanitize-html@2.17.0');

select extensions.is(api.news_article_detail('ar', '9e1a0000-0000-4000-8000-000000000201') ->> 'id',
  '9e1a0000-0000-4000-8000-000000000202',
  'the French edition id opened in Arabic serves the Arabic edition');
select extensions.is(api.news_article_detail('fr', '9e1a0000-0000-4000-8000-000000000202') ->> 'id',
  '9e1a0000-0000-4000-8000-000000000201',
  'and the other way round');
select extensions.is(api.news_article_detail('fr', '9e1a0000-0000-4000-8000-000000000201') ->> 'id',
  '9e1a0000-0000-4000-8000-000000000201', 'the same language is unchanged');
select extensions.is(api.news_article_detail('ar', '9e1a0000-0000-4000-8000-000000000203') ->> 'id',
  '9e1a0000-0000-4000-8000-000000000203',
  'without an Arabic edition the named French edition is served, not a 404');
select extensions.throws_ok(
  $$select api.news_article_detail('ar', 'xlang-fr')$$,
  'PGRST', null, 'a slug stays language-specific');
select extensions.throws_ok(
  $$select api.news_article_detail('ar', '9e1a0000-0000-4000-8000-0000000009ff')$$,
  'PGRST', null, 'an unknown id is still not found');

select * from extensions.finish();
rollback;
