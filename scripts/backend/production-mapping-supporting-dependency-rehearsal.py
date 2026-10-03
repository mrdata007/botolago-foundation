#!/usr/bin/env python3
"""Run the reviewed supporting-dependency guard script against Production V2 as a REHEARSAL.

The script is run exactly as it is in the repository: its final `rollback;` is
unchanged and nothing is saved. This runner only
  * refuses to run unless the script, its migration, the version-2 manifest and the
    target project are the reviewed ones, the script still ends in `rollback;` (it
    never contains an active `commit;`), and it contains no CASCADE, no rename of a
    function, no trigger or event-trigger switch-off, and exactly one DROP FUNCTION,
  * reads a snapshot of production before and after (read-only queries),
  * sends the whole script in ONE request, never retries, and
  * fails unless the script's own result row says "Rehearsal passed" and the
    snapshot after is identical to the snapshot before.

It cannot commit: there is no code path here that edits the script, and no
names or personal data are read. A request that times out is NOT taken as proof
of anything: the after-read decides, and the evidence records which kind of
failure it was (transport, database, or refused by the API).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

PROJECT_REF = "tkewgajrljbwgwedqsxn"
STAGING_REF = "srdrflfrfpwixsllveid"
API = "https://api.supabase.com"
SCRIPT = "scripts/backend/apply-20261003120000-mapping-supporting-dependency.sql"
SCRIPT_SHA256 = "920cd532be40299f85e99656d1ba75c0f451ec63f5b4547961a1d827f68340c4"
MIGRATION = "supabase/migrations/20261003120000_football_mapping_supporting_dependency.sql"
MIGRATION_SHA256 = "d435bde5d9ca114a17f94786178b1f4261ff3b8e8c65f8d8f8fcbd70baa18577"
MANIFEST = "docs/production/manifests/gw1-flashscore-executable.v2.manifest.json"
MANIFEST_FILE_SHA256 = "c5a335ec20755534acb3ac75c9dbc4ae8e35df1d4919dcebdefd63ae3dc88c50"
MANIFEST_IDENTITY_SHA256 = "f2eef95dd199244ca6c48e9a2e0595a39a6bc2e534e7455a41467c7dba17a286"

SNAPSHOT_SQL = """
select jsonb_build_object(
  'history_rows', (select count(*) from supabase_migrations.schema_migrations),
  'history_has_guard', (select count(*) from supabase_migrations.schema_migrations where version = '20261003120000'),
  'latest_version', (select max(version) from supabase_migrations.schema_migrations),
  'migrations_after_reviewed', (select string_agg(version || ':' || name || ':' || encode(sha256(convert_to(statements[1], 'UTF8')), 'hex'), ',' order by version) from supabase_migrations.schema_migrations where version > '20261001161000'),
  'compute_signatures', (select string_agg(p.oid::regprocedure::text, ' ; ' order by p.oid::regprocedure::text) from pg_proc p where p.proname ilike '%football_mapping_compute%'),
  'guard_functions', (select count(*) from pg_proc p where p.proname in ('football_mapping_supporting_state', 'football_mapping_supporting_dependency', 'admin_football_mapping_get_provider_mapping')),
  'guard_columns', (select count(*) from pg_attribute where attrelid = 'app_private.football_player_mapping_proposals'::regclass and attname in ('evidence_class', 'supporting_mapping_id') and not attisdropped),
  'guard_constraint', (select count(*) from pg_constraint where conname = 'football_player_mapping_proposals_supporting_check'),
  'guard_index', (select count(*) from pg_class where relname = 'football_player_mapping_proposals_supporting_idx'),
  'compute_md5', (select md5(pg_get_functiondef('app_private.football_mapping_compute(text,uuid,uuid,text,uuid,uuid,text,uuid,uuid)'::regprocedure))),
  'propose_md5', (select md5(pg_get_functiondef('api.admin_football_mapping_propose(jsonb,text,uuid)'::regprocedure))),
  'revalidate_md5', (select md5(pg_get_functiondef('app_private.football_mapping_revalidate(uuid)'::regprocedure))),
  'refresh_md5', (select md5(pg_get_functiondef('api.admin_football_mapping_refresh_evidence(uuid,uuid)'::regprocedure))),
  'execute_md5', (select md5(pg_get_functiondef('api.admin_football_mapping_execute(uuid,uuid)'::regprocedure))),
  'guard_trigger_fn_md5', (select md5(pg_get_functiondef('app_private.football_mapping_proposal_guard()'::regprocedure))),
  'resolver_md5', (select md5(pg_get_functiondef('api.resolve_football_mapping(text,text,text,uuid,text,timestamp with time zone)'::regprocedure))),
  'api_functions', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'api'),
  'private_functions', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app_private'),
  'f_prop_cols', (select md5(string_agg(column_name || ':' || data_type || ':' || is_nullable, '|' order by ordinal_position)) from information_schema.columns where table_schema = 'app_private' and table_name = 'football_player_mapping_proposals' and column_name not in ('evidence_class', 'supporting_mapping_id')),
  'f_prop_cons', (select md5(string_agg(conname || '=' || pg_get_constraintdef(oid), '|' order by conname)) from pg_catalog.pg_constraint where conrelid = 'app_private.football_player_mapping_proposals'::regclass and conname <> 'football_player_mapping_proposals_supporting_check'),
  'f_map_cons', (select md5(string_agg(conname || '=' || pg_get_constraintdef(oid), '|' order by conname)) from pg_catalog.pg_constraint where conrelid = 'app_private.football_provider_mappings'::regclass),
  'f_prop_trig', (select md5(string_agg(tgname || '=' || pg_get_triggerdef(oid), '|' order by tgname)) from pg_catalog.pg_trigger where tgrelid = 'app_private.football_player_mapping_proposals'::regclass and not tgisinternal),
  'f_map_trig', (select md5(string_agg(tgname || '=' || pg_get_triggerdef(oid), '|' order by tgname)) from pg_catalog.pg_trigger where tgrelid = 'app_private.football_provider_mappings'::regclass and not tgisinternal),
  'f_prop_idx', (select md5(string_agg(indexname || '=' || indexdef, '|' order by indexname)) from pg_catalog.pg_indexes where schemaname = 'app_private' and tablename = 'football_player_mapping_proposals' and indexname <> 'football_player_mapping_proposals_supporting_idx'),
  'f_rel', (select md5(string_agg(c.relname || ':' || coalesce(c.relacl::text, '') || ':' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text, '|' order by c.relname)) from pg_catalog.pg_class c where c.relnamespace = 'app_private'::regnamespace and c.relname in ('football_provider_mappings', 'football_player_mapping_proposals', 'football_player_mapping_candidates', 'football_player_mapping_observations', 'football_mapping_settings')),
  'f_fn_acl', (select md5(string_agg(p.oid::regprocedure::text || ':' || coalesce(p.proacl::text, 'null'), '|' order by p.oid::regprocedure::text)) from pg_catalog.pg_proc p where p.pronamespace in ('api'::regnamespace, 'app_private'::regnamespace) and p.proname like '%football_mapping%' and p.proname not in ('football_mapping_compute', 'football_mapping_supporting_state', 'football_mapping_supporting_dependency', 'admin_football_mapping_get_provider_mapping')),
  'mapping_rows', (select count(*) from app_private.football_provider_mappings),
  'mapping_digest', (select md5(coalesce(string_agg(m::text, '|' order by m.id), '')) from app_private.football_provider_mappings m),
  'sofascore_active', (select count(*) from app_private.football_provider_mappings where provider_name = 'sofascore' and active),
  'flashscore_mappings', (select count(*) from app_private.football_provider_mappings where provider_name = 'flashscore'),
  'proposals_by_status', (select coalesce(jsonb_object_agg(status, c), '{}'::jsonb) from (select status, count(*) c from app_private.football_player_mapping_proposals group by 1) s),
  'proposal_digest', (select md5(coalesce(string_agg((to_jsonb(p) - 'evidence_class' - 'supporting_mapping_id')::text, '|' order by p.id), '')) from app_private.football_player_mapping_proposals p),
  'candidates', (select count(*) from app_private.football_player_mapping_candidates),
  'candidate_digest', (select md5(coalesce(string_agg(c::text, '|' order by c.id), '')) from app_private.football_player_mapping_candidates c),
  'observations', (select count(*) from app_private.football_player_mapping_observations),
  'observation_digest', (select md5(coalesce(string_agg(o::text, '|' order by o.id), '')) from app_private.football_player_mapping_observations o),
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
) as snapshot
"""

# Facts that must be identical before and after. busy_sessions is a live read, not a state.
COMPARE_KEYS = [
    "history_rows", "history_has_guard", "latest_version", "migrations_after_reviewed", "compute_signatures",
    "guard_functions", "guard_columns", "guard_constraint", "guard_index", "compute_md5", "propose_md5",
    "revalidate_md5", "refresh_md5", "execute_md5", "guard_trigger_fn_md5", "resolver_md5", "api_functions",
    "private_functions", "f_prop_cols", "f_prop_cons", "f_map_cons", "f_prop_trig", "f_map_trig",
    "f_prop_idx", "f_rel", "f_fn_acl", "mapping_rows", "mapping_digest", "sofascore_active",
    "flashscore_mappings", "proposals_by_status", "proposal_digest", "candidates", "candidate_digest",
    "observations", "observation_digest", "single_operator_on", "settings_digest", "permissions_digest",
    "roles_digest", "principals_digest", "assignments_digest", "role_permissions_digest", "players_digest",
    "memberships_digest", "cron_jobs", "cron_digest", "automation_digest", "audit_events", "idempotency_keys",
    "fantasy_table_counts", "gameweek_digest",
]

# What production must look like BEFORE (the script's own preflight checks the same and more).
# These are the reported baseline: if production differs materially, the run stops and says so.
EXPECT_BEFORE = {
    "history_has_guard": 0, "latest_version": "20261002110000",
    "migrations_after_reviewed": "20261002100000:football_mapping_single_approver_switch:1fb64a5c5a8a231715663e38159a826842bf00360a058492fce666eb032c904e,20261002110000:list_my_match_reminders:c0512530a5fc67fc3da8de7dd96b497d984f743b9e54c707446161958048fdf2",
    "compute_signatures": "app_private.football_mapping_compute(text,uuid,uuid,text,uuid,uuid,text,uuid,uuid)",
    "guard_functions": 0, "guard_columns": 0, "guard_constraint": 0, "guard_index": 0,
    "compute_md5": "36269e06556de5376c4ba9208278b4c4", "propose_md5": "f5d0763b027e80822266da71fa7ecbfa",
    "revalidate_md5": "13e0707e390ec73af8ff4255f9986927", "refresh_md5": "e7d0e0ac179efc20a13149ff832ae60f",
    "execute_md5": "1c0951a9f61cf0baa2970b720b90cfb4", "guard_trigger_fn_md5": "9a09d8f704c30f18cd544c7455dc665d",
    "resolver_md5": "c4c7253284afa52aea055f74e3806d73",
    "mapping_rows": 1732, "sofascore_active": 191, "flashscore_mappings": 0,
    "proposals_by_status": {"executed": 191}, "candidates": 1004, "observations": 1006,
    "single_operator_on": True, "busy_sessions": 0, "finalizing_gameweeks": 0, "lifecycle_tick_enabled": 0,
}


class RehearsalError(Exception):
    pass


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def redact(text: str, token: str) -> str:
    return text.replace(token, "***") if token else text


def post(token: str, sql: str, read_only: bool, timeout: int) -> tuple[int | None, str, str]:
    """Returns (http_status, body, failure_kind). failure_kind is '' on a normal HTTP answer."""
    request = urllib.request.Request(
        f"{API}/v1/projects/{PROJECT_REF}/database/query",
        data=json.dumps({"query": sql, "read_only": read_only}).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "BotolaGO-SupportingDependencyRehearsal/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8", "replace"), ""
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace"), ""
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return None, redact(str(exc), token), "transport"


def classify(status: int | None, body: str, kind: str) -> str:
    """What kind of answer this was, from the evidence in it, never from the absence of one."""
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
    if status == 408 or status == 504 or status == 502 or status == 503:
        return "gateway_timeout_or_unavailable"
    if "stop:" in body:
        return "script_stop_guard"
    return "database_error_other"


def snapshot(token: str) -> dict[str, Any]:
    status, body, kind = post(token, SNAPSHOT_SQL, True, 90)
    if kind or status not in (200, 201):
        raise RehearsalError(f"snapshot_failed: {classify(status, body, kind)}: HTTP {status}: {redact(body[:400], token)}")
    rows = json.loads(body)
    return rows[0]["snapshot"] if isinstance(rows[0]["snapshot"], dict) else json.loads(rows[0]["snapshot"])


def main() -> int:
    repo = Path(os.environ.get("GITHUB_WORKSPACE", ".")).resolve()
    evidence_dir = Path(os.environ.get("EVIDENCE_DIR", repo / "evidence"))
    evidence_dir.mkdir(parents=True, exist_ok=True)
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
    if not token:
        raise RehearsalError("missing SUPABASE_ACCESS_TOKEN")
    if os.environ.get("SUPABASE_PRODUCTION_PROJECT_REF") != PROJECT_REF or PROJECT_REF == STAGING_REF:
        raise RehearsalError("production project-ref guard failed")

    script_path = repo / SCRIPT
    if sha256(script_path) != SCRIPT_SHA256:
        raise RehearsalError("the apply script is not the reviewed file (sha256 mismatch)")
    if sha256(repo / MIGRATION) != MIGRATION_SHA256:
        raise RehearsalError(f"{MIGRATION} is not the reviewed migration (sha256 mismatch)")
    if sha256(repo / MANIFEST) != MANIFEST_FILE_SHA256:
        raise RehearsalError(f"{MANIFEST} is not the reviewed manifest file (sha256 mismatch)")
    if json.loads((repo / MANIFEST).read_text(encoding="utf-8")).get("manifestSha256") != MANIFEST_IDENTITY_SHA256:
        raise RehearsalError("the manifest does not carry the accepted identity-set hash")
    script = script_path.read_text(encoding="utf-8")
    lines = script.splitlines()
    if sum(1 for line in lines if line.strip() == "rollback;") != 1:
        raise RehearsalError("the script must contain exactly one top-level rollback;")
    if any(re.fullmatch(r"\s*commit\s*;\s*", line) for line in lines):
        raise RehearsalError("the script contains an active commit; -- rehearsal refused")
    # The migration drops the nine-argument compute function once, plainly. Nothing in the script
    # may soften or evade that: no CASCADE, no rename of a function, no switching a trigger off.
    if len(re.findall(r"(?im)^\s*drop\s+function\b", script)) != 1:
        raise RehearsalError("the script must contain exactly one DROP FUNCTION")
    if re.search(r"(?i)\bcascade\b", script):
        raise RehearsalError("the script contains CASCADE -- rehearsal refused")
    if re.search(r"(?i)alter\s+function\b[^;]*\brename\b", script):
        raise RehearsalError("the script renames a function -- rehearsal refused")
    if re.search(r"(?i)disable\s+trigger|alter\s+event\s+trigger|session_replication_role", script):
        raise RehearsalError("the script switches a trigger off -- rehearsal refused")
    print("Reviewed script, migration and manifest verified; rollback; present, no commit;, no CASCADE, one DROP FUNCTION.")

    before = snapshot(token)
    problems = [k for k, v in EXPECT_BEFORE.items() if before.get(k) != v]
    if problems:
        raise RehearsalError("production is not in the reported baseline: " + ", ".join(problems)
                             + " | " + json.dumps({k: before.get(k) for k in problems}, sort_keys=True))
    print("Pre-state verified:", json.dumps({k: before[k] for k in EXPECT_BEFORE}, sort_keys=True))

    status, body, kind = post(token, script, False, 115)
    outcome = classify(status, body, kind)
    print(f"Script response: HTTP {status} ({outcome})")
    result_text = redact(body[:1500], token)
    print("Script result:", result_text)
    passed = outcome == "completed" and "Rehearsal passed" in body and "Applied." not in body
    # Whatever happened, the independent after-read below decides what state production is in.

    after = snapshot(token)
    changed = [k for k in COMPARE_KEYS if before.get(k) != after.get(k)]
    evidence = {
        "script_sha256": SCRIPT_SHA256,
        "migration_sha256": MIGRATION_SHA256,
        "manifest_file_sha256": MANIFEST_FILE_SHA256,
        "manifest_identity_sha256": MANIFEST_IDENTITY_SHA256,
        "http_status": status,
        "outcome_class": outcome,
        "script_result": result_text,
        "rehearsal_passed": passed,
        "before": before,
        "after": after,
        "changed_keys": changed,
        "busy_sessions_after": after.get("busy_sessions"),
    }
    (evidence_dir / "supporting-dependency-rehearsal-evidence.json").write_text(
        json.dumps(evidence, indent=2, sort_keys=True), encoding="utf-8")
    print("After-read changed keys:", changed or "none")
    print("Evidence:", json.dumps({k: after[k] for k in COMPARE_KEYS if k != "fantasy_table_counts"}, sort_keys=True))
    if changed:
        raise RehearsalError("production differs after the rehearsal: " + ", ".join(changed))
    if not passed:
        raise RehearsalError(f"the rehearsal did not report 'Rehearsal passed' ({outcome}); production is unchanged (after-read)")
    print("REHEARSAL_PASSED_AND_ROLLED_BACK")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RehearsalError as exc:
        print(f"REHEARSAL_FAILED: {exc}")
        sys.exit(2)
