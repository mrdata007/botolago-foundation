"""Migration promotion checks use in-memory API responses only."""

import copy
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("current_season_migration", Path(__file__).with_name("current-season-migration.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = MODULE.load_migrations(ROOT)


def environment(directory):
    return {
        "GITHUB_REPOSITORY": "mrdata007/botolago-foundation", "GITHUB_REF": "refs/heads/main",
        "GITHUB_ACTOR": "mrdata007", "GITHUB_EVENT_NAME": "workflow_dispatch", "GITHUB_RUN_ATTEMPT": "1",
        "CURRENT_SEASON_RECOVERY_MODE": "canary", "CONFIRMATION": "RUN_CURRENT_SEASON_RECOVERY",
        "EXPECTED_COMMIT": "a" * 40, "GITHUB_SHA": "a" * 40,
        "SUPABASE_PRODUCTION_PROJECT_REF": MODULE.PROJECT,
        "SUPABASE_PRODUCTION_PROJECT_NAME": "BotolaGO Production V2",
        "SUPABASE_PRODUCTION_URL": f"https://{MODULE.PROJECT}.supabase.co",
        "SUPABASE_ACCESS_TOKEN": "test-management-credential", "CURRENT_SEASON_EVIDENCE_DIR": directory,
    }


def history_row(migration):
    row = {
        "version": migration.version, "name": migration.name,
        "statement_count": 1, "statement_hex": migration.sql.encode().hex(),
        "statements_md5": hashlib.md5(migration.sql.encode()).hexdigest(),
    }
    pinned = MODULE.PROMOTER.EXPECTED_MULTI_STATEMENT_HISTORY.get(migration.version) or MODULE.PROMOTER.EXPECTED_PINNED_SINGLE_STATEMENT_HISTORY.get(migration.version)
    if pinned:
        row.update(name=pinned[0], statement_count=pinned[1], statements_md5=pinned[2], statement_hex=None)
    return row


def baseline():
    return [history_row(MIGRATIONS[name]) for name in MODULE.BASELINE]


class FakeClient:
    def __init__(self, history=None):
        self.history = copy.deepcopy(history if history is not None else baseline())
        self.writes = []

    def get(self, path):
        if path != f"/v1/projects/{MODULE.PROJECT}":
            raise AssertionError("unexpected management endpoint")
        return {"id": MODULE.PROJECT, "name": "BotolaGO Production V2", "region": "eu-west-3", "status": "ACTIVE_HEALTHY"}

    def query(self, sql, *, read_only, timeout=60):
        if not read_only:
            self.writes.append(sql)
            self.history.append(history_row(MIGRATIONS[MODULE.MIGRATION]))
            return []
        if "to_regclass('supabase_migrations.schema_migrations')" in sql:
            return [{"exists": True}]
        if "order by version" in sql:
            return copy.deepcopy(self.history)
        if sql == MODULE.VERIFY_SQL:
            return [{key: True for key in ("routine_present", "anon_denied", "authenticated_denied", "service_allowed", "journal_rls")}]
        raise AssertionError("unexpected SQL")


class MigrationTests(unittest.TestCase):
    def test_only_reviewed_first_owner_canary_can_promote(self):
        valid = environment("/tmp/unused")
        MODULE.guard(valid)
        for change in (
            {"GITHUB_ACTOR": "someone-else"}, {"GITHUB_EVENT_NAME": "schedule"},
            {"CURRENT_SEASON_RECOVERY_MODE": "refresh"}, {"GITHUB_RUN_ATTEMPT": "2"},
            {"GITHUB_REF": "refs/heads/preview"}, {"EXPECTED_COMMIT": "b" * 40},
            {"SUPABASE_PRODUCTION_PROJECT_REF": "wrong-project"}, {"SUPABASE_ACCESS_TOKEN": ""},
        ):
            with self.subTest(change=change), self.assertRaises(MODULE.RecoveryMigrationError):
                MODULE.guard({**valid, **change})

    def test_only_new_migration_is_applied_with_atomic_canonical_history(self):
        client = FakeClient()
        with tempfile.TemporaryDirectory() as directory:
            result = MODULE.promote(environment(directory), ROOT, client)
        self.assertFalse(result["alreadyApplied"])
        self.assertEqual(result["historyCountAfter"], 48)
        self.assertEqual(len(client.writes), 1)
        sql = client.writes[0]
        self.assertTrue(sql.startswith("begin;"))
        self.assertTrue(sql.endswith("commit;"))
        self.assertIn("lock table supabase_migrations.schema_migrations", sql)
        self.assertIn("current_recovery_migration_history_changed", sql)
        self.assertIn(MIGRATIONS[MODULE.MIGRATION].sql, sql)
        self.assertEqual(sql.count("insert into supabase_migrations.schema_migrations"), 1)
        self.assertNotIn("delete from supabase_migrations", sql.lower())
        self.assertNotIn("update supabase_migrations", sql.lower())
        self.assertEqual(client.history[:47], baseline())
        self.assertEqual(bytes.fromhex(client.history[-1]["statement_hex"]), MIGRATIONS[MODULE.MIGRATION].sql.encode())

    def test_identical_already_applied_migration_has_no_writes(self):
        client = FakeClient([*baseline(), history_row(MIGRATIONS[MODULE.MIGRATION])])
        with tempfile.TemporaryDirectory() as directory:
            result = MODULE.promote(environment(directory), ROOT, client)
        self.assertTrue(result["alreadyApplied"])
        self.assertEqual(client.writes, [])

    def test_missing_changed_or_unexpected_history_fails_before_write(self):
        bad_histories = [baseline()[:-1]]
        changed = baseline()
        changed[0]["statement_hex"] = b"changed historical SQL".hex()
        bad_histories.append(changed)
        changed = baseline()
        changed[0]["name"] = "wrong-name"
        bad_histories.append(changed)
        changed = baseline()
        changed[39]["statements_md5"] = "0" * 32
        bad_histories.append(changed)
        wrong_new = history_row(MIGRATIONS[MODULE.MIGRATION])
        wrong_new["statement_hex"] = b"changed migration SQL".hex()
        bad_histories.append([*baseline(), wrong_new])
        wrong_new = history_row(MIGRATIONS[MODULE.MIGRATION])
        wrong_new["version"] = "20260914000000"
        bad_histories.append([*baseline(), wrong_new])
        bad_histories.append([*baseline(), history_row(MIGRATIONS[MODULE.MIGRATION]), wrong_new])
        for rows in bad_histories:
            client = FakeClient(rows)
            with tempfile.TemporaryDirectory() as directory, self.assertRaises(MODULE.RecoveryMigrationError):
                MODULE.promote(environment(directory), ROOT, client)
            self.assertEqual(client.writes, [])

    def test_no_unreviewed_local_migration_inventory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "supabase" / "migrations").mkdir(parents=True)
            with self.assertRaises(MODULE.RecoveryMigrationError):
                MODULE.load_migrations(root)


if __name__ == "__main__":
    unittest.main()
