-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261001150000_register_sofascore_flashscore_providers: registers the two player-identity providers,
-- `sofascore` and `flashscore`, in app_private.football_providers.
--   Registration ONLY. It writes two rows and nothing else: no mapping row, no
--   change to app_private.football_provider_mappings or its two unique
--   constraints, no table, function, grant, policy, schedule, Fantasy row,
--   player identity, gameweek or score.
--
-- WHEN
--   Any time; it needs well under a second and takes no lock on a table that
--   anything else writes. Make sure no other database work is running
--   (AGENTS.md: one writer at a time).
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one
--      transaction, checked, and then ROLLED BACK. The result row should say
--      "Rehearsal passed".
--   2. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied" and name the two rows.
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, or when either provider is already registered;
--   * remembers, inside the transaction, every existing provider row and the
--     definitions of the mapping table's constraints, and the mapping row count;
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result: exactly the two expected rows were added (active,
--     configuration_version 1), every earlier provider row is byte-identical,
--     the mapping table holds the same number of rows and the same constraint
--     definitions, and the history row is there.
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
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261001150000') then
    raise exception 'stop: migration 20261001150000 is already recorded as applied';
  end if;
  if to_regclass('app_private.football_providers') is null
    or to_regclass('app_private.football_provider_mappings') is null then
    raise exception 'stop: the provider table or the mapping table is missing';
  end if;
  if exists (select 1 from app_private.football_providers where name in ('sofascore', 'flashscore')) then
    raise exception 'stop: sofascore or flashscore is already registered';
  end if;
end
$preflight$;

-- What must not change, as it is now (dropped with the transaction).
create temporary table registration_before on commit drop as
select
  (select count(*) from app_private.football_providers) as provider_count,
  (select md5(coalesce(string_agg(name || '|' || display_name || '|' || active::text || '|'
      || configuration_version::text || '|' || created_at::text || '|' || updated_at::text,
      ',' order by name), '')) from app_private.football_providers) as provider_digest,
  (select count(*) from app_private.football_provider_mappings) as mapping_count,
  (select md5(coalesce(string_agg(conname || '|' || pg_get_constraintdef(oid) || '|' || condeferrable::text,
      ',' order by conname), ''))
    from pg_catalog.pg_constraint
    where conrelid = 'app_private.football_provider_mappings'::regclass) as mapping_constraint_digest;

-- ---------------------------------------------------------------------------
-- Migration 20261001150000, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261001150000',
  'register_sofascore_flashscore_providers',
  array[$bg_20261001150000_file$-- BotolaGO Production V2
-- Register the two player-identity providers so a later change can store
-- provider ids and candidates under them. Registration only:
--   * no mapping row is written (app_private.football_provider_mappings and its
--     unique constraints are untouched);
--   * no table, function, grant or policy is created or changed;
--   * nothing reads the new rows yet, so no ingestion, scoring or job changes.
-- Forward-only and idempotent: a provider that is already registered is left
-- exactly as it is (its display name and configuration_version are not changed).
insert into app_private.football_providers (name, display_name)
values
  ('sofascore', 'Sofascore (RapidAPI)'),
  ('flashscore', 'Flashscore (RapidAPI)')
on conflict (name) do nothing;
$bg_20261001150000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261001150000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261001150000'
  );
begin
  if encode(sha256(convert_to(part_20261001150000, 'UTF8')), 'hex')
    is distinct from '0259c253dd732a80479659d0227588cc1b6178154fe71c407f951cf4ab84f8ff' then
    raise exception 'stop: 20261001150000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261001150000;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight (reads only)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  before_state registration_before%rowtype;
  problems text[] := '{}';
begin
  select * into before_state from registration_before;

  if (select count(*) from app_private.football_providers where name in ('sofascore', 'flashscore')) <> 2
    or not exists (select 1 from app_private.football_providers
      where name = 'sofascore' and display_name = 'Sofascore (RapidAPI)' and active and configuration_version = 1)
    or not exists (select 1 from app_private.football_providers
      where name = 'flashscore' and display_name = 'Flashscore (RapidAPI)' and active and configuration_version = 1) then
    problems := problems || 'the two expected provider rows are not exactly as intended'::text;
  end if;
  if (select count(*) from app_private.football_providers) <> before_state.provider_count + 2 then
    problems := problems || 'the provider table did not grow by exactly two rows'::text;
  end if;
  if (select md5(coalesce(string_agg(name || '|' || display_name || '|' || active::text || '|'
        || configuration_version::text || '|' || created_at::text || '|' || updated_at::text,
        ',' order by name), ''))
      from app_private.football_providers where name not in ('sofascore', 'flashscore'))
    is distinct from before_state.provider_digest then
    problems := problems || 'an earlier provider row changed'::text;
  end if;
  if (select count(*) from app_private.football_provider_mappings) is distinct from before_state.mapping_count then
    problems := problems || 'the mapping table row count changed'::text;
  end if;
  if (select md5(coalesce(string_agg(conname || '|' || pg_get_constraintdef(oid) || '|' || condeferrable::text,
        ',' order by conname), ''))
      from pg_catalog.pg_constraint
      where conrelid = 'app_private.football_provider_mappings'::regclass)
    is distinct from before_state.mapping_constraint_digest then
    problems := problems || 'the mapping table constraints changed'::text;
  end if;
  if exists (select 1 from app_private.football_provider_mappings where provider_name in ('sofascore', 'flashscore')) then
    problems := problems || 'a mapping row names a new provider'::text;
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261001150000') then
    problems := problems || 'the history row is missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: postflight failed: %', array_to_string(problems, '; ');
  end if;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261001150000')
    then 'Applied. Providers now registered: ' || (select string_agg(name, ', ' order by name) from app_private.football_providers)
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
