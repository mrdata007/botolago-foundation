from __future__ import annotations

import base64
import importlib.util
import sys
import tempfile
import unittest
import unittest.mock
from pathlib import Path
from typing import Any


SCRIPT = Path(__file__).resolve().parents[1] / "staging-database-update.py"
SPEC = importlib.util.spec_from_file_location("staging_database_update", SCRIPT)
assert SPEC and SPEC.loader
UPDATE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = UPDATE
SPEC.loader.exec_module(UPDATE)


def migration(version: str, name: str, sql: str = "select 1;") -> Any:
    return UPDATE.Migration(f"{version}_{name}.sql", version, name, sql)


class FakeTarget:
    """Records executed SQL; fails any script that contains a marker."""

    label = "fake"

    def __init__(self, history: list[dict[str, str]], fail_marker: str | None = None):
        self.history = list(history)
        self.fail_marker = fail_marker
        self.executed: list[str] = []
        self.profile = {key: 0 for key in UPDATE.SEED_PROFILE}
        self.compute_variant = "ci_large"

    def compute(self) -> str:
        return self.compute_variant

    def rows(self, sql: str) -> list[dict[str, Any]]:
        if "schema_migrations" in sql:
            return list(self.history)
        if "pg_stat_activity" in sql:
            return [{"count": 0}]
        return [dict(self.profile)]

    def execute(self, sql: str, timeout: int) -> list[dict[str, Any]]:
        self.executed.append(sql)
        if self.fail_marker and self.fail_marker in sql:
            raise UPDATE.UpdateError("ERROR: planted failure")
        if sql.startswith("begin;") and sql.rstrip().endswith("commit;"):
            for line in sql.splitlines():
                if line.startswith("insert into supabase_migrations.schema_migrations"):
                    values = line.split("values ('", 1)[1]
                    version, rest = values.split("', '", 1)
                    self.history.append({"version": version, "name": rest.split("'", 1)[0]})
        if "fantasy-staging-seed" in sql or "capacity_environment" in sql:
            self.profile = dict(UPDATE.SEED_PROFILE)
        return []


class PendingTests(unittest.TestCase):
    def test_a_migration_recorded_under_another_version_is_not_pending(self) -> None:
        migrations = [
            migration("20260921120000", "fantasy_leagues_anon_callable_signature"),
            migration("20260921140000", "news_article_detail_not_found_status"),
        ]
        history = [
            {"version": "20260921174423", "name": "fantasy_leagues_anon_callable_signature"},
            {"version": "20260921152527", "name": "news_engine_core"},
        ]
        pending = UPDATE.pending_migrations(migrations, history)
        self.assertEqual([m.name for m in pending], ["news_article_detail_not_found_status"])

    def test_deferred_migrations_are_skipped(self) -> None:
        migrations = [
            migration("20260925090400", "predictions_scoring"),
            migration("20260925090500", "fantasy_league_page_skip_empty"),
        ]
        pending = UPDATE.pending_migrations(migrations, [])
        self.assertEqual([m.name for m in pending], ["predictions_scoring"])

    def test_a_version_recorded_under_another_name_is_refused(self) -> None:
        migrations = [migration("20260921140000", "news_article_detail_not_found_status")]
        history = [{"version": "20260921140000", "name": "something_else"}]
        with self.assertRaises(UPDATE.UpdateError):
            UPDATE.pending_migrations(migrations, history)

    def test_plan_reports_staging_only_history(self) -> None:
        target = FakeTarget([{"version": "20260921152527", "name": "news_engine_core"}])
        report = UPDATE.run_plan(target, [migration("20260921140000", "a")])
        self.assertEqual(report["stagingOnly"], ["news_engine_core"])
        self.assertEqual(report["pending"], ["20260921140000_a.sql"])
        self.assertNotIn("seed", report)


class RehearsalTests(unittest.TestCase):
    def test_rehearsal_stops_after_the_first_enum_value_added(self) -> None:
        pending = [
            migration("1" * 14, "a"),
            migration("2" * 14, "b", "alter type app.notification_type add value 'x';"),
            migration("3" * 14, "c"),
        ]
        self.assertEqual([m.name for m in UPDATE.rehearsable(pending)], ["a", "b"])

    def test_first_failing_finds_the_smallest_failing_prefix(self) -> None:
        pending = [migration(f"{index:014d}", f"m{index}") for index in range(1, 12)]

        def attempt(prefix: list[Any]) -> str | None:
            return "boom" if len(prefix) >= 7 else None

        failing, error = UPDATE.first_failing(pending, attempt, "boom")
        self.assertEqual(failing.name, "m7")
        self.assertEqual(error, "boom")

    def test_rehearsal_sql_rolls_back(self) -> None:
        sql = UPDATE.rehearsal_sql([migration("1" * 14, "a")])
        self.assertTrue(sql.startswith("begin;"))
        self.assertTrue(sql.rstrip().endswith("rollback;"))
        self.assertNotIn("commit;", sql)

    def test_rehearse_names_the_failing_migration(self) -> None:
        target = FakeTarget([], fail_marker="planted_marker")
        migrations = [
            migration("1" * 14, "a"),
            migration("2" * 14, "b", "select 'planted_marker';"),
            migration("3" * 14, "c"),
        ]
        with self.assertRaisesRegex(UPDATE.UpdateError, "at 22222222222222_b.sql"):
            UPDATE.run_rehearse(target, migrations)
        self.assertTrue(all(sql.rstrip().endswith("rollback;") for sql in target.executed))


class ApplyTests(unittest.TestCase):
    def test_apply_records_each_migration_and_stops_at_the_first_failure(self) -> None:
        target = FakeTarget([], fail_marker="planted_marker")
        migrations = [
            migration("1" * 14, "a"),
            migration("2" * 14, "b", "select 'planted_marker';"),
            migration("3" * 14, "c"),
        ]
        with self.assertRaisesRegex(UPDATE.UpdateError, "22222222222222_b.sql failed"):
            UPDATE.run_apply(target, migrations)
        self.assertEqual([row["name"] for row in target.history], ["a"])
        self.assertFalse(any("select 1;" in sql and "'c'" in sql for sql in target.executed))

    def test_apply_then_nothing_is_pending(self) -> None:
        target = FakeTarget([])
        migrations = [migration("1" * 14, "a"), migration("2" * 14, "b")]
        report = UPDATE.run_apply(target, migrations)
        self.assertEqual(report["applied"], ["11111111111111_a.sql", "22222222222222_b.sql"])
        self.assertEqual(report["pending"], [])
        self.assertIn("notify pgrst", target.executed[-1])

    def test_history_row_carries_the_exact_file(self) -> None:
        sql = "create function x() returns text language sql as $$ select 'it''s' $$;\n"
        row = UPDATE.history_row_sql(migration("1" * 14, "a", sql))
        encoded = row.split("decode('", 1)[1].split("'", 1)[0]
        self.assertEqual(base64.b64decode(encoded).decode("utf-8"), sql)

    def test_apply_wraps_each_migration_in_one_transaction(self) -> None:
        sql = UPDATE.apply_sql(migration("1" * 14, "a"))
        self.assertTrue(sql.startswith("begin;"))
        self.assertTrue(sql.rstrip().endswith("commit;"))
        self.assertIn("insert into supabase_migrations.schema_migrations", sql)


class SeedTests(unittest.TestCase):
    def test_seed_refuses_while_migrations_are_pending(self) -> None:
        target = FakeTarget([])
        with self.assertRaisesRegex(UPDATE.UpdateError, "apply the pending migrations first"):
            UPDATE.run_seed(target, [migration("1" * 14, "a")])
        self.assertEqual(target.executed, [])

    def test_seed_runs_under_its_staging_guard_once(self) -> None:
        target = FakeTarget([{"version": "1" * 14, "name": "a"}])
        report = UPDATE.run_seed(target, [migration("1" * 14, "a")])
        self.assertTrue(report["ran"])
        self.assertIn("'botolago.capacity_environment', 'staging-v2'", target.executed[0])
        again = UPDATE.run_seed(target, [migration("1" * 14, "a")])
        self.assertFalse(again["ran"])

    def test_check_fails_until_the_seed_is_loaded(self) -> None:
        target = FakeTarget([{"version": "1" * 14, "name": "a"}])
        with self.assertRaisesRegex(UPDATE.UpdateError, "seed is not loaded"):
            UPDATE.run_check(target, [migration("1" * 14, "a")])
        target.profile = dict(UPDATE.SEED_PROFILE)
        self.assertTrue(UPDATE.run_check(target, [migration("1" * 14, "a")])["seedLoaded"])


class ComputeTests(unittest.TestCase):
    def test_variant_ids_match_dashboard_names(self) -> None:
        self.assertTrue(UPDATE.compute_matches("ci_large", "Large"))
        self.assertTrue(UPDATE.compute_matches("ci_xlarge", "XL"))
        self.assertTrue(UPDATE.compute_matches("ci_2xlarge", "2XL"))
        self.assertFalse(UPDATE.compute_matches("ci_micro", "Large"))
        self.assertFalse(UPDATE.compute_matches("ci_xlarge", "Large"))

    def test_check_refuses_a_smaller_staging(self) -> None:
        target = FakeTarget([{"version": "1" * 14, "name": "a"}])
        target.profile = dict(UPDATE.SEED_PROFILE)
        target.compute_variant = "ci_micro"
        with unittest.mock.patch.dict("os.environ", {"BOTOLAGO_EXPECTED_STAGING_COMPUTE": "Large"}):
            with self.assertRaisesRegex(UPDATE.UpdateError, "runs on ci_micro, not Large"):
                UPDATE.run_check(target, [migration("1" * 14, "a")])
            target.compute_variant = "ci_large"
            self.assertTrue(UPDATE.run_check(target, [migration("1" * 14, "a")])["seedLoaded"])
            target.compute_variant = "unknown"
            report = UPDATE.run_check(target, [migration("1" * 14, "a")])
            self.assertIn("computeWarning", report)


class TargetGuardTests(unittest.TestCase):
    def test_production_and_legacy_are_refused_before_any_request(self) -> None:
        for ref in (UPDATE.PRODUCTION_REF, UPDATE.LEGACY_REF, "abcdefghijklmnopqrst"):
            with self.assertRaises(UPDATE.UpdateError):
                UPDATE.ManagementTarget("token-not-used", ref)

    def test_local_target_must_be_on_this_machine(self) -> None:
        with self.assertRaises(UPDATE.UpdateError):
            UPDATE.LocalTarget("postgresql://postgres:x@db.example.com:5432/postgres")
        self.assertEqual(
            UPDATE.LocalTarget("postgresql://postgres:x@127.0.0.1:55322/postgres").label,
            "local database",
        )

    def test_errors_never_carry_credentials(self) -> None:
        text = UPDATE.sanitize(
            "Authorization: Bearer sbp_abc123 postgresql://postgres:pw@127.0.0.1/db eyJhbGciOi.x.y"
        )
        self.assertNotIn("sbp_abc123", text)
        self.assertNotIn(":pw@", text)
        self.assertNotIn("eyJhbGciOi", text)


class RepositoryTests(unittest.TestCase):
    def test_repository_migrations_load(self) -> None:
        migrations = UPDATE.load_migrations()
        self.assertGreater(len(migrations), 100)
        for filename in UPDATE.DEFERRED:
            self.assertIn(filename, {m.filename for m in migrations})

    def test_a_migration_that_commits_is_refused(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "20260101000000_bad.sql"
            path.write_text("create table x ();\ncommit;\n")
            with self.assertRaisesRegex(UPDATE.UpdateError, "controls its own transaction"):
                UPDATE.load_migrations(Path(directory))


if __name__ == "__main__":
    unittest.main()
