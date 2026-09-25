-- BotolaGO Production V2
-- The sitemap is set-based again: /sitemap.xml answered 503 on every request
-- from 2026-09-25 07:00 UTC (re-check audit, 2026-09-25, B1).
--
-- 20260924163000_news_sitemap_licensed rewrote api.news_sitemap_entries
-- set-based (~0.2 s for the 15,690 public editions). 20260924200600, written
-- before it and renumbered after it (3e778ac), replaced the function with its
-- own edit of the version before that: app_private.news_is_public() once per
-- edition and again per counterpart. Both helpers it reaches are SECURITY
-- DEFINER and are not inlined, so on production the call took 8.4 s against
-- the 3 s anon statement timeout, and the route failed closed with 503.
--
-- This is 20260924163000's body with 20260924200600's one addition,
-- `contentUpdatedAt`, taken from a grouped read of app.article_revisions for
-- the listed editions only. Measured on production, read-only, on
-- 2026-09-25 at about 07:45 UTC: 8,424 ms before, 213 ms after, and the answer for
-- all 15,690 editions byte for byte the same (md5
-- 477310ae98008428e5a9ab0abc579468 both ways).
--
-- Same signature, same grants, same answer: the route needs no change.

create or replace function api.news_sitemap_entries(p_limit integer default 5000)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with public_edition as (
    select edition.id, edition.story_id, edition.language, edition.slug,
      edition.published_at, edition.updated_at
    from app.article_editions edition
    join app.stories story on story.id = edition.story_id and story.deleted_at is null
    left join app.publishers publisher on publisher.id = story.publisher_id
    where edition.status = 'published'
      and edition.visibility = 'public'
      and edition.published_at is not null
      and edition.published_at <= statement_timestamp()
      and not (
        story.import_converted_at is null
        and exists (
          select 1 from app.article_editions legacy
          where legacy.story_id = story.id
            and legacy.sanitizer_version in ('gnews-excerpt-v1', 'elbotola-link-v1')
        )
      )
      and (
        publisher.id is null
        or publisher.source_type = 'internal'
        or publisher.slug = 'botolago'
        or publisher.slug like 'botolago-%'
        or publisher.syndication_licensed_at is not null
        or story.import_converted_at is not null
      )
  ),
  listed as (
    select * from public_edition
    order by published_at desc, id desc
    limit least(greatest(coalesce(p_limit, 5000), 1), 50000)
  ),
  translations as (
    select listed.id, jsonb_agg(jsonb_build_object(
      'id', sibling.id, 'language', sibling.language
    ) order by sibling.language) as value
    from listed
    join public_edition sibling on sibling.story_id = listed.story_id and sibling.id <> listed.id
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
    'publishedAt', listed.published_at,
    'updatedAt', listed.updated_at,
    'contentUpdatedAt', greatest(listed.published_at, last_revision.created_at),
    'translations', coalesce(translations.value, '[]'::jsonb)
  ) order by listed.published_at desc, listed.id desc), '[]'::jsonb)
  from listed
  left join translations on translations.id = listed.id
  left join last_revision on last_revision.article_edition_id = listed.id
$$;

comment on function api.news_sitemap_entries(integer) is
  'Every public, listed edition (and its public counterparts) for /sitemap.xml: the same set app_private.news_is_public() allows. Never returns drafts, scheduled, unpublished, archived, unlisted, legacy-import or unlicensed third-party editions. Set-based: it must answer inside the 3 s anon statement timeout for the whole archive.';
