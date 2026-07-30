from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import os
import re
import signal
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parents[1]
SCRIPT = BACKEND / "phase7f-production-api-identity-activation.py"
SCANNER = BACKEND / "phase7f-scan-sanitized-evidence.py"
MANIFEST = BACKEND / "phase7f-api-surface-manifest.json"
MANIFEST_SQL = BACKEND / "phase7f-api-surface-manifest.sql"
SPEC = importlib.util.spec_from_file_location("phase7f_activation", SCRIPT)
assert SPEC and SPEC.loader
ACTIVATION = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ACTIVATION
SPEC.loader.exec_module(ACTIVATION)


PRIOR = {
    "db_schema": "public,graphql_public",
    "db_extra_search_path": "public,extensions",
    "max_rows": 1000,
    "db_pool": 20,
    "db_pool_acquisition_timeout": 10,
}
ACTIVE = {
    **PRIOR,
    "db_schema": "api",
    "db_extra_search_path": "extensions",
}
COMMIT = "a" * 40

class FakeManagementClient:
    def __init__(
        self,
        configs: list[dict[str, object]],
        *,
        patch_error: Exception | None = None,
    ) -> None:
        self.configs = list(configs)
        self.patches: list[dict[str, object]] = []
        self.patch_error = patch_error

    def get(self, path: str):
        if path.endswith("/postgrest"):
            if len(self.configs) > 1:
                return self.configs.pop(0)
            return self.configs[0]
        raise AssertionError(path)

    def patch(self, path: str, payload: dict[str, object]):
        self.patches.append(payload)
        if self.patch_error:
            raise self.patch_error
        return payload


class QueryClient:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows

    def query(self, sql: str, *, read_only: bool, timeout: int = 60):
        assert read_only
        if "to_regclass('cron.job')" in sql:
            return [{"exists": False}]
        return self.rows


class SmokeUserQueryClient:
    def __init__(self, row: dict[str, object]) -> None:
        self.row = row

    def query(self, sql: str, *, read_only: bool, timeout: int = 60):
        assert read_only
        assert "app.user_preferences" in sql
        return [self.row]


class ManifestQueryClient:
    def __init__(self, manifest: dict[str, object]) -> None:
        self.manifest = copy.deepcopy(manifest)
        self.operations: list[str | None] = []
        self.page_lengths: list[int] = []

    def query(
        self,
        sql: str,
        *,
        read_only: bool,
        timeout: int = 60,
        operation: str | None = None,
    ):
        assert read_only
        self.operations.append(operation)
        routines = self.manifest["apiRoutines"]
        assert isinstance(routines, list)
        if "manifest - 'apiRoutines'" in sql:
            summary = copy.deepcopy(self.manifest)
            summary.pop("apiRoutines")
            return [
                {
                    "manifest": summary,
                    "api_routine_count": len(routines),
                }
            ]
        if "jsonb_array_elements" in sql:
            lower = re.search(r"ordinality > ([0-9]+)", sql)
            upper = re.search(r"ordinality <= ([0-9]+)", sql)
            assert lower and upper
            page = routines[int(lower.group(1)) : int(upper.group(1))]
            self.page_lengths.append(len(page))
            return [{"value": copy.deepcopy(row)} for row in page]
        raise AssertionError("unexpected manifest query")


def make_journal(directory: str, *, current: str = "MUTATION_IN_PROGRESS"):
    journal = ACTIVATION.StateJournal(Path(directory) / "state.json")
    journal.create(
        project_ref=ACTIVATION.EXPECTED_PROJECT_REF,
        commit="a" * 40,
        run_id="123",
        previous=PRIOR,
    )
    journal.update(
        mutationAttempted=True,
        rollbackRequired=True,
        verdict=current,
    )
    return journal


class Phase7FActivationTests(unittest.TestCase):
    def test_csv_normalization_is_order_and_whitespace_independent(self) -> None:
        self.assertEqual(
            ("graphql_public", "public"),
            ACTIVATION.normalize_csv(" public,graphql_public "),
        )

    def test_postgrest_patch_changes_only_schema_fields(self) -> None:
        client = FakeManagementClient([PRIOR])
        ACTIVATION.set_postgrest_config(client, "api", "extensions")
        self.assertEqual(
            [{"db_schema": "api", "db_extra_search_path": "extensions"}],
            client.patches,
        )

    def test_wait_for_postgrest_requires_exact_target(self) -> None:
        client = FakeManagementClient([PRIOR, ACTIVE])
        with mock.patch.object(ACTIVATION.time, "sleep"):
            result = ACTIVATION.wait_for_postgrest(
                client, ("api",), ("extensions",)
            )
        self.assertEqual("api", result["db_schema"])

    def test_unknown_exposure_fails_closed(self) -> None:
        client = FakeManagementClient(
            [{**PRIOR, "db_schema": "app,api"}]
        )
        with self.assertRaises(ACTIVATION.ActivationError):
            ACTIVATION.get_postgrest_config(client)

    def test_stable_error_code_never_uses_arbitrary_message(self) -> None:
        result = ACTIVATION.HttpResult(
            403,
            "application/json",
            b'{"message":"Bearer secret-value","code":"not_allowlisted"}',
        )
        self.assertEqual("HTTP_FORBIDDEN", ACTIVATION.stable_result_code(result))

    def test_allowlisted_postgrest_code_is_preserved(self) -> None:
        result = ACTIVATION.HttpResult(
            401, "application/json", b'{"code":"42501"}'
        )
        self.assertEqual("42501", ACTIVATION.stable_result_code(result))

    def test_management_error_identifies_sanitized_operation(self) -> None:
        http = mock.Mock()
        http.request.return_value = ACTIVATION.HttpResult(
            400, "application/json", b'{"message":"invalid request"}'
        )
        client = ACTIVATION.ManagementClient(http, "placeholder")
        with self.assertRaises(ACTIVATION.ActivationError) as raised:
            client.get(
                f"/v1/projects/{ACTIVATION.EXPECTED_PROJECT_REF}/postgrest"
            )
        self.assertEqual("HTTP_BAD_REQUEST", raised.exception.code)
        self.assertEqual(
            "GET_POSTGREST_CONFIG returned HTTP 400",
            raised.exception.detail,
        )
        self.assertNotIn(
            ACTIVATION.EXPECTED_PROJECT_REF,
            raised.exception.detail,
        )

    def test_read_only_management_query_retries_transient_502(self) -> None:
        http = mock.Mock()
        http.request.side_effect = [
            ACTIVATION.HttpResult(
                502,
                "application/json",
                b'{"message":"temporary upstream failure"}',
            ),
            ACTIVATION.HttpResult(
                200,
                "application/json",
                b'[{"ok":true}]',
            ),
        ]
        client = ACTIVATION.ManagementClient(http, "placeholder")
        with mock.patch.object(ACTIVATION.time, "sleep") as sleep:
            rows = client.query(
                "select true as ok",
                read_only=True,
                operation="API_MANIFEST_SUMMARY",
            )
        self.assertEqual([{"ok": True}], rows)
        self.assertEqual(2, http.request.call_count)
        sleep.assert_called_once_with(1)

    def test_read_only_management_query_has_bounded_retries(self) -> None:
        http = mock.Mock()
        http.request.return_value = ACTIVATION.HttpResult(
            502,
            "application/json",
            b'{"message":"temporary upstream failure"}',
        )
        client = ACTIVATION.ManagementClient(http, "placeholder")
        with mock.patch.object(ACTIVATION.time, "sleep") as sleep:
            with self.assertRaises(ACTIVATION.ActivationError) as raised:
                client.query(
                    "select true as ok",
                    read_only=True,
                    operation="API_MANIFEST_SUMMARY",
                )
        self.assertEqual("HTTP_UPSTREAM_ERROR", raised.exception.code)
        self.assertEqual(3, http.request.call_count)
        self.assertEqual([mock.call(1), mock.call(2)], sleep.call_args_list)

    def test_mutating_management_query_never_retries(self) -> None:
        http = mock.Mock()
        http.request.return_value = ACTIVATION.HttpResult(
            502,
            "application/json",
            b'{"message":"temporary upstream failure"}',
        )
        client = ACTIVATION.ManagementClient(http, "placeholder")
        with mock.patch.object(ACTIVATION.time, "sleep") as sleep:
            with self.assertRaises(ACTIVATION.ActivationError):
                client.query(
                    "select true as ok",
                    read_only=False,
                    operation="MUTATING_QUERY",
                )
        self.assertEqual(1, http.request.call_count)
        sleep.assert_not_called()

    def test_secret_sanitizer_covers_tokens_email_and_uuid(self) -> None:
        raw = (
            "Authorization: Bearer sbp_example "
            "sb_secret_example sb_publishable_example "
            "access_token=eyJhbGciOiJIUzI1NiJ9.payload.signature "
            "person@example.com 123e4567-e89b-42d3-a456-426614174000"
        )
        sanitized = ACTIVATION.sanitize(raw)
        for fragment in ("sbp_", "sb_secret_", "sb_publishable_", "eyJ", "@"):
            self.assertNotIn(fragment, sanitized)
        self.assertIn("[UUID]", sanitized)

    def test_record_case_enforces_status_and_stable_code(self) -> None:
        cases: list[dict[str, object]] = []
        result = ACTIVATION.HttpResult(
            401, "application/json", b'{"code":"42501"}'
        )
        ACTIVATION.record_case(
            cases,
            "anon_my_profile",
            "ANONYMOUS",
            "PROFILE_READ",
            result,
            401,
            "42501",
        )
        self.assertEqual("PASS", cases[0]["result"])

    def test_generate_link_parser_accepts_flat_raw_auth_response(self) -> None:
        user_id = "123e4567-e89b-42d3-a456-426614174000"
        self.assertEqual(
            "hashed-token",
            ACTIVATION.parse_session_link_response(
                {
                    "id": user_id,
                    "hashed_token": "hashed-token",
                    "verification_type": "magiclink",
                },
                user_id,
            ),
        )

    def test_generate_link_parser_rejects_client_library_wrapper(self) -> None:
        user_id = "123e4567-e89b-42d3-a456-426614174000"
        with self.assertRaisesRegex(
            ACTIVATION.ActivationError, "SESSION_LINK_RESPONSE_INVALID"
        ):
            ACTIVATION.parse_session_link_response(
                {
                    "id": user_id,
                    "properties": {
                        "hashed_token": "hashed-token",
                        "verification_type": "magiclink",
                    },
                },
                user_id,
            )

    def test_generate_link_parser_fails_closed_on_mismatched_fields(self) -> None:
        user_id = "123e4567-e89b-42d3-a456-426614174000"
        invalid_payloads = (
            None,
            {},
            {
                "id": user_id,
                "hashed_token": "",
                "verification_type": "magiclink",
            },
            {
                "id": user_id,
                "hashed_token": " token ",
                "verification_type": "magiclink",
            },
            {
                "id": user_id,
                "hashed_token": "hashed-token",
                "verification_type": "recovery",
            },
            {
                "id": "123e4567-e89b-42d3-a456-426614174001",
                "hashed_token": "hashed-token",
                "verification_type": "magiclink",
            },
        )
        for payload in invalid_payloads:
            with self.subTest(payload=payload), self.assertRaisesRegex(
                ACTIVATION.ActivationError, "SESSION_LINK_RESPONSE_INVALID"
            ):
                ACTIVATION.parse_session_link_response(payload, user_id)

    def test_smoke_user_requires_profile_preference_pair(self) -> None:
        user_id = "123e4567-e89b-42d3-a456-426614174000"
        valid_row = {
            "id": user_id,
            "email": "smoke@example.invalid",
            "email_verified": True,
            "banned": False,
            "deleted": False,
            "profile_count": 1,
            "preference_count": 1,
            "staff_count": 0,
            "role_count": 0,
            "pending_approval_count": 0,
            "verified_factor_count": 1,
            "baseline_session_count": 0,
        }
        result = ACTIVATION.validate_smoke_user(
            SmokeUserQueryClient(valid_row), user_id
        )
        self.assertEqual(user_id, result["id"])
        with self.assertRaisesRegex(
            ACTIVATION.ActivationError, "APPROVED_SMOKE_PROFILE_INVALID"
        ):
            ACTIVATION.validate_smoke_user(
                SmokeUserQueryClient({**valid_row, "preference_count": 0}),
                user_id,
            )

    def test_mint_session_uses_raw_link_hash_for_magiclink_verification(
        self,
    ) -> None:
        user_id = "123e4567-e89b-42d3-a456-426614174000"
        session_id = "123e4567-e89b-42d3-a456-426614174001"
        token = f"x.{base64_url({'session_id': session_id})}.x"
        responses = (
            ACTIVATION.HttpResult(
                200,
                "application/json",
                json.dumps(
                    {
                        "id": user_id,
                        "hashed_token": "hashed-token",
                        "verification_type": "magiclink",
                    }
                ).encode(),
            ),
            ACTIVATION.HttpResult(
                200,
                "application/json",
                json.dumps({"access_token": token}).encode(),
            ),
        )
        with mock.patch.object(
            ACTIVATION, "project_request", side_effect=responses
        ) as request:
            result = ACTIVATION.mint_session(
                mock.Mock(),
                "https://example.invalid",
                "secret",
                "publishable",
                user_id,
                "smoke@example.invalid",
            )
        self.assertEqual((token, session_id), result)
        self.assertEqual(2, request.call_count)
        self.assertEqual(
            {
                "type": "magiclink",
                "email": "smoke@example.invalid",
            },
            request.call_args_list[0].kwargs["payload"],
        )
        self.assertEqual(
            {"type": "magiclink", "token_hash": "hashed-token"},
            request.call_args_list[1].kwargs["payload"],
        )
        self.assertTrue(request.call_args_list[1].kwargs["mutation"])

    def test_protected_rpc_denials_match_manifest_grants(self) -> None:
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        routines = {
            row["name"]: row
            for row in manifest["apiRoutines"]
            if row["name"]
            in {
                "get_my_staff_context",
                "admin_bootstrap_first_platform_admin",
                "admin_assign_role",
                "admin_request_approval",
            }
        }
        self.assertEqual(
            {
                "get_my_staff_context",
                "admin_bootstrap_first_platform_admin",
                "admin_assign_role",
                "admin_request_approval",
            },
            set(routines),
        )
        for routine in routines.values():
            grantees = {grant["grantee"] for grant in routine["grants"]}
            self.assertNotIn("anon", grantees)
        bootstrap_grantees = {
            grant["grantee"]
            for grant in routines["admin_bootstrap_first_platform_admin"]["grants"]
        }
        self.assertNotIn("authenticated", bootstrap_grantees)
        for name in (
            "get_my_staff_context",
            "admin_assign_role",
            "admin_request_approval",
        ):
            grantees = {
                grant["grantee"] for grant in routines[name]["grants"]
            }
            self.assertIn("authenticated", grantees)
        self.assertEqual(
            (401, "42501"),
            ACTIVATION.ANON_RPC_PRIVILEGE_DENIAL,
        )
        self.assertEqual(
            (403, "42501"),
            ACTIVATION.AUTHENTICATED_RPC_PRIVILEGE_DENIAL,
        )
        cases: list[dict[str, object]] = []
        for name in routines:
            ACTIVATION.record_case(
                cases,
                f"anon_{name}_rejected",
                "ANONYMOUS",
                "ADMIN_RPC",
                ACTIVATION.HttpResult(
                    401,
                    "application/json",
                    b'{"code":"42501"}',
                ),
                *ACTIVATION.ANON_RPC_PRIVILEGE_DENIAL,
            )
        ACTIVATION.record_case(
            cases,
            "authenticated_bootstrap_rejected",
            "AUTHENTICATED_AAL1",
            "BOOTSTRAP_RPC",
            ACTIVATION.HttpResult(
                403,
                "application/json",
                b'{"code":"42501"}',
            ),
            *ACTIVATION.AUTHENTICATED_RPC_PRIVILEGE_DENIAL,
        )
        self.assertTrue(all(case["result"] == "PASS" for case in cases))

    def test_graphql_removal_uses_schema_boundary_response(self) -> None:
        self.assertEqual(
            (406, "PGRST106"),
            ACTIVATION.GRAPHQL_SCHEMA_REMOVED_RESPONSE,
        )
        cases: list[dict[str, object]] = []
        ACTIVATION.record_case(
            cases,
            "graphql_schema_removed",
            "ANONYMOUS",
            "GRAPHQL",
            ACTIVATION.HttpResult(
                406,
                "application/json",
                b'{"code":"PGRST106"}',
            ),
            *ACTIVATION.GRAPHQL_SCHEMA_REMOVED_RESPONSE,
        )
        self.assertEqual("PASS", cases[0]["result"])
        with self.assertRaises(ACTIVATION.ActivationError) as raised:
            ACTIVATION.record_case(
                [],
                "graphql_schema_removed",
                "ANONYMOUS",
                "GRAPHQL",
                ACTIVATION.HttpResult(
                    404,
                    "application/json",
                    b'{"code":"PGRST202"}',
                ),
                *ACTIVATION.GRAPHQL_SCHEMA_REMOVED_RESPONSE,
            )
        self.assertEqual(
            (
                "graphql_schema_removed status=404 "
                "code=PGRST202 rows=None"
            ),
            raised.exception.detail,
        )

    def test_read_only_profile_mutation_accepts_exact_55000(self) -> None:
        cases: list[dict[str, object]] = []
        result = ACTIVATION.HttpResult(
            500, "application/json", b'{"code":"55000"}'
        )
        ACTIVATION.record_case(
            cases,
            "anon_profile_mutation_rejected",
            "ANONYMOUS",
            "PROFILE_MUTATION",
            result,
            500,
            "55000",
        )
        self.assertEqual("PASS", cases[0]["result"])
        self.assertEqual("55000", cases[0]["actualErrorCode"])

    def test_read_only_profile_mutation_rejects_generic_500(self) -> None:
        with self.assertRaises(ACTIVATION.ActivationError) as raised:
            ACTIVATION.record_case(
                [],
                "anon_profile_mutation_rejected",
                "ANONYMOUS",
                "PROFILE_MUTATION",
                ACTIVATION.HttpResult(
                    500,
                    "application/json",
                    b'{"message":"unexpected server failure"}',
                ),
                500,
                "55000",
            )
        self.assertEqual(
            (
                "anon_profile_mutation_rejected status=500 "
                "code=HTTP_SERVER_ERROR rows=None"
            ),
            raised.exception.detail,
        )

    def test_data_plane_readiness_retries_schema_cache_then_passes(self) -> None:
        responses = [
            ACTIVATION.HttpResult(
                404,
                "application/json",
                b'{"code":"PGRST205"}',
            ),
            ACTIVATION.HttpResult(
                401,
                "application/json",
                b'{"code":"42501"}',
            ),
        ]
        with mock.patch.object(
            ACTIVATION,
            "project_request",
            side_effect=responses,
        ) as request, mock.patch.object(ACTIVATION.time, "sleep"):
            result = ACTIVATION.wait_for_postgrest_data_plane(
                mock.Mock(),
                "https://example.invalid",
                "publishable",
            )
        self.assertEqual("READY", result["result"])
        self.assertEqual(2, result["attemptCount"])
        self.assertEqual(2, request.call_count)

    def test_data_plane_readiness_rejects_anonymous_access(self) -> None:
        with mock.patch.object(
            ACTIVATION,
            "project_request",
            return_value=ACTIVATION.HttpResult(
                200,
                "application/json",
                b"[]",
            ),
        ):
            with self.assertRaisesRegex(
                ACTIVATION.ActivationError,
                "POSTGREST_DATA_PLANE_UNEXPECTED",
            ):
                ACTIVATION.wait_for_postgrest_data_plane(
                    mock.Mock(),
                    "https://example.invalid",
                    "publishable",
                )

    def test_anonymous_profile_success_is_rejected(self) -> None:
        with self.assertRaises(ACTIVATION.ActivationError) as raised:
            ACTIVATION.record_case(
                [],
                "anon_my_profile",
                "ANONYMOUS",
                "PROFILE_READ",
                ACTIVATION.HttpResult(200, "application/json", b"[]"),
                401,
                "42501",
            )
        self.assertEqual(
            "anon_my_profile status=200 code=NONE rows=0",
            raised.exception.detail,
        )

    def test_dependency_audit_accepts_explicit_api_runtime(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            client = root / "src/integrations/supabase/v2-client.ts"
            client.parent.mkdir(parents=True)
            client.write_text(
                'export const client = value.schema("api");\n',
                encoding="utf-8",
            )
            result = ACTIVATION.assert_repository_dependencies(root)
        self.assertTrue(result["v2ApiSchemaExplicit"])

    def test_dependency_audit_rejects_graphql_runtime(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            client = root / "src/integrations/supabase/v2-client.ts"
            client.parent.mkdir(parents=True)
            client.write_text(
                'value.schema("api"); fetch("/graphql/v1");\n',
                encoding="utf-8",
            )
            with self.assertRaises(ACTIVATION.ActivationError):
                ACTIVATION.assert_repository_dependencies(root)

    def test_state_journal_is_atomic_owner_only_and_secret_free(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            journal = ACTIVATION.StateJournal(Path(directory) / "state.json")
            state = journal.create(
                project_ref=ACTIVATION.EXPECTED_PROJECT_REF,
                commit="a" * 40,
                run_id="123",
                previous=PRIOR,
            )
            mode = stat.S_IMODE(journal.path.stat().st_mode)
            text = journal.path.read_text()
        self.assertEqual(0o600, mode)
        self.assertEqual("NOT_EXECUTED", state["verdict"])
        self.assertNotIn("token", text.lower())

    def test_corrupt_state_journal_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.json"
            path.write_text("{", encoding="utf-8")
            with self.assertRaisesRegex(
                ACTIVATION.ActivationError, "STATE_JOURNAL_CORRUPT"
            ):
                ACTIVATION.StateJournal(path).read()

    def test_missing_state_journal_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(
                ACTIVATION.ActivationError, "STATE_JOURNAL_MISSING"
            ):
                ACTIVATION.StateJournal(Path(directory) / "missing").read()

    def test_config_classification_covers_all_ambiguity_states(self) -> None:
        self.assertEqual(
            "UNCHANGED", ACTIVATION.classify_effective_config(PRIOR, PRIOR)
        )
        self.assertEqual(
            "INTENDED_ACTIVATION_APPLIED",
            ACTIVATION.classify_effective_config(ACTIVE, PRIOR),
        )
        self.assertEqual(
            "UNEXPECTED_CONFIGURATION",
            ACTIVATION.classify_effective_config(
                {**ACTIVE, "db_schema": "api,public"}, PRIOR
            ),
        )
        self.assertEqual(
            "UNVERIFIED", ACTIVATION.classify_effective_config(None, PRIOR)
        )

    def test_recovery_rolls_back_intended_activation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            journal = make_journal(directory)
            client = FakeManagementClient([ACTIVE, PRIOR])
            with mock.patch.object(ACTIVATION.time, "sleep"):
                state = ACTIVATION.recover_from_state(
                    client, journal, Path(directory)
                )
        self.assertEqual("FAILED_ROLLED_BACK", state["verdict"])
        self.assertTrue(state["rollbackVerified"])
        self.assertEqual(1, len(client.patches))

    def test_recovery_is_idempotent_when_already_restored(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            journal = make_journal(directory)
            client = FakeManagementClient([PRIOR])
            first = ACTIVATION.recover_from_state(
                client, journal, Path(directory)
            )
            second = ACTIVATION.recover_from_state(
                client, journal, Path(directory)
            )
        self.assertEqual("FAILED_ROLLED_BACK", first["verdict"])
        self.assertEqual("FAILED_ROLLED_BACK", second["verdict"])
        self.assertEqual([], client.patches)

    def test_successful_primary_process_preserves_verified_pending_activation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            journal = make_journal(
                directory, current="ACTIVATED_PENDING_TESTS"
            )
            journal.update(sessionCleanupVerified=True)
            client = FakeManagementClient([ACTIVE])
            state = ACTIVATION.recover_from_state(
                client,
                journal,
                Path(directory),
                preserve_pending_activation=True,
            )
        self.assertEqual("ACTIVATED_PENDING_TESTS", state["result"])
        self.assertEqual([], client.patches)

    def test_session_cleanup_failure_verdict_survives_successful_rollback(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            journal = make_journal(
                directory, current="SESSION_CLEANUP_FAILED"
            )
            client = FakeManagementClient([ACTIVE, PRIOR])
            state = ACTIVATION.recover_from_state(
                client, journal, Path(directory)
            )
        self.assertEqual("SESSION_CLEANUP_FAILED", state["verdict"])
        self.assertTrue(state["rollbackVerified"])

    def test_recovery_timeout_is_rollback_failed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            journal = make_journal(directory)
            client = FakeManagementClient(
                [ACTIVE],
                patch_error=ACTIVATION.AmbiguousMutation(
                    "MUTATION_RESPONSE_AMBIGUOUS"
                ),
            )
            with self.assertRaisesRegex(
                ACTIVATION.ActivationError, "ROLLBACK_FAILED"
            ):
                ACTIVATION.recover_from_state(
                    client, journal, Path(directory)
                )
            self.assertEqual("ROLLBACK_FAILED", journal.read()["verdict"])

    def test_ambiguous_rollback_verified_as_restored_passes_recovery(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            journal = make_journal(directory)
            client = FakeManagementClient(
                [ACTIVE, PRIOR],
                patch_error=ACTIVATION.AmbiguousMutation(
                    "MUTATION_RESPONSE_AMBIGUOUS"
                ),
            )
            state = ACTIVATION.recover_from_state(
                client, journal, Path(directory)
            )
            self.assertEqual("FAILED_ROLLED_BACK", state["verdict"])
            self.assertTrue(state["rollbackVerified"])

    def test_signal_handler_raises_stable_abort(self) -> None:
        ACTIVATION.install_signal_handlers()
        handler = signal.getsignal(signal.SIGTERM)
        with self.assertRaisesRegex(
            ACTIVATION.SignalAbort, "PROCESS_SIGNALLED"
        ):
            handler(signal.SIGTERM, None)

    def test_single_operator_context_accepts_only_owner_first_attempt(
        self,
    ) -> None:
        env = {
            "GITHUB_ACTOR": "mrdata007",
            "GITHUB_EVENT_NAME": "workflow_dispatch",
            "GITHUB_REF": "refs/heads/main",
            "GITHUB_REPOSITORY": "mrdata007/botolago-foundation",
            "GITHUB_RUN_ATTEMPT": "1",
            "GITHUB_RUN_ID": "42",
            "GITHUB_SHA": COMMIT,
        }
        with mock.patch.dict(os.environ, env, clear=True):
            value = ACTIVATION.verify_single_operator_context(COMMIT)
        self.assertEqual("SINGLE_OPERATOR_TEMPORARY", value["mode"])
        self.assertTrue(value["independentApprovalDeferred"])
        self.assertEqual("PASS", value["result"])

    def test_single_operator_context_rejects_wrong_actor_target_or_rerun(
        self,
    ) -> None:
        base = {
            "GITHUB_ACTOR": "mrdata007",
            "GITHUB_EVENT_NAME": "workflow_dispatch",
            "GITHUB_REF": "refs/heads/main",
            "GITHUB_REPOSITORY": "mrdata007/botolago-foundation",
            "GITHUB_RUN_ATTEMPT": "1",
            "GITHUB_RUN_ID": "42",
            "GITHUB_SHA": COMMIT,
        }
        for name, updates, code in (
            (
                "wrong actor",
                {"GITHUB_ACTOR": "someone-else"},
                "GITHUB_SINGLE_OPERATOR_GUARD_FAILED",
            ),
            (
                "wrong ref",
                {"GITHUB_REF": "refs/heads/feature"},
                "GITHUB_SINGLE_OPERATOR_GUARD_FAILED",
            ),
            (
                "wrong repository",
                {"GITHUB_REPOSITORY": "other/repository"},
                "GITHUB_SINGLE_OPERATOR_GUARD_FAILED",
            ),
            (
                "wrong commit",
                {"GITHUB_SHA": "b" * 40},
                "GITHUB_SINGLE_OPERATOR_GUARD_FAILED",
            ),
            (
                "rerun",
                {"GITHUB_RUN_ATTEMPT": "2"},
                "GITHUB_WORKFLOW_RERUN_FORBIDDEN",
            ),
        ):
            with self.subTest(name=name):
                with mock.patch.dict(
                    os.environ, {**base, **updates}, clear=True
                ):
                    with self.assertRaisesRegex(
                        ACTIVATION.ActivationError, code
                    ):
                        ACTIVATION.verify_single_operator_context(COMMIT)

    def test_manifest_is_versioned_and_canonical_security_valid(self) -> None:
        value = json.loads(MANIFEST.read_text(encoding="utf-8"))
        ACTIVATION.validate_manifest_security(value)
        self.assertEqual(1, value["manifestVersion"])
        app = next(
            row for row in value["schemas"] if row["schema_name"] == "app"
        )
        self.assertTrue(app["role_privileges"]["authenticatedUsage"])
        self.assertFalse(app["role_privileges"]["anonUsage"])

    def test_manifest_schema_qualifies_pgcrypto_digest(self) -> None:
        sql = MANIFEST_SQL.read_text(encoding="utf-8")
        self.assertEqual(2, sql.count("extensions.digest("))
        self.assertIsNone(
            re.search(r"(?<![A-Za-z0-9_.])digest\s*\(", sql)
        )

    def test_unexpected_api_view_causes_manifest_drift(self) -> None:
        expected = json.loads(MANIFEST.read_text(encoding="utf-8"))
        actual = copy.deepcopy(expected)
        actual["apiRelations"].append(
            {
                "name": "unexpected",
                "kind": "v",
                "owner": "postgres",
                "row_security": False,
                "force_row_security": False,
                "options": [],
                "grants": [],
            }
        )
        client = ManifestQueryClient(actual)
        with self.assertRaisesRegex(
            ACTIVATION.ActivationError, "API_MANIFEST_DRIFT"
        ):
            ACTIVATION.assert_api_manifest(client, REPO)

    def test_live_api_manifest_exact_match_passes(self) -> None:
        expected = json.loads(MANIFEST.read_text(encoding="utf-8"))
        client = ManifestQueryClient(expected)
        result = ACTIVATION.assert_api_manifest(client, REPO)
        self.assertEqual("EXACT_MATCH", result["result"])
        self.assertEqual(
            ["API_MANIFEST_SUMMARY"]
            + ["API_MANIFEST_ROUTINE_PAGE"] * len(client.page_lengths),
            client.operations,
        )
        self.assertTrue(client.page_lengths)
        self.assertLessEqual(max(client.page_lengths), 25)

    def test_unexpected_routine_grant_is_rejected(self) -> None:
        value = json.loads(MANIFEST.read_text(encoding="utf-8"))
        value["apiRoutines"][0]["grants"].append(
            {
                "grantee": "PUBLIC",
                "privilege": "EXECUTE",
                "grantable": False,
            }
        )
        with self.assertRaisesRegex(
            ACTIVATION.ActivationError, "CANONICAL_PUBLIC_EXECUTE_GRANT"
        ):
            ACTIVATION.validate_manifest_security(value)

    def test_definer_without_empty_search_path_is_rejected(self) -> None:
        value = json.loads(MANIFEST.read_text(encoding="utf-8"))
        routine = next(
            row for row in value["apiRoutines"] if row["security_definer"]
        )
        routine["configuration"] = []
        with self.assertRaisesRegex(
            ACTIVATION.ActivationError,
            "CANONICAL_DEFINER_SEARCH_PATH_UNSAFE",
        ):
            ACTIVATION.validate_manifest_security(value)

    def test_policy_expression_drift_changes_manifest(self) -> None:
        expected = json.loads(MANIFEST.read_text(encoding="utf-8"))
        actual = copy.deepcopy(expected)
        actual["canonicalPolicies"][0]["usingHash"] = "0" * 64
        client = ManifestQueryClient(actual)
        with self.assertRaisesRegex(
            ACTIVATION.ActivationError, "API_MANIFEST_DRIFT"
        ):
            ACTIVATION.assert_api_manifest(client, REPO)

    def test_runtime_invariant_rejects_active_worker(self) -> None:
        zeroes = {
            "canonicalTableCount": 112,
            "forcedRlsCount": 112,
            "nonForcedTableCount": 0,
            "cronJobCount": 0,
            "missingProfileCount": 0,
            "missingPreferenceCount": 0,
            "orphanProfileCount": 0,
            "identityTriggerCount": 1,
            "staffPrincipalCount": 0,
            "activePlatformAdminCount": 0,
            "ownerBootstrapAuditCount": 0,
            "pendingPrivilegedApprovalCount": 0,
            "footballActiveRunCount": 0,
            "newsActiveRunCount": 0,
            "notificationActiveRunCount": 0,
            "notificationActiveScheduleCount": 0,
            "fantasyActiveRunCount": 0,
            "adminActiveWorkerCount": 1,
            "adminPendingRevocationCount": 0,
            "realtimeApiPublicationCount": 1,
        }
        with self.assertRaisesRegex(
            ACTIVATION.ActivationError, "RUNTIME_INVARIANT_FAILED"
        ):
            ACTIVATION.collect_invariants(
                QueryClient([{"invariant": zeroes}])
            )

    def test_cron_job_count_does_not_reference_missing_relation(self) -> None:
        client = mock.Mock()
        client.query.return_value = [{"exists": False}]
        self.assertEqual(0, ACTIVATION.cron_job_count(client))
        client.query.assert_called_once_with(
            "select to_regclass('cron.job') is not null as exists",
            read_only=True,
        )

    def test_cron_job_count_queries_present_relation(self) -> None:
        client = mock.Mock()
        client.query.side_effect = [
            [{"exists": True}],
            [{"count": 3}],
        ]
        self.assertEqual(3, ACTIVATION.cron_job_count(client))
        self.assertEqual(2, client.query.call_count)

    def test_environment_guard_requires_approved_uuid(self) -> None:
        env = {
            "SUPABASE_ACCESS_TOKEN": "placeholder",
            "SUPABASE_SECRET_KEY": "placeholder",
            "SUPABASE_PRODUCTION_PROJECT_REF": ACTIVATION.EXPECTED_PROJECT_REF,
            "SUPABASE_PRODUCTION_PROJECT_NAME": ACTIVATION.EXPECTED_PROJECT_NAME,
            "BOTOLAGO_TARGET_ENVIRONMENT": ACTIVATION.EXPECTED_TARGET_ENVIRONMENT,
            "BOTOLAGO_ADMIN_ENVIRONMENT": "production",
            "BOTOLAGO_ADMIN_EXPECTED_PROJECT_REF": ACTIVATION.EXPECTED_PROJECT_REF,
            "SUPABASE_URL": f"https://{ACTIVATION.EXPECTED_PROJECT_REF}.supabase.co",
            "BOTOLAGO_AAL2_NON_STAFF_ACCESS_TOKEN": "placeholder",
        }
        with mock.patch.dict(os.environ, env, clear=True):
            with self.assertRaisesRegex(
                ACTIVATION.ActivationError, "PROTECTED_VALUE_MISSING"
            ):
                ACTIVATION.assert_environment("unused", Path.cwd())

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
            "BOTOLAGO_PRODUCTION_SMOKE_USER_UUID": "123e4567-e89b-42d3-a456-426614174000",
            "BOTOLAGO_AAL2_NON_STAFF_ACCESS_TOKEN": "placeholder",
        }
        with mock.patch.dict(os.environ, env, clear=True):
            with self.assertRaises(ACTIVATION.ActivationError):
                ACTIVATION.assert_environment("unused", Path.cwd())

    def test_environment_guard_rejects_invalid_publishable_key(self) -> None:
        env = {
            "SUPABASE_ACCESS_TOKEN": "placeholder",
            "SUPABASE_SECRET_KEY": "placeholder",
            "SUPABASE_PRODUCTION_PUBLISHABLE_KEY": "not-a-publishable-key",
            "SUPABASE_PRODUCTION_PROJECT_REF": ACTIVATION.EXPECTED_PROJECT_REF,
            "SUPABASE_PRODUCTION_PROJECT_NAME": ACTIVATION.EXPECTED_PROJECT_NAME,
            "BOTOLAGO_TARGET_ENVIRONMENT": ACTIVATION.EXPECTED_TARGET_ENVIRONMENT,
            "BOTOLAGO_ADMIN_ENVIRONMENT": "production",
            "BOTOLAGO_ADMIN_EXPECTED_PROJECT_REF": ACTIVATION.EXPECTED_PROJECT_REF,
            "SUPABASE_URL": f"https://{ACTIVATION.EXPECTED_PROJECT_REF}.supabase.co",
            "BOTOLAGO_PRODUCTION_SMOKE_USER_UUID": "123e4567-e89b-42d3-a456-426614174000",
            "BOTOLAGO_AAL2_NON_STAFF_ACCESS_TOKEN": "placeholder",
        }
        with mock.patch.dict(os.environ, env, clear=True):
            with self.assertRaisesRegex(
                ACTIVATION.ActivationError, "PUBLISHABLE_KEY_INVALID"
            ):
                ACTIVATION.assert_environment("unused", Path.cwd())

    def test_aal2_token_must_belong_to_approved_nonstaff_actor(self) -> None:
        payload = base64_url({"sub": str(os.urandom(16).hex()), "aal": "aal2"})
        token = f"x.{payload}.x"
        with self.assertRaises(ACTIVATION.ActivationError):
            ACTIVATION.verify_aal2_token(
                token, "123e4567-e89b-42d3-a456-426614174000"
            )

    def test_session_cleanup_uses_local_then_bounded_verification(self) -> None:
        http = mock.Mock()
        client = mock.Mock()
        http_result = ACTIVATION.HttpResult(204, "application/json", b"")
        with mock.patch.object(
            ACTIVATION, "project_request", return_value=http_result
        ), mock.patch.object(
            ACTIVATION, "session_exists", side_effect=[True, False]
        ), mock.patch.object(
            ACTIVATION.time, "sleep"
        ):
            ACTIVATION.revoke_session(
                http,
                client,
                "https://example.invalid",
                "publishable",
                "access",
                "123e4567-e89b-42d3-a456-426614174000",
            )

    def test_session_cleanup_failure_is_dedicated(self) -> None:
        with mock.patch.object(
            ACTIVATION,
            "project_request",
            return_value=ACTIVATION.HttpResult(
                500, "application/json", b"{}"
            ),
        ):
            with self.assertRaisesRegex(
                ACTIVATION.ActivationError, "SESSION_ADMIN_CLEANUP_FAILED"
            ):
                ACTIVATION.revoke_session(
                    mock.Mock(),
                    mock.Mock(),
                    "https://example.invalid",
                    "publishable",
                    "access",
                    "123e4567-e89b-42d3-a456-426614174000",
                )

    def test_evidence_upload_failure_has_dedicated_verdict(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            journal = ACTIVATION.StateJournal(Path(directory) / "state.json")
            journal.create(
                project_ref=ACTIVATION.EXPECTED_PROJECT_REF,
                commit="a" * 40,
                run_id="123",
                previous=PRIOR,
            )
            with self.assertRaisesRegex(
                ACTIVATION.ActivationError, "EVIDENCE_FAILURE"
            ):
                ACTIVATION.mark_evidence_outcome(
                    FakeManagementClient([PRIOR]),
                    journal.path,
                    Path(directory),
                    "failure",
                    "success",
                )
            self.assertEqual(
                "EVIDENCE_FAILURE", journal.read()["verdict"]
            )

    def test_evidence_success_is_only_pass_after_activation_and_cleanup(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            journal = ACTIVATION.StateJournal(Path(directory) / "state.json")
            journal.create(
                project_ref=ACTIVATION.EXPECTED_PROJECT_REF,
                commit="a" * 40,
                run_id="123",
                previous=PRIOR,
            )
            with self.assertRaisesRegex(
                ACTIVATION.ActivationError, "ACTIVATION_DID_NOT_PASS"
            ):
                ACTIVATION.mark_evidence_outcome(
                    FakeManagementClient([PRIOR]),
                    journal.path,
                    Path(directory),
                    "success",
                    "success",
                )
            journal.update(
                verdict="ACTIVATED_PENDING_TESTS",
                sessionCleanupVerified=True,
            )
            ACTIVATION.mark_evidence_outcome(
                FakeManagementClient([ACTIVE]),
                journal.path,
                Path(directory),
                "success",
                "success",
            )
            self.assertEqual("PASS", journal.read()["verdict"])

    def test_silent_scanner_reports_only_filename_rule_and_count(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "evidence.json").write_text(
                '{"access_token":"eyJabcdefghijklmnopqrstuv"}',
                encoding="utf-8",
            )
            result = subprocess.run(
                [sys.executable, str(SCANNER), str(root)],
                text=True,
                capture_output=True,
            )
        self.assertEqual(1, result.returncode)
        self.assertIn("file=evidence.json", result.stdout)
        self.assertIn("rule=", result.stdout)
        self.assertNotIn("eyJ", result.stdout)

    def test_silent_scanner_fails_when_artifacts_are_absent(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run(
                [sys.executable, str(SCANNER), directory],
                text=True,
                capture_output=True,
            )
        self.assertEqual(1, result.returncode)
        self.assertIn("EVIDENCE_FILES_MISSING", result.stderr)

    def test_production_workflows_share_concurrency_group(self) -> None:
        activation = (
            REPO
            / ".github/workflows/phase7f-production-api-identity-activation.yml"
        ).read_text()
        promotion = (
            REPO
            / ".github/workflows/phase7e-b-production-migration-promotion.yml"
        ).read_text()
        marker = "group: botolago-production-v2-mutation"
        self.assertEqual(1, activation.count(marker))
        self.assertEqual(1, promotion.count(marker))
        self.assertIn("cancel-in-progress: false", activation)
        self.assertIn("cancel-in-progress: false", promotion)
        self.assertEqual(
            "d133bad575aab75b4691821d02b6e01aef6308488c8db54b6b2a540f8b0fcecb",
            hashlib.sha256(promotion.encode()).hexdigest(),
        )

    def test_workflow_scopes_secrets_and_uses_single_operator_guard(
        self,
    ) -> None:
        workflow = (
            REPO
            / ".github/workflows/phase7f-production-api-identity-activation.yml"
        ).read_text()
        job_env = workflow.split("    steps:", 1)[0]
        pre_activation = workflow.split(
            "      - name: Run guarded Production V2 activation", 1
        )[0]
        self.assertIn(
            "environment: production-admin-activation", workflow
        )
        self.assertNotIn("secrets.SUPABASE_ACCESS_TOKEN", job_env)
        self.assertNotIn("secrets.SUPABASE_SECRET_KEY", job_env)
        self.assertNotIn("secrets.SUPABASE_ACCESS_TOKEN", pre_activation)
        self.assertNotIn("secrets.SUPABASE_SECRET_KEY", pre_activation)
        self.assertNotIn(
            "secrets.BOTOLAGO_AAL2_NON_STAFF_ACCESS_TOKEN",
            pre_activation,
        )
        self.assertNotIn("BOTOLAGO_GITHUB_GOVERNANCE_TOKEN", workflow)
        self.assertNotIn("BOTOLAGO_GITHUB_REQUIRED_REVIEWER_ID", workflow)
        self.assertNotIn(
            "BOTOLAGO_PRODUCTION_APPROVAL_ISSUE_NUMBER", workflow
        )
        self.assertNotIn("BOTOLAGO_AAL2_EVIDENCE_SHA256", workflow)
        self.assertNotIn("BOTOLAGO_ENVIRONMENT_", workflow)
        self.assertIn(
            "secrets.SUPABASE_PRODUCTION_PUBLISHABLE_KEY", workflow
        )
        self.assertNotIn(
            "vars.SUPABASE_PRODUCTION_PUBLISHABLE_KEY", workflow
        )
        self.assertIn("--verify-single-operator-context", workflow)
        self.assertNotIn("--verify-github-governance", workflow)
        self.assertNotIn("--create-run-approval-request", workflow)
        self.assertNotIn("--wait-for-run-approval", workflow)
        self.assertIn(
            "steps.operator_context.outcome == 'success'", workflow
        )
        self.assertIn(
            "steps.state_check.outputs.exists == 'true'", workflow
        )
        self.assertIn("--recover-from-state", workflow)
        self.assertIn("if-no-files-found: error", workflow)
        self.assertNotIn("grep -R", workflow)
        rerun_guard = workflow.index(
            'if [[ "${GITHUB_RUN_ATTEMPT:-}" != "1" ]]'
        )
        self.assertLess(rerun_guard, workflow.index("runtime_dir="))
        self.assertLess(
            rerun_guard, workflow.index("--verify-single-operator-context")
        )
        self.assertLess(
            rerun_guard,
            workflow.index("secrets.SUPABASE_ACCESS_TOKEN"),
        )
        self.assertIn("GITHUB_WORKFLOW_RERUN_FORBIDDEN", workflow)

    def test_controller_does_not_reveal_api_keys_through_management(self) -> None:
        controller = SCRIPT.read_text(encoding="utf-8")
        self.assertNotIn("/api-keys?reveal=true", controller)

    def test_job_cancellation_reaches_only_journal_guarded_recovery(
        self,
    ) -> None:
        workflow = (
            REPO
            / ".github/workflows/phase7f-production-api-identity-activation.yml"
        ).read_text()
        job_header = workflow.split("    steps:", 1)[0]
        self.assertIn(
            "if: >-\n"
            "      always() &&\n"
            "      github.repository == "
            "'mrdata007/botolago-foundation' &&\n"
            "      github.ref == 'refs/heads/main' &&\n"
            "      github.actor == 'mrdata007'",
            job_header,
        )
        ordinary_steps = (
            "Verify temporary single-operator execution context",
            "Run guarded Production V2 activation",
        )
        for name in ordinary_steps:
            start = workflow.index(f"      - name: {name}")
            end = workflow.find("      - name:", start + 1)
            if end < 0:
                end = len(workflow)
            self.assertNotIn("if: always()", workflow[start:end])

        state_start = workflow.index(
            "      - name: Inspect activation journal state"
        )
        recovery_start = workflow.index(
            "      - name: Independently recover or verify activation state"
        )
        evidence_start = workflow.index(
            "      - name: Verify evidence contains no credential patterns"
        )
        state_step = workflow[state_start:recovery_start]
        recovery_step = workflow[recovery_start:evidence_start]
        self.assertIn("always() &&", state_step)
        self.assertIn(
            "steps.operator_context.outcome == 'success'", state_step
        )
        self.assertNotIn("secrets.SUPABASE_", state_step)
        self.assertIn("always() &&", recovery_step)
        self.assertIn(
            "steps.operator_context.outcome == 'success'", recovery_step
        )
        self.assertIn(
            "steps.state_check.outputs.exists == 'true'", recovery_step
        )
        recovery_if = recovery_step.split("        shell:", 1)[0]
        self.assertNotIn("secrets.SUPABASE_", recovery_if)
        self.assertIn(
            "SUPABASE_ACCESS_TOKEN: "
            "${{ secrets.SUPABASE_ACCESS_TOKEN }}",
            recovery_step,
        )


def base64_url(value: dict[str, object]) -> str:
    import base64

    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")


if __name__ == "__main__":
    unittest.main()
