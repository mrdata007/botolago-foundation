-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migrations 20260925180200_fantasy_league_visibility_policy and
-- 20260925180300_foreign_key_delete_path_indexes (audit 2026-09-25, P3
-- hygiene):
--   * A14 / DB-06: the direct-table policy on private Fantasy leagues tests
--     the league row, not membership.id, and no longer recurses with the
--     memberships policy;
--   * A13 / DB-05: two indexes for foreign keys that a delete scans once per
--     deleted row (app.stories.import_converted_by and
--     app_private.notification_email_unsubscribe_tokens.delivery_id).
--   Nothing a visitor or the web app calls changes: no api.* function, grant
--   or JSON shape. The other three foreign keys the audit listed are left
--   unindexed on purpose; the second migration says why.
--
-- WHEN
--   Any time after the pull request that adds this file is merged, but not at
--   minute 12 of an hour (the Fantasy season orchestrator) and not while a
--   Fantasy scoring run is going on. It needs about a second.
--
--   Replacing the policy locks app.fantasy_leagues until the end, so League
--   pages wait for that second. Building the two indexes holds writes to
--   app.stories and to the unsubscribe tokens for as long: measured at
--   production's size, 4-11 ms for app.stories (14,302 rows); the tokens
--   table is empty while email is off. Reads of both go on. If a write is
--   already under way, the script stops within 5 seconds and saves nothing:
--   run it again a minute later.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Make sure no other database work is running right now.
--   2. Pause the Fantasy lifecycle tick, as AGENTS.md asks before a write that
--      touches Fantasy (this script refuses while it is on):
--        select app_private.fantasy_automation_configure(false);
--      Email must be off, as AGENTS.md asks before a write that touches
--      notifications (it is off on production; the script checks).
--   3. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one
--      transaction, checked, and then ROLLED BACK. The result row should say
--      "Rehearsal passed".
--   4. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied".
--   5. Whatever the result, switch the tick back on (if it was on at step 2):
--        select app_private.fantasy_automation_configure(true);
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, while the Fantasy tick is on or email is not off,
--     on a database missing a table or column it changes, where the helper
--     or either index already exists, or where either league policy is not
--     the text production held on 2026-09-25 (md5 of pg_policies.qual, read
--     there);
--   * takes app.fantasy_leagues, app.stories and the unsubscribe tokens (see
--     WHEN);
--   * records each migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result without writing anything: the helper exists, is
--     SECURITY DEFINER with an empty search_path, and only authenticated may
--     execute it; browser roles still have no USAGE on app_private and no
--     SELECT on either league table; the policy calls the helper and no longer
--     mentions membership.id; a direct read of app.fantasy_leagues as
--     authenticated is now refused for privileges (42501), not for recursion
--     (42P17); the helper says yes for an active member of a real league and
--     no for another account (neither id is printed); both indexes exist, are
--     valid and are the reviewed definitions; both history rows are there.
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
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20260925180200') then
    raise exception 'stop: migration 20260925180200 is already recorded as applied';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20260925180300') then
    raise exception 'stop: migration 20260925180300 is already recorded as applied';
  end if;

  if to_regclass('app.fantasy_leagues') is null
    or to_regclass('app.fantasy_league_memberships') is null
    or to_regclass('app.stories') is null
    or to_regclass('app.notification_deliveries') is null
    or to_regclass('app_private.notification_email_unsubscribe_tokens') is null
    or to_regclass('app_private.fantasy_automation_settings') is null
    or to_regclass('app_private.notification_email_settings') is null then
    missing := missing || 'a table'::text;
  end if;
  if cardinality(missing) = 0 and (
    select count(*) from pg_catalog.pg_attribute
    where not attisdropped and (attrelid, attname) in (
      ('app.fantasy_league_memberships'::regclass, 'league_id'),
      ('app.fantasy_league_memberships'::regclass, 'user_id'),
      ('app.fantasy_league_memberships'::regclass, 'status'),
      ('app.stories'::regclass, 'import_converted_by'),
      ('app_private.notification_email_unsubscribe_tokens'::regclass, 'delivery_id')
    )
  ) <> 5 then
    missing := missing || 'a column'::text;
  end if;
  if cardinality(missing) > 0 then
    raise exception 'stop: the database is missing what this update changes: %', missing;
  end if;

  if to_regprocedure('app_private.fantasy_is_active_league_member(uuid)') is not null
    or to_regclass('app.stories_import_converted_by_idx') is not null
    or to_regclass('app_private.notification_email_unsubscribe_tokens_delivery_idx') is not null then
    raise exception 'stop: part of this update already exists, but the migrations are not recorded -- find out why before going on';
  end if;

  -- AGENTS.md: a write that touches Fantasy runs with the Fantasy lifecycle
  -- tick paused, and one that touches notifications with email off.
  if exists (select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled) then
    raise exception 'stop: the Fantasy lifecycle tick is on -- pause it first with select app_private.fantasy_automation_configure(false); and switch it back on afterwards';
  end if;
  if exists (select 1 from app_private.notification_email_settings where mode <> 'off') then
    raise exception 'stop: email is not off -- pause it as AGENTS.md says, and restore it afterwards';
  end if;

  -- The two league policies as production held them on 2026-09-25.
  if (select md5(qual) || ' ' || permissive || ' ' || cmd || ' ' || roles::text
      from pg_catalog.pg_policies
      where schemaname = 'app' and tablename = 'fantasy_leagues'
        and policyname = 'fantasy_leagues_visible_select')
    is distinct from '4e1d4decf045c301202afc6beb178f67 PERMISSIVE SELECT {authenticated}' then
    raise exception 'stop: fantasy_leagues_visible_select is not the version this update replaces (20260720141854)';
  end if;
  if (select md5(qual) || ' ' || permissive || ' ' || cmd || ' ' || roles::text
      from pg_catalog.pg_policies
      where schemaname = 'app' and tablename = 'fantasy_league_memberships'
        and policyname = 'fantasy_league_memberships_member_select')
    is distinct from '69775893ada04e934d9530fdd6c67840 PERMISSIVE SELECT {authenticated}' then
    raise exception 'stop: fantasy_league_memberships_member_select is not the version this update was written against (20260720141854)';
  end if;
  if (select count(*) from pg_catalog.pg_policies
      where schemaname = 'app' and tablename in ('fantasy_leagues', 'fantasy_league_memberships')) <> 2 then
    raise exception 'stop: the league tables carry policies this update does not know about';
  end if;
end
$preflight$;

-- The three tables, in one order, before any change. Reads of app.stories and
-- of the tokens go on; League pages wait for the end; a write already under
-- way makes this stop within lock_timeout (5 s).
lock table app.fantasy_leagues in access exclusive mode;
lock table app.stories, app_private.notification_email_unsubscribe_tokens in share mode;

-- ---------------------------------------------------------------------------
-- Migrations 20260925180200 and 20260925180300, exactly as in the repository,
-- into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260925180200',
  'fantasy_league_visibility_policy',
  array[$bg_20260925180200_file$-- BotolaGO Production V2
-- The direct-table policy for private Fantasy leagues tests the league it is
-- looking at, and no longer recurses (audit 2026-09-25 A14 / DB-06, P3).
--
-- Background. 20260720141854_fantasy_api_security created
--
--   create policy fantasy_leagues_visible_select on app.fantasy_leagues
--   for select to authenticated
--   using (visibility = 'public' or exists (select 1
--     from app.fantasy_league_memberships membership
--     where membership.league_id = id and membership.user_id = (select auth.uid())
--       and membership.status = 'active'));
--
-- The bare `id` was meant as the league's. Inside the subquery the nearest
-- table with an `id` column is the membership, so PostgreSQL stored
-- membership.league_id = membership.id (pg_policies shows it that way, locally
-- and on production). That is never true, so the private-league branch could
-- never admit anyone: it failed closed, and no row leaked.
--
-- There is a second fault under it. This policy reads
-- app.fantasy_league_memberships, and that table's policy
-- (fantasy_league_memberships_member_select, same migration) reads
-- app.fantasy_leagues back. PostgreSQL expands the policies of every table a
-- policy reads, so a direct read of either table by the authenticated role
-- stops with 42P17 "infinite recursion detected in policy". The rewriter does
-- this before the privilege check, so today it is the error even without a
-- SELECT grant. Qualifying the column alone would leave the policy unusable.
--
-- Nothing reaches these policies in production today. No browser role has
-- SELECT on either table; every league read goes through api.* functions that
-- are SECURITY DEFINER, owned by postgres (BYPASSRLS) and check membership
-- themselves; and none of the four security_invoker api views reads leagues.
-- This is defence in depth. The policies must say what they mean in case a
-- grant is ever added.
--
-- The fix:
--   1. app_private.fantasy_is_active_league_member(league_id) answers one
--      question: is the caller an active member of that league? It is
--      SECURITY DEFINER, so its read of the memberships table does not expand
--      that table's policy. That breaks the cycle. It reveals only the
--      caller's own membership.
--   2. The policy is recreated with the outer table named:
--        visibility = 'public'
--        or app_private.fantasy_is_active_league_member(fantasy_leagues.id)
--      Same name, same command, same role, same meaning as intended in
--      20260720141854.
--   3. PostgreSQL checks EXECUTE on a function in a policy as the querying
--      role, so authenticated gets EXECUTE on the helper. It still has no
--      USAGE on app_private, so it cannot call the helper by name, neither
--      from SQL nor through PostgREST (measured: "permission denied for schema
--      app_private"). Only the stored policy can call it. anon has no policy
--      on this table and gets nothing.
--
-- fantasy_league_memberships_member_select is correct as written
-- (league.id = fantasy_league_memberships.league_id) and is left as it is.
-- With this change it now evaluates without recursing.
--
-- No api.* function, grant or JSON shape changes.

create function app_private.fantasy_is_active_league_member(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.fantasy_league_memberships membership
    where membership.league_id = p_league_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  );
$$;

comment on function app_private.fantasy_is_active_league_member(uuid) is
  'True when the calling account (auth.uid()) holds an active membership of the league. '
  'Used by the policy fantasy_leagues_visible_select. It is SECURITY DEFINER so that its read '
  'of app.fantasy_league_memberships does not expand that table''s policy, which reads '
  'app.fantasy_leagues back (42P17 otherwise). It reveals only the caller''s own membership.';

revoke all on function app_private.fantasy_is_active_league_member(uuid)
  from public, anon, authenticated, service_role;
-- PostgreSQL checks EXECUTE on a policy's functions as the querying role. The
-- policy is for authenticated only. Without USAGE on app_private,
-- authenticated cannot call the helper by name.
grant execute on function app_private.fantasy_is_active_league_member(uuid) to authenticated;

drop policy fantasy_leagues_visible_select on app.fantasy_leagues;
create policy fantasy_leagues_visible_select on app.fantasy_leagues
for select to authenticated
using (
  visibility = 'public'
  or app_private.fantasy_is_active_league_member(fantasy_leagues.id)
);

comment on policy fantasy_leagues_visible_select on app.fantasy_leagues is
  'A signed-in account sees public leagues and the private leagues it is an active member of. '
  'Defence in depth only: browser roles have no SELECT on this table, and league reads go through '
  'api.* SECURITY DEFINER functions (20260925180200, audit A14 / DB-06).';
$bg_20260925180200_file$]
);

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260925180300',
  'foreign_key_delete_path_indexes',
  array[$bg_20260925180300_file$-- BotolaGO Production V2
-- Index two foreign keys that a real delete scans in full, one scan per
-- deleted row (audit 2026-09-25 A13 / DB-05, P3).
--
-- The audit listed five foreign keys with no index leading on the
-- referencing column. It asked for measurement before any index, and it said
-- not to drop "unused" indexes. This migration adds two indexes and drops
-- nothing.
--
-- Background: PostgreSQL does not index the referencing side of a foreign
-- key. When a referenced row is deleted, the FK's action runs once per
-- deleted row: a lookup for RESTRICT, or an UPDATE for SET NULL. Without an
-- index leading on the column, each run is a sequential scan of the
-- referencing table.
--
-- Measured 2026-09-25 on a local database (PostgreSQL 17.6, same as
-- production), with synthetic rows at production's sizes. Each parent delete
-- ran for real in a transaction that rolled back, and EXPLAIN ANALYZE
-- reported the time of each FK trigger. Three runs each:
--
--   app.stories.import_converted_by -> auth.users ON DELETE SET NULL
--     Deleting an auth user (account deletion, QA and staging cleanup, 250 a
--     batch in scripts/backend/fantasy-capacity-orchestrator.py) scans all of
--     app.stories: 14,302 rows, 3.3 MB on production. Its sibling created_by
--     has had a partial index since 20260720110053 (stories_created_by_idx).
--     250 user deletes: 267-328 ms in this trigger without the index,
--     1.6-2.0 ms with it (created_by: 2.0-2.8 ms). Production has no story
--     with import_converted_by set yet, so the partial index below starts
--     empty (8 kB). News ingestion never writes an entry into it.
--
--   app_private.notification_email_unsubscribe_tokens.delivery_id
--     -> app.notification_deliveries ON DELETE SET NULL
--     Each email delivery gets one token, kept 365 days, and nothing prunes
--     the table. Every deleted delivery, of any channel, scans the whole
--     table. Deliveries are deleted by api.unregister_my_notification_device
--     (called from the web app; it cascades through the device's push
--     deliveries) and by account deletion (profiles -> notifications ->
--     deliveries). Unregistering one device with 1,000 deliveries, against
--     100,000 tokens (about a year of mail): 5.7-6.5 s in this trigger
--     without the index, 7.5-9.7 ms with it. Writing 10,000 tokens cost
--     137-163 ms without it and 146-202 ms with it, which is within noise.
--     Production has 0 tokens (email is off), so the index is empty when
--     created.
--
-- Deliberately not indexed (measured on production 2026-09-25, read-only):
--   * app.player_fixture_performances.player_id and .team_id (9,258 rows,
--     2.7 MB). Every query of this table in SQL and scripts leads with
--     fixture_id or football_season_id, and the existing composite indexes
--     serve them. The only reader by player_id or team_id alone would be the
--     ON DELETE RESTRICT check when a player or team is deleted. Production
--     has deleted neither, ever: n_tup_del = 0 on app.players (929 rows) and
--     app.teams (21 rows). That check costs 0.9-1.7 ms as a sequential scan.
--     Production already plans the player_id check as an index-only scan of
--     player_fixture_performances_source_key. Two more indexes would slow
--     every performance ingest, which already maintains five.
--   * app_private.fantasy_free_hit_lineup_snapshots.source_lineup_id (0 rows
--     on production). Nothing queries it. The ON DELETE RESTRICT check runs
--     only when a Fantasy lineup is deleted, and only allow-listed
--     maintenance and QA scripts do that. At a hypothetical 10,000 Free Hit
--     activations the check costs 1.3-1.6 ms per deleted lineup.
--
-- A plain CREATE INDEX (a migration runs in a transaction, so CONCURRENTLY is
-- not available) blocks writes to its table while it builds. Reads continue.
-- Measured at production's sizes: 4-11 ms for app.stories. The tokens table
-- is empty on production (49 ms locally at 100,000 rows).
--
-- Both indexes are partial on "is not null". The FK action's
-- "$1 = column" implies it, so the generic plan the FK trigger caches can use
-- them (tested in foreign_key_delete_path_indexes.test.sql). Rows whose
-- reference is already null are never looked up.

create index stories_import_converted_by_idx
  on app.stories (import_converted_by)
  where import_converted_by is not null;

comment on index app.stories_import_converted_by_idx is
  'Serves the ON DELETE SET NULL action of stories_import_converted_by_fkey when an auth user is deleted '
  '(one lookup per deleted user instead of a scan of app.stories). Mirrors stories_created_by_idx. '
  '20260925180300, audit A13 / DB-05.';

create index notification_email_unsubscribe_tokens_delivery_idx
  on app_private.notification_email_unsubscribe_tokens (delivery_id)
  where delivery_id is not null;

comment on index app_private.notification_email_unsubscribe_tokens_delivery_idx is
  'Serves the ON DELETE SET NULL action of notification_email_unsubscribe_tokens_delivery_id_fkey, which '
  'runs once per deleted notification delivery (device unregistration, account deletion). '
  '20260925180300, audit A13 / DB-05.';
$bg_20260925180300_file$]
);

-- ---------------------------------------------------------------------------
-- Run them from the history, in order, once each is the repository file byte
-- for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20260925180200 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20260925180200'
  );
  part_20260925180300 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20260925180300'
  );
begin
  if encode(sha256(convert_to(part_20260925180200, 'UTF8')), 'hex')
    is distinct from 'd308f22c37e1f0b03082c8eb26b2592efdd16b3a016d7d68c453819319f0e05c' then
    raise exception 'stop: 20260925180200 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;
  if encode(sha256(convert_to(part_20260925180300, 'UTF8')), 'hex')
    is distinct from 'a95d1465d2a28e004fda8ec8f8e3df3d59351e65f376c0e16e5126abc65f4310' then
    raise exception 'stop: 20260925180300 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20260925180200;
  execute part_20260925180300;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (reads only)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  helper constant text := 'app_private.fantasy_is_active_league_member(uuid)';
  api_role text;
  qual text;
  member_league uuid;
  member_user uuid;
begin
  -- The helper: private, definer, empty search_path, executable by
  -- authenticated only (the policy's role).
  if to_regprocedure(helper) is null then
    problems := problems || ('missing ' || helper);
  else
    if not (select prosecdef and proconfig @> array['search_path=""']
            from pg_catalog.pg_proc where oid = to_regprocedure(helper)) then
      problems := problems || 'the helper is not SECURITY DEFINER with an empty search_path'::text;
    end if;
    if not has_function_privilege('authenticated', helper, 'execute')
      or has_function_privilege('anon', helper, 'execute')
      or has_function_privilege('service_role', helper, 'execute') then
      problems := problems || 'the helper is executable by the wrong roles'::text;
    end if;
  end if;
  foreach api_role in array array['anon', 'authenticated'] loop
    if has_schema_privilege(api_role, 'app_private', 'usage')
      or has_table_privilege(api_role, 'app.fantasy_leagues', 'select')
      or has_table_privilege(api_role, 'app.fantasy_league_memberships', 'select') then
      problems := problems || (api_role || ' gained access it must not have');
    end if;
  end loop;

  -- The policy.
  select policy.qual into qual
  from pg_catalog.pg_policies policy
  where policy.schemaname = 'app' and policy.tablename = 'fantasy_leagues'
    and policy.policyname = 'fantasy_leagues_visible_select'
    and policy.permissive = 'PERMISSIVE' and policy.cmd = 'SELECT'
    and policy.roles = array['authenticated']::name[];
  if qual is null
    or qual not like '%app_private.fantasy_is_active_league_member(id)%'
    or qual like '%membership.id%' then
    problems := problems || 'fantasy_leagues_visible_select is not the new version'::text;
  end if;

  -- A direct read as authenticated: refused for privileges now, where it
  -- used to stop on recursion. The role switch is undone with the block.
  if pg_has_role(current_user, 'authenticated', 'member') then
    begin
      perform set_config('role', 'authenticated', true);
      perform count(*) from app.fantasy_leagues;
      raise exception using errcode = 'P0001', message = 'direct_read_allowed';
    exception
      when insufficient_privilege then null;
      when sqlstate '42P17' then
        problems := problems || 'the league policies still recurse'::text;
      when sqlstate 'P0001' then
        problems := problems || 'authenticated can read app.fantasy_leagues directly'::text;
    end;
  else
    raise notice 'this session cannot act as authenticated: the direct-read check was not exercised here (pgTAP covers it)';
  end if;

  -- The helper answers for its caller only. The ids stay in the script.
  select membership.league_id, membership.user_id into member_league, member_user
  from app.fantasy_league_memberships membership
  where membership.status = 'active'
  limit 1;
  if member_league is null then
    raise notice 'no active league membership yet: the helper was not exercised here (pgTAP covers it)';
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', member_user, 'role', 'authenticated')::text, true);
    if not app_private.fantasy_is_active_league_member(member_league) then
      problems := problems || 'the helper says no for an active member'::text;
    end if;
    if app_private.fantasy_is_active_league_member(gen_random_uuid()) then
      problems := problems || 'the helper says yes for a league that does not exist'::text;
    end if;
    perform set_config('request.jwt.claims',
      json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
    if app_private.fantasy_is_active_league_member(member_league) then
      problems := problems || 'the helper says yes for another account'::text;
    end if;
    perform set_config('request.jwt.claims', '', true);
  end if;

  -- The indexes.
  if (select indexdef from pg_catalog.pg_indexes
      where schemaname = 'app' and indexname = 'stories_import_converted_by_idx')
    is distinct from 'CREATE INDEX stories_import_converted_by_idx ON app.stories USING btree (import_converted_by) WHERE (import_converted_by IS NOT NULL)'
    or (select indexdef from pg_catalog.pg_indexes
        where schemaname = 'app_private' and indexname = 'notification_email_unsubscribe_tokens_delivery_idx')
    is distinct from 'CREATE INDEX notification_email_unsubscribe_tokens_delivery_idx ON app_private.notification_email_unsubscribe_tokens USING btree (delivery_id) WHERE (delivery_id IS NOT NULL)' then
    problems := problems || 'an index is missing or not the reviewed definition'::text;
  elsif not (select bool_and(indisvalid and indisready) from pg_catalog.pg_index
             where indexrelid in ('app.stories_import_converted_by_idx'::regclass,
               'app_private.notification_email_unsubscribe_tokens_delivery_idx'::regclass)) then
    problems := problems || 'an index is not valid'::text;
  end if;

  if (select count(*) from supabase_migrations.schema_migrations
      where version in ('20260925180200', '20260925180300')) <> 2 then
    problems := problems || 'history rows missing'::text;
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
  when (select count(*) from supabase_migrations.schema_migrations
        where version in ('20260925180200', '20260925180300')) = 2
    then 'Applied. The private-league policy is fixed and the two foreign keys are indexed.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
