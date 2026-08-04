from __future__ import annotations

import base64
import hashlib
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "phase7e-production-migration-promoter.py"
SPEC = importlib.util.spec_from_file_location("phase7e_promoter", SCRIPT)
assert SPEC and SPEC.loader
PROMOTER = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = PROMOTER
SPEC.loader.exec_module(PROMOTER)


class Phase7EProductionMigrationPromoterTests(unittest.TestCase):
    def test_batches_cover_the_exact_ordered_migration_chain(self) -> None:
        expected = sorted(
            path.name
            for path in (Path(__file__).resolve().parents[3] / "supabase" / "migrations").glob("*.sql")
        )
        actual = [filename for files in PROMOTER.BATCHES.values() for filename in files]
        self.assertEqual(expected, sorted(actual))
        versions = [filename.split("_", 1)[0] for filename in actual]
        self.assertEqual(versions, sorted(versions))
        self.assertEqual(47, len(actual))
        self.assertEqual(47, len(set(actual)))
        self.assertEqual(
            (
                "20260803173344_fantasy_preactivation_hardening.sql",
                "20260803210943_fantasy_catalog_activation.sql",
                "20260803212218_elbotola_metadata_ingestion.sql",
            ),
            PROMOTER.BATCHES["release_activation"],
        )

    def test_transaction_preserves_exact_sql_and_history_metadata(self) -> None:
        sql = "create schema app;\nselect '✓';\n"
        raw = sql.encode()
        migration = PROMOTER.Migration(
            filename="20260719215811_greenfield_foundation.sql",
            version="20260719215811",
            name="greenfield_foundation",
            sql=sql,
            sha256=hashlib.sha256(raw).hexdigest(),
        )
        transaction = PROMOTER.build_transaction(migration)
        encoded = base64.b64encode(raw).decode()
        self.assertTrue(transaction.startswith("begin;"))
        self.assertTrue(transaction.endswith("commit;"))
        self.assertIn("set local lock_timeout = '4s';", transaction)
        self.assertIn("set local statement_timeout = '120s';", transaction)
        self.assertIn(sql, transaction)
        self.assertIn(encoded, transaction)
        self.assertIn("'20260719215811'", transaction)
        self.assertIn("'greenfield_foundation'", transaction)
        self.assertIn("supabase_migrations.schema_migrations", transaction)

    def test_history_accepts_only_an_exact_selected_batch_prefix(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            migration_dir = root / "supabase" / "migrations"
            migration_dir.mkdir(parents=True)
            for files in PROMOTER.BATCHES.values():
                for filename in files:
                    (migration_dir / filename).write_text(f"-- {filename}\n", encoding="utf-8")
            migrations = PROMOTER.load_migrations(root)
            foundation = migrations[PROMOTER.BATCHES["foundation"][0]]
            valid = [
                {
                    "version": foundation.version,
                    "name": foundation.name,
                    "statement_count": 1,
                    "statement_hex": foundation.sql.encode("utf-8").hex(),
                }
            ]
            self.assertEqual(
                0,
                PROMOTER.assert_history("identity", valid, migrations),
            )
            invalid = [dict(valid[0], statement_hex=b"different".hex())]
            with self.assertRaises(PROMOTER.PromotionError):
                PROMOTER.assert_history("identity", invalid, migrations)

    def test_release_activation_starts_only_after_the_44_file_baseline(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            migration_dir = root / "supabase" / "migrations"
            migration_dir.mkdir(parents=True)
            for files in PROMOTER.BATCHES.values():
                for filename in files:
                    (migration_dir / filename).write_text(f"-- {filename}\n", encoding="utf-8")
            migrations = PROMOTER.load_migrations(root)
            prefix = PROMOTER.batch_history_prefix("release_activation")
            self.assertEqual(44, len(prefix))
            history = [
                {
                    "version": migrations[filename].version,
                    "name": migrations[filename].name,
                    "statement_count": 1,
                    "statement_hex": migrations[filename].sql.encode("utf-8").hex(),
                }
                for filename in prefix
            ]
            self.assertEqual(
                0,
                PROMOTER.assert_history("release_activation", history, migrations),
            )

            first = PROMOTER.BATCHES["release_activation"][0]
            history.append(
                {
                    "version": migrations[first].version,
                    "name": migrations[first].name,
                    "statement_count": 1,
                    "statement_hex": migrations[first].sql.encode("utf-8").hex(),
                }
            )
            self.assertEqual(
                1,
                PROMOTER.assert_history("release_activation", history, migrations),
            )

    def test_secret_sanitizer_redacts_supported_credentials(self) -> None:
        value = (
            "Authorization: Bearer sbp_example "
            "sb_secret_example eyJhbGciOiJIUzI1NiJ9.payload.signature"
        )
        sanitized = PROMOTER.sanitize(value)
        self.assertNotIn("sbp_example", sanitized)
        self.assertNotIn("sb_secret_example", sanitized)
        self.assertNotIn("eyJ", sanitized)

    def test_confirmation_is_unique_per_batch(self) -> None:
        self.assertEqual(len(PROMOTER.BATCHES), len(set(PROMOTER.CONFIRMATIONS.values())))
        self.assertEqual(
            "RUN_PHASE7E_B_PRODUCTION_FOUNDATION",
            PROMOTER.CONFIRMATIONS["foundation"],
        )
        self.assertEqual(
            "RUN_PHASE7E_B_PRODUCTION_RELEASE_ACTIVATION",
            PROMOTER.CONFIRMATIONS["release_activation"],
        )

    def test_release_activation_accepts_only_the_reviewed_edge_functions(self) -> None:
        class Client:
            def __init__(self, functions: list[dict[str, object]]) -> None:
                self.functions = functions

            def get(self, path: str):
                if path.endswith("/functions"):
                    return self.functions
                if path.endswith("/database/backups"):
                    return {
                        "pitr_enabled": False,
                        "backups": [{"status": "COMPLETED", "inserted_at": "2026-08-04T01:15:34Z"}],
                    }
                if path == "/v1/organizations":
                    return [{"id": "organization"}]
                return {
                    "ref": PROMOTER.EXPECTED_PROJECT_REF,
                    "name": PROMOTER.EXPECTED_PROJECT_NAME,
                    "region": PROMOTER.EXPECTED_REGION,
                    "status": "ACTIVE_HEALTHY",
                    "organization_id": "organization",
                    "database": {"version": "17.6"},
                }

        functions = [
            {"slug": "football-ingest", "status": "ACTIVE", "verify_jwt": True},
            {"slug": "news-ingest", "status": "ACTIVE", "verify_jwt": True},
        ]
        target = PROMOTER.assert_management_target(Client(functions), "release_activation")
        self.assertEqual(["football-ingest", "news-ingest"], target["edgeFunctionSlugs"])

        with self.assertRaises(PROMOTER.PromotionError):
            PROMOTER.assert_management_target(
                Client(functions + [{"slug": "unexpected", "status": "ACTIVE", "verify_jwt": True}]),
                "release_activation",
            )
        with self.assertRaises(PROMOTER.PromotionError):
            PROMOTER.assert_management_target(
                Client([dict(functions[0], verify_jwt=False), functions[1]]),
                "release_activation",
            )

    def test_release_activation_postflight_proves_inactive_empty_runtime(self) -> None:
        verification = {
            "serviceRoutineCount": 6,
            "browserExecuteGrantCount": 0,
            "elbotolaPublisher": {
                "active": False,
                "trustStatus": "review_required",
                "ingestionMode": "crawler",
                "websiteUrl": "https://www.elbotola.com/",
            },
            "catalogActivationRunCount": 0,
            "registrationActivationRunCount": 0,
            "initialPriceEvidenceCount": 0,
        }

        class Client:
            def __init__(self, value: dict[str, object]) -> None:
                self.value = value

            def query(self, _sql: str, *, read_only: bool):
                self.assert_read_only = read_only
                return [{"verification": self.value}]

        client = Client(verification)
        self.assertEqual(
            verification,
            PROMOTER.release_activation_verification(client),
        )
        self.assertTrue(client.assert_read_only)

        unsafe = dict(verification)
        unsafe["browserExecuteGrantCount"] = 1
        with self.assertRaises(PROMOTER.PromotionError):
            PROMOTER.release_activation_verification(Client(unsafe))


if __name__ == "__main__":
    unittest.main()
