from __future__ import annotations

import base64
import hashlib
import importlib.util
import re
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
    @staticmethod
    def production_history_row(migration: PROMOTER.Migration) -> dict[str, object]:
        pinned = PROMOTER.EXPECTED_MULTI_STATEMENT_HISTORY.get(migration.version)
        if pinned is not None:
            name, statement_count, statements_md5 = pinned
            return {
                "version": migration.version,
                "name": name,
                "statement_count": statement_count,
                "statements_md5": statements_md5,
                "statement_hex": None,
            }
        pinned = PROMOTER.EXPECTED_PINNED_SINGLE_STATEMENT_HISTORY.get(
            migration.version
        )
        if pinned is not None:
            name, statement_count, statements_md5 = pinned
            return {
                "version": migration.version,
                "name": name,
                "statement_count": statement_count,
                "statements_md5": statements_md5,
                "statement_hex": b"separately promoted representation".hex(),
            }
        return {
            "version": migration.version,
            "name": migration.name,
            "statement_count": 1,
            "statements_md5": hashlib.md5(migration.sql.encode("utf-8")).hexdigest(),
            "statement_hex": migration.sql.encode("utf-8").hex(),
        }

    def test_batches_cover_the_exact_ordered_migration_chain(self) -> None:
        expected = sorted(
            path.name
            for path in (Path(__file__).resolve().parents[3] / "supabase" / "migrations").glob("*.sql")
        )
        actual = [filename for files in PROMOTER.BATCHES.values() for filename in files]
        self.assertEqual(expected, sorted(actual))
        versions = [filename.split("_", 1)[0] for filename in actual]
        self.assertEqual(versions, sorted(versions))
        self.assertEqual(59, len(actual))
        self.assertEqual(59, len(set(actual)))
        self.assertEqual(
            (
                "20260803173344_fantasy_preactivation_hardening.sql",
                "20260803210943_fantasy_catalog_activation.sql",
                "20260803212218_elbotola_metadata_ingestion.sql",
            ),
            PROMOTER.BATCHES["release_activation"],
        )
        self.assertEqual(9, len(PROMOTER.BATCHES["launch_recovery_2026_09_14"]))
        self.assertEqual(
            ("20260918120000_fantasy_calendar_sync.sql",),
            PROMOTER.BATCHES["fantasy_calendar_sync"],
        )
        self.assertEqual(56, len(PROMOTER.batch_history_prefix("fantasy_calendar_sync")))
        self.assertEqual(
            "RUN_PHASE7E_B_PRODUCTION_FANTASY_CALENDAR_SYNC",
            PROMOTER.CONFIRMATIONS["fantasy_calendar_sync"],
        )
        self.assertEqual(
            (
                "20260918130000_fantasy_deadline_watch.sql",
                "20260918140000_fantasy_calendar_sync_unconfirmed_guard.sql",
            ),
            PROMOTER.BATCHES["fantasy_deadline_guard"],
        )
        self.assertEqual("fantasy_deadline_guard", list(PROMOTER.BATCHES)[-1])
        self.assertEqual(57, len(PROMOTER.batch_history_prefix("fantasy_deadline_guard")))
        self.assertEqual(
            "RUN_PHASE7E_B_PRODUCTION_FANTASY_DEADLINE_GUARD",
            PROMOTER.CONFIRMATIONS["fantasy_deadline_guard"],
        )
        for batch in (
            "launch_recovery_2026_09_14",
            "fantasy_calendar_sync",
            "fantasy_deadline_guard",
        ):
            self.assertEqual(
                frozenset({"football-ingest", "news-ingest"}),
                PROMOTER.EXPECTED_EDGE_FUNCTIONS_BY_BATCH[batch],
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
                    (migration_dir / filename).write_text(
                        f"-- {filename}\n", encoding="utf-8"
                    )
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

    def test_read_history_requests_the_exact_multi_statement_digest(self) -> None:
        class Client:
            def __init__(self) -> None:
                self.queries: list[str] = []

            def query(self, sql: str, *, read_only: bool):
                self.assert_read_only = read_only
                self.queries.append(sql)
                if "to_regclass" in sql:
                    return [{"exists": True}]
                return []

        client = Client()
        self.assertEqual([], PROMOTER.read_history(client))
        self.assertTrue(client.assert_read_only)
        self.assertIn(
            "md5(array_to_string(coalesce(statements, array[]::text[]), E'\\n'))",
            client.queries[-1],
        )

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
                self.production_history_row(migrations[filename])
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

    def test_release_activation_accepts_only_the_pinned_multi_statement_history(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            migration_dir = root / "supabase" / "migrations"
            migration_dir.mkdir(parents=True)
            for files in PROMOTER.BATCHES.values():
                for filename in files:
                    (migration_dir / filename).write_text(f"-- {filename}\n", encoding="utf-8")
            migrations = PROMOTER.load_migrations(root)
            prefix = PROMOTER.batch_history_prefix("release_activation")
            history = [
                self.production_history_row(migrations[filename])
                for filename in prefix
            ]

            self.assertEqual(
                0,
                PROMOTER.assert_history("release_activation", history, migrations),
            )
            self.assertEqual(
                {
                    "20260801010000",
                    "20260801010100",
                    "20260801010200",
                    "20260802010100",
                    "20260802010200",
                    "20260802090000",
                },
                set(PROMOTER.EXPECTED_MULTI_STATEMENT_HISTORY),
            )

            first_pinned_index = next(
                index
                for index, row in enumerate(history)
                if row["version"] in PROMOTER.EXPECTED_MULTI_STATEMENT_HISTORY
            )
            wrong_count = [dict(row) for row in history]
            wrong_count[first_pinned_index]["statement_count"] = 1
            with self.assertRaisesRegex(
                PROMOTER.PromotionError,
                "multi-statement history mismatch",
            ):
                PROMOTER.assert_history("release_activation", wrong_count, migrations)

            wrong_digest = [dict(row) for row in history]
            wrong_digest[first_pinned_index]["statements_md5"] = "0" * 32
            with self.assertRaisesRegex(
                PROMOTER.PromotionError,
                "multi-statement history mismatch",
            ):
                PROMOTER.assert_history("release_activation", wrong_digest, migrations)

            unpinned_index = next(
                index
                for index, row in enumerate(history)
                if row["version"] not in PROMOTER.EXPECTED_MULTI_STATEMENT_HISTORY
            )
            unpinned_multi = [dict(row) for row in history]
            unpinned_multi[unpinned_index]["statement_count"] = 2
            with self.assertRaisesRegex(
                PROMOTER.PromotionError,
                "statement history is non-canonical",
            ):
                PROMOTER.assert_history("release_activation", unpinned_multi, migrations)

            self.assertEqual(
                {"20260802010000"},
                set(PROMOTER.EXPECTED_PINNED_SINGLE_STATEMENT_HISTORY),
            )
            pinned_single_index = next(
                index
                for index, row in enumerate(history)
                if row["version"]
                in PROMOTER.EXPECTED_PINNED_SINGLE_STATEMENT_HISTORY
            )
            for field, value in (
                ("statements_md5", "0" * 32),
                ("statement_count", 2),
            ):
                changed = [dict(row) for row in history]
                changed[pinned_single_index][field] = value
                with self.assertRaisesRegex(
                    PROMOTER.PromotionError,
                    "pinned single-statement history mismatch",
                ):
                    PROMOTER.assert_history("release_activation", changed, migrations)

            wrong_name = [dict(row) for row in history]
            wrong_name[pinned_single_index]["name"] = "unexpected"
            with self.assertRaisesRegex(
                PROMOTER.PromotionError, "migration name mismatch"
            ):
                PROMOTER.assert_history("release_activation", wrong_name, migrations)

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

    def test_workflow_batch_choices_match_the_manifest_batches_in_order(self) -> None:
        workflow = (
            Path(__file__).resolve().parents[3]
            / ".github"
            / "workflows"
            / "phase7e-b-production-migration-promotion.yml"
        ).read_text(encoding="utf-8")
        match = re.search(
            r"migration_batch:\n(?:[ \t]+.*\n)*?[ \t]+options:\n"
            r"(?P<options>(?:[ \t]+- .+\n)+)",
            workflow,
        )
        assert match is not None
        options = [
            line.strip()[2:]
            for line in match.group("options").splitlines()
            if line.strip()
        ]
        # The immutable post-Gate-4 baseline was promoted through separately
        # reviewed provider canaries and is deliberately not dispatchable; every
        # other batch must be offered, in manifest order, ending with the newest.
        dispatchable = [
            batch for batch in PROMOTER.BATCHES if batch != "post_gate4_baseline"
        ]
        self.assertEqual(dispatchable, options)
        self.assertEqual(list(PROMOTER.BATCHES)[-1], options[-1])
        self.assertTrue(set(options) <= set(PROMOTER.BATCHES))

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

    ORGANIZATION_ID = "org_9f3c2b1a7d5e4c6b"

    @classmethod
    def ownership_client(cls, organizations: object, *, project_organization_id: object = None):
        organization_id = (
            cls.ORGANIZATION_ID if project_organization_id is None else project_organization_id
        )

        class Client:
            def get(self, path: str):
                if path == "/v1/organizations":
                    if isinstance(organizations, Exception):
                        raise organizations
                    return organizations
                if path.endswith("/functions"):
                    return [
                        {"slug": "football-ingest", "status": "ACTIVE", "verify_jwt": True},
                        {"slug": "news-ingest", "status": "ACTIVE", "verify_jwt": True},
                    ]
                if path.endswith("/database/backups"):
                    return {
                        "pitr_enabled": False,
                        "backups": [{"status": "COMPLETED", "inserted_at": "2026-09-18T01:15:34Z"}],
                    }
                project = {
                    "ref": PROMOTER.EXPECTED_PROJECT_REF,
                    "name": PROMOTER.EXPECTED_PROJECT_NAME,
                    "region": PROMOTER.EXPECTED_REGION,
                    "status": "ACTIVE_HEALTHY",
                    "database": {"version": "17.6"},
                }
                if organization_id is not False:
                    project["organization_id"] = organization_id
                return project

        return Client()

    def test_ownership_guard_accepts_a_list_containing_the_project_organization(self) -> None:
        client = self.ownership_client(
            [{"id": "other_org", "name": "Other"}, {"id": self.ORGANIZATION_ID, "name": "Owner"}]
        )
        target = PROMOTER.assert_management_target(client, "fantasy_calendar_sync")
        self.assertEqual(PROMOTER.EXPECTED_PROJECT_REF, target["ref"])

    def test_ownership_guard_reports_sanitized_shape_when_list_lacks_the_organization(self) -> None:
        client = self.ownership_client([{"id": "other_org", "slug": "other-slug", "name": "Other"}])
        with self.assertRaises(PROMOTER.PromotionError) as context:
            PROMOTER.assert_management_target(client, "fantasy_calendar_sync")
        message = str(context.exception)
        self.assertIn("authenticated account does not own the selected project", message)
        self.assertIn("organizations_response_type=list", message)
        self.assertIn("organizations_row_count=1", message)
        self.assertIn("organizations_row_keys=['id', 'name', 'slug']", message)
        self.assertIn("project_has_organization_id=true", message)
        self.assertIn("project_organization_id_matched_row_keys=[]", message)
        self.assertNotIn(self.ORGANIZATION_ID, message)
        self.assertNotIn("other_org", message)
        self.assertNotIn("other-slug", message)
        self.assertNotIn("Other", message)

        # The identity key moving off "id" (e.g. to "slug") is still a failure,
        # but the diagnostic names the key so the next run is conclusive.
        moved = self.ownership_client(
            [{"id": "opaque_internal_id", "slug": self.ORGANIZATION_ID, "name": "Owner"}]
        )
        with self.assertRaises(PROMOTER.PromotionError) as context:
            PROMOTER.assert_management_target(moved, "fantasy_calendar_sync")
        message = str(context.exception)
        self.assertIn("project_organization_id_matched_row_keys=['slug']", message)
        self.assertNotIn(self.ORGANIZATION_ID, message)
        self.assertNotIn("opaque_internal_id", message)

        # Missing organization_id on the project is reported as a boolean only.
        missing = self.ownership_client([{"id": self.ORGANIZATION_ID}], project_organization_id=False)
        with self.assertRaises(PROMOTER.PromotionError) as context:
            PROMOTER.assert_management_target(missing, "fantasy_calendar_sync")
        self.assertIn("project_has_organization_id=false", str(context.exception))
        self.assertNotIn(self.ORGANIZATION_ID, str(context.exception))

        # An empty list is a distinct, still-failing case.
        with self.assertRaises(PROMOTER.PromotionError) as context:
            PROMOTER.assert_management_target(self.ownership_client([]), "fantasy_calendar_sync")
        self.assertIn("organizations_row_count=0", str(context.exception))

    def test_ownership_guard_keeps_the_dict_wrapper_behaviour(self) -> None:
        wrapped = self.ownership_client({"organizations": [{"id": self.ORGANIZATION_ID}]})
        target = PROMOTER.assert_management_target(wrapped, "fantasy_calendar_sync")
        self.assertEqual(PROMOTER.EXPECTED_PROJECT_REF, target["ref"])

        paginated = self.ownership_client(
            {"organizations": [{"id": "other_org"}], "next_cursor": "opaque_cursor_value"}
        )
        with self.assertRaises(PROMOTER.PromotionError) as context:
            PROMOTER.assert_management_target(paginated, "fantasy_calendar_sync")
        message = str(context.exception)
        self.assertIn("organizations_response_type=dict", message)
        self.assertIn("organizations_top_level_keys=['next_cursor', 'organizations']", message)
        self.assertIn("organizations_row_count=1", message)
        self.assertNotIn("opaque_cursor_value", message)
        self.assertNotIn("other_org", message)
        self.assertNotIn(self.ORGANIZATION_ID, message)

        # A dict keyed by something else proves nothing and still fails.
        unknown = self.ownership_client({"data": [{"id": self.ORGANIZATION_ID}]})
        with self.assertRaises(PROMOTER.PromotionError) as context:
            PROMOTER.assert_management_target(unknown, "fantasy_calendar_sync")
        self.assertIn("organizations_top_level_keys=['data']", str(context.exception))
        self.assertIn("organizations_row_count=0", str(context.exception))

    def test_ownership_guard_never_leaks_row_values(self) -> None:
        email = "owner.person@example.com"
        name = "Botola Secret Holdings"
        client = self.ownership_client(
            [{"id": "org_leak_test", "billing_email": email, "name": name, "slug": "secret-slug"}]
        )
        with self.assertRaises(PROMOTER.PromotionError) as context:
            PROMOTER.assert_management_target(client, "fantasy_calendar_sync")
        message = str(context.exception)
        self.assertIn("organizations_row_keys=['billing_email', 'id', 'name', 'slug']", message)
        for value in (email, name, "org_leak_test", "secret-slug", self.ORGANIZATION_ID):
            self.assertNotIn(value, message)
            self.assertNotIn(value, PROMOTER.sanitize(context.exception))

    def test_ownership_guard_keeps_the_management_api_failure_classification(self) -> None:
        failure = PROMOTER.PromotionError("management_api_request_failed: HTTP 403")
        with self.assertRaises(PROMOTER.PromotionError) as context:
            PROMOTER.assert_management_target(self.ownership_client(failure), "fantasy_calendar_sync")
        self.assertEqual(
            "organizations_request_failed: management_api_request_failed: HTTP 403",
            str(context.exception),
        )

    def test_release_activation_postflight_proves_inactive_empty_runtime(self) -> None:
        verification = {
            "serviceRoutineCount": 6,
            "browserExecuteGrantCount": 0,
            "elbotolaPublisher": {
                "active": False,
                "trustStatus": "review_required",
                "ingestionMode": "api",
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
