-- BotolaGO Production V2
-- Phase 4E: covering indexes for hosted foreign-key advisor findings.
-- Empty staging reports these as unused until representative editorial traffic;
-- retain them for FK validation, account cleanup, and operational correction.

create index article_editions_created_by_idx on app.article_editions (created_by)
  where created_by is not null;
create index article_editions_updated_by_idx on app.article_editions (updated_by)
  where updated_by is not null;
create index article_editions_hero_asset_idx on app.article_editions (hero_asset_id)
  where hero_asset_id is not null;
create index article_revisions_changed_by_idx on app.article_revisions (changed_by)
  where changed_by is not null;
create index authors_avatar_asset_idx on app.authors (avatar_asset_id)
  where avatar_asset_id is not null;
create index publishers_logo_asset_idx on app.publishers (logo_asset_id)
  where logo_asset_id is not null;
create index stories_created_by_idx on app.stories (created_by)
  where created_by is not null;
create index editorial_placements_created_by_idx on app.editorial_placements (created_by)
  where created_by is not null;

create index editorial_memberships_granted_by_idx
  on app_private.editorial_memberships (granted_by)
  where granted_by is not null;
create index editorial_audit_events_story_idx
  on app_private.editorial_audit_events (story_id, occurred_at desc, id desc)
  where story_id is not null;
create index news_source_articles_edition_idx
  on app_private.news_source_articles (article_edition_id, publisher_id, external_id);
create index news_duplicate_decisions_candidate_story_idx
  on app_private.news_duplicate_decisions (candidate_story_id, decided_at desc, id)
  where candidate_story_id is not null;
create index news_duplicate_decisions_matched_story_idx
  on app_private.news_duplicate_decisions (matched_story_id, decided_at desc, id)
  where matched_story_id is not null;
create index news_duplicate_decisions_decided_by_idx
  on app_private.news_duplicate_decisions (decided_by, decided_at desc, id)
  where decided_by is not null;
