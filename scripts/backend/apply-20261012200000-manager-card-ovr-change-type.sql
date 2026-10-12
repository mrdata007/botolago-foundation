-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261012200000_manager_card_ovr_change_type: adds one value,
-- manager_card_ovr_change, to the notification types (app.notification_type).
-- It is the type of "your Curva rating went up / went down". It is added on
-- its own because a new enum value cannot be used in the transaction that adds
-- it; the migration that uses it is installed by the next script,
-- apply-manager-card-rules-v3-week-one.sql, run AFTER this one is saved.
--
-- ORDER (docs/backend/MANAGER_CARD_OPERATIONS_RUNBOOK.md, "Rules v3")
--   1. apply-manager-card-rules-v2-calm.sql      (20261012170000 + rules v2), committed
--   2. THIS SCRIPT                                (20261012200000), committed
--   3. apply-manager-card-rules-v3-week-one.sql  (20261012200100 + rules v3)
--
-- WHEN
--   After the pull request that adds this file is merged and its
--   database-quality job passed. Any quiet moment. It changes one enum and
--   nothing reads the new value yet, so nothing a reader can see changes and no
--   writer has to be paused for it.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Make sure no other database work is running right now
--      (AGENTS.md, "Before writing").
--   2. Paste this WHOLE file and press Run. As shipped it is a REHEARSAL:
--      everything is applied inside one transaction, checked, and then ROLLED
--      BACK. The result row should say "Rehearsal passed".
--   3. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied".
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass.
--
-- WHAT IT DOES
--   * refuses to run twice, or where the notification types are missing;
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result without saving anything: the type list has the new
--     value exactly once, last, and the earlier values are all still there.
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
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261012200000') then
    raise exception 'stop: migration 20261012200000 is already recorded as applied';
  end if;
  if to_regtype('app.notification_type') is null then
    raise exception 'stop: the notification types (app.notification_type) are missing';
  end if;
  if exists (select 1 from pg_enum e where e.enumtypid = 'app.notification_type'::regtype
      and e.enumlabel = 'manager_card_ovr_change') then
    raise exception 'stop: app.notification_type already has the value manager_card_ovr_change';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20261012200000, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261012200000',
  'manager_card_ovr_change_type',
  array[$bg_20261012200000_file$-- Manager Card "week one", migration 1 of 2: the notification type for a
-- rating change, alone. A new enum value cannot be used in the transaction
-- that adds it, so its text, the moments and the calculation that creates it
-- are in the next migration (20261012200100).
--
-- The type is for "your Curva rating went up / went down" after a finished
-- gameweek (owner decision, 2026-10-12). Nothing can create one yet and
-- nothing a reader can see changes.
alter type app.notification_type add value if not exists 'manager_card_ovr_change';
$bg_20261012200000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261012200000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261012200000'
  );
begin
  if encode(sha256(convert_to(part_20261012200000, 'UTF8')), 'hex')
    is distinct from '22ebbe9debef9f6a63668b2e183f2aba7c0e1b0d5c5de535fa25ab45ba71fbed' then
    raise exception 'stop: 20261012200000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261012200000;
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
  if (select count(*) from unnest(labels) as label where label = 'manager_card_ovr_change') <> 1 then
    problems := problems || 'manager_card_ovr_change is not in the type list exactly once'::text;
  end if;
  if labels[array_length(labels, 1)] is distinct from 'manager_card_ovr_change' then
    problems := problems || 'manager_card_ovr_change is not the last value'::text;
  end if;
  if not (labels @> array['goal', 'goal_cancelled', 'full_time', 'deadline_1h', 'deadline_24h',
      'gameweek_finalized', 'match_starting']) then
    problems := problems || 'an earlier notification type is missing'::text;
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261012200000') then
    problems := problems || 'history row missing'::text;
  end if;
  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
  raise notice 'manager_card_ovr_change added to the notification types; nothing uses it yet';
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261012200000')
    then 'Applied. manager_card_ovr_change is a notification type. Run apply-manager-card-rules-v3-week-one.sql next.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
