begin;

select extensions.no_plan();

-- The mapping workflow's tables (20261001160000) and what they must NOT change:
-- app_private.football_provider_mappings and its two unconditional unique
-- constraints. Structure only; the behaviour is in
-- football_player_mapping_workflow.test.sql.

-- ---------------------------------------------------------------------------
-- The mapping table is exactly what the earlier migrations made it
-- ---------------------------------------------------------------------------
select extensions.is(
  (select count(*)::int from pg_constraint
   where conrelid = 'app_private.football_provider_mappings'::regclass and contype = 'u'),
  2, 'the mapping table has exactly two unique constraints');

select extensions.is(
  (select string_agg(conname || ':' || pg_get_constraintdef(oid) || ':' || condeferrable::text, '|' order by conname)
   from pg_constraint
   where conrelid = 'app_private.football_provider_mappings'::regclass and contype = 'u'),
  'football_provider_mappings_external_key:UNIQUE (provider_name, entity_type, external_id):false|football_provider_mappings_internal_key:UNIQUE (provider_name, entity_type, internal_entity_id):false',
  'both are unconditional (no WHERE), not deferrable, unchanged');

select extensions.is(
  (select count(*)::int from pg_index i
   where i.indrelid = 'app_private.football_provider_mappings'::regclass
     and i.indpred is not null
     and (i.indisunique)),
  0, 'and no partial unique index exists on the mapping table');

select extensions.is(
  (select count(*)::int from pg_trigger
   where tgrelid = 'app_private.football_provider_mappings'::regclass and not tgisinternal),
  2, 'the mapping table has only its two original triggers (updated_at, target check)');

select extensions.is(
  (select count(*)::int from pg_constraint c
   where c.confrelid = 'app_private.football_provider_mappings'::regclass),
  0, 'no table references the mapping table (a foreign key would add triggers to it)');

select extensions.is(
  (select count(*)::int from app_private.football_provider_mappings
   where provider_name in ('sofascore', 'flashscore')),
  0, 'applying the migrations created no mapping row for either new provider');

select extensions.is(
  (select count(*)::int from app_private.football_player_mapping_candidates), 0,
  'the new tables start empty: the migration itself creates no candidate');
select extensions.is(
  (select count(*)::int from app_private.football_player_mapping_proposals), 0,
  'and no proposal');

-- ---------------------------------------------------------------------------
-- Access: none, for every role
-- ---------------------------------------------------------------------------
select extensions.is(
  (select count(*)::int
   from (values ('app_private.football_player_mapping_candidates'),
                ('app_private.football_player_mapping_observations'),
                ('app_private.football_player_mapping_proposals')) t(name),
        (values ('anon'), ('authenticated'), ('service_role'), ('public')) r(role)
   where r.role <> 'public' and (
     has_table_privilege(r.role, t.name, 'select') or has_table_privilege(r.role, t.name, 'insert')
     or has_table_privilege(r.role, t.name, 'update') or has_table_privilege(r.role, t.name, 'delete'))),
  0, 'anon, authenticated and service_role hold no table privilege on any of them');

select extensions.is(
  (select count(*)::int from pg_class
   where oid in ('app_private.football_player_mapping_candidates'::regclass,
                 'app_private.football_player_mapping_observations'::regclass,
                 'app_private.football_player_mapping_proposals'::regclass)
     and relrowsecurity and relforcerowsecurity),
  3, 'row level security is enabled and forced on all three');

select extensions.is(
  (select count(*)::int from pg_policy
   where polrelid in ('app_private.football_player_mapping_candidates'::regclass,
                      'app_private.football_player_mapping_observations'::regclass,
                      'app_private.football_player_mapping_proposals'::regclass)),
  0, 'and there is no policy');

-- ---------------------------------------------------------------------------
-- Identity: one candidate per provider identity
-- ---------------------------------------------------------------------------
select extensions.is(
  (select pg_get_constraintdef(oid) from pg_constraint
   where conname = 'football_player_mapping_candidates_identity_key'),
  'UNIQUE (provider_name, external_id)',
  'a candidate is keyed on provider_name + external_id, not on a club');

select extensions.is(
  (select count(*)::int from information_schema.columns
   where table_schema = 'app_private' and table_name = 'football_player_mapping_candidates'
     and column_name in ('team_id', 'club_key', 'provider_team_id', 'app_team_id')),
  0, 'the candidate carries no club: squads are observations');

select extensions.is(
  (select pg_get_constraintdef(oid) from pg_constraint
   where conname = 'football_player_mapping_observations_context_key'),
  'UNIQUE (candidate_id, provider_team_id)',
  'one observation per candidate and requested squad');

-- ---------------------------------------------------------------------------
-- Dual control is in the table, not only in the functions
-- ---------------------------------------------------------------------------
select extensions.is(
  (select pg_get_constraintdef(oid) from pg_constraint
   where conname = 'football_player_mapping_proposals_two_people_check'),
  'CHECK (((decided_by IS NULL) OR (decided_by IS DISTINCT FROM requested_by)))',
  'requested_by <> decided_by is a table check for every kind');

-- ---------------------------------------------------------------------------
-- No function that decides anything reads a name
-- ---------------------------------------------------------------------------
select extensions.is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where ((n.nspname = 'app_private' and p.proname in (
       'football_mapping_compute', 'football_mapping_revalidate', 'football_mapping_candidate_signals',
       'football_mapping_signal_score', 'football_mapping_row_fingerprint', 'football_mapping_dob_signal',
       'football_mapping_hold_status', 'football_mapping_resync_candidate',
       'football_mapping_release_candidates', 'football_mapping_audit', 'football_mapping_position_letter'))
     or (n.nspname = 'api' and p.proname in (
       'admin_football_mapping_propose', 'admin_football_mapping_decide', 'admin_football_mapping_execute',
       'admin_football_mapping_cancel', 'admin_football_mapping_add_position_note',
       'admin_football_mapping_refresh_evidence', 'football_mapping_expire_proposals')))
     and p.prosrc ~* '(display_name|full_name|first_name|last_name|short_name|displayname|playername)'),
  0, 'no function that ranks, fingerprints, decides or executes reads a name column');

select extensions.is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('api', 'app_private') and p.proname like '%football_mapping%'
     and p.prosecdef
     and not (p.proconfig @> array['search_path=""'])),
  0, 'every mapping function is SECURITY DEFINER with an empty search_path');

-- ---------------------------------------------------------------------------
-- Privileges on the functions
-- ---------------------------------------------------------------------------
select extensions.is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app_private' and p.proname like 'football_mapping%'
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
       or has_function_privilege('service_role', p.oid, 'execute'))),
  0, 'no API role can run an internal mapping helper');

select extensions.is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'api' and p.proname like 'admin_football_mapping%'
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('service_role', p.oid, 'execute'))),
  0, 'anon and service_role cannot run any staff mapping function');

select extensions.is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'api' and p.proname like 'admin_football_mapping%'
     and not has_function_privilege('authenticated', p.oid, 'execute')),
  0, 'staff reach the staff functions through authenticated (authority is checked inside)');

select extensions.is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'api' and p.proname in ('football_mapping_record_observations',
     'football_mapping_expire_proposals', 'football_mapping_purge_display_names')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
       or not has_function_privilege('service_role', p.oid, 'execute'))),
  0, 'the three trusted jobs are service_role only');

select extensions.is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
        aclexplode(p.proacl) acl
   where n.nspname in ('api', 'app_private') and p.proname like '%football_mapping%' and acl.grantee = 0),
  0, 'PUBLIC holds no grant on any mapping function');

select * from extensions.finish();
rollback;
