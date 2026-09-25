-- BotolaGO Production V2
-- News: /sitemap.xml is served from a snapshot the database refreshes every
-- minute, instead of computing the whole archive on every public request.
--
-- Background (audit 2026-09-25 A01 / DB-01). From about 07:00 UTC on
-- 2026-09-25 /sitemap.xml answered 503 on every request: anon's 3 s statement
-- timeout (SQLSTATE 57014) cancelled api.news_sitemap_entries, usually inside
-- app_private.news_is_public. 20260924200600 had re-created the function from
-- the older per-row body, so news_is_public() -- and through it
-- news_story_is_publishable() and news_story_is_legacy_import(), SECURITY
-- DEFINER and so never inlined -- ran once per edition and again per
-- counterpart: 8.4 s on production, 7.1-9.4 s on a local database seeded like
-- it. 20260925100000_news_sitemap_set_based_again, applied on production at
-- about 08:04 UTC the same day, put the set-based body back (~0.2 s).
--
-- This migration builds on that hotfix and changes neither which editions are
-- listed nor the JSON. Fast is not enough on its own: the whole archive is
-- still one synchronous query on every public request, so one slow minute
-- (a cold cache, bloat, a lock, the next migration that re-creates the
-- function the slow way) takes the whole sitemap down with it. So:
--
--   1. app_private.news_sitemap_compute(p_limit): the hotfix's query (the same
--      joins and conditions, in a different order), moved out of the public
--      function; it also pins the time zone, and its answer is byte for byte
--      the hotfix's. It spells out app_private.news_is_public() and
--      app_private.news_story_is_publishable() for a public edition --
--      published, visibility public, dated now or earlier, story not deleted,
--      own / internal / licensed publisher or converted story, and not an
--      unconverted legacy import -- once per edition, and counterparts come
--      from the same eligible set. The pgTAP suite compares it with the
--      per-row predicates on every branch, so the two cannot drift silently.
--   2. app_private.news_sitemap_snapshot: one row, the last computed entries
--      (at most 50,000, the most one sitemap file may hold), when they were
--      computed and how long it took.
--   3. app_private.news_sitemap_refresh(): recomputes and swaps the row in one
--      transaction. A refresh that fails raises, so its transaction rolls back
--      and the previous snapshot stays exactly as it was (last known good) and
--      pg_cron records the failure. When nothing changed it rewrites only the
--      timestamps, so an idle archive does not write the multi-megabyte
--      payload every minute. An advisory lock makes an overlapping call skip
--      (`busy`) instead of computing twice; pg_cron itself never starts a job
--      while its previous run is still going.
--   4. pg_cron job `news-sitemap-refresh`, every minute, with a 30 s
--      statement timeout of its own, and `news-sitemap-refresh-history-prune`
--      keeping a week of its run history.
--   5. api.news_sitemap_entries(p_limit): same signature, grants and JSON. It
--      serves the snapshot (its first p_limit entries) while the snapshot is
--      at most 120 seconds old. With no snapshot, or an older one (the job is
--      paused, failing or gone), it computes live, bounded by p_limit, exactly
--      as 20260925100000 does on every request -- never an empty sitemap, and
--      never one that keeps listing an unpublished article because a job
--      stopped. When the computation itself is what fails, the live read fails
--      too and the route answers 503, which shared caches may cover with their
--      last good copy (`stale-if-error`, src/lib/sitemap.ts).
--   6. The ops health check `news_sitemap`: warns once the snapshot is older
--      than 120 seconds (every request is then computing the archive) or a
--      refresh took 1.5 s or more (half the 3 s a visitor's live read gets);
--      fails, and so pages, when there is no snapshot or it is more than 10
--      minutes old. The `cron_jobs` check sees failed runs but not a paused
--      job, which records no run at all.
--
-- Freshness. The route promises that an unpublished article leaves the sitemap
-- within five minutes. The entries the route reads are at most 120 seconds old
-- whatever state the job is in, and src/routes/sitemap[.]xml.ts lets shared
-- caches keep a copy for 180 seconds: five minutes in all. A newly published
-- article appears within the same window. src/lib/sitemap.test.ts holds the
-- two numbers together.
--
-- Measured with EXPLAIN (ANALYZE, BUFFERS) on a local database seeded like
-- production (16,383 editions, 16,004 of them listed, 26 MB of editions):
--   per-row body of 20260924200600    7.1-9.4 s, ~408,000 buffer hits;
--                                     as anon, cancelled at 3 s
--   set-based hotfix, 20260925100000  0.20-0.23 s, 3,731 buffer hits
--   news_sitemap_compute (below)      0.19-0.20 s, 3,731 buffer hits,
--                                     byte for byte the hotfix's answer
--   refresh, changed / unchanged      0.24 s / 0.20 s
--   served from the snapshot, anon    27-39 ms, 84-389 buffer hits, including
--                                     rendering its 4.3 MB of JSON as text
--   stale snapshot (live), anon       0.19-0.21 s
--
-- Pause (the sitemap is computed live on each request once the snapshot is
-- 120 seconds old, and the ops health check pages after 10 minutes):
--   select cron.alter_job((select jobid from cron.job where jobname = 'news-sitemap-refresh'), active := false);
--   select cron.alter_job((select jobid from cron.job where jobname = 'news-sitemap-refresh-history-prune'), active := false);
-- Resume: the same two statements with active := true.
-- Refresh by hand (waits for a running refresh instead of skipping):
--   select app_private.news_sitemap_refresh(true);

-- 1. The entries, set-based.
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
      edition.published_at, edition.updated_at
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
  'The sitemap entries (newest first, at most p_limit and never more than 50,000), computed set-based: exactly the editions with visibility public that app_private.news_is_public() allows, each with its public counterparts. Read by news_sitemap_refresh() and, when the snapshot is missing or more than 120 seconds old, by api.news_sitemap_entries().';

-- 2. The last known good entries.
create table app_private.news_sitemap_snapshot (
  id boolean primary key default true,
  payload jsonb not null,
  entry_count integer not null,
  computed_at timestamptz not null,
  changed_at timestamptz not null,
  compute_ms integer not null,
  constraint news_sitemap_snapshot_singleton check (id),
  constraint news_sitemap_snapshot_payload_check check (jsonb_typeof(payload) = 'array'),
  constraint news_sitemap_snapshot_count_check check (entry_count between 0 and 50000),
  constraint news_sitemap_snapshot_times_check check (changed_at <= computed_at),
  constraint news_sitemap_snapshot_duration_check check (compute_ms >= 0)
);
alter table app_private.news_sitemap_snapshot enable row level security;
alter table app_private.news_sitemap_snapshot force row level security;
revoke all on app_private.news_sitemap_snapshot from public, anon, authenticated, service_role;

comment on table app_private.news_sitemap_snapshot is
  'One row: the entries api.news_sitemap_entries() serves while computed_at is at most 120 seconds old, as app_private.news_sitemap_compute(50000) returned them at computed_at. Written only by app_private.news_sitemap_refresh() (pg_cron job news-sitemap-refresh, every minute).';
comment on column app_private.news_sitemap_snapshot.computed_at is
  'The time eligibility was evaluated at by the last successful refresh, changed or not.';
comment on column app_private.news_sitemap_snapshot.changed_at is
  'When the payload last changed.';
comment on column app_private.news_sitemap_snapshot.compute_ms is
  'How long the last successful refresh took, in milliseconds.';

-- 3. The refresh.
create or replace function app_private.news_sitemap_refresh(p_wait boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  started timestamptz;
  -- Eligibility (published_at <= statement_timestamp()) is evaluated at this time.
  as_of timestamptz := statement_timestamp();
  fresh jsonb;
  fresh_count integer;
  previous app_private.news_sitemap_snapshot%rowtype;
  elapsed_ms integer;
  outcome text;
begin
  -- One refresh at a time. pg_cron skips (another is computing the same
  -- thing); a person running it by hand waits.
  if coalesce(p_wait, false) then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('news:sitemap-refresh', 0));
  elsif not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('news:sitemap-refresh', 0)) then
    return jsonb_build_object('outcome', 'busy');
  end if;

  -- Any error from here on propagates: the transaction rolls back and the
  -- previous snapshot is untouched.
  started := clock_timestamp();
  fresh := app_private.news_sitemap_compute(50000);
  fresh_count := jsonb_array_length(fresh);
  elapsed_ms := greatest(0, floor(extract(epoch from clock_timestamp() - started) * 1000))::integer;

  select * into previous from app_private.news_sitemap_snapshot where id for update;
  if not found then
    insert into app_private.news_sitemap_snapshot (id, payload, entry_count, computed_at, changed_at, compute_ms)
    values (true, fresh, fresh_count, as_of, as_of, elapsed_ms);
    outcome := 'refreshed';
  elsif previous.payload is distinct from fresh then
    update app_private.news_sitemap_snapshot
    set payload = fresh, entry_count = fresh_count,
        computed_at = as_of, changed_at = as_of, compute_ms = elapsed_ms
    where id;
    outcome := 'refreshed';
  else
    -- Unchanged: the payload column is not assigned, so its stored value is
    -- kept as it is rather than written again. A refresh that waited for the
    -- lock may have started before the one it waited for; never move back.
    update app_private.news_sitemap_snapshot
    set computed_at = greatest(computed_at, as_of), compute_ms = elapsed_ms
    where id;
    outcome := 'unchanged';
  end if;

  return jsonb_build_object('outcome', outcome, 'entries', fresh_count, 'computeMs', elapsed_ms);
end;
$$;

revoke all on function app_private.news_sitemap_refresh(boolean)
  from public, anon, authenticated, service_role;
grant execute on function app_private.news_sitemap_refresh(boolean) to postgres;
comment on function app_private.news_sitemap_refresh(boolean) is
  'Recomputes the sitemap entries and swaps app_private.news_sitemap_snapshot in one transaction; a failure raises and leaves the previous snapshot intact. Returns {outcome: refreshed | unchanged | busy, entries, computeMs}. Run every minute by the pg_cron job news-sitemap-refresh; p_wait = true waits for a running refresh instead of skipping.';

-- 4. The jobs. cron.schedule with a name replaces a job of that name, so
--    re-applying this is harmless. The statement timeout bounds a refresh that
--    has gone wrong (it normally takes well under a second); pg_cron runs the
--    two statements as one transaction.
select cron.schedule(
  'news-sitemap-refresh',
  '* * * * *',
  $job$set local statement_timeout = '30s'; select app_private.news_sitemap_refresh();$job$
);

-- One history row per run (1,440 a day). Keep a week of this job's history.
select cron.schedule(
  'news-sitemap-refresh-history-prune',
  '27 3 * * *',
  $prune$
    delete from cron.job_run_details
    where jobid = (select jobid from cron.job where jobname = 'news-sitemap-refresh')
      and end_time < now() - interval '7 days'
  $prune$
);

-- 5. The public read: same signature, grants and JSON as 20260925100000.
create or replace function api.news_sitemap_entries(p_limit integer default 5000)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  wanted integer := least(greatest(coalesce(p_limit, 5000), 1), 50000);
  snapshot app_private.news_sitemap_snapshot%rowtype;
begin
  select * into snapshot from app_private.news_sitemap_snapshot where id;
  -- No snapshot, or none refreshed in the last 120 seconds (the job is paused,
  -- failing or gone): compute live, set-based and bounded by the limit, as
  -- 20260925100000 does on every request. Serving an older snapshot would keep
  -- an unpublished article listed for as long as the job stays down. The 120
  -- seconds and the route's s-maxage add up to its five-minute promise
  -- (src/lib/sitemap.ts, SITEMAP_SNAPSHOT_MAX_AGE_SECONDS).
  if not found or snapshot.computed_at < statement_timestamp() - interval '120 seconds' then
    return app_private.news_sitemap_compute(wanted);
  end if;
  if wanted >= snapshot.entry_count then
    return snapshot.payload;
  end if;
  -- The newest `wanted` entries, in the snapshot's order.
  return jsonb_path_query_array(snapshot.payload, '$[0 to $last]', jsonb_build_object('last', wanted - 1));
end;
$$;

revoke all on function api.news_sitemap_entries(integer) from public, anon, authenticated, service_role;
grant execute on function api.news_sitemap_entries(integer) to anon, authenticated;
comment on function api.news_sitemap_entries(integer) is
  'Every public, listed edition (and its public counterparts) for /sitemap.xml, newest first, at most p_limit (1-50,000, default 5,000): the set app_private.news_is_public() allows. Served from app_private.news_sitemap_snapshot while it is at most 120 seconds old, otherwise computed live (set-based, inside the 3 s anon statement timeout). Never returns drafts, scheduled, unpublished, archived, unlisted, legacy-import or unlicensed third-party editions.';

-- 6. Health: 20260924200200's checks, unchanged, plus `news_sitemap` after
--    `news_publication`.
create or replace function app_private.ops_health_checks()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  checks jsonb := '[]'::jsonb;
  now_at timestamptz := statement_timestamp();
  tick app_private.fantasy_lifecycle_heartbeat%rowtype;
  tick_enabled boolean;
  overdue record;
  watch jsonb;
  escalations integer;
  failed_jobs text;
  news_beat timestamptz;
  sitemap record;
  email app_private.notification_email_settings%rowtype;
  email_beat timestamptz;
  dead_letters integer;
  in_play integer;
  upcoming integer;
  last_fixture_run timestamptz;
  last_fixture_ok timestamptz;
  failed_fixture_runs integer;
  failed_news_runs integer;
  browser_errors integer;
  top_browser_error text;
  caller_claims text := current_setting('request.jwt.claims', true);
begin
  -- Fantasy: the database tick that locks gameweeks on time.
  select lifecycle_tick_enabled into tick_enabled from app_private.fantasy_automation_settings where id;
  select * into tick from app_private.fantasy_lifecycle_heartbeat where id;
  checks := checks || jsonb_build_object('name', 'fantasy_lifecycle_tick', 'status',
    case
      when not coalesce(tick_enabled, false) then 'warn'
      when tick.last_run_at is null or tick.last_run_at < now_at - interval '15 minutes' then 'fail'
      when tick.consecutive_failures >= 3 then 'fail'
      when tick.consecutive_failures >= 1 then 'warn'
      else 'ok' end,
    'detail',
    case
      when not coalesce(tick_enabled, false) then 'switched off: gameweeks lock only when the GitHub orchestrator runs'
      when tick.last_run_at is null or tick.last_run_at < now_at - interval '15 minutes' then 'no tick for over 15 minutes'
      when tick.consecutive_failures >= 1 then tick.consecutive_failures || ' failed tick(s): ' || coalesce(tick.last_error, 'unknown')
      else 'last tick ' || to_char(tick.last_run_at at time zone 'UTC', 'HH24:MI') || ' UTC' end);

  -- Fantasy: an open gameweek long past its deadline was the 2026-09-24 signal.
  select g.sequence_number, round(extract(epoch from now_at - g.deadline_at) / 60) as minutes
  into overdue
  from app.fantasy_gameweeks g join app.fantasy_seasons s on s.id = g.fantasy_season_id
  where s.status in ('registration_open', 'active') and g.status = 'open'
    and g.deadline_at < now_at - interval '30 minutes'
  order by g.deadline_at limit 1;
  checks := checks || jsonb_build_object('name', 'fantasy_gameweek_lock', 'status',
    case when overdue.sequence_number is null then 'ok' else 'fail' end, 'detail',
    case when overdue.sequence_number is null then 'no open gameweek past its deadline'
      else 'GW' || overdue.sequence_number || ' deadline passed ' || overdue.minutes || ' min ago, still open' end);

  -- Fantasy: the deadline watch (placeholder kickoffs, no playable fixture).
  if exists (select 1 from app.fantasy_seasons where status in ('planned', 'registration_open', 'active')) then
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    begin
      watch := api.service_fantasy_deadline_watch(null, 72, 24);
      select count(*) into escalations
      from jsonb_array_elements(watch -> 'gameweeks') entry where entry ->> 'severity' = 'escalate';
      checks := checks || jsonb_build_object('name', 'fantasy_deadline_watch', 'status',
        case when escalations > 0 then 'fail' else 'ok' end, 'detail',
        case when escalations > 0 then escalations || ' gameweek(s) within 24 h of a deadline that is not authoritative'
          else 'no deadline at risk' end);
    exception when others then
      checks := checks || jsonb_build_object('name', 'fantasy_deadline_watch', 'status', 'warn',
        'detail', 'watch unavailable: ' || left(sqlerrm, 120));
    end;
    perform set_config('request.jwt.claims', coalesce(caller_claims, ''), true);
  end if;

  -- Scheduled database jobs: any failure in the last hour.
  select string_agg(j.jobname || ' x' || f.failures, ', ' order by j.jobname) into failed_jobs
  from (select jobid, count(*) as failures from cron.job_run_details
        where status = 'failed' and start_time > now_at - interval '1 hour' group by jobid) f
  join cron.job j on j.jobid = f.jobid;
  checks := checks || jsonb_build_object('name', 'cron_jobs', 'status',
    case when failed_jobs is null then 'ok' else 'fail' end, 'detail',
    coalesce('failed in the last hour: ' || failed_jobs, 'no failed run in the last hour'));

  -- News: the every-minute publication job keeps a heartbeat.
  select last_run_at into news_beat from app_private.news_schedule_heartbeat where id;
  checks := checks || jsonb_build_object('name', 'news_publication', 'status',
    case when news_beat is null or news_beat < now_at - interval '10 minutes' then 'fail' else 'ok' end,
    'detail', case when news_beat is null then 'never ran'
      else 'last run ' || to_char(news_beat at time zone 'UTC', 'HH24:MI') || ' UTC' end);

  -- News: the sitemap snapshot, refreshed every minute by news-sitemap-refresh.
  -- Past 120 seconds api.news_sitemap_entries computes the archive on every
  -- request instead (correct, but the 2026-09-25 outage was exactly that
  -- query timing out), so warn; past 10 minutes the job is paused or failing,
  -- and a paused job records no failed run for `cron_jobs` to see, so fail.
  -- A refresh taking 1.5 s is half the 3 s a visitor's live read may take.
  select computed_at, compute_ms, entry_count into sitemap
  from app_private.news_sitemap_snapshot where id;
  checks := checks || jsonb_build_object('name', 'news_sitemap', 'status',
    case
      when sitemap.computed_at is null or sitemap.computed_at < now_at - interval '10 minutes' then 'fail'
      when sitemap.computed_at < now_at - interval '120 seconds' then 'warn'
      when sitemap.compute_ms >= 1500 then 'warn'
      else 'ok' end,
    'detail',
    case
      when sitemap.computed_at is null then 'no snapshot: every /sitemap.xml request computes the whole archive'
      when sitemap.computed_at < now_at - interval '120 seconds' then 'last refresh '
        || floor(extract(epoch from now_at - sitemap.computed_at) / 60) || ' min ago (news-sitemap-refresh paused or failing): '
        || 'every /sitemap.xml request computes the whole archive'
      when sitemap.compute_ms >= 1500 then 'a refresh took ' || sitemap.compute_ms
        || ' ms: a live read would be close to the 3 s visitors get'
      else 'last refresh ' || to_char(sitemap.computed_at at time zone 'UTC', 'HH24:MI') || ' UTC, '
        || sitemap.entry_count || ' entries in ' || sitemap.compute_ms || ' ms' end);

  -- News: the licensed import (runs from GitHub) failing within a day.
  select count(*) into failed_news_runs from app_private.news_ingestion_runs
  where status::text = 'failed' and started_at > now_at - interval '24 hours';
  checks := checks || jsonb_build_object('name', 'news_import', 'status',
    case when failed_news_runs > 0 then 'warn' else 'ok' end, 'detail',
    case when failed_news_runs > 0 then failed_news_runs || ' failed import run(s) in 24 h' else 'no failed import in 24 h' end);

  -- Live scores: switched off near a match, or stale during one. The live
  -- refresh calls every 2 minutes during a match and every 5 before it
  -- (20260924200500), so 10 minutes without a fixture run is a stall.
  select * into email from app_private.notification_email_settings where id;
  select count(*) filter (where f.kickoff_at between now_at - interval '3 hours' and now_at
      and f.status not in ('finished', 'postponed', 'cancelled', 'abandoned')),
    count(*) filter (where f.kickoff_at between now_at and now_at + interval '6 hours'
      and f.status in ('scheduled', 'not_started'))
  into in_play, upcoming
  from app.fixtures f join app.seasons s on s.id = f.season_id and s.is_current;
  select max(started_at), max(started_at) filter (where status::text = 'succeeded'),
    count(*) filter (where status::text <> 'succeeded' and started_at > now_at - interval '6 hours')
  into last_fixture_run, last_fixture_ok, failed_fixture_runs
  from app_private.football_ingestion_runs where job_type = 'fixtures';
  checks := checks || jsonb_build_object('name', 'live_scores', 'status',
    case
      when not coalesce(email.football_live_refresh_enabled, false) or email.functions_base_url is null then
        case when in_play + upcoming > 0 then 'warn' else 'ok' end
      when in_play > 0 and (last_fixture_run is null or last_fixture_run < now_at - interval '10 minutes') then 'fail'
      else 'ok' end,
    'detail',
    case
      when not coalesce(email.football_live_refresh_enabled, false) or email.functions_base_url is null then
        'live refresh switched off' || case when in_play + upcoming > 0
          then ' with ' || (in_play + upcoming) || ' match(es) in play or kicking off within 6 h' else '' end
      when in_play > 0 and (last_fixture_run is null or last_fixture_run < now_at - interval '10 minutes') then
        in_play || ' match(es) in play, no fixture refresh for over 10 min'
      else 'live refresh on' end);

  -- Provider refresh (orchestrator or live refresh): recent failures, staleness.
  checks := checks || jsonb_build_object('name', 'provider_refresh', 'status',
    case
      when failed_fixture_runs >= 3 then 'fail'
      when last_fixture_ok is null or last_fixture_ok < now_at - interval '12 hours' then 'warn'
      else 'ok' end,
    'detail',
    case
      when failed_fixture_runs >= 3 then failed_fixture_runs || ' failed fixture refreshes in 6 h'
      when last_fixture_ok is null then 'no successful fixture refresh recorded'
      when last_fixture_ok < now_at - interval '12 hours' then 'last successful fixture refresh '
        || round(extract(epoch from now_at - last_fixture_ok) / 3600) || ' h ago'
      else 'last successful fixture refresh ' || to_char(last_fixture_ok at time zone 'UTC', 'HH24:MI') || ' UTC' end);

  -- Email delivery, when it is on.
  select last_run_at into email_beat from app_private.notification_email_heartbeat where id;
  select count(*) into dead_letters from app_private.notification_dead_letters where resolved_at is null;
  checks := checks || jsonb_build_object('name', 'email_delivery', 'status',
    case
      when email.mode = 'off' then 'ok'
      when email_beat is null or email_beat < now_at - interval '15 minutes' then 'fail'
      when dead_letters > 0 then 'warn'
      else 'ok' end,
    'detail',
    case
      when email.mode = 'off' then 'switched off'
      when email_beat is null or email_beat < now_at - interval '15 minutes' then 'no email tick for over 15 minutes'
      when dead_letters > 0 then dead_letters || ' undelivered email(s) waiting'
      else 'mode ' || email.mode end);

  -- Browser errors nothing caught, this hour and the last. A warning at most:
  -- the reports come from a public endpoint and must not be able to page.
  select coalesce(sum(t.reports), 0)::integer,
    (array_agg(t.code || ' on ' || t.route order by t.reports desc, t.code, t.route))[1]
  into browser_errors, top_browser_error
  from (
    select c.code, c.route, sum(c.reports) as reports
    from app_private.client_error_counts c
    where c.kind = 'unhandled' and c.bucket_hour >= date_trunc('hour', now_at) - interval '1 hour'
    group by c.code, c.route
  ) t;
  checks := checks || jsonb_build_object('name', 'browser_errors', 'status',
    case when browser_errors >= 25 then 'warn' else 'ok' end, 'detail',
    case when browser_errors = 0 then 'no unhandled browser error reported since '
        || to_char((date_trunc('hour', now_at) - interval '1 hour') at time zone 'UTC', 'HH24:MI') || ' UTC'
      else browser_errors || ' unhandled browser error(s) since '
        || to_char((date_trunc('hour', now_at) - interval '1 hour') at time zone 'UTC', 'HH24:MI')
        || ' UTC; most: ' || top_browser_error end);

  return jsonb_build_object(
    'environment', 'production',
    'generatedAt', now_at,
    'status', case
      when exists (select 1 from jsonb_array_elements(checks) c where c ->> 'status' = 'fail') then 'fail'
      when exists (select 1 from jsonb_array_elements(checks) c where c ->> 'status' = 'warn') then 'warn'
      else 'ok' end,
    'checks', checks);
end;
$$;
revoke all on function app_private.ops_health_checks() from public, anon, authenticated, service_role;

comment on function api.service_ops_health() is
  'Read-only production health: ok/warn/fail per check (Fantasy tick and locks, deadline watch, cron jobs, news publication, sitemap snapshot and import, live scores, provider refresh, email delivery, browser errors) with a one-line reason. No user data.';

-- The first snapshot, so the sitemap is served from it from now on.
select app_private.news_sitemap_refresh(true);
