-- BotolaGO Production V2
-- Phase 4D: editorial media bucket and indexes for documented read paths.

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'news-media', 'news-media', true, 10485760,
  array['image/avif', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table app.media_assets is
  'Trusted Football and Editorial media. news-media objects are server/editorial-write only; public delivery is read-only.';

-- No storage.objects INSERT/UPDATE/DELETE policies are created for news-media.
-- The service role bypasses RLS for reviewed uploads; browsers cannot upload.

create index article_editions_public_feed_idx
  on app.article_editions (language, published_at desc, id desc)
  include (story_id, slug, title, summary, hero_asset_id, reading_time_minutes)
  where status = 'published' and visibility = 'public';
create index article_editions_story_status_idx
  on app.article_editions (story_id, status, language, id);
create index article_editions_schedule_idx
  on app.article_editions (scheduled_at, id)
  where status = 'scheduled';
create index stories_publisher_created_idx
  on app.stories (publisher_id, created_at desc, id)
  where deleted_at is null;
create index stories_author_created_idx
  on app.stories (author_id, created_at desc, id)
  where deleted_at is null;
create index editorial_placements_window_idx
  on app.editorial_placements (language, placement_type, starts_at, ends_at, priority, id);
create index taxonomies_active_browse_idx
  on app.taxonomies (taxonomy_type, active, display_order, slug, id);
create index taxonomy_translations_language_idx
  on app.taxonomy_translations (language, display_name, taxonomy_id);

grant usage on type app.article_body_format, app.publication_status, app.article_visibility,
  app.placement_type, app.placement_scope
to authenticated;
grant usage on schema app_private to service_role;
grant usage on type app_private.news_ingestion_status, app_private.news_rejection_reason
to service_role;

-- Retain the deny-by-default invariant after explicit type resolution grants.
revoke all on all tables in schema app_private from service_role;
revoke all on all sequences in schema app_private from service_role;

comment on index app.article_editions_public_feed_idx is
  'Covers public language feed keyset pagination without scanning drafts or private editions.';
