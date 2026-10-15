/**
 * Builds scripts/backend/apply-20261014-sofascore-rating-release-staging.sql: the SofaScore football
 * data and Fantasy rating points release (the 20 migrations 20261013110000 to 20261014090100) for
 * STAGING (srdrflfrfpwixsllveid) only, where it was never applied.
 *
 *   bun scripts/backend/build-apply-sofascore-rating-release-staging.ts          # rewrite the script
 *   bun scripts/backend/build-apply-sofascore-rating-release-staging.ts --check  # exit 1 if it drifted
 *
 * The release body (every migration file, recorded whole and run from that record once its sha256
 * matches) is copied verbatim from apply-20261014-sofascore-rating-release.sql, the reviewed script
 * production ran. Only the frame differs, because staging is not production:
 *   * production paused its jobs with sofascore-held-maintenance-pause.sql, whose baseline is
 *     production's (every switch on); on staging every background switch is already off, so this
 *     script checks that and pauses the scheduled jobs itself, inside its own transaction;
 *   * production expected exactly 21 scheduled jobs; staging has those 21 plus the jobs the
 *     BotolaGO+ scripts add (rivals, trophies), so this script checks the job NAMES instead;
 *   * it restores every job that was active before, plus the two jobs the release adds (as the
 *     production resume script did), in the same transaction, so nothing stays paused;
 *   * it ends in the rehearsal/apply mode line of the newer scripts.
 * apply-sofascore-rating-release-staging-script.test.ts fails when the committed script differs
 * from what this builds, or when the copied body no longer matches the migration files.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
export const SCRIPT_PATH = "scripts/backend/apply-20261014-sofascore-rating-release-staging.sql";
export const RELEASE_PATH = "scripts/backend/apply-20261014-sofascore-rating-release.sql";

export const RELEASE_VERSIONS = [
  "20261013110000",
  "20261013110100",
  "20261013110200",
  "20261013120000",
  "20261013120100",
  "20261013120200",
  "20261013140000",
  "20261013140100",
  "20261013150000",
  "20261013150100",
  "20261013160000",
  "20261013160100",
  "20261013160200",
  "20261013160300",
  "20261013170000",
  "20261013170100",
  "20261013180000",
  "20261013190000",
  "20261014090000",
  "20261014090100",
] as const;

/** The 21 scheduled jobs production had before the release; staging has the same. */
export const BASELINE_JOBS = [
  "account-deletion-history-prune",
  "account-deletion-tick",
  "ai-content-generate",
  "ai-home-stories",
  "fantasy-lifecycle-tick",
  "football-live-refresh",
  "football-season-refresh",
  "manager-card-history-prune",
  "manager-card-tick",
  "news-publish-due-editions",
  "news-publish-due-editions-history-prune",
  "news-sitemap-refresh",
  "news-sitemap-refresh-history-prune",
  "notification-email-history-prune",
  "notification-email-tick",
  "notification-push-tick",
  "ops-alert-tick",
  "pepites-history-prune",
  "pepites-tick",
  "predictions-history-prune",
  "predictions-score-tick",
] as const;

/** Jobs the BotolaGO+ scripts may already have added on staging (they do not touch the release). */
export const PLUS_JOBS = [
  "rivals-history-prune",
  "rivals-tick",
  "trophies-history-prune",
  "trophies-tick",
] as const;

/** Jobs the release itself adds. */
export const RELEASE_JOBS = ["football-catalog-weekly", "fantasy-worker-tick"] as const;

const BODY_START =
  "-- ---------------------------------------------------------------------------\n-- 20261013110000_rapidapi_call_budget.sql\n";
const BODY_END =
  "-- ---------------------------------------------------------------------------\n-- Keep everything paused:";

/** The release's migration section, verbatim: from the first migration to the end of the last. */
export function releaseBody(release: string): string {
  const start = release.indexOf(BODY_START);
  const end = release.indexOf(BODY_END);
  if (start < 0 || end < 0 || end <= start) throw new Error("release script markers not found");
  return release.slice(start, end);
}

const list = (items: readonly string[]) => items.map((v) => `'${v}'`).join(", ");

export function build(): string {
  const release = readFileSync(join(root, RELEASE_PATH), "utf8");
  const body = releaseBody(release);
  const versions = list(RELEASE_VERSIONS);
  const allowedJobs = list([...BASELINE_JOBS, ...PLUS_JOBS]);
  const baselineJobs = list(BASELINE_JOBS);
  const releaseJobs = list(RELEASE_JOBS);

  return `-- ============================================================================
-- BotolaGO STAGING ONLY (srdrflfrfpwixsllveid). NEVER run this on production
-- (tkewgajrljbwgwedqsxn): production already has this release, and the script refuses there
-- (the release is recorded, and production's background switches are on).
--
-- RELEASE: SofaScore football data (PR #459) and Fantasy rating points (PR #461) on staging:
-- the 20 migrations 20261013110000 to 20261014090100, in order, in ONE transaction, copied word
-- for word from apply-20261014-sofascore-rating-release.sql (the reviewed script production ran).
-- Each file is recorded whole in supabase_migrations.schema_migrations and run from that record
-- only once its sha256 matches the repository file.
--
-- Why staging needs it: the BotolaGO+ deadline briefing (apply-20261015140000-...) builds on the
-- Fantasy rating points (20261014090000), which staging never received.
--
-- Nothing in it changes a score or a finalized result. The rating rule ships OFF (no row in
-- app_private.fantasy_rating_policy), and so do the two jobs it adds (football-catalog-weekly
-- runs under the live refresh switch, fantasy-worker-tick under its own switch; both are off on
-- staging). It replaces none of the BotolaGO+ functions.
--
-- WHAT IS DIFFERENT FROM THE PRODUCTION RUN (only the frame; the body is identical):
--   * production paused its jobs first with sofascore-held-maintenance-pause.sql, whose checks
--     are production's (every switch on). On staging every background switch is already OFF, so
--     this script checks exactly that, then pauses every scheduled job itself, in its own
--     transaction, before the release;
--   * production expected exactly 21 scheduled jobs; staging may also have the four BotolaGO+
--     jobs (rivals-tick, rivals-history-prune, trophies-tick, trophies-history-prune), so this
--     script checks the job names instead of the count;
--   * at the end it switches back on every job that was active before, plus the two jobs the
--     release adds (as production's resume script did). No separate resume script is needed.
--
-- BEFORE YOU RUN IT (AGENTS.md, "Before writing")
--   * Nothing else may be writing to staging: no GitHub Actions run in progress, no other agent,
--     Codex or SQL session working on it. The script refuses while another query is running.
--   * Nothing else needs pausing by hand: the script checks every background switch is off.
--
-- HOW TO RUN (Supabase dashboard -> BotolaGO Staging V2 -> SQL Editor)
--   1. Paste this WHOLE file and press Run. As shipped it is a REHEARSAL: everything is applied,
--      checked, and rolled back; it ends with a deliberate error that starts
--      "REHEARSAL PASSED -- nothing was saved". That error is the good result.
--   2. Confirm nothing was kept (a new query):
--        select count(*) = 0 as rolled_back from supabase_migrations.schema_migrations
--        where version in (${versions});
--      It must say true. And every job is back as it was:
--        select count(*) filter (where not active) as paused_jobs from cron.job;   -- 0
--   3. In the line \`select set_config('bg.staging_release_mode', 'rehearsal', true);\` near the
--      top, change 'rehearsal' to 'apply' and press Run again. The result row says "Applied".
--   Any "stop:" message means nothing was saved: send it, do not edit a check.
--
-- Generated by scripts/backend/build-apply-sofascore-rating-release-staging.ts; do not edit.
-- ============================================================================

begin;
set local lock_timeout = '5s';
set local statement_timeout = '300s';

-- REHEARSAL or APPLY. Change 'rehearsal' to 'apply' to save for real.
select set_config('bg.staging_release_mode', 'rehearsal', true);

do $staging_preflight$
declare
  unknown text;
  missing text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261012200100') then
    raise exception 'stop: 20261012200100 (Manager Card week one) is not applied yet';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version in (${versions})) then
    raise exception 'stop: part of this release is already recorded (is this production?): %',
      (select string_agg(version, ', ' order by version) from supabase_migrations.schema_migrations
       where version in (${versions}));
  end if;
  -- Staging's background switches are all off: nothing writes while the jobs are paused.
  if not exists (select 1 from app_private.notification_email_settings where id and mode = 'off' and not football_live_refresh_enabled)
    or not exists (select 1 from app_private.fantasy_automation_settings where id and not lifecycle_tick_enabled)
    or not exists (select 1 from app_private.manager_card_settings where id and not compute_enabled)
    or not exists (select 1 from app_private.pepites_settings where id and mode = 'off')
    or not exists (select 1 from app_private.account_deletion_settings where id and not enabled)
    or not exists (select 1 from app_private.prediction_settings where id and mode = 'off')
    or not exists (select 1 from app_private.ai_home_story_settings where id and not enabled)
    or not exists (select 1 from app_private.ai_content_settings where id and not enabled)
  then
    raise exception 'stop: a background switch is on -- this is not the staging state this script expects (is this production?)';
  end if;
  select string_agg(jobname, ', ' order by jobname) into unknown
  from cron.job where jobname not in (${allowedJobs});
  if unknown is not null then
    raise exception 'stop: unexpected scheduled jobs: %', unknown;
  end if;
  select string_agg(j, ', ' order by j) into missing
  from unnest(array[${baselineJobs}]) as j
  where not exists (select 1 from cron.job c where c.jobname = j);
  if missing is not null then
    raise exception 'stop: expected scheduled jobs are missing: %', missing;
  end if;
  if exists (select 1 from cron.job where jobname in (${releaseJobs})) then
    raise exception 'stop: a job this release adds already exists';
  end if;
  if exists (select 1 from net.http_request_queue)
    or exists (select 1 from app_private.ai_home_story_jobs where status = 'generating')
    or exists (select 1 from pg_stat_activity where pid <> pg_backend_pid() and backend_type = 'client backend' and state = 'active')
  then
    raise exception 'stop: another worker or query is still running; wait and run again';
  end if;
  -- Remember which jobs are on, then pause them all for the length of the release.
  perform set_config('bg.staging_release_active_jobs',
    coalesce((select string_agg(jobname, ',' order by jobname) from cron.job where active), ''), true);
  perform app_private.hold_scheduled_jobs();
end
$staging_preflight$;

do $staging_pause$
declare j record;
begin
  for j in select jobid from cron.job where active loop
    perform cron.alter_job(j.jobid, active := false);
  end loop;
  if exists (select 1 from cron.job where active) then
    raise exception 'stop: the scheduled jobs could not be paused';
  end if;
end
$staging_pause$;

${body}-- ---------------------------------------------------------------------------
-- Switch back on every job that was on before, plus the two jobs the release added.
-- ---------------------------------------------------------------------------
do $staging_resume$
declare
  j record;
  was_on text[] := string_to_array(nullif(current_setting('bg.staging_release_active_jobs', true), ''), ',');
begin
  for j in select jobid, jobname from cron.job
    where jobname = any (coalesce(was_on, '{}'::text[])) or jobname in (${releaseJobs})
  loop
    perform cron.alter_job(j.jobid, active := true);
  end loop;
end
$staging_resume$;

do $staging_postflight$
declare
  problems text[] := '{}';
  was_on text[] := string_to_array(nullif(current_setting('bg.staging_release_active_jobs', true), ''), ',');
begin
  if (select count(*) from supabase_migrations.schema_migrations where version in (${versions})) <> 20 then
    problems := problems || 'not all 20 history rows are recorded'::text;
  end if;
  if exists (select 1 from app_private.fantasy_rating_policy) then
    problems := problems || 'the rating rule is switched on (it must ship off)'::text;
  end if;
  if to_regprocedure('api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)') is null then
    problems := problems || 'the points save function is missing'::text;
  end if;
  if to_regprocedure('app_private.fantasy_rating_scoring_enabled(uuid)') is null then
    problems := problems || 'app_private.fantasy_rating_scoring_enabled is missing'::text;
  end if;
  if (select count(*) from cron.job where jobname in (${releaseJobs})) <> 2 then
    problems := problems || 'the two release jobs are not both scheduled'::text;
  end if;
  if exists (select 1 from cron.job
      where active is distinct from (jobname = any (coalesce(was_on, '{}'::text[])) or jobname in (${releaseJobs}))) then
    problems := problems || 'the scheduled jobs are not back as they were'::text;
  end if;
  if not exists (select 1 from app_private.notification_email_settings where id and not football_live_refresh_enabled)
    or not exists (select 1 from app_private.fantasy_automation_settings where id and not lifecycle_tick_enabled) then
    problems := problems || 'a background switch changed'::text;
  end if;
  if cardinality(problems) > 0 then
    raise exception 'stop: the release did not check out: %', problems;
  end if;
  perform set_config('bg.staging_release_state', jsonb_build_object(
    'recorded', 20,
    'jobs', (select count(*) from cron.job),
    'activeJobs', (select count(*) from cron.job where active),
    'ratingRule', 'off')::text, true);
end
$staging_postflight$;

do $staging_mode$
begin
  if current_setting('bg.staging_release_mode', true) is distinct from 'apply' then
    raise exception 'REHEARSAL PASSED -- nothing was saved: %', current_setting('bg.staging_release_state', true);
  end if;
end
$staging_mode$;

commit;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261014090100')
    then 'Applied. The SofaScore release and the Fantasy rating points are on staging; the rating rule is OFF and the jobs are back as they were. Next: apply-20261015140000-premium-deadline-briefing.sql.'
  else 'Nothing was saved.'
end as result;
`;
}

if (import.meta.main) {
  const out = build();
  const path = join(root, SCRIPT_PATH);
  if (process.argv.includes("--check")) {
    if (readFileSync(path, "utf8") !== out) {
      console.error(
        `${SCRIPT_PATH} is out of date: run bun scripts/backend/build-apply-sofascore-rating-release-staging.ts`,
      );
      process.exit(1);
    }
  } else {
    writeFileSync(path, out);
    console.log(`wrote ${SCRIPT_PATH}`);
  }
}
