-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply the Flashscore SUPPORTING-DEPENDENCY guard, in ONE transaction:
--   20261003120000  football_mapping_supporting_dependency
--
-- WHAT IT CHANGES (owner decision, 3 Oct 2026: a Flashscore mapping may rest only on a
-- reviewed Sofascore mapping, and the DATABASE, not the browser, must enforce that)
--   * two new proposal columns (evidence_class, supporting_mapping_id), one check
--     constraint and one partial index on app_private.football_player_mapping_proposals;
--   * three new internal functions (the supporting-mapping state, the dependency check)
--     and one new staff read, api.admin_football_mapping_get_provider_mapping;
--   * the nine-argument compute function is DROPPED (a plain DROP FUNCTION of exactly that signature) and
--     replaced by a twelve-argument one; propose, refresh, revalidate, execute and the
--     proposal guard trigger function are REPLACED, same signatures, same grants.
--   It writes no proposal, no mapping row, no candidate, no audit event, no Fantasy row,
--   no score, and installs no schedule.
--
-- HOW TO RUN
--   As shipped it is a REHEARSAL: everything is applied inside the transaction, checked,
--   and ROLLED BACK. The result row says "Rehearsal passed". The real apply (ONLY after
--   the owner has approved the commit) turns the one `rollback;` into `commit;` and
--   changes nothing else. Do NOT edit a check to make it pass: a check firing means the
--   database is not in the state this script was reviewed against.
--
-- WHAT IT PROVES INSIDE THE TRANSACTION (read-only against production data)
--   * the six functions being replaced are the reviewed text; the migration is the
--     repository file byte for byte (sha256 d435bde5d9ca114a17f94786178b1f4261ff3b8e8c65f8d8f8fcbd70baa18577);
--   * afterwards: the old compute signature is gone, the new one exists, no renamed
--     legacy copy exists, the new functions are the reviewed text with the reviewed grants,
--     existing grants, constraints, triggers, indexes, RLS are unchanged;
--   * every existing proposal, mapping, candidate and observation is unchanged (content
--     digests, explicit legacy columns), nothing was created;
--   * every active Sofascore mapping reads as reviewed through the new state function;
--   * all 42 manifest rows (v2, manifest sha256 f2eef95dd199244ca6c48e9a2e0595a39a6bc2e534e7455a41467c7dba17a286): the supporting
--     mapping is in the expected state, the server computes the same fingerprint the
--     manifest holds, and none of the 11 held rows is among them.
-- It does not create a proposal and it does not verify any provider's match events or
-- birth dates; the server validates mapping state and stored provenance only.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  v record;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations
      where name in ('news_engine_core', 'news_engine_seed', 'fantasy_incremental_envelope_fail_closed')) then
    raise exception 'stop: a staging-only migration is recorded -- this looks like STAGING, not Production V2';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations
      where version = '20261003120000' or name = 'football_mapping_supporting_dependency') then
    raise exception 'stop: this migration is already recorded (already applied)';
  end if;
  -- Exactly the reviewed history after the mapping backend: the single-approver switch and the
  -- unrelated read-only reminders function, each recorded with the repository file's sha256.
  if (select string_agg(version || ':' || name || ':' || encode(sha256(convert_to(statements[1], 'UTF8')), 'hex'), ',' order by version)
      from supabase_migrations.schema_migrations where version > '20261001161000')
    is distinct from '20261002100000:football_mapping_single_approver_switch:1fb64a5c5a8a231715663e38159a826842bf00360a058492fce666eb032c904e,20261002110000:list_my_match_reminders:c0512530a5fc67fc3da8de7dd96b497d984f743b9e54c707446161958048fdf2' then
    raise exception 'stop: the migrations recorded after 20261001161000 are not exactly the reviewed single-approver switch and list_my_match_reminders';
  end if;
  -- Single-operator mode is the state this was reviewed in.
  if to_regclass('app_private.football_mapping_settings') is null
    or (select count(*) from app_private.football_mapping_settings) <> 1
    or not (select allow_self_approval from app_private.football_mapping_settings where singleton) then
    raise exception 'stop: single-operator mode (football_mapping_settings.allow_self_approval) is not ON';
  end if;

  -- Nothing of this migration exists yet (not applied, not partly applied).
  if to_regprocedure('app_private.football_mapping_supporting_state(uuid)') is not null
    or to_regprocedure('app_private.football_mapping_supporting_dependency(text,uuid,uuid)') is not null
    or to_regprocedure('api.admin_football_mapping_get_provider_mapping(text,text)') is not null
    or to_regprocedure('app_private.football_mapping_compute(text,uuid,uuid,text,uuid,uuid,text,uuid,uuid,text,uuid,jsonb)') is not null then
    raise exception 'stop: a function of this migration already exists (partly applied?)';
  end if;
  if exists (select 1 from pg_catalog.pg_attribute
      where attrelid = 'app_private.football_player_mapping_proposals'::regclass
        and attname in ('evidence_class', 'supporting_mapping_id') and not attisdropped)
    or exists (select 1 from pg_catalog.pg_constraint where conname = 'football_player_mapping_proposals_supporting_check')
    or to_regclass('app_private.football_player_mapping_proposals_supporting_idx') is not null then
    raise exception 'stop: a column, constraint or index of this migration already exists (partly applied?)';
  end if;
  -- Exactly one compute function, the nine-argument one, and no stray copy under any name.
  if (select count(*) from pg_catalog.pg_proc p
        where p.pronamespace in ('api'::regnamespace, 'app_private'::regnamespace, 'public'::regnamespace)
          and p.proname ilike '%football_mapping_compute%') <> 1 then
    raise exception 'stop: there is not exactly one football_mapping_compute function';
  end if;

  -- The six functions this replaces are the reviewed text.
  for v in
    select * from (values
      ('app_private.football_mapping_compute(text,uuid,uuid,text,uuid,uuid,text,uuid,uuid)', '36269e06556de5376c4ba9208278b4c4'),
      ('api.admin_football_mapping_propose(jsonb,text,uuid)', 'f5d0763b027e80822266da71fa7ecbfa'),
      ('app_private.football_mapping_revalidate(uuid)', '13e0707e390ec73af8ff4255f9986927'),
      ('api.admin_football_mapping_refresh_evidence(uuid,uuid)', 'e7d0e0ac179efc20a13149ff832ae60f'),
      ('api.admin_football_mapping_execute(uuid,uuid)', '1c0951a9f61cf0baa2970b720b90cfb4'),
      ('app_private.football_mapping_proposal_guard()', '9a09d8f704c30f18cd544c7455dc665d')
    ) as t(signature, expected)
  loop
    if to_regprocedure(v.signature) is null
      or md5(pg_get_functiondef(v.signature::regprocedure)) <> v.expected then
      raise exception 'stop: % is not the reviewed text', v.signature;
    end if;
  end loop;
  if to_regprocedure('app_private.football_mapping_row_fingerprint(app_private.football_player_mapping_proposals)') is null
    or md5(pg_get_functiondef('app_private.football_mapping_row_fingerprint(app_private.football_player_mapping_proposals)'::regprocedure)) is distinct from '7b6f2aa23be6c584b0ed2e71d1bbea7b'
    or md5(pg_get_functiondef('api.resolve_football_mapping(text,text,text,uuid,text,timestamp with time zone)'::regprocedure)) is distinct from 'c4c7253284afa52aea055f74e3806d73' then
    raise exception 'stop: the row-fingerprint function or the resolver guard is not the reviewed text';
  end if;

  -- The reviewed schema: constraints (including both uniqueness keys), triggers, indexes, RLS, grants.
  if (select count(*) from pg_catalog.pg_constraint
        where conrelid = 'app_private.football_provider_mappings'::regclass
          and conname in ('football_provider_mappings_external_key', 'football_provider_mappings_internal_key', 'football_provider_mappings_pkey')) <> 3 then
    raise exception 'stop: the mapping table lost one of its uniqueness keys';
  end if;
  if (select md5(string_agg(column_name || ':' || data_type || ':' || is_nullable, '|' order by ordinal_position)) from information_schema.columns where table_schema = 'app_private' and table_name = 'football_player_mapping_proposals' and column_name not in ('evidence_class', 'supporting_mapping_id')) is distinct from 'c437688f64bbd739ef9347c81f83802b'
    or (select md5(string_agg(conname || '=' || pg_get_constraintdef(oid), '|' order by conname)) from pg_catalog.pg_constraint where conrelid = 'app_private.football_player_mapping_proposals'::regclass and conname <> 'football_player_mapping_proposals_supporting_check') is distinct from 'cbc71b51c61c0ee783e7b9aedb9ee173'
    or (select md5(string_agg(conname || '=' || pg_get_constraintdef(oid), '|' order by conname)) from pg_catalog.pg_constraint where conrelid = 'app_private.football_provider_mappings'::regclass) is distinct from '533eb1ade4997c1d673f18de52657a6c'
    or (select md5(string_agg(tgname || '=' || pg_get_triggerdef(oid), '|' order by tgname)) from pg_catalog.pg_trigger where tgrelid = 'app_private.football_player_mapping_proposals'::regclass and not tgisinternal) is distinct from 'a7ab3a52b9ae4e86627714f1c79eb3f6'
    or (select md5(string_agg(tgname || '=' || pg_get_triggerdef(oid), '|' order by tgname)) from pg_catalog.pg_trigger where tgrelid = 'app_private.football_provider_mappings'::regclass and not tgisinternal) is distinct from '0c3ff75c8fc8a11e33926894f78674b5'
    or (select md5(string_agg(indexname || '=' || indexdef, '|' order by indexname)) from pg_catalog.pg_indexes where schemaname = 'app_private' and tablename = 'football_player_mapping_proposals' and indexname <> 'football_player_mapping_proposals_supporting_idx') is distinct from '85d2a922d35f8203d2f4cf769d36858c'
    or (select md5(string_agg(c.relname || ':' || coalesce(c.relacl::text, '') || ':' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text, '|' order by c.relname)) from pg_catalog.pg_class c where c.relnamespace = 'app_private'::regnamespace and c.relname in ('football_provider_mappings', 'football_player_mapping_proposals', 'football_player_mapping_candidates', 'football_player_mapping_observations', 'football_mapping_settings')) is distinct from 'b367fecc3c629694ee4ae37a8b691fe8'
    or (select md5(string_agg(p.oid::regprocedure::text || ':' || coalesce(p.proacl::text, 'null'), '|' order by p.oid::regprocedure::text)) from pg_catalog.pg_proc p where p.pronamespace in ('api'::regnamespace, 'app_private'::regnamespace) and p.proname like '%football_mapping%' and p.proname not in ('football_mapping_compute', 'football_mapping_supporting_state', 'football_mapping_supporting_dependency', 'admin_football_mapping_get_provider_mapping')) is distinct from 'a0e4ed9734ab508b0e14cd9856e9a9ff' then
    raise exception 'stop: the mapping tables, constraints, triggers, indexes or grants are not the reviewed schema';
  end if;
  if not exists (select 1 from app_private.admin_permissions
      where name = 'football.manage_mappings' and active and requires_mfa and requires_recent_auth) then
    raise exception 'stop: football.manage_mappings is not an active permission requiring MFA and recent authentication';
  end if;

  -- No open proposal, no conflicting write: every proposal is in a final state.
  if exists (select 1 from app_private.football_player_mapping_proposals
      where status not in ('executed', 'rejected', 'expired', 'cancelled', 'identity_conflict', 'already_mapped')) then
    raise exception 'stop: an open mapping proposal exists -- review this script against it first';
  end if;
  if exists (select 1 from app_private.football_provider_mappings where provider_name = 'flashscore') then
    raise exception 'stop: a Flashscore mapping already exists -- this script was reviewed against none';
  end if;
  if exists (select 1 from pg_catalog.pg_stat_activity
      where pid <> pg_backend_pid() and backend_type = 'client backend'
        and state in ('active', 'idle in transaction', 'idle in transaction (aborted)')) then
    raise exception 'stop: another database session is working right now -- wait for it to finish (one writer at a time)';
  end if;
  if to_regprocedure('app_private.hold_scheduled_jobs()') is null
    or md5(pg_get_functiondef('app_private.hold_scheduled_jobs()'::regprocedure)) is distinct from 'e0ff799389c935e3844df2620b53ae87' then
    raise exception 'stop: app_private.hold_scheduled_jobs is not the reviewed text';
  end if;
  perform app_private.hold_scheduled_jobs();
  if exists (select 1 from app.fantasy_gameweeks where status = 'finalizing') then
    raise exception 'stop: a Fantasy gameweek is finalizing right now';
  end if;
  if exists (select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled) then
    raise exception 'stop: the Fantasy lifecycle tick is on -- pause it first';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- What must not change, as it is now (dropped with the transaction)
-- ---------------------------------------------------------------------------
create temporary table guard_baseline on commit drop as
select
  (select count(*) from app_private.football_provider_mappings) as mapping_count,
  (select md5(coalesce(string_agg(m::text, '|' order by m.id), '')) from app_private.football_provider_mappings m) as mapping_digest,
  (select count(*) from app_private.football_player_mapping_proposals) as proposals,
  -- The same explicit legacy columns before and after (the two new columns are not part of them).
  (select md5(coalesce(string_agg((to_jsonb(p) - 'evidence_class' - 'supporting_mapping_id')::text, '|' order by p.id), ''))
    from app_private.football_player_mapping_proposals p) as proposal_digest,
  (select count(*) from app_private.football_player_mapping_candidates) as candidates,
  (select md5(coalesce(string_agg(c::text, '|' order by c.id), '')) from app_private.football_player_mapping_candidates c) as candidate_digest,
  (select count(*) from app_private.football_player_mapping_observations) as observations,
  (select md5(coalesce(string_agg(o::text, '|' order by o.id), '')) from app_private.football_player_mapping_observations o) as observation_digest,
  (select md5(coalesce(string_agg(s::text, '|'), '')) from app_private.football_mapping_settings s) as settings_digest,
  (select count(*) from app_private.football_provider_mappings where provider_name = 'sofascore' and active) as sofascore_active,
  (select md5(string_agg(column_name || ':' || data_type || ':' || is_nullable, '|' order by ordinal_position)) from information_schema.columns where table_schema = 'app_private' and table_name = 'football_player_mapping_proposals' and column_name not in ('evidence_class', 'supporting_mapping_id')) as f_prop_cols,
  (select md5(string_agg(conname || '=' || pg_get_constraintdef(oid), '|' order by conname)) from pg_catalog.pg_constraint where conrelid = 'app_private.football_player_mapping_proposals'::regclass and conname <> 'football_player_mapping_proposals_supporting_check') as f_prop_cons,
  (select md5(string_agg(conname || '=' || pg_get_constraintdef(oid), '|' order by conname)) from pg_catalog.pg_constraint where conrelid = 'app_private.football_provider_mappings'::regclass) as f_map_cons,
  (select md5(string_agg(tgname || '=' || pg_get_triggerdef(oid), '|' order by tgname)) from pg_catalog.pg_trigger where tgrelid = 'app_private.football_player_mapping_proposals'::regclass and not tgisinternal) as f_prop_trig,
  (select md5(string_agg(tgname || '=' || pg_get_triggerdef(oid), '|' order by tgname)) from pg_catalog.pg_trigger where tgrelid = 'app_private.football_provider_mappings'::regclass and not tgisinternal) as f_map_trig,
  (select md5(string_agg(indexname || '=' || indexdef, '|' order by indexname)) from pg_catalog.pg_indexes where schemaname = 'app_private' and tablename = 'football_player_mapping_proposals' and indexname <> 'football_player_mapping_proposals_supporting_idx') as f_prop_idx,
  (select md5(string_agg(c.relname || ':' || coalesce(c.relacl::text, '') || ':' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text, '|' order by c.relname)) from pg_catalog.pg_class c where c.relnamespace = 'app_private'::regnamespace and c.relname in ('football_provider_mappings', 'football_player_mapping_proposals', 'football_player_mapping_candidates', 'football_player_mapping_observations', 'football_mapping_settings')) as f_rel,
  (select md5(string_agg(p.oid::regprocedure::text || ':' || coalesce(p.proacl::text, 'null'), '|' order by p.oid::regprocedure::text)) from pg_catalog.pg_proc p where p.pronamespace in ('api'::regnamespace, 'app_private'::regnamespace) and p.proname like '%football_mapping%' and p.proname not in ('football_mapping_compute', 'football_mapping_supporting_state', 'football_mapping_supporting_dependency', 'admin_football_mapping_get_provider_mapping')) as f_fn_acl,
  (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'api') as api_procs,
  (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app_private') as private_procs,
  (select count(*) from cron.job) as cron_jobs,
  (select md5(coalesce(string_agg(jobid::text || ':' || schedule || ':' || command || ':' || active::text, '|' order by jobid), ''))
    from cron.job) as cron_digest,
  (select count(*) from app_private.admin_audit_events) as audit_events,
  (select count(*) from app_private.admin_idempotency_keys) as idempotency_keys,
  (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app_private.admin_permissions t) as permissions_digest,
  (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app_private.admin_roles t) as roles_digest,
  (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app_private.staff_principals t) as principals_digest,
  (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app_private.staff_role_assignments t) as assignments_digest,
  (select md5(coalesce(string_agg(t::text, '|'), '')) from app_private.admin_role_permissions t) as role_permissions_digest,
  (select md5(coalesce(string_agg(t::text, '|'), '')) from app_private.fantasy_automation_settings t) as automation_digest,
  (select md5(coalesce(string_agg(p::text, '|' order by p.id), '')) from app.players p) as players_digest,
  (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app.team_memberships t) as memberships_digest,
  jsonb_build_object(
    'fantasy_seasons', (select count(*) from app.fantasy_seasons),
    'fantasy_gameweeks', (select count(*) from app.fantasy_gameweeks),
    'fantasy_players', (select count(*) from app.fantasy_players),
    'fantasy_teams', (select count(*) from app.fantasy_teams),
    'fantasy_lineup_players', (select count(*) from app.fantasy_lineup_players),
    'fantasy_player_gameweek_points', (select count(*) from app.fantasy_player_gameweek_points),
    'fantasy_player_point_events', (select count(*) from app.fantasy_player_point_events),
    'fantasy_team_gameweek_results', (select count(*) from app.fantasy_team_gameweek_results),
    'players', (select count(*) from app.players),
    'team_memberships', (select count(*) from app.team_memberships),
    'fixtures', (select count(*) from app.fixtures),
    'lineup_players', (select count(*) from app.lineup_players),
    'player_fixture_performances', (select count(*) from app.player_fixture_performances)
  ) as counts,
  (select md5(coalesce(string_agg(g::text, '|' order by g.id), '')) from app.fantasy_gameweeks g) as gameweek_digest;

-- ---------------------------------------------------------------------------
-- The migration, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261003120000',
  'football_mapping_supporting_dependency',
  array[$bg_20261003120000_file$-- A Flashscore identity is mapped only while the Sofascore mapping it rests on is, in the database,
-- exactly what the reviewer saw: the same row, still active, still reviewed, still on the same
-- canonical player, in the same state. Today that is checked by the client only; this migration makes
-- the database enforce it in the trusted lifecycle, in the transaction that writes the mapping.
--
-- What changes (and nothing else):
--   1. api.admin_football_mapping_get_provider_mapping: a staff read of the ACTUAL mapping row, with
--      its review state and provenance computed from the row and the audit record, never from a
--      version-string prefix alone.
--   2. Two proposal columns (evidence_class, supporting_mapping_id), immutable, required for every
--      Flashscore-only map and for a Flashscore replace or reactivate, and refused everywhere else.
--      (A proposal that maps a Sofascore AND a Flashscore identity together creates both in one
--      reviewed transaction and rests on nothing outside it: it takes no dependency.) The
--      supporting mapping's state is read by the SERVER, stored in the proposal's evidence, and so
--      part of its fingerprint; it is re-read at approval and again, locked, at execution.
--   3. Execution locks the supporting mapping (SHARE, after the proposal and before the candidates and
--      the mapping table: one lock order) and refuses with a stable code, writing nothing, when it is
--      missing, inactive, unreviewed, on another player, or changed.
-- Sofascore proposals, their fingerprints and the 191 completed mappings are untouched.
-- Single-approver mode, AAL2, recent sign-in, permissions, idempotency, the audit trail, the mapping
-- table's unique constraints and the generic resolver's MAPPING_REVIEW_REQUIRED guard are unchanged.
-- The server validates the stored provenance and the dependency; it does not claim to have verified
-- the provider's match events or birth dates themselves.

-- ===========================================================================
-- Preflight: this migration replaces functions whose text was reviewed. Apply it only onto exactly that.
-- ===========================================================================
do $guard_preflight$
declare
  v record;
begin
  for v in
    select * from (values
      ('app_private.football_mapping_compute(text,uuid,uuid,text,uuid,uuid,text,uuid,uuid)', '36269e06556de5376c4ba9208278b4c4'),
      ('api.admin_football_mapping_propose(jsonb,text,uuid)', 'f5d0763b027e80822266da71fa7ecbfa'),
      ('app_private.football_mapping_revalidate(uuid)', '13e0707e390ec73af8ff4255f9986927'),
      ('api.admin_football_mapping_refresh_evidence(uuid,uuid)', 'e7d0e0ac179efc20a13149ff832ae60f'),
      ('api.admin_football_mapping_execute(uuid,uuid)', '1c0951a9f61cf0baa2970b720b90cfb4'),
      ('app_private.football_mapping_proposal_guard()', '9a09d8f704c30f18cd544c7455dc665d')
    ) as t(signature, expected)
  loop
    if to_regprocedure(v.signature) is null
      or md5(pg_get_functiondef(v.signature::regprocedure)) <> v.expected then
      raise exception 'football_mapping supporting dependency: % is not the text this migration was reviewed against', v.signature;
    end if;
  end loop;
  if exists (select 1 from information_schema.columns
    where table_schema = 'app_private' and table_name = 'football_player_mapping_proposals'
      and column_name in ('evidence_class', 'supporting_mapping_id')) then
    raise exception 'football_mapping supporting dependency: the proposal columns already exist';
  end if;
end
$guard_preflight$;

-- ===========================================================================
-- 1. The proposal's dependency columns (immutable; the evidence carries the state)
-- ===========================================================================
alter table app_private.football_player_mapping_proposals
  add column evidence_class text,
  add column supporting_mapping_id uuid;   -- plain uuid on purpose: no foreign key to the mapping table (see its design note)
alter table app_private.football_player_mapping_proposals
  add constraint football_player_mapping_proposals_supporting_check check (
    (evidence_class is null) = (supporting_mapping_id is null)
    and (evidence_class is null
      or evidence_class in ('F1_REVIEWED_SOFASCORE_EVENTS', 'F2_REVIEWED_SOFASCORE_SHIRT_DOB'))
    -- Required for every Flashscore-only map and for a Flashscore replace or reactivate; present nowhere else.
    -- (A proposal mapping a Sofascore AND a Flashscore identity together creates both in one reviewed
    -- transaction and rests on nothing outside it.)
    and ((kind = 'map' and flashscore_candidate_id is not null and sofascore_candidate_id is null)
      or (kind in ('replace', 'reactivate') and provider_name = 'flashscore'))
      = (supporting_mapping_id is not null)
  );
create index football_player_mapping_proposals_supporting_idx
  on app_private.football_player_mapping_proposals (supporting_mapping_id)
  where supporting_mapping_id is not null;

CREATE OR REPLACE FUNCTION app_private.football_mapping_proposal_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  refreshing boolean := coalesce(current_setting('app.football_mapping_refresh', true), '') = 'on';
  allowed boolean;
begin
  if old.status in ('executed', 'rejected', 'expired', 'cancelled', 'identity_conflict', 'already_mapped') then
    raise exception using errcode = '42501', message = 'football_mapping_proposal_is_final';
  end if;

  if new.id is distinct from old.id
    or new.batch_id is distinct from old.batch_id
    or new.kind is distinct from old.kind
    or new.requested_by is distinct from old.requested_by
    or new.requested_at is distinct from old.requested_at
    or new.correlation_id is distinct from old.correlation_id
    or new.sofascore_candidate_id is distinct from old.sofascore_candidate_id
    or new.flashscore_candidate_id is distinct from old.flashscore_candidate_id
    or new.sofascore_external_id is distinct from old.sofascore_external_id
    or new.flashscore_external_id is distinct from old.flashscore_external_id
    or new.provider_name is distinct from old.provider_name
    or new.mapping_id is distinct from old.mapping_id
    or new.app_player_id is distinct from old.app_player_id
    or new.new_external_id is distinct from old.new_external_id
    or new.new_app_player_id is distinct from old.new_app_player_id
    or new.basis is distinct from old.basis
    or new.evidence_class is distinct from old.evidence_class
    or new.supporting_mapping_id is distinct from old.supporting_mapping_id
    or new.reason is distinct from old.reason then
    raise exception using errcode = '42501', message = 'football_mapping_proposal_payload_is_immutable';
  end if;

  if not refreshing and (
    new.expected_before is distinct from old.expected_before
    or new.evidence is distinct from old.evidence
    or new.signals is distinct from old.signals
    or new.candidate_revisions is distinct from old.candidate_revisions
    or new.position_disagreement is distinct from old.position_disagreement
    or new.fingerprint is distinct from old.fingerprint
    or new.expires_at is distinct from old.expires_at
  ) then
    -- The note is added through its own function (position_note below).
    raise exception using errcode = '42501', message = 'football_mapping_proposal_evidence_is_immutable';
  end if;

  if new.position_note is distinct from old.position_note
    and not refreshing
    and coalesce(current_setting('app.football_mapping_note', true), '') <> 'on' then
    raise exception using errcode = '42501', message = 'football_mapping_proposal_note_is_set_by_function';
  end if;

  -- A decision, once made, is only ever cleared by a refresh.
  if old.decided_by is not null and new.decided_by is distinct from old.decided_by and not refreshing then
    raise exception using errcode = '42501', message = 'football_mapping_decision_is_immutable';
  end if;
  if old.executed_at is not null then
    raise exception using errcode = '42501', message = 'football_mapping_proposal_is_final';
  end if;

  if new.status is distinct from old.status then
    allowed := case old.status
      when 'pending' then new.status in ('approved', 'rejected', 'expired', 'cancelled',
        'stale_evidence', 'identity_conflict', 'position_disagreement', 'already_mapped')
      when 'position_disagreement' then new.status in ('pending', 'cancelled', 'expired',
        'stale_evidence', 'identity_conflict', 'already_mapped')
      when 'approved' then new.status in ('executed', 'stale_evidence', 'identity_conflict',
        'already_mapped', 'expired', 'cancelled')
      when 'stale_evidence' then new.status in ('pending', 'position_disagreement', 'cancelled', 'expired')
      else false
    end;
    if not allowed then
      raise exception using errcode = '42501',
        message = 'football_mapping_proposal_transition_refused',
        detail = old.status || ' -> ' || new.status;
    end if;
    if new.status = 'approved' and new.decided_by is null then
      raise exception using errcode = '42501', message = 'football_mapping_approval_needs_a_decider';
    end if;
  end if;
  return new;
end;
$function$;

-- ===========================================================================
-- 2. The mapping row's real state, and the dependency check built on it
-- ===========================================================================
-- Reviewed means ALL of: the row says a person corrected it (manually_corrected, with the reason, the
-- person and the time the table's own check ties to it); its version marker names an EXECUTED proposal;
-- that proposal's audit record shows it wrote this row with this external id, player and active state;
-- the row's reason is that proposal's reason; and the row's corrector is that proposal's approver. A
-- marker string on its own proves nothing: a row edited by hand while the old marker stays no longer
-- matches the audit record and is not reviewed.
create function app_private.football_mapping_supporting_state(p_mapping_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m app_private.football_provider_mappings%rowtype;
  v_prefix constant text := 'football_player_mapping:';
  v_pid uuid := null;
  v_reviewed boolean := false;
begin
  select * into m from app_private.football_provider_mappings where id = p_mapping_id;
  if not found then return null; end if;
  if m.source_version like v_prefix || '%'
    and substr(m.source_version, char_length(v_prefix) + 1)
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_pid := substr(m.source_version, char_length(v_prefix) + 1)::uuid;
  end if;
  if m.manually_corrected and m.corrected_by is not null and m.corrected_at is not null
    and m.correction_reason is not null and v_pid is not null then
    v_reviewed := exists (
      select 1
      from app_private.football_player_mapping_proposals pr
      join app_private.staff_principals sp on sp.id = pr.decided_by
      where pr.id = v_pid and pr.status = 'executed'
        and sp.auth_user_id = m.corrected_by
        and pr.reason = m.correction_reason
        and exists (
          select 1
          from jsonb_array_elements(
            case when jsonb_typeof(pr.executed_after -> 'rows') = 'array' then pr.executed_after -> 'rows'
                 else jsonb_build_array(pr.executed_after) end) w
          where w ->> 'mappingId' = m.id::text
            and w ->> 'provider' = m.provider_name
            and w ->> 'externalId' = m.external_id
            and w ->> 'appPlayerId' = m.internal_entity_id::text
            and (w ->> 'active')::boolean = m.active));
  end if;
  return jsonb_build_object(
    'mappingId', m.id,
    'provider', m.provider_name,
    'entityType', m.entity_type::text,
    'externalId', m.external_id,
    'appPlayerId', m.internal_entity_id,
    'active', m.active,
    'manuallyCorrected', m.manually_corrected,
    'reviewed', v_reviewed,
    'reviewProvenance', case when v_reviewed then 'executed_proposal' else 'none' end,
    'provenanceProposalId', case when v_reviewed then v_pid end,
    'correctedAt', m.corrected_at,
    'sourceVersion', m.source_version,
    'updatedAt', m.updated_at,
    -- Covers every field that makes the row what it is. Not last_seen_at or updated_at: ingestion may
    -- touch those without changing the identity.
    'stateDigest', app_private.admin_payload_fingerprint(jsonb_build_object(
      'id', m.id, 'provider', m.provider_name, 'entityType', m.entity_type::text,
      'externalId', m.external_id, 'appPlayerId', m.internal_entity_id, 'active', m.active,
      'manuallyCorrected', m.manually_corrected, 'correctedBy', m.corrected_by,
      -- Written out in UTC: jsonb prints a timestamptz in the SESSION's time zone, and a digest must not depend on it.
      'correctedAt', to_char(m.corrected_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'correctionReason', m.correction_reason,
      'sourceVersion', m.source_version, 'reviewed', v_reviewed,
      'provenanceProposalId', case when v_reviewed then v_pid end)));
end;
$$;

-- Either {"ok": false, "code": ...} or {"ok": true, "supporting": ...}: the block that goes into the
-- proposal's evidence (and so into its fingerprint) and is compared again at approval and execution.
create function app_private.football_mapping_supporting_dependency(
  p_evidence_class text,
  p_supporting_mapping uuid,
  p_target uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s jsonb;
begin
  if p_evidence_class is null or p_supporting_mapping is null then
    return app_private.football_mapping_refuse('supporting_dependency_required');
  end if;
  if p_evidence_class not in ('F1_REVIEWED_SOFASCORE_EVENTS', 'F2_REVIEWED_SOFASCORE_SHIRT_DOB') then
    return app_private.football_mapping_refuse('supporting_dependency_invalid');
  end if;
  s := app_private.football_mapping_supporting_state(p_supporting_mapping);
  if s is null then
    return app_private.football_mapping_refuse('supporting_mapping_missing');
  end if;
  if s ->> 'provider' <> 'sofascore' or s ->> 'entityType' <> 'player' then
    return app_private.football_mapping_refuse('supporting_mapping_not_sofascore');
  end if;
  if not (s ->> 'active')::boolean then
    return app_private.football_mapping_refuse('supporting_mapping_inactive');
  end if;
  if not (s ->> 'reviewed')::boolean then
    return app_private.football_mapping_refuse('supporting_mapping_unreviewed');
  end if;
  if (s ->> 'appPlayerId')::uuid is distinct from p_target then
    return app_private.football_mapping_refuse('supporting_mapping_target_mismatch');
  end if;
  return jsonb_build_object('ok', true, 'supporting', jsonb_build_object(
    'mappingId', s -> 'mappingId', 'provider', s -> 'provider', 'externalId', s -> 'externalId',
    'appPlayerId', s -> 'appPlayerId', 'active', true, 'reviewed', true,
    'reviewProvenance', s -> 'reviewProvenance', 'provenanceProposalId', s -> 'provenanceProposalId',
    'stateDigest', s -> 'stateDigest', 'evidenceClass', p_evidence_class));
end;
$$;

revoke all on function
  app_private.football_mapping_supporting_state(uuid),
  app_private.football_mapping_supporting_dependency(text, uuid, uuid)
  from public, anon, authenticated, service_role;

-- ===========================================================================
-- 3. The compute / propose / revalidate / refresh / execute functions, with the dependency in them
-- ===========================================================================
drop function app_private.football_mapping_compute(text, uuid, uuid, text, uuid, uuid, text, uuid, uuid);

create function app_private.football_mapping_compute(p_kind text, p_sofascore_candidate uuid, p_flashscore_candidate uuid, p_provider text, p_mapping_id uuid, p_app_player_id uuid, p_new_external_id text, p_new_app_player_id uuid, p_exclude_proposal uuid DEFAULT NULL::uuid, p_evidence_class text DEFAULT NULL::text, p_supporting_mapping uuid DEFAULT NULL::uuid, p_refs jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c_open constant text[] := array['pending', 'approved', 'position_disagreement', 'stale_evidence'];
  v_cid uuid;
  v_candidate app_private.football_player_mapping_candidates%rowtype;
  v_row app_private.football_provider_mappings%rowtype;
  v_expected jsonb;
  v_signals jsonb := '{}'::jsonb;
  v_evidence_candidates jsonb := '[]'::jsonb;
  v_revisions jsonb := '{}'::jsonb;
  v_sofa_ext text;
  v_flash_ext text;
  v_sofa_pos text;
  v_flash_pos text;
  v_app_pos text;
  v_pos_dis boolean := false;
  v_target_player uuid;
  v_target_candidate uuid;
  v_player_ok boolean;
  v_rev integer;
  v_dep jsonb;
  v_supporting jsonb := null;
begin
  -- Dependency fields mean something only for a Flashscore identity: nowhere else may they be supplied.
  if p_kind in ('ignore', 'reverse_ignore', 'deactivate')
    and (p_evidence_class is not null or p_supporting_mapping is not null) then
    return app_private.football_mapping_refuse('supporting_dependency_not_applicable');
  end if;
  if p_kind = 'map' then
    if p_app_player_id is null or (p_sofascore_candidate is null and p_flashscore_candidate is null) then
      return app_private.football_mapping_refuse('invalid_proposal');
    end if;
    if not exists (select 1 from app.players where id = p_app_player_id and active) then
      return app_private.football_mapping_refuse('app_player_not_found');
    end if;
    foreach v_cid in array array[p_sofascore_candidate, p_flashscore_candidate] loop
      continue when v_cid is null;
      select * into v_candidate from app_private.football_player_mapping_candidates where id = v_cid;
      if not found then return app_private.football_mapping_refuse('candidate_not_found'); end if;
      if (v_cid = p_sofascore_candidate and v_candidate.provider_name <> 'sofascore')
        or (v_cid = p_flashscore_candidate and v_candidate.provider_name <> 'flashscore') then
        return app_private.football_mapping_refuse('candidate_provider_mismatch');
      end if;
      if v_candidate.status = 'ignored' then
        return app_private.football_mapping_refuse('identity_conflict');
      end if;
      if v_candidate.status = 'mapped' or v_candidate.existing_mapping_id is not null
        or exists (select 1 from app_private.football_provider_mappings m
          where m.provider_name = v_candidate.provider_name and m.entity_type = 'player'
            and m.external_id = v_candidate.external_id) then
        return app_private.football_mapping_refuse('already_mapped');
      end if;
      if exists (select 1 from app_private.football_provider_mappings m
          where m.provider_name = v_candidate.provider_name and m.entity_type = 'player'
            and m.internal_entity_id = p_app_player_id) then
        return app_private.football_mapping_refuse('already_mapped');
      end if;
      if exists (select 1 from app_private.football_player_mapping_proposals p
          where p.status = any (c_open) and p.id is distinct from p_exclude_proposal
            and (p.sofascore_candidate_id = v_cid or p.flashscore_candidate_id = v_cid)) then
        return app_private.football_mapping_refuse('proposal_already_open');
      end if;
      if v_candidate.provider_name = 'sofascore' then v_sofa_ext := v_candidate.external_id;
      else v_flash_ext := v_candidate.external_id; end if;
      v_signals := v_signals || jsonb_build_object(
        v_candidate.provider_name, app_private.football_mapping_candidate_signals(v_cid, p_app_player_id));
      v_revisions := v_revisions || jsonb_build_object(v_candidate.provider_name, v_candidate.evidence_revision);
      v_evidence_candidates := v_evidence_candidates || jsonb_build_array(jsonb_build_object(
        'provider', v_candidate.provider_name,
        'candidateId', v_cid,
        'externalId', v_candidate.external_id,
        'observationCount', (v_signals -> v_candidate.provider_name ->> 'observationCount')::integer));
    end loop;
    if exists (select 1 from app_private.football_player_mapping_proposals p
        where p.status = any (c_open) and p.id is distinct from p_exclude_proposal
          and coalesce(p.app_player_id, p.new_app_player_id) = p_app_player_id) then
      return app_private.football_mapping_refuse('identity_conflict');
    end if;
    v_app_pos := app_private.football_mapping_position_letter(
      (select position from app.players where id = p_app_player_id));
    v_sofa_pos := v_signals -> 'sofascore' ->> 'providerPosition';
    v_flash_pos := v_signals -> 'flashscore' ->> 'providerPosition';
    v_pos_dis := (v_sofa_pos is not null and v_flash_pos is not null and v_sofa_pos <> v_flash_pos)
      or (v_sofa_pos is not null and v_app_pos is not null and v_sofa_pos <> v_app_pos)
      or (v_flash_pos is not null and v_app_pos is not null and v_flash_pos <> v_app_pos);
    if p_flashscore_candidate is not null and p_sofascore_candidate is null then
      -- A Flashscore-only proposal rests on a Sofascore mapping that already exists. The server reads it itself; a caller's say-so is not evidence.
      -- (One proposal that maps a Sofascore AND a Flashscore identity to the same player creates both in one
      -- reviewed transaction and rests on nothing outside it: it takes no dependency, and refuses one.)
      v_dep := app_private.football_mapping_supporting_dependency(p_evidence_class, p_supporting_mapping, p_app_player_id);
      if not (v_dep ->> 'ok')::boolean then
        return app_private.football_mapping_refuse(v_dep ->> 'code');
      end if;
      v_supporting := v_dep -> 'supporting';
    elsif p_evidence_class is not null or p_supporting_mapping is not null then
      return app_private.football_mapping_refuse('supporting_dependency_not_applicable');
    end if;
    return jsonb_build_object('ok', true,
      'sofascoreExternalId', v_sofa_ext, 'flashscoreExternalId', v_flash_ext,
      'providerName', null, 'expectedBefore', null,
      'evidence', jsonb_build_object('candidates', v_evidence_candidates, 'appPlayerId', p_app_player_id)
        || case when v_supporting is null then '{}'::jsonb
          else jsonb_build_object('supporting', v_supporting,
            'refsDigest', app_private.admin_payload_fingerprint(coalesce(p_refs, '[]'::jsonb))) end,
      'signals', v_signals, 'candidateRevisions', v_revisions, 'positionDisagreement', v_pos_dis);

  elsif p_kind in ('replace', 'deactivate', 'reactivate') then
    if p_mapping_id is null then return app_private.football_mapping_refuse('invalid_proposal'); end if;
    select * into v_row from app_private.football_provider_mappings
    where id = p_mapping_id and entity_type = 'player' and provider_name in ('sofascore', 'flashscore');
    if not found then return app_private.football_mapping_refuse('mapping_not_found'); end if;
    if p_provider is distinct from v_row.provider_name then
      return app_private.football_mapping_refuse('mapping_provider_mismatch');
    end if;
    v_expected := jsonb_build_object('mappingId', v_row.id, 'provider', v_row.provider_name,
      'externalId', v_row.external_id, 'appPlayerId', v_row.internal_entity_id, 'active', v_row.active);
    if exists (select 1 from app_private.football_player_mapping_proposals p
        where p.status = any (c_open) and p.id is distinct from p_exclude_proposal and p.mapping_id = v_row.id) then
      return app_private.football_mapping_refuse('proposal_already_open');
    end if;
    if p_kind in ('replace', 'deactivate') and not v_row.active then
      return app_private.football_mapping_refuse('mapping_not_active');
    end if;
    if p_kind = 'reactivate' and v_row.active then
      return app_private.football_mapping_refuse('mapping_already_active');
    end if;
    if p_kind = 'deactivate' and (p_new_external_id is not null or p_new_app_player_id is not null) then
      return app_private.football_mapping_refuse('invalid_proposal');
    end if;
    if p_kind = 'replace' and p_new_external_id is null and p_new_app_player_id is null then
      return app_private.football_mapping_refuse('invalid_proposal');
    end if;
    if (p_new_external_id is not null and p_new_external_id = v_row.external_id)
      or (p_new_app_player_id is not null and p_new_app_player_id = v_row.internal_entity_id) then
      return app_private.football_mapping_refuse('no_change');
    end if;
    if p_new_external_id is not null then
      if exists (select 1 from app_private.football_provider_mappings m
          where m.provider_name = v_row.provider_name and m.entity_type = 'player'
            and m.external_id = p_new_external_id and m.id <> v_row.id) then
        return app_private.football_mapping_refuse('already_mapped');
      end if;
      if exists (select 1 from app_private.football_player_mapping_proposals p
          where p.status = any (c_open) and p.id is distinct from p_exclude_proposal
            and ((p.provider_name = v_row.provider_name and p.new_external_id = p_new_external_id)
              or (v_row.provider_name = 'sofascore' and p.sofascore_external_id = p_new_external_id)
              or (v_row.provider_name = 'flashscore' and p.flashscore_external_id = p_new_external_id))) then
        return app_private.football_mapping_refuse('identity_conflict');
      end if;
    end if;
    if p_new_app_player_id is not null then
      select exists (select 1 from app.players where id = p_new_app_player_id and active) into v_player_ok;
      if not v_player_ok then return app_private.football_mapping_refuse('app_player_not_found'); end if;
      if exists (select 1 from app_private.football_provider_mappings m
          where m.provider_name = v_row.provider_name and m.entity_type = 'player'
            and m.internal_entity_id = p_new_app_player_id and m.id <> v_row.id) then
        return app_private.football_mapping_refuse('already_mapped');
      end if;
      if exists (select 1 from app_private.football_player_mapping_proposals p
          where p.status = any (c_open) and p.id is distinct from p_exclude_proposal
            and coalesce(p.app_player_id, p.new_app_player_id) = p_new_app_player_id) then
        return app_private.football_mapping_refuse('identity_conflict');
      end if;
    end if;
    -- Signals for the pairing the row will hold afterwards, where a candidate exists.
    v_target_player := coalesce(p_new_app_player_id, v_row.internal_entity_id);
    select id, evidence_revision into v_target_candidate, v_rev
    from app_private.football_player_mapping_candidates
    where provider_name = v_row.provider_name
      and external_id = coalesce(p_new_external_id, v_row.external_id);
    if v_target_candidate is not null and p_kind <> 'deactivate' then
      v_signals := jsonb_build_object(v_row.provider_name,
        app_private.football_mapping_candidate_signals(v_target_candidate, v_target_player));
      v_revisions := jsonb_build_object(v_row.provider_name, v_rev);
      v_app_pos := app_private.football_mapping_position_letter(
        (select position from app.players where id = v_target_player));
      v_sofa_pos := v_signals -> v_row.provider_name ->> 'providerPosition';
      v_pos_dis := v_sofa_pos is not null and v_app_pos is not null and v_sofa_pos <> v_app_pos;
    end if;
    if v_row.provider_name = 'flashscore' and p_kind in ('replace', 'reactivate') then
      -- Changing or restoring a Flashscore identity needs the same dependency, against the target it will have afterwards.
      v_dep := app_private.football_mapping_supporting_dependency(p_evidence_class, p_supporting_mapping, v_target_player);
      if not (v_dep ->> 'ok')::boolean then
        return app_private.football_mapping_refuse(v_dep ->> 'code');
      end if;
      v_supporting := v_dep -> 'supporting';
    elsif p_evidence_class is not null or p_supporting_mapping is not null then
      return app_private.football_mapping_refuse('supporting_dependency_not_applicable');
    end if;
    return jsonb_build_object('ok', true,
      'sofascoreExternalId', null, 'flashscoreExternalId', null,
      'providerName', v_row.provider_name, 'expectedBefore', v_expected,
      'evidence', jsonb_build_object('mappingId', v_row.id, 'before', v_expected,
        'newExternalId', p_new_external_id, 'newAppPlayerId', p_new_app_player_id)
        || case when v_supporting is null then '{}'::jsonb
          else jsonb_build_object('supporting', v_supporting,
            'refsDigest', app_private.admin_payload_fingerprint(coalesce(p_refs, '[]'::jsonb))) end,
      'signals', v_signals, 'candidateRevisions', v_revisions, 'positionDisagreement', v_pos_dis);

  elsif p_kind in ('ignore', 'reverse_ignore') then
    if (p_sofascore_candidate is null) = (p_flashscore_candidate is null) then
      return app_private.football_mapping_refuse('invalid_proposal');
    end if;
    v_cid := coalesce(p_sofascore_candidate, p_flashscore_candidate);
    select * into v_candidate from app_private.football_player_mapping_candidates where id = v_cid;
    if not found then return app_private.football_mapping_refuse('candidate_not_found'); end if;
    if (p_sofascore_candidate is not null and v_candidate.provider_name <> 'sofascore')
      or (p_flashscore_candidate is not null and v_candidate.provider_name <> 'flashscore') then
      return app_private.football_mapping_refuse('candidate_provider_mismatch');
    end if;
    if exists (select 1 from app_private.football_player_mapping_proposals p
        where p.status = any (c_open) and p.id is distinct from p_exclude_proposal
          and (p.sofascore_candidate_id = v_cid or p.flashscore_candidate_id = v_cid)) then
      return app_private.football_mapping_refuse('proposal_already_open');
    end if;
    if p_kind = 'ignore' then
      if v_candidate.status = 'ignored' then return app_private.football_mapping_refuse('already_ignored'); end if;
      if v_candidate.status = 'mapped' or v_candidate.existing_mapping_id is not null
        or exists (select 1 from app_private.football_provider_mappings m
          where m.provider_name = v_candidate.provider_name and m.entity_type = 'player'
            and m.external_id = v_candidate.external_id) then
        return app_private.football_mapping_refuse('already_mapped');
      end if;
      if v_candidate.lineup_or_incident_seen then
        return app_private.football_mapping_refuse('ignore_refused_id_in_lineup');
      end if;
    elsif v_candidate.status <> 'ignored' then
      return app_private.football_mapping_refuse('not_ignored');
    end if;
    return jsonb_build_object('ok', true,
      'sofascoreExternalId', case when p_sofascore_candidate is not null then v_candidate.external_id end,
      'flashscoreExternalId', case when p_flashscore_candidate is not null then v_candidate.external_id end,
      'providerName', v_candidate.provider_name, 'expectedBefore', null,
      'evidence', jsonb_build_object('candidates', jsonb_build_array(jsonb_build_object(
        'provider', v_candidate.provider_name, 'candidateId', v_cid, 'externalId', v_candidate.external_id,
        'lineupOrIncidentSeen', v_candidate.lineup_or_incident_seen))),
      'signals', '{}'::jsonb,
      'candidateRevisions', jsonb_build_object(v_candidate.provider_name, v_candidate.evidence_revision),
      'positionDisagreement', false);
  end if;
  return app_private.football_mapping_refuse('invalid_proposal');
end;
$function$;

revoke all on function
  app_private.football_mapping_compute(text, uuid, uuid, text, uuid, uuid, text, uuid, uuid, text, uuid, jsonb)
  from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.football_mapping_revalidate(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  p app_private.football_player_mapping_proposals%rowtype;
  v jsonb;
begin
  select * into p from app_private.football_player_mapping_proposals where id = p_id;
  v := app_private.football_mapping_compute(p.kind, p.sofascore_candidate_id, p.flashscore_candidate_id,
    p.provider_name, p.mapping_id, p.app_player_id, p.new_external_id, p.new_app_player_id, p.id,
    p.evidence_class, p.supporting_mapping_id, p.evidence -> 'refs');
  if not (v ->> 'ok')::boolean then
    return v ->> 'code';
  end if;
  if nullif(v -> 'expectedBefore', 'null'::jsonb) is distinct from p.expected_before then
    return 'mapping_row_changed';
  end if;
  if v -> 'candidateRevisions' is distinct from p.candidate_revisions
    or v -> 'evidence' is distinct from (p.evidence - 'refs')
    or v -> 'signals' is distinct from p.signals
    or (v ->> 'positionDisagreement')::boolean is distinct from p.position_disagreement then
    return 'stale_evidence';
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION api.admin_football_mapping_refresh_evidence(p_proposal_id uuid, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_prev jsonb;
  p app_private.football_player_mapping_proposals%rowtype;
  v_computed jsonb;
  v_hold text;
begin
  v_actor := app_private.admin_assert_permission('football.manage_mappings');
  v_prev := app_private.admin_begin_idempotent_operation(v_actor, 'football.mapping_refresh',
    p_idempotency_key, jsonb_build_object('id', p_proposal_id));
  if v_prev is not null then return v_prev; end if;
  select * into p from app_private.football_player_mapping_proposals where id = p_proposal_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'proposal_not_found'; end if;
  if p.requested_by <> v_actor then
    raise exception using errcode = 'PT403', message = 'not_authorized';
  end if;
  if p.status <> 'stale_evidence' then
    raise exception using errcode = 'PT409', message = 'proposal_not_stale';
  end if;
  v_computed := app_private.football_mapping_compute(p.kind, p.sofascore_candidate_id,
    p.flashscore_candidate_id, p.provider_name, p.mapping_id, p.app_player_id,
    p.new_external_id, p.new_app_player_id, p.id,
    p.evidence_class, p.supporting_mapping_id, p.evidence -> 'refs');
  if not (v_computed ->> 'ok')::boolean then
    v_hold := app_private.football_mapping_hold_status(v_computed ->> 'code');
    if v_hold = 'stale_evidence' then
      -- Nothing to refresh to: the world does not allow this decision at all.
      raise exception using errcode = 'PT409', message = v_computed ->> 'code';
    end if;
    update app_private.football_player_mapping_proposals
    set status = v_hold, hold_code = v_computed ->> 'code' where id = p.id;
    perform app_private.football_mapping_release_candidates(p.id);
    select * into p from app_private.football_player_mapping_proposals where id = p.id;
    perform app_private.football_mapping_audit(v_actor, 'football.mapping_held', p,
      'Refresh found the decision no longer possible: ' || (v_computed ->> 'code'), p_idempotency_key);
    return app_private.admin_complete_idempotent_operation(v_actor, 'football.mapping_refresh',
      p_idempotency_key, jsonb_build_object('ok', false, 'code', v_computed ->> 'code', 'status', p.status));
  end if;

  perform set_config('app.football_mapping_refresh', 'on', true);
  p.expected_before := nullif(v_computed -> 'expectedBefore', 'null'::jsonb);
  p.evidence := (v_computed -> 'evidence') || jsonb_build_object('refs', coalesce(p.evidence -> 'refs', '[]'::jsonb));
  p.signals := v_computed -> 'signals';
  p.candidate_revisions := v_computed -> 'candidateRevisions';
  p.position_disagreement := (v_computed ->> 'positionDisagreement')::boolean;
  p.fingerprint := app_private.football_mapping_row_fingerprint(p);
  -- An earlier approval never carries over: the decision is cleared with the old fingerprint.
  update app_private.football_player_mapping_proposals
  set expected_before = p.expected_before, evidence = p.evidence, signals = p.signals,
      candidate_revisions = p.candidate_revisions, position_disagreement = p.position_disagreement,
      fingerprint = p.fingerprint,
      expires_at = statement_timestamp() + interval '72 hours',
      decided_by = null, decided_at = null, decision_reason = null,
      position_disagreement_acknowledged = false, hold_code = null,
      status = case when p.position_disagreement and p.position_note is null
        then 'position_disagreement' else 'pending' end
  where id = p.id;
  perform set_config('app.football_mapping_refresh', 'off', true);
  select * into p from app_private.football_player_mapping_proposals where id = p.id;
  perform app_private.football_mapping_audit(v_actor, 'football.mapping_refreshed', p,
    'Evidence refreshed; any earlier approval no longer applies.', p_idempotency_key);
  return app_private.admin_complete_idempotent_operation(v_actor, 'football.mapping_refresh',
    p_idempotency_key, jsonb_build_object('ok', true, 'id', p.id, 'status', p.status,
      'fingerprint', p.fingerprint));
end;
$function$;

CREATE OR REPLACE FUNCTION api.admin_football_mapping_propose(p_items jsonb, p_reason text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_prev jsonb;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_batch uuid := gen_random_uuid();
  v_item jsonb;
  v_index integer := 0;
  v_kind text;
  v_computed jsonb;
  v_row app_private.football_player_mapping_proposals%rowtype;
  v_results jsonb := '[]'::jsonb;
  v_sofa uuid;
  v_flash uuid;
  v_basis text;
  v_status text;
  v_refs jsonb;
  v_evidence_class text;
  v_supporting uuid;
begin
  v_actor := app_private.admin_assert_permission('football.manage_mappings');
  if p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception using errcode = 'PT400', message = 'invalid_proposal';
  end if;
  if char_length(v_reason) not between 10 and 500 then
    raise exception using errcode = 'PT400', message = 'reason_required';
  end if;
  v_prev := app_private.admin_begin_idempotent_operation(
    v_actor, 'football.mapping_propose', p_idempotency_key,
    jsonb_build_object('items', p_items, 'reason', v_reason));
  if v_prev is not null then return v_prev; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_index := v_index + 1;
    v_kind := v_item ->> 'kind';
    v_sofa := nullif(v_item ->> 'sofascoreCandidateId', '')::uuid;
    v_flash := nullif(v_item ->> 'flashscoreCandidateId', '')::uuid;
    v_basis := coalesce(v_item ->> 'basis', 'manual');
    v_refs := coalesce(v_item -> 'evidenceRefs', '[]'::jsonb);
    v_evidence_class := nullif(v_item ->> 'evidenceClass', '');
    v_supporting := nullif(v_item ->> 'supportingMappingId', '')::uuid;
    if v_kind is null or v_kind not in ('map', 'replace', 'deactivate', 'reactivate', 'ignore', 'reverse_ignore')
      or v_basis not in ('incident', 'shirt_position', 'manual')
      or jsonb_typeof(v_refs) <> 'array' or jsonb_array_length(v_refs) > 20
      or app_private.football_mapping_json_has_name_key(v_refs) then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'index', v_index, 'ok', false, 'code', 'invalid_proposal'));
      continue;
    end if;
    -- A dependency-bound proposal carries its evidence references: they are part of its fingerprint.
    if (v_evidence_class is not null or v_supporting is not null) and jsonb_array_length(v_refs) = 0 then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'index', v_index, 'ok', false, 'code', 'evidence_refs_required'));
      continue;
    end if;
    v_computed := app_private.football_mapping_compute(
      v_kind, v_sofa, v_flash,
      v_item ->> 'providerName',
      nullif(v_item ->> 'mappingId', '')::uuid,
      nullif(v_item ->> 'appPlayerId', '')::uuid,
      nullif(v_item ->> 'newExternalId', ''),
      nullif(v_item ->> 'newAppPlayerId', '')::uuid,
      null, v_evidence_class, v_supporting, v_refs);
    if not (v_computed ->> 'ok')::boolean then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'index', v_index, 'ok', false, 'code', v_computed ->> 'code'));
      continue;
    end if;

    v_row := null;
    v_row.id := gen_random_uuid();
    v_row.batch_id := v_batch;
    v_row.kind := v_kind;
    v_row.sofascore_candidate_id := v_sofa;
    v_row.flashscore_candidate_id := v_flash;
    v_row.sofascore_external_id := v_computed ->> 'sofascoreExternalId';
    v_row.flashscore_external_id := v_computed ->> 'flashscoreExternalId';
    v_row.provider_name := v_computed ->> 'providerName';
    v_row.mapping_id := nullif(v_item ->> 'mappingId', '')::uuid;
    v_row.app_player_id := nullif(v_item ->> 'appPlayerId', '')::uuid;
    v_row.new_external_id := nullif(v_item ->> 'newExternalId', '');
    v_row.new_app_player_id := nullif(v_item ->> 'newAppPlayerId', '')::uuid;
    v_row.expected_before := nullif(v_computed -> 'expectedBefore', 'null'::jsonb);
    v_row.basis := v_basis;
    v_row.evidence := (v_computed -> 'evidence') || jsonb_build_object('refs', v_refs);
    v_row.signals := v_computed -> 'signals';
    v_row.candidate_revisions := v_computed -> 'candidateRevisions';
    v_row.position_disagreement := (v_computed ->> 'positionDisagreement')::boolean;
    v_row.reason := v_reason;
    v_row.evidence_class := v_evidence_class;
    v_row.supporting_mapping_id := v_supporting;
    v_row.requested_by := v_actor;
    v_row.requested_at := statement_timestamp();
    v_row.expires_at := statement_timestamp() + interval '72 hours';
    v_row.correlation_id := gen_random_uuid();
    v_status := case when v_row.position_disagreement then 'position_disagreement' else 'pending' end;
    v_row.status := v_status;
    v_row.fingerprint := app_private.football_mapping_row_fingerprint(v_row);

    begin
      insert into app_private.football_player_mapping_proposals (
        id, batch_id, kind, status, sofascore_candidate_id, flashscore_candidate_id,
        sofascore_external_id, flashscore_external_id, provider_name, mapping_id,
        app_player_id, new_external_id, new_app_player_id, expected_before, basis,
        evidence, signals, candidate_revisions, position_disagreement, reason,
        requested_by, requested_at, expires_at, fingerprint, correlation_id,
        evidence_class, supporting_mapping_id)
      values (
        v_row.id, v_row.batch_id, v_row.kind, v_row.status, v_row.sofascore_candidate_id,
        v_row.flashscore_candidate_id, v_row.sofascore_external_id, v_row.flashscore_external_id,
        v_row.provider_name, v_row.mapping_id, v_row.app_player_id, v_row.new_external_id,
        v_row.new_app_player_id, v_row.expected_before, v_row.basis, v_row.evidence, v_row.signals,
        v_row.candidate_revisions, v_row.position_disagreement, v_row.reason,
        v_row.requested_by, v_row.requested_at, v_row.expires_at, v_row.fingerprint, v_row.correlation_id,
        v_row.evidence_class, v_row.supporting_mapping_id);
    exception when unique_violation then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'index', v_index, 'ok', false, 'code', 'proposal_already_open'));
      continue;
    end;

    if v_kind in ('map', 'ignore') then
      update app_private.football_player_mapping_candidates
      set status = 'proposed'
      where id in (v_sofa, v_flash) and status = 'unmapped';
    end if;
    select * into v_row from app_private.football_player_mapping_proposals where id = v_row.id;
    perform app_private.football_mapping_audit(v_actor, 'football.mapping_proposed', v_row,
      v_reason, p_idempotency_key);
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'index', v_index, 'ok', true, 'id', v_row.id, 'kind', v_row.kind, 'status', v_row.status,
      'fingerprint', v_row.fingerprint, 'positionDisagreement', v_row.position_disagreement));
  end loop;

  return app_private.admin_complete_idempotent_operation(
    v_actor, 'football.mapping_propose', p_idempotency_key,
    jsonb_build_object('batchId', v_batch, 'proposals', v_results));
end;
$function$;

CREATE OR REPLACE FUNCTION api.admin_football_mapping_execute(p_proposal_id uuid, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_prev jsonb;
  p app_private.football_player_mapping_proposals%rowtype;
  v_approver_user uuid;
  v_hold text;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_row app_private.football_provider_mappings%rowtype;
  v_cid uuid;
  v_candidate app_private.football_player_mapping_candidates%rowtype;
  v_rows jsonb := '[]'::jsonb;
  v_refusal text;
  v_old_ext text;
  v_source text;
  v_dep jsonb;
begin
  v_actor := app_private.admin_assert_permission('football.manage_mappings');
  v_prev := app_private.admin_begin_idempotent_operation(v_actor, 'football.mapping_execute',
    p_idempotency_key, jsonb_build_object('id', p_proposal_id));
  if v_prev is not null then return v_prev; end if;

  select * into p from app_private.football_player_mapping_proposals where id = p_proposal_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'proposal_not_found'; end if;
  if p.status = 'executed' then
    raise exception using errcode = 'PT409', message = 'operation_already_executed';
  end if;
  if p.status <> 'approved' then
    raise exception using errcode = 'PT409', message = 'proposal_not_approved';
  end if;
  if p.decided_at < statement_timestamp() - interval '24 hours' then
    raise exception using errcode = 'PT409', message = 'approval_expired';
  end if;
  if p.decided_by is null
    or app_private.football_mapping_row_fingerprint(p) is distinct from p.fingerprint then
    raise exception using errcode = 'PT409', message = 'fingerprint_mismatch';
  end if;
  -- An approval the proposer gave themselves only stands while the switch that
  -- allows it is still on.
  if p.self_approved and not app_private.football_mapping_self_approval_allowed() then
    raise exception using errcode = 'PT409', message = 'self_approval_no_longer_allowed';
  end if;
  -- The approver must still be who they were: active, and still allowed to approve.
  select sp.auth_user_id into v_approver_user
  from app_private.staff_principals sp
  where sp.id = p.decided_by and sp.status = 'active';
  if v_approver_user is null
    or not app_private.admin_has_permission(p.decided_by, 'football.manage_mappings') then
    raise exception using errcode = 'PT409', message = 'approver_no_longer_qualified';
  end if;

  -- Re-check the world once more, then write; any refusal rolls the block back.
  begin
    -- The supporting Sofascore mapping, locked and re-read in THIS transaction. Lock order, always:
    -- the proposal (above), the supporting mapping (SHARE), the candidates, then the mapping table.
    -- SHARE blocks a concurrent retarget or deactivation until this transaction ends; if one got there
    -- first, the read below sees its result and refuses.
    if p.supporting_mapping_id is not null then
      perform 1 from app_private.football_provider_mappings m
      where m.id = p.supporting_mapping_id for share;
      v_dep := app_private.football_mapping_supporting_dependency(p.evidence_class, p.supporting_mapping_id,
        case when p.kind = 'map' then p.app_player_id
          else coalesce(p.new_app_player_id, (select m.internal_entity_id from app_private.football_provider_mappings m where m.id = p.mapping_id)) end);
      if not (v_dep ->> 'ok')::boolean then
        raise exception using errcode = 'PT409', message = v_dep ->> 'code';
      end if;
      if v_dep -> 'supporting' is distinct from p.evidence -> 'supporting' then
        raise exception using errcode = 'PT409', message = 'supporting_mapping_changed';
      end if;
    end if;
    v_hold := app_private.football_mapping_revalidate(p.id);
    if v_hold is not null then
      raise exception using errcode = 'PT409', message = v_hold;
    end if;
    v_source := 'football_player_mapping:' || p.id::text;

    if p.kind = 'map' then
      foreach v_cid in array array[p.sofascore_candidate_id, p.flashscore_candidate_id] loop
        continue when v_cid is null;
        select * into v_candidate from app_private.football_player_mapping_candidates
        where id = v_cid for update;
        if exists (select 1 from app_private.football_provider_mappings m
            where m.provider_name = v_candidate.provider_name and m.entity_type = 'player'
              and (m.external_id = v_candidate.external_id or m.internal_entity_id = p.app_player_id)) then
          raise exception using errcode = 'PT409', message = 'already_mapped';
        end if;
        insert into app_private.football_provider_mappings (
          provider_name, entity_type, external_id, internal_entity_id, source_version,
          last_seen_at, active, manually_corrected, correction_reason, corrected_by, corrected_at)
        values (v_candidate.provider_name, 'player', v_candidate.external_id, p.app_player_id,
          v_source, statement_timestamp(), true, true, p.reason, v_approver_user, statement_timestamp())
        returning * into v_row;
        v_rows := v_rows || jsonb_build_array(jsonb_build_object(
          'mappingId', v_row.id, 'provider', v_row.provider_name, 'externalId', v_row.external_id,
          'appPlayerId', v_row.internal_entity_id, 'active', v_row.active));
        perform app_private.football_mapping_resync_candidate(v_candidate.provider_name, v_candidate.external_id);
      end loop;
      v_before := jsonb_build_object('rows', '[]'::jsonb);
      v_after := jsonb_build_object('rows', v_rows);

    elsif p.kind in ('replace', 'deactivate', 'reactivate') then
      select * into v_row from app_private.football_provider_mappings
      where id = p.mapping_id and entity_type = 'player' for update;
      if not found then raise exception using errcode = 'PT409', message = 'mapping_row_changed'; end if;
      -- Compare and swap.
      if jsonb_build_object('mappingId', v_row.id, 'provider', v_row.provider_name,
          'externalId', v_row.external_id, 'appPlayerId', v_row.internal_entity_id, 'active', v_row.active)
        is distinct from p.expected_before then
        raise exception using errcode = 'PT409', message = 'mapping_row_changed';
      end if;
      v_old_ext := v_row.external_id;
      v_before := jsonb_build_object('mappingId', v_row.id, 'provider', v_row.provider_name,
        'externalId', v_row.external_id, 'appPlayerId', v_row.internal_entity_id, 'active', v_row.active);
      update app_private.football_provider_mappings
      set external_id = coalesce(p.new_external_id, external_id),
          internal_entity_id = coalesce(p.new_app_player_id, internal_entity_id),
          active = case p.kind when 'deactivate' then false when 'reactivate' then true else active end,
          source_version = v_source,
          last_seen_at = statement_timestamp(),
          manually_corrected = true,
          correction_reason = p.reason,
          corrected_by = v_approver_user,
          corrected_at = statement_timestamp()
      where id = v_row.id
      returning * into v_row;
      v_after := jsonb_build_object('mappingId', v_row.id, 'provider', v_row.provider_name,
        'externalId', v_row.external_id, 'appPlayerId', v_row.internal_entity_id, 'active', v_row.active);
      perform app_private.football_mapping_resync_candidate(v_row.provider_name, v_old_ext);
      perform app_private.football_mapping_resync_candidate(v_row.provider_name, v_row.external_id);

    elsif p.kind = 'ignore' then
      select * into v_candidate from app_private.football_player_mapping_candidates
      where id = coalesce(p.sofascore_candidate_id, p.flashscore_candidate_id) for update;
      if v_candidate.lineup_or_incident_seen then
        raise exception using errcode = 'PT409', message = 'ignore_refused_id_in_lineup';
      end if;
      v_before := jsonb_build_object('candidateId', v_candidate.id, 'status', v_candidate.status);
      update app_private.football_player_mapping_candidates set status = 'ignored' where id = v_candidate.id;
      v_after := jsonb_build_object('candidateId', v_candidate.id, 'status', 'ignored');

    else -- reverse_ignore
      select * into v_candidate from app_private.football_player_mapping_candidates
      where id = coalesce(p.sofascore_candidate_id, p.flashscore_candidate_id) for update;
      v_before := jsonb_build_object('candidateId', v_candidate.id, 'status', v_candidate.status);
      update app_private.football_player_mapping_candidates set status = 'unmapped' where id = v_candidate.id;
      v_after := jsonb_build_object('candidateId', v_candidate.id, 'status', 'unmapped');
    end if;

    update app_private.football_player_mapping_proposals
    set status = 'executed', executed_by = v_actor, executed_at = statement_timestamp(),
        executed_before = v_before, executed_after = v_after,
        execution_idempotency_key = p_idempotency_key
    where id = p.id;
  exception
    when unique_violation then v_refusal := 'already_mapped';
    when sqlstate 'PT409' then get stacked diagnostics v_refusal = message_text;
  end;

  if v_refusal is not null then
    -- The block rolled back: the mapping table is exactly as it was. Remember why.
    v_hold := app_private.football_mapping_hold_status(v_refusal);
    update app_private.football_player_mapping_proposals
    set status = v_hold, hold_code = v_refusal where id = p.id;
    perform app_private.football_mapping_release_candidates(p.id);
    select * into p from app_private.football_player_mapping_proposals where id = p.id;
    perform app_private.football_mapping_audit(v_actor, 'football.mapping_held', p,
      'Execution refused, nothing written: ' || v_refusal, p_idempotency_key);
    return app_private.admin_complete_idempotent_operation(v_actor, 'football.mapping_execute',
      p_idempotency_key, jsonb_build_object('ok', false, 'code', v_refusal, 'status', p.status));
  end if;

  select * into p from app_private.football_player_mapping_proposals where id = p.id;
  perform app_private.football_mapping_audit(v_actor, 'football.mapping_executed', p,
    p.decision_reason, p_idempotency_key, v_before,
    jsonb_build_object('after', v_after, 'requestedBy', p.requested_by, 'decidedBy', p.decided_by,
      'executedBy', p.executed_by, 'requestedAt', p.requested_at, 'decidedAt', p.decided_at,
      'executedAt', p.executed_at, 'reason', p.reason,
      'selfApproved', p.self_approved));
  return app_private.admin_complete_idempotent_operation(v_actor, 'football.mapping_execute',
    p_idempotency_key, jsonb_build_object('ok', true, 'id', p.id, 'status', p.status,
      'before', v_before, 'after', v_after));
end;
$function$;

-- ===========================================================================
-- 4. The read: the actual mapping row, for staff
-- ===========================================================================
-- Same authorization as the other mapping reads (an authenticated staff principal who may read mapping
-- operations). Returns one row's identity, active state, review state and provenance, and null when no
-- such mapping exists. No name, no birth date, no secret, no other row. The table itself is not exposed.
create function api.admin_football_mapping_get_provider_mapping(
  p_provider text,
  p_external_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := app_private.admin_assert_principal(true, false);
  v_id uuid;
begin
  perform app_private.football_mapping_require_reader(v_viewer);
  if p_provider is null or p_provider not in ('sofascore', 'flashscore')
    or p_external_id is null or char_length(p_external_id) not between 1 and 200 then
    raise exception using errcode = 'PT400', message = 'invalid_filter';
  end if;
  select m.id into v_id from app_private.football_provider_mappings m
  where m.provider_name = p_provider and m.entity_type = 'player' and m.external_id = p_external_id;
  if v_id is null then return null; end if;
  return app_private.football_mapping_supporting_state(v_id);
end;
$$;

revoke all on function api.admin_football_mapping_get_provider_mapping(text, text)
  from public, anon, authenticated, service_role;
grant execute on function api.admin_football_mapping_get_provider_mapping(text, text) to authenticated;
comment on function api.admin_football_mapping_get_provider_mapping(text, text) is
  'Staff: the actual provider player mapping row (identity, active, review state and provenance, state digest). Reads only; no names or dates.';
$bg_20261003120000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part text := (select statements[1] from supabase_migrations.schema_migrations where version = '20261003120000');
begin
  if encode(sha256(convert_to(part, 'UTF8')), 'hex') is distinct from 'd435bde5d9ca114a17f94786178b1f4261ff3b8e8c65f8d8f8fcbd70baa18577' then
    raise exception 'stop: 20261003120000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;
  execute part;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight, still inside the transaction
-- ---------------------------------------------------------------------------
do $postflight$
declare
  b guard_baseline%rowtype;
  problems text[] := '{}';
  v record;
  v_count integer;
begin
  select * into b from guard_baseline;

  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261003120000') then
    problems := problems || 'the history row is not there'::text;
  end if;

  -- Signatures: the nine-argument compute is gone, the twelve-argument one is the only one, no renamed copy.
  if to_regprocedure('app_private.football_mapping_compute(text,uuid,uuid,text,uuid,uuid,text,uuid,uuid)') is not null then
    problems := problems || 'the old nine-argument compute function still exists'::text;
  end if;
  if to_regprocedure('app_private.football_mapping_compute(text,uuid,uuid,text,uuid,uuid,text,uuid,uuid,text,uuid,jsonb)') is null then
    problems := problems || 'the new twelve-argument compute function does not exist'::text;
  end if;
  if (select count(*) from pg_catalog.pg_proc p
        where p.pronamespace in ('api'::regnamespace, 'app_private'::regnamespace, 'public'::regnamespace)
          and p.proname ilike '%football_mapping_compute%') <> 1 then
    problems := problems || 'there is not exactly one compute function (a legacy copy remains?)'::text;
  end if;
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'api') <> b.api_procs + 1
    or (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app_private') <> b.private_procs + 2 then
    problems := problems || 'the function counts are not the reviewed +1 api (the staff read) and +2 internal (state, dependency)'::text;
  end if;

  -- The nine functions of this migration are the reviewed text, with the reviewed grants.
  for v in
    select * from (values
      ('api.admin_football_mapping_execute(uuid,uuid)', '88afdf18716d1ce9e472c00a9220d278', '{postgres=X/postgres,authenticated=X/postgres}'),
      ('api.admin_football_mapping_get_provider_mapping(text,text)', '67b1d19d4f1b75d109c202d8b611935b', '{postgres=X/postgres,authenticated=X/postgres}'),
      ('api.admin_football_mapping_propose(jsonb,text,uuid)', 'c5d31dea4ee9163016b634f8b752f2a4', '{postgres=X/postgres,authenticated=X/postgres}'),
      ('api.admin_football_mapping_refresh_evidence(uuid,uuid)', '98693148fae7e37a1be6a8fe3349ef50', '{postgres=X/postgres,authenticated=X/postgres}'),
      ('app_private.football_mapping_compute(text,uuid,uuid,text,uuid,uuid,text,uuid,uuid,text,uuid,jsonb)', '3a46795f47ad32dab78a40167c7e0c61', '{postgres=X/postgres}'),
      ('app_private.football_mapping_proposal_guard()', '1f02e38bd45644b23489d866481befcc', '{postgres=X/postgres}'),
      ('app_private.football_mapping_revalidate(uuid)', '8e1ab9a983db4846932fbc580dbf59aa', '{postgres=X/postgres}'),
      ('app_private.football_mapping_supporting_dependency(text,uuid,uuid)', 'f86e4e6cc17c59f444016b0ddacba9ff', '{postgres=X/postgres}'),
      ('app_private.football_mapping_supporting_state(uuid)', '0ef7dfd0a98b3dda7015ea6fc47342c1', '{postgres=X/postgres}')
    ) as t(signature, expected_md5, expected_acl)
  loop
    if to_regprocedure(v.signature) is null then
      problems := problems || (v.signature || ' does not exist')::text;
    else
      if md5(pg_get_functiondef(v.signature::regprocedure)) <> v.expected_md5 then
        problems := problems || (v.signature || ' is not the reviewed text')::text;
      end if;
      if (select proacl::text from pg_catalog.pg_proc where oid = v.signature::regprocedure) is distinct from v.expected_acl then
        problems := problems || (v.signature || ' has unexpected grants')::text;
      end if;
    end if;
  end loop;
  -- Visitors and the service role cannot run the new staff read or the internal helpers.
  if has_function_privilege('anon', 'api.admin_football_mapping_get_provider_mapping(text,text)', 'execute')
    or has_function_privilege('service_role', 'api.admin_football_mapping_get_provider_mapping(text,text)', 'execute')
    or not has_function_privilege('authenticated', 'api.admin_football_mapping_get_provider_mapping(text,text)', 'execute')
    or has_function_privilege('anon', 'app_private.football_mapping_supporting_state(uuid)', 'execute')
    or has_function_privilege('authenticated', 'app_private.football_mapping_supporting_state(uuid)', 'execute')
    or has_function_privilege('service_role', 'app_private.football_mapping_supporting_dependency(text,uuid,uuid)', 'execute')
    or has_function_privilege('authenticated', 'app_private.football_mapping_compute(text,uuid,uuid,text,uuid,uuid,text,uuid,uuid,text,uuid,jsonb)', 'execute') then
    problems := problems || 'a function grant is not the reviewed one'::text;
  end if;

  -- The proposal table: two new nullable columns, the check, the partial index; everything else as it was.
  select count(*) into v_count from information_schema.columns
    where table_schema = 'app_private' and table_name = 'football_player_mapping_proposals'
      and ((column_name = 'evidence_class' and data_type = 'text' and is_nullable = 'YES')
        or (column_name = 'supporting_mapping_id' and data_type = 'uuid' and is_nullable = 'YES'));
  if v_count <> 2 then problems := problems || 'the two proposal columns are not as reviewed'::text; end if;
  if (select pg_get_constraintdef(oid) from pg_catalog.pg_constraint where conname = 'football_player_mapping_proposals_supporting_check')
    is distinct from 'CHECK ((((evidence_class IS NULL) = (supporting_mapping_id IS NULL)) AND ((evidence_class IS NULL) OR (evidence_class = ANY (ARRAY[''F1_REVIEWED_SOFASCORE_EVENTS''::text, ''F2_REVIEWED_SOFASCORE_SHIRT_DOB''::text]))) AND ((((kind = ''map''::text) AND (flashscore_candidate_id IS NOT NULL) AND (sofascore_candidate_id IS NULL)) OR ((kind = ANY (ARRAY[''replace''::text, ''reactivate''::text])) AND (provider_name = ''flashscore''::text))) = (supporting_mapping_id IS NOT NULL))))' then
    problems := problems || 'the dependency check constraint is not the reviewed definition'::text;
  end if;
  if (select pg_get_indexdef(indexrelid) from pg_catalog.pg_index where indexrelid = 'app_private.football_player_mapping_proposals_supporting_idx'::regclass)
    is distinct from 'CREATE INDEX football_player_mapping_proposals_supporting_idx ON app_private.football_player_mapping_proposals USING btree (supporting_mapping_id) WHERE (supporting_mapping_id IS NOT NULL)' then
    problems := problems || 'the dependency index is not the reviewed definition'::text;
  end if;
  if exists (select 1 from app_private.football_player_mapping_proposals where evidence_class is not null or supporting_mapping_id is not null) then
    problems := problems || 'an existing proposal acquired a dependency'::text;
  end if;
  if (select md5(string_agg(column_name || ':' || data_type || ':' || is_nullable, '|' order by ordinal_position)) from information_schema.columns where table_schema = 'app_private' and table_name = 'football_player_mapping_proposals' and column_name not in ('evidence_class', 'supporting_mapping_id')) is distinct from b.f_prop_cols then problems := problems || 'the existing proposal columns changed'::text; end if;
  if (select md5(string_agg(conname || '=' || pg_get_constraintdef(oid), '|' order by conname)) from pg_catalog.pg_constraint where conrelid = 'app_private.football_player_mapping_proposals'::regclass and conname <> 'football_player_mapping_proposals_supporting_check') is distinct from b.f_prop_cons then problems := problems || 'an existing proposal constraint changed'::text; end if;
  if (select md5(string_agg(conname || '=' || pg_get_constraintdef(oid), '|' order by conname)) from pg_catalog.pg_constraint where conrelid = 'app_private.football_provider_mappings'::regclass) is distinct from b.f_map_cons then problems := problems || 'a mapping-table constraint changed'::text; end if;
  if (select md5(string_agg(tgname || '=' || pg_get_triggerdef(oid), '|' order by tgname)) from pg_catalog.pg_trigger where tgrelid = 'app_private.football_player_mapping_proposals'::regclass and not tgisinternal) is distinct from b.f_prop_trig then problems := problems || 'a proposal or mapping trigger changed'::text; end if;
  if (select md5(string_agg(tgname || '=' || pg_get_triggerdef(oid), '|' order by tgname)) from pg_catalog.pg_trigger where tgrelid = 'app_private.football_provider_mappings'::regclass and not tgisinternal) is distinct from b.f_map_trig then problems := problems || 'a mapping-table trigger changed'::text; end if;
  if (select md5(string_agg(indexname || '=' || indexdef, '|' order by indexname)) from pg_catalog.pg_indexes where schemaname = 'app_private' and tablename = 'football_player_mapping_proposals' and indexname <> 'football_player_mapping_proposals_supporting_idx') is distinct from b.f_prop_idx then problems := problems || 'an existing proposal index changed'::text; end if;
  if (select md5(string_agg(c.relname || ':' || coalesce(c.relacl::text, '') || ':' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text, '|' order by c.relname)) from pg_catalog.pg_class c where c.relnamespace = 'app_private'::regnamespace and c.relname in ('football_provider_mappings', 'football_player_mapping_proposals', 'football_player_mapping_candidates', 'football_player_mapping_observations', 'football_mapping_settings')) is distinct from b.f_rel then problems := problems || 'table grants or row level security changed'::text; end if;
  if (select md5(string_agg(p.oid::regprocedure::text || ':' || coalesce(p.proacl::text, 'null'), '|' order by p.oid::regprocedure::text)) from pg_catalog.pg_proc p where p.pronamespace in ('api'::regnamespace, 'app_private'::regnamespace) and p.proname like '%football_mapping%' and p.proname not in ('football_mapping_compute', 'football_mapping_supporting_state', 'football_mapping_supporting_dependency', 'admin_football_mapping_get_provider_mapping')) is distinct from b.f_fn_acl then problems := problems || 'an existing mapping function grant changed'::text; end if;

  -- Nothing was created and nothing existing changed.
  if (select count(*) from app_private.football_provider_mappings) <> b.mapping_count
    or (select md5(coalesce(string_agg(m::text, '|' order by m.id), '')) from app_private.football_provider_mappings m) <> b.mapping_digest then
    problems := problems || 'a mapping row appeared or changed'::text;
  end if;
  if (select count(*) from app_private.football_player_mapping_proposals) <> b.proposals
    or (select md5(coalesce(string_agg((to_jsonb(p) - 'evidence_class' - 'supporting_mapping_id')::text, '|' order by p.id), ''))
        from app_private.football_player_mapping_proposals p) <> b.proposal_digest then
    problems := problems || 'a proposal appeared or an existing proposal changed (legacy columns)'::text;
  end if;
  if (select count(*) from app_private.football_player_mapping_candidates) <> b.candidates
    or (select md5(coalesce(string_agg(c::text, '|' order by c.id), '')) from app_private.football_player_mapping_candidates c) <> b.candidate_digest
    or (select count(*) from app_private.football_player_mapping_observations) <> b.observations
    or (select md5(coalesce(string_agg(o::text, '|' order by o.id), '')) from app_private.football_player_mapping_observations o) <> b.observation_digest then
    problems := problems || 'a candidate or observation appeared or changed'::text;
  end if;
  if (select md5(coalesce(string_agg(s::text, '|'), '')) from app_private.football_mapping_settings s) <> b.settings_digest
    or (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app_private.admin_permissions t) <> b.permissions_digest
    or (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app_private.admin_roles t) <> b.roles_digest
    or (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app_private.staff_principals t) <> b.principals_digest
    or (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app_private.staff_role_assignments t) <> b.assignments_digest
    or (select md5(coalesce(string_agg(t::text, '|'), '')) from app_private.admin_role_permissions t) <> b.role_permissions_digest then
    problems := problems || 'staff permissions or the mapping settings changed'::text;
  end if;
  if (select count(*) from app_private.admin_audit_events) <> b.audit_events
    or (select count(*) from app_private.admin_idempotency_keys) <> b.idempotency_keys then
    problems := problems || 'an audit or idempotency row appeared'::text;
  end if;
  if (select md5(coalesce(string_agg(p::text, '|' order by p.id), '')) from app.players p) <> b.players_digest
    or (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app.team_memberships t) <> b.memberships_digest then
    problems := problems || 'app players or memberships changed'::text;
  end if;
  if (select count(*) from cron.job) <> b.cron_jobs
    or (select md5(coalesce(string_agg(jobid::text || ':' || schedule || ':' || command || ':' || active::text, '|' order by jobid), ''))
        from cron.job) <> b.cron_digest
    or (select md5(coalesce(string_agg(t::text, '|'), '')) from app_private.fantasy_automation_settings t) <> b.automation_digest
    or (select md5(coalesce(string_agg(g::text, '|' order by g.id), '')) from app.fantasy_gameweeks g) <> b.gameweek_digest
    or jsonb_build_object(
      'fantasy_seasons', (select count(*) from app.fantasy_seasons),
      'fantasy_gameweeks', (select count(*) from app.fantasy_gameweeks),
      'fantasy_players', (select count(*) from app.fantasy_players),
      'fantasy_teams', (select count(*) from app.fantasy_teams),
      'fantasy_lineup_players', (select count(*) from app.fantasy_lineup_players),
      'fantasy_player_gameweek_points', (select count(*) from app.fantasy_player_gameweek_points),
      'fantasy_player_point_events', (select count(*) from app.fantasy_player_point_events),
      'fantasy_team_gameweek_results', (select count(*) from app.fantasy_team_gameweek_results),
      'players', (select count(*) from app.players),
      'team_memberships', (select count(*) from app.team_memberships),
      'fixtures', (select count(*) from app.fixtures),
      'lineup_players', (select count(*) from app.lineup_players),
      'player_fixture_performances', (select count(*) from app.player_fixture_performances)
    ) is distinct from b.counts then
    problems := problems || 'Fantasy state, automation or schedules changed'::text;
  end if;

  -- Existing Sofascore mappings keep valid review provenance: every active one reads as reviewed,
  -- through the new state function, which checks the executed proposal's own audit record.
  select count(*) into v_count
  from app_private.football_provider_mappings m
  where m.provider_name = 'sofascore' and m.active
    and coalesce((app_private.football_mapping_supporting_state(m.id) ->> 'reviewed')::boolean, false);
  if v_count <> b.sofascore_active then
    problems := problems || ('only ' || v_count || ' of ' || b.sofascore_active || ' active Sofascore mappings read as reviewed')::text;
  end if;
  -- The dependency check itself, on real rows, read-only: a made-up mapping, a missing class, a wrong target.
  if app_private.football_mapping_supporting_dependency('F1_REVIEWED_SOFASCORE_EVENTS', gen_random_uuid(), gen_random_uuid()) ->> 'code'
      is distinct from 'supporting_mapping_missing'
    or app_private.football_mapping_supporting_dependency(null, null, gen_random_uuid()) ->> 'code'
      is distinct from 'supporting_dependency_required'
    or app_private.football_mapping_supporting_dependency('NOT_A_CLASS', gen_random_uuid(), gen_random_uuid()) ->> 'code'
      is distinct from 'supporting_dependency_invalid'
    or app_private.football_mapping_supporting_dependency('F1_REVIEWED_SOFASCORE_EVENTS',
         (select m.id from app_private.football_provider_mappings m where m.provider_name = 'sofascore' and m.active order by m.id limit 1),
         gen_random_uuid()) ->> 'code' is distinct from 'supporting_mapping_target_mismatch' then
    problems := problems || 'the dependency check does not refuse as reviewed'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: postflight failed: %', array_to_string(problems, '; ');
  end if;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- The 42 manifest rows (version 2, manifest sha256 f2eef95dd199244ca6c48e9a2e0595a39a6bc2e534e7455a41467c7dba17a286), against the migrated functions.
-- For each: the candidate is as the manifest saw it; the supporting Sofascore mapping is in the
-- expected state; the server computes the dependency evidence and the SAME fingerprint the
-- manifest holds. Nothing is proposed: the proposal row is built in memory exactly as propose
-- builds it, and never inserted. The 11 held rows are not among the 42 and are still unmapped.
-- ---------------------------------------------------------------------------
do $manifest42$
declare
  r record;
  v_reasons constant jsonb := $reasons42${"F1_REVIEWED_SOFASCORE_EVENTS":"Batch-reviewed Flashscore identity: in a finished match both providers list as the same fixture, this Flashscore id and a Sofascore player whose mapping to this canonical player is active and reviewed share aligned match events (goal, assist, card or substitution) and an agreeing shirt number, or at least two distinct aligned events. Names were not compared.","F2_REVIEWED_SOFASCORE_SHIRT_DOB":"Batch-reviewed Flashscore identity: in a finished match both providers list as the same fixture, this Flashscore id and a Sofascore player whose mapping to this canonical player is active and reviewed share the same shirt number, and the birth date Flashscore reports agrees with the one Sofascore reports for that player. The date agreement is corroboration, not proof. Names were not compared."}$reasons42$::jsonb;
  v_held constant uuid[] := array(select jsonb_array_elements_text($held11$["01139304-5680-4f27-9ca3-6a6b4a6bd501", "24266e56-dcf5-41f8-b83a-8da37e6d1e10", "2a89e298-4cd9-42e2-abe1-1b5bec808707", "5725848c-c530-4fbc-b9db-c7ad5452aa60", "5837e708-3c38-4d76-92b0-e48fbb8088d0", "7c95304e-594c-4781-a356-3f4181d89ebc", "8c8e336b-f37c-4983-8448-bbeeac9031fd", "943b167c-0d6b-4dd4-bedf-b39934187cd0", "b26c9697-b331-4345-9ac3-0a53f11c949a", "b735d133-68e4-4dd4-be33-ea19659430ab", "b7817edc-9cc1-40e1-8a80-4572617759ec"]$held11$::jsonb)::uuid);
  v_state jsonb;
  v_computed jsonb;
  v_row app_private.football_player_mapping_proposals%rowtype;
  v_fp text;
  v_fps text[] := '{}';
  v_seen integer := 0;
  v_f1 integer := 0;
  v_f2 integer := 0;
  problems text[] := '{}';
begin
  for r in
    select * from jsonb_to_recordset($rows42$[{"c":"01e5eb04-0dce-40b8-a030-77759b6fb51d","x":"OdVQ5I9B","p":"abef5d77-c69c-49bd-8cc4-8896972e60e7","b":"shirt_position","k":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","s":"fc97c14d-b3d9-499f-ad29-e588cb9956df","se":"1004521","sd":"53ac67bf639c65f22db12cfde247e427af1315bcf22286d1609b3c748fa634f4","sp":"790c7e24-c77a-4bb7-ae15-f5dd731beeac","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"1004521","mappingId":"fc97c14d-b3d9-499f-ad29-e588cb9956df"},{"source":"finished_match","evidenceClass":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","sofascoreFixture":"17132480","flashscoreFixture":"GYlCyyrB"}],"f":"a70bf5f6084a1b1465d498ce2aaa5baae871138080d31a81f09acb6bd2b0da76"},{"c":"0445bc4c-826a-42bf-8a46-35fc96ba0234","x":"6DsTnU9B","p":"34c9d2a8-2746-4fe4-9fc0-8ee62a48069d","b":"incident","k":"F1_REVIEWED_SOFASCORE_EVENTS","s":"5e9e7b98-0db0-42f3-b8c5-bfb403ad0e3a","se":"919761","sd":"7641683fce71db25c818b0d7be04466d2bda3b6044d4d5ca7bb02af912891072","sp":"c1d97fb5-5fd7-431d-a12d-ccec4269dc8e","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"919761","mappingId":"5e9e7b98-0db0-42f3-b8c5-bfb403ad0e3a"},{"source":"finished_match","evidenceClass":"F1_REVIEWED_SOFASCORE_EVENTS","sofascoreFixture":"16958236","flashscoreFixture":"vZ4vNyTH"}],"f":"b00c9f9e5df9a4d433a1455dbd39636f33853890688d43c7d0ba643b8bf5ecb3"},{"c":"0545e957-4746-4f7d-ab74-b4ac6aa669dc","x":"lIDGjVYr","p":"bb028b7d-db09-4ddb-a53e-92193f28e6a3","b":"incident","k":"F1_REVIEWED_SOFASCORE_EVENTS","s":"312c6d40-c25b-4e38-8cc8-6a394cde46a6","se":"1013197","sd":"8785dc544df9fdea4258a428ec9eb6a99605ac7b637406619860bc2aefc3efe3","sp":"01fcd71d-9853-4e32-8e19-eb0863b7084d","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"1013197","mappingId":"312c6d40-c25b-4e38-8cc8-6a394cde46a6"},{"source":"finished_match","evidenceClass":"F1_REVIEWED_SOFASCORE_EVENTS","sofascoreFixture":"17132480","flashscoreFixture":"GYlCyyrB"}],"f":"7611b36a9b7ee07a6301da4755f0b51de7d0c92793de75dc85bc5570b62fcbdf"},{"c":"15353542-16aa-4a27-8938-051934a35ee2","x":"IgZjAvPd","p":"91e5fd67-3e36-4706-ba0c-a3a09be0b2ae","b":"incident","k":"F1_REVIEWED_SOFASCORE_EVENTS","s":"141a0216-2ce1-4f56-a119-703c5f5a5a8a","se":"970761","sd":"7b9cffc9c5538767ca1a554abc5490691769d3691ab10893f3103a6a540db4b7","sp":"adfed9bd-3c02-4286-aff9-0c3b6fb5fd6f","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"970761","mappingId":"141a0216-2ce1-4f56-a119-703c5f5a5a8a"},{"source":"finished_match","evidenceClass":"F1_REVIEWED_SOFASCORE_EVENTS","sofascoreFixture":"17132482","flashscoreFixture":"nLBqJSRq"}],"f":"7ea5a5f63477209858639c344a2d1c0a692f08b2c88de41c8423e8c7a7f36d5a"},{"c":"161175de-3a8d-4bd0-9a02-ea1eccd365c1","x":"jPg1q6AQ","p":"f9112452-900d-4518-a9b2-6f7dcf1ed075","b":"shirt_position","k":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","s":"48db2f75-03ca-4ab1-9c44-1fec84e183f9","se":"1140796","sd":"3e6f48c773d234b45bc3c00a2d9455854131e27fbb9db334e008c1d99e62cf06","sp":"5f53e456-45d0-4c82-831b-e834191f79d1","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"1140796","mappingId":"48db2f75-03ca-4ab1-9c44-1fec84e183f9"},{"source":"finished_match","evidenceClass":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","sofascoreFixture":"17132482","flashscoreFixture":"nLBqJSRq"}],"f":"fb4e31a422df7380405eec4c472cb41bc888bbd37737184e332e36fe5eb3cd50"},{"c":"195fbd4d-a27e-44ca-a606-d09c7a37cfe6","x":"bZiBAurE","p":"d719e8c6-e166-44a7-8601-220281488e8f","b":"incident","k":"F1_REVIEWED_SOFASCORE_EVENTS","s":"98e7cc24-191e-4a68-8d21-6883e670d6f7","se":"919697","sd":"418e4b8f5dac21663347d6b5a90b2aa58e2137fa5f159426826a912d4acea88f","sp":"1de302b1-c0cb-459e-b1fa-6eac1b83aedb","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"919697","mappingId":"98e7cc24-191e-4a68-8d21-6883e670d6f7"},{"source":"finished_match","evidenceClass":"F1_REVIEWED_SOFASCORE_EVENTS","sofascoreFixture":"17132480","flashscoreFixture":"GYlCyyrB"}],"f":"1a2b3fc18792aca68a7c05054803cebbc7d327e7b04ad253c96d37597c2b523a"},{"c":"1b870bba-9d7f-4516-9b61-3ff649bd9ad5","x":"GtdSc5PJ","p":"26934f44-83b5-4dbe-90d7-7895b59d3434","b":"incident","k":"F1_REVIEWED_SOFASCORE_EVENTS","s":"1af8a6d4-7f50-41c4-8786-a27bf690cd4e","se":"1095732","sd":"f1aedd08759502ef5804df0d173bd0ce42c515d948f0960be00758cb6ebccddb","sp":"aaf56f04-9bb4-44b9-823f-08626cb2d7f8","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"1095732","mappingId":"1af8a6d4-7f50-41c4-8786-a27bf690cd4e"},{"source":"finished_match","evidenceClass":"F1_REVIEWED_SOFASCORE_EVENTS","sofascoreFixture":"17132472","flashscoreFixture":"pW7nLFcU"}],"f":"bf3082010e8251fbca6ef4f57d382c2fc693742b1b45ecb1ecb130817426ef5c"},{"c":"21018b35-4543-4733-b68e-fae5959dc1d2","x":"IiPLx3S7","p":"ad870b3c-784b-402b-b0ca-d3441f798f40","b":"shirt_position","k":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","s":"5a7c6f6a-9734-414e-aafa-3162001d94f2","se":"1597137","sd":"b796de4b8782d909ff15fbb2c2b2b16ee6eed7e525e9a7ca334f4582c125671d","sp":"e2fd8b1f-f3ca-4797-8994-e25fb20ec58a","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"1597137","mappingId":"5a7c6f6a-9734-414e-aafa-3162001d94f2"},{"source":"finished_match","evidenceClass":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","sofascoreFixture":"17132480","flashscoreFixture":"GYlCyyrB"}],"f":"805a3301f856097934df9f83ae694b5688c1b0ff57f647ff96406f9566344ba6"},{"c":"25dbe1e3-2922-4754-be58-4aeb993c8c7f","x":"plDKsBX7","p":"88c9eaa2-15cc-46f9-987f-368c577cf6ee","b":"incident","k":"F1_REVIEWED_SOFASCORE_EVENTS","s":"eee1a47c-39fa-4519-8861-964909aa65ed","se":"919474","sd":"25062f41f93b9a2bcd49a93187930deebac07c9276a477bdaf3b42edfa718ea3","sp":"50627a24-c952-4859-bb0e-6d0f674c1240","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"919474","mappingId":"eee1a47c-39fa-4519-8861-964909aa65ed"},{"source":"finished_match","evidenceClass":"F1_REVIEWED_SOFASCORE_EVENTS","sofascoreFixture":"16958238","flashscoreFixture":"0rrduJrn"}],"f":"01c277c88eae0d04411e044f27666be545d869ddc43bd1d094be98e67cfa280d"},{"c":"2a5ccf9f-0c7f-4784-b15b-03ba232fa3d7","x":"WKliejA7","p":"095172ef-d13d-4d7c-b707-3648d70314cc","b":"incident","k":"F1_REVIEWED_SOFASCORE_EVENTS","s":"de3060fd-4174-412f-aacc-11e60c0551cf","se":"1392556","sd":"4ab30b40e789f161f7bd304ef19f816c2566c2ffe7952c602fe61ab4e1db9562","sp":"5731a98c-1f51-4c19-a670-f5d3ba824167","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"1392556","mappingId":"de3060fd-4174-412f-aacc-11e60c0551cf"},{"source":"finished_match","evidenceClass":"F1_REVIEWED_SOFASCORE_EVENTS","sofascoreFixture":"16958239","flashscoreFixture":"88o4wcDb"}],"f":"464d70afc0f9b7d28e350a53d1cb12e4b3a6e1373b93ea620b5be822f344ac2d"},{"c":"2f92ae9c-7e2e-4a55-b4d4-29b34650b68e","x":"zk4gW2UK","p":"94fb5964-bbde-438c-998d-3859e2f86f85","b":"shirt_position","k":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","s":"5e1cef54-3f46-4590-beb4-026bdcf5942c","se":"1004426","sd":"51341274097313439e7248e20313f9fe9028a4e3d1bfa94c742dd324a9952e15","sp":"71ae8766-b3ef-427d-a9af-d4b8015d24da","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"1004426","mappingId":"5e1cef54-3f46-4590-beb4-026bdcf5942c"},{"source":"finished_match","evidenceClass":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","sofascoreFixture":"17132481","flashscoreFixture":"W81WOcb5"}],"f":"e86b8b6ab603bc88a8573a802eef9d071b95a9244238736921bea3827ded1314"},{"c":"31d6a952-cd3d-4f14-ace1-a15076f18ccc","x":"K2T6yapr","p":"97ffa238-8d2e-4e5e-84ad-341703787ba6","b":"incident","k":"F1_REVIEWED_SOFASCORE_EVENTS","s":"f6349fd5-f331-4d83-9d2a-bb4810fc1d75","se":"787448","sd":"2edf65f6e1c76073c248218b4f49b284cdf1e441f8c0eeb98e09c3aca6b2003e","sp":"f1e72c24-4965-4a94-8bb8-81fe40a9f97a","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"787448","mappingId":"f6349fd5-f331-4d83-9d2a-bb4810fc1d75"},{"source":"finished_match","evidenceClass":"F1_REVIEWED_SOFASCORE_EVENTS","sofascoreFixture":"17132472","flashscoreFixture":"pW7nLFcU"}],"f":"4e588ca6dc91c34b88233cd38bb70601e050694e79c48fab1746239e72ee229c"},{"c":"335a5d1a-6f32-437a-a168-4385a0feb079","x":"WnHVHDBr","p":"13573551-f2e6-4bc2-a13c-77edb43a4f8a","b":"incident","k":"F1_REVIEWED_SOFASCORE_EVENTS","s":"d2cddba1-7a90-467c-9420-8eb65e849821","se":"1632211","sd":"5ed1795ae9bda083167e30d70ec6c477e1f433e5b5386018a106a59dfff5da18","sp":"a834022c-c6d5-467c-abe0-0c4a16ec5461","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"1632211","mappingId":"d2cddba1-7a90-467c-9420-8eb65e849821"},{"source":"finished_match","evidenceClass":"F1_REVIEWED_SOFASCORE_EVENTS","sofascoreFixture":"17132480","flashscoreFixture":"GYlCyyrB"}],"f":"7f1be770b39b8d7132792ee901fe5ba186a918ec873b71a333edc068122a25d8"},{"c":"339be4a7-6275-41cb-96ca-1252f505341d","x":"2JPjkS5d","p":"af26ed6a-c39a-438e-8ec8-dd81cf902087","b":"incident","k":"F1_REVIEWED_SOFASCORE_EVENTS","s":"bb50e95d-2d55-468d-9839-582d6001cdcc","se":"2161836","sd":"c84ad7e9d0e96fb59662f137ad1d7ccfd002ecb04c9c2f70ac4d4164e9752324","sp":"b8d18da2-e0a9-45cf-a641-1730222bab29","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"2161836","mappingId":"bb50e95d-2d55-468d-9839-582d6001cdcc"},{"source":"finished_match","evidenceClass":"F1_REVIEWED_SOFASCORE_EVENTS","sofascoreFixture":"16958236","flashscoreFixture":"vZ4vNyTH"}],"f":"6f50330e02328cf1b10f62f1e78c407a2c7c269cc2eee272d3c3fea3adfad996"},{"c":"3934c963-69c1-4492-8774-5e98803c4754","x":"QyNjhw1F","p":"009def78-8b05-46db-a6ca-286a9bd26124","b":"shirt_position","k":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","s":"c4126839-f12a-402d-8f85-21fa12994edc","se":"1103558","sd":"e0b8f24c691f8f18d4eb0408f6ac10d2691bf389077447b98881d0374856bd75","sp":"52206f1a-d1e2-45de-9b41-2f591311dc1c","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"1103558","mappingId":"c4126839-f12a-402d-8f85-21fa12994edc"},{"source":"finished_match","evidenceClass":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","sofascoreFixture":"17132481","flashscoreFixture":"W81WOcb5"}],"f":"ae4cefbdb7da9abec35184e1e1edabb5abd717e8455d5072100251b5583c7bd8"},{"c":"3ede02e0-e8a0-4bba-824f-f23973e5e5d4","x":"bRIP5a57","p":"6c565bcf-cb72-40de-bfd8-32ccd0a000ee","b":"shirt_position","k":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","s":"dfee1db4-90ba-44fa-a066-f226ecdbf465","se":"1463237","sd":"38b0632aa09e7649024fcbd0722aeb58897660a09a95e116c95b7700e3d560fb","sp":"e9045995-a553-4e3a-919c-62f300df2eda","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"1463237","mappingId":"dfee1db4-90ba-44fa-a066-f226ecdbf465"},{"source":"finished_match","evidenceClass":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","sofascoreFixture":"16958238","flashscoreFixture":"0rrduJrn"}],"f":"e82df59d33c9ea04457a36dfdb4aa3cf3a434e48ab75dee296133da2250911db"},{"c":"42be5c26-6d59-4b5d-8439-71145d24a25b","x":"lnuqEiTC","p":"8ca146d7-7535-4b56-8ee7-f31f7ccb7bc5","b":"shirt_position","k":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","s":"7f054c05-4f99-432b-9639-ad3df4e1d840","se":"975173","sd":"a092750255b9fd233b40c904e0223ca4000e3f2ea8ea0c5b1f5ea916463ff0e4","sp":"19e44ce9-1e15-4d13-9d6d-df61cbb84268","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"975173","mappingId":"7f054c05-4f99-432b-9639-ad3df4e1d840"},{"source":"finished_match","evidenceClass":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","sofascoreFixture":"17132480","flashscoreFixture":"GYlCyyrB"}],"f":"9ae2a66cd177eb84bb760eaa1f502d23427fc08457b9a52864c0bf1c488a5f79"},{"c":"4710c6a8-d03d-40d3-baa8-5e91f7f74d72","x":"t4fKRuVt","p":"7f383d28-2a44-406a-89f9-697418d5b266","b":"incident","k":"F1_REVIEWED_SOFASCORE_EVENTS","s":"1ff64f42-3f95-4426-ac8b-2a59ac816d21","se":"895127","sd":"74599e51e2c657f174bddcbd35f5753aa40616d0e30938dd2fa936d616f217b1","sp":"8ce68c47-84dd-45ab-bf80-1eee4e97bc7e","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"895127","mappingId":"1ff64f42-3f95-4426-ac8b-2a59ac816d21"},{"source":"finished_match","evidenceClass":"F1_REVIEWED_SOFASCORE_EVENTS","sofascoreFixture":"17132481","flashscoreFixture":"W81WOcb5"}],"f":"b4e0f54ed43e139dcde81b46de331c73fe03a7ab2ecb448bb24e77b4aa22ed6c"},{"c":"49789f71-23b1-4cad-b29e-08bbfc31f39a","x":"hIlAyesq","p":"726e252d-4021-4f0e-a6a3-3e3f5b3bb132","b":"shirt_position","k":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","s":"3fd09f97-8568-48b7-a0ae-109270cf0ed7","se":"970630","sd":"c14c3da97196223bfe695dc3678ab143c54c5d0fb9e8e8e96e09e248d4df002e","sp":"3d932030-4c8d-4b4d-a34d-bb25f06c93e3","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"970630","mappingId":"3fd09f97-8568-48b7-a0ae-109270cf0ed7"},{"source":"finished_match","evidenceClass":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","sofascoreFixture":"17132472","flashscoreFixture":"pW7nLFcU"}],"f":"af8164ead4055153d5d9c4ff13fc93d0edcfc2720fc74a65b6e562448517403e"},{"c":"4d407670-ef27-4c86-b1cb-47ede04cb053","x":"hUeu7ybK","p":"2c7173d9-9aec-44e5-b7f1-cec3f0989e81","b":"shirt_position","k":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","s":"9d7eb75d-1b7d-4a52-a316-16a9745b90f3","se":"1525328","sd":"7b3c92053a560ee6f487739b89a6c1d7aa3d4103f89c20d615dee47bd6fdcd91","sp":"638f4fe5-527a-4075-be95-b89c13b797b2","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"1525328","mappingId":"9d7eb75d-1b7d-4a52-a316-16a9745b90f3"},{"source":"finished_match","evidenceClass":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","sofascoreFixture":"16958239","flashscoreFixture":"88o4wcDb"}],"f":"b8bc8398efba4ebe1888faf7fb72d640a318cde81b5cb0c09102d49ad14bc77a"},{"c":"5e478ebe-0bd7-4326-8bfe-ff03c495e4a1","x":"h884iXeS","p":"b99cd2a8-dea8-4257-8d1d-44879408bba3","b":"incident","k":"F1_REVIEWED_SOFASCORE_EVENTS","s":"4e677ca0-69a4-412e-a9b7-1a48dbffd119","se":"1545316","sd":"29f540e7ecb842035a04e0a27d67b0f835830755c3e020da8ea53e9757de8bbd","sp":"94005936-935f-425b-9ceb-c281029abc76","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"1545316","mappingId":"4e677ca0-69a4-412e-a9b7-1a48dbffd119"},{"source":"finished_match","evidenceClass":"F1_REVIEWED_SOFASCORE_EVENTS","sofascoreFixture":"17132481","flashscoreFixture":"W81WOcb5"}],"f":"8bcc36e742888a18246b4fc7f3d7b034d9856093582d2f62e091eccbc7cb78ba"},{"c":"672177e6-4ca4-4b45-a08f-50fe3754b9c8","x":"Op9JSXeq","p":"f9931712-b5b4-4141-9383-d509b8b1d03d","b":"incident","k":"F1_REVIEWED_SOFASCORE_EVENTS","s":"fe56cb44-b323-4f81-93a1-5ddef1dad2f2","se":"981300","sd":"ddc3d1bb3adcb44dd914b98ce02913544e98274c52cfb146361da481295db400","sp":"c3c5c446-d770-46c8-8323-7b157340901e","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"981300","mappingId":"fe56cb44-b323-4f81-93a1-5ddef1dad2f2"},{"source":"finished_match","evidenceClass":"F1_REVIEWED_SOFASCORE_EVENTS","sofascoreFixture":"16958238","flashscoreFixture":"0rrduJrn"}],"f":"12758d4d9ec6a9d7b6515f1edc612055836eca789a1c387782958675daf34bb6"},{"c":"71b8a919-746c-46e7-ae79-c55c44823bd6","x":"Qou7UAOb","p":"8dd1387a-5d76-4dc1-a906-575f8e08289d","b":"shirt_position","k":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","s":"270ea9fe-87fa-4354-ab85-9e415078af91","se":"970766","sd":"758eeb94ba381a20c9ecd45a8d29db43df17b457f9ed4c568fdbe471fcb42162","sp":"b00354dc-3730-4e4d-a8c3-535bb9ffd084","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"970766","mappingId":"270ea9fe-87fa-4354-ab85-9e415078af91"},{"source":"finished_match","evidenceClass":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","sofascoreFixture":"17132481","flashscoreFixture":"W81WOcb5"}],"f":"49ad64e23c39710397dc4d3d2a75356a86cc057baa86f601624569fbfddbb369"},{"c":"7297213f-b439-43e3-b84a-3d1742d57d8c","x":"ruVnjhb0","p":"d054ce48-bfc3-4c69-a131-001912c9e8eb","b":"shirt_position","k":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","s":"67631e84-5621-4f52-9abc-26856e24f1a5","se":"1140857","sd":"89f0918563e901a7be601a6c753f523bfa9e5bcc781d28d64c5570c991345b46","sp":"d63d26db-3d1b-4ce7-b083-816325a505bb","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"1140857","mappingId":"67631e84-5621-4f52-9abc-26856e24f1a5"},{"source":"finished_match","evidenceClass":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","sofascoreFixture":"17132480","flashscoreFixture":"GYlCyyrB"}],"f":"6543da2117eb514b21e558fe535abf1d982f71245a2fa067a662f745ad765b5a"},{"c":"75107848-6090-4783-bfe2-9d953be442c9","x":"M5krN8rp","p":"9c04eb34-f71c-4469-acfd-2ce662d20f18","b":"incident","k":"F1_REVIEWED_SOFASCORE_EVENTS","s":"62e7ec80-b9a7-4b5c-9484-40aeeacd2079","se":"1140943","sd":"bd45d21da3ac305180ae5e2e0c88940c769bd8d9e3a2e163011a7c9ab5ec75cc","sp":"a111b6f3-507a-4b2a-9061-771ef3eaab55","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"1140943","mappingId":"62e7ec80-b9a7-4b5c-9484-40aeeacd2079"},{"source":"finished_match","evidenceClass":"F1_REVIEWED_SOFASCORE_EVENTS","sofascoreFixture":"17132480","flashscoreFixture":"GYlCyyrB"}],"f":"d637d908e03d6037927976cb199f1e4f09077bcc4b7c301ef4f5a7cc45db689c"},{"c":"7d68a953-d275-452d-a2c0-5287f5a8136d","x":"EuEfpDyB","p":"07ed1779-e5db-4e2f-81a1-6233e0c32b41","b":"shirt_position","k":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","s":"6154f1bd-9c26-46a6-b49f-fa0749b6b70c","se":"1107604","sd":"2238b3de5f209c2fa7c642e8cf2006799c67ec2ef9d3b999432421026436b60c","sp":"d10c03bc-bd7b-40e1-832f-0784f03b8123","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"1107604","mappingId":"6154f1bd-9c26-46a6-b49f-fa0749b6b70c"},{"source":"finished_match","evidenceClass":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","sofascoreFixture":"17132480","flashscoreFixture":"GYlCyyrB"}],"f":"59e5d222c0721e408677805344c7643520a002b94413a6a5c61e5f19cf29cdd1"},{"c":"81bd858c-0629-47b7-8a00-ac108ed5cb10","x":"YZ8OD3Ur","p":"887f057a-57d0-49c8-851b-d0241be9ed27","b":"incident","k":"F1_REVIEWED_SOFASCORE_EVENTS","s":"9359ee2f-4321-40b7-be79-56c60c6e84d1","se":"919712","sd":"9efac45cd3f38acd70ed1b0ababfb86861486285e0a9112564de2c2f0ed7263b","sp":"f953ff7e-04c9-4651-917d-e2a9020ba111","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"919712","mappingId":"9359ee2f-4321-40b7-be79-56c60c6e84d1"},{"source":"finished_match","evidenceClass":"F1_REVIEWED_SOFASCORE_EVENTS","sofascoreFixture":"17132472","flashscoreFixture":"pW7nLFcU"}],"f":"e68bc0e527301779e608b24e675873a404635a22e226ef97d74c7c236ee5537c"},{"c":"85eaec52-0e62-44c5-8d58-3a6a6a64dbb9","x":"6cwv6kvA","p":"f7374a2a-384c-4f26-9777-384f4999ed75","b":"shirt_position","k":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","s":"fde26ab6-9095-4aa1-acd2-b1dca974b9f4","se":"1920270","sd":"214e9dd5dd7a88d12111ba4cc5e184d9a1e1364f9bfd99b4665fcdaf110fe93c","sp":"fb77cf6c-01bb-4242-80a2-92dc9ea824a7","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"1920270","mappingId":"fde26ab6-9095-4aa1-acd2-b1dca974b9f4"},{"source":"finished_match","evidenceClass":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","sofascoreFixture":"16958236","flashscoreFixture":"vZ4vNyTH"}],"f":"89d9fe3d29f037ba80bb638a60d015da157575a82754b37a30cfa3e698f845a0"},{"c":"91905755-4126-43e6-8b06-c1030502d483","x":"GlQ4Tuvh","p":"9285f7bb-cc04-4701-994f-36ae5f1955f4","b":"incident","k":"F1_REVIEWED_SOFASCORE_EVENTS","s":"ace8e903-e30a-475a-8e07-d200464169df","se":"2178617","sd":"f8cb96d466b934f523f1c7072f3bf477470ffe7b26def473f6b8b321efdb0e02","sp":"8e75af44-d7ae-4e6d-aae0-6bc7e665e2e1","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"2178617","mappingId":"ace8e903-e30a-475a-8e07-d200464169df"},{"source":"finished_match","evidenceClass":"F1_REVIEWED_SOFASCORE_EVENTS","sofascoreFixture":"17132482","flashscoreFixture":"nLBqJSRq"}],"f":"9b383550cf475d36c6c413e04edef95e6573618ae7afa89261adc8a2d7864b14"},{"c":"938e0bf6-3352-48c3-899d-e8f9f59ac8f6","x":"8AYnWqxg","p":"55db263a-4636-467b-8e2f-fd7d909779a5","b":"shirt_position","k":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","s":"ac8d59b8-9deb-4491-b64b-6364ea976b70","se":"1140820","sd":"216d3ea9e834ea52c058e615d2555a30299455acfd42e37e59e873e6805b3212","sp":"3a3f4438-1c61-4391-8033-b44d20095edd","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"1140820","mappingId":"ac8d59b8-9deb-4491-b64b-6364ea976b70"},{"source":"finished_match","evidenceClass":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","sofascoreFixture":"17132481","flashscoreFixture":"W81WOcb5"}],"f":"4d20dde4b9ea6b95937df909e3945aa8ef412964a5898d25e56ab04ae45e3d82"},{"c":"95a5c8d2-564a-42e1-9f28-47097d4f4892","x":"dQxpyrI6","p":"2d8e936b-9bbf-46de-b673-91b913b24d13","b":"incident","k":"F1_REVIEWED_SOFASCORE_EVENTS","s":"305885e7-cecf-466b-ae14-48bf9e1f72c8","se":"970606","sd":"c1650db382b6f6906304cce6d8ead7142388439fdc33fa28764d6fead7bd71d4","sp":"94a6d7f9-2fa9-4fe9-873c-eb0d399d7bb7","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"970606","mappingId":"305885e7-cecf-466b-ae14-48bf9e1f72c8"},{"source":"finished_match","evidenceClass":"F1_REVIEWED_SOFASCORE_EVENTS","sofascoreFixture":"17132480","flashscoreFixture":"GYlCyyrB"}],"f":"8d10e41e623e7818da698a2eaf2ec4749d44bf4de83635518e8e6b0ae098635f"},{"c":"9816977b-1be2-449c-9758-d2c324189515","x":"MLRbaNef","p":"a7dbe8e4-4a3f-4c46-8d4c-96bb37516760","b":"incident","k":"F1_REVIEWED_SOFASCORE_EVENTS","s":"bac33a85-e719-460d-b723-98f2fa66beb5","se":"1140927","sd":"e4dad462114107529f7a46a89e1bd362368ae27fd3518788f852ab44c2276bbf","sp":"37614deb-9691-4dbf-84d1-f00ec2942078","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"1140927","mappingId":"bac33a85-e719-460d-b723-98f2fa66beb5"},{"source":"finished_match","evidenceClass":"F1_REVIEWED_SOFASCORE_EVENTS","sofascoreFixture":"17132480","flashscoreFixture":"GYlCyyrB"}],"f":"f9a63469cb53109c730ef919da5a58898c4b8d436bd075704319afbfb2a3d9c7"},{"c":"aa568fac-f1a2-421e-94fc-3528e98c9beb","x":"0Q2O9YaL","p":"c3818d6f-3e94-4a5e-8247-970c85b29822","b":"shirt_position","k":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","s":"feebb152-c33b-4759-84f9-489be6f81931","se":"1004249","sd":"f96d05ece7c0d457292212a2ade3edb1eb1608f9522a81634b034c4ad2bdf416","sp":"7626060f-ac42-4804-aea7-14a781e026a6","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"1004249","mappingId":"feebb152-c33b-4759-84f9-489be6f81931"},{"source":"finished_match","evidenceClass":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","sofascoreFixture":"16958238","flashscoreFixture":"0rrduJrn"}],"f":"ea3405d289c1651e1ca39b404f6fa92a5e5868547377fb9c80d0eed66939faaa"},{"c":"aff0e584-d5ef-4853-9731-e49a66468989","x":"W0A7lL4I","p":"287be0a2-631e-4cb8-856d-c052128ad06c","b":"incident","k":"F1_REVIEWED_SOFASCORE_EVENTS","s":"c5b470ff-331b-43be-9d5d-ea2bb829e113","se":"1919290","sd":"071fd569e60b35ca13ee3d5b1c634489f58c23bfecea96ecb7a8b0203b995ebb","sp":"77e34252-f967-46f2-95a9-59029418502a","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"1919290","mappingId":"c5b470ff-331b-43be-9d5d-ea2bb829e113"},{"source":"finished_match","evidenceClass":"F1_REVIEWED_SOFASCORE_EVENTS","sofascoreFixture":"16958236","flashscoreFixture":"vZ4vNyTH"}],"f":"e1056587657887711a6e3a54771742f1aefd6afc7b0d21124e024bcb3cd2a8a7"},{"c":"ba158221-1ac4-4d3a-bb3a-76d015dd66bc","x":"Gdld376S","p":"7ab491d5-7f2b-4057-b56d-109ed615e63b","b":"shirt_position","k":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","s":"2162b043-cb0a-43c5-b12b-359299053437","se":"919329","sd":"5970a5051de2134d8b0075812b1aad0f2f030cc954e20a8a88224f8872445410","sp":"010e0d7b-0e67-4be2-845c-4518bd2e9d69","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"919329","mappingId":"2162b043-cb0a-43c5-b12b-359299053437"},{"source":"finished_match","evidenceClass":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","sofascoreFixture":"17132481","flashscoreFixture":"W81WOcb5"}],"f":"46d6aa939bace8693689d9264045e352fbc652939713a7b2dba174ffdafae99b"},{"c":"c5214585-d111-45a4-a395-51b244b270dc","x":"CQehl7o7","p":"a43c3048-d8a4-46a3-ab52-5d0315c07b0f","b":"shirt_position","k":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","s":"0626ce80-d32e-43e2-bd55-4f72497c53d1","se":"879777","sd":"048321dda0234d9c267fe2e686b21ccc0b05d0233e47a6d6796e594e4967d4ba","sp":"c846f946-8575-4666-abf9-4cbbc0b0d584","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"879777","mappingId":"0626ce80-d32e-43e2-bd55-4f72497c53d1"},{"source":"finished_match","evidenceClass":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","sofascoreFixture":"17132480","flashscoreFixture":"GYlCyyrB"}],"f":"9539c9747f2407e4df24684511d80dac8cff62ea4bb6aaf02e38bc9d1632a4f7"},{"c":"d53e2549-e2f7-4033-8773-9bc865359c5b","x":"lpLhmL70","p":"d5f53ee6-0ad8-4042-9461-e19b3be81f6b","b":"incident","k":"F1_REVIEWED_SOFASCORE_EVENTS","s":"910ec653-7073-4a6f-aeb2-f79ccb86b24f","se":"1177366","sd":"3a672ed0e5b3365410b3b2d674c07821b24aba00afb0d15a807bf2c881825e4f","sp":"a73938e5-3ab5-480c-bb90-b266e3a15bd0","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"1177366","mappingId":"910ec653-7073-4a6f-aeb2-f79ccb86b24f"},{"source":"finished_match","evidenceClass":"F1_REVIEWED_SOFASCORE_EVENTS","sofascoreFixture":"16958236","flashscoreFixture":"vZ4vNyTH"}],"f":"01b0c550280cc755e28edc9f867d774adf8194b04d560a5aad66ff4b2195280c"},{"c":"d7b1f1b3-1f76-44d7-a6a7-cee4e774e2b7","x":"nmhUfKh6","p":"b2bf23cb-59e7-4aab-ba81-cd0c13eb153b","b":"incident","k":"F1_REVIEWED_SOFASCORE_EVENTS","s":"d8c2bd21-206d-44cd-8991-ee2bede69d14","se":"919677","sd":"39a066013f422aa8c9937da629cf521c8d204afe72d7562d97400d10014d77ae","sp":"cc049da6-55b6-4ff1-a893-1b35f15fe9ba","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"919677","mappingId":"d8c2bd21-206d-44cd-8991-ee2bede69d14"},{"source":"finished_match","evidenceClass":"F1_REVIEWED_SOFASCORE_EVENTS","sofascoreFixture":"17132472","flashscoreFixture":"pW7nLFcU"}],"f":"118f4a28e5f1eba989d2a869472339e5fb0c24fca7efe547d140acfda6c822d1"},{"c":"df0205ba-1bc5-4a34-a8e6-70d0242c4cf7","x":"Q9pOwskm","p":"11e78c3d-fca0-4b89-80ab-5cc4b1564e90","b":"shirt_position","k":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","s":"4e7c0346-b4c3-4ee2-bd33-310e3a29e07e","se":"1401595","sd":"b298a67fbb172c69da23f206814376ed196f8791d2d44f939426fe5f10b60b48","sp":"24cbf204-90d7-4f4a-915c-bc79f7b9d186","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"1401595","mappingId":"4e7c0346-b4c3-4ee2-bd33-310e3a29e07e"},{"source":"finished_match","evidenceClass":"F2_REVIEWED_SOFASCORE_SHIRT_DOB","sofascoreFixture":"16958239","flashscoreFixture":"88o4wcDb"}],"f":"a953b63662c05a2332ecd9ae64b20193ee201411ae7f3aa20a8bc31d16ae78d1"},{"c":"f44655be-2dfd-4a6d-be7f-f6ed1b515f6a","x":"4xHMwRii","p":"7cb65cb6-e9a5-401f-9045-f5ba6bde3e42","b":"incident","k":"F1_REVIEWED_SOFASCORE_EVENTS","s":"4c2fe468-6c12-4a35-9597-cd1e62c77aec","se":"1095727","sd":"32aa962f461129229397042d561a8fb83aa465f8c7c7f2382289744fb8fb5371","sp":"30ceb6b4-8ed4-4cd5-9bea-8cbf2afdfb22","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"1095727","mappingId":"4c2fe468-6c12-4a35-9597-cd1e62c77aec"},{"source":"finished_match","evidenceClass":"F1_REVIEWED_SOFASCORE_EVENTS","sofascoreFixture":"17132482","flashscoreFixture":"nLBqJSRq"}],"f":"e2ea050a14f45578a4a724853bac8cc9b20fd225c05b15c677078f3445333428"},{"c":"fde76ef4-1645-4bb6-84da-dd0af721df03","x":"KKZ6X376","p":"0bff79be-b852-48d0-9688-355d43841fcb","b":"incident","k":"F1_REVIEWED_SOFASCORE_EVENTS","s":"b10af4ba-8ddf-477a-8495-7844f1fa405b","se":"1823726","sd":"0f8bcae2b03bcb3de8bbca9eccf4fee18b28827420fe5893d17b7915aaccc92a","sp":"bc3f4866-2f52-49e2-93a0-7a8a41882f37","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"1823726","mappingId":"b10af4ba-8ddf-477a-8495-7844f1fa405b"},{"source":"finished_match","evidenceClass":"F1_REVIEWED_SOFASCORE_EVENTS","sofascoreFixture":"17132482","flashscoreFixture":"nLBqJSRq"}],"f":"f6a464da848b108cecce34c24bc5075d1ca594006b2a7dd19c86b6b49cb749aa"},{"c":"fee903bc-6aff-49d2-be42-b671d39cf86c","x":"GhxoOstL","p":"e0bba0c4-6caf-4b08-8cc3-25af8c655dbc","b":"incident","k":"F1_REVIEWED_SOFASCORE_EVENTS","s":"aabebc86-aec4-467c-886e-6e6f60b13e99","se":"1140806","sd":"80537854ea3d46405fd2bfab06f1407876f1d033dc12eb7f39fc26ed2ae4f6f5","sp":"20abf14e-2afd-42f5-ad81-0e272512e510","r":[{"source":"reviewed_sofascore_mapping","sofascoreId":"1140806","mappingId":"aabebc86-aec4-467c-886e-6e6f60b13e99"},{"source":"finished_match","evidenceClass":"F1_REVIEWED_SOFASCORE_EVENTS","sofascoreFixture":"16958239","flashscoreFixture":"88o4wcDb"}],"f":"78d30cfa6d1e6ccca56fcc59fc0e5ac7c5454d1baa297342e399aa59c1abdc98"}]$rows42$::jsonb)
      as x(c uuid, x text, p uuid, b text, k text, s uuid, se text, sd text, sp uuid, r jsonb, f text)
    order by c
  loop
    v_seen := v_seen + 1;
    if r.k like 'F1\_%' then v_f1 := v_f1 + 1; else v_f2 := v_f2 + 1; end if;
    if r.c = any (v_held) then
      problems := problems || (r.c || ' is a held row but is in the batch')::text;
    end if;
    if not exists (select 1 from app_private.football_player_mapping_candidates c
        where c.id = r.c and c.provider_name = 'flashscore' and c.external_id = r.x
          and c.status = 'unmapped' and c.existing_mapping_id is null) then
      problems := problems || (r.c || ': the candidate is not the unmapped Flashscore candidate the manifest names')::text;
    end if;
    v_state := app_private.football_mapping_supporting_state(r.s);
    if v_state is null
      or v_state ->> 'provider' is distinct from 'sofascore'
      or v_state ->> 'externalId' is distinct from r.se
      or (v_state ->> 'appPlayerId')::uuid is distinct from r.p
      or (v_state ->> 'active')::boolean is not true
      or (v_state ->> 'reviewed')::boolean is not true
      or (v_state ->> 'provenanceProposalId')::uuid is distinct from r.sp
      or v_state ->> 'stateDigest' is distinct from r.sd then
      problems := problems || (r.c || ': the supporting Sofascore mapping is not in the expected state')::text;
      continue;
    end if;
    v_computed := app_private.football_mapping_compute(
      'map', null, r.c, null, null, r.p, null, null, null, r.k, r.s, r.r);
    if not (v_computed ->> 'ok')::boolean then
      problems := problems || (r.c || ': the server refuses it: ' || coalesce(v_computed ->> 'code', '?'))::text;
      continue;
    end if;
    v_row := null;
    v_row.kind := 'map';
    v_row.sofascore_candidate_id := null;
    v_row.flashscore_candidate_id := r.c;
    v_row.sofascore_external_id := v_computed ->> 'sofascoreExternalId';
    v_row.flashscore_external_id := v_computed ->> 'flashscoreExternalId';
    v_row.provider_name := v_computed ->> 'providerName';
    v_row.mapping_id := null;
    v_row.app_player_id := r.p;
    v_row.new_external_id := null;
    v_row.new_app_player_id := null;
    v_row.expected_before := nullif(v_computed -> 'expectedBefore', 'null'::jsonb);
    v_row.basis := r.b;
    v_row.evidence := (v_computed -> 'evidence') || jsonb_build_object('refs', r.r);
    v_row.signals := v_computed -> 'signals';
    v_row.candidate_revisions := v_computed -> 'candidateRevisions';
    v_row.position_disagreement := (v_computed ->> 'positionDisagreement')::boolean;
    v_row.reason := v_reasons ->> r.k;
    v_row.evidence_class := r.k;
    v_row.supporting_mapping_id := r.s;
    v_fp := app_private.football_mapping_row_fingerprint(v_row);
    v_fps := v_fps || v_fp;
    if v_fp is distinct from r.f then
      problems := problems || (r.c || ': the server fingerprint differs from the manifest')::text;
    end if;
    if v_row.position_disagreement then
      problems := problems || (r.c || ': the server reports a position disagreement')::text;
    end if;
  end loop;
  if v_seen <> 42 or v_f1 <> 24 or v_f2 <> 18 then
    problems := problems || ('the batch is not 42 rows (24 + 18): ' || v_seen || ' = ' || v_f1 || ' + ' || v_f2)::text;
  end if;
  if cardinality(v_held) <> 11
    or (select count(*) from app_private.football_player_mapping_candidates c
        where c.id = any (v_held) and c.provider_name = 'flashscore' and c.status = 'unmapped') <> 11 then
    problems := problems || 'the 11 held rows are not all still unmapped Flashscore candidates'::text;
  end if;
  if cardinality(problems) = 0
    and md5(array_to_string(v_fps, ',')) is distinct from '3f68a04f77aa59e2eec80d84786eabff' then
    problems := problems || 'the 42 server fingerprints do not add up to the manifest digest'::text;
  end if;
  if cardinality(problems) > 0 then
    raise exception 'stop: manifest check failed (% problems): %', cardinality(problems), array_to_string(problems[1:8], '; ');
  end if;
end
$manifest42$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. The owner-dispatched apply workflow changes the
-- next line to `commit;` and nothing else.
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261003120000')
    then 'Applied. The Flashscore supporting-dependency guard is installed.'
  else 'Rehearsal passed. Nothing was saved.'
end as result;
