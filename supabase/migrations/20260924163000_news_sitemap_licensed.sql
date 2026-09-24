-- BotolaGO Production V2
-- News: the sitemap lists licensed stories, and is fast enough to serve them.
--
-- Owner decision, 2026-09-24: News is switched on and the licensed ElBotola
-- archive (~15,700 editions) is indexed and listed in the sitemap like
-- BotolaGO's own stories. 20260924100000 limited the sitemap to BotolaGO's own
-- publishers; this widens it to publishers that hold a recorded licence.
-- Unlicensed third-party stories stay out.
--
-- It also rewrites the function set-based. The previous version called
-- app_private.news_is_public() once per edition and again per counterpart;
-- both helpers it reaches are SECURITY DEFINER and are not inlined, so over
-- the imported archive it took ~13 s, far past the 3 s statement timeout
-- PostgREST gives the anon role. Measured against production data in a
-- rolled-back transaction, the version below with the two indexes takes
-- ~0.2 s for all 15,690 editions and returns exactly the same set.
--
-- The filter below spells out app_private.news_is_public() and
-- app_private.news_story_is_publishable() for a public edition: published,
-- dated now or earlier, story not deleted, and not an unconverted legacy
-- import. The pgTAP test compares the two, so they cannot drift silently.

create index if not exists article_editions_legacy_import_idx
  on app.article_editions (story_id)
  where sanitizer_version in ('gnews-excerpt-v1', 'elbotola-link-v1');

create index if not exists article_editions_sitemap_idx
  on app.article_editions (published_at desc, id desc)
  include (story_id, language, slug, updated_at)
  where status = 'published' and visibility = 'public';

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
      -- BotolaGO's own stories, and stories of a publisher with a recorded
      -- licence. Unlicensed third-party stories are never advertised.
      and (
        publisher.id is null
        or publisher.slug = 'botolago'
        or publisher.slug like 'botolago-%'
        or publisher.syndication_licensed_at is not null
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
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', listed.id,
    'language', listed.language,
    'slug', listed.slug,
    'publishedAt', listed.published_at,
    'updatedAt', listed.updated_at,
    'translations', coalesce(translations.value, '[]'::jsonb)
  ) order by listed.published_at desc, listed.id desc), '[]'::jsonb)
  from listed
  left join translations on translations.id = listed.id
$$;

comment on function api.news_sitemap_entries(integer) is
  'Public, listed editions of BotolaGO''s own stories and of licensed publishers'' stories (and their public counterparts) for /sitemap.xml. Never returns drafts, scheduled, unpublished, archived, unlisted, legacy-import or unlicensed third-party editions.';
