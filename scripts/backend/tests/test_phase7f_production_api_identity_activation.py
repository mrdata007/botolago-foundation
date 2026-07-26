from __future__ import annotations

import copy
import importlib.util
import json
import os
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

    def query(self, _sql: str, *, read_only: bool, timeout: int = 60):
        assert read_only
        return self.rows


class QueueHttp:
    def __init__(self, results: list[ACTIVATION.HttpResult]) -> None:
        self.results = list(results)

    def request(self, *_args, **_kwargs):
        if not self.results:
            raise AssertionError("unexpected HTTP request")
        return self.results.pop(0)


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

    def test_anonymous_profile_success_is_rejected(self) -> None:
        with self.assertRaises(ACTIVATION.ActivationError):
            ACTIVATION.record_case(
                [],
                "anon_my_profile",
                "ANONYMOUS",
                "PROFILE_READ",
                ACTIVATION.HttpResult(200, "application/json", b"[]"),
                401,
                "42501",
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

    def test_unprotected_live_environment_is_rejected(self) -> None:
        http = QueueHttp(
            [
                ACTIVATION.HttpResult(
                    200,
                    "application/json",
                    b'{"protection_rules":[],"deployment_branch_policy":null}',
                ),
                ACTIVATION.HttpResult(
                    200,
                    "application/json",
                    b'{"branch_policies":[]}',
                ),
            ]
        )
        env = {
            "GITHUB_TOKEN": "placeholder",
            "GITHUB_REPOSITORY": "mrdata007/botolago-foundation",
            "GITHUB_RUN_ID": "42",
        }
        with mock.patch.dict(os.environ, env, clear=True):
            with self.assertRaisesRegex(
                ACTIVATION.ActivationError,
                "GITHUB_ENVIRONMENT_UNPROTECTED",
            ):
                ACTIVATION.verify_github_protection(http)

    def test_unverifiable_environment_requires_valid_attestation(self) -> None:
        http = QueueHttp(
            [
                ACTIVATION.HttpResult(403, "application/json", b"{}"),
            ]
        )
        env = {
            "GITHUB_TOKEN": "placeholder",
            "GITHUB_REPOSITORY": "mrdata007/botolago-foundation",
            "GITHUB_RUN_ID": "42",
            "BOTOLAGO_ENVIRONMENT_PROTECTION_ATTESTATION_SHA256": "invalid",
            "BOTOLAGO_ENVIRONMENT_REQUIRED_REVIEWER_COUNT": "1",
            "BOTOLAGO_ENVIRONMENT_PREVENT_SELF_REVIEW": "true",
            "BOTOLAGO_ENVIRONMENT_DEPLOYMENT_BRANCH": "main",
            "BOTOLAGO_ENVIRONMENT_ADMIN_BYPASS_DISABLED": "true",
        }
        with mock.patch.dict(os.environ, env, clear=True):
            with self.assertRaisesRegex(
                ACTIVATION.ActivationError,
                "GITHUB_ENVIRONMENT_ATTESTATION_INVALID",
            ):
                ACTIVATION.verify_github_protection(http)

    def test_manifest_is_versioned_and_canonical_security_valid(self) -> None:
        value = json.loads(MANIFEST.read_text(encoding="utf-8"))
        ACTIVATION.validate_manifest_security(value)
        self.assertEqual(1, value["manifestVersion"])
        app = next(
            row for row in value["schemas"] if row["schema_name"] == "app"
        )
        self.assertTrue(app["role_privileges"]["authenticatedUsage"])
        self.assertFalse(app["role_privileges"]["anonUsage"])

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
        client = QueryClient([{"manifest": actual}])
        with self.assertRaisesRegex(
            ACTIVATION.ActivationError, "API_MANIFEST_DRIFT"
        ):
            ACTIVATION.assert_api_manifest(client, REPO)

    def test_live_api_manifest_exact_match_passes(self) -> None:
        expected = json.loads(MANIFEST.read_text(encoding="utf-8"))
        result = ACTIVATION.assert_api_manifest(
            QueryClient([{"manifest": expected}]), REPO
        )
        self.assertEqual("EXACT_MATCH", result["result"])

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
        client = QueryClient([{"manifest": actual}])
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
            "BOTOLAGO_AAL2_EVIDENCE_SHA256": "a" * 64,
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
            "BOTOLAGO_AAL2_EVIDENCE_SHA256": "a" * 64,
        }
        with mock.patch.dict(os.environ, env, clear=True):
            with self.assertRaises(ACTIVATION.ActivationError):
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

    def test_workflow_scopes_secrets_and_uses_independent_recovery(self) -> None:
        workflow = (
            REPO
            / ".github/workflows/phase7f-production-api-identity-activation.yml"
        ).read_text()
        job_env = workflow.split("    steps:", 1)[0]
        self.assertNotIn("secrets.SUPABASE_ACCESS_TOKEN", job_env)
        self.assertNotIn("secrets.SUPABASE_SECRET_KEY", job_env)
        self.assertIn("--recover-from-state", workflow)
        self.assertIn("if-no-files-found: error", workflow)
        self.assertNotIn("grep -R", workflow)


def base64_url(value: dict[str, object]) -> str:
    import base64

    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")


if __name__ == "__main__":
    unittest.main()
