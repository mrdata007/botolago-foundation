-- News: the sitemap is computed set-based and served from a snapshot
-- (20260925210050).
--
--   * equivalence: app_private.news_sitemap_compute() returns exactly what the
--     per-row definition of 20260924200600 returned (app_private.news_is_public()
--     per edition and per counterpart, the predicate every other public read
--     uses), over fixtures covering every eligibility branch plus whatever else
--     the database holds;
--   * the refresh swaps the snapshot, leaves it untouched when nothing changed
--     and when it fails (last known good), skips while another refresh runs,
--     and an unpublished edition leaves the served entries at the next refresh;
--   * a snapshot more than 120 seconds old is not served: the entries are
--     computed live, and the ops health check `news_sitemap` warns, then fails;
--   * the JSON shape, limits and grants the web already relies on.
begin;

select extensions.plan(63);

-- Timestamps are rendered in the session's time zone; the compute function
-- pins UTC, so the reference must run in UTC too.
set local timezone = 'UTC';

-- ---------------------------------------------------------------------------
-- Fixtures: one story per eligibility branch.
-- ---------------------------------------------------------------------------
insert into app.publishers (id, slug, name, source_type, trust_status, syndication_licensed_at, syndication_license_note)
values
  ('9e510000-0000-4000-8000-000000000001', 'snapqa-house', 'SnapQA House', 'internal', 'trusted', null, null),
  ('9e510000-0000-4000-8000-000000000003', 'botolago-snapqa', 'BotolaGO SnapQA', 'provider', 'trusted', null, null),
  ('9e510000-0000-4000-8000-000000000004', 'snapqa-licensed', 'SnapQA Licensed', 'provider', 'trusted',
   statement_timestamp(), 'SnapQA: permission to republish.'),
  ('9e510000-0000-4000-8000-000000000005', 'snapqa-unlicensed', 'SnapQA Unlicensed', 'provider', 'trusted', null, null),
  ('9e510000-0000-4000-8000-000000000006', 'botolagox', 'Botolagox Lookalike', 'provider', 'trusted', null, null);
-- The exact 'botolago' slug may already exist; the branch holds either way.
insert into app.publishers (slug, name, source_type, trust_status)
values ('botolago', 'BotolaGO', 'provider', 'trusted')
on conflict (slug) do nothing;

insert into app.stories (id, origin, original_language, publisher_id, deleted_at, import_converted_at, import_conversion_reason)
values
  -- 01 no publisher: FR + AR public, each the other's counterpart
  ('9e520000-0000-4000-8000-000000000001', 'manual', 'fr', null, null, null, null),
  -- 02 internal publisher: FR public, AR draft
  ('9e520000-0000-4000-8000-000000000002', 'manual', 'fr', '9e510000-0000-4000-8000-000000000001', null, null, null),
  -- 03 slug 'botolago': FR public, AR published but unlisted
  ('9e520000-0000-4000-8000-000000000003', 'manual', 'fr', (select id from app.publishers where slug = 'botolago'), null, null, null),
  -- 04 slug 'botolago-*': AR public, FR scheduled
  ('9e520000-0000-4000-8000-000000000004', 'provider', 'ar', '9e510000-0000-4000-8000-000000000003', null, null, null),
  -- 05 licensed: FR public, AR published but dated in the future
  ('9e520000-0000-4000-8000-000000000005', 'partner', 'fr', '9e510000-0000-4000-8000-000000000004', null, null, null),
  -- 06 unlicensed third party: never
  ('9e520000-0000-4000-8000-000000000006', 'provider', 'fr', '9e510000-0000-4000-8000-000000000005', null, null, null),
  -- 07 unlicensed but converted by an editorial admin (not a legacy stub): listed
  ('9e520000-0000-4000-8000-000000000007', 'provider', 'fr', '9e510000-0000-4000-8000-000000000005', null,
   statement_timestamp(), 'Converted for the sitemap test.'),
  -- 08 'botolagox' is neither 'botolago' nor 'botolago-*': never
  ('9e520000-0000-4000-8000-000000000008', 'provider', 'fr', '9e510000-0000-4000-8000-000000000006', null, null, null),
  -- 09 deleted story: never
  ('9e520000-0000-4000-8000-000000000009', 'manual', 'fr', null, statement_timestamp(), null, null),
  -- 10 unconverted legacy import, even from a licensed publisher: never
  ('9e520000-0000-4000-8000-000000000010', 'provider', 'fr', '9e510000-0000-4000-8000-000000000004', null, null, null),
  -- 11 converted legacy import from an unlicensed publisher: listed
  ('9e520000-0000-4000-8000-000000000011', 'provider', 'fr', '9e510000-0000-4000-8000-000000000005', null,
   statement_timestamp(), 'Converted legacy import for the sitemap test.'),
  -- 12 unpublished FR, archived AR (both left public): never
  ('9e520000-0000-4000-8000-000000000012', 'manual', 'fr', null, null, null, null),
  -- 13 in review FR, rejected AR: never
  ('9e520000-0000-4000-8000-000000000013', 'manual', 'fr', null, null, null, null);

insert into app.article_editions (
  id, story_id, language, slug, title, summary, body_format, body_source, body_html,
  status, visibility, scheduled_at, published_at, unpublished_at, reading_time_minutes, sanitizer_version
)
select fixture.id::uuid, fixture.story::uuid, fixture.language::app.language_code, fixture.slug,
  'Titre du test de sitemap', 'Résumé suffisamment long pour le test.', 'rich_text', null,
  '<p>Corps de l’article pour le test du sitemap.</p>',
  fixture.status::app.publication_status, fixture.visibility::app.article_visibility,
  case when fixture.status = 'scheduled' then statement_timestamp() + interval '2 days' end,
  case when fixture.status in ('published', 'unpublished', 'archived')
    then statement_timestamp() + fixture.published_offset end,
  case when fixture.status in ('unpublished', 'archived') then statement_timestamp() end,
  1, fixture.sanitizer
from (values
  ('9e530000-0000-4000-8000-000000000101', '9e520000-0000-4000-8000-000000000001', 'fr', 'snapqa-01-fr', 'published', 'public', interval '-3 hours', 'sanitize-html@2.17.5'),
  ('9e530000-0000-4000-8000-000000000102', '9e520000-0000-4000-8000-000000000001', 'ar', 'snapqa-01-ar', 'published', 'public', interval '-2 hours', 'sanitize-html@2.17.5'),
  ('9e530000-0000-4000-8000-000000000201', '9e520000-0000-4000-8000-000000000002', 'fr', 'snapqa-02-fr', 'published', 'public', interval '-4 hours', 'sanitize-html@2.17.5'),
  ('9e530000-0000-4000-8000-000000000202', '9e520000-0000-4000-8000-000000000002', 'ar', 'snapqa-02-ar', 'draft', 'private', null, 'sanitize-html@2.17.5'),
  ('9e530000-0000-4000-8000-000000000301', '9e520000-0000-4000-8000-000000000003', 'fr', 'snapqa-03-fr', 'published', 'public', interval '-5 hours', 'sanitize-html@2.17.5'),
  ('9e530000-0000-4000-8000-000000000302', '9e520000-0000-4000-8000-000000000003', 'ar', 'snapqa-03-ar', 'published', 'unlisted', interval '-5 hours', 'sanitize-html@2.17.5'),
  ('9e530000-0000-4000-8000-000000000401', '9e520000-0000-4000-8000-000000000004', 'ar', 'snapqa-04-ar', 'published', 'public', interval '-6 hours', 'sanitize-html@2.17.5'),
  ('9e530000-0000-4000-8000-000000000402', '9e520000-0000-4000-8000-000000000004', 'fr', 'snapqa-04-fr', 'scheduled', 'public', null, 'sanitize-html@2.17.5'),
  ('9e530000-0000-4000-8000-000000000501', '9e520000-0000-4000-8000-000000000005', 'fr', 'snapqa-05-fr', 'published', 'public', interval '-7 hours', 'sanitize-html@2.17.5'),
  ('9e530000-0000-4000-8000-000000000502', '9e520000-0000-4000-8000-000000000005', 'ar', 'snapqa-05-ar', 'published', 'public', interval '1 day', 'sanitize-html@2.17.5'),
  ('9e530000-0000-4000-8000-000000000601', '9e520000-0000-4000-8000-000000000006', 'fr', 'snapqa-06-fr', 'published', 'public', interval '-8 hours', 'sanitize-html@2.17.5'),
  ('9e530000-0000-4000-8000-000000000701', '9e520000-0000-4000-8000-000000000007', 'fr', 'snapqa-07-fr', 'published', 'public', interval '-9 hours', 'sanitize-html@2.17.5'),
  ('9e530000-0000-4000-8000-000000000801', '9e520000-0000-4000-8000-000000000008', 'fr', 'snapqa-08-fr', 'published', 'public', interval '-10 hours', 'sanitize-html@2.17.5'),
  ('9e530000-0000-4000-8000-000000000901', '9e520000-0000-4000-8000-000000000009', 'fr', 'snapqa-09-fr', 'published', 'public', interval '-11 hours', 'sanitize-html@2.17.5'),
  ('9e530000-0000-4000-8000-000000001001', '9e520000-0000-4000-8000-000000000010', 'fr', 'snapqa-10-fr', 'published', 'public', interval '-12 hours', 'sanitize-html@2.17.5'),
  ('9e530000-0000-4000-8000-000000001002', '9e520000-0000-4000-8000-000000000010', 'ar', 'snapqa-10-ar', 'archived', 'private', interval '-400 days', 'elbotola-link-v1'),
  ('9e530000-0000-4000-8000-000000001101', '9e520000-0000-4000-8000-000000000011', 'fr', 'snapqa-11-fr', 'published', 'public', interval '-13 hours', 'sanitize-html@2.17.5'),
  ('9e530000-0000-4000-8000-000000001102', '9e520000-0000-4000-8000-000000000011', 'ar', 'snapqa-11-ar', 'archived', 'private', interval '-400 days', 'gnews-excerpt-v1'),
  ('9e530000-0000-4000-8000-000000001201', '9e520000-0000-4000-8000-000000000012', 'fr', 'snapqa-12-fr', 'unpublished', 'public', interval '-14 hours', 'sanitize-html@2.17.5'),
  ('9e530000-0000-4000-8000-000000001202', '9e520000-0000-4000-8000-000000000012', 'ar', 'snapqa-12-ar', 'archived', 'public', interval '-14 hours', 'sanitize-html@2.17.5'),
  ('9e530000-0000-4000-8000-000000001301', '9e520000-0000-4000-8000-000000000013', 'fr', 'snapqa-13-fr', 'in_review', 'private', null, 'sanitize-html@2.17.5'),
  ('9e530000-0000-4000-8000-000000001302', '9e520000-0000-4000-8000-000000000013', 'ar', 'snapqa-13-ar', 'rejected', 'private', null, 'sanitize-html@2.17.5')
) fixture(id, story, language, slug, status, visibility, published_offset, sanitizer);

-- A real edit after publication (contentUpdatedAt follows it).
insert into app.article_revisions (article_edition_id, revision_number, title, summary, body_html, status, visibility, created_at)
values ('9e530000-0000-4000-8000-000000000101', 1, 'Titre du test de sitemap', 'Résumé suffisamment long pour le test.',
  '<p>Corps de l’article pour le test du sitemap.</p>', 'published', 'public', statement_timestamp() - interval '1 hour');

-- The per-row definition this migration replaced (20260924200600), verbatim
-- apart from the name: the reference every comparison below is made against.
create function pg_temp.reference_sitemap(p_limit integer default 5000) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(entry.value order by entry.published_at desc, entry.id desc), '[]'::jsonb)
  from (
    select edition.id, edition.published_at, jsonb_build_object(
      'id', edition.id,
      'language', edition.language,
      'slug', edition.slug,
      'publishedAt', edition.published_at,
      'updatedAt', edition.updated_at,
      'contentUpdatedAt', greatest(edition.published_at, last_revision.created_at),
      'translations', coalesce((select jsonb_agg(jsonb_build_object(
        'id', sibling.id, 'language', sibling.language
      ) order by sibling.language)
        from app.article_editions sibling
        where sibling.story_id = edition.story_id
          and sibling.id <> edition.id
          and sibling.visibility = 'public'
          and app_private.news_is_public(sibling)), '[]'::jsonb)
    ) as value
    from app.article_editions edition
    left join (
      select revision.article_edition_id, max(revision.created_at) as created_at
      from app.article_revisions revision
      group by revision.article_edition_id
    ) last_revision on last_revision.article_edition_id = edition.id
    where edition.visibility = 'public'
      and app_private.news_is_public(edition)
    order by edition.published_at desc, edition.id desc
    limit least(greatest(coalesce(p_limit, 5000), 1), 50000)
  ) entry
$$;

create function pg_temp.served_ids() returns setof uuid language sql as $$
  select (entry ->> 'id')::uuid from jsonb_array_elements(api.news_sitemap_entries(50000)) entry
$$;
create function pg_temp.served_entry(p_id uuid) returns jsonb language sql as $$
  select entry from jsonb_array_elements(api.news_sitemap_entries(50000)) entry
  where entry ->> 'id' = p_id::text
$$;

-- ---------------------------------------------------------------------------
-- 1. Equivalence with the per-row predicates.
-- ---------------------------------------------------------------------------
select extensions.is(app_private.news_sitemap_compute(50000), pg_temp.reference_sitemap(50000),
  'set-based computation = the per-row definition, entry for entry (ids, order, counterparts, dates)');
select extensions.is(app_private.news_sitemap_compute(3), pg_temp.reference_sitemap(3),
  'and with a small limit (counterparts still come from the whole eligible set)');
select extensions.set_eq(
  $$select (entry ->> 'id')::uuid from jsonb_array_elements(app_private.news_sitemap_compute(50000)) entry$$,
  $$select edition.id from app.article_editions edition
    where edition.visibility = 'public' and app_private.news_is_public(edition)$$,
  'it lists exactly the public editions app_private.news_is_public() allows');
select extensions.set_eq(
  $$select (entry ->> 'id')::uuid from jsonb_array_elements(app_private.news_sitemap_compute(50000)) entry
    where entry ->> 'id' like '9e530000-%'$$,
  $$values ('9e530000-0000-4000-8000-000000000101'::uuid), ('9e530000-0000-4000-8000-000000000102'::uuid),
    ('9e530000-0000-4000-8000-000000000201'::uuid), ('9e530000-0000-4000-8000-000000000301'::uuid),
    ('9e530000-0000-4000-8000-000000000401'::uuid), ('9e530000-0000-4000-8000-000000000501'::uuid),
    ('9e530000-0000-4000-8000-000000000701'::uuid), ('9e530000-0000-4000-8000-000000001101'::uuid)$$,
  'branch by branch: no publisher, internal, botolago, botolago-*, licensed and converted are listed; '
  || 'unlicensed, look-alike slug, deleted story, unconverted legacy import, future date, unlisted, '
  || 'draft, scheduled, in review, rejected, unpublished and archived are not');
select extensions.is(
  (select entry -> 'translations' from jsonb_array_elements(app_private.news_sitemap_compute(50000)) entry
   where entry ->> 'id' = '9e530000-0000-4000-8000-000000000101'),
  '[{"id": "9e530000-0000-4000-8000-000000000102", "language": "ar"}]'::jsonb,
  'a public counterpart is listed');
select extensions.is(
  (select jsonb_agg(entry -> 'translations' order by entry ->> 'id')
   from jsonb_array_elements(app_private.news_sitemap_compute(50000)) entry
   where entry ->> 'id' in ('9e530000-0000-4000-8000-000000000201', '9e530000-0000-4000-8000-000000000301',
     '9e530000-0000-4000-8000-000000000401', '9e530000-0000-4000-8000-000000000501')),
  '[[], [], [], []]'::jsonb,
  'a draft, unlisted, scheduled or future-dated counterpart is not');
select extensions.is(
  (select (entry ->> 'contentUpdatedAt')::timestamptz from jsonb_array_elements(app_private.news_sitemap_compute(50000)) entry
   where entry ->> 'id' = '9e530000-0000-4000-8000-000000000101'),
  (select created_at from app.article_revisions where article_edition_id = '9e530000-0000-4000-8000-000000000101'),
  'contentUpdatedAt is the latest real revision');

-- ---------------------------------------------------------------------------
-- 2. The job.
-- ---------------------------------------------------------------------------
select extensions.is(
  (select schedule from cron.job where jobname = 'news-sitemap-refresh' and active), '* * * * *',
  'pg_cron refreshes the sitemap every minute');
select extensions.ok(
  (select command from cron.job where jobname = 'news-sitemap-refresh')
    ~ 'statement_timeout = ''30s''.*app_private\.news_sitemap_refresh\(\)',
  'with a statement timeout of its own, and without waiting for a refresh already running');
select extensions.ok(
  exists (select 1 from cron.job where jobname = 'news-sitemap-refresh-history-prune' and active
    and command ~ 'news-sitemap-refresh' and command ~ '7 days'),
  'and a week of its run history is kept');

-- ---------------------------------------------------------------------------
-- 3. Refresh, unchanged, served, unpublished.
-- ---------------------------------------------------------------------------
select extensions.is(app_private.news_sitemap_refresh(true) ->> 'outcome', 'refreshed',
  'a refresh that finds new entries swaps them in');
select extensions.is(api.news_sitemap_entries(50000), pg_temp.reference_sitemap(50000),
  'the served entries are the per-row definition''s, from the snapshot');
select extensions.is(
  (select entry_count from app_private.news_sitemap_snapshot where id),
  (select jsonb_array_length(payload) from app_private.news_sitemap_snapshot where id),
  'the snapshot records how many entries it holds');

create temporary table snapshot_before on commit drop as
select payload, computed_at, changed_at from app_private.news_sitemap_snapshot where id;

select extensions.is(app_private.news_sitemap_refresh(true) ->> 'outcome', 'unchanged',
  'a refresh that finds nothing new says so');
select extensions.ok(
  (select s.payload = b.payload and s.changed_at = b.changed_at and s.computed_at >= b.computed_at
   from app_private.news_sitemap_snapshot s, snapshot_before b where s.id),
  'and leaves the payload and its change time as they were, moving only the computation time');

-- An edition stops being public.
update app.article_editions set status = 'unpublished', unpublished_at = statement_timestamp()
where id = '9e530000-0000-4000-8000-000000000102';
select extensions.ok(
  '9e530000-0000-4000-8000-000000000102'::uuid in (select pg_temp.served_ids()),
  'until the next refresh the snapshot still lists an edition unpublished a moment ago (at most a minute)');
select extensions.is(app_private.news_sitemap_refresh(true) ->> 'outcome', 'refreshed',
  'the refresh picks the change up');
select extensions.ok(
  '9e530000-0000-4000-8000-000000000102'::uuid not in (select pg_temp.served_ids()),
  'an unpublished edition leaves the served sitemap');
select extensions.is(pg_temp.served_entry('9e530000-0000-4000-8000-000000000101') -> 'translations', '[]'::jsonb,
  'and leaves its counterpart''s alternates too');

-- An edition becomes public.
update app.article_editions
set status = 'published', visibility = 'public', published_at = statement_timestamp() - interval '1 minute'
where id = '9e530000-0000-4000-8000-000000000202';
select extensions.is(app_private.news_sitemap_refresh(true) ->> 'outcome', 'refreshed',
  'a newly published edition is picked up by the next refresh');
select extensions.is(pg_temp.served_entry('9e530000-0000-4000-8000-000000000202') -> 'translations',
  '[{"id": "9e530000-0000-4000-8000-000000000201", "language": "fr"}]'::jsonb,
  'and served with its counterpart');
select extensions.is(api.news_sitemap_entries(50000), pg_temp.reference_sitemap(50000),
  'the served entries still equal the per-row definition''s after the changes');

-- A licence withdrawn and a story deleted take their editions out too.
update app.publishers set syndication_licensed_at = null, syndication_license_note = null
where id = '9e510000-0000-4000-8000-000000000004';
update app.stories set deleted_at = statement_timestamp() where id = '9e520000-0000-4000-8000-000000000003';
select extensions.is(app_private.news_sitemap_refresh(true) ->> 'outcome', 'refreshed',
  'a publisher or story change is picked up as well');
select extensions.ok(
  not exists (select 1 from pg_temp.served_ids() id
    where id in ('9e530000-0000-4000-8000-000000000501', '9e530000-0000-4000-8000-000000000301')),
  'an edition whose licence was withdrawn or whose story was deleted leaves the sitemap');

-- ---------------------------------------------------------------------------
-- 3a. One refresh at a time, seen from a second session. This transaction
--     holds the refresh lock since its first refresh above (a transaction-level
--     advisory lock, re-entrant within one session, so only another session
--     can see it taken). The second session logs in over the server's own
--     network address with the local stack's default password; where that is
--     not possible the two checks are skipped rather than failed.
-- ---------------------------------------------------------------------------
create extension if not exists dblink with schema extensions;
-- The remote error comes back as a NOTICE as well; kept out of the TAP output.
create function pg_temp.second_session(p_statement_timeout text, p_sql text) returns text
language plpgsql set client_min_messages = warning as $$
declare
  answer text;
  failure text;
begin
  begin
    perform extensions.dblink_connect('sitemap_second_session', format(
      'host=%s port=%s dbname=%s user=postgres password=postgres connect_timeout=5',
      host(inet_server_addr()), inet_server_port(), current_database()));
  exception when others then
    return 'unavailable: ' || sqlerrm;
  end;
  perform extensions.dblink_exec('sitemap_second_session',
    format('set statement_timeout = %L', p_statement_timeout));
  select result into answer
  from extensions.dblink('sitemap_second_session', p_sql, false) as remote(result text);
  failure := extensions.dblink_error_message('sitemap_second_session');
  perform extensions.dblink_disconnect('sitemap_second_session');
  return coalesce(answer, 'error: ' || failure);
end;
$$;
select set_config('sitemap_test.busy',
  pg_temp.second_session('5s', 'select app_private.news_sitemap_refresh()::text'), true);
select set_config('sitemap_test.waits',
  pg_temp.second_session('300ms', 'select app_private.news_sitemap_refresh(true)::text'), true);
select case when current_setting('sitemap_test.busy') like 'unavailable:%'
  then extensions.skip('no second session: ' || current_setting('sitemap_test.busy'), 1)
  else extensions.is(current_setting('sitemap_test.busy'), '{"outcome": "busy"}',
    'pg_cron''s call, while another refresh holds the lock, skips at once instead of computing twice') end;
select case when current_setting('sitemap_test.waits') like 'unavailable:%'
  then extensions.skip('no second session: ' || current_setting('sitemap_test.waits'), 1)
  else extensions.ok(current_setting('sitemap_test.waits') like 'error: %statement timeout%',
    'a refresh by hand waits for the lock instead (cut off here by its 300 ms timeout): '
    || split_part(current_setting('sitemap_test.waits'), E'\n', 1)) end;

-- ---------------------------------------------------------------------------
-- 4. A failed refresh leaves the last good snapshot exactly as it was.
-- ---------------------------------------------------------------------------
truncate snapshot_before;
insert into snapshot_before
select payload, computed_at, changed_at from app_private.news_sitemap_snapshot where id;

update app.article_editions set status = 'unpublished', unpublished_at = statement_timestamp()
where id = '9e530000-0000-4000-8000-000000000201';

create function pg_temp.fail_swap() returns trigger language plpgsql as $$
begin
  raise exception using errcode = 'XX000', message = 'simulated failure while swapping the sitemap';
end;
$$;
create trigger fail_swap before update on app_private.news_sitemap_snapshot
for each row execute function pg_temp.fail_swap();

select extensions.throws_ok($$select app_private.news_sitemap_refresh(true)$$,
  'XX000', 'simulated failure while swapping the sitemap',
  'a refresh that fails raises, so pg_cron records the failure');
select extensions.ok(
  (select s.payload = b.payload and s.computed_at = b.computed_at and s.changed_at = b.changed_at
   from app_private.news_sitemap_snapshot s, snapshot_before b where s.id),
  'and the previous snapshot is untouched: payload and times');
select extensions.ok(
  '9e530000-0000-4000-8000-000000000201'::uuid in (select pg_temp.served_ids()),
  'the last good entries are still served');

drop trigger fail_swap on app_private.news_sitemap_snapshot;
select extensions.is(app_private.news_sitemap_refresh(true) ->> 'outcome', 'refreshed',
  'once the fault is gone the next refresh catches up');
select extensions.ok(
  '9e530000-0000-4000-8000-000000000201'::uuid not in (select pg_temp.served_ids()),
  'including the change made while it was failing');

-- ---------------------------------------------------------------------------
-- 4a. A snapshot the job stopped refreshing is served for 120 seconds at
--     most; after that the entries are computed live, and health says so.
-- ---------------------------------------------------------------------------
create function pg_temp.sitemap_health() returns jsonb language sql as $$
  select c from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c
  where c ->> 'name' = 'news_sitemap'
$$;
create function pg_temp.age_snapshot(p_age interval) returns void language sql as $$
  update app_private.news_sitemap_snapshot
  set computed_at = statement_timestamp() - p_age,
      changed_at = least(changed_at, statement_timestamp() - p_age)
  where id
$$;

select extensions.is(pg_temp.sitemap_health() ->> 'status', 'ok',
  'health: a snapshot refreshed a moment ago is ok');
select extensions.ok(pg_temp.sitemap_health() ->> 'detail' ~ '^last refresh \d\d:\d\d UTC, \d+ entries in \d+ ms$',
  'and says when, how many entries and how long it took: ' || (pg_temp.sitemap_health() ->> 'detail'));

update app.article_editions set status = 'unpublished', unpublished_at = statement_timestamp()
where id = '9e530000-0000-4000-8000-000000000401';
select pg_temp.age_snapshot(interval '110 seconds');
select extensions.ok(
  '9e530000-0000-4000-8000-000000000401'::uuid in (select pg_temp.served_ids()),
  'a snapshot 110 seconds old is still served as it is (it lists an edition unpublished since)');
select pg_temp.age_snapshot(interval '121 seconds');
select extensions.ok(
  '9e530000-0000-4000-8000-000000000401'::uuid not in (select pg_temp.served_ids()),
  'past 120 seconds it is not: the entries are computed live, and the edition is gone without a refresh');
select extensions.is(api.news_sitemap_entries(50000), pg_temp.reference_sitemap(50000),
  'the live entries are the per-row definition''s');
select extensions.is(api.news_sitemap_entries(2), pg_temp.reference_sitemap(2),
  'bounded by the limit');
select extensions.is(pg_temp.sitemap_health() ->> 'status', 'warn',
  'health warns once the sitemap is computed on every request');
select extensions.ok(pg_temp.sitemap_health() ->> 'detail' like 'last refresh 2 min ago (news-sitemap-refresh paused or failing)%',
  'and says how long ago the last refresh was');
select pg_temp.age_snapshot(interval '11 minutes');
select extensions.is(pg_temp.sitemap_health() ->> 'status', 'fail',
  'and fails (so the ops alert pages) past 10 minutes: a paused job records no failed run for cron_jobs to see');

select extensions.is(app_private.news_sitemap_refresh(true) ->> 'outcome', 'refreshed',
  'a refresh brings it back');
select extensions.ok(
  '9e530000-0000-4000-8000-000000000401'::uuid not in (select pg_temp.served_ids())
  and pg_temp.sitemap_health() ->> 'status' = 'ok',
  'served from the snapshot again, and healthy');
update app_private.news_sitemap_snapshot set compute_ms = 1600 where id;
select extensions.is(pg_temp.sitemap_health(), jsonb_build_object('name', 'news_sitemap', 'status', 'warn',
    'detail', 'a refresh took 1600 ms: a live read would be close to the 3 s visitors get'),
  'health warns when a refresh gets slow enough to endanger the live fallback');
select extensions.ok(
  (select array_agg(c ->> 'name') from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c)
    @> array['fantasy_lifecycle_tick', 'fantasy_gameweek_lock', 'cron_jobs', 'news_publication', 'news_sitemap',
      'news_import', 'live_scores', 'provider_refresh', 'email_delivery', 'browser_errors'],
  'every earlier health check is still there beside it');

-- ---------------------------------------------------------------------------
-- 5. No snapshot yet: computed live, never an empty sitemap.
-- ---------------------------------------------------------------------------
delete from app_private.news_sitemap_snapshot;
select extensions.is(api.news_sitemap_entries(50000), pg_temp.reference_sitemap(50000),
  'without a snapshot the entries are computed live, the same set');
select extensions.is(api.news_sitemap_entries(2), pg_temp.reference_sitemap(2),
  'bounded by the limit');
select extensions.ok(pg_temp.sitemap_health() ->> 'status' = 'fail'
  and pg_temp.sitemap_health() ->> 'detail' like 'no snapshot:%',
  'health fails without a snapshot');
select extensions.is(app_private.news_sitemap_refresh(true) ->> 'outcome', 'refreshed',
  'the next refresh writes the first snapshot');
select extensions.ok(exists (select 1 from app_private.news_sitemap_snapshot where id),
  'which is there afterwards');

-- ---------------------------------------------------------------------------
-- 6. Shape and limits: what the repository's DTO parser reads.
-- ---------------------------------------------------------------------------
select extensions.ok(
  (select bool_and(
     (select array_agg(key order by key) from jsonb_object_keys(entry) key)
       = array['contentUpdatedAt', 'id', 'language', 'publishedAt', 'slug', 'translations', 'updatedAt']
     and jsonb_typeof(entry -> 'translations') = 'array'
     and (entry ->> 'language') in ('fr', 'ar')
     and (entry ->> 'id')::uuid is not null
     and (entry ->> 'publishedAt')::timestamptz is not null)
   from jsonb_array_elements(api.news_sitemap_entries(50000)) entry),
  'every entry has the same keys as before: id, language, slug, publishedAt, updatedAt, contentUpdatedAt, translations');
select extensions.ok(
  (select coalesce(bool_and(
     (select array_agg(key order by key) from jsonb_object_keys(translation) key) = array['id', 'language']), true)
   from jsonb_array_elements(api.news_sitemap_entries(50000)) entry,
        jsonb_array_elements(entry -> 'translations') translation),
  'every counterpart is {id, language}');
select extensions.is(
  (select array_agg(entry ->> 'id' order by ordinality)
   from jsonb_array_elements(api.news_sitemap_entries(50000)) with ordinality as listed(entry, ordinality)),
  (select array_agg(entry ->> 'id' order by (entry ->> 'publishedAt')::timestamptz desc, (entry ->> 'id')::uuid desc)
   from jsonb_array_elements(api.news_sitemap_entries(50000)) entry),
  'newest first, then by id');
select extensions.is(
  (select (entry ->> 'publishedAt')::timestamptz from jsonb_array_elements(api.news_sitemap_entries(50000)) entry
   where entry ->> 'id' = '9e530000-0000-4000-8000-000000000701'),
  (select published_at from app.article_editions where id = '9e530000-0000-4000-8000-000000000701'),
  'dates round-trip exactly');
select extensions.is(api.news_sitemap_entries(3), pg_temp.reference_sitemap(3),
  'a limit smaller than the snapshot serves its newest entries');
select extensions.is(api.news_sitemap_entries(), pg_temp.reference_sitemap(),
  'the default limit is still 5,000');
select extensions.is(
  jsonb_build_array(jsonb_array_length(api.news_sitemap_entries(0)), jsonb_array_length(api.news_sitemap_entries(-7)),
    jsonb_array_length(api.news_sitemap_entries(null))),
  jsonb_build_array(1, 1, jsonb_array_length(pg_temp.reference_sitemap(null))),
  'limits below 1 serve one entry and null the default, as before');

-- ---------------------------------------------------------------------------
-- 7. Grants: the public read is public; nothing else is.
-- ---------------------------------------------------------------------------
select extensions.ok(
  has_function_privilege('anon', 'api.news_sitemap_entries(integer)', 'execute')
  and has_function_privilege('authenticated', 'api.news_sitemap_entries(integer)', 'execute'),
  'visitors and signed-in users may read the sitemap');
select extensions.ok(
  not has_function_privilege('anon', 'app_private.news_sitemap_refresh(boolean)', 'execute')
  and not has_function_privilege('authenticated', 'app_private.news_sitemap_refresh(boolean)', 'execute')
  and not has_function_privilege('service_role', 'app_private.news_sitemap_refresh(boolean)', 'execute')
  and not has_function_privilege('anon', 'app_private.news_sitemap_compute(integer)', 'execute')
  and not has_function_privilege('authenticated', 'app_private.news_sitemap_compute(integer)', 'execute')
  and not has_function_privilege('service_role', 'app_private.news_sitemap_compute(integer)', 'execute'),
  'nobody but the database owner may refresh or compute');
select extensions.ok(
  not has_table_privilege('anon', 'app_private.news_sitemap_snapshot', 'select')
  and not has_table_privilege('authenticated', 'app_private.news_sitemap_snapshot', 'select')
  and not has_table_privilege('service_role', 'app_private.news_sitemap_snapshot', 'select,insert,update,delete')
  and not has_schema_privilege('anon', 'app_private', 'usage')
  and not has_schema_privilege('authenticated', 'app_private', 'usage'),
  'the snapshot table is not exposed');
select extensions.ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'app_private.news_sitemap_snapshot'::regclass),
  'and has row level security forced, like every app_private table');
select extensions.ok(
  (select prosecdef and proconfig @> array['search_path=""'] from pg_proc
   where oid = 'api.news_sitemap_entries(integer)'::regprocedure)
  and (select prosecdef and proconfig @> array['search_path=""'] from pg_proc
   where oid = 'app_private.news_sitemap_refresh(boolean)'::regprocedure),
  'both functions are SECURITY DEFINER with an empty search_path');

-- The reference reads app tables a visitor cannot, so take its count first.
select set_config('sitemap_test.expected_count', jsonb_array_length(pg_temp.reference_sitemap(50000))::text, true);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.is(jsonb_array_length(api.news_sitemap_entries(50000)),
  current_setting('sitemap_test.expected_count')::integer,
  'a visitor gets the whole sitemap');
select extensions.throws_ok($$select app_private.news_sitemap_refresh()$$, '42501', null,
  'a visitor cannot trigger a refresh');
reset role;

select * from extensions.finish();
rollback;
