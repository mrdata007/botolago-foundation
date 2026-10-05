-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261005120000_push_goal_cancelled_type: adds one value,
-- goal_cancelled, to the notification types (app.notification_type). It is the
-- type of the correction sent when a goal that was told is later ruled out. It
-- is added on its own because a new enum value cannot be used in the
-- transaction that adds it; the migration that uses it is the next script,
-- apply-20261005135000-push-remaining-alerts.sql, run AFTER this one is saved.
--
-- WHEN
--   After the pull request that adds this file is merged. Any quiet moment; not
--   at minute 12 of an hour (the Fantasy season orchestrator). It changes one
--   enum and nothing reads the new value yet, so nothing a reader can see
--   changes. Run it, with `commit;`, BEFORE the next script, which refuses to
--   run until this one is saved.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Make sure no other database work is running right now
--      (AGENTS.md, "Before writing": no GitHub Actions run in progress, no
--      pg_cron job mid-run, no other query running).
--   2. Paste this WHOLE file and press Run.
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
--   * refuses to run twice, or where the notification types are missing;
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result without saving anything: the type list has the new
--     value exactly once, and the earlier values are all still there, in order.
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
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261005120000') then
    raise exception 'stop: migration 20261005120000 is already recorded as applied';
  end if;
  if to_regtype('app.notification_type') is null then
    raise exception 'stop: the notification types (app.notification_type) are missing';
  end if;
  if exists (select 1 from pg_enum e where e.enumtypid = 'app.notification_type'::regtype
      and e.enumlabel = 'goal_cancelled') then
    raise exception 'stop: app.notification_type already has the value goal_cancelled';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20261005120000, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261005120000',
  'push_goal_cancelled_type',
  array[$bg_20261005120000_file$-- Push alerts, the remaining moments, migration 1 of 2: the "goal cancelled"
-- notification type, alone. A new enum value cannot be used in the
-- transaction that adds it, so its text, its place in the push rules and the
-- planner that creates it are in the next migration (20261005135000).
--
-- The type is for the correction that follows a goal alert when the goal is
-- later ruled out (a VAR decision): the phone that was told "goal" is told it
-- does not stand. Nothing can create one yet and nothing a reader can see
-- changes.
alter type app.notification_type add value if not exists 'goal_cancelled';
$bg_20261005120000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261005120000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261005120000'
  );
begin
  if encode(sha256(convert_to(part_20261005120000, 'UTF8')), 'hex')
    is distinct from '04dd32f7025310ff086caa7f4664d39c642e657f7eb0dba08ff2c7d1a2bacbc3' then
    raise exception 'stop: 20261005120000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261005120000;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (saves nothing of its own)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  labels text[];
begin
  select array_agg(e.enumlabel::text order by e.enumsortorder) into labels
  from pg_enum e where e.enumtypid = 'app.notification_type'::regtype;
  if (select count(*) from unnest(labels) as label where label = 'goal_cancelled') <> 1 then
    problems := problems || 'goal_cancelled is not in the type list exactly once'::text;
  end if;
  if labels[array_length(labels, 1)] is distinct from 'goal_cancelled' then
    problems := problems || 'goal_cancelled is not the last value'::text;
  end if;
  if not (labels @> array['goal', 'full_time', 'deadline_1h', 'deadline_24h', 'match_starting']) then
    problems := problems || 'an earlier notification type is missing'::text;
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261005120000') then
    problems := problems || 'history row missing'::text;
  end if;
  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
  raise notice 'goal_cancelled added to the notification types; nothing uses it yet';
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261005120000')
    then 'Applied. goal_cancelled is a notification type. Run apply-20261005135000-push-remaining-alerts.sql next.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
