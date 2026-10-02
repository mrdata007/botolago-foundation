#!/usr/bin/env python3
"""Run the reviewed single-approver switch script against Production V2 as a REHEARSAL.

The script is run exactly as it is in the repository: its final `rollback;` is
unchanged and nothing is saved. This runner only
  * refuses to run unless the script, its migration and the target project are
    the reviewed ones and the script still ends in `rollback;` (it never
    contains an active `commit;`),
  * reads a snapshot of production before and after (read-only queries),
  * sends the whole script in ONE request, and
  * fails unless the script's own result row says "Rehearsal passed" and the
    snapshot after is identical to the snapshot before.

It cannot commit: there is no code path here that edits the script, and no
names or personal data are read.
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
SCRIPT_SHA256 = "88f4cf396111a7aa39b67b63ac58ca406ef5de166bc4bba3e423a29171f701ed"
MIGRATION = "supabase/migrations/20261002100000_football_mapping_single_approver_switch.sql"
MIGRATION_SHA256 = "1fb64a5c5a8a231715663e38159a826842bf00360a058492fce666eb032c904e"

SNAPSHOT_SQL = """
select jsonb_build_object(
  'history_rows', (select count(*) from supabase_migrations.schema_migrations),
  'history_has_switch', (select count(*) from supabase_migrations.schema_migrations where version = '20261002100000'),
  'latest_version', (select max(version) from supabase_migrations.schema_migrations),
  'settings_table', to_regclass('app_private.football_mapping_settings')::text,
  'self_approved_column', (select count(*) from pg_attribute where attrelid = 'app_private.football_player_mapping_proposals'::regclass and attname = 'self_approved' and not attisdropped),
  'two_people_check', (select pg_get_constraintdef(oid) from pg_constraint where conname = 'football_player_mapping_proposals_two_people_check'),
  'proposal_triggers', (select string_agg(tgname, ',' order by tgname) from pg_trigger where tgrelid = 'app_private.football_player_mapping_proposals'::regclass and not tgisinternal),
  'proposal_columns', (select count(*) from information_schema.columns where table_schema = 'app_private' and table_name = 'football_player_mapping_proposals'),
  'proposals_acl', (select relacl::text from pg_class where oid = 'app_private.football_player_mapping_proposals'::regclass),
  'decide_md5', (select md5(pg_get_functiondef('api.admin_football_mapping_decide(uuid,text,text,text,boolean,uuid)'::regprocedure))),
  'execute_md5', (select md5(pg_get_functiondef('api.admin_football_mapping_execute(uuid,uuid)'::regprocedure))),
  'availability_md5', (select md5(pg_get_functiondef('api.admin_football_mapping_reviewer_availability()'::regprocedure))),
  'proposal_json_md5', (select md5(pg_get_functiondef('app_private.football_mapping_proposal_json(app_private.football_player_mapping_proposals,uuid)'::regprocedure))),
  'resolver_md5', (select md5(pg_get_functiondef('api.resolve_football_mapping(text,text,text,uuid,text,timestamp with time zone)'::regprocedure))),
  'decide_acl', (select proacl::text from pg_proc where oid = 'api.admin_football_mapping_decide(uuid,text,text,text,boolean,uuid)'::regprocedure),
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

# Facts that must be identical before and after. busy_sessions is a live read, not a state.
COMPARE_KEYS = [
    "history_rows", "history_has_switch", "latest_version", "settings_table", "self_approved_column",
    "two_people_check", "proposal_triggers", "proposal_columns", "proposals_acl", "decide_md5",
    "execute_md5", "availability_md5", "proposal_json_md5", "resolver_md5", "decide_acl",
    "api_functions", "private_functions", "candidates", "observations", "proposals", "mapping_rows",
    "reviewed_provider_mapping_rows", "mapping_identity_digest", "cron_jobs", "cron_digest",
    "audit_events", "idempotency_keys", "fantasy_table_counts", "gameweek_digest",
]

# What production must look like BEFORE (the script's own preflight checks the same and more).
EXPECT_BEFORE = {
    "history_has_switch": 0, "latest_version": "20261001161000", "settings_table": None,
    "self_approved_column": 0, "proposals": 0, "candidates": 1004, "observations": 1006,
    "mapping_rows": 1541, "reviewed_provider_mapping_rows": 0,
    "decide_md5": "6a23f72de1be2af83ed7d92d3abd40b8",
    "execute_md5": "92ad7b83e9c8225b4c1cc3a9ef21c935",
    "availability_md5": "6df9704512ef417cfc5c2b032ea22a15",
    "proposal_json_md5": "abbf9649618367198d24c12c80e10053",
    "resolver_md5": "c4c7253284afa52aea055f74e3806d73",
    "busy_sessions": 0, "finalizing_gameweeks": 0, "lifecycle_tick_enabled": 0,
}


class RehearsalError(Exception):
    pass


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def redact(text: str, token: str) -> str:
    return text.replace(token, "***") if token else text


def post(token: str, sql: str, read_only: bool, timeout: int) -> Any:
    request = urllib.request.Request(
        f"{API}/v1/projects/{PROJECT_REF}/database/query",
        data=json.dumps({"query": sql, "read_only": read_only}).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "BotolaGO-SingleApproverRehearsal/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise RehearsalError(f"network_error: {redact(str(exc), token)}") from exc


def snapshot(token: str) -> dict[str, Any]:
    status, body = post(token, SNAPSHOT_SQL, True, 60)
    if status not in (200, 201):
        raise RehearsalError(f"snapshot_failed: HTTP {status}: {redact(body[:400], token)}")
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
    script = script_path.read_text(encoding="utf-8")
    lines = script.splitlines()
    if sum(1 for line in lines if line.strip() == "rollback;") != 1:
        raise RehearsalError("the script must contain exactly one top-level rollback;")
    if any(re.fullmatch(r"\s*commit\s*;\s*", line) for line in lines):
        raise RehearsalError("the script contains an active commit; -- rehearsal refused")
    print("Reviewed script and migration verified; rollback; present, no commit;.")

    before = snapshot(token)
    problems = [k for k, v in EXPECT_BEFORE.items() if before.get(k) != v]
    if problems:
        raise RehearsalError("production is not in the reviewed pre-state: " + ", ".join(problems))
    print("Pre-state verified:", json.dumps({k: before[k] for k in EXPECT_BEFORE}, sort_keys=True))

    status, body = post(token, script, False, 110)
    print(f"Script response: HTTP {status}")
    result_text = redact(body[:1500], token)
    print("Script result:", result_text)
    passed = status in (200, 201) and "Rehearsal passed" in body and "Applied." not in body
    # A failing script must still be followed by the independent after-read below.

    after = snapshot(token)
    changed = [k for k in COMPARE_KEYS if before.get(k) != after.get(k)]
    evidence = {
        "script_sha256": SCRIPT_SHA256,
        "migration_sha256": MIGRATION_SHA256,
        "http_status": status,
        "script_result": result_text,
        "rehearsal_passed": passed,
        "before": before,
        "after": after,
        "changed_keys": changed,
        "busy_sessions_after": after.get("busy_sessions"),
    }
    (evidence_dir / "single-approver-rehearsal-evidence.json").write_text(
        json.dumps(evidence, indent=2, sort_keys=True), encoding="utf-8")
    print("After-read changed keys:", changed or "none")
    print("Evidence:", json.dumps({k: after[k] for k in COMPARE_KEYS if k != "fantasy_table_counts"}, sort_keys=True))
    if changed:
        raise RehearsalError("production differs after the rehearsal: " + ", ".join(changed))
    if not passed:
        raise RehearsalError("the rehearsal did not report 'Rehearsal passed'")
    print("REHEARSAL_PASSED_AND_ROLLED_BACK")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RehearsalError as exc:
        print(f"REHEARSAL_FAILED: {exc}")
        sys.exit(2)
