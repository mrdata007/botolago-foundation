#!/usr/bin/env python3
"""Run the reviewed switch-ON script against Production V2 as a REHEARSAL.

The script is run exactly as it is in the repository: its final `rollback;` is
unchanged and nothing is saved. This runner only refuses to run unless the script
is the reviewed file and still ends in `rollback;` (it never contains an active
`commit;`), reads a snapshot of production before and after (read-only; counts
and digests only, no names), sends the script in ONE request, and fails unless the
script says "Rehearsal passed" and the snapshot after is identical to the one
before, switch included. It cannot commit.
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
SCRIPT_SHA256 = "b45ca1bfa2bc0bf0d9101c1f775b0dac76bd0fbdcb97358688d3ed6bbcbae0dd"

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

COMPARE_KEYS = [k for k in EXPECT_BEFORE if k != "busy_sessions"]


class RehearsalError(Exception):
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
            "User-Agent": "BotolaGO-SwitchOnRehearsal/1.0",
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
    value = json.loads(body)[0]["snapshot"]
    return value if isinstance(value, dict) else json.loads(value)


def main() -> int:
    repo = Path(os.environ.get("GITHUB_WORKSPACE", ".")).resolve()
    evidence_dir = Path(os.environ.get("EVIDENCE_DIR", repo / "evidence"))
    evidence_dir.mkdir(parents=True, exist_ok=True)
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
    if not token:
        raise RehearsalError("missing SUPABASE_ACCESS_TOKEN")
    if os.environ.get("SUPABASE_PRODUCTION_PROJECT_REF") != PROJECT_REF or PROJECT_REF == STAGING_REF:
        raise RehearsalError("production project-ref guard failed")

    raw = (repo / SCRIPT).read_bytes()
    if sha256_bytes(raw) != SCRIPT_SHA256:
        raise RehearsalError("the switch-ON script is not the reviewed file (sha256 mismatch)")
    lines = raw.decode("utf-8").split("\n")
    if sum(1 for line in lines if line.strip() == "rollback;") != 1:
        raise RehearsalError("the script must contain exactly one top-level rollback;")
    if any(re.fullmatch(r"\s*commit\s*;\s*", line) for line in lines):
        raise RehearsalError("the script contains an active commit; -- rehearsal refused")
    script = raw.decode("utf-8")
    print("Reviewed script verified; rollback; present, no commit;.")

    before = snapshot(token)
    problems = [k for k, v in EXPECT_BEFORE.items() if before.get(k) != v]
    if problems:
        raise RehearsalError("production is not in the reviewed pre-state: " + ", ".join(problems))
    print("Pre-state verified (switch OFF, one executed proposal, nothing open, 1,542 mappings, first mapping digest).")

    status, body = post(token, script, False, 110)
    print(f"Script response: HTTP {status}")
    result_text = redact(body[:1500], token)
    print("Script result:", result_text)
    passed = status in (200, 201) and "Rehearsal passed" in body and "Applied." not in body

    after = snapshot(token)
    changed = [k for k in COMPARE_KEYS if before.get(k) != after.get(k)]
    evidence = {
        "script_sha256": SCRIPT_SHA256, "http_status": status, "script_result": result_text,
        "rehearsal_passed": passed, "before": before, "after": after, "changed_keys": changed,
    }
    (evidence_dir / "switch-on-rehearsal-evidence.json").write_text(
        json.dumps(evidence, indent=2, sort_keys=True), encoding="utf-8")
    print("After-read changed keys:", changed or "none")
    print("Switch after the rehearsal (must still be off):", after.get("switch"))
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
