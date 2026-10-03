#!/usr/bin/env python3
"""ONE-SHOT real application of the switch-ON (single-operator mapping mode) to Production V2.

Sends the rehearsed script in ONE request with its single final `rollback;` turned
into `commit;` (and nothing else changed), after pinning the rehearsed script and
its commit version by sha256 and re-reading production. It never retries. After the
call, whatever the client reports, it reads production again and classifies:

  SINGLE_OPERATOR_SWITCH_ON_APPLIED_AND_VERIFIED
  SINGLE_OPERATOR_SWITCH_ON_FAILED_ROLLED_BACK
  SINGLE_OPERATOR_SWITCH_ON_OUTCOME_UNVERIFIED
  SINGLE_OPERATOR_SWITCH_ON_COMMITTED_NEEDS_REVIEW

Nothing is reverted automatically. Only counts and digests are read, no names.
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
SCRIPT = "scripts/backend/data-mapping-single-approver-switch-on.sql"
REHEARSAL_SCRIPT_SHA256 = "b45ca1bfa2bc0bf0d9101c1f775b0dac76bd0fbdcb97358688d3ed6bbcbae0dd"
COMMIT_SCRIPT_SHA256 = "e747160ed600041825b6ad1732dd86655cfe32e57ca1ca80c955d72ccfdc35a9"

OUT_OK = "SINGLE_OPERATOR_SWITCH_ON_APPLIED_AND_VERIFIED"
OUT_FAILED = "SINGLE_OPERATOR_SWITCH_ON_FAILED_ROLLED_BACK"
OUT_UNVERIFIED = "SINGLE_OPERATOR_SWITCH_ON_OUTCOME_UNVERIFIED"
OUT_REVIEW = "SINGLE_OPERATOR_SWITCH_ON_COMMITTED_NEEDS_REVIEW"

SNAPSHOT_SQL = """
select jsonb_build_object(
  'latest_version', (select max(version) from supabase_migrations.schema_migrations),
  'history_rows', (select count(*) from supabase_migrations.schema_migrations),
  'settings_rows', (select count(*) from app_private.football_mapping_settings),
  'switch', (select allow_self_approval from app_private.football_mapping_settings where singleton),
  'settings_updated_at', (select updated_at::text from app_private.football_mapping_settings where singleton),
  'proposals', (select count(*) from app_private.football_player_mapping_proposals),
  'executed_proposals', (select count(*) from app_private.football_player_mapping_proposals where status = 'executed'),
  'open_proposals', (select count(*) from app_private.football_player_mapping_proposals where status in ('pending','approved','position_disagreement','stale_evidence')),
  'proposals_digest', (select md5(coalesce(string_agg(p::text, '|' order by p.id), '')) from app_private.football_player_mapping_proposals p),
  'mapping_rows', (select count(*) from app_private.football_provider_mappings),
  'reviewed_provider_mapping_rows', (select count(*) from app_private.football_provider_mappings where provider_name in ('sofascore','flashscore')),
  'first_mapping_row_digest', (select md5(m::text) from app_private.football_provider_mappings m where m.provider_name = 'sofascore' and m.external_id = '359280' and m.internal_entity_id = '6c06addc-4cdc-4598-ba94-42221728122b' and m.active),
  'mappings_digest', (select md5(coalesce(string_agg(m::text, '|' order by m.id), '')) from app_private.football_provider_mappings m),
  'candidates', (select count(*) from app_private.football_player_mapping_candidates),
  'candidates_digest', (select md5(coalesce(string_agg(c::text, '|' order by c.id), '')) from app_private.football_player_mapping_candidates c),
  'mapping_observations', (select count(*) from app_private.football_player_mapping_observations),
  'mapping_observations_digest', (select md5(coalesce(string_agg(o::text, '|' order by o.id), '')) from app_private.football_player_mapping_observations o),
  'audit_events', (select count(*) from app_private.admin_audit_events),
  'audit_digest', (select md5(coalesce(string_agg(a::text, '|' order by a.id), '')) from app_private.admin_audit_events a),
  'idempotency_keys', (select count(*) from app_private.admin_idempotency_keys),
  'players', (select count(*) from app.players),
  'players_digest', (select md5(coalesce(string_agg(p::text, '|' order by p.id), '')) from app.players p),
  'attribute_observations_digest', (select md5(coalesce(string_agg(o::text, '|' order by o.id), '')) from app_private.player_attribute_observations o),
  'cron_jobs', (select count(*) from cron.job),
  'cron_digest', (select md5(coalesce(string_agg(jobid::text || ':' || schedule || ':' || command || ':' || active::text, '|' order by jobid), '')) from cron.job),
  'fantasy_table_counts', (select jsonb_object_agg(t.relname, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', 'app', t.relname), false, true, '')))[1]::text::bigint) from pg_class t where t.relnamespace = 'app'::regnamespace and t.relkind = 'r' and t.relname like 'fantasy%'),
  'gameweek_digest', (select md5(coalesce(string_agg(g::text, '|' order by g.id), '')) from app.fantasy_gameweeks g),
  'decide_md5', (select md5(pg_get_functiondef('api.admin_football_mapping_decide(uuid,text,text,text,boolean,uuid)'::regprocedure))),
  'execute_md5', (select md5(pg_get_functiondef('api.admin_football_mapping_execute(uuid,uuid)'::regprocedure))),
  'availability_md5', (select md5(pg_get_functiondef('api.admin_football_mapping_reviewer_availability()'::regprocedure))),
  'proposal_json_md5', (select md5(pg_get_functiondef('app_private.football_mapping_proposal_json(app_private.football_player_mapping_proposals,uuid)'::regprocedure))),
  'self_decision_trigger', (select count(*) from pg_trigger where tgrelid = 'app_private.football_player_mapping_proposals'::regclass and tgname = 'football_player_mapping_proposals_self_decision_guard' and not tgisinternal),
  'finalizing_gameweeks', (select count(*) from app.fantasy_gameweeks where status = 'finalizing'),
  'busy_sessions', (select count(*) from pg_stat_activity where backend_type = 'client backend' and pid <> pg_backend_pid() and state in ('active','idle in transaction','idle in transaction (aborted)'))
) as snapshot
"""

# Production must look exactly like this BEFORE the change (the script's own preflight checks the same and more).
EXPECT_BEFORE = {
    "attribute_observations_digest": "91bc16b2876bd59faeff409789e3ff4b",
    "audit_digest": "6843d79681f74ebc3c2199a460eb2392",
    "audit_events": 9,
    "availability_md5": "449d1b206047f95df01cee5328772edb",
    "busy_sessions": 0,
    "candidates": 1004,
    "candidates_digest": "4eaaad979f6e5db2355b599e162371f4",
    "cron_digest": "5e3bb0b2d3bfc5d697ff50dfe78cfd06",
    "cron_jobs": 14,
    "decide_md5": "b20ebace94787e95c67c40181feabf80",
    "execute_md5": "1c0951a9f61cf0baa2970b720b90cfb4",
    "executed_proposals": 1,
    "fantasy_table_counts": {
        "fantasy_auto_substitutions": 0,
        "fantasy_chip_rules": 20,
        "fantasy_chip_uses": 3,
        "fantasy_competitions": 1,
        "fantasy_deadline_rules": 4,
        "fantasy_fixture_assignments": 16,
        "fantasy_fixture_difficulty_rules": 3,
        "fantasy_fixture_rules": 4,
        "fantasy_free_hit_snapshot_players": 0,
        "fantasy_free_hit_snapshots": 0,
        "fantasy_gameweeks": 2,
        "fantasy_league_memberships": 2,
        "fantasy_leagues": 2,
        "fantasy_lineup_players": 105,
        "fantasy_lineups": 7,
        "fantasy_player_gameweek_points": 623,
        "fantasy_player_point_events": 2004,
        "fantasy_player_price_history": 623,
        "fantasy_players": 623,
        "fantasy_position_rules": 16,
        "fantasy_positions": 4,
        "fantasy_price_rules": 4,
        "fantasy_prize_settings": 0,
        "fantasy_prize_skips": 0,
        "fantasy_prize_winners": 0,
        "fantasy_prizes": 3,
        "fantasy_ranking_tiebreak_rules": 24,
        "fantasy_rankings": 16,
        "fantasy_ruleset_features": 4,
        "fantasy_rulesets": 4,
        "fantasy_scoring_rules": 48,
        "fantasy_seasons": 1,
        "fantasy_squad_memberships": 109,
        "fantasy_team_gameweek_results": 6,
        "fantasy_teams": 7,
        "fantasy_transfer_batches": 4,
        "fantasy_transfers": 4
    },
    "first_mapping_row_digest": "41e82d12a6a5dc65516ac91dad70c605",
    "gameweek_digest": "9568bcf1c092fca15a0bdf9a08c117ca",
    "history_rows": 146,
    "idempotency_keys": 3,
    "latest_version": "20261002110000",
    "mapping_observations": 1006,
    "mapping_observations_digest": "87e2150d69156581926fb21cc2263c7e",
    "mapping_rows": 1542,
    "mappings_digest": "ddd0f17b081892d7b5ce39026b0f5a94",
    "open_proposals": 0,
    "players": 993,
    "players_digest": "ee36b7bc300dcdc83ee36bb10e6dd516",
    "proposal_json_md5": "6a8c59637e47817876622e163a2b53b2",
    "proposals": 1,
    "proposals_digest": "c76c1e3124d30e330a5e2b6fc8ea8ed8",
    "reviewed_provider_mapping_rows": 1,
    "self_decision_trigger": 1,
    "finalizing_gameweeks": 0,
    "settings_rows": 1,
    "settings_updated_at": "2026-10-02 13:15:58.121803+00",
    "switch": False
}

UNCHANGED = [
    "latest_version",
    "history_rows",
    "settings_rows",
    "settings_updated_at",
    "proposals",
    "executed_proposals",
    "finalizing_gameweeks",
    "open_proposals",
    "proposals_digest",
    "mapping_rows",
    "reviewed_provider_mapping_rows",
    "first_mapping_row_digest",
    "mappings_digest",
    "candidates",
    "candidates_digest",
    "mapping_observations",
    "mapping_observations_digest",
    "audit_events",
    "audit_digest",
    "idempotency_keys",
    "players",
    "players_digest",
    "attribute_observations_digest",
    "cron_jobs",
    "cron_digest",
    "gameweek_digest",
    "decide_md5",
    "execute_md5",
    "availability_md5",
    "proposal_json_md5",
    "self_decision_trigger",
    "fantasy_table_counts"
]



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
            "User-Agent": "BotolaGO-SwitchOnApply/1.0",
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
        raise ApplyError("the switch-ON script is not the rehearsed file (sha256 mismatch)")
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
    if after.get("switch") is not True:
        problems.append(f"switch: expected=True got={after.get('switch')!r}")
    return problems


def write_evidence(directory: Path, data: dict[str, Any]) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "switch-on-apply-evidence.json").write_text(
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
    print("Pre-state verified (switch OFF, one executed proposal, nothing open, 1,542 mappings, first mapping digest).")

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
    if after.get("switch") is False:
        same = all(before.get(k) == after.get(k) for k in before if k != "busy_sessions")
        outcome = OUT_FAILED if same else OUT_UNVERIFIED
        evidence["outcome"] = outcome
        write_evidence(evidence_dir, evidence)
        print(outcome, "- the switch is still OFF; production", "matches the pre-state." if same else "DIFFERS from the pre-state.")
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
