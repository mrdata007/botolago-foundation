-- News: licensed syndication (20260924100000, 20260924163000). A licensed
-- publisher's stories carry their source; nobody else's do; and the sitemap
-- advertises BotolaGO's own stories and licensed ones, never unlicensed ones.
begin;

select extensions.no_plan();

insert into app.publishers (id, slug, name, name_ar, source_type, trust_status, website_url,
  syndication_licensed_at, syndication_license_note)
values
  ('98100000-0000-4000-8000-000000000001', 'qa-licensed', 'QA Licensed', 'مصدر مرخص', 'provider',
   'trusted', 'https://licensed.example/', statement_timestamp(), 'QA: permission to republish our articles.'),
  ('98100000-0000-4000-8000-000000000002', 'qa-unlicensed', 'QA Unlicensed', null, 'provider',
   'trusted', 'https://unlicensed.example/', null, null),
  ('98100000-0000-4000-8000-000000000003', 'botolago-qa', 'BotolaGO QA', null, 'internal',
   'trusted', null, null, null);

insert into app.stories (id, origin, original_language, publisher_id, canonical_url) values
  ('98200000-0000-4000-8000-000000000001', 'partner', 'ar', '98100000-0000-4000-8000-000000000001',
   'https://licensed.example/article/1.html'),
  ('98200000-0000-4000-8000-000000000002', 'provider', 'fr', '98100000-0000-4000-8000-000000000002',
   'https://unlicensed.example/article/2.html'),
  ('98200000-0000-4000-8000-000000000003', 'manual', 'fr', '98100000-0000-4000-8000-000000000003', null),
  ('98200000-0000-4000-8000-000000000004', 'manual', 'fr', null, null),
  ('98200000-0000-4000-8000-000000000005', 'partner', 'fr', '98100000-0000-4000-8000-000000000001', null);

insert into app.article_editions (
  id, story_id, language, slug, title, summary, body_format, body_source, body_html,
  status, visibility, published_at, reading_time_minutes, sanitizer_version
)
select id::uuid, story::uuid, language::app.language_code, slug, title,
  'Résumé suffisamment long pour le test.', 'rich_text', null,
  '<p>Corps de l’article pour le test.</p>', 'published', 'public',
  statement_timestamp() - interval '1 hour', 1, 'sanitize-html@2.17.5'
from (values
  ('98300000-0000-4000-8000-000000000001', '98200000-0000-4000-8000-000000000001', 'ar', 'qa-syndicated-ar', 'مقال مرخص للاختبار'),
  ('98300000-0000-4000-8000-000000000002', '98200000-0000-4000-8000-000000000001', 'fr', 'qa-syndicated-fr', 'Article sous licence'),
  ('98300000-0000-4000-8000-000000000003', '98200000-0000-4000-8000-000000000002', 'fr', 'qa-unlicensed-fr', 'Article non licencié'),
  ('98300000-0000-4000-8000-000000000004', '98200000-0000-4000-8000-000000000003', 'fr', 'qa-own-publisher', 'Article BotolaGO maison'),
  ('98300000-0000-4000-8000-000000000005', '98200000-0000-4000-8000-000000000004', 'fr', 'qa-own-cms', 'Article écrit dans le CMS'),
  ('98300000-0000-4000-8000-000000000006', '98200000-0000-4000-8000-000000000005', 'fr', 'qa-syndicated-no-original', 'Article sous licence sans lien')
) fixture(id, story, language, slug, title);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  api.news_article_detail('ar', 'qa-syndicated-ar') -> 'source',
  '{"name": "مصدر مرخص", "url": "https://licensed.example/article/1.html"}'::jsonb,
  'an Arabic licensed edition names its source in Arabic and links the original'
);
select is(
  api.news_article_detail('fr', 'qa-syndicated-fr') -> 'source',
  '{"name": "QA Licensed", "url": "https://licensed.example/article/1.html"}'::jsonb,
  'a French licensed edition names its source and links the story''s original'
);
select is(
  api.news_article_detail('fr', 'qa-syndicated-no-original') -> 'source',
  '{"name": "QA Licensed", "url": null}'::jsonb,
  'without a known original, the source is named but no homepage is passed off as the original'
);
select is(
  api.news_article_detail('fr', 'qa-unlicensed-fr') -> 'source',
  'null'::jsonb,
  'an unlicensed third-party story carries no source attribution'
);
select is(
  api.news_article_detail('fr', 'qa-own-publisher') -> 'source',
  'null'::jsonb,
  'BotolaGO''s own publisher carries no source attribution'
);
select is(
  api.news_article_detail('fr', 'qa-own-cms') -> 'source',
  'null'::jsonb,
  'a CMS story without publisher carries no source attribution'
);
select ok(
  exists (
    select 1 from jsonb_array_elements((api.news_feed('fr') -> 'items')) item
    where item ->> 'id' = '98300000-0000-4000-8000-000000000002' and item -> 'source' ->> 'name' = 'QA Licensed'
  ),
  'feed cards carry the source too'
);

select is(
  (select array_agg(entry ->> 'slug' order by entry ->> 'slug')
   from jsonb_array_elements(api.news_sitemap_entries()) entry
   where entry ->> 'slug' like 'qa-%'),
  array['qa-own-cms', 'qa-own-publisher', 'qa-syndicated-ar', 'qa-syndicated-fr',
        'qa-syndicated-no-original'],
  'the sitemap lists BotolaGO''s own and licensed stories, never unlicensed third-party ones'
);
select is(
  (select entry -> 'translations'
   from jsonb_array_elements(api.news_sitemap_entries()) entry
   where entry ->> 'slug' = 'qa-syndicated-ar'),
  jsonb_build_array(jsonb_build_object('id', '98300000-0000-4000-8000-000000000002', 'language', 'fr')),
  'a licensed Arabic edition lists its French counterpart'
);
select is(
  (select entry -> 'translations'
   from jsonb_array_elements(api.news_sitemap_entries(1)) entry),
  (select entry -> 'translations'
   from jsonb_array_elements(api.news_sitemap_entries()) entry
   where entry ->> 'id' = (api.news_sitemap_entries(1) -> 0 ->> 'id')),
  'a small limit still lists every counterpart of the editions it returns'
);

-- The sitemap spells out news_is_public() set-based for speed; it must pick
-- exactly the editions the reference predicate picks.
reset role;
select set_eq(
  $$select (entry ->> 'id')::uuid from jsonb_array_elements(api.news_sitemap_entries(50000)) entry$$,
  $$select edition.id from app.article_editions edition
    join app.stories story on story.id = edition.story_id
    left join app.publishers publisher on publisher.id = story.publisher_id
    where edition.visibility = 'public' and app_private.news_is_public(edition)
      and (publisher.id is null or publisher.slug = 'botolago' or publisher.slug like 'botolago-%'
           or publisher.syndication_licensed_at is not null)$$,
  'the sitemap lists exactly the public editions app_private.news_is_public() allows'
);

select throws_ok(
  $$update app.publishers set syndication_licensed_at = statement_timestamp()
    where slug = 'qa-unlicensed'$$,
  '23514', null,
  'a licence cannot be recorded without the permission text'
);
select throws_ok(
  $$update app.publishers set syndication_license_note = 'Permission text without a date.'
    where slug = 'qa-unlicensed'$$,
  '23514', null,
  'permission text cannot be recorded without the licence date'
);
select throws_ok(
  $$update app.publishers set name_ar = '  '
    where slug = 'qa-unlicensed'$$,
  '23514', null,
  'a blank Arabic name is refused'
);

select * from finish();
rollback;
