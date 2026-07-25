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
        self.assertEqual(35, len(actual))
        self.assertEqual(35, len(set(actual)))

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


if __name__ == "__main__":
    unittest.main()
