#!/usr/bin/env python3
"""ONE-SHOT real application of the three reviewed dates of birth to Production V2.

Sends the rehearsed script (scripts/backend/data-player-dob-manual-observations.sql)
in ONE request with its single final `rollback;` turned into `commit;` and nothing
else changed, after pinning the rehearsed script and its commit version by sha256
and re-reading production. It never retries. After the call, whatever the client
reports, it reads production again and classifies the outcome:

  THREE_DOB_IMPORT_APPLIED_AND_VERIFIED
  THREE_DOB_IMPORT_FAILED_ROLLED_BACK
  THREE_DOB_IMPORT_OUTCOME_UNVERIFIED
  THREE_DOB_IMPORT_COMMITTED_NEEDS_REVIEW

There is no general import mode: the three players and their dates are fixed in
the reviewed script and checked again here. Nothing is deleted or reverted
automatically. Only counts and digests are read, no names.
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
REHEARSAL_SCRIPT_SHA256 = "1b3bfe4e583d60d85d405f298ee2c5fa16232cd09e3f7adcbef5512803a082ac"
COMMIT_SCRIPT_SHA256 = "e236c0389725a24e6b0a3c4a868918d9476f6ca250a4e5bb5fc2afa6939a77de"

OUT_OK = "THREE_DOB_IMPORT_APPLIED_AND_VERIFIED"
OUT_FAILED = "THREE_DOB_IMPORT_FAILED_ROLLED_BACK"
OUT_UNVERIFIED = "THREE_DOB_IMPORT_OUTCOME_UNVERIFIED"
OUT_REVIEW = "THREE_DOB_IMPORT_COMMITTED_NEEDS_REVIEW"

# The approved records, and the one player who is deliberately NOT in the list.
APPROVED = (
    ("f3e4ac15-2770-48c6-a89f-5d8158404e8b", "2002-05-15"),
    ("96837dad-5250-4fd9-b0ee-8bb0dbd16d17", "2002-12-18"),
    ("721d92d0-1763-43b9-9b9c-54edcc03c07b", "2004-04-15"),
)
EXCLUDED = "d3055da0-73be-4728-8357-b80cf5c4c4e3"
IDS = "(" + ",".join(f"'{pid}'" for pid, _ in APPROVED) + ")"
VALUES = ",".join(f"('{pid}'::uuid, '{dob}')" for pid, dob in APPROVED)

SNAPSHOT_SQL = f"""
select jsonb_build_object(
  'latest_version', (select max(version) from supabase_migrations.schema_migrations),
  'history_rows', (select count(*) from supabase_migrations.schema_migrations),
  'listed_players_found', (select count(*) from app.players where id in {IDS}),
  'listed_players_without_dob', (select count(*) from app.players where id in {IDS} and date_of_birth is null),
  'listed_players_with_reviewed_dob', (select count(*) from app.players p join (values {VALUES}) v(id, dob) on v.id = p.id and p.date_of_birth = v.dob::date),
  'listed_player_dob_observations', (select count(*) from app_private.player_attribute_observations where attribute = 'date_of_birth' and player_id in {IDS}),
  'listed_manual_reviewed_observations', (select count(*) from app_private.player_attribute_observations o join (values {VALUES}) v(id, dob) on v.id = o.player_id where o.attribute = 'date_of_birth' and o.source_kind = 'manual' and o.value_text = v.dob and o.superseded_at is null and o.recorded_by is not null),
  'excluded_player_found', (select count(*) from app.players where id = '{EXCLUDED}'),
  'excluded_player_without_dob', (select count(*) from app.players where id = '{EXCLUDED}' and date_of_birth is null),
  'excluded_player_observations', (select count(*) from app_private.player_attribute_observations where player_id = '{EXCLUDED}'),
  'players', (select count(*) from app.players),
  'players_with_dob', (select count(*) from app.players where date_of_birth is not null),
  'other_players_digest', (select md5(coalesce(string_agg(p::text, '|' order by p.id), '')) from app.players p where p.id not in {IDS}),
  'dob_observations', (select count(*) from app_private.player_attribute_observations where attribute = 'date_of_birth'),
  'attribute_observations', (select count(*) from app_private.player_attribute_observations),
  'other_observations_digest', (select md5(coalesce(string_agg(o::text, '|' order by o.id), '')) from app_private.player_attribute_observations o where o.player_id not in {IDS}),
  'audit_events', (select count(*) from app_private.admin_audit_events),
  'correction_audit_events', (select count(*) from app_private.admin_audit_events where action = 'football.player_attribute_correct'),
  'candidates', (select count(*) from app_private.football_player_mapping_candidates),
  'candidates_digest', (select md5(coalesce(string_agg(c::text, '|' order by c.id), '')) from app_private.football_player_mapping_candidates c),
  'proposals', (select count(*) from app_private.football_player_mapping_proposals),
  'mapping_rows', (select count(*) from app_private.football_provider_mappings),
  'reviewed_provider_mapping_rows', (select count(*) from app_private.football_provider_mappings where provider_name in ('sofascore','flashscore')),
  'mapping_identity_digest', (select md5(coalesce(string_agg(concat_ws(':', m.id, m.provider_name, m.entity_type, m.external_id, m.internal_entity_id, m.active), '|' order by m.id), '')) from app_private.football_provider_mappings m),
  'cron_jobs', (select count(*) from cron.job),
  'cron_digest', (select md5(coalesce(string_agg(jobid::text || ':' || schedule || ':' || command || ':' || active::text, '|' order by jobid), '')) from cron.job),
  'fantasy_table_counts', (select jsonb_object_agg(t.relname, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', 'app', t.relname), false, true, '')))[1]::text::bigint) from pg_class t where t.relnamespace = 'app'::regnamespace and t.relkind = 'r' and t.relname like 'fantasy%'),
  'gameweek_digest', (select md5(coalesce(string_agg(g::text, '|' order by g.id), '')) from app.fantasy_gameweeks g),
  'busy_sessions', (select count(*) from pg_stat_activity where backend_type = 'client backend' and pid <> pg_backend_pid() and state in ('active','idle in transaction','idle in transaction (aborted)'))
) as snapshot
"""

# Production must look exactly like the rehearsal's baseline BEFORE the write.
EXPECT_BEFORE = {
    "latest_version": "20261002110000", "history_rows": 146,
    "listed_players_found": 3, "listed_players_without_dob": 3, "listed_players_with_reviewed_dob": 0,
    "listed_player_dob_observations": 0, "listed_manual_reviewed_observations": 0,
    "excluded_player_found": 1, "excluded_player_without_dob": 1, "excluded_player_observations": 0,
    "players": 993, "players_with_dob": 766, "dob_observations": 766, "attribute_observations": 766,
    "audit_events": 3, "candidates": 1004, "proposals": 0, "mapping_rows": 1541,
    "reviewed_provider_mapping_rows": 0, "cron_jobs": 14, "busy_sessions": 0,
    "candidates_digest": "4495fc80ec3e9bbe4cce284ec1a9a6f4",
    "mapping_identity_digest": "5a3a2a1e748ecdf488f9f98e29f942b5",
    "cron_digest": "5e3bb0b2d3bfc5d697ff50dfe78cfd06",
    "gameweek_digest": "9568bcf1c092fca15a0bdf9a08c117ca",
}

# Must be identical before and after the commit.
UNCHANGED = [
    "latest_version", "history_rows", "players", "other_players_digest", "other_observations_digest",
    "excluded_player_found", "excluded_player_without_dob", "excluded_player_observations",
    "candidates", "candidates_digest", "proposals", "mapping_rows", "reviewed_provider_mapping_rows",
    "mapping_identity_digest", "cron_jobs", "cron_digest", "fantasy_table_counts", "gameweek_digest",
]

EXPECT_AFTER = {
    "listed_players_found": 3, "listed_players_without_dob": 0, "listed_players_with_reviewed_dob": 3,
    "listed_player_dob_observations": 3, "listed_manual_reviewed_observations": 3,
    "players_with_dob": 769, "dob_observations": 769, "attribute_observations": 769, "audit_events": 6,
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
            "User-Agent": "BotolaGO-ThreeDobImportApply/1.0",
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
        raise ApplyError("the import script is not the rehearsed file (sha256 mismatch)")
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
    if EXCLUDED in script:
        raise ApplyError("the excluded player appears in the script")
    return script


def verify(before: dict[str, Any], after: dict[str, Any]) -> list[str]:
    problems = [f"{k}: before={before.get(k)!r} after={after.get(k)!r}" for k in UNCHANGED if before.get(k) != after.get(k)]
    problems += [f"{k}: expected={v!r} got={after.get(k)!r}" for k, v in EXPECT_AFTER.items() if after.get(k) != v]
    if after.get("correction_audit_events") != before.get("correction_audit_events", 0) + 3:
        problems.append("correction audit events did not grow by exactly 3")
    return problems


def write_evidence(directory: Path, data: dict[str, Any]) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "three-dob-import-apply-evidence.json").write_text(
        json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")


def main() -> int:
    repo = Path(os.environ.get("GITHUB_WORKSPACE", ".")).resolve()
    evidence_dir = Path(os.environ.get("EVIDENCE_DIR", repo / "evidence"))
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
    if not token:
        raise ApplyError("missing SUPABASE_ACCESS_TOKEN")
    if os.environ.get("SUPABASE_PRODUCTION_PROJECT_REF") != PROJECT_REF or PROJECT_REF == STAGING_REF:
        raise ApplyError("production project-ref guard failed")
    script = build_commit_script(repo / SCRIPT)
    print("Reviewed script verified; exactly one commit; and no rollback; in the commit version.")

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
        "http_status": call_status, "call_error": call_error, "script_result": result_text, "before": before,
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
    if after.get("listed_player_dob_observations") == 0 and after.get("listed_players_without_dob") == 3:
        # Nothing of the three was written. Rolled back only if nothing else moved either.
        same = all(before.get(k) == after.get(k) for k in before if k != "busy_sessions")
        outcome = OUT_FAILED if same else OUT_UNVERIFIED
        evidence["outcome"] = outcome
        write_evidence(evidence_dir, evidence)
        print(outcome, "- none of the three dates is recorded; production", "matches the pre-state." if same else "DIFFERS from the pre-state.")
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
