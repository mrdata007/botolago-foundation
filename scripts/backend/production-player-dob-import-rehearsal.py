#!/usr/bin/env python3
"""Run the reviewed date-of-birth import script against Production V2 as a REHEARSAL.

The script is run exactly as it is in the repository: its final `rollback;` is
unchanged and nothing is saved. This runner only
  * refuses to run unless the script and the target project are the reviewed
    ones and the script still ends in `rollback;` (it never contains an active
    `commit;`),
  * reads a snapshot of production before and after (read-only queries; counts
    and digests only, no names and no dates),
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
SCRIPT = "scripts/backend/data-player-dob-manual-observations.sql"
SCRIPT_SHA256 = "1b3bfe4e583d60d85d405f298ee2c5fa16232cd09e3f7adcbef5512803a082ac"

PLAYERS = "('f3e4ac15-2770-48c6-a89f-5d8158404e8b','96837dad-5250-4fd9-b0ee-8bb0dbd16d17','721d92d0-1763-43b9-9b9c-54edcc03c07b')"

SNAPSHOT_SQL = """
select jsonb_build_object(
  'latest_version', (select max(version) from supabase_migrations.schema_migrations),
  'history_rows', (select count(*) from supabase_migrations.schema_migrations),
  'listed_players_found', (select count(*) from app.players where id in %s),
  'listed_players_without_dob', (select count(*) from app.players where id in %s and date_of_birth is null),
  'listed_player_dob_observations', (select count(*) from app_private.player_attribute_observations where attribute = 'date_of_birth' and player_id in %s),
  'players', (select count(*) from app.players),
  'players_digest', (select md5(coalesce(string_agg(p::text, '|' order by p.id), '')) from app.players p),
  'players_with_dob', (select count(*) from app.players where date_of_birth is not null),
  'dob_observations', (select count(*) from app_private.player_attribute_observations where attribute = 'date_of_birth'),
  'attribute_observations', (select count(*) from app_private.player_attribute_observations),
  'observations_digest', (select md5(coalesce(string_agg(o::text, '|' order by o.id), '')) from app_private.player_attribute_observations o),
  'correct_holders', (select count(*) from app_private.staff_principals sp where sp.status = 'active' and app_private.admin_has_permission(sp.id, 'football.correct')),
  'audit_events', (select count(*) from app_private.admin_audit_events),
  'candidates', (select count(*) from app_private.football_player_mapping_candidates),
  'candidates_digest', (select md5(coalesce(string_agg(c::text, '|' order by c.id), '')) from app_private.football_player_mapping_candidates c),
  'proposals', (select count(*) from app_private.football_player_mapping_proposals),
  'mapping_rows', (select count(*) from app_private.football_provider_mappings),
  'mapping_identity_digest', (select md5(coalesce(string_agg(concat_ws(':', m.id, m.provider_name, m.entity_type, m.external_id, m.internal_entity_id, m.active), '|' order by m.id), '')) from app_private.football_provider_mappings m),
  'cron_jobs', (select count(*) from cron.job),
  'cron_digest', (select md5(coalesce(string_agg(jobid::text || ':' || schedule || ':' || command || ':' || active::text, '|' order by jobid), '')) from cron.job),
  'fantasy_table_counts', (select jsonb_object_agg(t.relname, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %%I.%%I', 'app', t.relname), false, true, '')))[1]::text::bigint) from pg_class t where t.relnamespace = 'app'::regnamespace and t.relkind = 'r' and t.relname like 'fantasy%%'),
  'gameweek_digest', (select md5(coalesce(string_agg(g::text, '|' order by g.id), '')) from app.fantasy_gameweeks g),
  'busy_sessions', (select count(*) from pg_stat_activity where backend_type = 'client backend' and pid <> pg_backend_pid() and state in ('active','idle in transaction','idle in transaction (aborted)'))
) as snapshot
""" % (PLAYERS, PLAYERS, PLAYERS)

# Facts that must be identical before and after. busy_sessions is a live read, not a state.
COMPARE_KEYS = [
    "latest_version", "history_rows", "listed_players_found", "listed_players_without_dob",
    "listed_player_dob_observations", "players", "players_digest", "players_with_dob", "dob_observations",
    "attribute_observations", "observations_digest", "correct_holders", "audit_events", "candidates",
    "candidates_digest", "proposals", "mapping_rows", "mapping_identity_digest", "cron_jobs", "cron_digest",
    "fantasy_table_counts", "gameweek_digest",
]

# What production must look like BEFORE (the script's own preflight checks the same and more).
EXPECT_BEFORE = {
    "latest_version": "20261002110000", "listed_players_found": 3, "listed_players_without_dob": 3,
    "listed_player_dob_observations": 0, "correct_holders": 1, "proposals": 0, "busy_sessions": 0,
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
            "User-Agent": "BotolaGO-DobImportRehearsal/1.0",
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
        raise RehearsalError("the import script is not the reviewed file (sha256 mismatch)")
    script = script_path.read_text(encoding="utf-8")
    lines = script.splitlines()
    if sum(1 for line in lines if line.strip() == "rollback;") != 1:
        raise RehearsalError("the script must contain exactly one top-level rollback;")
    if any(re.fullmatch(r"\s*commit\s*;\s*", line) for line in lines):
        raise RehearsalError("the script contains an active commit; -- rehearsal refused")
    print("Reviewed script verified; rollback; present, no commit;.")

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
        "http_status": status,
        "script_result": result_text,
        "rehearsal_passed": passed,
        "before": before,
        "after": after,
        "changed_keys": changed,
        "busy_sessions_after": after.get("busy_sessions"),
    }
    (evidence_dir / "dob-import-rehearsal-evidence.json").write_text(
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
