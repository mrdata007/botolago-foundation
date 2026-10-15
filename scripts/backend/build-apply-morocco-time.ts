/**
 * Builds the five guarded owner scripts that put Morocco's clock into the database:
 *
 *   apply-20261016090000-morocco-time-helpers.sql
 *   apply-20261016090100-morocco-time-deadline-text.sql
 *   apply-20261016090200-morocco-time-email-planner-quiet-hours.sql
 *   apply-20261016090300-morocco-time-pepites.sql
 *   apply-20261016090400-morocco-time-read-models.sql
 *
 *   bun scripts/backend/build-apply-morocco-time.ts          # rewrite the scripts
 *   bun scripts/backend/build-apply-morocco-time.ts --check  # exit 1 if one drifted
 *
 * Each script carries its migration file byte for byte, once, with its sha256, and pins the
 * function text it replaces (md5 of pg_proc.prosrc, computed here from the LATEST repository
 * definition) so it refuses to run on a database that is not in the state it was reviewed
 * against. The *-script.test.ts files recompute every pin from the repository files and fail
 * when a committed script differs from what this builds.
 *
 * Rerun after a migration file changes (only while it is unapplied everywhere: CLAUDE.md,
 * "Migrations").
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const md5 = (text: string) => createHash("md5").update(text, "utf8").digest("hex");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const q = (text: string) => `'${text.replaceAll("'", "''")}'`;

/** The text between the first `$$` after the match and the `$$` that closes it (= pg_proc.prosrc). */
export function bodyOf(source: string, header: RegExp): string {
  const match = header.exec(source);
  if (!match) throw new Error(`definition not found: ${header}`);
  const start = source.indexOf("$$", match.index + match[0].length) + 2;
  return source.slice(start, source.indexOf("$$", start));
}

/** The header of a definition: from `create` to the first `$$` (attributes live there). */
function headerOf(source: string, header: RegExp): string {
  const match = header.exec(source);
  if (!match) throw new Error(`definition not found: ${header}`);
  return source.slice(match.index, source.indexOf("$$", match.index + match[0].length));
}

export type Holders = "owner only" | "anon, authenticated, service_role" | "authenticated";
const HOLDERS: Record<Holders, string> = {
  "owner only": "'{}'::text[]",
  "anon, authenticated, service_role": "array['anon', 'authenticated', 'service_role']",
  authenticated: "array['authenticated']",
};

export interface FnSpec {
  /** Text `to_regprocedure` reads. */
  signature: string;
  /** The migration that carries the LATEST definition before the new one, and where in it. */
  oldFile: string;
  oldHeader: RegExp;
  /** The same definition in the new migration. */
  newHeader: RegExp;
  holders: Holders;
  /** Text the new source must contain, and text it must not contain any more. */
  required: string[];
  forbidden: string[];
}

export interface ScriptSpec {
  version: string;
  name: string;
  /** Free text of the script's title line and the sections of its header. */
  summary: string;
  when: string;
  pause: string;
  whatItDoes: string;
  functions: FnSpec[];
  /** Helper-migration scripts only: create these, and expect none of them yet. */
  creates?: string[];
  /** Statements run after the migration, raising when the answer is not the expected one. */
  probes: string;
  /** Tables whose whole content is hashed before and after (settings, never printed). */
  watched: { label: string; sql: string }[];
  /** A select list for the rehearsal's result row, appended to the sentence. */
  resultNote: string;
  /** Postflight text printed with raise notice. */
  notice: string;
  /** Preflight extras (raise exception when the database is not what the script needs). */
  extraPreflight?: string;
  /** Names of migrations that must be recorded. */
  requires: string[];
}

export const RUNBOOK = "docs/production/MOROCCO_TIME_FIX_OWNER_RUNBOOK.md";

export const HELPER_VERSION = "20261016090000";
export const HELPER_NAME = "morocco_time_helpers";
export const HELPER_FILE = `supabase/migrations/${HELPER_VERSION}_${HELPER_NAME}.sql`;

export const HELPERS: { signature: string; name: string; header: RegExp; vol: "i" | "s" }[] = [
  ["morocco_permanent_utc_from()", "morocco_permanent_utc_from", "i"],
  ["morocco_time_zone_label()", "morocco_time_zone_label", "i"],
  ["morocco_zone_name(timestamp with time zone)", "morocco_zone_name", "s"],
  ["morocco_local(timestamp with time zone)", "morocco_local", "s"],
  ["morocco_local_date(timestamp with time zone)", "morocco_local_date", "s"],
  ["morocco_instant(timestamp without time zone)", "morocco_instant", "s"],
  ["morocco_day_start(date)", "morocco_day_start", "s"],
  ["morocco_day_end(date)", "morocco_day_end", "s"],
  ["zone_local(timestamp with time zone,text)", "zone_local", "s"],
  ["zone_instant(timestamp without time zone,text)", "zone_instant", "s"],
].map(([signature, name, vol]) => ({
  signature: `app_private.${signature}`,
  name: name!,
  header: new RegExp(`create or replace function app_private\\.${name}\\(`),
  vol: vol as "i" | "s",
}));

/** The probes every script runs on the helpers: the app's rule, written as SQL. */
const HELPER_PROBES = `
  if app_private.morocco_local(timestamptz '2026-10-15 12:00+00') is distinct from timestamp '2026-10-15 12:00:00'
    or app_private.morocco_local(timestamptz '2026-09-20 00:59:59+00') is distinct from timestamp '2026-09-20 01:59:59'
    or app_private.morocco_local(timestamptz '2026-09-20 01:00:00+00') is distinct from timestamp '2026-09-20 01:00:00'
    or app_private.morocco_local(timestamptz '2026-03-10 12:00+00') is distinct from timestamp '2026-03-10 12:00:00'
    or app_private.morocco_local(timestamptz '2026-01-15 12:00+00') is distinct from timestamp '2026-01-15 13:00:00'
    or app_private.morocco_local(timestamptz '2027-02-10 12:00+00') is distinct from timestamp '2027-02-10 12:00:00' then
    raise exception 'stop: the Morocco clock helpers do not give the application''s answers';
  end if;
  if app_private.morocco_instant(timestamp '2026-10-15 12:00') is distinct from timestamptz '2026-10-15 12:00+00'
    or app_private.morocco_instant(timestamp '2026-09-20 00:30') is distinct from timestamptz '2026-09-19 23:30+00'
    or app_private.morocco_day_start(date '2026-09-20') is distinct from timestamptz '2026-09-19 23:00+00'
    or app_private.morocco_day_end(date '2026-09-20') is distinct from timestamptz '2026-09-21 00:00+00'
    or app_private.morocco_local_date(timestamptz '2026-10-15 23:30+00') is distinct from date '2026-10-15' then
    raise exception 'stop: the Morocco day helpers do not give the application''s answers';
  end if;
  if app_private.zone_local(timestamptz '2026-10-12 18:30+00', 'Africa/Casablanca') is distinct from timestamp '2026-10-12 18:30:00'
    or app_private.zone_local(timestamptz '2026-10-12 18:30+00', 'Europe/Paris') is distinct from timestamp '2026-10-12 20:30:00'
    or app_private.zone_instant(timestamp '2026-10-12 20:00', 'Europe/Paris') is distinct from timestamptz '2026-10-12 18:00+00' then
    raise exception 'stop: the zone helpers do not give the expected answers';
  end if;`;

const FANOUT_SIG =
  "app_private.notification_push_fanout(timestamp with time zone,text,uuid[],timestamp with time zone,text,timestamp with time zone,integer)";
const MAIL_FANOUT_SIG =
  "app_private.notification_email_fanout(timestamp with time zone,text,uuid[],timestamp with time zone,integer)";

const fn = (
  signature: string,
  oldFile: string,
  headerSource: string,
  holders: Holders,
  required: string[],
  forbidden: string[],
  keyword = "create or replace function",
): FnSpec => ({
  signature,
  oldFile,
  oldHeader: new RegExp(`^create (or replace )?function ${headerSource}\\(`, "m"),
  newHeader: new RegExp(`^${keyword} ${headerSource}\\(`, "m"),
  holders,
  required,
  forbidden,
});

const NOTIFICATION_CALLERS = `--   * notification-push-tick (every minute): notification_push_tick -> notification_push_plan /
--     notification_push_fanout, and notification_email_plan while e-mail is not the one planning;
--   * notification-email-tick (every 5 minutes): notification_email_tick -> notification_email_plan,
--     notification_email_fanout.`;

export const SCRIPTS: ScriptSpec[] = [
  {
    version: HELPER_VERSION,
    name: HELPER_NAME,
    summary: `Morocco's clock inside the database: ten small helper functions in app_private
-- (app_private.morocco_local and its siblings). They apply the application's rule: Morocco is
-- UTC+0 from 2026-09-20T01:00:00Z, and before that the database's own Africa/Casablanca data
-- are asked, on which every tz release agrees. The rule is confirmed by the owner (2026-10-15).`,
    when: `   First of the five Morocco-time scripts; the other four need it (they refuse without it).
--   Any time of day; it takes well under a second. Nothing else has to be applied before it.
--   Why: both databases carry time-zone data older than IANA tz 2026c, so
--   \`timestamptz '2026-10-15 12:00+00' at time zone 'Africa/Casablanca'\` answers 13:00 there while
--   the application shows 12:00. This script changes NO existing behaviour: it only adds functions.
--   The four scripts after it replace the functions that use the old zone, one family each.`,
    pause: `   Nothing needs pausing: the script adds ten functions to app_private and records itself in
--   supabase_migrations.schema_migrations. It writes no table that a cron job, a workflow or the
--   application writes, and nothing calls the new functions yet. Still make sure no other schema
--   change (another apply script, a migration, a deploy) is running right now: a rehearsal that
--   ends in rollback takes locks too. The script compares the cron job list before and after and
--   stops if it moved.`,
    whatItDoes: `   * refuses to run twice, and where any of the ten functions already exists;
--   * records the migration file in supabase_migrations.schema_migrations, whole as statements[1],
--     and runs it from that record once its sha256 matches the repository file;
--   * checks the result without writing anything: each function's source is the one in the file,
--     security invoker, empty search_path, not volatile, callable by nobody but the owner; the
--     helpers answer the application's rule for the instants of the parity table (2026-10-15
--     12:00Z reads 12:00; the last second of UTC+1 reads 01:59:59; the first of UTC+0 reads 01:00:00;
--     Ramadan 2026 reads UTC+0; a winter day reads UTC+1; Ramadan 2027 reads UTC+0); the cron job
--     list is where it was; the history row is there.`,
    functions: [],
    creates: HELPERS.map((helper) => helper.signature),
    probes: HELPER_PROBES,
    watched: [],
    resultNote: `' The database still says, for 12:00 UTC on 2026-10-15, Africa/Casablanca = '
      || (timestamptz '2026-10-15 12:00+00' at time zone 'Africa/Casablanca')::text
      || ' (the application says 12:00; the helpers will say 12:00 whichever this reads).'`,
    notice: "the helpers answer the application's rule",
    requires: [],
  },
  {
    version: "20261016090100",
    name: "morocco_time_deadline_text",
    summary: `The Fantasy deadline printed in a notification follows Morocco's clock. It replaces TWO
-- functions, each with only the zone expression changed: app_private.notification_push_fanout (the
-- push and in-app text of deadline_24h and deadline_1h) and app_private.notification_email_fanout
-- (the in-app / e-mail text of deadline_24h). Before: a deadline of 18:30Z printed '12/10 19:30',
-- an hour LATE. After: '12/10 18:30'.`,
    when: `   After 20261016090000 (the helpers) is committed. Before push or e-mail goes to real readers:
--   no deadline notification has been written since 2026-09-20 (e-mail is off, push is testers
--   only), so nothing wrong is in the inbox yet. Any time of day; well under a second.`,
    pause: `   Nothing needs pausing: the script only replaces the definition of two functions (pg_proc) and
--   records itself in supabase_migrations.schema_migrations. It writes no notification, event,
--   delivery or setting table. The jobs that CALL the functions only see the new text on their
--   next call:
${NOTIFICATION_CALLERS}
--   A call already running finishes on the old text. Still make sure no other schema change is
--   running right now. The script compares the e-mail and push switches and the cron job list
--   before and after and stops if they moved.`,
    whatItDoes: `   * refuses to run twice, before the helpers are recorded and working, and where either
--     function is not byte for byte the text the repository's latest migration defines
--     (md5 of its source), is not security definer with an empty search_path, or is callable by
--     anyone but the owner;
--   * records the migration file in supabase_migrations.schema_migrations and runs it from that
--     record once its sha256 matches the repository file;
--   * checks the result without writing anything: each source is the new one, has no raw
--     \`at time zone audience.timezone\` left and calls app_private.zone_local; attributes,
--     privileges and comments are unchanged; the deadline text expression gives '12/10 18:30' for
--     18:30Z on 2026-10-12; the e-mail and push switches and the cron job list are where they were.
--     It never calls either fan-out (they write), so it sends nothing.`,
    functions: [
      fn(
        FANOUT_SIG,
        "20261005135000_push_remaining_alerts.sql",
        "app_private\\.notification_push_fanout",
        "owner only",
        ["app_private.zone_local("],
        ["at time zone audience.timezone"],
      ),
      fn(
        MAIL_FANOUT_SIG,
        "20260926110100_pepites_weekly_email.sql",
        "app_private\\.notification_email_fanout",
        "owner only",
        ["app_private.zone_local("],
        ["at time zone audience.timezone"],
      ),
    ],
    probes: `${HELPER_PROBES}
  if to_char(app_private.zone_local(timestamptz '2026-10-12 18:30+00', 'Africa/Casablanca'), 'DD/MM HH24:MI') is distinct from '12/10 18:30'
    or to_char(app_private.zone_local(timestamptz '2026-10-12 18:30+00', 'Africa/Casablanca'), 'HH24:MI') is distinct from '18:30' then
    raise exception 'stop: the deadline text is not the one the application shows';
  end if;`,
    watched: [
      {
        label: "notification_email_settings",
        sql: "select coalesce((select md5(to_jsonb(s)::text) from app_private.notification_email_settings s limit 1), '')",
      },
      {
        label: "notification_push_settings",
        sql: "select coalesce((select md5(to_jsonb(s)::text) from app_private.notification_push_settings s limit 1), '')",
      },
    ],
    resultNote: `' For a reader whose zone is Africa/Casablanca a deadline of 18:30Z on 2026-10-12 reads '
      || to_char(app_private.zone_local(timestamptz '2026-10-12 18:30+00', 'Africa/Casablanca'), 'DD/MM HH24:MI')
      || ' by the helper, and '
      || to_char(timestamptz '2026-10-12 18:30+00' at time zone 'Africa/Casablanca', 'DD/MM HH24:MI')
      || ' by the raw zone the functions use until this is committed.'`,
    notice: "the deadline text",
    requires: [HELPER_VERSION],
    extraPreflight: `  -- Who would see the new text: accounts by notification zone (counts only).
  raise notice 'accounts with notification zone Africa/Casablanca: %, other zones: %',
    (select count(*) from app.user_preferences where notification_timezone = 'Africa/Casablanca'),
    (select count(*) from app.user_preferences where notification_timezone <> 'Africa/Casablanca');`,
  },
  {
    version: "20261016090200",
    name: "morocco_time_email_planner_quiet_hours",
    summary: `The e-mail planner and quiet hours follow Morocco's clock. It replaces TWO functions, each
-- with only the zone expressions changed: app_private.notification_email_plan (match day, the
-- 10:00 preview, the 08:00 results floor, the round preview) and
-- app_private.defer_for_quiet_hours (a reader's quiet hours and the instant they end).
-- Before: every send came an hour early and a 23:00-24:00 UTC kick-off went into the next day's
-- e-mail. After: they follow the clock on the wall.`,
    when: `   After 20261016090000 (the helpers) is committed. Before e-mail is switched on for readers
--   (it is off today, and nobody has quiet hours on). Any time of day; well under a second.`,
    pause: `   Nothing needs pausing: the script only replaces the definition of two functions (pg_proc) and
--   records itself in supabase_migrations.schema_migrations. It writes no notification, event,
--   delivery or setting table. The jobs that CALL the functions see the new text on their next
--   call:
${NOTIFICATION_CALLERS}
--   * manager-card-tick (every 15 minutes) and, where applied, rivals-tick: both call
--     defer_for_quiet_hours when they write a notification.
--   A call already running finishes on the old text. Still make sure no other schema change is
--   running right now. The script compares the e-mail and push switches and the cron job list
--   before and after and stops if they moved.`,
    whatItDoes: `   * refuses to run twice, before the helpers are recorded and working, and where either
--     function is not byte for byte the text the repository's latest migration defines
--     (md5 of its source), changed attributes (security definer / invoker, volatility, empty
--     search_path), or is callable by anyone but the owner;
--   * records the migration file in supabase_migrations.schema_migrations and runs it from that
--     record once its sha256 matches the repository file;
--   * checks the result without writing anything: each source is the new one with no raw
--     zone expression left; attributes, privileges and comments are unchanged;
--     defer_for_quiet_hours answers 22:30Z -> 07:00Z and 21:30Z -> 21:30Z for a 22:00-07:00 window
--     in Africa/Casablanca; the switches and the cron job list are where they were. It never
--     calls the planner (it writes events), so it plans and sends nothing.`,
    functions: [
      fn(
        "app_private.notification_email_plan(timestamp with time zone)",
        "20260924140100_notification_email_delivery.sql",
        "app_private\\.notification_email_plan",
        "owner only",
        ["app_private.morocco_local(", "app_private.morocco_local_date("],
        ["local_zone", "Africa/Casablanca", "at time zone"],
      ),
      fn(
        "app_private.defer_for_quiet_hours(timestamp with time zone,text,boolean,time without time zone,time without time zone,boolean)",
        "20260720121727_notification_delivery_runtime.sql",
        "app_private\\.defer_for_quiet_hours",
        "owner only",
        ["app_private.zone_local(", "app_private.zone_instant("],
        ["at time zone"],
      ),
    ],
    probes: `${HELPER_PROBES}
  if app_private.defer_for_quiet_hours(timestamptz '2026-10-15 22:30+00', 'Africa/Casablanca', true, time '22:00', time '07:00', false)
       is distinct from timestamptz '2026-10-16 07:00+00'
    or app_private.defer_for_quiet_hours(timestamptz '2026-10-15 21:30+00', 'Africa/Casablanca', true, time '22:00', time '07:00', false)
       is distinct from timestamptz '2026-10-15 21:30+00'
    or app_private.defer_for_quiet_hours(timestamptz '2026-10-15 21:30+00', 'Europe/Paris', true, time '22:00', time '07:00', false)
       is distinct from timestamptz '2026-10-16 05:00+00' then
    raise exception 'stop: quiet hours do not follow Morocco''s clock';
  end if;`,
    watched: [
      {
        label: "notification_email_settings",
        sql: "select coalesce((select md5(to_jsonb(s)::text) from app_private.notification_email_settings s limit 1), '')",
      },
      {
        label: "notification_push_settings",
        sql: "select coalesce((select md5(to_jsonb(s)::text) from app_private.notification_push_settings s limit 1), '')",
      },
    ],
    resultNote: `' A 22:00-07:00 quiet window in Africa/Casablanca, asked at 22:30Z on 2026-10-15, ends at '
      || app_private.defer_for_quiet_hours(timestamptz '2026-10-15 22:30+00', 'Africa/Casablanca', true, time '22:00', time '07:00', false)::text
      || ' by the function as it stands now; the right answer is 2026-10-16 07:00:00+00 (helper: '
      || app_private.zone_instant(timestamp '2026-10-16 07:00', 'Africa/Casablanca')::text || ').'`,
    notice: "the planner and quiet hours",
    requires: [HELPER_VERSION],
    extraPreflight: `  -- Who is affected: readers with quiet hours on (counts only).
  raise notice 'readers with quiet hours on: %',
    (select count(*) from app.user_preferences where quiet_hours_enabled);`,
  },
  {
    version: "20261016090300",
    name: "morocco_time_pepites",
    summary: `Pépites times of day follow Morocco's clock. It replaces FIVE functions, each with only the
-- zone expression changed: pepites_local_at (Monday + local time -> instant), pepites_create_draft
-- (the "Publication prévue" time in the staff notice), pepites_tick_draft (Monday, the draft hour),
-- pepites_tick_daily (the day of the daily sweep) and pepites_tick (the date in an error notice's
-- key). Before: pepites_local_at('2026-10-19', '20:00') = 19:00Z, so the weekly Top 10 went out at
-- 19:00 Moroccan time and the draft at 11:00. After: 20:00 and 12:00. The sealed scoring
-- (pepites_source_players, pepites_compute_v1) is deliberately NOT touched.`,
    when: `   After 20261016090000 (the helpers) is committed. Pépites runs on this database (mode public),
--   so choose a moment that is NOT within an hour of the Monday draft (12:00 Moroccan time) or the
--   Monday publication (20:00) of a week that has an edition drafted or scheduled; the rehearsal's
--   NOTICE lists those. An edition that is already scheduled keeps the scheduled_for it was given;
--   see the runbook. Any other time of day is fine; well under a second.`,
    pause: `   Nothing needs pausing: the script only replaces the definition of five functions (pg_proc) and
--   records itself in supabase_migrations.schema_migrations. It writes no Pépites table, no
--   fixture, player or membership row, no setting. The job that CALLS the functions is
--   pepites-tick (every 15 minutes, writes only while pepites_settings.mode is not off): a tick
--   already running finishes on the old text, the next one uses the new. If you prefer, pause it
--   for the minutes the script runs with \`select app_private.pepites_configure('off', null);\` and
--   restore the previous mode afterwards (AGENTS.md); it is not required. Still make sure no other
--   schema change is running right now. The script compares the Pépites switches, the editions
--   and the cron job list before and after and stops if they moved.`,
    whatItDoes: `   * refuses to run twice, before the helpers are recorded and working, and where any of the
--     five functions is not byte for byte the text the repository's latest migration defines
--     (md5 of its source), changed attributes, or is callable by anyone but the owner;
--   * records the migration file in supabase_migrations.schema_migrations and runs it from that
--     record once its sha256 matches the repository file;
--   * checks the result without writing anything: each source is the new one with no
--     Africa/Casablanca left; attributes, privileges and comments are unchanged;
--     pepites_local_at('2026-10-19', '20:00') = 2026-10-19 20:00Z and ('12:00') = 12:00Z; the
--     Pépites switches, the editions and the cron job list are where they were. It never calls
--     the tick functions (they write).`,
    functions: [
      fn(
        "app_private.pepites_local_at(date,time without time zone)",
        "20260926100000_pepites_editions.sql",
        "app_private\\.pepites_local_at",
        "owner only",
        ["app_private.morocco_instant("],
        ["Africa/Casablanca", "at time zone"],
        "create or replace function",
      ),
      fn(
        "app_private.pepites_create_draft(uuid,date,uuid)",
        "20260926100000_pepites_editions.sql",
        "app_private\\.pepites_create_draft",
        "owner only",
        ["app_private.morocco_local("],
        ["Africa/Casablanca", "at time zone"],
      ),
      fn(
        "app_private.pepites_tick_draft(uuid,timestamp with time zone)",
        "20260926100000_pepites_editions.sql",
        "app_private\\.pepites_tick_draft",
        "owner only",
        ["app_private.morocco_local("],
        ["Africa/Casablanca", "at time zone"],
      ),
      fn(
        "app_private.pepites_tick_daily(uuid,timestamp with time zone)",
        "20260926100000_pepites_editions.sql",
        "app_private\\.pepites_tick_daily",
        "owner only",
        ["app_private.morocco_local_date("],
        ["Africa/Casablanca", "at time zone"],
      ),
      fn(
        "app_private.pepites_tick(timestamp with time zone)",
        "20260926100000_pepites_editions.sql",
        "app_private\\.pepites_tick",
        "owner only",
        ["app_private.morocco_local_date("],
        ["Africa/Casablanca", "at time zone"],
      ),
    ],
    probes: `${HELPER_PROBES}
  if app_private.pepites_local_at(date '2026-10-19', time '20:00') is distinct from timestamptz '2026-10-19 20:00+00'
    or app_private.pepites_local_at(date '2026-10-19', time '12:00') is distinct from timestamptz '2026-10-19 12:00+00'
    or app_private.pepites_local_at(date '2026-09-14', time '20:00') is distinct from timestamptz '2026-09-14 19:00+00' then
    raise exception 'stop: pepites_local_at does not follow Morocco''s clock';
  end if;`,
    watched: [
      {
        label: "pepites_settings",
        sql: "select coalesce((select md5(to_jsonb(s)::text) from app_private.pepites_settings s limit 1), '')",
      },
      {
        label: "pepites_editions",
        sql: "select coalesce((select md5(string_agg(e::text, ',' order by e.id)) from app.pepites_editions e), '')",
      },
    ],
    resultNote: `' The weekly Top 10 for Monday 2026-10-19 at 20:00 Moroccan time is scheduled for '
      || app_private.pepites_local_at(date '2026-10-19', time '20:00')::text
      || ' by the function as it stands now; the right answer is 2026-10-19 20:00:00+00 (helper: '
      || app_private.morocco_instant(timestamp '2026-10-19 20:00')::text || ').'`,
    notice: "the Pépites times of day",
    requires: [HELPER_VERSION],
    extraPreflight: `  -- Editions that carry a time already (counts and the nearest one; no ids, no names).
  raise notice 'pepites editions in draft or scheduled: %, next scheduled_for: %',
    (select count(*) from app.pepites_editions where status in ('draft', 'scheduled')),
    (select min(scheduled_for) from app.pepites_editions where status in ('draft', 'scheduled') and scheduled_for > statement_timestamp());
  raise notice 'pepites mode: %', (select mode from app_private.pepites_settings where id);`,
  },
  {
    version: "20261016090400",
    name: "morocco_time_read_models",
    summary: `Three reads follow Morocco's clock. It replaces THREE functions, each with only the zone
-- expressions changed: api.football_season_catalog (the season's first and last match DATE),
-- api.admin_get_analytics_overview ("today", the 30-day window and the sign-ups per day) and
-- api.football_matches_by_date (the day's bounds when a caller sends a date and a zone name
-- instead of exact bounds). Before: a 23:00-24:00 UTC kick-off or sign-up fell on the next day.
-- These are cosmetic; none can make anyone miss anything.`,
    when: `   After 20261016090000 (the helpers) is committed. Any time of day; well under a second.`,
    pause: `   Nothing needs pausing: the script only replaces the definition of three functions (pg_proc) and
--   records itself in supabase_migrations.schema_migrations. It writes no table. No cron job
--   calls these reads (they are called by the website and the admin screen). A call already
--   running finishes on the old text. Still make sure no other schema change is running right
--   now. The script compares the cron job list before and after and stops if it moved.`,
    whatItDoes: `   * refuses to run twice, before the helpers are recorded and working, and where any of the
--     three functions is not byte for byte the text the repository's latest migration defines
--     (md5 of its source), changed attributes, or has other privileges than the reviewed ones
--     (season catalog and matches by date: anon, authenticated and service_role; analytics:
--     authenticated only);
--   * records the migration file in supabase_migrations.schema_migrations and runs it from that
--     record once its sha256 matches the repository file;
--   * checks the result without writing anything: each source is the new one with no raw zone
--     expression left; attributes, privileges and comments are unchanged; the season catalog and
--     the matches-by-date read answer (jsonb, no error); the cron job list is where it was. It
--     does not call the analytics read (it needs a signed-in administrator).`,
    functions: [
      fn(
        "api.football_season_catalog(text,integer)",
        "20260802090000_football_season_browser.sql",
        "api\\.football_season_catalog",
        "anon, authenticated, service_role",
        ["app_private.morocco_local_date("],
        ["at time zone"],
      ),
      fn(
        "api.admin_get_analytics_overview()",
        "20260924160000_admin_user_moderation_and_analytics.sql",
        "api\\.admin_get_analytics_overview",
        "authenticated",
        [
          "app_private.morocco_local_date(",
          "app_private.morocco_day_start(",
          "app_private.morocco_time_zone_label(",
        ],
        ["Africa/Casablanca", "at time zone"],
        "create or replace function",
      ),
      fn(
        "api.football_matches_by_date(date,text,text,text[],uuid,uuid,timestamp with time zone,uuid,integer,timestamp with time zone,timestamp with time zone)",
        "20260928090000_matches_by_date_explicit_utc_bounds.sql",
        "api\\.football_matches_by_date",
        "anon, authenticated, service_role",
        ["app_private.zone_instant("],
        ["at time zone"],
      ),
    ],
    probes: `${HELPER_PROBES}
  if jsonb_typeof(api.football_season_catalog('fr', 20)) is distinct from 'array' then
    raise exception 'stop: api.football_season_catalog does not answer an array';
  end if;
  if api.football_matches_by_date(current_date, 'fr', 'Africa/Casablanca', null, null, null, null, null, 1) -> 'items' is null then
    raise exception 'stop: api.football_matches_by_date does not answer';
  end if;`,
    watched: [],
    resultNote: `' The Moroccan day 2026-10-15 runs from '
      || app_private.morocco_day_start(date '2026-10-15')::text || ' to ' || app_private.morocco_day_end(date '2026-10-15')::text
      || ' (the raw zone on this database says '
      || (date '2026-10-15')::timestamp at time zone 'Africa/Casablanca' || ' to ' || ((date '2026-10-16')::timestamp at time zone 'Africa/Casablanca') || ').'`,
    notice: "the read models",
    requires: [HELPER_VERSION],
  },
];

export const scriptPath = (spec: ScriptSpec) =>
  `scripts/backend/apply-${spec.version}-${spec.name.replaceAll("_", "-")}.sql`;
export const migrationPath = (spec: ScriptSpec) =>
  `supabase/migrations/${spec.version}_${spec.name}.sql`;

export interface Resolved {
  oldBody: string;
  newBody: string;
  oldHeaderText: string;
  vol: "i" | "s" | "v";
  secdef: boolean;
  lang: string;
  searchPathEmpty: boolean;
}

export function resolve(spec: ScriptSpec, fnSpec: FnSpec): Resolved {
  const oldSource = read(`supabase/migrations/${fnSpec.oldFile}`);
  const newSource = read(migrationPath(spec));
  const oldHeaderText = headerOf(oldSource, fnSpec.oldHeader);
  const newHeaderText = headerOf(newSource, fnSpec.newHeader);
  const attrs = (header: string) => ({
    vol: /\bimmutable\b/i.test(header) ? "i" : /\bstable\b/i.test(header) ? "s" : "v",
    secdef: /security definer/i.test(header),
    lang: /(?<![\w])language\s+(\w+)/i.exec(header)?.[1] ?? "?",
    searchPathEmpty: /set search_path\s*=\s*''/i.test(header),
  });
  const a = attrs(oldHeaderText);
  const b = attrs(newHeaderText);
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(
      `${fnSpec.signature}: attributes differ between the old and the new definition`,
    );
  }
  return {
    oldBody: bodyOf(oldSource, fnSpec.oldHeader),
    newBody: bodyOf(newSource, fnSpec.newHeader),
    oldHeaderText,
    ...(a as Pick<Resolved, "vol" | "secdef" | "lang" | "searchPathEmpty">),
  };
}

const sigList = (signatures: string[]) => signatures.map((s) => `    (${q(s)})`).join(",\n");

export function build(spec: ScriptSpec): string {
  const migration = read(migrationPath(spec));
  const tag = `$bg_${spec.version}_file$`;
  if (migration.includes(tag))
    throw new Error(`${spec.version}: the file contains its own quoting tag`);
  const resolved = spec.functions.map((f) => ({ f, r: resolve(spec, f) }));
  const helperMigration = read(HELPER_FILE);
  const isHelperScript = spec.version === HELPER_VERSION;

  // -- the rows the loops read ------------------------------------------------------------------
  const targetRows = resolved
    .map(
      ({ f, r }) =>
        `      (${q(f.signature)}, ${q(md5(r.oldBody))}, ${q(md5(r.newBody))}, ${r.secdef}, ${q(r.vol)}, ${q(r.lang)}, ${r.searchPathEmpty}, ${HOLDERS[f.holders]})`,
    )
    .join(",\n");
  const helperRows = HELPERS.map((h) => {
    const body = bodyOf(helperMigration, h.header);
    return `      (${q(h.signature)}, ${q(md5(body))}, ${q(h.vol)})`;
  }).join(",\n");

  const requiredText = resolved
    .map(
      ({ f }) =>
        `      (${q(f.signature)}, ${q(JSON.stringify(f.required))}::jsonb, ${q(JSON.stringify(f.forbidden))}::jsonb)`,
    )
    .join(",\n");

  const requiresCheck = spec.requires
    .map(
      (
        v,
      ) => `  if not exists (select 1 from supabase_migrations.schema_migrations where version = ${q(v)}) then
    raise exception 'stop: ${v} (the Morocco clock helpers) is not recorded -- apply scripts/backend/apply-${HELPER_VERSION}-${HELPER_NAME.replaceAll("_", "-")}.sql (committed) first';
  end if;`,
    )
    .join("\n");

  const helperChecks = isHelperScript
    ? `  -- None of the ten helpers exists yet (the migration creates them).
  select string_agg(h.sig, ', ' order by h.sig) into present
  from (values
${sigList(HELPERS.map((h) => h.signature))}
  ) h(sig)
  where to_regprocedure(h.sig) is not null;
  if present is not null then
    raise exception 'stop: these helper functions already exist: %', present;
  end if;`
    : `  -- The helpers are the reviewed ones and answer the application's rule.
  for fn in
    select * from (values
${helperRows}
    ) v(sig, md5_src, vol)
  loop
    select p.prosrc, p.prosecdef, p.provolatile, p.proconfig into def
    from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn.sig);
    if def.prosrc is null then
      raise exception 'stop: helper % does not exist -- apply the helpers first', fn.sig;
    end if;
    if md5(def.prosrc) <> fn.md5_src or def.prosecdef or def.provolatile <> fn.vol
      or def.proconfig is distinct from array['search_path=""'] then
      raise exception 'stop: helper % is not the reviewed one', fn.sig;
    end if;
  end loop;
${HELPER_PROBES}`;

  const targetsPre = spec.functions.length
    ? `  -- Each function this update replaces is exactly what the repository's latest migration defines.
  for fn in
    select * from (values
${targetRows}
    ) v(sig, old_md5, new_md5, secdef, vol, lang, search_path_empty, holders)
  loop
    select p.oid, p.prosrc, p.prosecdef, p.provolatile, p.proconfig, p.proacl, p.proowner, l.lanname into def
    from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid = p.prolang
    where p.oid = to_regprocedure(fn.sig);
    if def.prosrc is null then
      raise exception 'stop: % does not exist on this database', fn.sig;
    end if;
    if md5(def.prosrc) = fn.new_md5 then
      raise exception 'stop: % already has the new text -- was this applied by another route?', fn.sig;
    end if;
    if md5(def.prosrc) <> fn.old_md5 then
      raise exception 'stop: % is not the version this update replaces (md5 %, expected %)', fn.sig, md5(def.prosrc), fn.old_md5;
    end if;
    if def.prosecdef <> fn.secdef or def.provolatile <> fn.vol or def.lanname <> fn.lang
      or (def.proconfig is not distinct from array['search_path=""']) <> fn.search_path_empty then
      raise exception 'stop: % has attributes other than the reviewed ones (security, volatility, language, search_path)', fn.sig;
    end if;
    select coalesce(array_agg(distinct r.name order by r.name), '{}') into held
    from (
      select case when a.grantee = 0 then 'public' else (select rolname from pg_catalog.pg_roles where oid = a.grantee) end as name
      from aclexplode(coalesce(def.proacl, acldefault('f', def.proowner))) a
      where a.privilege_type = 'EXECUTE'
        and (a.grantee = 0 or a.grantee in (select oid from pg_catalog.pg_roles where rolname in ('anon', 'authenticated', 'service_role')))
    ) r;
    if held is distinct from fn.holders then
      raise exception 'stop: % is executable by % -- expected %', fn.sig, held, fn.holders;
    end if;
  end loop;

  -- What the new text calls must exist (other than the helpers, checked above).
  select string_agg(v.name, ', ' order by v.name) into absent
  from (values
${
  [
    ...new Set(
      resolved.flatMap(({ r }) =>
        [...r.newBody.matchAll(/\b((?:app|app_private|api)\.[a-z_]+)\(/g)].map((m) => m[1]!),
      ),
    ),
  ]
    .filter(
      (name) =>
        !name.startsWith("app_private.morocco_") &&
        !name.startsWith("app_private.zone_") &&
        !resolved.some(({ f }) => f.signature.startsWith(`${name}(`)),
    )
    .sort()
    .map((name) => `    (${q(name)})`)
    .join(",\n") || "    ('app_private.morocco_local')"
}
  ) v(name)
  where not exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname || '.' || p.proname = v.name);
  if absent is not null then
    raise exception 'stop: the database is missing functions this update calls: %', absent;
  end if;`
    : "";

  const baselineSets = [
    `  select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), '')) into baseline
  from cron.job j;
  perform set_config('bg.morocco_cron_before', baseline, true);`,
    ...(spec.functions.length
      ? [
          `  select md5(coalesce(string_agg(p.oid::regprocedure::text || ':' || coalesce(p.proacl::text, '-') || ':' || coalesce(obj_description(p.oid, 'pg_proc'), '-'), ',' order by p.oid::regprocedure::text), '')) into baseline
  from pg_catalog.pg_proc p
  where p.oid in (${spec.functions.map((f) => `to_regprocedure(${q(f.signature)})`).join(", ")});
  perform set_config('bg.morocco_acl_comment_before', baseline, true);`,
        ]
      : []),
    ...spec.watched.map(
      (w, i) => `  baseline := (${w.sql});
  perform set_config('bg.morocco_watched_${i}_before', baseline, true);`,
    ),
  ].join("\n");

  const watchedPost = spec.watched
    .map(
      (
        w,
        i,
      ) => `  if (${w.sql}) is distinct from current_setting('bg.morocco_watched_${i}_before', true) then
    problems := problems || ${q(`${w.label} moved`)}::text;
  end if;`,
    )
    .join("\n");

  const targetsPost = spec.functions.length
    ? `  -- Each function is the migration's, with the attributes, privileges and comment it had.
  for fn in
    select * from (values
${targetRows}
    ) v(sig, old_md5, new_md5, secdef, vol, lang, search_path_empty, holders)
  loop
    select p.prosrc, p.prosecdef, p.provolatile, p.proconfig, l.lanname into def
    from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid = p.prolang
    where p.oid = to_regprocedure(fn.sig);
    if md5(def.prosrc) is distinct from fn.new_md5 then
      problems := problems || (fn.sig || ' is not the new source')::text;
    end if;
    if def.prosecdef <> fn.secdef or def.provolatile <> fn.vol or def.lanname <> fn.lang
      or (def.proconfig is not distinct from array['search_path=""']) <> fn.search_path_empty then
      problems := problems || (fn.sig || ' changed its attributes')::text;
    end if;
  end loop;
  for fn in
    select v.sig, v.required, v.forbidden from (values
${requiredText}
    ) v(sig, required, forbidden)
  loop
    select p.prosrc into def from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn.sig);
    for needle in select jsonb_array_elements_text(fn.required) loop
      if position(needle in def.prosrc) = 0 then
        problems := problems || (fn.sig || ' no longer contains ' || needle)::text;
      end if;
    end loop;
    for needle in select jsonb_array_elements_text(fn.forbidden) loop
      if position(needle in def.prosrc) > 0 then
        problems := problems || (fn.sig || ' still contains ' || needle)::text;
      end if;
    end loop;
  end loop;
  select md5(coalesce(string_agg(p.oid::regprocedure::text || ':' || coalesce(p.proacl::text, '-') || ':' || coalesce(obj_description(p.oid, 'pg_proc'), '-'), ',' order by p.oid::regprocedure::text), '')) into baseline
  from pg_catalog.pg_proc p
  where p.oid in (${spec.functions.map((f) => `to_regprocedure(${q(f.signature)})`).join(", ")});
  if baseline is distinct from current_setting('bg.morocco_acl_comment_before', true) then
    problems := problems || 'the privileges or the comments of a replaced function moved'::text;
  end if;`
    : "";

  const helperPost = isHelperScript
    ? `  -- The ten helpers are the migration's: source, security invoker, empty search_path, never volatile,
  -- callable by the owner only, commented.
  for fn in
    select * from (values
${helperRows}
    ) v(sig, md5_src, vol)
  loop
    select p.prosrc, p.prosecdef, p.provolatile, p.proconfig, p.proacl, p.proowner, obj_description(p.oid, 'pg_proc') as comment into def
    from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn.sig);
    if def.prosrc is null then
      problems := problems || (fn.sig || ' is missing')::text;
      continue;
    end if;
    if md5(def.prosrc) <> fn.md5_src then
      problems := problems || (fn.sig || ' is not the new source')::text;
    end if;
    if def.prosecdef or def.provolatile <> fn.vol or def.proconfig is distinct from array['search_path=""'] then
      problems := problems || (fn.sig || ' has the wrong attributes')::text;
    end if;
    if def.comment is null then
      problems := problems || (fn.sig || ' has no comment')::text;
    end if;
    select exists (
      select 1 from aclexplode(coalesce(def.proacl, acldefault('f', def.proowner))) a
      where a.privilege_type = 'EXECUTE'
        and (a.grantee = 0 or a.grantee in (select oid from pg_catalog.pg_roles where rolname in ('anon', 'authenticated', 'service_role')))) into leaked;
    if leaked then
      problems := problems || (fn.sig || ' is executable by PUBLIC, anon, authenticated or service_role')::text;
    end if;
  end loop;`
    : "";

  const header = `-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration ${spec.version}_${spec.name}
-- (Morocco's clock in the database; docs/engineering/MOROCCO_TIME_IN_THE_DATABASE.md):
-- ${spec.summary}
--
-- THE RULE. Morocco is UTC+0 all year from 2026-09-20T01:00:00Z (decree n° 2.26.530; IANA tz 2026c),
-- confirmed by the owner on 2026-10-15. The application already follows it
-- (src/lib/morocco-time.ts); this database still carries older time-zone data (UTC+1), so a
-- time the database turns into Moroccan clock time is an hour off from what the person sees.
--
-- WHEN
--${spec.when}
--
-- WHAT TO PAUSE (AGENTS.md, "One writer at a time, per database")
--${spec.pause}
--
-- HOW TO RUN
--   0. Supabase dashboard -> project "BotolaGO Production V2" (the address contains
--      tkewgajrljbwgwedqsxn; the database holds no project name this script could check, so look
--      at the address) -> SQL Editor -> New query. Read-only pre-checks and post-checks:
--      ${RUNBOOK}.
--   1. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one transaction, checked, and
--      then ROLLED BACK. The result row should say "Rehearsal passed".
--   2. Change the line \`rollback;\` near the bottom to \`commit;\` and press Run again. The result
--      row should say "Applied".
--   If any check fails, the script stops with a message saying what, and nothing is saved. Do not
--   edit a check to make it pass: a check firing means the database is not in the state this
--   script expects. Send the message.
--
-- WHAT IT DOES
--${spec.whatItDoes}
-- ============================================================================
`;

  const pre = `begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  fn record;
  def record;
  held text[];
  absent text;
  present text;
  baseline text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '${spec.version}') then
    raise exception 'stop: migration ${spec.version} is already recorded as applied';
  end if;
${requiresCheck}
${helperChecks}
${targetsPre}

  -- Baseline: the cron job list${spec.functions.length ? ", the privileges and comments of the functions" : ""}${spec.watched.length ? ", the switches" : ""}.
${baselineSets}
${spec.extraPreflight ?? ""}
end
$preflight$;
`;

  const record = `
-- ---------------------------------------------------------------------------
-- Migration ${spec.version}, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '${spec.version}',
  '${spec.name}',
  array[${tag}${migration}${tag}]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_${spec.version} text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '${spec.version}'
  );
begin
  if encode(sha256(convert_to(part_${spec.version}, 'UTF8')), 'hex')
    is distinct from '${sha256(migration)}' then
    raise exception 'stop: ${spec.version} is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_${spec.version};
end
$apply$;
`;

  const post = `
-- ---------------------------------------------------------------------------
-- Postflight: check the result (reads only)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  fn record;
  def record;
  needle text;
  leaked boolean;
  baseline text;
begin
${helperPost}
${targetsPost}
${spec.probes}

${watchedPost}
  if (select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), ''))
      from cron.job j) is distinct from current_setting('bg.morocco_cron_before', true) then
    problems := problems || 'the cron job list moved'::text;
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '${spec.version}') then
    problems := problems || 'history row missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
  raise notice ${q(`after: ${spec.notice} check out`)};
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '${spec.version}')
    then 'Applied. Migration ${spec.version} is recorded; ${spec.name.replaceAll("_", " ")} is in place. Run the post-checks in ${RUNBOOK}.'
  else 'Rehearsal passed. Nothing was saved.'
      || ${spec.resultNote}
      || ' Change rollback; to commit; and run again.'
end as result;
`;

  return header + "\n" + pre + record + post;
}

if (import.meta.main) {
  let drifted = false;
  for (const spec of SCRIPTS) {
    const path = scriptPath(spec);
    const next = build(spec);
    if (process.argv.includes("--check")) {
      if (next !== readFileSync(join(root, path), "utf8")) {
        console.error(`${path} drifted from what the builder makes`);
        drifted = true;
      }
    } else {
      writeFileSync(join(root, path), next);
      console.log(`wrote ${path}`);
    }
  }
  if (drifted) process.exit(1);
}
