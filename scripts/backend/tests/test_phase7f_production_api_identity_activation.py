from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import os
import signal
import stat
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
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
COMMIT = "a" * 40
HEAD_COMMIT = "b" * 40
REVIEWER_ID = 2002
ACTOR_ID = 1001
SAFE_CLASSIC = {
    "required_pull_request_reviews": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews": True,
        "require_last_push_approval": True,
    },
    "enforce_admins": {"enabled": True},
    "allow_force_pushes": {"enabled": False},
    "allow_deletions": {"enabled": False},
}
SAFE_RULESET = {
    "id": 77,
    "target": "branch",
    "enforcement": "active",
    "conditions": {
        "ref_name": {
            "include": ["refs/heads/main"],
            "exclude": [],
        }
    },
    "bypass_actors": [],
    "rules": [
        {
            "type": "pull_request",
            "parameters": {
                "required_approving_review_count": 1,
                "dismiss_stale_reviews_on_push": True,
                "require_last_push_approval": True,
            },
        },
        {"type": "non_fast_forward"},
        {"type": "deletion"},
    ],
}


def result(value: object, status: int = 200) -> ACTIVATION.HttpResult:
    return ACTIVATION.HttpResult(
        status,
        "application/json",
        json.dumps(value).encode("utf-8"),
    )


def governance_env(**overrides: str) -> dict[str, str]:
    values = {
        "BOTOLAGO_GITHUB_GOVERNANCE_TOKEN": "placeholder",
        "BOTOLAGO_GITHUB_REQUIRED_REVIEWER_ID": str(REVIEWER_ID),
        "GITHUB_ACTOR_ID": str(ACTOR_ID),
        "GITHUB_EVENT_NAME": "workflow_dispatch",
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_REPOSITORY": "mrdata007/botolago-foundation",
        "GITHUB_RUN_ID": "42",
        "GITHUB_SHA": COMMIT,
    }
    values.update(overrides)
    return values


def pull_value(**overrides: object) -> dict[str, object]:
    value: dict[str, object] = {
        "number": 38,
        "state": "closed",
        "merged_at": "2026-07-26T12:00:00Z",
        "merge_commit_sha": COMMIT,
        "base": {"ref": "main"},
        "head": {"sha": HEAD_COMMIT},
        "user": {"id": 3003, "type": "User", "login": "author"},
    }
    value.update(overrides)
    return value


def review_value(**overrides: object) -> dict[str, object]:
    value: dict[str, object] = {
        "id": 501,
        "state": "APPROVED",
        "commit_id": HEAD_COMMIT,
        "submitted_at": "2026-07-26T11:55:00Z",
        "user": {
            "id": REVIEWER_ID,
            "type": "User",
            "login": "reviewer",
        },
    }
    value.update(overrides)
    return value


def approval_env(**overrides: str) -> dict[str, str]:
    values = {
        "BOTOLAGO_GITHUB_GOVERNANCE_TOKEN": "placeholder",
        "BOTOLAGO_GITHUB_REQUIRED_REVIEWER_ID": str(REVIEWER_ID),
        "BOTOLAGO_PRODUCTION_APPROVAL_ISSUE_NUMBER": "123",
        "GITHUB_ACTOR_ID": str(ACTOR_ID),
        "GITHUB_REPOSITORY": "mrdata007/botolago-foundation",
        "GITHUB_RUN_ATTEMPT": "1",
        "GITHUB_RUN_ID": "42",
        "GITHUB_SHA": COMMIT,
        "GITHUB_WORKFLOW": "Phase 7F Production V2 API and Identity activation",
    }
    values.update(overrides)
    return values


def make_approval_request(
    *, expiry_seconds: int = 60
) -> tuple[dict[str, object], datetime]:
    now = datetime(2026, 7, 26, 12, 0, tzinfo=timezone.utc)
    with mock.patch.dict(os.environ, approval_env(), clear=True):
        request = ACTIVATION.create_run_approval_request(
            now=now,
            nonce="0123456789abcdef0123456789abcdef",
        )
    request["expiresAt"] = ACTIVATION.format_timestamp(
        now + timedelta(seconds=expiry_seconds)
    )
    return request, now


def approval_comment(
    request: dict[str, object], **overrides: object
) -> dict[str, object]:
    created = "2026-07-26T12:00:05Z"
    value: dict[str, object] = {
        "id": 701,
        "body": request["expectedComment"],
        "created_at": created,
        "updated_at": created,
        "user": {
            "id": REVIEWER_ID,
            "type": "User",
            "login": "reviewer",
        },
    }
    value.update(overrides)
    return value


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
        self.requests: list[tuple[tuple[object, ...], dict[str, object]]] = []

    def request(self, *args, **kwargs):
        self.requests.append((args, kwargs))
        if not self.results:
            raise AssertionError("unexpected HTTP request")
        return self.results.pop(0)


class FakeClock:
    def __init__(self, value: datetime) -> None:
        self.value = value

    def now(self) -> datetime:
        return self.value

    def sleep(self, seconds: float) -> None:
        self.value += timedelta(seconds=seconds)


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

    def test_safe_classic_main_governance_passes(self) -> None:
        value = ACTIVATION.verify_main_governance(
            QueueHttp([result(SAFE_CLASSIC)]),
            "placeholder",
            "mrdata007/botolago-foundation",
        )
        self.assertEqual("CLASSIC_BRANCH_PROTECTION", value["mode"])

    def test_safe_active_ruleset_passes(self) -> None:
        value = ACTIVATION.verify_main_governance(
            QueueHttp(
                [
                    result({}, 404),
                    result([{"id": 77}]),
                    result(SAFE_RULESET),
                ]
            ),
            "placeholder",
            "mrdata007/botolago-foundation",
        )
        self.assertEqual("REPOSITORY_RULESET", value["mode"])

    def test_full_governance_passes_without_supabase_credentials(self) -> None:
        http = QueueHttp(
            [
                result(SAFE_CLASSIC),
                result([pull_value()]),
                result([review_value()]),
                result({"author": {"id": 4004}}),
                result({"workflow_runs": []}),
                result({"workflow_runs": []}),
            ]
        )
        with mock.patch.dict(
            os.environ, governance_env(), clear=True
        ):
            value = ACTIVATION.verify_github_governance(http, COMMIT)
        self.assertEqual("PASS", value["result"])
        self.assertNotIn("SUPABASE", json.dumps(value))

    def test_missing_or_unreadable_main_governance_fails_closed(self) -> None:
        cases = (
            (
                [result({}, 404), result([])],
                "GITHUB_BRANCH_PROTECTION_UNVERIFIED",
            ),
            (
                [result({}, 403), result({}, 403)],
                "GITHUB_BRANCH_PROTECTION_UNVERIFIED",
            ),
        )
        for responses, code in cases:
            with self.subTest(code=code):
                with self.assertRaisesRegex(
                    ACTIVATION.ActivationError, code
                ):
                    ACTIVATION.verify_main_governance(
                        QueueHttp(responses),
                        "placeholder",
                        "mrdata007/botolago-foundation",
                    )

    def test_each_unsafe_classic_control_fails_closed(self) -> None:
        variants: dict[str, dict[str, object]] = {}
        no_pull_request = copy.deepcopy(SAFE_CLASSIC)
        no_pull_request["required_pull_request_reviews"] = None
        variants["pull request not required"] = no_pull_request
        zero_approvals = copy.deepcopy(SAFE_CLASSIC)
        zero_approvals["required_pull_request_reviews"][
            "required_approving_review_count"
        ] = 0
        variants["zero approvals"] = zero_approvals
        stale_allowed = copy.deepcopy(SAFE_CLASSIC)
        stale_allowed["required_pull_request_reviews"][
            "dismiss_stale_reviews"
        ] = False
        variants["stale reviews retained"] = stale_allowed
        latest_push_missing = copy.deepcopy(SAFE_CLASSIC)
        latest_push_missing["required_pull_request_reviews"][
            "require_last_push_approval"
        ] = False
        variants["latest push approval absent"] = latest_push_missing
        admin_bypass = copy.deepcopy(SAFE_CLASSIC)
        admin_bypass["enforce_admins"]["enabled"] = False
        variants["administrator bypass"] = admin_bypass
        force_push = copy.deepcopy(SAFE_CLASSIC)
        force_push["allow_force_pushes"]["enabled"] = True
        variants["force push"] = force_push
        deletion = copy.deepcopy(SAFE_CLASSIC)
        deletion["allow_deletions"]["enabled"] = True
        variants["deletion"] = deletion
        for name, protection in variants.items():
            with self.subTest(name=name):
                with self.assertRaisesRegex(
                    ACTIVATION.ActivationError,
                    "GITHUB_BRANCH_PROTECTION_UNSAFE",
                ):
                    ACTIVATION.verify_main_governance(
                        QueueHttp([result(protection), result([])]),
                        "placeholder",
                        "mrdata007/botolago-foundation",
                    )

    def test_disabled_or_unsafe_ruleset_fails_closed(self) -> None:
        disabled = copy.deepcopy(SAFE_RULESET)
        disabled["enforcement"] = "disabled"
        unsafe = copy.deepcopy(SAFE_RULESET)
        unsafe["bypass_actors"] = [{"actor_type": "RepositoryRole"}]
        excluded = copy.deepcopy(SAFE_RULESET)
        excluded["conditions"]["ref_name"]["exclude"] = [
            "refs/heads/*"
        ]
        cases = (
            (disabled, "GITHUB_RULESET_UNSAFE"),
            (unsafe, "GITHUB_RULESET_UNSAFE"),
            (excluded, "GITHUB_BRANCH_PROTECTION_UNVERIFIED"),
        )
        for value, code in cases:
            with self.subTest(
                enforcement=value["enforcement"], code=code
            ):
                with self.assertRaisesRegex(
                    ACTIVATION.ActivationError,
                    code,
                ):
                    ACTIVATION.verify_main_governance(
                        QueueHttp(
                            [
                                result({}, 404),
                                result([{"id": 77}]),
                                result(value),
                            ]
                        ),
                        "placeholder",
                        "mrdata007/botolago-foundation",
                    )

    def test_unreadable_ruleset_detail_fails_closed(self) -> None:
        with self.assertRaisesRegex(
            ACTIVATION.ActivationError, "GITHUB_RULESET_UNVERIFIED"
        ):
            ACTIVATION.verify_main_governance(
                QueueHttp(
                    [
                        result({}, 404),
                        result([{"id": 77}]),
                        result({}, 403),
                    ]
                ),
                "placeholder",
                "mrdata007/botolago-foundation",
            )

    def test_exact_merged_pr_and_designated_review_passes(self) -> None:
        value = ACTIVATION.verify_exact_reviewed_commit(
            QueueHttp(
                [
                    result([pull_value()]),
                    result([review_value()]),
                    result({"author": {"id": 4004}}),
                ]
            ),
            "placeholder",
            "mrdata007/botolago-foundation",
            COMMIT,
            REVIEWER_ID,
            ACTOR_ID,
        )
        self.assertEqual(38, value["pullRequestNumber"])
        self.assertNotIn(str(REVIEWER_ID), json.dumps(value))
        self.assertNotIn('"login"', json.dumps(value))

    def test_missing_or_inapplicable_merged_pr_fails(self) -> None:
        cases = (
            [],
            [pull_value(state="open", merged_at=None)],
            [pull_value(base={"ref": "develop"})],
            [pull_value(merge_commit_sha="c" * 40)],
        )
        for pulls in cases:
            with self.subTest(pulls=pulls):
                with self.assertRaisesRegex(
                    ACTIVATION.ActivationError,
                    "GITHUB_APPROVED_PR_NOT_FOUND",
                ):
                    ACTIVATION.verify_exact_reviewed_commit(
                        QueueHttp([result(pulls)]),
                        "placeholder",
                        "mrdata007/botolago-foundation",
                        COMMIT,
                        REVIEWER_ID,
                        ACTOR_ID,
                    )

    def test_multiple_applicable_prs_fail(self) -> None:
        with self.assertRaisesRegex(
            ACTIVATION.ActivationError, "GITHUB_MULTIPLE_PR_MATCHES"
        ):
            ACTIVATION.verify_exact_reviewed_commit(
                QueueHttp([result([pull_value(), pull_value(number=39)])]),
                "placeholder",
                "mrdata007/botolago-foundation",
                COMMIT,
                REVIEWER_ID,
                ACTOR_ID,
            )

    def test_wrong_dismissed_bot_or_changes_requested_review_fails(self) -> None:
        cases = (
            (
                [review_value(user={"id": 9999, "type": "User"})],
                "GITHUB_REQUIRED_REVIEWER_MISSING",
            ),
            (
                [review_value(state="DISMISSED")],
                "GITHUB_REQUIRED_REVIEWER_MISSING",
            ),
            (
                [review_value(state="COMMENTED")],
                "GITHUB_REQUIRED_REVIEWER_MISSING",
            ),
            (
                [
                    review_value(
                        user={
                            "id": REVIEWER_ID,
                            "type": "Bot",
                            "login": "review-bot",
                        }
                    )
                ],
                "GITHUB_REQUIRED_REVIEWER_MISSING",
            ),
            (
                [
                    review_value(
                        user={
                            "id": REVIEWER_ID,
                            "type": "User",
                            "login": "copilot-pull-request-reviewer",
                        }
                    )
                ],
                "GITHUB_REQUIRED_REVIEWER_MISSING",
            ),
            (
                [
                    review_value(),
                    review_value(
                        id=502,
                        state="CHANGES_REQUESTED",
                        user={"id": 9999, "type": "User"},
                        submitted_at="2026-07-26T11:56:00Z",
                    ),
                ],
                "GITHUB_PR_GOVERNANCE_UNVERIFIED",
            ),
        )
        for reviews, code in cases:
            with self.subTest(code=code):
                with self.assertRaisesRegex(
                    ACTIVATION.ActivationError, code
                ):
                    ACTIVATION.verify_exact_reviewed_commit(
                        QueueHttp(
                            [result([pull_value()]), result(reviews)]
                        ),
                        "placeholder",
                        "mrdata007/botolago-foundation",
                        COMMIT,
                        REVIEWER_ID,
                        ACTOR_ID,
                    )

    def test_stale_review_for_older_head_fails(self) -> None:
        with self.assertRaisesRegex(
            ACTIVATION.ActivationError, "GITHUB_REVIEW_STALE"
        ):
            ACTIVATION.verify_exact_reviewed_commit(
                QueueHttp(
                    [
                        result([pull_value()]),
                        result([review_value(commit_id="c" * 40)]),
                    ]
                ),
                "placeholder",
                "mrdata007/botolago-foundation",
                COMMIT,
                REVIEWER_ID,
                ACTOR_ID,
            )

    def test_reviewer_must_be_independent(self) -> None:
        cases = (
            (REVIEWER_ID, 3003, 4004),
            (ACTOR_ID, REVIEWER_ID, 4004),
            (ACTOR_ID, 3003, REVIEWER_ID),
        )
        for actor_id, author_id, push_author_id in cases:
            with self.subTest(
                actor=actor_id,
                author=author_id,
                pusher=push_author_id,
            ):
                with self.assertRaisesRegex(
                    ACTIVATION.ActivationError,
                    "GITHUB_REVIEWER_NOT_INDEPENDENT",
                ):
                    ACTIVATION.verify_exact_reviewed_commit(
                        QueueHttp(
                            [
                                result(
                                    [
                                        pull_value(
                                            user={
                                                "id": author_id,
                                                "type": "User",
                                            }
                                        )
                                    ]
                                ),
                                result([review_value()]),
                                result(
                                    {
                                        "author": {
                                            "id": push_author_id
                                        }
                                    }
                                ),
                            ]
                        ),
                        "placeholder",
                        "mrdata007/botolago-foundation",
                        COMMIT,
                        REVIEWER_ID,
                        actor_id,
                    )

    def test_approval_request_is_run_bound_and_needs_no_supabase_secret(
        self,
    ) -> None:
        now = datetime(2026, 7, 26, 12, 0, tzinfo=timezone.utc)
        with mock.patch.dict(os.environ, approval_env(), clear=True):
            request = ACTIVATION.create_run_approval_request(
                now=now,
                nonce="0123456789abcdef0123456789abcdef",
            )
        self.assertEqual(42, request["runId"])
        self.assertEqual(1, request["runAttempt"])
        self.assertEqual(COMMIT, request["commit"])
        self.assertEqual(
            ACTIVATION.EXPECTED_PROJECT_REF, request["projectRef"]
        )
        self.assertNotIn("SUPABASE", json.dumps(request))
        expiry = ACTIVATION.parse_github_timestamp(request["expiresAt"])
        self.assertLessEqual((expiry - now).total_seconds(), 900)

    def test_exact_fresh_run_approval_comment_passes(self) -> None:
        request, now = make_approval_request()
        clock = FakeClock(now)
        http = QueueHttp(
            [
                result({"number": 123, "state": "open"}),
                result([approval_comment(request)]),
            ]
        )
        with mock.patch.dict(os.environ, approval_env(), clear=True):
            value = ACTIVATION.wait_for_run_approval(
                http,
                request,
                now_fn=clock.now,
                sleep_fn=clock.sleep,
            )
        self.assertEqual("PASS", value["result"])
        self.assertNotIn(str(REVIEWER_ID), json.dumps(value))

    def test_wrong_run_bound_approval_fields_fail(self) -> None:
        request, now = make_approval_request()
        expected = str(request["expectedComment"])
        variants = {
            "run id": expected.replace("run_id=42", "run_id=41"),
            "run attempt": expected.replace(
                "run_attempt=1", "run_attempt=2"
            ),
            "commit": expected.replace(COMMIT, "c" * 40),
            "project": expected.replace(
                ACTIVATION.EXPECTED_PROJECT_REF,
                ACTIVATION.KNOWN_STAGING_REF,
            ),
            "nonce": expected.replace(
                str(request["nonce"]), "f" * 32
            ),
            "extra command": expected + " force=true",
            "previous run": expected.replace("run_id=42", "run_id=7"),
        }
        for name, body in variants.items():
            with self.subTest(name=name):
                http = QueueHttp(
                    [
                        result({"number": 123, "state": "open"}),
                        result(
                            [approval_comment(request, body=body)]
                        ),
                    ]
                )
                with mock.patch.dict(
                    os.environ, approval_env(), clear=True
                ):
                    with self.assertRaisesRegex(
                        ACTIVATION.ActivationError,
                        "GITHUB_RUN_APPROVAL_INVALID",
                    ):
                        ACTIVATION.wait_for_run_approval(
                            http,
                            request,
                            now_fn=lambda: now,
                            sleep_fn=lambda _seconds: None,
                        )

    def test_wrong_or_self_run_approver_fails(self) -> None:
        request, now = make_approval_request()
        cases = (
            (
                {
                    "id": 9999,
                    "type": "User",
                    "login": "other",
                },
                "GITHUB_RUN_APPROVER_MISMATCH",
            ),
            (
                {
                    "id": ACTOR_ID,
                    "type": "User",
                    "login": "dispatcher",
                },
                "GITHUB_RUN_SELF_APPROVAL_FORBIDDEN",
            ),
        )
        for author, code in cases:
            with self.subTest(code=code):
                with mock.patch.dict(
                    os.environ, approval_env(), clear=True
                ):
                    with self.assertRaisesRegex(
                        ACTIVATION.ActivationError, code
                    ):
                        ACTIVATION.wait_for_run_approval(
                            QueueHttp(
                                [
                                    result(
                                        {
                                            "number": 123,
                                            "state": "open",
                                        }
                                    ),
                                    result(
                                        [
                                            approval_comment(
                                                request, user=author
                                            )
                                        ]
                                    ),
                                ]
                            ),
                            request,
                            now_fn=lambda: now,
                            sleep_fn=lambda _seconds: None,
                        )

    def test_expired_or_edited_run_approval_fails(self) -> None:
        request, now = make_approval_request(expiry_seconds=10)
        cases = (
            (
                approval_comment(
                    request,
                    created_at="2026-07-26T12:00:11Z",
                    updated_at="2026-07-26T12:00:11Z",
                ),
                "GITHUB_RUN_APPROVAL_EXPIRED",
            ),
            (
                approval_comment(
                    request,
                    updated_at="2026-07-26T12:00:06Z",
                ),
                "GITHUB_RUN_APPROVAL_INVALID",
            ),
        )
        for comment, code in cases:
            with self.subTest(code=code):
                with mock.patch.dict(
                    os.environ, approval_env(), clear=True
                ):
                    with self.assertRaisesRegex(
                        ACTIVATION.ActivationError, code
                    ):
                        ACTIVATION.wait_for_run_approval(
                            QueueHttp(
                                [
                                    result(
                                        {
                                            "number": 123,
                                            "state": "open",
                                        }
                                    ),
                                    result([comment]),
                                ]
                            ),
                            request,
                            now_fn=lambda: now,
                            sleep_fn=lambda _seconds: None,
                        )

    def test_old_and_unrelated_comments_are_ignored_until_timeout(
        self,
    ) -> None:
        request, now = make_approval_request(expiry_seconds=1)
        old = approval_comment(
            request,
            created_at="2026-07-26T11:59:59Z",
            updated_at="2026-07-26T11:59:59Z",
        )
        unrelated = approval_comment(
            request,
            body="ordinary issue discussion",
        )
        clock = FakeClock(now)
        with mock.patch.dict(os.environ, approval_env(), clear=True):
            with self.assertRaisesRegex(
                ACTIVATION.ActivationError,
                "GITHUB_RUN_APPROVAL_TIMEOUT",
            ):
                ACTIVATION.wait_for_run_approval(
                    QueueHttp(
                        [
                            result(
                                {"number": 123, "state": "open"}
                            ),
                            result([old, unrelated]),
                            result([]),
                        ]
                    ),
                    request,
                    now_fn=clock.now,
                    sleep_fn=clock.sleep,
                )

    def test_wrong_issue_or_issue_api_failure_fails_before_mutation(
        self,
    ) -> None:
        request, now = make_approval_request()
        responses = (
            result({"number": 999, "state": "open"}),
            result({}, 403),
        )
        for response in responses:
            with self.subTest(status=response.status):
                with mock.patch.dict(
                    os.environ, approval_env(), clear=True
                ):
                    with self.assertRaisesRegex(
                        ACTIVATION.ActivationError,
                        "GITHUB_APPROVAL_ISSUE_UNVERIFIED",
                    ):
                        ACTIVATION.wait_for_run_approval(
                            QueueHttp([response]),
                            request,
                            now_fn=lambda: now,
                            sleep_fn=lambda _seconds: None,
                        )

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
        self.assertEqual(
            "d133bad575aab75b4691821d02b6e01aef6308488c8db54b6b2a540f8b0fcecb",
            hashlib.sha256(promotion.encode()).hexdigest(),
        )

    def test_workflow_scopes_secrets_and_uses_independent_recovery(self) -> None:
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
        self.assertEqual(
            2,
            workflow.count(
                "secrets.BOTOLAGO_GITHUB_GOVERNANCE_TOKEN"
            ),
        )
        self.assertNotIn("BOTOLAGO_ENVIRONMENT_", workflow)
        self.assertIn("--verify-github-governance", workflow)
        self.assertIn("--create-run-approval-request", workflow)
        self.assertIn("--wait-for-run-approval", workflow)
        self.assertIn(
            "steps.run_approval.outcome == 'success'", workflow
        )
        self.assertIn(
            "steps.state_check.outputs.exists == 'true'", workflow
        )
        self.assertIn("--recover-from-state", workflow)
        self.assertIn("if-no-files-found: error", workflow)
        self.assertNotIn("grep -R", workflow)


def base64_url(value: dict[str, object]) -> str:
    import base64

    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")


if __name__ == "__main__":
    unittest.main()
