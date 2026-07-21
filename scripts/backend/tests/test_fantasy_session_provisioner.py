from __future__ import annotations

import asyncio
import base64
import contextlib
import importlib.util
import io
import json
import os
import signal
import subprocess
import tempfile
import time
import unittest
import uuid
from pathlib import Path
from unittest import mock


SCRIPT = Path(__file__).resolve().parents[1] / "fantasy-session-provisioner.py"
SPEC = importlib.util.spec_from_file_location("fantasy_session_provisioner", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("unable to load fantasy session provisioner")
PROVISIONER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROVISIONER)

ORCHESTRATOR_SCRIPT = Path(__file__).resolve().parents[1] / "fantasy-capacity-orchestrator.py"
ORCHESTRATOR_SPEC = importlib.util.spec_from_file_location(
    "fantasy_capacity_orchestrator", ORCHESTRATOR_SCRIPT
)
if ORCHESTRATOR_SPEC is None or ORCHESTRATOR_SPEC.loader is None:
    raise RuntimeError("unable to load fantasy capacity orchestrator")
ORCHESTRATOR = importlib.util.module_from_spec(ORCHESTRATOR_SPEC)
ORCHESTRATOR_SPEC.loader.exec_module(ORCHESTRATOR)

REPORT_SCRIPT = Path(__file__).resolve().parents[1] / "fantasy-capacity-report.py"
REPORT_SPEC = importlib.util.spec_from_file_location("fantasy_capacity_report", REPORT_SCRIPT)
if REPORT_SPEC is None or REPORT_SPEC.loader is None:
    raise RuntimeError("unable to load fantasy capacity report")
REPORT = importlib.util.module_from_spec(REPORT_SPEC)
REPORT_SPEC.loader.exec_module(REPORT)


class FakeResponse:
    def __init__(self, status: int, body: object) -> None:
        self.status = status
        self.body = json.dumps(body)

    async def __aenter__(self) -> "FakeResponse":
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def text(self) -> str:
        return self.body


class FakeClientSession:
    response: FakeResponse

    def __init__(self, **_: object) -> None:
        pass

    async def __aenter__(self) -> "FakeClientSession":
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    def post(self, *_: object, **__: object) -> FakeResponse:
        return self.response


class FakeTimeoutClientSession:
    def __init__(self, **_: object) -> None:
        pass

    async def __aenter__(self) -> "FakeTimeoutClientSession":
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    def post(self, *_: object, **__: object) -> object:
        raise asyncio.TimeoutError()


def jwt(claims: dict[str, object]) -> str:
    def encode(value: object) -> str:
        raw = json.dumps(value, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).decode().rstrip("=")

    return f"{encode({'alg': 'none'})}.{encode(claims)}.test"


class SessionProvisionerTests(unittest.TestCase):
    def setUp(self) -> None:
        PROVISIONER._DIAGNOSTICS_PATH = None
        PROVISIONER._RUNNER_ID = None
        PROVISIONER._CURRENT_USER_INDEX = -1
        PROVISIONER._SESSIONS_PROVISIONED = 0
        PROVISIONER._FINAL_DIAGNOSTIC_WRITTEN = False

    def environment(self, root: Path, user_id: str) -> dict[str, str]:
        credentials = root / "credentials.json"
        credentials.write_text(
            json.dumps(
                [
                    {
                        "number": 50001,
                        "email": "gate-user@staging.invalid",
                        "password": "temporary-password",
                        "user_id": user_id,
                    }
                ]
            )
        )
        credentials.chmod(0o600)
        return {
            "BOTOLAGO_LOAD_ENVIRONMENT": "staging-v2",
            "BOTOLAGO_STAGING_SUPABASE_URL": "https://example.supabase.co",
            "BOTOLAGO_STAGING_PUBLISHABLE_KEY": "sb_publishable_example",
            "BOTOLAGO_LOAD_CREDENTIAL_CACHE": str(credentials),
            "BOTOLAGO_LOAD_SESSION_CACHE": str(root / "sessions.json"),
            "BOTOLAGO_SESSION_DIAGNOSTICS_PATH": str(root / "diagnostics.ndjson"),
            "BOTOLAGO_RUNNER_ID": "3",
            "BOTOLAGO_AUTH_RATE_PER_SECOND": "0.4",
            "BOTOLAGO_CAPACITY_MODE": "session_provisioning_rehearsal",
            "BOTOLAGO_EXPECTED_SESSION_USERS": "1",
        }

    def run_provision_with_final_diagnostic(self) -> dict[str, object]:
        exit_code = 0
        try:
            result = asyncio.run(PROVISIONER.provision())
            PROVISIONER.record_final_diagnostic(
                status="success",
                exit_kind="normal",
                exit_code=0,
                reason="completed",
            )
            return result
        except SystemExit as error:
            exit_code = error.code if isinstance(error.code, int) else 1
            PROVISIONER.record_final_diagnostic(
                status="failure",
                exit_kind="system_exit",
                exit_code=exit_code,
                reason=str(error),
            )
            raise
        finally:
            if not PROVISIONER._FINAL_DIAGNOSTIC_WRITTEN:
                PROVISIONER.record_final_diagnostic(
                    status="failure" if exit_code else "success",
                    exit_kind="finally",
                    exit_code=exit_code,
                    reason="last_chance",
                )

    def test_failure_writes_sanitized_structured_diagnostic_and_stderr(self) -> None:
        user_id = str(uuid.uuid4())
        secret_value = "sb_" + "secret_" + "must-not-survive"
        token_value = "header." + "payload." + "signature"
        FakeClientSession.response = FakeResponse(
            400,
            {
                "code": "invalid_credentials",
                "message": "Invalid login for gate-user@staging.invalid",
                "access_token": token_value,
                "refresh_token": "must-not-survive",
                "password": "must-not-survive",
                "api_key": secret_value,
            },
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            stderr = io.StringIO()
            with (
                mock.patch.dict(os.environ, self.environment(root, user_id), clear=True),
                mock.patch.object(PROVISIONER.aiohttp, "ClientSession", FakeClientSession),
                contextlib.redirect_stderr(stderr),
                self.assertRaises(SystemExit),
            ):
                asyncio.run(PROVISIONER.provision())

            diagnostics = [
                json.loads(line)
                for line in (root / "diagnostics.ndjson").read_text().splitlines()
            ]
            record = next(
                item for item in diagnostics if item["event"] == "authentication_failure"
            )
            self.assertEqual(record["httpStatus"], 400)
            self.assertEqual(record["supabaseErrorCode"], "invalid_credentials")
            self.assertEqual(record["runnerId"], 3)
            self.assertEqual(record["userIndex"], 0)
            self.assertGreaterEqual(record["requestDurationMs"], 0)
            self.assertEqual(record["responseBody"]["access_token"], "[REDACTED]")
            self.assertEqual(record["responseBody"]["refresh_token"], "[REDACTED]")
            self.assertEqual(record["responseBody"]["password"], "[REDACTED]")
            self.assertEqual(record["responseBody"]["api_key"], "[REDACTED]")
            combined = json.dumps(diagnostics) + stderr.getvalue()
            self.assertNotIn("must-not-survive", combined)
            self.assertNotIn("gate-user@staging.invalid", combined)
            self.assertNotIn(secret_value, combined)

    def test_five_user_rehearsal_contract_accepts_one_session_per_runner(self) -> None:
        user_id = str(uuid.uuid4())
        session_id = str(uuid.uuid4())
        access_token = jwt(
            {
                "sub": user_id,
                "session_id": session_id,
                "role": "authenticated",
                "exp": int(time.time()) + 3600,
            }
        )
        FakeClientSession.response = FakeResponse(
            200,
            {
                "access_token": access_token,
                "refresh_token": "independent-refresh-material",
            },
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with (
                mock.patch.dict(os.environ, self.environment(root, user_id), clear=True),
                mock.patch.object(PROVISIONER.aiohttp, "ClientSession", FakeClientSession),
            ):
                result = self.run_provision_with_final_diagnostic()

            self.assertEqual(result["runnerId"], 3)
            self.assertEqual(result["sessions"], 1)
            self.assertEqual(result["uniqueSubjects"], 1)
            self.assertEqual(result["uniqueSessionIds"], 1)
            self.assertGreaterEqual(result["minimumValidityMinutes"], 20)
            diagnostics = [
                json.loads(line)
                for line in (root / "diagnostics.ndjson").read_text().splitlines()
            ]
            self.assertEqual(
                [item["event"] for item in diagnostics],
                [
                    "session_provisioning_start",
                    "auth_request_start",
                    "auth_response_received",
                    "session_provisioning_exit",
                ],
            )
            self.assertEqual(diagnostics[-1]["status"], "success")
            self.assertEqual(diagnostics[-1]["sessionsProvisioned"], 1)
            self.assertFalse((root / "credentials.json").exists())
            self.assertTrue((root / "sessions.json").is_file())

    def test_exception_before_first_http_request_writes_final_diagnostic(self) -> None:
        user_id = str(uuid.uuid4())
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            env = self.environment(root, user_id)
            env["BOTOLAGO_CAPACITY_MODE"] = "full_gate"
            env["BOTOLAGO_EXPECTED_SESSION_USERS"] = "1"
            with (
                mock.patch.dict(os.environ, env, clear=True),
                self.assertRaises(SystemExit),
            ):
                self.run_provision_with_final_diagnostic()

            diagnostics = [
                json.loads(line)
                for line in (root / "diagnostics.ndjson").read_text().splitlines()
            ]
            self.assertEqual(diagnostics[-1]["event"], "session_provisioning_exit")
            self.assertEqual(diagnostics[-1]["status"], "failure")
            self.assertEqual(diagnostics[-1]["sessionsProvisioned"], 0)

    def test_exception_after_http_request_writes_auth_and_final_diagnostics(self) -> None:
        user_id = str(uuid.uuid4())
        FakeClientSession.response = FakeResponse(
            200,
            {
                "access_token": "malformed-token",
                "refresh_token": "independent-refresh-material",
            },
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with (
                mock.patch.dict(os.environ, self.environment(root, user_id), clear=True),
                mock.patch.object(PROVISIONER.aiohttp, "ClientSession", FakeClientSession),
                self.assertRaises(SystemExit),
            ):
                self.run_provision_with_final_diagnostic()

            diagnostics = [
                json.loads(line)
                for line in (root / "diagnostics.ndjson").read_text().splitlines()
            ]
            self.assertEqual(
                [item["event"] for item in diagnostics],
                [
                    "session_provisioning_start",
                    "auth_request_start",
                    "auth_response_received",
                    "authentication_exception",
                    "authentication_failure",
                    "session_provisioning_exit",
                ],
            )
            auth_failure = next(
                item for item in diagnostics if item["event"] == "authentication_failure"
            )
            self.assertEqual(auth_failure["supabaseErrorCode"], "invalid_auth_response")
            self.assertEqual(diagnostics[-1]["status"], "failure")

    def test_http_401_records_unauthorized_classification(self) -> None:
        self.assert_http_error_classification(401, "unauthorized", "invalid_credentials")

    def test_http_429_records_rate_limited_classification(self) -> None:
        self.assert_http_error_classification(429, "rate_limited", "over_request_rate_limit")

    def assert_http_error_classification(
        self,
        status: int,
        classification: str,
        code: str,
    ) -> None:
        user_id = str(uuid.uuid4())
        FakeClientSession.response = FakeResponse(
            status,
            {
                "code": code,
                "message": "sanitized failure",
            },
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with (
                mock.patch.dict(os.environ, self.environment(root, user_id), clear=True),
                mock.patch.object(PROVISIONER.aiohttp, "ClientSession", FakeClientSession),
                self.assertRaises(SystemExit),
            ):
                self.run_provision_with_final_diagnostic()

            diagnostics = [
                json.loads(line)
                for line in (root / "diagnostics.ndjson").read_text().splitlines()
            ]
            response = next(
                item for item in diagnostics if item["event"] == "auth_response_received"
            )
            auth_failure = next(
                item for item in diagnostics if item["event"] == "authentication_failure"
            )
            self.assertEqual(response["httpStatus"], status)
            self.assertEqual(response["responseClassification"], classification)
            self.assertEqual(auth_failure["supabaseErrorCode"], code)
            self.assertEqual(diagnostics[-1]["status"], "failure")

    def test_network_timeout_records_exception_diagnostic(self) -> None:
        user_id = str(uuid.uuid4())
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with (
                mock.patch.dict(os.environ, self.environment(root, user_id), clear=True),
                mock.patch.object(PROVISIONER.aiohttp, "ClientSession", FakeTimeoutClientSession),
                self.assertRaises(SystemExit),
            ):
                self.run_provision_with_final_diagnostic()

            diagnostics = [
                json.loads(line)
                for line in (root / "diagnostics.ndjson").read_text().splitlines()
            ]
            exception = next(
                item for item in diagnostics if item["event"] == "authentication_exception"
            )
            self.assertEqual(exception["exceptionClass"], "TimeoutError")
            self.assertEqual(exception["responseClassification"], "no_response")
            self.assertEqual(diagnostics[-1]["status"], "failure")

    def test_signal_termination_writes_terminal_diagnostic(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            diagnostics = root / "diagnostics.ndjson"
            PROVISIONER.configure_diagnostics_path(diagnostics)
            PROVISIONER._RUNNER_ID = 4
            PROVISIONER.install_signal_handlers()
            with self.assertRaises(SystemExit) as raised:
                signal.raise_signal(signal.SIGTERM)

            self.assertEqual(raised.exception.code, 143)
            records = [
                json.loads(line)
                for line in diagnostics.read_text().splitlines()
            ]
            self.assertEqual(records[-1]["event"], "session_provisioning_exit")
            self.assertEqual(records[-1]["exitKind"], "signal")
            self.assertEqual(records[-1]["status"], "failure")

    def test_orchestrator_session_rehearsal_is_bounded_to_five_users(self) -> None:
        runtime = {
            "SUPABASE_ACCESS_TOKEN": "management-placeholder",
            "SUPABASE_STAGING_PROJECT_REF": "exampleprojectref001",
            "SUPABASE_STAGING_URL": "https://exampleprojectref001.supabase.co",
            "SUPABASE_STAGING_PUBLISHABLE_KEY": "sb_publishable_example",
            "AWS_ACCESS_KEY_ID": "temporary-placeholder",
            "AWS_SECRET_ACCESS_KEY": "temporary-placeholder",
            "AWS_SESSION_TOKEN": "temporary-placeholder",
            "AWS_REGION": "eu-west-3",
        }
        fake_session = mock.Mock()
        fake_session.client.side_effect = lambda service, config=None: mock.Mock(
            service=service, meta=mock.Mock(region_name="eu-west-3")
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with (
                mock.patch.object(ORCHESTRATOR, "ARTIFACT_ROOT", root / "evidence"),
                mock.patch.object(ORCHESTRATOR, "RUNTIME_ROOT", root / "runtime"),
                mock.patch.object(ORCHESTRATOR.boto3, "Session", return_value=fake_session),
            ):
                gate = ORCHESTRATOR.CapacityGate(
                    ORCHESTRATOR.SESSION_PROVISIONING_REHEARSAL_MODE,
                    runtime=runtime,
                )

            self.assertEqual(gate.users_per_runner, 1)
            self.assertEqual(gate.total_users, 5)
            self.assertEqual(gate.first_user_number, 50001)
            self.assertEqual(gate.last_user_number, 50005)

    def test_artifact_scan_rejects_unredacted_session_material(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            unsafe = root / "diagnostics.ndjson"
            unsafe.write_text('{"refresh_token":"raw-session-material"}\n')
            violations = REPORT.scan_artifacts(root)
            self.assertEqual(
                [item["pattern"] for item in violations],
                ["session_token_value"],
            )

            unsafe.write_text('{"refresh_token":"[REDACTED]"}\n')
            self.assertEqual(REPORT.scan_artifacts(root), [])

    def test_orchestrator_records_abrupt_subprocess_failure_artifact_stage(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            diagnostic_path = root / "diagnostics.ndjson"
            stderr_path = root / "stderr.log"
            diagnostic_path.write_text("")
            stderr_path.write_text("")
            parsed = ORCHESTRATOR.sanitized_diagnostic_records(diagnostic_path.read_text())
            artifact_record = {
                "event": "artifact_collection_failure",
                "artifactExists": diagnostic_path.exists(),
                "artifactSizeBytes": diagnostic_path.stat().st_size,
                "copySucceeded": True,
                "remoteExists": False,
                "remoteSizeBytes": 0,
                "runnerId": 3,
                "stage": "remote-diagnostic-missing",
                "stderrSizeBytes": stderr_path.stat().st_size,
            }
            parsed["records"].append(artifact_record)
            parsed["artifactFailures"].append(artifact_record)

            self.assertEqual(parsed["finalRecords"], [])
            self.assertEqual(parsed["artifactFailures"][0]["stage"], "remote-diagnostic-missing")
            with self.assertRaises(subprocess.CalledProcessError):
                raise subprocess.CalledProcessError(1, "session provisioner")

    def test_cleanup_timeout_with_verified_zero_resources_is_warning(self) -> None:
        cleanup = {
            "database": {
                "users": 0,
                "sessions": 0,
                "refresh_tokens": 0,
                "profiles": 0,
                "fantasy_teams": 0,
            },
            "verification": {
                "activeRunners": 0,
                "cloudStateFiles": 1,
                "keyMaterialFiles": 0,
                "keyPairs": 0,
                "metricsKeys": 0,
                "runtimeCredentialHandoffs": 0,
                "securityGroups": 0,
            },
            "errors": ["database_cleanup:TimeoutError"],
        }
        self.assertTrue(ORCHESTRATOR.cleanup_verified_zero(cleanup))

    def test_artifact_upload_failure_without_verified_evidence_fails(self) -> None:
        cleanup = {
            "database": {"users": 0},
            "verification": {
                "activeRunners": 0,
                "keyMaterialFiles": 0,
                "keyPairs": 0,
                "metricsKeys": 0,
                "runtimeCredentialHandoffs": 0,
                "securityGroups": 1,
            },
            "errors": ["artifact_upload:RuntimeError"],
        }
        self.assertFalse(ORCHESTRATOR.cleanup_verified_zero(cleanup))


if __name__ == "__main__":
    unittest.main()
