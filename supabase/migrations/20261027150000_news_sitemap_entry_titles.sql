-- BotolaGO Production V2
-- News: the sitemap entries carry each edition's title, for the Google News
-- sitemap (/sitemaps/news-recent.xml; SEO brief 2026-10-27, Bug 7).
--
-- Google News requires <news:title> on every <url>. api.news_sitemap_entries
-- listed id, language, slug, dates and counterparts, but no title. This adds
-- one key, 'title' (app.article_editions.title, already public on the article
-- page), to each entry and changes nothing else:
--
--   * app_private.news_sitemap_compute(p_limit) is re-created from
--     20260926003050 with `edition.title` read in `eligible` and 'title' in
--     the JSON. Same joins, same conditions, same order, same limit, same
--     pinned time zone, still set-based (no per-edition helper call).
--   * api.news_sitemap_entries(p_limit), news_sitemap_refresh(), the snapshot
--     table, the 120-second freshness rule, the cron jobs and the ops health
--     check are NOT touched: the public function returns the snapshot payload
--     (or the live computation) as it is, so the titles flow through both.
--   * Grants are identical to 20260926003050: execute for postgres only.
--
-- Rollout. Until the snapshot is next refreshed (the job runs every minute and
-- a changed payload is swapped in at once) the snapshot still holds entries
-- without a title. The site treats an entry without a title as absent from
-- news-recent, never invents one, so it behaves the same before and after
-- this is applied.
--
-- Pause / refresh by hand: see the notes at the end of 20260926003050.

create or replace function app_private.news_sitemap_compute(p_limit integer)
returns jsonb
language sql
stable
set search_path = ''
-- The timestamps are rendered as text inside the JSON, and that text follows
-- the session's time zone. Pinned, so a refresh from pg_cron and one from the
-- SQL editor produce the same payload (production's default is UTC anyway).
set timezone = 'UTC'
as $$
  with eligible as (
    select edition.id, edition.story_id, edition.language, edition.slug,
      edition.title, edition.published_at, edition.updated_at
    from app.article_editions edition
    -- news_story_is_publishable: the story exists and is not deleted ...
    join app.stories story on story.id = edition.story_id
    left join app.publishers publisher on publisher.id = story.publisher_id
    -- news_is_public, for the sitemap's visibility = 'public'.
    where edition.status = 'published'
      and edition.visibility = 'public'
      and edition.published_at is not null
      and edition.published_at <= statement_timestamp()
      and story.deleted_at is null
      -- ... is BotolaGO's own, licensed, or explicitly converted ...
      and (
        publisher.id is null
        or publisher.source_type = 'internal'
        or publisher.slug = 'botolago'
        or publisher.slug like 'botolago-%'
        or publisher.syndication_licensed_at is not null
        or story.import_converted_at is not null
      )
      -- ... and is not an unconverted legacy import
      -- (news_story_is_legacy_import; article_editions_legacy_import_idx).
      and not (
        story.import_converted_at is null
        and exists (
          select 1 from app.article_editions legacy
          where legacy.story_id = story.id
            and legacy.sanitizer_version in ('gnews-excerpt-v1', 'elbotola-link-v1')
        )
      )
  ),
  listed as (
    select * from eligible
    order by published_at desc, id desc
    limit least(greatest(coalesce(p_limit, 50000), 1), 50000)
  ),
  -- Counterparts: the other public editions of the same story, from the same
  -- eligible set (every one of them, also past the limit).
  translations as (
    select listed.id, jsonb_agg(jsonb_build_object(
      'id', sibling.id, 'language', sibling.language
    ) order by sibling.language) as value
    from listed
    join eligible sibling on sibling.story_id = listed.story_id and sibling.id <> listed.id
    group by listed.id
  ),
  -- What app_private.news_content_updated_at answers, as one grouped read:
  -- the latest real change to each listed edition's text or status.
  last_revision as (
    select revision.article_edition_id, max(revision.created_at) as created_at
    from app.article_revisions revision
    where revision.article_edition_id in (select listed.id from listed)
    group by revision.article_edition_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', listed.id,
    'language', listed.language,
    'slug', listed.slug,
    'title', listed.title,
    'publishedAt', listed.published_at,
    'updatedAt', listed.updated_at,
    'contentUpdatedAt', greatest(listed.published_at, last_revision.created_at),
    'translations', coalesce(translations.value, '[]'::jsonb)
  ) order by listed.published_at desc, listed.id desc), '[]'::jsonb)
  from listed
  left join translations on translations.id = listed.id
  left join last_revision on last_revision.article_edition_id = listed.id
$$;

revoke all on function app_private.news_sitemap_compute(integer)
  from public, anon, authenticated, service_role;
grant execute on function app_private.news_sitemap_compute(integer) to postgres;
comment on function app_private.news_sitemap_compute(integer) is
  'The sitemap entries (newest first, at most p_limit and never more than 50,000), computed set-based: exactly the editions with visibility public that app_private.news_is_public() allows, each with its title and its public counterparts. Read by news_sitemap_refresh() and, when the snapshot is missing or more than 120 seconds old, by api.news_sitemap_entries().';
