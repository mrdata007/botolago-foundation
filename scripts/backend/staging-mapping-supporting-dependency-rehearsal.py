#!/usr/bin/env python3
"""Rehearse the supporting-dependency guard on STAGING, exactly, and roll everything back.

What runs, in ONE transaction that never commits:
  1. the only prerequisite staging lacks: migration 20261002100000 (the single-approver switch),
     the repository file byte for byte;
  2. the guard migration 20261003120000, the repository file byte for byte, including its
     plain DROP FUNCTION (nothing is renamed, softened or cascaded);
  3. checks that the nine functions it creates or replaces are the reviewed text with the
     reviewed grants, and that the old compute signature is gone with no legacy copy;
  4. the repository's own pgTAP file for the guard, on synthetic accounts and data created
     inside the transaction: a valid Flashscore propose, approve and execute; a supporting
     mapping changed after approval refused at execution; a missing dependency refused on a
     direct call; the actual-row read's authorisation; Sofascore behaviour unchanged;
  5. a deliberate error that carries the result out (STAGING_REHEARSAL_REPORT) and rolls
     everything back.
Before and after, the runner reads staging (read-only) and fails unless the two reads are
identical: no residual schema change, no synthetic account or row. The runner refuses any
project but staging. There is no commit path, and no other migration is applied.
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

STAGING_REF = "srdrflfrfpwixsllveid"
PRODUCTION_REF = "tkewgajrljbwgwedqsxn"
API = "https://api.supabase.com"
PREREQUISITE = "supabase/migrations/20261002100000_football_mapping_single_approver_switch.sql"
PREREQUISITE_SHA256 = "1fb64a5c5a8a231715663e38159a826842bf00360a058492fce666eb032c904e"
MIGRATION = "supabase/migrations/20261003120000_football_mapping_supporting_dependency.sql"
MIGRATION_SHA256 = "d435bde5d9ca114a17f94786178b1f4261ff3b8e8c65f8d8f8fcbd70baa18577"
TEST = "supabase/tests/database/football_player_mapping_supporting_dependency.test.sql"
TEST_SHA256 = "5fea61e9a7e70a9fc29e6e6549a98731a9c45969a906b16a4ce8fe4440866a2b"
EXPECTED_ASSERTIONS = 81
MARKER = "STAGING_REHEARSAL_REPORT"

# The nine functions the guard migration creates or replaces: reviewed text and grants.
GUARD_FUNCTIONS = [
    ("api.admin_football_mapping_execute(uuid,uuid)", "88afdf18716d1ce9e472c00a9220d278", "{postgres=X/postgres,authenticated=X/postgres}"),
    ("api.admin_football_mapping_get_provider_mapping(text,text)", "67b1d19d4f1b75d109c202d8b611935b", "{postgres=X/postgres,authenticated=X/postgres}"),
    ("api.admin_football_mapping_propose(jsonb,text,uuid)", "c5d31dea4ee9163016b634f8b752f2a4", "{postgres=X/postgres,authenticated=X/postgres}"),
    ("api.admin_football_mapping_refresh_evidence(uuid,uuid)", "98693148fae7e37a1be6a8fe3349ef50", "{postgres=X/postgres,authenticated=X/postgres}"),
    ("app_private.football_mapping_compute(text,uuid,uuid,text,uuid,uuid,text,uuid,uuid,text,uuid,jsonb)", "3a46795f47ad32dab78a40167c7e0c61", "{postgres=X/postgres}"),
    ("app_private.football_mapping_proposal_guard()", "1f02e38bd45644b23489d866481befcc", "{postgres=X/postgres}"),
    ("app_private.football_mapping_revalidate(uuid)", "8e1ab9a983db4846932fbc580dbf59aa", "{postgres=X/postgres}"),
    ("app_private.football_mapping_supporting_dependency(text,uuid,uuid)", "f86e4e6cc17c59f444016b0ddacba9ff", "{postgres=X/postgres}"),
    ("app_private.football_mapping_supporting_state(uuid)", "0ef7dfd0a98b3dda7015ea6fc47342c1", "{postgres=X/postgres}"),
]

PRE_SQL = """
do $stg_pre$
begin
  if not exists (select 1 from supabase_migrations.schema_migrations
      where name in ('news_engine_core', 'news_engine_seed', 'fantasy_incremental_envelope_fail_closed')) then
    raise exception 'stop: no staging-only migration is recorded -- this does not look like STAGING';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version in ('20261002100000', '20261003120000')) then
    raise exception 'stop: the prerequisite or the guard is already recorded on staging';
  end if;
  if (select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations where version >= '20261001') is distinct from '20261001150000,20261001160000,20261001161000' then
    raise exception 'stop: staging has other player-mapping-era migrations than the three reviewed ones';
  end if;
  if exists (select 1 from app_private.football_player_mapping_proposals)
    or exists (select 1 from app_private.football_player_mapping_candidates)
    or exists (select 1 from app_private.football_provider_mappings where provider_name in ('sofascore', 'flashscore')) then
    raise exception 'stop: staging holds mapping data -- the synthetic rehearsal assumes it holds none';
  end if;
  if exists (select 1 from pg_stat_activity where pid <> pg_backend_pid() and backend_type = 'client backend'
      and state in ('active', 'idle in transaction', 'idle in transaction (aborted)')) then
    raise exception 'stop: another database session is working on staging right now (one writer at a time)';
  end if;
end
$stg_pre$;
"""

POST_SQL_HEAD = """
do $stg_post$
declare
  v record;
  problems text[] := '{}';
begin
  if to_regprocedure('app_private.football_mapping_compute(text,uuid,uuid,text,uuid,uuid,text,uuid,uuid)') is not null then
    problems := problems || 'the old nine-argument compute function still exists'::text;
  end if;
  if (select count(*) from pg_proc p where p.pronamespace in ('api'::regnamespace, 'app_private'::regnamespace, 'public'::regnamespace)
        and p.proname ilike '%football_mapping_compute%') <> 1 then
    problems := problems || 'there is not exactly one compute function (a legacy copy remains?)'::text;
  end if;
  for v in select * from (values
"""
POST_SQL_TAIL = """
  ) as t(signature, expected_md5, expected_acl)
  loop
    if to_regprocedure(v.signature) is null then
      problems := problems || (v.signature || ' does not exist')::text;
    else
      if md5(pg_get_functiondef(v.signature::regprocedure)) <> v.expected_md5 then
        problems := problems || (v.signature || ' is not the reviewed text')::text;
      end if;
      if (select proacl::text from pg_proc where oid = v.signature::regprocedure) is distinct from v.expected_acl then
        problems := problems || (v.signature || ' has unexpected grants')::text;
      end if;
    end if;
  end loop;
  if cardinality(problems) > 0 then
    raise exception 'stop: staging postflight failed: %', array_to_string(problems, '; ');
  end if;
end
$stg_post$;
"""

# The pgTAP file's assertions are routed through three wrappers that call the real pgTAP function
# and also record the description of each, so a failure can be named in the report.
WRAPPERS_SQL = """
create temporary table t_results (n serial primary key, ok boolean not null, descr text);
create function pg_temp.t_is(a anyelement, b anyelement, d text) returns text language plpgsql as $$
declare r text;
begin
  r := extensions.is(a, b, d);
  insert into t_results (ok, descr) values (r like 'ok%', d);
  return r;
end $$;
create function pg_temp.t_ok(c boolean, d text) returns text language plpgsql as $$
declare r text;
begin
  r := extensions.ok(c, d);
  insert into t_results (ok, descr) values (r like 'ok%', d);
  return r;
end $$;
create function pg_temp.t_throws(q text, c text, m text, d text) returns text language plpgsql as $$
declare r text;
begin
  r := extensions.throws_ok(q, c::char(5), m, d);
  insert into t_results (ok, descr) values (r like 'ok%', d);
  return r;
end $$;
"""

REPORT_SQL = """
do $stg_report$
declare r jsonb;
begin
  select jsonb_build_object('total', count(*), 'passed', count(*) filter (where ok), 'failed', count(*) filter (where not ok),
    'failures', coalesce(jsonb_agg(descr order by n) filter (where not ok), '[]'::jsonb),
    'descriptions', jsonb_agg(descr order by n))
  into r from t_results;
  raise exception '__MARKER__ %', r::text using errcode = 'P0001';
end
$stg_report$;
"""

SNAPSHOT_SQL = """
select jsonb_build_object(
  'history_rows', (select count(*) from supabase_migrations.schema_migrations),
  'latest_version', (select max(version) from supabase_migrations.schema_migrations),
  'mapping_era_versions', (select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations where version >= '20261001'),
  'compute_signatures', (select string_agg(p.oid::regprocedure::text, ' ; ' order by p.oid::regprocedure::text) from pg_proc p where p.proname ilike '%football_mapping_compute%'),
  'guard_functions', (select count(*) from pg_proc p where p.proname in ('football_mapping_supporting_state', 'football_mapping_supporting_dependency', 'admin_football_mapping_get_provider_mapping')),
  'guard_columns', (select count(*) from pg_attribute where attrelid = 'app_private.football_player_mapping_proposals'::regclass and attname in ('evidence_class', 'supporting_mapping_id') and not attisdropped),
  'settings_table', to_regclass('app_private.football_mapping_settings')::text,
  'self_approved_columns', (select count(*) from pg_attribute where attrelid = 'app_private.football_player_mapping_proposals'::regclass and attname = 'self_approved' and not attisdropped),
  'two_people_check', (select pg_get_constraintdef(oid) from pg_constraint where conname = 'football_player_mapping_proposals_two_people_check'),
  'function_md5', (select jsonb_object_agg(p.oid::regprocedure::text, md5(pg_get_functiondef(p.oid))) from pg_proc p where p.pronamespace in ('api'::regnamespace, 'app_private'::regnamespace) and p.proname like '%football_mapping%'),
  'function_acls', (select jsonb_object_agg(p.oid::regprocedure::text, p.proacl::text) from pg_proc p where p.pronamespace in ('api'::regnamespace, 'app_private'::regnamespace) and p.proname like '%football_mapping%'),
  'api_functions', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'api'),
  'private_functions', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app_private'),
  'mapping_tables', jsonb_build_object(
    'mappings', (select count(*) from app_private.football_provider_mappings),
    'proposals', (select count(*) from app_private.football_player_mapping_proposals),
    'candidates', (select count(*) from app_private.football_player_mapping_candidates),
    'observations', (select count(*) from app_private.football_player_mapping_observations)),
  'proposal_columns', (select count(*) from information_schema.columns where table_schema = 'app_private' and table_name = 'football_player_mapping_proposals'),
  'proposal_constraints', (select md5(string_agg(conname || '=' || pg_get_constraintdef(oid), '|' order by conname)) from pg_constraint where conrelid = 'app_private.football_player_mapping_proposals'::regclass),
  'proposal_triggers', (select string_agg(tgname, ',' order by tgname) from pg_trigger where tgrelid = 'app_private.football_player_mapping_proposals'::regclass and not tgisinternal),
  'proposal_indexes', (select string_agg(indexname, ',' order by indexname) from pg_indexes where schemaname = 'app_private' and tablename = 'football_player_mapping_proposals'),
  'synthetic_residue', jsonb_build_object(
    'auth_users', (select count(*) from auth.users),
    'auth_sessions', (select count(*) from auth.sessions),
    'auth_mfa_factors', (select count(*) from auth.mfa_factors),
    'staff_principals', (select count(*) from app_private.staff_principals),
    'staff_role_assignments', (select count(*) from app_private.staff_role_assignments),
    'players', (select count(*) from app.players),
    'teams', (select count(*) from app.teams),
    'team_memberships', (select count(*) from app.team_memberships),
    'audit_events', (select count(*) from app_private.admin_audit_events),
    'idempotency_keys', (select count(*) from app_private.admin_idempotency_keys),
    'player_attribute_observations', (select count(*) from app_private.player_attribute_observations)),
  'content_digests', jsonb_build_object(
    'players', (select md5(coalesce(string_agg(p::text, '|' order by p.id), '')) from app.players p),
    'teams', (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app.teams t),
    'staff_principals', (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app_private.staff_principals t),
    'permissions', (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app_private.admin_permissions t),
    'roles', (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app_private.admin_roles t)),
  'cron_digest', (select md5(coalesce(string_agg(jobid::text || ':' || schedule || ':' || command || ':' || active::text, '|' order by jobid), '')) from cron.job),
  'busy_sessions', (select count(*) from pg_stat_activity where backend_type = 'client backend' and pid <> pg_backend_pid() and state in ('active','idle in transaction','idle in transaction (aborted)'))
) as snapshot
"""

COMPARE_KEYS = [
    "history_rows", "latest_version", "mapping_era_versions", "compute_signatures", "guard_functions",
    "guard_columns", "settings_table", "self_approved_columns", "two_people_check", "function_md5",
    "function_acls", "api_functions", "private_functions", "mapping_tables", "proposal_columns",
    "proposal_constraints", "proposal_triggers", "proposal_indexes", "synthetic_residue",
    "content_digests", "cron_digest",
]

# Staging as inspected: the prerequisite and the guard are both absent.
EXPECT_BEFORE = {
    "mapping_era_versions": "20261001150000,20261001160000,20261001161000",
    "compute_signatures": "app_private.football_mapping_compute(text,uuid,uuid,text,uuid,uuid,text,uuid,uuid)",
    "guard_functions": 0, "guard_columns": 0, "settings_table": None, "self_approved_columns": 0,
    "mapping_tables": {"mappings": 0, "proposals": 0, "candidates": 0, "observations": 0},
    "busy_sessions": 0,
}


class RehearsalError(Exception):
    pass


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def redact(text: str, token: str) -> str:
    return text.replace(token, "***") if token else text


def post(token: str, sql: str, read_only: bool, timeout: int) -> tuple[int | None, str, str]:
    request = urllib.request.Request(
        f"{API}/v1/projects/{STAGING_REF}/database/query",
        data=json.dumps({"query": sql, "read_only": read_only}).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "BotolaGO-StagingSupportingDependencyRehearsal/1.0",
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
    """Which kind of answer this was, from the evidence in it."""
    if kind == "transport":
        return "transport_error_no_answer"
    lowered = body.lower()
    if MARKER in body:
        return "report_raised_by_the_script"
    if status in (200, 201):
        return "completed_without_report"
    if "57014" in body or "statement timeout" in lowered or "canceling statement" in lowered:
        return "database_statement_timeout"
    if "55p03" in lowered or "lock timeout" in lowered:
        return "database_lock_timeout"
    if status in (401, 403):
        return "api_refused_authorisation"
    if status in (408, 502, 503, 504):
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


def values_sql() -> str:
    def lit(text: str) -> str:
        return "'" + text.replace("'", "''") + "'"
    return ",\n".join(f"    ({lit(s)}, {lit(m)}, {lit(a)})" for s, m, a in GUARD_FUNCTIONS)


def transform_test(test: str) -> str:
    """The pgTAP file, routed through the recording wrappers and without its own begin/finish/rollback."""
    body = test.replace("begin;\n", "", 1)
    body = body.replace("extensions.is(", "pg_temp.t_is(").replace("extensions.ok(", "pg_temp.t_ok(")
    body = body.replace("extensions.throws_ok(", "pg_temp.t_throws(")
    tail = "select * from extensions.finish();\nrollback;"
    if not body.rstrip().endswith(tail):
        raise RehearsalError("the pgTAP file no longer ends the way this runner expects")
    body = body.rstrip()[: -len(tail)]
    if "extensions.is(" in body or "extensions.ok(" in body or "extensions.throws_ok(" in body:
        raise RehearsalError("an assertion escaped the recording wrappers")
    return body


def build_script(repo: Path, include_prerequisite: bool = True) -> str:
    parts = ["begin;", "set local lock_timeout = '10s';", "set local statement_timeout = '300s';", PRE_SQL]
    if include_prerequisite:
        parts += ["-- The only prerequisite staging lacks, the repository file byte for byte.",
                  (repo / PREREQUISITE).read_text(encoding="utf-8")]
    parts += ["-- The guard migration, the repository file byte for byte, including its DROP FUNCTION.",
              (repo / MIGRATION).read_text(encoding="utf-8"),
              POST_SQL_HEAD + values_sql() + POST_SQL_TAIL,
              WRAPPERS_SQL, transform_test((repo / TEST).read_text(encoding="utf-8")),
              REPORT_SQL.replace("__MARKER__", MARKER), "rollback;"]
    return "\n".join(parts)


def error_message(body: str) -> str:
    """The database message inside the API's JSON error, or the body itself."""
    try:
        document = json.loads(body)
    except json.JSONDecodeError:
        return body
    message = document.get("message") if isinstance(document, dict) else None
    return message if isinstance(message, str) else body


def parse_report(body: str) -> dict[str, Any]:
    match = re.search(MARKER + r" (\{[^\n]*\})", error_message(body))
    if not match:
        raise RehearsalError("the script did not return its report")
    return json.loads(match.group(1))


def main() -> int:
    repo = Path(os.environ.get("GITHUB_WORKSPACE", ".")).resolve()
    evidence_dir = Path(os.environ.get("EVIDENCE_DIR", repo / "evidence"))
    evidence_dir.mkdir(parents=True, exist_ok=True)
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
    if not token:
        raise RehearsalError("missing SUPABASE_ACCESS_TOKEN")
    if os.environ.get("SUPABASE_STAGING_PROJECT_REF") != STAGING_REF or STAGING_REF == PRODUCTION_REF:
        raise RehearsalError("staging project-ref guard failed")
    for path, expected in ((PREREQUISITE, PREREQUISITE_SHA256), (MIGRATION, MIGRATION_SHA256), (TEST, TEST_SHA256)):
        if sha256(repo / path) != expected:
            raise RehearsalError(f"{path} is not the reviewed file (sha256 mismatch)")
    migration_text = (repo / MIGRATION).read_text(encoding="utf-8")
    if len(re.findall(r"(?im)^\s*drop\s+function\b", migration_text)) != 1 or re.search(r"(?i)\bcascade\b", migration_text):
        raise RehearsalError("the migration is not the reviewed DROP FUNCTION without CASCADE")
    script = build_script(repo)
    script_sha = hashlib.sha256(script.encode("utf-8")).hexdigest()
    print("Files verified; assembled script sha256:", script_sha)

    before = snapshot(token)
    problems = [k for k, v in EXPECT_BEFORE.items() if before.get(k) != v]
    if problems:
        raise RehearsalError("staging is not in the inspected state: " + ", ".join(problems)
                             + " | " + json.dumps({k: before.get(k) for k in problems}, sort_keys=True))
    print("Staging pre-state verified.")

    status, body, kind = post(token, script, False, 280)
    outcome = classify(status, body, kind)
    print(f"Script response: HTTP {status} ({outcome})")
    report: dict[str, Any] | None = None
    if outcome == "report_raised_by_the_script":
        report = parse_report(body)
        print("Report:", json.dumps({k: report[k] for k in ("total", "passed", "failed", "failures")}, sort_keys=True))
    else:
        print("Script answer:", redact(body[:1500], token))

    after = snapshot(token)
    changed = [k for k in COMPARE_KEYS if before.get(k) != after.get(k)]
    evidence = {
        "assembled_script_sha256": script_sha, "migration_sha256": MIGRATION_SHA256, "prerequisite_sha256": PREREQUISITE_SHA256,
        "test_sha256": TEST_SHA256, "http_status": status, "outcome_class": outcome, "report": report,
        "before": before, "after": after, "changed_keys": changed,
    }
    (evidence_dir / "staging-supporting-dependency-rehearsal-evidence.json").write_text(
        json.dumps(evidence, indent=2, sort_keys=True), encoding="utf-8")
    print("After-read changed keys:", changed or "none")
    if changed:
        raise RehearsalError("staging differs after the rehearsal: " + ", ".join(changed))
    if report is None:
        raise RehearsalError(f"no report came back ({outcome}); staging is unchanged (after-read)")
    if report["failed"] != 0 or report["total"] != EXPECTED_ASSERTIONS:
        raise RehearsalError(f"assertions: {report['passed']}/{report['total']} passed, failures: {report['failures']}")
    print("STAGING_REHEARSAL_PASSED_AND_ROLLED_BACK")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RehearsalError as exc:
        print(f"REHEARSAL_FAILED: {exc}")
        sys.exit(2)
