#!/usr/bin/env python3
"""Run the reviewed player-mapping backend script against Production V2 as a REHEARSAL.

The script is run exactly as it is in the repository: its final `rollback;` is
unchanged and nothing is saved. This runner only
  * refuses to run unless the script, its three embedded migrations and the
    target project are the reviewed ones and the script still ends in `rollback;`
    (it never contains an active `commit;`),
  * reads a snapshot of production before and after (read-only queries),
  * sends the whole script in ONE request, and
  * fails unless the script's own result row says "Rehearsal passed" and the
    snapshot after is identical to the snapshot before.

It cannot commit: there is no code path here that edits the script.
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
SCRIPT_SHA256 = "b323cf0d1dd447b6e0ca97296777e315b349b5923560adaecc4f906365e74022"
MIGRATIONS = {
    "supabase/migrations/20261001150000_register_sofascore_flashscore_providers.sql":
        "0259c253dd732a80479659d0227588cc1b6178154fe71c407f951cf4ab84f8ff",
    "supabase/migrations/20261001160000_football_player_mapping_tables.sql":
        "9377693f2c93836e211c6988de72dc7edafeee16d8a3d8edea1cf11fcc452005",
    "supabase/migrations/20261001161000_football_player_mapping_functions.sql":
        "74e38306009dff996e12e191057232a269ef961c2e1176b330adbb268d4f0406",
}

SNAPSHOT_SQL = """
select jsonb_build_object(
  'history_rows', (select count(*) from supabase_migrations.schema_migrations),
  'new_history_rows', (select count(*) from supabase_migrations.schema_migrations
      where version in ('20261001150000','20261001160000','20261001161000')),
  'latest_version', (select max(version) from supabase_migrations.schema_migrations),
  'providers', (select string_agg(name, ',' order by name) from app_private.football_providers),
  'provider_digest', (select md5(coalesce(string_agg(p::text, '|' order by p.name), '')) from app_private.football_providers p),
  'mapping_rows', (select count(*) from app_private.football_provider_mappings),
  'reviewed_provider_mapping_rows', (select count(*) from app_private.football_provider_mappings where provider_name in ('sofascore','flashscore')),
  'mapping_identity_digest', (select md5(coalesce(string_agg(concat_ws(':', m.id, m.provider_name, m.entity_type, m.external_id, m.internal_entity_id, m.active), '|' order by m.id), '')) from app_private.football_provider_mappings m),
  'constraint_digest', (select md5(string_agg(conname || ':' || pg_get_constraintdef(oid) || ':' || condeferrable::text, '|' order by conname)) from pg_constraint where conrelid = 'app_private.football_provider_mappings'::regclass),
  'index_digest', (select md5(coalesce(string_agg(indexdef, '|' order by indexname), '')) from pg_indexes where schemaname = 'app_private' and tablename = 'football_provider_mappings'),
  'trigger_digest', (select md5(coalesce(string_agg(pg_get_triggerdef(oid), '|' order by tgname), '')) from pg_trigger where tgrelid = 'app_private.football_provider_mappings'::regclass and not tgisinternal),
  'mapping_table_acl', (select relacl::text from pg_class where oid = 'app_private.football_provider_mappings'::regclass),
  'resolver_md5', (select md5(pg_get_functiondef('api.resolve_football_mapping(text,text,text,uuid,text,timestamp with time zone)'::regprocedure))),
  'resolver_acl', (select proacl::text from pg_proc where oid = 'api.resolve_football_mapping(text,text,text,uuid,text,timestamp with time zone)'::regprocedure),
  'new_tables', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'app_private' and c.relname like 'football_player_mapping%'),
  'new_functions', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('api','app_private') and (p.proname like 'football_mapping%' or p.proname like 'admin_football_mapping%')),
  'api_functions', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'api'),
  'private_functions', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app_private'),
  'cron_jobs', (select count(*) from cron.job),
  'cron_digest', (select md5(coalesce(string_agg(jobid::text || ':' || schedule || ':' || command || ':' || active::text, '|' order by jobid), '')) from cron.job),
  'audit_events', (select count(*) from app_private.admin_audit_events),
  'idempotency_keys', (select count(*) from app_private.admin_idempotency_keys),
  'fantasy_counts', jsonb_build_object(
    'seasons', (select count(*) from app.fantasy_seasons),
    'gameweeks', (select count(*) from app.fantasy_gameweeks),
    'players', (select count(*) from app.fantasy_players),
    'teams', (select count(*) from app.fantasy_teams),
    'lineup_players', (select count(*) from app.fantasy_lineup_players),
    'fixture_assignments', (select count(*) from app.fantasy_fixture_assignments),
    'player_gameweek_points', (select count(*) from app.fantasy_player_gameweek_points),
    'player_point_events', (select count(*) from app.fantasy_player_point_events),
    'team_gameweek_results', (select count(*) from app.fantasy_team_gameweek_results)),
  'gameweek_digest', (select md5(coalesce(string_agg(g::text, '|' order by g.id), '')) from app.fantasy_gameweeks g),
  'busy_sessions', (select count(*) from pg_stat_activity where backend_type = 'client backend' and pid <> pg_backend_pid() and state in ('active','idle in transaction','idle in transaction (aborted)')),
  'finalizing_gameweeks', (select count(*) from app.fantasy_gameweeks where status = 'finalizing')
) as snapshot
"""

# Facts that must be identical before and after. busy_sessions is a live read, not a state.
COMPARE_KEYS = [
    "history_rows", "new_history_rows", "latest_version", "providers", "provider_digest",
    "mapping_rows", "reviewed_provider_mapping_rows", "mapping_identity_digest",
    "constraint_digest", "index_digest", "trigger_digest", "mapping_table_acl",
    "resolver_md5", "resolver_acl", "new_tables", "new_functions", "api_functions",
    "private_functions", "cron_jobs", "cron_digest", "audit_events", "idempotency_keys",
    "fantasy_counts", "gameweek_digest",
]

# What production must look like BEFORE (the script's own preflight checks the same and more).
EXPECT_BEFORE = {
    "new_history_rows": 0, "providers": "fixture,sportsmonks",
    "reviewed_provider_mapping_rows": 0, "new_tables": 0, "new_functions": 0,
    "constraint_digest": "84d45fbd1c71c689561c39afe04094c9",
    "resolver_md5": "5d7ad20856e2bb22e2b7d44741e21be1",
    "latest_version": "20261001071120", "busy_sessions": 0, "finalizing_gameweeks": 0,
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
            "User-Agent": "BotolaGO-MappingBackendRehearsal/1.0",
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
    for rel, expected in MIGRATIONS.items():
        if sha256(repo / rel) != expected:
            raise RehearsalError(f"{rel} is not the reviewed migration (sha256 mismatch)")
    script = script_path.read_text(encoding="utf-8")
    lines = script.splitlines()
    if sum(1 for line in lines if line.strip() == "rollback;") != 1:
        raise RehearsalError("the script must contain exactly one top-level rollback;")
    if any(re.fullmatch(r"\s*commit\s*;\s*", line) for line in lines):
        raise RehearsalError("the script contains an active commit; -- rehearsal refused")
    print("Reviewed script and migrations verified; rollback; present, no commit;.")

    before = snapshot(token)
    problems = [k for k, v in EXPECT_BEFORE.items() if before.get(k) != v]
    if problems:
        raise RehearsalError("production is not in the reviewed pre-state: " + ", ".join(problems))
    print("Pre-state verified:", json.dumps({k: before[k] for k in EXPECT_BEFORE}, sort_keys=True))

    status, body = post(token, script, False, 170)
    print(f"Script response: HTTP {status}")
    result_text = redact(body[:1500], token)
    print("Script result:", result_text)
    passed = status in (200, 201) and "Rehearsal passed" in body and "Applied." not in body
    # A failing script must still be followed by the independent after-read below.

    after = snapshot(token)
    changed = [k for k in COMPARE_KEYS if before.get(k) != after.get(k)]
    evidence = {
        "script_sha256": SCRIPT_SHA256,
        "migrations": MIGRATIONS,
        "http_status": status,
        "script_result": result_text,
        "rehearsal_passed": passed,
        "before": before,
        "after": after,
        "changed_keys": changed,
        "busy_sessions_after": after.get("busy_sessions"),
    }
    (evidence_dir / "mapping-backend-rehearsal-evidence.json").write_text(
        json.dumps(evidence, indent=2, sort_keys=True), encoding="utf-8")
    print("After-read changed keys:", changed or "none")
    print("Evidence:", json.dumps({k: after[k] for k in COMPARE_KEYS if k != "fantasy_counts"}, sort_keys=True))
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
