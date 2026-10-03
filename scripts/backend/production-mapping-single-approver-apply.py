#!/usr/bin/env python3
"""ONE-SHOT real application of the single-approver switch to Production V2.

Sends the rehearsed script in ONE request with its single final `rollback;`
turned into `commit;` (and nothing else changed), after pinning the rehearsed
script, the commit version and the migration by sha256 and re-reading
production. It never retries. After the call, whatever the client reports, it
reads production and classifies the outcome:

  SINGLE_APPROVER_PRODUCTION_APPLIED_AND_VERIFIED
  SINGLE_APPROVER_COMMIT_FAILED_ROLLED_BACK
  SINGLE_APPROVER_COMMIT_OUTCOME_UNVERIFIED
  SINGLE_APPROVER_COMMITTED_NEEDS_REVIEW

Nothing is deleted or rolled back automatically, and no names or personal data
are read.
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
SCRIPT = "scripts/backend/apply-20261002100000-mapping-single-approver.sql"
REHEARSAL_SCRIPT_SHA256 = "5dc40ecbaf0a0256c0fbcbf034383a821f0445f23e6f2f32fc472fe1e0c8fe4e"
COMMIT_SCRIPT_SHA256 = "cf6a6cb4f79c98d515712a8bec3f29815a3b5f26097dc38266a0c7c0d5bc2395"
MIGRATION = "supabase/migrations/20261002100000_football_mapping_single_approver_switch.sql"
MIGRATION_SHA256 = "1fb64a5c5a8a231715663e38159a826842bf00360a058492fce666eb032c904e"

OUT_OK = "SINGLE_APPROVER_PRODUCTION_APPLIED_AND_VERIFIED"
OUT_FAILED = "SINGLE_APPROVER_COMMIT_FAILED_ROLLED_BACK"
OUT_UNVERIFIED = "SINGLE_APPROVER_COMMIT_OUTCOME_UNVERIFIED"
OUT_REVIEW = "SINGLE_APPROVER_COMMITTED_NEEDS_REVIEW"

SNAPSHOT_SQL = """
select jsonb_build_object(
  'history_rows', (select count(*) from supabase_migrations.schema_migrations),
  'history_has_switch', (select count(*) from supabase_migrations.schema_migrations where version = '20261002100000'),
  'latest_version', (select max(version) from supabase_migrations.schema_migrations),
  'migrations_after_reviewed', (select string_agg(version || ':' || name || ':' || encode(sha256(convert_to(statements[1], 'UTF8')), 'hex'), ',' order by version) from supabase_migrations.schema_migrations where version > '20261001161000'),
  'settings_table', to_regclass('app_private.football_mapping_settings')::text,
  'switch_on', case when to_regclass('app_private.football_mapping_settings') is null then null else (xpath('/row/c/text()', query_to_xml('select allow_self_approval as c from app_private.football_mapping_settings', false, true, '')))[1]::text end,
  'switch_rows', case when to_regclass('app_private.football_mapping_settings') is null then null else (xpath('/row/c/text()', query_to_xml('select count(*) as c from app_private.football_mapping_settings', false, true, '')))[1]::text::bigint end,
  'self_approved_column', (select count(*) from pg_attribute where attrelid = 'app_private.football_player_mapping_proposals'::regclass and attname = 'self_approved' and not attisdropped),
  'two_people_check', (select pg_get_constraintdef(oid) from pg_constraint where conname = 'football_player_mapping_proposals_two_people_check'),
  'proposal_triggers', (select string_agg(tgname, ',' order by tgname) from pg_trigger where tgrelid = 'app_private.football_player_mapping_proposals'::regclass and not tgisinternal),
  'proposals_acl', (select relacl::text from pg_class where oid = 'app_private.football_player_mapping_proposals'::regclass),
  'settings_forced_rls', (select count(*) from pg_class where oid = to_regclass('app_private.football_mapping_settings') and relrowsecurity and relforcerowsecurity),
  'settings_api_grants', (select count(*) from pg_class c, (values ('anon'),('authenticated'),('service_role')) r(role) where c.oid = to_regclass('app_private.football_mapping_settings') and has_table_privilege(r.role, c.oid, 'select,insert,update,delete,truncate,references,trigger')),
  'new_fns_api_grants', (select count(*) from pg_proc p, (values ('anon'),('authenticated'),('service_role')) r(role) where p.oid in (to_regprocedure('app_private.football_mapping_self_approval_allowed()'), to_regprocedure('app_private.football_mapping_self_decision_guard()')) and has_function_privilege(r.role, p.oid, 'execute')),
  'decide_md5', (select md5(pg_get_functiondef('api.admin_football_mapping_decide(uuid,text,text,text,boolean,uuid)'::regprocedure))),
  'execute_md5', (select md5(pg_get_functiondef('api.admin_football_mapping_execute(uuid,uuid)'::regprocedure))),
  'availability_md5', (select md5(pg_get_functiondef('api.admin_football_mapping_reviewer_availability()'::regprocedure))),
  'proposal_json_md5', (select md5(pg_get_functiondef('app_private.football_mapping_proposal_json(app_private.football_player_mapping_proposals,uuid)'::regprocedure))),
  'resolver_md5', (select md5(pg_get_functiondef('api.resolve_football_mapping(text,text,text,uuid,text,timestamp with time zone)'::regprocedure))),
  'decide_acl', (select proacl::text from pg_proc where oid = 'api.admin_football_mapping_decide(uuid,text,text,text,boolean,uuid)'::regprocedure),
  'execute_acl', (select proacl::text from pg_proc where oid = 'api.admin_football_mapping_execute(uuid,uuid)'::regprocedure),
  'availability_acl', (select proacl::text from pg_proc where oid = 'api.admin_football_mapping_reviewer_availability()'::regprocedure),
  'resolver_acl', (select proacl::text from pg_proc where oid = 'api.resolve_football_mapping(text,text,text,uuid,text,timestamp with time zone)'::regprocedure),
  'api_functions', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'api'),
  'private_functions', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app_private'),
  'candidates', (select count(*) from app_private.football_player_mapping_candidates),
  'observations', (select count(*) from app_private.football_player_mapping_observations),
  'proposals', (select count(*) from app_private.football_player_mapping_proposals),
  'mapping_rows', (select count(*) from app_private.football_provider_mappings),
  'reviewed_provider_mapping_rows', (select count(*) from app_private.football_provider_mappings where provider_name in ('sofascore','flashscore')),
  'mapping_identity_digest', (select md5(coalesce(string_agg(concat_ws(':', m.id, m.provider_name, m.entity_type, m.external_id, m.internal_entity_id, m.active), '|' order by m.id), '')) from app_private.football_provider_mappings m),
  'cron_jobs', (select count(*) from cron.job),
  'cron_digest', (select md5(coalesce(string_agg(jobid::text || ':' || schedule || ':' || command || ':' || active::text, '|' order by jobid), '')) from cron.job),
  'audit_events', (select count(*) from app_private.admin_audit_events),
  'idempotency_keys', (select count(*) from app_private.admin_idempotency_keys),
  'fantasy_table_counts', (select jsonb_object_agg(t.relname, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', 'app', t.relname), false, true, '')))[1]::text::bigint) from pg_class t where t.relnamespace = 'app'::regnamespace and t.relkind = 'r' and t.relname like 'fantasy%'),
  'gameweek_digest', (select md5(coalesce(string_agg(g::text, '|' order by g.id), '')) from app.fantasy_gameweeks g),
  'busy_sessions', (select count(*) from pg_stat_activity where backend_type = 'client backend' and pid <> pg_backend_pid() and state in ('active','idle in transaction','idle in transaction (aborted)')),
  'finalizing_gameweeks', (select count(*) from app.fantasy_gameweeks where status = 'finalizing'),
  'lifecycle_tick_enabled', (select count(*) from app_private.fantasy_automation_settings where lifecycle_tick_enabled)
) as snapshot
"""

OLD_MD5 = {
    "decide_md5": "6a23f72de1be2af83ed7d92d3abd40b8",
    "execute_md5": "92ad7b83e9c8225b4c1cc3a9ef21c935",
    "availability_md5": "6df9704512ef417cfc5c2b032ea22a15",
    "proposal_json_md5": "abbf9649618367198d24c12c80e10053",
}

EXPECT_BEFORE = {
    "history_has_switch": 0, "latest_version": "20261002110000",
    "migrations_after_reviewed": "20261002110000:list_my_match_reminders:c0512530a5fc67fc3da8de7dd96b497d984f743b9e54c707446161958048fdf2", "settings_table": None,
    "self_approved_column": 0, "proposals": 0, "candidates": 1004, "observations": 1006,
    "mapping_rows": 1541, "reviewed_provider_mapping_rows": 0,
    "resolver_md5": "c4c7253284afa52aea055f74e3806d73",
    "busy_sessions": 0, "finalizing_gameweeks": 0, "lifecycle_tick_enabled": 0,
    **OLD_MD5,
}

# Must be identical before and after the commit (everything the change must not touch).
UNCHANGED = [
    "candidates", "observations", "proposals", "mapping_rows", "reviewed_provider_mapping_rows",
    "mapping_identity_digest", "resolver_md5", "resolver_acl", "decide_acl", "execute_acl",
    "availability_acl", "proposals_acl", "api_functions", "cron_jobs", "cron_digest", "audit_events",
    "idempotency_keys", "fantasy_table_counts", "gameweek_digest",
]

EXPECT_AFTER = {
    "history_has_switch": 1, "latest_version": "20261002110000",
    "migrations_after_reviewed": "20261002100000:football_mapping_single_approver_switch:1fb64a5c5a8a231715663e38159a826842bf00360a058492fce666eb032c904e,20261002110000:list_my_match_reminders:c0512530a5fc67fc3da8de7dd96b497d984f743b9e54c707446161958048fdf2",
    "settings_table": "app_private.football_mapping_settings",
    "switch_on": "true", "switch_rows": 1, "settings_forced_rls": 1, "settings_api_grants": 0,
    "new_fns_api_grants": 0, "self_approved_column": 1, "two_people_check": None,
    "proposals": 0,
    "proposal_triggers": "football_player_mapping_proposals_guard,football_player_mapping_proposals_no_delete,football_player_mapping_proposals_no_truncate,football_player_mapping_proposals_self_decision_guard,football_player_mapping_proposals_set_updated_at",
}


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
            "User-Agent": "BotolaGO-SingleApproverApply/1.0",
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
    problems += [f"{k}: still the old text" for k, old in OLD_MD5.items() if after.get(k) == old]
    if after.get("private_functions") != before.get("private_functions", 0) + 2:
        problems.append("app_private function count did not grow by exactly 2")
    if after.get("history_rows") != before.get("history_rows", 0) + 1:
        problems.append("history rows did not grow by exactly 1")
    return problems


def write_evidence(directory: Path, data: dict[str, Any]) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "single-approver-apply-evidence.json").write_text(
        json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")


def main() -> int:
    repo = Path(os.environ.get("GITHUB_WORKSPACE", ".")).resolve()
    evidence_dir = Path(os.environ.get("EVIDENCE_DIR", repo / "evidence"))
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
    if not token:
        raise ApplyError("missing SUPABASE_ACCESS_TOKEN")
    if os.environ.get("SUPABASE_PRODUCTION_PROJECT_REF") != PROJECT_REF or PROJECT_REF == STAGING_REF:
        raise ApplyError("production project-ref guard failed")
    if sha256_bytes((repo / MIGRATION).read_bytes()) != MIGRATION_SHA256:
        raise ApplyError(f"{MIGRATION} is not the reviewed migration (sha256 mismatch)")
    script = build_commit_script(repo / SCRIPT)
    print("Reviewed script and migration verified; exactly one commit; and no rollback; in the commit version.")

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
        call_status, call_body = post(token, script, False, 110)
    except ApplyError as exc:
        call_error = str(exc)
    print(f"Script call: HTTP {call_status}" if call_status is not None else f"Script call failed: {call_error}")
    result_text = redact(call_body[:1500], token)
    print("Script result:", result_text)

    evidence: dict[str, Any] = {
        "commit_script_sha256": COMMIT_SCRIPT_SHA256, "rehearsal_script_sha256": REHEARSAL_SCRIPT_SHA256,
        "migration_sha256": MIGRATION_SHA256, "http_status": call_status, "call_error": call_error,
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
    recorded = after.get("history_has_switch")
    if recorded == 0:
        unchanged_everything = all(before.get(k) == after.get(k) for k in UNCHANGED + ["settings_table", "migrations_after_reviewed", "decide_md5", "execute_md5", "availability_md5", "proposal_json_md5", "private_functions"])
        outcome = OUT_FAILED if unchanged_everything else OUT_UNVERIFIED
        evidence["outcome"] = outcome
        write_evidence(evidence_dir, evidence)
        print(outcome, "- the migration is not recorded; production", "matches the pre-state." if unchanged_everything else "DIFFERS from the pre-state.")
        return 4
    problems = verify(before, after)
    evidence["problems"] = problems
    if problems:
        evidence["outcome"] = OUT_REVIEW
        write_evidence(evidence_dir, evidence)
        print(OUT_REVIEW)
        for problem in problems:
            print(" -", problem)
        return 5
    evidence["outcome"] = OUT_OK
    write_evidence(evidence_dir, evidence)
    print("After:", json.dumps({k: after[k] for k in sorted(after) if k != "fantasy_table_counts"}, sort_keys=True, default=str))
    print(OUT_OK)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ApplyError as exc:
        print(f"APPLY_REFUSED_BEFORE_COMMIT: {exc}")
        sys.exit(2)
