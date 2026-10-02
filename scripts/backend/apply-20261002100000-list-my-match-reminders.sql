-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261002100000_list_my_match_reminders: adds api.list_my_match_reminders(), the read that
-- gives back the matches the signed-in account set a "remind me" on, so the
-- reminder bell can show its saved state on a new phone (pull request #274).
--
-- WHEN
--   After the pull request that adds this file is merged, and before or after
--   the website that calls it (the bell works without it: it asks, gets an
--   error, and keeps what the device remembers). Any quiet moment; not at
--   minute 12 of an hour (the Fantasy season orchestrator). It adds one new read
--   function and touches no table, so no scheduled job needs pausing and
--   nothing is locked for writers.
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
--   * refuses to run twice, or where api.list_my_match_reminders already
--     exists, or where the pieces it reads are missing (the notification API
--     of 20260720121729, app.notification_subscriptions with its columns, and
--     app_private.assert_mfa_step_up, read on production on 2026-10-02);
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result without saving anything: exactly one such function,
--     callable by signed-in accounts only (not by visitors, PUBLIC or the
--     service role), a signed-in account with no reminder reads an empty
--     list, and a call with nobody signed in is refused (SQLSTATE PT401).
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
  needed text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261002100000') then
    raise exception 'stop: migration 20261002100000 is already recorded as applied';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260720121729') then
    raise exception 'stop: migration 20260720121729 (notification API) is not applied yet';
  end if;
  if to_regprocedure('app_private.assert_mfa_step_up()') is null then
    raise exception 'stop: app_private.assert_mfa_step_up is missing';
  end if;
  if to_regclass('app.notification_subscriptions') is null then
    raise exception 'stop: app.notification_subscriptions is missing';
  end if;
  foreach needed in array array['user_id', 'kind', 'fixture_id', 'enabled', 'updated_at', 'id'] loop
    if not exists (select 1 from information_schema.columns
      where table_schema = 'app' and table_name = 'notification_subscriptions' and column_name = needed) then
      missing := missing || needed;
    end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: app.notification_subscriptions lacks the columns %', missing;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and p.proname = 'list_my_match_reminders') then
    raise exception 'stop: api.list_my_match_reminders already exists';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20261002100000, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261002100000',
  'list_my_match_reminders',
  array[$bg_20261002100000_file$-- BotolaGO — read back the signed-in user's match reminders.
--
-- The "remind me" bell saves a reminder with
-- `api.set_my_notification_subscription('match', fixture, true)`, but nothing
-- returned the list, so the bell could not show its state on a new phone.
-- This adds the read: the fixture ids the caller has an enabled match
-- reminder on, newest change first, at most 200. Additive; no table or
-- existing function changes.

create or replace function api.list_my_match_reminders()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid(); result jsonb;
begin
  -- Like every account read: an account with a second factor must have used it.
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  select coalesce(jsonb_agg(reminder.fixture_id order by reminder.updated_at desc, reminder.id), '[]'::jsonb)
  into result
  from (
    select subscription.id, subscription.fixture_id, subscription.updated_at
    from app.notification_subscriptions subscription
    where subscription.user_id = current_user_id
      and subscription.kind = 'match'
      and subscription.enabled
      and subscription.fixture_id is not null
    order by subscription.updated_at desc, subscription.id
    limit 200
  ) reminder;
  return result;
end;
$$;

revoke all on function api.list_my_match_reminders()
from public, anon, authenticated, service_role;
grant execute on function api.list_my_match_reminders() to authenticated;
$bg_20261002100000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261002100000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261002100000'
  );
begin
  if encode(sha256(convert_to(part_20261002100000, 'UTF8')), 'hex')
    is distinct from 'c0512530a5fc67fc3da8de7dd96b497d984f743b9e54c707446161958048fdf2' then
    raise exception 'stop: 20261002100000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261002100000;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (writes nothing)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  signature constant regprocedure := 'api.list_my_match_reminders()'::regprocedure;
  answer jsonb;
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'api' and p.proname = 'list_my_match_reminders') <> 1 then
    problems := problems || 'there is not exactly one list_my_match_reminders'::text;
  end if;
  if not has_function_privilege('authenticated', signature, 'execute') then
    problems := problems || 'signed-in accounts cannot call it'::text;
  end if;
  if has_function_privilege('anon', signature, 'execute')
    or has_function_privilege('public', signature, 'execute')
    or has_function_privilege('service_role', signature, 'execute') then
    problems := problems || 'something other than signed-in accounts can call it'::text;
  end if;
  if not exists (select 1 from pg_proc where oid = signature and prosecdef and provolatile = 's') then
    problems := problems || 'it is not a stable security-definer function'::text;
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261002100000') then
    problems := problems || 'history row missing'::text;
  end if;

  -- A signed-in account nobody has ever heard of: no reminders, an empty list.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  answer := api.list_my_match_reminders();
  if answer is distinct from '[]'::jsonb then
    problems := problems || ('an account with no reminder read ' || answer::text);
  end if;

  -- Nobody signed in: refused.
  perform set_config('request.jwt.claims', '', true);
  begin
    perform api.list_my_match_reminders();
    problems := problems || 'a call with nobody signed in was accepted'::text;
  exception when sqlstate 'PT401' then null;
  end;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
  raise notice 'match reminders: one function, signed-in accounts only, empty for a stranger, refused for nobody';
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261002100000')
    then 'Applied. The reminder bell now reads its saved state from the server.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
