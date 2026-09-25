-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20260926003400_ops_health_fantasy_coverage_and_scoring
-- (audit 2026-09-25 A08 / DB-03 and the monitoring gap under A02):
--   * two operations health checks: `fantasy_fixture_coverage` (a finished
--     match counting for Fantasy points without certified player statistics:
--     warn at 6 h after the final whistle, fail at 12 h) and `fantasy_scoring`
--     (a locked gameweek held by a counted match still not started, live or
--     suspended 3 h after its due end: warn, 6 h: fail; held by one
--     postponed, cancelled or abandoned after the lock, or moved past the
--     window: warn at once, saying until when the rules keep it in the
--     gameweek (48 h after the kickoff it was frozen with, the ruleset's
--     post-lock completion window, docs/backend/FANTASY_RULES_V1.md), and
--     fail when that window ends, naming the procedure that then resolves
--     it (scripts/backend/resolve-fantasy-postponed-assignment.sql, from
--     migration 20260926003500); or whose counted matches are all final
--     with statistics certified, still not finalized: warn 1 h, fail 8 h
--     after the last certification).
--   It replaces app_private.ops_health_checks() and creates nothing. It
--   writes no table: not the alert switch, not Vault, not a Fantasy or
--   football row. api.service_ops_health() keeps its signature, grants and
--   JSON shape.
--
-- WHEN
--   After scripts/backend/apply-20260926003050-news-sitemap-snapshot.sql (this
--   one refuses before it: the health function it replaces is the one that
--   migration installs). Any time of day; it needs well under a second.
--
--   Alerts are on in production (read 2026-09-25 at 10:02 and 14:34 UTC), and
--   repeat hourly while a check fails. If a counted match still lacks player
--   statistics 12 h after its final whistle when this is applied -- on 25 Sep
--   that was the 1-3 match of 24 Sep, final at 22:00 UTC -- the next
--   ops-alert-tick (at most 5 minutes later) sends a FAIL message naming
--   `fantasy_fixture_coverage`. That is the check doing its job, not a fault
--   of the update. The same goes for `fantasy_scoring` if a counted match of
--   the locked gameweek was postponed, cancelled or abandoned, or moved past
--   the window, and the kickoff it was frozen with is more than 48 h ago (none
--   was on 25 Sep: GW1's seven counted matches were one finished and six not
--   started). The procedure that message names arrives with
--   scripts/backend/apply-20260926003500-fantasy-resolve-postponed-after-lock.sql:
--   apply that one right after this one.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Make sure no other database work is running right now.
--      Nothing needs pausing: this writes no Fantasy, football or
--      notification table.
--   2. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one
--      transaction, checked, and then ROLLED BACK. The result row should say
--      "Rehearsal passed".
--   3. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied" and show what the two new
--      checks say now.
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, before 20260926003050, on a database missing a
--     table or column the new checks read, or where the health function or
--     the alert path (ops_alert_tick, ops_alert_message, ops_alert_configure,
--     api.service_ops_health) is not the text this update was reviewed
--     against (md5 of pg_get_functiondef: the alert path as read on production
--     on 2026-09-25, the health function as 20260926003050 installs it);
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result without writing anything: grants of the health
--     functions unchanged; the alert path byte for byte as before; the health
--     answer lists every earlier check plus the two new ones, each ok, warn or
--     fail; the alert switch is where it was; the history row is there. It
--     never calls ops_alert_tick(), so it sends nothing.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  missing text[] := '{}';
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20260926003400') then
    raise exception 'stop: migration 20260926003400 is already recorded as applied';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260926003050') then
    raise exception 'stop: migration 20260926003050 (the sitemap snapshot) is not applied yet -- run scripts/backend/apply-20260926003050-news-sitemap-snapshot.sql first';
  end if;

  if to_regclass('app.fantasy_fixture_assignments') is null
    or to_regclass('app.fantasy_gameweeks') is null
    or to_regclass('app.fantasy_seasons') is null
    or to_regclass('app.fantasy_fixture_rules') is null
    or to_regclass('app.fixtures') is null
    or to_regclass('app.teams') is null
    or to_regclass('app.player_fixture_performances') is null
    or to_regclass('app_private.historical_performance_fixture_coverage') is null
    or to_regclass('app_private.fantasy_scoring_snapshots') is null
    or to_regclass('app_private.news_sitemap_snapshot') is null
    or to_regclass('app_private.ops_alert_state') is null then
    missing := missing || 'a table'::text;
  end if;
  if cardinality(missing) = 0 and (
    select count(*) from pg_catalog.pg_attribute
    where not attisdropped and (attrelid, attname) in (
      ('app.fantasy_fixture_assignments'::regclass, 'counts_points'),
      ('app.fantasy_fixture_assignments'::regclass, 'superseded_at'),
      ('app.fantasy_fixture_assignments'::regclass, 'assigned_kickoff_at'),
      ('app.fantasy_gameweeks'::regclass, 'ends_at'),
      ('app.fantasy_seasons'::regclass, 'name'),
      ('app.fantasy_seasons'::regclass, 'ruleset_id'),
      ('app.fantasy_fixture_rules'::regclass, 'ruleset_id'),
      ('app.fantasy_fixture_rules'::regclass, 'post_lock_completion_window_hours'),
      ('app.fixtures'::regclass, 'finalized_at'),
      ('app.teams'::regclass, 'short_name'),
      ('app.player_fixture_performances'::regclass, 'source_version'),
      ('app.player_fixture_performances'::regclass, 'active'),
      ('app.player_fixture_performances'::regclass, 'created_at'),
      ('app_private.historical_performance_fixture_coverage'::regclass, 'scoring_statistics_complete'),
      ('app_private.historical_performance_fixture_coverage'::regclass, 'reconciled'),
      ('app_private.historical_performance_fixture_coverage'::regclass, 'source_version'),
      ('app_private.historical_performance_fixture_coverage'::regclass, 'updated_at'),
      ('app_private.fantasy_scoring_snapshots'::regclass, 'gameweek_id')
    )
  ) <> 18 then
    missing := missing || 'a column'::text;
  end if;
  if to_regprocedure('app_private.ops_alert_message(jsonb,boolean)') is null
    or to_regprocedure('app_private.ops_alert_tick()') is null
    or to_regprocedure('app_private.ops_alert_configure(boolean)') is null
    or to_regprocedure('app_private.ops_health_checks()') is null
    or to_regprocedure('api.service_ops_health()') is null then
    missing := missing || 'a function'::text;
  end if;
  if cardinality(missing) > 0 then
    raise exception 'stop: the database is missing what this update reads or changes: %', missing;
  end if;

  -- The health function as 20260926003050 installs it.
  if md5(pg_get_functiondef('app_private.ops_health_checks()'::regprocedure))
    <> '3c9b47ab0e10742ebaf355861006b8bd' then
    raise exception 'stop: app_private.ops_health_checks() is not the version this update replaces (20260926003050)';
  end if;
  -- The alert path as production held it on 2026-09-25 (read there). This
  -- update leaves it as it is; the postflight checks that it still is.
  if md5(pg_get_functiondef('app_private.ops_alert_tick()'::regprocedure))
      <> 'f495986586af20c728d3aa0ce2b44c10'
    or md5(pg_get_functiondef('app_private.ops_alert_message(jsonb,boolean)'::regprocedure))
      <> '26943b55b25673c0ad709af90eaf65fc'
    or md5(pg_get_functiondef('app_private.ops_alert_configure(boolean)'::regprocedure))
      <> 'cab30565c007fc69d2a9fb168e351e50'
    or md5(pg_get_functiondef('api.service_ops_health()'::regprocedure))
      <> 'dc4a7449a164a586e75ffb04d044c631' then
    raise exception 'stop: the alert path is not the version this update was reviewed against (20260924200200)';
  end if;

  -- Where the alert switch stands, to compare afterwards.
  perform set_config('bg.ops_alerts_enabled_before',
    (select enabled::text from app_private.ops_alert_state where id), true);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20260926003400, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260926003400',
  'ops_health_fantasy_coverage_and_scoring',
  array[$bg_20260926003400_file$-- BotolaGO Production V2
-- Operations health: a finished match still without player statistics, and a
-- finished gameweek still without points, are alerts (audit 2026-09-25 A08 /
-- DB-03, and the monitoring gap under A02).
--
-- Background, read on production on 2026-09-25 (read-only):
--   * Amal Tiznit 1-3 Ittihad Tanger (fixture b48265b5, GW1) was final at
--     22:00 UTC on 24 Sep. At 10:02 UTC on 25 Sep it still had no player
--     statistics: no row in app_private.historical_performance_fixture_coverage
--     and no active app.player_fixture_performances. Without them GW1 cannot be
--     scored. Nothing said so. The season orchestrator's performance step
--     records its error, lowers the run's verdict to `waiting` and exits 0
--     (scripts/backend/fantasy-season-orchestrator.ts), so its GitHub alert
--     stays quiet, and no health check looked at statistics or points.
--   * The 80 pg_cron "job startup timeout" failures (16:35-16:48 on 24 Sep,
--     05:15-06:10 on 25 Sep) are what `cron_jobs` already fails on. They went
--     unheard because ops_alert_state.enabled was false at the audit. At 10:02
--     UTC it read true, with a webhook in Vault (and still did at 14:53, with
--     repeat_after 1 h), so the checks below page from the moment they are
--     applied, and page again every hour while they keep failing. A `fail`
--     must therefore mean something to act on, not an ordinary night. (When
--     alerts were switched on is not recorded: ops_alert_state.updated_at is
--     rewritten by every tick.)
--   * Statistics and points come only from the GitHub season orchestrator
--     (or the same code dispatched by hand). It is scheduled hourly, but
--     GitHub started its scheduled runs in the 48 h to 13:43 UTC on 25 Sep
--     3.1 to 6.3 h apart (16:53, 20:18, 23:39, 04:44, 09:57, 15:02, 19:06,
--     22:21, 01:27, 07:43, 13:43), and a run may last up to its job's
--     40-minute limit (those took about a minute each).
--
-- Two checks join app_private.ops_health_checks(), in the same vocabulary as
-- the others (ok / warn / fail, one line of detail) and so through the same
-- paths: api.service_ops_health() for the GitHub watchdog, which takes every
-- check it is given by name, and app_private.ops_alert_tick() for the webhook,
-- which pages on `fail` only. Scope for both: the Fantasy season that is
-- `registration_open` or `active`, and the fixtures that count for points in
-- it (current assignment, not superseded, counts_points), because those are
-- the ones whose statistics become points.
--
--   fantasy_fixture_coverage -- a finished counted match whose player
--     statistics are not certified complete: no coverage row, or one without
--     scoring_statistics_complete and reconciled (what the scoring worker
--     requires, 20260914200719; a certified row is reconciled by constraint,
--     and both are read as the worker reads them). Warns 6 h after the final
--     whistle; fails 12 h after it. On an ordinary night a match waits up to
--     6.3 h for the next orchestrator run, so 6 h is a warning, not a page.
--     By 12 h at least one run has started and ended even at the widest gap
--     seen, and usually two or three have: still no statistics is then an
--     incident, whatever the cause, a provider outage included. The 1-3 match
--     of 24 Sep would have warned at 04:00 and failed at 10:00 UTC on 25 Sep.
--     Matches of a finalized, corrected or cancelled gameweek are out of
--     scope: their points are settled.
--
--   fantasy_scoring -- a gameweek past its lock (locked, live, provisional or
--     finalizing), in two parts.
--     While a counted match is unfinished the gameweek waits for it (the
--     lifecycle moves live -> provisional only when every one is finished,
--     20260924200000), and no scoring snapshot is not zero points, it is no
--     points yet. So the gameweek is `ok` while each unfinished match can still
--     finish on its own: its kickoff is ahead, or its due end (kickoff + 2 h)
--     is under 3 h ago. Past that the gameweek is held:
--       - by a match postponed, cancelled or abandoned after the lock, or
--         moved to a kickoff past the gameweek's window. Nothing in the
--         pipeline takes a frozen assignment out of a gameweek (the calendar
--         sync and the lock touch unfrozen ones only). The ruleset keeps it
--         in the gameweek if it is completed within 48 h of the kickoff the
--         gameweek locked with (docs/backend/FANTASY_RULES_V1.md; the
--         season's app.fantasy_fixture_rules.post_lock_completion_window_hours,
--         48 in v1.0 and v1.1), and the gameweek waits for it that long.
--         After that the owner takes it out with
--         app_private.fantasy_resolve_frozen_assignment (20260926003500),
--         run through scripts/backend/resolve-fantasy-postponed-assignment.sql,
--         which refuses before then. So this warns at once, naming the match
--         and saying until when the rules keep it, and fails when that window
--         ends, the moment the tool accepts it, naming the script: a failure
--         pages for something the owner can run. (The lateness reaches
--         GitHub earlier: the watchdog's fantasy_points and the orchestrator
--         escalate a gameweek not finalized FANTASY_COVERAGE_ESCALATE_HOURS
--         after its window ended, even while the rules still keep the match.)
--       - by a match in any other state (not started, live, suspended,
--         delayed): warns 3 h past its due end, fails 6 h past it. Such a row
--         has stopped following the match (the live refresh gives up on a
--         match it has not seen start 3 h after its kickoff), or the provider
--         has: a fault to act on. A provider refresh corrects the first -- the
--         orchestrator's, at once when it is dispatched.
--       Held by several matches, it names the one that fails (the oldest,
--       when more than one does) and counts the others.
--     Once every counted match is finished:
--       - while a match still lacks certified statistics, warns from 6 h after
--         the last final whistle and never fails: nothing can be scored yet,
--         and fantasy_fixture_coverage (warns 6 h, fails 12 h after that
--         match's whistle) pages for the cause, so it pages once, not twice;
--       - once every match's statistics are certified: ok for an hour, then
--         warns, and fails 8 h after the last certification with the
--         gameweek still not finalized. The detail names the stage it stopped
--         at. Only the orchestrator scores and finalizes (the pg_cron tick
--         stops at provisional, 20260924200100). A run that certifies
--         statistics scores them in the same pass, within its 40 minutes, so
--         an hour later that run has ended: warn. Statistics certified outside
--         a run (the manual one-fixture canary,
--         docs/backend/CURRENT_FINISHED_FIXTURE_PERFORMANCES.md) wait for the
--         next one: up to 6.3 h to its start at the widest gap seen, and its
--         40 minutes, 7 h in all; 8 h keeps an hour's margin. The runbooks
--         say to dispatch the orchestrator after a manual ingest instead,
--         which scores the gameweek at once.
--         "Certified" is when the match's current statistics version was
--         stored (its active app.player_fixture_performances rows, written in
--         the same transaction that certifies the coverage row), not the
--         coverage row's created_at, which an earlier uncertified import may
--         have set, nor its updated_at, which every re-observation of the same
--         facts moves.
--     A season has one gameweek past its lock at a time
--     (fantasy_gameweeks_one_current_idx), so several at once means several
--     Fantasy competitions. Then both checks name a gameweek with its season,
--     and this one reports the most severe (then the earliest deadline) and
--     how many more fail.
--
-- "Final whistle" is app.fixtures.finalized_at, the time BotolaGO first saw
-- the terminal state (supabase/functions/_shared/sportsmonks-fixtures.ts). A
-- finished row without it falls back to kickoff + 2 h, the earliest a
-- 90-minute match with its break and stoppage time can end.
--
-- Thresholds are written next to their checks, as in 20260924200200: the ops
-- model keeps no settings for them. Changing one is a migration, reviewed like
-- the check itself. FANTASY_COVERAGE_ESCALATE_HOURS, the GitHub variable the
-- orchestrator and the watchdog read, does not reach them.
--
-- The sitemap check `news_sitemap` (20260926003050) is kept byte for byte:
-- warns when the snapshot is 2+ min old or a refresh took 1.5 s, fails when it
-- is missing or 10+ min old. A refresh that fails raises and leaves the old
-- snapshot, so its age covers failure as well as a paused job, and the failed
-- run itself fails `cron_jobs` within the hour.
--
-- Nothing here switches alerts on or off, touches Vault or changes where a
-- message goes: ops_alert_state, ops_alert_configure(), ops_alert_tick(),
-- ops_alert_message() and the schedule are unchanged. api.service_ops_health()
-- keeps its signature, grants and JSON shape; it gains two entries in
-- `checks` and a comment.
--
-- Cost: two grouped reads over the current season's assignments (one row per
-- fixture, about 240 a season), joined by primary key to fixtures, gameweeks,
-- coverage and scoring snapshots, plus, for each certified match of the
-- gameweek past its lock, one read of player_fixture_performances_source_key
-- (fixture, version) for its certification time. Production's plans (plain
-- EXPLAIN): primary key and index lookups after a scan of the few assignment
-- and gameweek rows; estimated total cost 15.3 for the scoring read. On a
-- local database seeded with a whole season (30 gameweeks, 240 counted
-- fixtures, 239 coverage rows, 7,170 performance rows, GW30 live with 7 of 8
-- matches final), runs of 200 calls each: ops_health_checks() took 0.35-0.50
-- ms a call as 20260926003050 left it and 0.78-0.96 ms with the two checks.
-- After the thresholds were revised, on one such seed (240 counted fixtures,
-- 7,140 performance rows, GW30 held by a match stuck live), three runs each:
-- 0.94-1.14 ms a call, against 0.98-1.05 ms for the first version of the
-- checks on the same data. It runs every 5 minutes (alert tick) and every 30
-- (watchdog).

-- Health: 20260926003050's checks, unchanged, plus `fantasy_fixture_coverage`
-- and `fantasy_scoring` after `fantasy_deadline_watch`.
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
  coverage record;
  watched_seasons integer;
  scoring record;
  held_label text;
  scoring_stage text;
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

  -- Fantasy seasons the two checks below watch. A season has one gameweek
  -- past its lock at a time (fantasy_gameweeks_one_current_idx), so several
  -- gameweeks at once means several competitions: then a gameweek is named
  -- with its season.
  select count(*) into watched_seasons from app.fantasy_seasons where status in ('registration_open', 'active');

  -- Fantasy: player statistics for every finished match that counts for
  -- points (20260926003400). Complete means what the scoring worker requires:
  -- a coverage row certified scoring_statistics_complete and reconciled. The
  -- final whistle is finalized_at, or kickoff + 2 h for a finished row without
  -- one. Warn 6 h after it (GitHub has left 6.3 h between orchestrator runs),
  -- fail 12 h after it. Settled gameweeks are out of scope.
  select
    count(*) filter (where m.complete) as covered,
    count(*) filter (where not m.complete and m.final_at >= now_at - interval '6 hours') as waiting,
    count(*) filter (where not m.complete and m.final_at < now_at - interval '6 hours') as late,
    count(*) filter (where not m.complete and m.final_at < now_at - interval '12 hours') as overdue,
    count(*) filter (where not m.complete and m.partial and m.final_at < now_at - interval '6 hours') as partial,
    min(m.final_at) filter (where not m.complete) as oldest_final,
    (array_agg(m.gameweek order by m.final_at, m.gameweek) filter (where not m.complete))[1]
      as oldest_gameweek
  into coverage
  from (
    select coalesce(f.finalized_at, f.kickoff_at + interval '2 hours') as final_at,
      case when watched_seasons > 1 then s.name || ' ' else '' end || 'GW' || g.sequence_number as gameweek,
      coalesce(c.scoring_statistics_complete and c.reconciled, false) as complete,
      c.fixture_id is not null as partial
    from app.fantasy_fixture_assignments a
    join app.fantasy_seasons s on s.id = a.fantasy_season_id and s.status in ('registration_open', 'active')
    join app.fantasy_gameweeks g on g.id = a.gameweek_id
      and g.status not in ('finalized', 'corrected', 'cancelled')
    join app.fixtures f on f.id = a.fixture_id and f.status = 'finished'
    left join app_private.historical_performance_fixture_coverage c on c.fixture_id = f.id
    where a.superseded_at is null and a.counts_points
  ) m;
  checks := checks || jsonb_build_object('name', 'fantasy_fixture_coverage', 'status',
    case when coverage.overdue > 0 then 'fail' when coverage.late > 0 then 'warn' else 'ok' end,
    'detail',
    case
      when coverage.late > 0 then
        case when coverage.overdue > 0 then coverage.overdue || ' counted match(es) final 12+ h ago'
          else coverage.late || ' counted match(es) final 6+ h ago' end
        || ' without complete player statistics (oldest: ' || coverage.oldest_gameweek || ', final '
        || floor(extract(epoch from now_at - coverage.oldest_final) / 3600) || ' h ago'
        || case when coverage.partial > 0 then '; ' || coverage.partial || ' with partial statistics' else '' end
        || ')' || case when coverage.overdue > 0 then ': their Fantasy points cannot be computed' else '' end
      when coverage.covered + coverage.waiting = 0 then 'no finished match counts for Fantasy points yet'
      else coverage.covered || ' of ' || (coverage.covered + coverage.waiting)
        || ' finished counted match(es) with complete player statistics'
        || case when coverage.waiting > 0 then ' (the others final under 6 h ago)' else '' end
    end);

  -- Fantasy: points for every gameweek past its lock (20260926003400).
  -- An unfinished counted match holds the gameweek; that is play, not a
  -- defect, while the match can still finish on its own (an empty scoring
  -- table then means no points yet, never zero points). Past that it warns:
  -- at once for a match postponed, cancelled or abandoned after the lock or
  -- moved past the gameweek's window, which the rules keep in the gameweek
  -- if it is completed within the ruleset's post-lock completion window of
  -- its frozen kickoff (48 h, FANTASY_RULES_V1.md), and fails when that
  -- window ends, the moment the owner's tool accepts it
  -- (scripts/backend/resolve-fantasy-postponed-assignment.sql,
  -- 20260926003500); and 3 h after its due end (kickoff + 2 h) for a match
  -- still not started, live, suspended or delayed, which fails 6 h after it
  -- (`stuck`). Once every
  -- counted match is final: while statistics are missing, warn from 6 h after
  -- the last whistle (fantasy_fixture_coverage fails for them); once all are
  -- certified, warn an hour after the last certification (a run scores in the
  -- pass that certifies, within its 40 minutes) and fail 8 h after it (a
  -- manual ingest waits for the next run, and GitHub has left 6.3 h between
  -- runs) while the gameweek is still not finalized.
  select w.*,
    count(*) filter (where w.verdict in ('stalled', 'fail')) over () as failing,
    exists (select 1 from app_private.fantasy_scoring_snapshots snapshot where snapshot.gameweek_id = w.id)
      as scoring_started
  into scoring
  from (
    select v.*,
      case
        when v.stuck > 0 then 'stalled'
        when v.finished < v.matches and v.held > 0 then 'stalling'
        when v.finished < v.matches then 'in_play'
        when v.without_statistics > 0 then
          case when v.last_final >= now_at - interval '6 hours' then 'due' else 'warn' end
        when v.statistics_since >= now_at - interval '1 hour' then 'due'
        when v.statistics_since >= now_at - interval '8 hours' then 'unscored'
        else 'fail' end as verdict
    from (
      select m.id, m.gameweek, m.deadline_at, m.status,
        count(*) as matches,
        count(*) filter (where m.hold is null) as finished,
        count(*) filter (where m.held) as held,
        count(*) filter (where m.stuck) as stuck,
        max(m.final_at) filter (where m.hold is null) as last_final,
        count(*) filter (where not m.complete) as without_statistics,
        max(m.certified_at) as statistics_since,
        (array_agg(jsonb_build_object('fixture', m.fixture_id, 'hold', m.hold, 'status', m.fixture_status,
            'kickoff', m.kickoff_at, 'assigned', m.assigned_kickoff_at, 'window', m.completion_window,
            'resolvable', m.resolvable_at) order by m.stuck desc, m.due_end, m.fixture_id)
          filter (where m.held))[1] as held_match
      from (
        select k.*,
          k.hold in ('called_off', 'moved') or k.due_end < now_at - interval '3 hours' as held,
          case k.hold
            when 'unfinished' then k.due_end < now_at - interval '6 hours'
            when 'called_off' then k.resolvable_at <= now_at
            when 'moved' then k.resolvable_at <= now_at
            else false end as stuck
        from (
          select g.id, case when watched_seasons > 1 then s.name || ' ' else '' end || 'GW' || g.sequence_number
              as gameweek, g.deadline_at, g.status::text as status,
            f.id as fixture_id, f.status::text as fixture_status, f.kickoff_at, a.assigned_kickoff_at,
            coalesce(f.finalized_at, f.kickoff_at + interval '2 hours') as final_at,
            coalesce(c.scoring_statistics_complete and c.reconciled, false) as complete,
            case when f.status = 'finished' and c.scoring_statistics_complete and c.reconciled then coalesce(
              (select min(p.created_at) from app.player_fixture_performances p
               where p.fixture_id = f.id and p.active and p.source_version = c.source_version),
              c.updated_at) end as certified_at,
            o.hold,
            case o.hold
              when 'called_off' then a.assigned_kickoff_at + interval '2 hours'
              when 'moved' then a.assigned_kickoff_at + interval '2 hours'
              when 'unfinished' then f.kickoff_at + interval '2 hours' end as due_end,
            -- The ruleset's post-lock completion window (48 h in v1.0 and
            -- v1.1; 48 h too for a ruleset without one, which the tool then
            -- refuses with fantasy_fixture_rules_missing), from the kickoff
            -- the gameweek locked with. The tool reads the same value.
            coalesce(fixture_rules.post_lock_completion_window_hours, 48) as completion_window,
            a.assigned_kickoff_at
              + make_interval(hours => coalesce(fixture_rules.post_lock_completion_window_hours, 48))
              as resolvable_at
          from app.fantasy_gameweeks g
          join app.fantasy_seasons s on s.id = g.fantasy_season_id and s.status in ('registration_open', 'active')
          left join app.fantasy_fixture_rules fixture_rules on fixture_rules.ruleset_id = s.ruleset_id
          join app.fantasy_fixture_assignments a on a.gameweek_id = g.id
            and a.superseded_at is null and a.counts_points
          join app.fixtures f on f.id = a.fixture_id
          left join app_private.historical_performance_fixture_coverage c on c.fixture_id = f.id
          cross join lateral (select case
              when f.status = 'finished' then null
              when f.status in ('postponed', 'cancelled', 'abandoned') then 'called_off'
              when f.kickoff_at > a.assigned_kickoff_at and f.kickoff_at > g.ends_at then 'moved'
              else 'unfinished' end as hold) o
          where g.status in ('locked', 'live', 'provisional', 'finalizing')
        ) k
      ) m
      group by m.id, m.gameweek, m.deadline_at, m.status
    ) v
  ) w
  order by case w.verdict when 'stalled' then 0 when 'fail' then 0 when 'stalling' then 1 when 'warn' then 1
    when 'unscored' then 1 when 'due' then 2 else 3 end, w.deadline_at, w.id
  limit 1;
  if scoring.verdict in ('stalled', 'stalling') then
    select home.short_name || ' v ' || away.short_name into held_label
    from app.fixtures f
    join app.teams home on home.id = f.home_team_id
    join app.teams away on away.id = f.away_team_id
    where f.id = (scoring.held_match ->> 'fixture')::uuid;
  end if;
  -- Where a gameweek whose statistics are all certified stopped.
  scoring_stage := case
    when scoring.status in ('locked', 'live') then 'still ' || scoring.status || ', not handed to scoring'
    when scoring.status = 'finalizing' then 'points sealed, finalization not finished'
    when scoring.scoring_started then 'scoring started, not finished'
    else 'no scoring run has stored anything' end;
  checks := checks || jsonb_build_object('name', 'fantasy_scoring', 'status',
    case when scoring.verdict in ('stalled', 'fail') then 'fail'
      when scoring.verdict in ('stalling', 'warn', 'unscored') then 'warn' else 'ok' end,
    'detail',
    case
      when scoring.verdict in ('stalled', 'stalling') then scoring.gameweek || ': counted match '
        || coalesce(held_label, 'fixture ' || left(scoring.held_match ->> 'fixture', 8)) || ' '
        || case scoring.held_match ->> 'hold'
          when 'called_off' then (scoring.held_match ->> 'status') || ' after the lock (due '
            || to_char((scoring.held_match ->> 'assigned')::timestamptz at time zone 'UTC', 'DD Mon HH24:MI') || ' UTC)'
          when 'moved' then 'moved to '
            || to_char((scoring.held_match ->> 'kickoff')::timestamptz at time zone 'UTC', 'DD Mon HH24:MI')
            || ' UTC, past the gameweek''s window (due '
            || to_char((scoring.held_match ->> 'assigned')::timestamptz at time zone 'UTC', 'DD Mon HH24:MI') || ' UTC)'
          else 'still ' || (scoring.held_match ->> 'status') || ' '
            || floor(extract(epoch from now_at - (scoring.held_match ->> 'kickoff')::timestamptz) / 3600)
            || ' h after its kickoff' end
        || case
          when scoring.held_match ->> 'hold' not in ('called_off', 'moved') then
            '; points wait until it finishes or its Fantasy assignment is resolved'
          when scoring.verdict = 'stalling' then
            '; the rules keep it in the gameweek if it is completed within '
            || (scoring.held_match ->> 'window') || ' h, by '
            || to_char((scoring.held_match ->> 'resolvable')::timestamptz at time zone 'UTC', 'DD Mon HH24:MI')
            || ' UTC; after that, this fails and scripts/backend/resolve-fantasy-postponed-assignment.sql takes it out'
          else '; not completed within the ' || (scoring.held_match ->> 'window')
            || ' h the rules allow: take it out with scripts/backend/resolve-fantasy-postponed-assignment.sql'
          end
        || case when scoring.held > 1 then ' (+' || (scoring.held - 1) || ' more match(es))' else '' end
        || case when scoring.verdict = 'stalled' and scoring.failing > 1
          then ' (+' || (scoring.failing - 1) || ' more gameweek(s))' else '' end
      else case scoring.verdict
        when 'fail' then scoring.gameweek || ': every counted match final for '
          || floor(extract(epoch from now_at - scoring.last_final) / 3600) || ' h, statistics complete for '
          || floor(extract(epoch from now_at - scoring.statistics_since) / 3600) || ' h, no final points: '
          || scoring_stage
          || case when scoring.failing > 1 then ' (+' || (scoring.failing - 1) || ' more gameweek(s))' else '' end
        when 'unscored' then scoring.gameweek || ': statistics complete for '
          || floor(extract(epoch from now_at - scoring.statistics_since) / 3600) || ' h, no final points yet ('
          || scoring_stage || '): only a Fantasy season orchestrator run scores; fails at '
          || to_char((scoring.statistics_since + interval '8 hours') at time zone 'UTC', 'HH24:MI') || ' UTC'
        when 'warn' then scoring.gameweek || ': every counted match final for '
          || floor(extract(epoch from now_at - scoring.last_final) / 3600) || ' h, no points yet: '
          || scoring.without_statistics || ' match(es) still without complete player statistics (fantasy_fixture_coverage)'
        when 'due' then scoring.gameweek || ': every counted match final, points due by '
          || to_char(case when scoring.without_statistics > 0 then scoring.last_final + interval '6 hours'
               else scoring.statistics_since + interval '1 hour' end at time zone 'UTC', 'HH24:MI')
          || ' UTC'
        when 'in_play' then scoring.gameweek || ' ' || scoring.status || ': ' || scoring.finished
          || ' of ' || scoring.matches || ' counted matches final; points come after the last one'
        else 'no gameweek in play or waiting for points' end
    end);

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
  'Read-only production health: ok/warn/fail per check (Fantasy tick and locks, deadline watch, player statistics of finished counted matches, points of finished gameweeks, cron jobs, news publication, sitemap snapshot and import, live scores, provider refresh, email delivery, browser errors) with a one-line reason. No user data.';
$bg_20260926003400_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20260926003400 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20260926003400'
  );
begin
  if encode(sha256(convert_to(part_20260926003400, 'UTF8')), 'hex')
    is distinct from '31e4cd4a8c06973c8a17d62dd3801f720915ab412ddceff5bc4fe15fc7661155' then
    raise exception 'stop: 20260926003400 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20260926003400;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (reads only)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  api_role text;
  health jsonb;
  names text[];
  earlier constant text[] := array['fantasy_lifecycle_tick', 'fantasy_gameweek_lock', 'cron_jobs',
    'news_publication', 'news_sitemap', 'news_import', 'live_scores', 'provider_refresh',
    'email_delivery', 'browser_errors'];
  added constant text[] := array['fantasy_fixture_coverage', 'fantasy_scoring'];
  line text;
begin
  -- Grants: the health read stays the watchdog's (service_role) only; the
  -- checks stay the database owner's.
  foreach api_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(api_role, 'app_private.ops_health_checks()', 'execute') then
      problems := problems || (api_role || ' can run an owner-only health function');
    end if;
  end loop;
  if not has_function_privilege('service_role', 'api.service_ops_health()', 'execute')
    or has_function_privilege('anon', 'api.service_ops_health()', 'execute')
    or has_function_privilege('authenticated', 'api.service_ops_health()', 'execute') then
    problems := problems || 'api.service_ops_health() is executable by the wrong roles'::text;
  end if;

  -- The alert path is untouched.
  if md5(pg_get_functiondef('app_private.ops_alert_tick()'::regprocedure))
      <> 'f495986586af20c728d3aa0ce2b44c10'
    or md5(pg_get_functiondef('app_private.ops_alert_message(jsonb,boolean)'::regprocedure))
      <> '26943b55b25673c0ad709af90eaf65fc'
    or md5(pg_get_functiondef('app_private.ops_alert_configure(boolean)'::regprocedure))
      <> 'cab30565c007fc69d2a9fb168e351e50'
    or md5(pg_get_functiondef('api.service_ops_health()'::regprocedure))
      <> 'dc4a7449a164a586e75ffb04d044c631' then
    problems := problems || 'the alert path changed'::text;
  end if;
  if (select enabled::text from app_private.ops_alert_state where id)
    is distinct from current_setting('bg.ops_alerts_enabled_before', true) then
    problems := problems || 'the alert switch moved'::text;
  end if;

  -- The health answer: every earlier check, the two new ones, all well formed.
  health := app_private.ops_health_checks();
  select array_agg(c ->> 'name') into names from jsonb_array_elements(health -> 'checks') c;
  if health ->> 'environment' is distinct from 'production'
    or not (names @> earlier) or not (names @> added)
    or exists (select 1 from jsonb_array_elements(health -> 'checks') c
      where c ->> 'status' is null or c ->> 'status' not in ('ok', 'warn', 'fail')
        or coalesce(c ->> 'detail', '') = '') then
    problems := problems || 'the health answer is not what the migration defines'::text;
  end if;
  for line in
    select (c ->> 'name') || ' [' || (c ->> 'status') || ']: ' || (c ->> 'detail')
    from jsonb_array_elements(health -> 'checks') c where c ->> 'name' = any (added)
  loop
    raise notice '%', line;
  end loop;

  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260926003400') then
    problems := problems || 'history row missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20260926003400')
    then 'Applied. Health now watches player statistics and points: ' || (
      select string_agg((c ->> 'name') || ' [' || (c ->> 'status') || ']: ' || (c ->> 'detail'), ' | '
        order by c ->> 'name')
      from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c
      where c ->> 'name' in ('fantasy_fixture_coverage', 'fantasy_scoring'))
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
