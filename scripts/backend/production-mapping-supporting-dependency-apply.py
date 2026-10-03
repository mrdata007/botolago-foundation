#!/usr/bin/env python3
"""ONE-SHOT real application of the Flashscore supporting-dependency guard to Production V2.

Sends the rehearsed wrapper script in ONE request with its single final `rollback;`
turned into `commit;` and nothing else changed, after pinning the migration, the
wrapper, the commit payload and the version-2 manifest by sha256 and re-reading
production. It never retries the apply. After the request, whatever the client
reports, it reads production again and decides the outcome from the STATE:

  BLOCKED_NO_WRITE        the pre-state was not the reviewed one; nothing was sent
  FAILED_ROLLED_BACK      the migration is not recorded and production equals the pre-state
  APPLIED_AND_VERIFIED    the migration is recorded and every verification passed
                          (a lost response is recorded as a warning, never a failure)
  COMMITTED_NEEDS_REVIEW  the migration is recorded but a verification failed
  OUTCOME_UNVERIFIED      production could not be read, or is in neither state

Nothing is deleted or reversed automatically. No names or personal data are read.

Verification is not "zero changed keys": a real migration changes the schema. Every
snapshot key is classified as either an EXPECTED CHANGE (checked against the exact
reviewed post-state) or PROTECTED (must equal the pre-state), and an unclassified key
is itself a failure. The snapshot queries use catalog lookups that work in BOTH states
(an object that must be absent after the commit is never cast to a regprocedure).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable

PROJECT_REF = "tkewgajrljbwgwedqsxn"
STAGING_REF = "srdrflfrfpwixsllveid"
API = "https://api.supabase.com"

MIGRATION = "supabase/migrations/20261003120000_football_mapping_supporting_dependency.sql"
MIGRATION_SHA256 = "d435bde5d9ca114a17f94786178b1f4261ff3b8e8c65f8d8f8fcbd70baa18577"
WRAPPER = "scripts/backend/apply-20261003120000-mapping-supporting-dependency.sql"
WRAPPER_SHA256 = "920cd532be40299f85e99656d1ba75c0f451ec63f5b4547961a1d827f68340c4"
COMMIT_PAYLOAD_SHA256 = "018c2e92beb32ac8311912f742c6e2e847ada0f73ef2b68ef9a103c7a253cd89"
MANIFEST = "docs/production/manifests/gw1-flashscore-executable.v2.manifest.json"
MANIFEST_FILE_SHA256 = "c5a335ec20755534acb3ac75c9dbc4ae8e35df1d4919dcebdefd63ae3dc88c50"
MANIFEST_CANONICAL_SHA256 = "f2eef95dd199244ca6c48e9a2e0595a39a6bc2e534e7455a41467c7dba17a286"

OUT_BLOCKED = "BLOCKED_NO_WRITE"
OUT_FAILED = "FAILED_ROLLED_BACK"
OUT_OK = "APPLIED_AND_VERIFIED"
OUT_REVIEW = "COMMITTED_NEEDS_REVIEW"
OUT_UNVERIFIED = "OUTCOME_UNVERIFIED"
EXIT_CODES = {OUT_OK: 0, OUT_BLOCKED: 2, OUT_UNVERIFIED: 3, OUT_FAILED: 4, OUT_REVIEW: 5}

OLD_COMPUTE = "app_private.football_mapping_compute(text,uuid,uuid,text,uuid,uuid,text,uuid,uuid)"
NEW_COMPUTE = (
    "app_private.football_mapping_compute(text,uuid,uuid,text,uuid,uuid,text,uuid,uuid,text,uuid,jsonb)"
)

# The text of the six functions the migration replaces, as they are in production now.
OLD_MD5 = {
    OLD_COMPUTE: "36269e06556de5376c4ba9208278b4c4",
    "api.admin_football_mapping_propose(jsonb,text,uuid)": "f5d0763b027e80822266da71fa7ecbfa",
    "app_private.football_mapping_revalidate(uuid)": "13e0707e390ec73af8ff4255f9986927",
    "api.admin_football_mapping_refresh_evidence(uuid,uuid)": "e7d0e0ac179efc20a13149ff832ae60f",
    "api.admin_football_mapping_execute(uuid,uuid)": "1c0951a9f61cf0baa2970b720b90cfb4",
    "app_private.football_mapping_proposal_guard()": "9a09d8f704c30f18cd544c7455dc665d",
}
RESOLVER = "api.resolve_football_mapping(text,text,text,uuid,text,timestamp with time zone)"
RESOLVER_MD5 = "c4c7253284afa52aea055f74e3806d73"

# The nine functions the migration leaves behind, and the grants it gives them.
NEW_MD5 = {
    "api.admin_football_mapping_execute(uuid,uuid)": "88afdf18716d1ce9e472c00a9220d278",
    "api.admin_football_mapping_get_provider_mapping(text,text)": "67b1d19d4f1b75d109c202d8b611935b",
    "api.admin_football_mapping_propose(jsonb,text,uuid)": "c5d31dea4ee9163016b634f8b752f2a4",
    "api.admin_football_mapping_refresh_evidence(uuid,uuid)": "98693148fae7e37a1be6a8fe3349ef50",
    NEW_COMPUTE: "3a46795f47ad32dab78a40167c7e0c61",
    "app_private.football_mapping_proposal_guard()": "1f02e38bd45644b23489d866481befcc",
    "app_private.football_mapping_revalidate(uuid)": "8e1ab9a983db4846932fbc580dbf59aa",
    "app_private.football_mapping_supporting_dependency(text,uuid,uuid)": "f86e4e6cc17c59f444016b0ddacba9ff",
    "app_private.football_mapping_supporting_state(uuid)": "0ef7dfd0a98b3dda7015ea6fc47342c1",
}
NEW_ACL = {
    "api.admin_football_mapping_get_provider_mapping(text,text)": "{postgres=X/postgres,authenticated=X/postgres}",
    NEW_COMPUTE: "{postgres=X/postgres}",
    "app_private.football_mapping_supporting_dependency(text,uuid,uuid)": "{postgres=X/postgres}",
    "app_private.football_mapping_supporting_state(uuid)": "{postgres=X/postgres}",
}
NEW_COLUMNS = ["evidence_class:text:YES", "supporting_mapping_id:uuid:YES"]
CHECK_NAME = "football_player_mapping_proposals_supporting_check"
CHECK_DEF = (
    "CHECK ((((evidence_class IS NULL) = (supporting_mapping_id IS NULL)) AND ((evidence_class IS NULL) OR "
    "(evidence_class = ANY (ARRAY['F1_REVIEWED_SOFASCORE_EVENTS'::text, 'F2_REVIEWED_SOFASCORE_SHIRT_DOB'::text]))) "
    "AND ((((kind = 'map'::text) AND (flashscore_candidate_id IS NOT NULL) AND (sofascore_candidate_id IS NULL)) OR "
    "((kind = ANY (ARRAY['replace'::text, 'reactivate'::text])) AND (provider_name = 'flashscore'::text))) = "
    "(supporting_mapping_id IS NOT NULL))))"
)
INDEX_NAME = "football_player_mapping_proposals_supporting_idx"
INDEX_DEF = (
    "CREATE INDEX football_player_mapping_proposals_supporting_idx ON app_private.football_player_mapping_proposals "
    "USING btree (supporting_mapping_id) WHERE (supporting_mapping_id IS NOT NULL)"
)
HISTORY_AFTER_REVIEWED = (
    "20261002100000:football_mapping_single_approver_switch:1fb64a5c5a8a231715663e38159a826842bf00360a058492fce666eb032c904e,"
    "20261002110000:list_my_match_reminders:c0512530a5fc67fc3da8de7dd96b497d984f743b9e54c707446161958048fdf2"
)
NEW_HISTORY_ENTRY = f"20261003120000:football_mapping_supporting_dependency:{MIGRATION_SHA256}"

# What production must look like BEFORE (the reported baseline plus the reviewed schema).
EXPECT_BEFORE: dict[str, Any] = {
    "history_has_guard": 0,
    "latest_version": "20261002110000",
    "migrations_after_reviewed": HISTORY_AFTER_REVIEWED,
    "compute_signatures": OLD_COMPUTE,
    "guard_functions": 0,
    "guard_constraint": 0,
    "guard_index": 0,
    "new_column_use": 0,
    "mapping_rows": 1732,
    "sofascore_active": 191,
    "flashscore_mappings": 0,
    "proposals_by_status": {"executed": 191},
    "candidates": 1004,
    "observations": 1006,
    "single_operator_on": True,
    "manifest_candidates_unmapped": 53,
    "f_prop_cols": "c437688f64bbd739ef9347c81f83802b",
    "f_prop_cons": "cbc71b51c61c0ee783e7b9aedb9ee173",
    "f_map_cons": "533eb1ade4997c1d673f18de52657a6c",
    "f_prop_trig": "a7ab3a52b9ae4e86627714f1c79eb3f6",
    "f_map_trig": "0c3ff75c8fc8a11e33926894f78674b5",
    "f_prop_idx": "85d2a922d35f8203d2f4cf769d36858c",
    "f_rel": "b367fecc3c629694ee4ae37a8b691fe8",
    "f_fn_acl": "a0e4ed9734ab508b0e14cd9856e9a9ff",
    "busy_sessions": 0,
    "finalizing_gameweeks": 0,
    "lifecycle_tick_enabled": 0,
}

# ---------------------------------------------------------------------------------------------
# Snapshot: three jsonb objects joined with || (Postgres allows 50 pairs per jsonb_build_object).
# Every lookup works whether or not the migration is applied.
# ---------------------------------------------------------------------------------------------
_PROPOSALS = "'app_private.football_player_mapping_proposals'::regclass"
_MAPPINGS = "'app_private.football_provider_mappings'::regclass"

_SNAPSHOT_SCHEMA = f"""jsonb_build_object(
  'history_rows', (select count(*) from supabase_migrations.schema_migrations),
  'history_has_guard', (select count(*) from supabase_migrations.schema_migrations where version = '20261003120000'),
  'latest_version', (select max(version) from supabase_migrations.schema_migrations),
  'migrations_after_reviewed', (select string_agg(version || ':' || name || ':' || encode(sha256(convert_to(statements[1], 'UTF8')), 'hex'), ',' order by version) from supabase_migrations.schema_migrations where version > '20261001161000'),
  'compute_signatures', (select string_agg(p.oid::regprocedure::text, ' ; ' order by p.oid::regprocedure::text) from pg_proc p where p.proname ilike '%football_mapping_compute%'),
  'guard_functions', (select count(*) from pg_proc p where p.proname in ('football_mapping_supporting_state', 'football_mapping_supporting_dependency', 'admin_football_mapping_get_provider_mapping')),
  'function_md5', (select jsonb_object_agg(p.oid::regprocedure::text, md5(pg_get_functiondef(p.oid))) from pg_proc p where p.pronamespace in ('api'::regnamespace, 'app_private'::regnamespace) and p.proname like '%football_mapping%'),
  'function_acl', (select jsonb_object_agg(p.oid::regprocedure::text, coalesce(p.proacl::text, 'null')) from pg_proc p where p.pronamespace in ('api'::regnamespace, 'app_private'::regnamespace) and p.proname like '%football_mapping%'),
  'other_functions_digest', (select md5(string_agg(p.oid::regprocedure::text || ':' || md5(pg_get_functiondef(p.oid)) || ':' || coalesce(p.proacl::text, ''), '|' order by p.oid::regprocedure::text)) from pg_proc p where p.pronamespace in ('api'::regnamespace, 'app_private'::regnamespace) and p.proname not like '%football_mapping%'),
  'api_functions', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'api'),
  'private_functions', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app_private'),
  'proposal_columns', (select jsonb_agg(column_name || ':' || data_type || ':' || is_nullable order by ordinal_position) from information_schema.columns where table_schema = 'app_private' and table_name = 'football_player_mapping_proposals'),
  'proposal_constraints', (select jsonb_object_agg(conname, pg_get_constraintdef(oid)) from pg_catalog.pg_constraint where conrelid = {_PROPOSALS}),
  'proposal_indexes', (select jsonb_object_agg(indexname, indexdef) from pg_catalog.pg_indexes where schemaname = 'app_private' and tablename = 'football_player_mapping_proposals'),
  'proposal_triggers', (select jsonb_object_agg(tgname, pg_get_triggerdef(oid)) from pg_catalog.pg_trigger where tgrelid = {_PROPOSALS} and not tgisinternal),
  'mapping_constraints', (select jsonb_object_agg(conname, pg_get_constraintdef(oid)) from pg_catalog.pg_constraint where conrelid = {_MAPPINGS}),
  'mapping_triggers', (select jsonb_object_agg(tgname, pg_get_triggerdef(oid)) from pg_catalog.pg_trigger where tgrelid = {_MAPPINGS} and not tgisinternal),
  'mapping_indexes', (select jsonb_object_agg(indexname, indexdef) from pg_catalog.pg_indexes where schemaname = 'app_private' and tablename = 'football_provider_mappings'),
  'table_grants', (select jsonb_object_agg(c.relname, c.relacl::text || ':' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text) from pg_catalog.pg_class c where c.relnamespace = 'app_private'::regnamespace and c.relname in ('football_provider_mappings', 'football_player_mapping_proposals', 'football_player_mapping_candidates', 'football_player_mapping_observations', 'football_mapping_settings')),
  'guard_constraint', (select count(*) from pg_constraint where conname = '{CHECK_NAME}'),
  'guard_index', (select count(*) from pg_class where relname = '{INDEX_NAME}'),
  'new_column_use', (select count(*) from app_private.football_player_mapping_proposals p where (to_jsonb(p) ->> 'evidence_class') is not null or (to_jsonb(p) ->> 'supporting_mapping_id') is not null)
)"""

# The eight fragments below exclude everything this migration adds, so they must be equal before
# and after (the structural maps above state the exact additions).
_SNAPSHOT_FRAGMENTS = f"""jsonb_build_object(
  'f_prop_cols', (select md5(string_agg(column_name || ':' || data_type || ':' || is_nullable, '|' order by ordinal_position)) from information_schema.columns where table_schema = 'app_private' and table_name = 'football_player_mapping_proposals' and column_name not in ('evidence_class', 'supporting_mapping_id')),
  'f_prop_cons', (select md5(string_agg(conname || '=' || pg_get_constraintdef(oid), '|' order by conname)) from pg_catalog.pg_constraint where conrelid = {_PROPOSALS} and conname <> '{CHECK_NAME}'),
  'f_map_cons', (select md5(string_agg(conname || '=' || pg_get_constraintdef(oid), '|' order by conname)) from pg_catalog.pg_constraint where conrelid = {_MAPPINGS}),
  'f_prop_trig', (select md5(string_agg(tgname || '=' || pg_get_triggerdef(oid), '|' order by tgname)) from pg_catalog.pg_trigger where tgrelid = {_PROPOSALS} and not tgisinternal),
  'f_map_trig', (select md5(string_agg(tgname || '=' || pg_get_triggerdef(oid), '|' order by tgname)) from pg_catalog.pg_trigger where tgrelid = {_MAPPINGS} and not tgisinternal),
  'f_prop_idx', (select md5(string_agg(indexname || '=' || indexdef, '|' order by indexname)) from pg_catalog.pg_indexes where schemaname = 'app_private' and tablename = 'football_player_mapping_proposals' and indexname <> '{INDEX_NAME}'),
  'f_rel', (select md5(string_agg(c.relname || ':' || coalesce(c.relacl::text, '') || ':' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text, '|' order by c.relname)) from pg_catalog.pg_class c where c.relnamespace = 'app_private'::regnamespace and c.relname in ('football_provider_mappings', 'football_player_mapping_proposals', 'football_player_mapping_candidates', 'football_player_mapping_observations', 'football_mapping_settings')),
  'f_fn_acl', (select md5(string_agg(p.oid::regprocedure::text || ':' || coalesce(p.proacl::text, 'null'), '|' order by p.oid::regprocedure::text)) from pg_catalog.pg_proc p where p.pronamespace in ('api'::regnamespace, 'app_private'::regnamespace) and p.proname like '%football_mapping%' and p.proname not in ('football_mapping_compute', 'football_mapping_supporting_state', 'football_mapping_supporting_dependency', 'admin_football_mapping_get_provider_mapping'))
)"""


def _business_sql(candidate_ids: list[str]) -> str:
    ids = ", ".join(f"'{c}'" for c in candidate_ids)
    return f"""jsonb_build_object(
  'mapping_rows', (select count(*) from app_private.football_provider_mappings),
  'mapping_digest', (select md5(coalesce(string_agg(m::text, '|' order by m.id), '')) from app_private.football_provider_mappings m),
  'sofascore_active', (select count(*) from app_private.football_provider_mappings where provider_name = 'sofascore' and active),
  'flashscore_mappings', (select count(*) from app_private.football_provider_mappings where provider_name = 'flashscore'),
  'proposals_by_status', (select coalesce(jsonb_object_agg(status, c), '{{}}'::jsonb) from (select status, count(*) c from app_private.football_player_mapping_proposals group by 1) s),
  'proposal_digest', (select md5(coalesce(string_agg((to_jsonb(p) - 'evidence_class' - 'supporting_mapping_id')::text, '|' order by p.id), '')) from app_private.football_player_mapping_proposals p),
  'candidates', (select count(*) from app_private.football_player_mapping_candidates),
  'candidate_digest', (select md5(coalesce(string_agg(c::text, '|' order by c.id), '')) from app_private.football_player_mapping_candidates c),
  'observations', (select count(*) from app_private.football_player_mapping_observations),
  'observation_digest', (select md5(coalesce(string_agg(o::text, '|' order by o.id), '')) from app_private.football_player_mapping_observations o),
  'manifest_candidates_unmapped', (select count(*) from app_private.football_player_mapping_candidates c where c.id in ({ids}) and c.provider_name = 'flashscore' and c.status = 'unmapped' and c.existing_mapping_id is null),
  'single_operator_on', (select allow_self_approval from app_private.football_mapping_settings where singleton),
  'settings_digest', (select md5(coalesce(string_agg(s::text, '|'), '')) from app_private.football_mapping_settings s),
  'permissions_digest', (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app_private.admin_permissions t),
  'roles_digest', (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app_private.admin_roles t),
  'principals_digest', (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app_private.staff_principals t),
  'assignments_digest', (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app_private.staff_role_assignments t),
  'role_permissions_digest', (select md5(coalesce(string_agg(t::text, '|'), '')) from app_private.admin_role_permissions t),
  'players_digest', (select md5(coalesce(string_agg(p::text, '|' order by p.id), '')) from app.players p),
  'memberships_digest', (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app.team_memberships t),
  'cron_jobs', (select count(*) from cron.job),
  'cron_digest', (select md5(coalesce(string_agg(jobid::text || ':' || schedule || ':' || command || ':' || active::text, '|' order by jobid), '')) from cron.job),
  'automation_digest', (select md5(coalesce(string_agg(t::text, '|'), '')) from app_private.fantasy_automation_settings t),
  'audit_events', (select count(*) from app_private.admin_audit_events),
  'idempotency_keys', (select count(*) from app_private.admin_idempotency_keys),
  'fantasy_table_counts', (select jsonb_object_agg(t.relname, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', 'app', t.relname), false, true, '')))[1]::text::bigint) from pg_class t where t.relnamespace = 'app'::regnamespace and t.relkind = 'r' and t.relname like 'fantasy%'),
  'gameweek_digest', (select md5(coalesce(string_agg(g::text, '|' order by g.id), '')) from app.fantasy_gameweeks g),
  'busy_sessions', (select count(*) from pg_stat_activity where backend_type = 'client backend' and pid <> pg_backend_pid() and state in ('active','idle in transaction','idle in transaction (aborted)')),
  'finalizing_gameweeks', (select count(*) from app.fantasy_gameweeks where status = 'finalizing'),
  'lifecycle_tick_enabled', (select count(*) from app_private.fantasy_automation_settings where lifecycle_tick_enabled)
)"""


def snapshot_sql(candidate_ids: list[str]) -> str:
    return (
        f"select (({_SNAPSHOT_SCHEMA}) || ({_SNAPSHOT_FRAGMENTS}) || ({_business_sql(candidate_ids)})) as snapshot"
    )


def post_checks_sql(rows: list[dict[str, Any]], reasons: dict[str, str]) -> str:
    """A read-only SELECT (valid only AFTER the migration): the 42 server fingerprints, the 191
    provenance reads and the grants, all through the migrated functions."""
    rows_json = json.dumps(rows, separators=(",", ":"), ensure_ascii=False)
    reasons_json = json.dumps(reasons, separators=(",", ":"), ensure_ascii=False)
    for token in ("$rows42$", "$reasons42$"):
        if token in rows_json or token in reasons_json:
            raise ApplyError("manifest text contains a dollar-quote tag")
    return f"""
with m as (
  select * from jsonb_to_recordset($rows42${rows_json}$rows42$::jsonb)
    as x(c uuid, x text, p uuid, b text, k text, s uuid, se text, sd text, sp uuid, r jsonb, f text)
), comp as (
  select m.*, app_private.football_mapping_compute('map', null, m.c, null, null, m.p, null, null, null, m.k, m.s, m.r) as v from m
), got as (
  select comp.c, comp.f, comp.v,
    app_private.football_mapping_row_fingerprint(jsonb_populate_record(
      null::app_private.football_player_mapping_proposals,
      jsonb_build_object('kind', 'map', 'flashscore_candidate_id', comp.c,
        'sofascore_external_id', comp.v ->> 'sofascoreExternalId', 'flashscore_external_id', comp.v ->> 'flashscoreExternalId',
        'provider_name', comp.v ->> 'providerName', 'app_player_id', comp.p,
        'expected_before', nullif(comp.v -> 'expectedBefore', 'null'::jsonb), 'basis', comp.b,
        'evidence', (comp.v -> 'evidence') || jsonb_build_object('refs', comp.r),
        'signals', comp.v -> 'signals', 'candidate_revisions', comp.v -> 'candidateRevisions',
        'position_disagreement', (comp.v ->> 'positionDisagreement')::boolean,
        'reason', ($reasons42${reasons_json}$reasons42$::jsonb) ->> comp.k,
        'evidence_class', comp.k, 'supporting_mapping_id', comp.s))) as fp
  from comp where (comp.v ->> 'ok')::boolean
), sup as (
  select m.c, app_private.football_mapping_supporting_state(m.s) as st from m
)
select jsonb_build_object(
  'fingerprint_rows', (select count(*) from m),
  'fingerprints_matching', (select count(*) from got where got.fp = got.f),
  'fingerprints_not_matching', (select coalesce(jsonb_agg(m.c order by m.c), '[]'::jsonb) from m left join got on got.c = m.c where got.fp is distinct from m.f),
  'supporting_expected_state', (select count(*) from sup join m on m.c = sup.c where sup.st ->> 'provider' = 'sofascore' and sup.st ->> 'externalId' = m.se and (sup.st ->> 'appPlayerId')::uuid = m.p and (sup.st ->> 'active')::boolean and (sup.st ->> 'reviewed')::boolean and (sup.st ->> 'provenanceProposalId')::uuid = m.sp and sup.st ->> 'stateDigest' = m.sd),
  'sofascore_active', (select count(*) from app_private.football_provider_mappings where provider_name = 'sofascore' and active),
  'sofascore_reviewed', (select count(*) from app_private.football_provider_mappings mm where mm.provider_name = 'sofascore' and mm.active and coalesce((app_private.football_mapping_supporting_state(mm.id) ->> 'reviewed')::boolean, false)),
  'grants', jsonb_build_object(
    'read_anon', has_function_privilege('anon', 'api.admin_football_mapping_get_provider_mapping(text,text)', 'execute'),
    'read_authenticated', has_function_privilege('authenticated', 'api.admin_football_mapping_get_provider_mapping(text,text)', 'execute'),
    'read_service_role', has_function_privilege('service_role', 'api.admin_football_mapping_get_provider_mapping(text,text)', 'execute'),
    'state_anon', has_function_privilege('anon', 'app_private.football_mapping_supporting_state(uuid)', 'execute'),
    'state_authenticated', has_function_privilege('authenticated', 'app_private.football_mapping_supporting_state(uuid)', 'execute'),
    'state_service_role', has_function_privilege('service_role', 'app_private.football_mapping_supporting_state(uuid)', 'execute'),
    'dependency_authenticated', has_function_privilege('authenticated', 'app_private.football_mapping_supporting_dependency(text,uuid,uuid)', 'execute'),
    'dependency_service_role', has_function_privilege('service_role', 'app_private.football_mapping_supporting_dependency(text,uuid,uuid)', 'execute'),
    'compute_anon', has_function_privilege('anon', '{NEW_COMPUTE}', 'execute'),
    'compute_authenticated', has_function_privilege('authenticated', '{NEW_COMPUTE}', 'execute'),
    'compute_service_role', has_function_privilege('service_role', '{NEW_COMPUTE}', 'execute'),
    'tables_authenticated', has_table_privilege('authenticated', 'app_private.football_provider_mappings', 'select,insert,update,delete')
      or has_table_privilege('authenticated', 'app_private.football_player_mapping_proposals', 'select,insert,update,delete'),
    'tables_anon', has_table_privilege('anon', 'app_private.football_provider_mappings', 'select,insert,update,delete')
      or has_table_privilege('anon', 'app_private.football_player_mapping_proposals', 'select,insert,update,delete')
  )
) as checks
"""


EXPECT_GRANTS = {
    "read_anon": False, "read_authenticated": True, "read_service_role": False,
    "state_anon": False, "state_authenticated": False, "state_service_role": False,
    "dependency_authenticated": False, "dependency_service_role": False,
    "compute_anon": False, "compute_authenticated": False, "compute_service_role": False,
    "tables_authenticated": False, "tables_anon": False,
}

# ---------------------------------------------------------------------------------------------
# Classification of every snapshot key.
#   CHANGED   an expected change: checked against the exact reviewed post-state (verify_post)
#   PROTECTED must equal the pre-state
#   LIVE      a live read (a session count), never compared
# ---------------------------------------------------------------------------------------------
CHANGED_KEYS = {
    "history_rows", "history_has_guard", "latest_version", "migrations_after_reviewed", "compute_signatures",
    "guard_functions", "function_md5", "function_acl", "api_functions", "private_functions", "proposal_columns",
    "proposal_constraints", "proposal_indexes", "guard_constraint", "guard_index",
}
LIVE_KEYS = {"busy_sessions", "finalizing_gameweeks", "lifecycle_tick_enabled"}
PROTECTED_KEYS = {
    "other_functions_digest", "proposal_triggers", "mapping_constraints", "mapping_triggers", "mapping_indexes",
    "table_grants", "new_column_use", "f_prop_cols", "f_prop_cons", "f_map_cons", "f_prop_trig", "f_map_trig",
    "f_prop_idx", "f_rel", "f_fn_acl", "mapping_rows", "mapping_digest", "sofascore_active", "flashscore_mappings",
    "proposals_by_status", "proposal_digest", "candidates", "candidate_digest", "observations", "observation_digest",
    "manifest_candidates_unmapped", "single_operator_on", "settings_digest", "permissions_digest", "roles_digest",
    "principals_digest", "assignments_digest", "role_permissions_digest", "players_digest", "memberships_digest",
    "cron_jobs", "cron_digest", "automation_digest", "audit_events", "idempotency_keys", "fantasy_table_counts",
    "gameweek_digest",
}


class ApplyError(Exception):
    pass


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def redact(text: str, token: str) -> str:
    return text.replace(token, "***") if token else text


def canonical_json(value: Any) -> str:
    """The manifest builder's algorithm: keys sorted, no whitespace."""
    if isinstance(value, dict):
        return "{" + ",".join(
            json.dumps(k, ensure_ascii=False) + ":" + canonical_json(v) for k, v in sorted(value.items())) + "}"
    if isinstance(value, list):
        return "[" + ",".join(canonical_json(v) for v in value) + "]"
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def verify_manifest(raw: bytes) -> dict[str, Any]:
    """Two different checks: the file bytes, and the canonical hash of its content."""
    if sha256_bytes(raw) != MANIFEST_FILE_SHA256:
        raise ApplyError("the manifest file bytes are not the reviewed ones (file sha256 mismatch)")
    manifest = json.loads(raw.decode("utf-8"))
    claimed = manifest.pop("manifestSha256", None)
    if claimed != MANIFEST_CANONICAL_SHA256 or sha256_bytes(canonical_json(manifest).encode("utf-8")) != claimed:
        raise ApplyError("the manifest content does not match its canonical hash")
    manifest["manifestSha256"] = claimed
    return manifest


def manifest_inputs(manifest: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, str], list[str]]:
    rows = []
    for r in manifest["rows"]:
        fi, s = r["fingerprintInputs"], r["supporting"]
        rows.append({"c": r["candidateId"], "x": r["externalId"], "p": r["appPlayerId"], "b": fi["basis"],
                     "k": r["evidenceClass"], "s": s["mappingId"], "se": s["externalId"], "sd": s["stateDigest"],
                     "sp": s["provenanceProposalId"], "r": fi["evidence"]["refs"], "f": r["expectedFingerprint"]})
    rows.sort(key=lambda z: z["c"])
    reasons = {k: manifest["reasons"][k] for k in ("F1_REVIEWED_SOFASCORE_EVENTS", "F2_REVIEWED_SOFASCORE_SHIRT_DOB")}
    held = sorted(h["candidateId"] for h in manifest["heldBack"])
    uuid = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
    if len(rows) != 42 or len(held) != 11 or not all(uuid.match(i) for i in [r["c"] for r in rows] + held):
        raise ApplyError("the manifest is not 42 rows and 11 held rows with well-formed ids")
    if set(held) & {r["c"] for r in rows}:
        raise ApplyError("a held row is in the batch")
    return rows, reasons, sorted([r["c"] for r in rows] + held)


def build_commit_payload(wrapper_bytes: bytes) -> str:
    """The reviewed wrapper with ONE line changed: its single top-level `rollback;` becomes `commit;`.
    Nothing is replaced inside comments, function bodies or ON COMMIT clauses: only a line that is
    exactly `rollback;` is touched, and there must be exactly one."""
    if sha256_bytes(wrapper_bytes) != WRAPPER_SHA256:
        raise ApplyError("the wrapper is not the reviewed file (sha256 mismatch)")
    lines = wrapper_bytes.decode("utf-8").split("\n")
    hits = [i for i, line in enumerate(lines) if line == "rollback;"]
    # (A PL/pgSQL `end;` inside a function body is not a transaction statement and is never touched.)
    stray = [i for i, line in enumerate(lines) if re.fullmatch(r"\s*(commit|rollback|abort)\s*;\s*", line, re.I)]
    if len(hits) != 1 or stray != hits:
        raise ApplyError("the wrapper must contain exactly one transaction-ending line, and it must be `rollback;`")
    lines[hits[0]] = "commit;"
    payload = "\n".join(lines)
    if sha256_bytes(payload.encode("utf-8")) != COMMIT_PAYLOAD_SHA256:
        raise ApplyError("the commit payload does not match its pinned sha256")
    return payload


# ---------------------------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------------------------
def check_pre(before: dict[str, Any], expect: dict[str, Any] | None = None) -> list[str]:
    """Why production is not in the reviewed pre-state (empty: it is)."""
    expect = EXPECT_BEFORE if expect is None else expect
    problems = [f"{k}: expected {v!r}, found {before.get(k)!r}" for k, v in expect.items() if before.get(k) != v]
    md5 = before.get("function_md5") or {}
    for sig, want in {**OLD_MD5, RESOLVER: RESOLVER_MD5}.items():
        if md5.get(sig) != want:
            problems.append(f"function {sig}: not the reviewed text")
    if any(sig in md5 for sig in (NEW_COMPUTE, "api.admin_football_mapping_get_provider_mapping(text,text)")):
        problems.append("a function of this migration already exists")
    return problems


def expected_after(before: dict[str, Any]) -> dict[str, Any]:
    """The exact reviewed post-state of the keys that are meant to change."""
    md5 = dict(before["function_md5"])
    md5.pop(OLD_COMPUTE, None)
    md5.update(NEW_MD5)
    acl = dict(before["function_acl"])
    acl.pop(OLD_COMPUTE, None)
    acl.update(NEW_ACL)
    constraints = dict(before["proposal_constraints"])
    constraints[CHECK_NAME] = CHECK_DEF
    indexes = dict(before["proposal_indexes"])
    indexes[INDEX_NAME] = INDEX_DEF
    return {
        "history_rows": before["history_rows"] + 1,
        "history_has_guard": 1,
        "latest_version": "20261003120000",
        "migrations_after_reviewed": before["migrations_after_reviewed"] + "," + NEW_HISTORY_ENTRY,
        "compute_signatures": NEW_COMPUTE,
        "guard_functions": 3,
        "function_md5": md5,
        "function_acl": acl,
        "api_functions": before["api_functions"] + 1,
        "private_functions": before["private_functions"] + 2,
        "proposal_columns": list(before["proposal_columns"]) + NEW_COLUMNS,
        "proposal_constraints": constraints,
        "proposal_indexes": indexes,
        "guard_constraint": 1,
        "guard_index": 1,
    }


def verify_post(before: dict[str, Any], after: dict[str, Any]) -> list[str]:
    """A: the exact allowed changes. B: everything protected is unchanged. Anything else is a failure."""
    problems: list[str] = []
    classified = CHANGED_KEYS | PROTECTED_KEYS | LIVE_KEYS
    for key in sorted(set(after) | set(before)):
        if key not in classified:
            problems.append(f"{key}: an unclassified snapshot key")
    want = expected_after(before)
    for key in sorted(CHANGED_KEYS):
        if after.get(key) != want[key]:
            problems.append(_describe(key, want[key], after.get(key)))
    for key in sorted(PROTECTED_KEYS):
        if after.get(key) != before.get(key):
            problems.append(f"{key}: protected state changed ({before.get(key)!r} -> {after.get(key)!r})")
    return problems


def _describe(key: str, want: Any, got: Any) -> str:
    if isinstance(want, dict) and isinstance(got, dict):
        extra = sorted(set(got) - set(want))
        missing = sorted(set(want) - set(got))
        different = sorted(k for k in set(want) & set(got) if want[k] != got[k])
        return f"{key}: unexpected {extra}, missing {missing}, different {different}"
    return f"{key}: expected {want!r}, got {got!r}"


def verify_post_checks(checks: dict[str, Any], after: dict[str, Any]) -> list[str]:
    problems = []
    if checks.get("fingerprint_rows") != 42 or checks.get("fingerprints_matching") != 42:
        problems.append(
            f"manifest fingerprints: {checks.get('fingerprints_matching')}/{checks.get('fingerprint_rows')} match "
            f"(not matching: {checks.get('fingerprints_not_matching')})")
    if checks.get("supporting_expected_state") != 42:
        problems.append(f"supporting mappings in the expected state: {checks.get('supporting_expected_state')}/42")
    if checks.get("sofascore_reviewed") != checks.get("sofascore_active") or checks.get("sofascore_active") != after.get("sofascore_active"):
        problems.append(
            f"Sofascore provenance: {checks.get('sofascore_reviewed')} reviewed of {checks.get('sofascore_active')} active")
    if checks.get("grants") != EXPECT_GRANTS:
        problems.append(f"grants: {checks.get('grants')!r}")
    return problems


def same_state(before: dict[str, Any], after: dict[str, Any]) -> bool:
    return all(before.get(k) == after.get(k) for k in sorted(CHANGED_KEYS | PROTECTED_KEYS))


# ---------------------------------------------------------------------------------------------
# Transport
# ---------------------------------------------------------------------------------------------
def post(token: str, sql: str, read_only: bool, timeout: int) -> tuple[int | None, str, str]:
    """Returns (http_status, body, failure_kind); failure_kind is '' on a normal HTTP answer."""
    request = urllib.request.Request(
        f"{API}/v1/projects/{PROJECT_REF}/database/query",
        data=json.dumps({"query": sql, "read_only": read_only}).encode("utf-8"),
        method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                 "User-Agent": "BotolaGO-SupportingDependencyApply/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8", "replace"), ""
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace"), ""
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return None, redact(str(exc), token), "transport"


def classify_response(status: int | None, body: str, kind: str) -> str:
    """What kind of answer this was, from the evidence in it; never from its absence."""
    if kind == "transport":
        return "transport_error_no_answer"
    if status in (200, 201):
        return "completed"
    lowered = body.lower()
    if "57014" in body or "statement timeout" in lowered or "canceling statement" in lowered:
        return "database_statement_timeout"
    if "55p03" in lowered or "lock timeout" in lowered or "could not obtain lock" in lowered:
        return "database_lock_timeout"
    if status in (401, 403):
        return "api_refused_authorisation"
    if status is not None and (status in (408, 502, 503, 504) or status >= 500):
        return "gateway_timeout_or_unavailable"
    if "stop:" in body:
        return "script_stop_guard"
    return "database_error_other"


QueryFn = Callable[[str, bool], Any]
SendFn = Callable[[str], tuple[int | None, str, str]]


def read_snapshot(query: QueryFn, sql: str, attempts: int = 3, pause: float = 4.0) -> dict[str, Any]:
    """Reads are repeatable (only the apply is not): a read that fails on the network is retried."""
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            value = query(sql, True)[0]["snapshot"]
            return value if isinstance(value, dict) else json.loads(value)
        except (ApplyError, ValueError, KeyError, IndexError, TypeError) as exc:
            last = exc
            if attempt + 1 < attempts:
                time.sleep(pause)
    raise ApplyError(f"snapshot_failed: {last}")


def read_checks(query: QueryFn, sql: str, attempts: int = 3, pause: float = 4.0) -> dict[str, Any]:
    """The post-commit verification read is repeatable too: a transient failure must not turn a good commit
    into a review (the one-shot workflow cannot simply be run again once the migration exists)."""
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            value = query(sql, True)[0]["checks"]
            return value if isinstance(value, dict) else json.loads(value)
        except (ApplyError, ValueError, KeyError, IndexError, TypeError) as exc:
            last = exc
            if attempt + 1 < attempts:
                time.sleep(pause)
    raise ApplyError(f"post-commit checks failed after {attempts} reads: {last}")


# An answer that does not say what happened to the transaction: the request may still be running in the
# database after the client stopped waiting. (A database error, a statement or lock timeout, and a refused
# authorisation are definitive: the transaction did not commit.)
AMBIGUOUS_RESPONSES = {"transport_error_no_answer", "gateway_timeout_or_unavailable"}
SETTLE_POLLS = 8
SETTLE_PAUSE = 15.0


def settle(query: QueryFn, snap_sql: str, after: dict[str, Any], pause: float) -> tuple[dict[str, Any], bool]:
    """After an ambiguous answer an unchanged snapshot does not prove a rollback: the apply may still be
    running and commit later. Keep reading until the migration is recorded, or no other session has been
    working on two consecutive reads while production still equals the pre-state. Returns (snapshot, settled)."""
    quiet = 0
    for poll in range(SETTLE_POLLS):
        if after.get("history_has_guard") == 1:
            return after, True
        quiet = quiet + 1 if after.get("busy_sessions") == 0 else 0
        if quiet >= 2:
            return after, True
        time.sleep(pause)
        after = read_snapshot(query, snap_sql, pause=pause)
    return after, after.get("history_has_guard") == 1


def decide(
    query: QueryFn,
    send: SendFn,
    payload: str,
    snap_sql: str,
    checks_sql: str,
    expect_before: dict[str, Any] | None = None,
    pause: float = 4.0,
) -> tuple[str, dict[str, Any]]:
    """The whole flow, with injected transport so every outcome can be tested.
    Returns (outcome, evidence). The apply is sent AT MOST ONCE."""
    evidence: dict[str, Any] = {"warnings": []}
    try:
        before = read_snapshot(query, snap_sql, pause=pause)
    except ApplyError as exc:
        evidence["error"] = str(exc)
        return OUT_BLOCKED, evidence  # nothing was sent
    evidence["before"] = before
    drift = check_pre(before, expect_before)
    if drift:
        evidence["pre_state_problems"] = drift
        return OUT_BLOCKED, evidence

    # ---- the one and only apply; never retried ------------------------------------------------
    status, body, kind = send(payload)
    response = classify_response(status, body, kind)
    evidence.update({"http_status": status, "response_class": response, "response_text": body[:1500]})

    try:
        after = read_snapshot(query, snap_sql, pause=pause)
    except ApplyError as exc:
        evidence["after_read_error"] = str(exc)
        return OUT_UNVERIFIED, evidence
    if response in AMBIGUOUS_RESPONSES and after.get("history_has_guard") == 0:
        try:
            after, settled = settle(query, snap_sql, after, SETTLE_PAUSE if pause else 0)
        except ApplyError as exc:
            evidence["after_read_error"] = str(exc)
            return OUT_UNVERIFIED, evidence
        evidence["settled_after_ambiguous_response"] = settled
        if not settled:
            evidence["after"] = after
            evidence["problems"] = ["the apply request may still be running in the database"]
            return OUT_UNVERIFIED, evidence
    evidence["after"] = after

    if after.get("history_has_guard") == 1:
        problems = verify_post(before, after)
        try:
            checks = read_checks(query, checks_sql, pause=pause)
            evidence["post_checks"] = checks
            problems += verify_post_checks(checks, after)
        except (ApplyError, ValueError, KeyError, IndexError, TypeError) as exc:
            problems.append(f"post-commit checks could not be read: {exc}")
        evidence["problems"] = problems
        if problems:
            return OUT_REVIEW, evidence
        if response != "completed" or "Applied." not in body:
            evidence["warnings"].append(
                f"the response was not a normal success ({response}); the committed state was verified independently")
        return OUT_OK, evidence

    if after.get("history_has_guard") == 0 and same_state(before, after):
        if response == "completed" and "Applied." in body:
            evidence["warnings"].append("the response reported Applied but production equals the pre-state")
            return OUT_UNVERIFIED, evidence
        return OUT_FAILED, evidence
    evidence["problems"] = ["production is in neither the pre-state nor the post-state"]
    return OUT_UNVERIFIED, evidence


def main() -> int:
    repo = Path(os.environ.get("GITHUB_WORKSPACE", ".")).resolve()
    evidence_dir = Path(os.environ.get("EVIDENCE_DIR", repo / "evidence"))
    evidence_dir.mkdir(parents=True, exist_ok=True)
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
    if not token:
        raise ApplyError("missing SUPABASE_ACCESS_TOKEN")
    if os.environ.get("SUPABASE_PRODUCTION_PROJECT_REF") != PROJECT_REF or PROJECT_REF == STAGING_REF:
        raise ApplyError("production project-ref guard failed")
    if sha256_bytes((repo / MIGRATION).read_bytes()) != MIGRATION_SHA256:
        raise ApplyError(f"{MIGRATION} is not the reviewed migration (sha256 mismatch)")
    wrapper_bytes = (repo / WRAPPER).read_bytes()
    if "$bg_20261003120000_file$" not in wrapper_bytes.decode("utf-8") or (repo / MIGRATION).read_text(encoding="utf-8") not in wrapper_bytes.decode("utf-8"):
        raise ApplyError("the wrapper does not embed the reviewed migration bytes")
    payload = build_commit_payload(wrapper_bytes)
    manifest = verify_manifest((repo / MANIFEST).read_bytes())
    rows, reasons, candidate_ids = manifest_inputs(manifest)
    print("Inputs verified: migration, wrapper, commit payload (one line differs: rollback; -> commit;), manifest "
          "(file bytes and canonical hash).")

    def query(sql: str, read_only: bool) -> Any:
        status, body, kind = post(token, sql, read_only, 90)
        if kind or status not in (200, 201):
            raise ApplyError(f"{classify_response(status, body, kind)}: HTTP {status}: {redact(body[:300], token)}")
        return json.loads(body)

    def send(sql: str) -> tuple[int | None, str, str]:
        status, body, kind = post(token, sql, False, 115)
        return status, redact(body, token), kind

    outcome, evidence = decide(
        query, send, payload, snapshot_sql(candidate_ids), post_checks_sql(rows, reasons))
    evidence.update({
        "outcome": outcome, "migration_sha256": MIGRATION_SHA256, "wrapper_sha256": WRAPPER_SHA256,
        "commit_payload_sha256": COMMIT_PAYLOAD_SHA256, "manifest_file_sha256": MANIFEST_FILE_SHA256,
        "manifest_canonical_sha256": MANIFEST_CANONICAL_SHA256,
    })
    (evidence_dir / "supporting-dependency-apply-evidence.json").write_text(
        json.dumps(evidence, indent=2, sort_keys=True, default=str), encoding="utf-8")
    for line in evidence.get("pre_state_problems", []) + evidence.get("problems", []):
        print(" -", line)
    for warning in evidence.get("warnings", []):
        print("WARNING:", warning)
    print(f"Response: HTTP {evidence.get('http_status')} ({evidence.get('response_class')})")
    print(outcome)
    return EXIT_CODES[outcome]


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ApplyError as exc:
        print(f"{OUT_BLOCKED}: {exc}")
        sys.exit(EXIT_CODES[OUT_BLOCKED])
