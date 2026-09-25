-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20260925100000_news_sitemap_set_based_again: /sitemap.xml
-- answers again. Since 2026-09-25 about 07:00 UTC it has answered 503 on every
-- request, because api.news_sitemap_entries took 8.4 s against the 3 s limit
-- visitors' calls get (re-check audit 2026-09-25, B1).
--
-- WHEN
--   Any time, after the pull request that adds this file is merged. Not at
--   minute 12 of an hour (the Fantasy season orchestrator). It touches one
--   News read function and nothing else, so the email, Fantasy and
--   Pronostics jobs do not need pausing.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Make sure no other database work is running right now.
--   2. Paste this WHOLE file and press Run. It takes about 15 seconds.
--      As shipped it is a REHEARSAL: everything is applied inside one
--      transaction, checked, and then ROLLED BACK. The result row should say
--      "Rehearsal passed".
--   3. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied".
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, before 20260924200600, or where
--     api.news_sitemap_entries is not the version this replaces
--     (20260924200600, byte for byte as production held it on 2026-09-25);
--   * reads the whole sitemap once with the old version and keeps its
--     fingerprint;
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result: the new version is in place, visitors may still call
--     it, it answers the whole sitemap in under 2 seconds, and its answer is
--     byte for byte the one the old version gave.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20260925100000') then
    raise exception 'stop: migration 20260925100000 is already recorded as applied';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260924200600') then
    raise exception 'stop: migration 20260924200600 (truthful article dates) is not applied yet -- this update follows it';
  end if;
  if to_regprocedure('api.news_sitemap_entries(integer)') is null
    or to_regclass('app.article_editions') is null
    or to_regclass('app.article_revisions') is null
    or to_regclass('app.article_editions_sitemap_idx') is null
    or to_regclass('app.article_editions_legacy_import_idx') is null then
    raise exception 'stop: the database is missing the News tables or indexes this update reads';
  end if;

  if md5(pg_get_functiondef('api.news_sitemap_entries(integer)'::regprocedure))
    <> '66e94c912098137d30f7fd67f9555144' then
    raise exception 'stop: api.news_sitemap_entries is not the version this update replaces (20260924200600)';
  end if;
end
$preflight$;

-- The whole sitemap as the old version answers it (about 8 seconds), kept
-- for the postflight to compare against.
select set_config(
  'botolago.sitemap_before',
  md5(api.news_sitemap_entries(49990)::text),
  true
);

-- ---------------------------------------------------------------------------
-- Migration 20260925100000, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260925100000',
  'news_sitemap_set_based_again',
  array[$bg_20260925100000_file$-- BotolaGO Production V2
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
$bg_20260925100000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20260925100000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20260925100000'
  );
begin
  if encode(sha256(convert_to(part_20260925100000, 'UTF8')), 'hex')
    is distinct from 'cc3916bbdd9f83327037d328b44a0f94a6d710581bdcca332401dfcb34a0db79' then
    raise exception 'stop: 20260925100000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20260925100000;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  signature constant regprocedure := 'api.news_sitemap_entries(integer)'::regprocedure;
  definition text := pg_get_functiondef(signature);
  started timestamptz;
  took_ms numeric;
  answer text;
begin
  if definition ~ 'news_is_public\(|news_content_updated_at\(|news_story_is_publishable\('
    or definition not like '%last_revision as (%'
    or definition not like '%''contentUpdatedAt''%' then
    problems := problems || 'the sitemap is not the new set-based version'::text;
  end if;
  if not has_function_privilege('anon', signature, 'execute')
    or not has_function_privilege('authenticated', signature, 'execute') then
    problems := problems || 'visitors can no longer call the sitemap'::text;
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260925100000') then
    problems := problems || 'history row missing'::text;
  end if;

  -- One real call, as /sitemap.xml makes it, timed.
  started := clock_timestamp();
  answer := api.news_sitemap_entries(49990)::text;
  took_ms := round(extract(epoch from clock_timestamp() - started) * 1000);
  if took_ms >= 2000 then
    problems := problems || ('the whole sitemap took ' || took_ms || ' ms; visitors are cut off at 3,000');
  end if;
  if md5(answer) is distinct from current_setting('botolago.sitemap_before', true) then
    problems := problems || ('the new answer differs from the old one (' || jsonb_array_length(answer::jsonb)
      || ' entries) -- if an article was published in the last few seconds, run again');
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
  raise notice 'sitemap: % entries in % ms, same answer as before', jsonb_array_length(answer::jsonb), took_ms;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20260925100000')
    then 'Applied. /sitemap.xml answers again (the site caches it for 5 minutes).'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
