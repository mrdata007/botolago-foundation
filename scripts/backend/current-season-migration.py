"""Promote only the reviewed current-squad migration with canonical history."""

from __future__ import annotations

import base64
import importlib.util
import json
import os
from pathlib import Path
import re
import sys

_SPEC = importlib.util.spec_from_file_location(
    "botolago_migration_promoter",
    Path(__file__).with_name("phase7e-production-migration-promoter.py"),
)
PROMOTER = importlib.util.module_from_spec(_SPEC)
sys.modules[_SPEC.name] = PROMOTER
_SPEC.loader.exec_module(PROMOTER)

PROJECT = "tkewgajrljbwgwedqsxn"
MIGRATION = "20260914182621_current_season_squad_recovery.sql"
BASELINE = tuple(name for batch in PROMOTER.BATCHES.values() for name in batch)
VERSION = "20260914182621"
FUNCTION = "api.service_ingest_current_football_squads(text,text,jsonb,timestamptz)"


class RecoveryMigrationError(Exception):
    pass


def guard(environment):
    expected = environment.get("EXPECTED_COMMIT", "")
    if (
        environment.get("GITHUB_REPOSITORY") != "mrdata007/botolago-foundation"
        or environment.get("GITHUB_REF") != "refs/heads/main"
        or environment.get("GITHUB_ACTOR") != "mrdata007"
        or environment.get("GITHUB_EVENT_NAME") != "workflow_dispatch"
        or environment.get("GITHUB_RUN_ATTEMPT") != "1"
        or environment.get("CURRENT_SEASON_RECOVERY_MODE", "canary") != "canary"
        or environment.get("CONFIRMATION") != "RUN_CURRENT_SEASON_RECOVERY"
        or not re.fullmatch(r"[0-9a-f]{40}", expected)
        or expected != environment.get("GITHUB_SHA")
    ):
        raise RecoveryMigrationError("IMMUTABLE_OWNER_CANARY_REQUIRED")
    if (
        environment.get("SUPABASE_PRODUCTION_PROJECT_REF") != PROJECT
        or environment.get("SUPABASE_PRODUCTION_PROJECT_NAME") != "BotolaGO Production V2"
        or environment.get("SUPABASE_PRODUCTION_URL", "").rstrip("/") != f"https://{PROJECT}.supabase.co"
    ):
        raise RecoveryMigrationError("PRODUCTION_TARGET_MISMATCH")
    token = environment.get("SUPABASE_ACCESS_TOKEN", "")
    if not token or re.search(r"\s", token):
        raise RecoveryMigrationError("PROTECTED_MANAGEMENT_CREDENTIAL_REQUIRED")
    if not environment.get("CURRENT_SEASON_EVIDENCE_DIR"):
        raise RecoveryMigrationError("EVIDENCE_DIRECTORY_REQUIRED")
    return token


def load_migrations(root):
    directory = root / "supabase" / "migrations"
    if len(BASELINE) != 47 or sorted(path.name for path in directory.glob("*.sql")) != sorted((*BASELINE, MIGRATION)):
        raise RecoveryMigrationError("REVIEWED_MIGRATION_INVENTORY_MISMATCH")
    return {name: PROMOTER.migration_from_path(directory / name) for name in (*BASELINE, MIGRATION)}


def assert_history(history, migrations):
    """Preserve all 47 established canonical or explicitly pinned checksums."""
    if len(history) not in (47, 48):
        raise RecoveryMigrationError("MIGRATION_HISTORY_LENGTH_MISMATCH")
    try:
        completed = PROMOTER.assert_history("release_activation", history[:47], migrations)
        if completed != len(PROMOTER.BATCHES["release_activation"]):
            raise RecoveryMigrationError("BASELINE_MIGRATIONS_INCOMPLETE")
        if len(history) == 48:
            migration = migrations[MIGRATION]
            row = history[47]
            if (
                row.get("version") != VERSION
                or row.get("name") != migration.name
                or row.get("statement_count") != 1
                or bytes.fromhex(row.get("statement_hex", "")) != migration.sql.encode("utf-8")
            ):
                raise RecoveryMigrationError("CURRENT_MIGRATION_HISTORY_MISMATCH")
    except (PROMOTER.PromotionError, TypeError, ValueError) as error:
        raise RecoveryMigrationError("MIGRATION_HISTORY_CHECKSUM_MISMATCH") from error
    return len(history) == 48


def build_transaction(migration, history):
    # Reuse the existing CLI-compatible history writer. Lock and recheck the
    # verified prefix in its transaction so concurrent schema promotion cannot
    # change the chain between preflight and application.
    keys = ("version", "name", "statement_count", "statements_md5")
    snapshot = [{key: row[key] for key in keys} for row in history]
    encoded = base64.b64encode(json.dumps(snapshot).encode()).decode()
    check = f"""
lock table supabase_migrations.schema_migrations in share row exclusive mode;
do $current_recovery_history$
begin
  if (select jsonb_agg(jsonb_build_object(
      'version', version, 'name', coalesce(name, ''),
      'statement_count', coalesce(array_length(statements, 1), 0),
      'statements_md5', md5(array_to_string(coalesce(statements, array[]::text[]), E'\\n'))
    ) order by version) from supabase_migrations.schema_migrations)
    is distinct from convert_from(decode('{encoded}', 'base64'), 'UTF8')::jsonb
  then
    raise exception 'current_recovery_migration_history_changed';
  end if;
end;
$current_recovery_history$;
"""
    return PROMOTER.build_transaction(migration).replace(
        "set local statement_timeout = '120s';",
        "set local statement_timeout = '120s';\n" + check,
        1,
    )


VERIFY_SQL = f"""
select
 to_regprocedure('{FUNCTION}') is not null as routine_present,
 not has_function_privilege('anon', '{FUNCTION}', 'execute') as anon_denied,
 not has_function_privilege('authenticated', '{FUNCTION}', 'execute') as authenticated_denied,
 has_function_privilege('service_role', '{FUNCTION}', 'execute') as service_allowed,
 (select relrowsecurity and relforcerowsecurity from pg_class
   where oid='app_private.current_football_squad_imports'::regclass) as journal_rls;
"""


def promote(environment, root, client=None):
    token = guard(environment)
    migrations = load_migrations(root)
    client = client or PROMOTER.ManagementClient(token, PROJECT)
    project = client.get(f"/v1/projects/{PROJECT}")
    if not isinstance(project, dict) or (
        (project.get("id") or project.get("ref")) != PROJECT
        or project.get("name") != "BotolaGO Production V2"
        or project.get("region") != "eu-west-3"
        or project.get("status") != "ACTIVE_HEALTHY"
    ):
        raise RecoveryMigrationError("MANAGEMENT_TARGET_NOT_HEALTHY")
    before = PROMOTER.read_history(client)
    already_applied = assert_history(before, migrations)
    if not already_applied:
        client.query(build_transaction(migrations[MIGRATION], before), read_only=False, timeout=180)
    after = PROMOTER.read_history(client)
    if not assert_history(after, migrations):
        raise RecoveryMigrationError("CURRENT_MIGRATION_NOT_RECORDED")
    rows = client.query(VERIFY_SQL, read_only=True)
    required = ("routine_present", "anon_denied", "authenticated_denied", "service_allowed", "journal_rls")
    if len(rows) != 1 or any(rows[0].get(key) is not True for key in required):
        raise RecoveryMigrationError("CURRENT_MIGRATION_SECURITY_VERIFICATION_FAILED")
    evidence = {
        "verdict": "pass", "projectRef": PROJECT, "expectedCommit": environment["EXPECTED_COMMIT"],
        "migration": MIGRATION, "version": VERSION, "sha256": migrations[MIGRATION].sha256,
        "alreadyApplied": already_applied, "historyCountBefore": len(before), "historyCountAfter": len(after),
        "securityVerified": True,
    }
    PROMOTER.write_json(Path(environment["CURRENT_SEASON_EVIDENCE_DIR"]) / "current-season-migration.json", evidence)
    return evidence


def main():
    try:
        result = promote(os.environ, Path(__file__).resolve().parents[2])
        print("CURRENT_SEASON_MIGRATION_PASS alreadyApplied=" + str(result["alreadyApplied"]).lower())
        return 0
    except RecoveryMigrationError as error:
        print("CURRENT_SEASON_MIGRATION_FAIL code=" + str(error), file=sys.stderr)
    except Exception:
        # Never print management responses, SQL bodies or protected credentials.
        print("CURRENT_SEASON_MIGRATION_FAIL code=MANAGEMENT_OR_RUNTIME_FAILURE", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
