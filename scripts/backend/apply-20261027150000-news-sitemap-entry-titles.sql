-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261027150000_news_sitemap_entry_titles: each sitemap entry
-- carries its edition's title, for the Google News sitemap
-- (/sitemaps/news-recent.xml, SEO pass 1, 2026-10-27).
--
-- WHEN
--   Any time after the pull request that adds this file is merged. It only
--   re-creates app_private.news_sitemap_compute (same body plus the title) and
--   writes no table, so no job needs pausing (AGENTS.md: the sitemap jobs are
--   paused for a write to the snapshot table or cron.job_run_details, and this
--   is neither). The next `news-sitemap-refresh` run, within a minute, puts the
--   titles in the snapshot.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Make sure no other database work is running right now.
--   2. Paste this WHOLE file and press Run. As shipped it is a REHEARSAL:
--      applied inside one transaction, checked, then ROLLED BACK. The result
--      row should say "Rehearsal passed".
--   3. Change the line `rollback;` near the bottom to `commit;` and run again.
--      The result row should say "Applied".
--   If a check fails the script stops with a message and nothing is saved. Do
--   not edit a check to make it pass.
--
-- WHAT IT DOES
--   * refuses to run twice, before 20260926003050, or where
--     news_sitemap_compute is not the version 20260926003050 left (md5 of its
--     definition as production held it on 2026-10-27);
--   * reads the entries once with the current version and keeps a fingerprint
--     of them;
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result: every entry has a title key and the same keys as
--     before otherwise, the same editions in the same order with the same
--     values once the title is set aside, visitors still cannot call the
--     computation, the public read still answers, and the whole computation
--     runs in under two seconds.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local timezone = 'UTC';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261027150000') then
    raise exception 'stop: migration 20261027150000 is already recorded as applied';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260926003050') then
    raise exception 'stop: migration 20260926003050 (the sitemap snapshot) is not applied -- this update follows it';
  end if;
  if to_regprocedure('app_private.news_sitemap_compute(integer)') is null then
    raise exception 'stop: app_private.news_sitemap_compute(integer) does not exist';
  end if;
  if md5(pg_get_functiondef('app_private.news_sitemap_compute(integer)'::regprocedure))
    is distinct from '89225b852b1e37726a12d49aff9d512d' then
    raise exception 'stop: app_private.news_sitemap_compute is not the version 20260926003050 left -- something changed it since';
  end if;
end
$preflight$;

-- The entries as the current version computes them, kept for the postflight.
select set_config(
  'botolago.sitemap_before',
  md5(app_private.news_sitemap_compute(49990)::text),
  true
);

-- ---------------------------------------------------------------------------
-- Migration 20261027150000, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261027150000',
  'news_sitemap_entry_titles',
  array[$bg_20261027150000_file$-- BotolaGO Production V2
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
$bg_20261027150000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261027150000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261027150000'
  );
begin
  if encode(sha256(convert_to(part_20261027150000, 'UTF8')), 'hex')
    is distinct from '0b06a5a7caa749eca2c84777926bf96548fdca96ba1f5774e38b3c1d88038e9d' then
    raise exception 'stop: 20261027150000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261027150000;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  computation constant regprocedure := 'app_private.news_sitemap_compute(integer)'::regprocedure;
  entries jsonb;
  without_title text;
  started timestamptz;
  took_ms numeric;
begin
  if pg_get_functiondef(computation) ~ 'news_is_public\(|news_content_updated_at\(|news_story_is_publishable\(' then
    problems := problems || 'the computation calls a per-edition helper again'::text;
  end if;
  if has_function_privilege('anon', computation, 'execute')
    or has_function_privilege('authenticated', computation, 'execute')
    or has_function_privilege('service_role', computation, 'execute') then
    problems := problems || 'the computation is reachable from the API'::text;
  end if;
  if not has_function_privilege('anon', 'api.news_sitemap_entries(integer)', 'execute') then
    problems := problems || 'visitors can no longer call the sitemap'::text;
  end if;

  started := clock_timestamp();
  entries := app_private.news_sitemap_compute(49990);
  took_ms := round(extract(epoch from clock_timestamp() - started) * 1000);
  if took_ms >= 2000 then
    problems := problems || ('the computation took ' || took_ms || ' ms; expected well under 2000');
  end if;
  if exists (
    select 1 from jsonb_array_elements(entries) entry
    where (select array_agg(key order by key) from jsonb_object_keys(entry) key)
      <> array['contentUpdatedAt', 'id', 'language', 'publishedAt', 'slug', 'title', 'translations', 'updatedAt']
  ) then
    problems := problems || 'an entry does not have exactly the old keys plus title'::text;
  end if;
  select coalesce(jsonb_agg(entry - 'title' order by ordinality), '[]'::jsonb)::text into without_title
  from jsonb_array_elements(entries) with ordinality as listed(entry, ordinality);
  if md5(without_title) is distinct from current_setting('botolago.sitemap_before', true) then
    problems := problems || ('with the title set aside the entries differ from before (' || jsonb_array_length(entries)
      || ' entries; an article published this very second would explain it: run again)');
  end if;
  if (select count(*) from jsonb_array_elements(entries) entry where nullif(btrim(entry ->> 'title'), '') is null) > 0 then
    raise notice 'sitemap: some editions have no title; news-recent leaves them out';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261027150000') then
    problems := problems || 'history row missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
  raise notice 'sitemap: % entries, computed in % ms, all with a title key, otherwise unchanged',
    jsonb_array_length(entries), took_ms;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261027150000')
    then 'Applied. The next news-sitemap-refresh run (within a minute) puts the titles in the snapshot.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
