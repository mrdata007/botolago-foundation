-- ============================================================================
-- BotolaGO (STAGING srdrflfrfpwixsllveid first, then PRODUCTION tkewgajrljbwgwedqsxn)
-- Rivaux, step 1 of 2: migration 20261015130000, ONE new value, rival_lead_change, in the
-- notification types (app.notification_type). It is the type of "your rival now
-- leads you / you now lead your rival". It is added on its own because a new enum
-- value cannot be used in the transaction that adds it: step 2
-- (apply-20261015130100-rivals.sql) uses it, and is run AFTER this one has saved.
--
-- It changes one enum and nothing reads the new value yet, so nothing a reader can
-- see changes and no writer has to be paused for it. It adds no table, no function,
-- no job and no row.
--
-- WHEN
--   After the premium card reads are applied on this database
--   (scripts/backend/apply-20261013100400-premium-card-reads.sql), after the pull
--   request that adds this file is merged and its database-quality job passed.
--   Staging first.
--
-- BEFORE YOU RUN IT (AGENTS.md, "Before writing")
--   * Make sure nothing else is writing to this database: no GitHub Actions run
--     in progress, no other query running, no other agent or workflow working on
--     the database. Altering an enum takes a short lock on the type.
--
-- HOW TO RUN
--   1. Supabase dashboard -> the project -> SQL Editor -> New query.
--   2. Paste this WHOLE file and press Run. As shipped it is a REHEARSAL: every
--      guard and every check runs on the real code path inside one transaction,
--      and the script ends with a deliberate error whose message carries the
--      state it computed ("REHEARSAL PASSED -- nothing was saved: {...}"). That
--      error is the expected, good outcome: it rolls everything back.
--   3. Re-read to confirm the rollback held (a new query):
--        select not exists (select 1 from pg_enum e where e.enumtypid = 'app.notification_type'::regtype and e.enumlabel = 'rival_lead_change') as rolled_back;
--      It must say true.
--   4. In the line `select set_config('bg.rivals_type_mode', 'rehearsal', true);`
--      near the top, change 'rehearsal' to 'apply' and press Run again. The
--      result row says "Applied".
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, or where the notification types are missing;
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result without saving anything: the value is in the list exactly
--     once, last, and every earlier value is still there in the same order.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- REHEARSAL or APPLY. Change 'rehearsal' to 'apply' to save for real.
select set_config('bg.rivals_type_mode', 'rehearsal', true);

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261015130000') then
    raise exception 'stop: 20261015130000 is already recorded as applied';
  end if;
  if to_regtype('app.notification_type') is null then
    raise exception 'stop: the notification types (app.notification_type) are missing';
  end if;
  if exists (select 1 from pg_enum e where e.enumtypid = 'app.notification_type'::regtype
      and e.enumlabel = 'rival_lead_change') then
    raise exception 'stop: app.notification_type already has the value rival_lead_change';
  end if;
  perform set_config('bg.rivals_type_labels', (select string_agg(e.enumlabel::text, ',' order by e.enumsortorder)
    from pg_enum e where e.enumtypid = 'app.notification_type'::regtype), true);
  perform set_config('bg.rivals_type_tables', (select count(*) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('app', 'app_private', 'api') and c.relkind in ('r', 'p', 'v', 'm'))::text, true);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The migration file(s), exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261015130000',
  'rivals_notification_type',
  array[$bg_20261015130000_file$-- BotolaGO+ Rivaux, migration 1 of 3: the notification type for a change of lead, alone.
-- A new enum value cannot be used in the transaction that adds it, so its text, the tables and
-- the tick that creates it are in the next two migrations (20261015130100 and 20261015130200).
--
-- The type is for "your rival now leads you" / "you now lead your rival" after a published
-- journée (owner-approved idea 2, 2026-10-15). Nothing can create one yet and nothing a reader
-- can see changes.
alter type app.notification_type add value if not exists 'rival_lead_change';
$bg_20261015130000_file$]
);

-- ---------------------------------------------------------------------------
-- Run them from the history, once each is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261015130000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261015130000'
  );
begin
  if encode(sha256(convert_to(part_20261015130000, 'UTF8')), 'hex')
    is distinct from 'a1905e06668e0ea726c983a0f294111286ea59eaab8a7058a35708743a90ada1' then
    raise exception 'stop: 20261015130000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261015130000;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (saves nothing of its own)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  labels text;
begin
  select string_agg(e.enumlabel::text, ',' order by e.enumsortorder) into labels
  from pg_enum e where e.enumtypid = 'app.notification_type'::regtype;
  if labels is distinct from current_setting('bg.rivals_type_labels', true) || ',rival_lead_change' then
    problems := problems || 'the type list is not the earlier list plus rival_lead_change, last'::text;
  end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('app', 'app_private', 'api') and c.relkind in ('r', 'p', 'v', 'm'))::text
    is distinct from current_setting('bg.rivals_type_tables', true) then
    problems := problems || 'the number of tables changed -- this script adds none'::text;
  end if;
  if (select count(*) from supabase_migrations.schema_migrations where version = '20261015130000') <> 1 then
    problems := problems || 'the history row is missing'::text;
  end if;
  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
  perform set_config('bg.rivals_type_state', jsonb_build_object('value', 'rival_lead_change',
    'valuesBefore', cardinality(string_to_array(current_setting('bg.rivals_type_labels', true), ',')),
    'valuesAfter', cardinality(string_to_array(labels, ',')))::text, true);
end
$postflight$;

-- ---------------------------------------------------------------------------
-- The end. In a rehearsal this raises on purpose, carrying the computed state,
-- which rolls the whole transaction back. In apply mode it passes and the
-- transaction is committed below.
-- ---------------------------------------------------------------------------
do $finish$
begin
  if current_setting('bg.rivals_type_mode', true) is distinct from 'apply' then
    raise exception 'REHEARSAL PASSED -- nothing was saved: %', current_setting('bg.rivals_type_state', true);
  end if;
  raise notice 'rivals notification type: applying: %', current_setting('bg.rivals_type_state', true);
end
$finish$;

commit;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261015130000')
    then 'Applied. rival_lead_change is a notification type. Next: apply-20261015130100-rivals.sql.'
  else 'NOT applied: nothing was saved (a rehearsal, or a check stopped it).'
end as result;
