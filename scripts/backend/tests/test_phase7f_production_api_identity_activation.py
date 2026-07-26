from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT = (
    Path(__file__).resolve().parents[1] / "phase7f-production-api-identity-activation.py"
)
SPEC = importlib.util.spec_from_file_location("phase7f_activation", SCRIPT)
assert SPEC and SPEC.loader
ACTIVATION = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ACTIVATION
SPEC.loader.exec_module(ACTIVATION)


class FakeManagementClient:
    def __init__(self, configs: list[dict[str, object]]) -> None:
        self.configs = list(configs)
        self.patches: list[dict[str, object]] = []

    def get(self, path: str):
        if path.endswith("/postgrest"):
            if len(self.configs) > 1:
                return self.configs.pop(0)
            return self.configs[0]
        raise AssertionError(path)

    def patch(self, path: str, payload: dict[str, object]):
        self.patches.append(payload)
        return payload


class Phase7FActivationTests(unittest.TestCase):
    def test_csv_normalization_is_order_and_whitespace_independent(self) -> None:
        self.assertEqual(
            ("graphql_public", "public"),
            ACTIVATION.normalize_csv(" public, graphql_public "),
        )

    def test_postgrest_patch_changes_only_schema_fields(self) -> None:
        client = FakeManagementClient(
            [
                {
                    "db_schema": "public,graphql_public",
                    "db_extra_search_path": "public,extensions",
                }
            ]
        )
        ACTIVATION.set_postgrest_config(client, "api", "extensions")
        self.assertEqual(
            [{"db_schema": "api", "db_extra_search_path": "extensions"}],
            client.patches,
        )

    def test_wait_for_postgrest_requires_the_exact_target(self) -> None:
        client = FakeManagementClient(
            [
                {
                    "db_schema": "public,graphql_public",
                    "db_extra_search_path": "public,extensions",
                },
                {"db_schema": "api", "db_extra_search_path": "extensions"},
            ]
        )
        with mock.patch.object(ACTIVATION.time, "sleep"):
            result = ACTIVATION.wait_for_postgrest(client, ("api",), ("extensions",))
        self.assertEqual("api", result["db_schema"])

    def test_unknown_exposure_fails_closed(self) -> None:
        client = FakeManagementClient(
            [{"db_schema": "app,api", "db_extra_search_path": "extensions"}]
        )
        with self.assertRaises(ACTIVATION.ActivationError):
            ACTIVATION.get_postgrest_config(client)

    def test_result_case_rejects_unexpected_status(self) -> None:
        cases: list[dict[str, object]] = []
        result = ACTIVATION.HttpResult(
            status=200,
            content_type="application/json",
            body=b"[]",
        )
        with self.assertRaises(ACTIVATION.ActivationError):
            ACTIVATION.record_case(cases, "must_be_denied", result, {403})

    def test_secret_sanitizer_covers_every_runtime_credential(self) -> None:
        raw = (
            "Authorization: Bearer sbp_example "
            "sb_secret_example sb_publishable_example "
            "access_token=eyJhbGciOiJIUzI1NiJ9.payload.signature"
        )
        sanitized = ACTIVATION.sanitize(raw)
        for secret_fragment in (
            "sbp_example",
            "sb_secret_example",
            "sb_publishable_example",
            "eyJ",
        ):
            self.assertNotIn(secret_fragment, sanitized)

    def test_dependency_audit_accepts_explicit_api_runtime(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            client = root / "src" / "integrations" / "supabase" / "v2-client.ts"
            client.parent.mkdir(parents=True)
            client.write_text('export const client = value.schema("api");\n', encoding="utf-8")
            result = ACTIVATION.assert_repository_dependencies(root)
        self.assertTrue(result["v2ApiSchemaExplicit"])

    def test_dependency_audit_rejects_graphql_runtime(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            client = root / "src" / "integrations" / "supabase" / "v2-client.ts"
            client.parent.mkdir(parents=True)
            client.write_text(
                'export const client = value.schema("api");\nfetch("/graphql/v1");\n',
                encoding="utf-8",
            )
            with self.assertRaises(ACTIVATION.ActivationError):
                ACTIVATION.assert_repository_dependencies(root)

    def test_smoke_source_never_creates_an_auth_user(self) -> None:
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertNotIn('"/auth/v1/admin/users"', source)
        self.assertIn('"/auth/v1/admin/generate_link"', source)
        self.assertIn('"/auth/v1/logout?scope=local"', source)

    def test_rollback_restores_exact_prior_configuration(self) -> None:
        prior = {
            "db_schema": "public,graphql_public",
            "db_extra_search_path": "public,extensions",
            "max_rows": 1000,
            "db_pool": 20,
            "db_pool_acquisition_timeout": 10,
        }
        client = FakeManagementClient([prior])
        with tempfile.TemporaryDirectory() as directory:
            result = ACTIVATION.rollback(
                client,
                prior,
                Path(directory),
                "smoke failed",
            )
            evidence = json.loads((Path(directory) / "rollback.json").read_text())
        self.assertEqual(
            [
                {
                    "db_schema": "public,graphql_public",
                    "db_extra_search_path": "public,extensions",
                }
            ],
            client.patches,
        )
        self.assertEqual("ROLLED_BACK", result["result"])
        self.assertEqual("ROLLED_BACK", evidence["result"])

    def test_environment_guard_rejects_staging(self) -> None:
        env = {
            "SUPABASE_ACCESS_TOKEN": "placeholder",
            "SUPABASE_SECRET_KEY": "placeholder",
            "SUPABASE_PRODUCTION_PROJECT_REF": ACTIVATION.KNOWN_STAGING_REF,
            "SUPABASE_PRODUCTION_PROJECT_NAME": ACTIVATION.EXPECTED_PROJECT_NAME,
            "BOTOLAGO_TARGET_ENVIRONMENT": ACTIVATION.EXPECTED_TARGET_ENVIRONMENT,
            "BOTOLAGO_ADMIN_ENVIRONMENT": "production",
            "BOTOLAGO_ADMIN_EXPECTED_PROJECT_REF": ACTIVATION.EXPECTED_PROJECT_REF,
            "SUPABASE_URL": f"https://{ACTIVATION.EXPECTED_PROJECT_REF}.supabase.co",
        }
        with mock.patch.dict(os.environ, env, clear=True):
            with self.assertRaises(ACTIVATION.ActivationError):
                ACTIVATION.assert_environment("unused", Path.cwd())


if __name__ == "__main__":
    unittest.main()
