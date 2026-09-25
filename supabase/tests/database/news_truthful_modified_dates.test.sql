-- Regression suite for 20260924200600_news_truthful_modified_dates.
begin;
select extensions.no_plan();

insert into app.publishers (id, slug, name, source_type, trust_status)
values ('9d1a0000-0000-4000-8000-0000000000b1', 'dates-house', 'Dates House', 'internal', 'trusted');
insert into app.stories (id, original_language, publisher_id)
values ('9d1a0000-0000-4000-8000-000000000101', 'fr', '9d1a0000-0000-4000-8000-0000000000b1');
insert into app.article_editions (
  id, story_id, language, slug, title, summary, body_source, body_html,
  status, visibility, published_at, reading_time_minutes, sanitizer_version
) values (
  '9d1a0000-0000-4000-8000-000000000201', '9d1a0000-0000-4000-8000-000000000101', 'fr',
  'dates-article', 'A dated headline for the test', 'A summary long enough to pass.',
  repeat('Body text for the dates test. ', 2), '<p>Body text for the dates test.</p>',
  'published', 'public', '2023-05-14T18:30:00Z', 3, 'sanitize-html@2.17.0'
);

create function pg_temp.detail() returns jsonb language sql as $$
  select api.news_article_detail('fr', '9d1a0000-0000-4000-8000-000000000201')
$$;
-- The sitemap is served from a snapshot pg_cron refreshes every minute
-- (20260926003050); refresh it first, as the job would.
create function pg_temp.sitemap_entry() returns jsonb language plpgsql as $$
begin
  perform app_private.news_sitemap_refresh(true);
  return (select entry from jsonb_array_elements(api.news_sitemap_entries(50000)) entry
    where entry ->> 'id' = '9d1a0000-0000-4000-8000-000000000201');
end;
$$;

select extensions.ok(not has_function_privilege('anon',
  'app_private.news_content_updated_at(app.article_editions)', 'execute'),
  'the helper is internal');

-- Never edited: its publication time.
select extensions.is((pg_temp.detail() ->> 'contentUpdatedAt')::timestamptz,
  '2023-05-14T18:30:00Z'::timestamptz, 'an article never edited reports its publication time');

-- A bookkeeping update (the 2026-09-24 kind) moves updated_at, not the content time.
update app.article_editions set reading_time_minutes = 4, seo_title = 'A dated headline'
where id = '9d1a0000-0000-4000-8000-000000000201';
select extensions.ok((pg_temp.detail() ->> 'updatedAt')::timestamptz > '2026-01-01'::timestamptz,
  'the bookkeeping update moved updatedAt');
select extensions.is((pg_temp.detail() ->> 'contentUpdatedAt')::timestamptz,
  '2023-05-14T18:30:00Z'::timestamptz, 'but not the content time');
select extensions.is((pg_temp.sitemap_entry() ->> 'contentUpdatedAt')::timestamptz,
  '2023-05-14T18:30:00Z'::timestamptz, 'nor the sitemap''s');

-- A real edit of the text moves it.
update app.article_editions set title = 'A dated headline, corrected'
where id = '9d1a0000-0000-4000-8000-000000000201';
select extensions.is((select count(*)::integer from app.article_revisions
  where article_edition_id = '9d1a0000-0000-4000-8000-000000000201'), 1,
  'the edit recorded a revision (the bookkeeping update did not)');
select extensions.is((pg_temp.detail() ->> 'contentUpdatedAt')::timestamptz,
  (select created_at from app.article_revisions
   where article_edition_id = '9d1a0000-0000-4000-8000-000000000201'),
  'a real edit is the new content time');
select extensions.is((pg_temp.sitemap_entry() ->> 'contentUpdatedAt')::timestamptz,
  (select created_at from app.article_revisions
   where article_edition_id = '9d1a0000-0000-4000-8000-000000000201'),
  'in the sitemap too');
select extensions.ok(pg_temp.detail() ? 'updatedAt' and pg_temp.detail() ? 'bodyHtml',
  'the rest of the detail is unchanged');

-- 20260925100000: the sitemap stays set-based. Calling the per-row helpers
-- (SECURITY DEFINER, never inlined) took it to 8.4 s on production, past the
-- 3 s anon timeout, and /sitemap.xml answered 503 until it was rewritten.
select extensions.ok(
  pg_get_functiondef('api.news_sitemap_entries(integer)'::regprocedure)
    !~ 'news_is_public\(|news_content_updated_at\(|news_story_is_publishable\(',
  'the sitemap calls no per-edition helper');
-- 20260926003050 moved the query into app_private.news_sitemap_compute, which
-- the public function calls when the snapshot is missing or stale and the
-- refresh calls every minute: the same holds there.
select extensions.ok(
  pg_get_functiondef('app_private.news_sitemap_compute(integer)'::regprocedure)
    !~ 'news_is_public\(|news_content_updated_at\(|news_story_is_publishable\(',
  'nor does the computation it serves');

select * from extensions.finish();
rollback;
