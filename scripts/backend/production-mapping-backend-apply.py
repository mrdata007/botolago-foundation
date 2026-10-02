#!/usr/bin/env python3
"""ONE-SHOT real application of the reviewed player-mapping backend to Production V2.

Sends the reviewed combined script in ONE request with its single final
`rollback;` turned into `commit;` (and nothing else changed), after pinning the
rehearsal-version script, the commit-version script and the three migrations by
sha256 and re-reading production. It never retries. After the call, whatever the
client reports, it reads production and classifies the outcome:

  MAPPING_BACKEND_PRODUCTION_APPLIED_AND_VERIFIED
  MAPPING_BACKEND_COMMIT_FAILED_ROLLED_BACK
  MAPPING_BACKEND_COMMIT_OUTCOME_UNVERIFIED
  MAPPING_BACKEND_COMMITTED_NEEDS_REVIEW

Nothing is deleted or rolled back automatically.
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
SCRIPT = "scripts/backend/apply-20261001150000-mapping-backend-combined.sql"
REHEARSAL_SCRIPT_SHA256 = "b323cf0d1dd447b6e0ca97296777e315b349b5923560adaecc4f906365e74022"
COMMIT_SCRIPT_SHA256 = "0775796726f4edaf9de199907478880211a4bdfcc480458949d3ee459a368a61"
MIGRATIONS = {
    "supabase/migrations/20261001150000_register_sofascore_flashscore_providers.sql":
        "0259c253dd732a80479659d0227588cc1b6178154fe71c407f951cf4ab84f8ff",
    "supabase/migrations/20261001160000_football_player_mapping_tables.sql":
        "9377693f2c93836e211c6988de72dc7edafeee16d8a3d8edea1cf11fcc452005",
    "supabase/migrations/20261001161000_football_player_mapping_functions.sql":
        "74e38306009dff996e12e191057232a269ef961c2e1176b330adbb268d4f0406",
}
NEW_VERSIONS = ["20261001150000", "20261001160000", "20261001161000"]
EXPECTED_MAPPING_ROWS = 1541

OUT_OK = "MAPPING_BACKEND_PRODUCTION_APPLIED_AND_VERIFIED"
OUT_FAILED = "MAPPING_BACKEND_COMMIT_FAILED_ROLLED_BACK"
OUT_UNVERIFIED = "MAPPING_BACKEND_COMMIT_OUTCOME_UNVERIFIED"
OUT_REVIEW = "MAPPING_BACKEND_COMMITTED_NEEDS_REVIEW"

STAFF_FNS = """('admin_football_mapping_add_position_note','admin_football_mapping_app_player_options','admin_football_mapping_cancel','admin_football_mapping_decide','admin_football_mapping_execute','admin_football_mapping_get_candidate','admin_football_mapping_get_proposal','admin_football_mapping_list_candidates','admin_football_mapping_list_proposals','admin_football_mapping_propose','admin_football_mapping_refresh_evidence','admin_football_mapping_reviewer_availability')"""
TRUSTED_FNS = """('football_mapping_expire_proposals','football_mapping_purge_display_names','football_mapping_record_observations')"""
MAP_PROCS = "(p.proname like 'football_mapping%' or p.proname like 'admin_football_mapping%')"

SNAPSHOT_SQL = f"""
select jsonb_build_object(
  'history_rows', (select count(*) from supabase_migrations.schema_migrations),
  'new_history_rows', (select count(*) from supabase_migrations.schema_migrations where version in ('20261001150000','20261001160000','20261001161000')),
  'new_history_versions', (select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations where version in ('20261001150000','20261001160000','20261001161000')),
  'latest_version', (select max(version) from supabase_migrations.schema_migrations),
  'providers', (select string_agg(name, ',' order by name) from app_private.football_providers),
  'old_provider_digest', (select md5(coalesce(string_agg(p::text, '|' order by p.name), '')) from app_private.football_providers p where p.name not in ('sofascore','flashscore')),
  'provider_rows', (select jsonb_agg(jsonb_build_object('name', name, 'active', active, 'cv', configuration_version) order by name) from app_private.football_providers),
  'mapping_rows', (select count(*) from app_private.football_provider_mappings),
  'reviewed_provider_mapping_rows', (select count(*) from app_private.football_provider_mappings where provider_name in ('sofascore','flashscore')),
  'mapping_identity_digest', (select md5(coalesce(string_agg(concat_ws(':', m.id, m.provider_name, m.entity_type, m.external_id, m.internal_entity_id, m.active), '|' order by m.id), '')) from app_private.football_provider_mappings m),
  'constraint_digest', (select md5(string_agg(conname || ':' || pg_get_constraintdef(oid) || ':' || condeferrable::text, '|' order by conname)) from pg_constraint where conrelid = 'app_private.football_provider_mappings'::regclass),
  'unique_constraints', (select count(*) from pg_constraint where conrelid = 'app_private.football_provider_mappings'::regclass and contype = 'u'),
  'index_digest', (select md5(coalesce(string_agg(indexdef, '|' order by indexname), '')) from pg_indexes where schemaname = 'app_private' and tablename = 'football_provider_mappings'),
  'trigger_digest', (select md5(coalesce(string_agg(pg_get_triggerdef(oid), '|' order by tgname), '')) from pg_trigger where tgrelid = 'app_private.football_provider_mappings'::regclass and not tgisinternal),
  'mapping_table_acl', (select relacl::text from pg_class where oid = 'app_private.football_provider_mappings'::regclass),
  'resolver_md5', (select md5(pg_get_functiondef('api.resolve_football_mapping(text,text,text,uuid,text,timestamp with time zone)'::regprocedure))),
  'resolver_acl', (select proacl::text from pg_proc where oid = 'api.resolve_football_mapping(text,text,text,uuid,text,timestamp with time zone)'::regprocedure),
  'new_tables', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'app_private' and c.relname like 'football_player_mapping%' and c.relkind = 'r'),
  'new_tables_forced_rls', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'app_private' and c.relname like 'football_player_mapping%' and c.relkind = 'r' and c.relrowsecurity and c.relforcerowsecurity),
  'new_table_policies', (select count(*) from pg_policy where polrelid in (select c.oid from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'app_private' and c.relname like 'football_player_mapping%')),
  'new_table_api_grants', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace, (values ('anon'),('authenticated'),('service_role')) r(role) where n.nspname = 'app_private' and c.relname like 'football_player_mapping%' and c.relkind = 'r' and has_table_privilege(r.role, c.oid, 'select,insert,update,delete,truncate,references,trigger')),
  'new_functions', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('api','app_private') and {MAP_PROCS}),
  'staff_fns_authenticated_only', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'api' and p.proname in {STAFF_FNS} and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute') and not has_function_privilege('service_role', p.oid, 'execute')),
  'trusted_fns_service_only', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'api' and p.proname in {TRUSTED_FNS} and has_function_privilege('service_role', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute') and not has_function_privilege('authenticated', p.oid, 'execute')),
  'helpers_without_api_grants', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app_private' and {MAP_PROCS} and not has_function_privilege('anon', p.oid, 'execute') and not has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('service_role', p.oid, 'execute')),
  'public_grants_on_new_functions', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace, aclexplode(p.proacl) a where n.nspname in ('api','app_private') and {MAP_PROCS} and a.grantee = 0),
  'two_people_check', (select pg_get_constraintdef(oid) from pg_constraint where conname = 'football_player_mapping_proposals_two_people_check'),
  'api_functions', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'api'),
  'private_functions', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app_private'),
  'candidates', case when to_regclass('app_private.football_player_mapping_candidates') is null then null else (xpath('/row/c/text()', query_to_xml('select count(*) as c from app_private.football_player_mapping_candidates', false, true, '')))[1]::text::bigint end,
  'observations', case when to_regclass('app_private.football_player_mapping_observations') is null then null else (xpath('/row/c/text()', query_to_xml('select count(*) as c from app_private.football_player_mapping_observations', false, true, '')))[1]::text::bigint end,
  'proposals', case when to_regclass('app_private.football_player_mapping_proposals') is null then null else (xpath('/row/c/text()', query_to_xml('select count(*) as c from app_private.football_player_mapping_proposals', false, true, '')))[1]::text::bigint end,
  'cron_jobs', (select count(*) from cron.job),
  'cron_digest', (select md5(coalesce(string_agg(jobid::text || ':' || schedule || ':' || command || ':' || active::text, '|' order by jobid), '')) from cron.job),
  'sched_football_mapping', (select count(*) from cron.job where command ~* 'football_mapping'),
  'audit_events', (select count(*) from app_private.admin_audit_events),
  'idempotency_keys', (select count(*) from app_private.admin_idempotency_keys),
  'fantasy_table_counts', (select jsonb_object_agg(t.relname, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', 'app', t.relname), false, true, '')))[1]::text::bigint) from pg_class t where t.relnamespace = 'app'::regnamespace and t.relkind = 'r' and t.relname like 'fantasy%'),
  'gameweek_digest', (select md5(coalesce(string_agg(g::text, '|' order by g.id), '')) from app.fantasy_gameweeks g),
  'automation_digest', (select md5(coalesce(string_agg(s::text, '|' order by s::text), '')) from app_private.fantasy_automation_settings s),
  'busy_sessions', (select count(*) from pg_stat_activity where backend_type = 'client backend' and pid <> pg_backend_pid() and state in ('active','idle in transaction','idle in transaction (aborted)')),
  'finalizing_gameweeks', (select count(*) from app.fantasy_gameweeks where status = 'finalizing'),
  'lifecycle_tick_enabled', (select count(*) from app_private.fantasy_automation_settings where lifecycle_tick_enabled)
) as snapshot
"""

EXPECT_BEFORE = {
    "new_history_rows": 0, "providers": "fixture,sportsmonks",
    "reviewed_provider_mapping_rows": 0, "new_tables": 0, "new_functions": 0,
    "constraint_digest": "84d45fbd1c71c689561c39afe04094c9",
    "resolver_md5": "5d7ad20856e2bb22e2b7d44741e21be1",
    "latest_version": "20261001071120", "busy_sessions": 0, "finalizing_gameweeks": 0,
    "lifecycle_tick_enabled": 0, "mapping_rows": EXPECTED_MAPPING_ROWS,
}

# Must be identical before and after the commit (everything the change must not touch).
UNCHANGED = [
    "old_provider_digest", "mapping_rows", "reviewed_provider_mapping_rows", "mapping_identity_digest",
    "constraint_digest", "unique_constraints", "index_digest", "trigger_digest", "mapping_table_acl",
    "resolver_acl", "cron_jobs", "cron_digest", "audit_events", "idempotency_keys",
    "fantasy_table_counts", "gameweek_digest", "automation_digest",
]

EXPECT_AFTER = {
    "new_history_rows": 3, "new_history_versions": ",".join(NEW_VERSIONS),
    "providers": "fixture,flashscore,sofascore,sportsmonks",
    "reviewed_provider_mapping_rows": 0, "unique_constraints": 2,
    "constraint_digest": "84d45fbd1c71c689561c39afe04094c9",
    "new_tables": 3, "new_tables_forced_rls": 3, "new_table_policies": 0, "new_table_api_grants": 0,
    "new_functions": 35, "staff_fns_authenticated_only": 12, "trusted_fns_service_only": 3,
    "helpers_without_api_grants": 20, "public_grants_on_new_functions": 0,
    "two_people_check": "CHECK (((decided_by IS NULL) OR (decided_by IS DISTINCT FROM requested_by)))",
    "candidates": 0, "observations": 0, "proposals": 0, "sched_football_mapping": 0,
}
GUARD_TEXT = (
    "  -- The only change: a reviewed provider's player mapping is never created here.\n"
    "  if p_provider_name in ('sofascore', 'flashscore') and normalized_entity_type = 'player' then\n"
    "    raise exception using errcode = 'P0001', message = 'MAPPING_REVIEW_REQUIRED';\n"
    "  end if;\n\n"
)
RESOLVER_SQL = (
    "select pg_get_functiondef('api.resolve_football_mapping(text,text,text,uuid,text,timestamp with time zone)'::regprocedure) as def"
)


class ApplyError(Exception):
    pass


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def redact(text: str, token: str) -> str:
    return text.replace(token, "***") if token else text


def post(token: str, sql: str, read_only: bool, timeout: int) -> tuple[int, str]:
    request = urllib.request.Request(
        f"{API}/v1/projects/{PROJECT_REF}/database/query",
        data=json.dumps({"query": sql, "read_only": read_only}).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "BotolaGO-MappingBackendApply/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise ApplyError(f"network_error: {redact(str(exc), token)}") from exc


def snapshot(token: str) -> dict[str, Any]:
    status, body = post(token, SNAPSHOT_SQL, True, 60)
    if status not in (200, 201):
        raise ApplyError(f"snapshot_failed: HTTP {status}: {redact(body[:400], token)}")
    value = json.loads(body)[0]["snapshot"]
    return value if isinstance(value, dict) else json.loads(value)


def build_commit_script(path: Path) -> str:
    raw = path.read_bytes()
    if sha256_bytes(raw) != REHEARSAL_SCRIPT_SHA256:
        raise ApplyError("the apply script is not the rehearsed file (sha256 mismatch)")
    lines = raw.decode("utf-8").split("\n")
    rollbacks = [i for i, line in enumerate(lines) if line.strip() == "rollback;"]
    if len(rollbacks) != 1:
        raise ApplyError("the rehearsed script must contain exactly one top-level rollback;")
    if any(re.fullmatch(r"\s*commit\s*;\s*", line) for line in lines):
        raise ApplyError("the rehearsed script already contains an active commit;")
    lines[rollbacks[0]] = "commit;"
    script = "\n".join(lines)
    if sha256_bytes(script.encode("utf-8")) != COMMIT_SCRIPT_SHA256:
        raise ApplyError("the commit version does not match its pinned sha256")
    top = [line for line in script.split("\n") if re.fullmatch(r"\s*(commit|rollback)\s*;\s*", line)]
    if top != ["commit;"]:
        raise ApplyError("the commit version must contain exactly one commit; and no rollback;")
    return script


def verify(before: dict[str, Any], after: dict[str, Any]) -> list[str]:
    problems = [f"{k}: before={before.get(k)!r} after={after.get(k)!r}" for k in UNCHANGED if before.get(k) != after.get(k)]
    problems += [f"{k}: expected={v!r} got={after.get(k)!r}" for k, v in EXPECT_AFTER.items() if after.get(k) != v]
    rows = {r["name"]: r for r in (after.get("provider_rows") or [])}
    for name in ("sofascore", "flashscore"):
        if rows.get(name) != {"name": name, "active": True, "cv": 1}:
            problems.append(f"provider {name} is not active at configuration_version 1")
    if after.get("api_functions") != before.get("api_functions", 0) + 15:
        problems.append("api function count did not grow by exactly 15")
    if after.get("private_functions") != before.get("private_functions", 0) + 20:
        problems.append("app_private function count did not grow by exactly 20")
    if after.get("history_rows") != before.get("history_rows", 0) + 3:
        problems.append("history rows did not grow by exactly 3")
    if after.get("resolver_md5") == before.get("resolver_md5"):
        problems.append("resolver text did not change")
    return problems


def write_evidence(directory: Path, data: dict[str, Any]) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "mapping-backend-apply-evidence.json").write_text(
        json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")


def main() -> int:
    repo = Path(os.environ.get("GITHUB_WORKSPACE", ".")).resolve()
    evidence_dir = Path(os.environ.get("EVIDENCE_DIR", repo / "evidence"))
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
    if not token:
        raise ApplyError("missing SUPABASE_ACCESS_TOKEN")
    if os.environ.get("SUPABASE_PRODUCTION_PROJECT_REF") != PROJECT_REF or PROJECT_REF == STAGING_REF:
        raise ApplyError("production project-ref guard failed")
    for rel, expected in MIGRATIONS.items():
        if sha256_bytes((repo / rel).read_bytes()) != expected:
            raise ApplyError(f"{rel} is not the reviewed migration (sha256 mismatch)")
    script = build_commit_script(repo / SCRIPT)
    print("Reviewed script and migrations verified; exactly one commit; and no rollback; in the commit version.")

    before = snapshot(token)
    drift = [k for k, v in EXPECT_BEFORE.items() if before.get(k) != v]
    if drift:
        raise ApplyError("production is not in the reviewed pre-state: " + ", ".join(f"{k}={before.get(k)!r}" for k in drift))
    print("Pre-state verified:", json.dumps({k: before[k] for k in EXPECT_BEFORE}, sort_keys=True))

    # ---- the one and only commit; never retried ---------------------------------
    call_status: int | None = None
    call_body = ""
    call_error = ""
    try:
        call_status, call_body = post(token, script, False, 170)
    except ApplyError as exc:
        call_error = str(exc)
    print(f"Script call: HTTP {call_status}" if call_status is not None else f"Script call failed: {call_error}")
    result_text = redact(call_body[:1500], token)
    print("Script result:", result_text)

    evidence: dict[str, Any] = {
        "commit_script_sha256": COMMIT_SCRIPT_SHA256, "rehearsal_script_sha256": REHEARSAL_SCRIPT_SHA256,
        "migrations": MIGRATIONS, "http_status": call_status, "call_error": call_error,
        "script_result": result_text, "before": before,
    }
    try:
        after = snapshot(token)
    except (ApplyError, ValueError, KeyError, IndexError) as exc:
        evidence["outcome"] = OUT_UNVERIFIED
        evidence["after_read_error"] = str(exc)
        write_evidence(evidence_dir, evidence)
        print(OUT_UNVERIFIED, "- production could not be read afterwards:", exc)
        return 3
    evidence["after"] = after
    recorded = after.get("new_history_rows")
    if recorded == 0:
        unchanged_everything = all(before.get(k) == after.get(k) for k in UNCHANGED + ["providers", "new_tables", "new_functions", "resolver_md5"])
        outcome = OUT_FAILED if unchanged_everything else OUT_UNVERIFIED
        evidence["outcome"] = outcome
        write_evidence(evidence_dir, evidence)
        print(outcome, "- no migration is recorded; production", "matches the pre-state." if unchanged_everything else "DIFFERS from the pre-state.")
        return 4
    if recorded != 3:
        evidence["outcome"] = OUT_REVIEW
        write_evidence(evidence_dir, evidence)
        print(OUT_REVIEW, f"- only {recorded} of 3 migrations are recorded")
        return 5
    problems = verify(before, after)
    evidence["problems"] = problems
    if problems:
        evidence["outcome"] = OUT_REVIEW
        write_evidence(evidence_dir, evidence)
        print(OUT_REVIEW)
        for problem in problems:
            print(" -", problem)
        return 5
    status, body = post(token, RESOLVER_SQL, True, 60)
    definition = json.loads(body)[0]["def"] if status in (200, 201) else ""
    guard_ok = GUARD_TEXT in definition and hashlib.md5(definition.replace(GUARD_TEXT, "").encode()).hexdigest() == "5d7ad20856e2bb22e2b7d44741e21be1"
    evidence["resolver_guard_present_and_only_change"] = guard_ok
    if not guard_ok:
        evidence["outcome"] = OUT_REVIEW
        write_evidence(evidence_dir, evidence)
        print(OUT_REVIEW, "- the resolver is not the reviewed text plus only the guard")
        return 5
    evidence["outcome"] = OUT_OK
    write_evidence(evidence_dir, evidence)
    print("After:", json.dumps({k: after[k] for k in sorted(after) if k not in ("fantasy_table_counts", "provider_rows")}, sort_keys=True, default=str))
    print(OUT_OK)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ApplyError as exc:
        print(f"APPLY_REFUSED_BEFORE_COMMIT: {exc}")
        sys.exit(2)
