from __future__ import annotations

import hashlib
import importlib.util
import json
import signal
import subprocess
import sys
import tempfile
import threading
import unittest
from collections import Counter
from pathlib import Path
from unittest import mock


SCRIPT = (
    Path(__file__).resolve().parents[1]
    / "fantasy-capacity-orchestrator-diagnostic.py"
)
PRODUCTION_ORCHESTRATOR = SCRIPT.with_name("fantasy-capacity-orchestrator.py")
# Re-pinned when the runners moved to Python 3.11 (run 36231686454).
PRODUCTION_ORCHESTRATOR_SHA256 = (
    "b2939917609d81e2db924839e4884f89ecfe48bd72688ce92742dee4343bb475"
)
SPEC = importlib.util.spec_from_file_location("fantasy_capacity_diagnostic", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class RaisingProcess:
    def __init__(self, error: BaseException) -> None:
        self.error = error
        self.pid = 4321
        self.returncode = 1

    def communicate(self, timeout: float | None = None) -> tuple[str, str]:
        raise self.error

    def poll(self) -> int:
        return self.returncode

    def terminate(self) -> None:
        self.returncode = -signal.SIGTERM

    def kill(self) -> None:
        self.returncode = -signal.SIGKILL


class TimeoutProcess:
    def __init__(self) -> None:
        self.pid = 9876
        self.returncode: int | None = None
        self.calls = 0

    def communicate(self, timeout: float | None = None) -> tuple[str, str]:
        self.calls += 1
        if self.calls == 1:
            raise subprocess.TimeoutExpired(["ssh"], timeout or 1)
        return "partial stdout", "partial stderr"

    def poll(self) -> int | None:
        return self.returncode

    def terminate(self) -> None:
        self.returncode = -signal.SIGTERM

    def kill(self) -> None:
        self.returncode = -signal.SIGKILL


class ControllerProcessTraceTests(unittest.TestCase):
    def traced_failure(self, arguments: list[str]) -> dict[str, object]:
        with self.assertRaises(MODULE.TracedSSHFailure) as raised:
            MODULE.controller_process_trace(arguments, timeout=2)
        return raised.exception.trace

    def test_ssh_exit_255_is_local_ssh_failure(self) -> None:
        trace = self.traced_failure(
            [sys.executable, "-c", "import sys; sys.stderr.write('closed'); sys.exit(255)"]
        )
        classification = MODULE.classify_controller_outcome(
            trace,
            {
                "alive": True,
                "exitStatus": None,
                "exitStatusAvailable": False,
                "pid": 222,
                "pidAvailable": True,
            },
        )
        self.assertEqual(trace["returnCode"], 255)
        self.assertEqual(trace["exceptionClass"], "CalledProcessError")
        self.assertTrue(classification["localSSHFailure"])
        self.assertFalse(classification["remoteProcessFailure"])
        self.assertTrue(classification["sshExitedNormally"])

    def test_remote_process_exit_1_is_not_local_ssh_failure(self) -> None:
        trace = self.traced_failure([sys.executable, "-c", "raise SystemExit(1)"])
        classification = MODULE.classify_controller_outcome(
            trace,
            {
                "alive": False,
                "exitStatus": 1,
                "exitStatusAvailable": True,
                "pid": 333,
                "pidAvailable": True,
            },
        )
        self.assertFalse(classification["localSSHFailure"])
        self.assertTrue(classification["remoteProcessFailure"])
        self.assertFalse(classification["remoteProcessExitedNormally"])

    def test_timeout_expired_is_captured(self) -> None:
        fake = TimeoutProcess()
        with mock.patch.object(MODULE.subprocess, "Popen", return_value=fake):
            with self.assertRaises(MODULE.TracedSSHFailure) as raised:
                MODULE.controller_process_trace(["ssh", "runner"], timeout=1)
        trace = raised.exception.trace
        self.assertTrue(trace["timeoutExpired"])
        self.assertEqual(trace["exceptionClass"], "TimeoutExpired")
        self.assertEqual(trace["signalNumber"], signal.SIGTERM)
        self.assertEqual(trace["stdoutLengthBytes"], len("partial stdout"))

    def test_broken_pipe_is_captured(self) -> None:
        fake = RaisingProcess(BrokenPipeError("pipe closed"))
        with mock.patch.object(MODULE.subprocess, "Popen", return_value=fake):
            with self.assertRaises(MODULE.TracedSSHFailure) as raised:
                MODULE.controller_process_trace(["ssh", "runner"], timeout=1)
        self.assertTrue(raised.exception.trace["brokenPipeError"])
        self.assertEqual(raised.exception.trace["exceptionClass"], "BrokenPipeError")

    def test_connection_reset_is_captured(self) -> None:
        fake = RaisingProcess(ConnectionResetError("connection reset"))
        with mock.patch.object(MODULE.subprocess, "Popen", return_value=fake):
            with self.assertRaises(MODULE.TracedSSHFailure) as raised:
                MODULE.controller_process_trace(["ssh", "runner"], timeout=1)
        self.assertTrue(raised.exception.trace["connectionResetError"])
        self.assertEqual(
            raised.exception.trace["exceptionClass"], "ConnectionResetError"
        )

    def test_eof_is_captured(self) -> None:
        fake = RaisingProcess(EOFError("unexpected EOF"))
        with mock.patch.object(MODULE.subprocess, "Popen", return_value=fake):
            with self.assertRaises(MODULE.TracedSSHFailure) as raised:
                MODULE.controller_process_trace(["ssh", "runner"], timeout=1)
        self.assertTrue(raised.exception.trace["eofError"])
        self.assertEqual(raised.exception.trace["exceptionClass"], "EOFError")

    def test_os_error_is_captured(self) -> None:
        with mock.patch.object(
            MODULE.subprocess, "Popen", side_effect=OSError("cannot execute")
        ):
            with self.assertRaises(MODULE.TracedSSHFailure) as raised:
                MODULE.controller_process_trace(["ssh", "runner"], timeout=1)
        self.assertTrue(raised.exception.trace["osError"])
        self.assertEqual(raised.exception.trace["exceptionClass"], "OSError")

    def test_unexpected_exception_class_is_captured(self) -> None:
        fake = RaisingProcess(RuntimeError("unexpected controller failure"))
        with mock.patch.object(MODULE.subprocess, "Popen", return_value=fake):
            with self.assertRaises(MODULE.TracedSSHFailure) as raised:
                MODULE.controller_process_trace(["ssh", "runner"], timeout=1)
        self.assertEqual(
            raised.exception.trace["unexpectedExceptionClass"], "RuntimeError"
        )

    def test_sigterm_return_is_captured(self) -> None:
        trace = self.traced_failure(
            [
                sys.executable,
                "-c",
                "import os,signal; os.kill(os.getpid(), signal.SIGTERM)",
            ]
        )
        self.assertEqual(trace["returnCode"], -signal.SIGTERM)
        self.assertEqual(trace["signalNumber"], signal.SIGTERM)

    def test_command_and_bounded_output_are_sanitized(self) -> None:
        key = Path("/private/tmp/private-load-key.pem")
        trace = MODULE.controller_process_trace(
            [
                sys.executable,
                "-c",
                "print('user@example.com ' + 'x' * 5000)",
                "-i",
                str(key),
            ],
            timeout=2,
            key_path=key,
        )
        self.assertIn("[REDACTED_KEY_PATH]", trace["command"])
        self.assertNotIn(str(key), trace["command"])
        self.assertNotIn("user@example.com", trace["stdoutFirst2KiB"])
        self.assertLessEqual(
            len(trace["stdoutFirst2KiB"].encode("utf-8")),
            MODULE.CONTROLLER_EXCERPT_BYTES,
        )
        self.assertLessEqual(
            len(trace["stdoutLast2KiB"].encode("utf-8")),
            MODULE.CONTROLLER_EXCERPT_BYTES,
        )


class ControllerEvidenceTests(unittest.TestCase):
    def test_missing_terminal_record_is_detected(self) -> None:
        records = "\n".join(
            [
                json.dumps(
                    {
                        "event": "session_provisioning_start",
                        "expectedUsers": 500,
                        "mode": "full_session_diagnostic",
                        "runnerId": 0,
                        "timestamp": 1,
                        "userIndex": -1,
                    }
                ),
                json.dumps(
                    {
                        "event": "auth_response_received",
                        "httpStatus": 200,
                        "requestDurationMs": 10.0,
                        "responseClassification": "success",
                        "runnerId": 0,
                        "supabaseErrorCode": "http_200",
                        "timestamp": 2,
                        "userIndex": 0,
                    }
                ),
            ]
        )
        parsed = MODULE.sanitized_diagnostic_records(records)
        self.assertEqual(parsed["finalRecords"], [])
        self.assertEqual(len(parsed["responseRecords"]), 1)

    def test_artifact_present_after_ssh_failure(self) -> None:
        record = MODULE.artifact_collection_failure_record(
            0,
            {
                "artifactExists": True,
                "artifactSizeBytes": 36_626,
                "copySucceeded": True,
                "remoteExists": True,
                "remoteSizeBytes": 36_320,
                "stderrSizeBytes": 0,
            },
        )
        self.assertTrue(record["artifactExists"])
        self.assertTrue(record["copySucceeded"])
        self.assertEqual(
            record["stage"], "artifact-copy-or-parse-missing-final-record"
        )

    def test_delayed_fail_fast_waits_exactly_five_seconds(self) -> None:
        delays: list[float] = []
        MODULE.wait_before_diagnostic_fail_fast(delays.append)
        self.assertEqual(delays, [MODULE.DIAGNOSTIC_FAIL_FAST_DELAY_SECONDS])

    def test_fail_fast_collects_state_then_waits_before_broadcast(self) -> None:
        gate = MODULE.CapacityGate.__new__(MODULE.CapacityGate)
        gate.instance_ips = ["runner-a", "runner-b"]
        order: list[str] = []
        gate.record_controller_timeline = lambda _runner, event, **_details: order.append(
            event
        )
        gate.ssh = lambda _ip, _command, _timeout: order.append("terminate") or ""
        with mock.patch.object(
            MODULE,
            "wait_before_diagnostic_fail_fast",
            side_effect=lambda: order.append("wait"),
        ):
            gate.diagnostic_fail_fast(0, RuntimeError("runner failed"))
        self.assertEqual(
            order,
            [
                "controller_failure_detected",
                "wait",
                "fail_fast_sigterm_broadcast",
                "terminate",
                "terminate",
            ],
        )

    def test_merged_timeline_is_chronological(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            gate = MODULE.CapacityGate.__new__(MODULE.CapacityGate)
            gate.artifact_dir = Path(temporary)
            gate.controller_timeline = []
            gate.controller_timeline_lock = threading.Lock()
            gate.record_controller_timeline(
                0,
                "ssh_controller_failure",
                sourceTimestamp="2026-07-22T00:00:05+00:00",
            )
            gate.record_controller_timeline(
                0,
                "last_successful_response",
                sourceTimestamp="2026-07-22T00:00:04+00:00",
            )
            timeline = json.loads(
                (Path(temporary) / "controller-session-timeline.json").read_text()
            )
        self.assertEqual(
            [item["event"] for item in timeline],
            ["last_successful_response", "ssh_controller_failure"],
        )
        self.assertEqual([item["sequence"] for item in timeline], [2, 1])


class DiagnosticSshKeepaliveTests(unittest.TestCase):
    def test_keepalives_and_existing_security_options_appear_exactly_once(self) -> None:
        self.assertEqual(
            MODULE.SSH_KEEPALIVE_OPTIONS,
            (
                "ServerAliveInterval=30",
                "ServerAliveCountMax=6",
                "TCPKeepAlive=yes",
            ),
        )
        with tempfile.TemporaryDirectory() as temporary:
            gate = MODULE.CapacityGate.__new__(MODULE.CapacityGate)
            gate.key_path = Path(temporary) / "private-runner.pem"
            gate.artifact_dir = Path(temporary)
            arguments = gate.ssh_base("203.0.113.10")
        for option in MODULE.SSH_KEEPALIVE_OPTIONS:
            self.assertEqual(arguments.count(option), 1)
        for option in (
            "BatchMode=yes",
            "ConnectTimeout=10",
            "StrictHostKeyChecking=accept-new",
        ):
            self.assertEqual(arguments.count(option), 1)
        known_hosts = [
            item for item in arguments if item.startswith("UserKnownHostsFile=")
        ]
        self.assertEqual(len(known_hosts), 1)

    def test_keepalive_command_reporting_redacts_key_and_target(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            gate = MODULE.CapacityGate.__new__(MODULE.CapacityGate)
            gate.key_path = Path(temporary) / "sensitive-private-runner.pem"
            gate.artifact_dir = Path(temporary)
            arguments = gate.ssh_base("203.0.113.10")
            rendered = MODULE.sanitized_ssh_command(arguments, gate.key_path)
        self.assertNotIn(str(gate.key_path), rendered)
        self.assertNotIn("ec2-user@203.0.113.10", rendered)
        self.assertIn("[REDACTED_KEY_PATH]", rendered)
        for option in MODULE.SSH_KEEPALIVE_OPTIONS:
            self.assertIn(option, rendered)

    def test_production_orchestrator_is_byte_for_byte_unchanged(self) -> None:
        digest = hashlib.sha256(PRODUCTION_ORCHESTRATOR.read_bytes()).hexdigest()
        self.assertEqual(digest, PRODUCTION_ORCHESTRATOR_SHA256)


class DiagnosticSshTransportProbeTests(unittest.TestCase):
    @staticmethod
    def trace(**overrides: object) -> dict[str, object]:
        value: dict[str, object] = {
            "brokenPipeError": False,
            "connectionResetError": False,
            "durationMs": MODULE.SSH_TRANSPORT_PROBE_DURATION_SECONDS * 1_000,
            "eofError": False,
            "exceptionClass": None,
            "returnCode": 0,
            "stderrFirst2KiB": "",
            "stderrLast2KiB": "",
            "timeoutExpired": False,
        }
        value.update(overrides)
        return value

    @staticmethod
    def remote_state(**overrides: object) -> dict[str, object]:
        value: dict[str, object] = {
            "alive": False,
            "exitStatus": 0,
            "exitStatusAvailable": True,
            "pid": 1234,
            "pidAvailable": True,
        }
        value.update(overrides)
        return value

    @staticmethod
    def heartbeats(*, missing: int | None = None) -> str:
        records = []
        for sequence in range(MODULE.SSH_TRANSPORT_PROBE_HEARTBEATS):
            if sequence == missing:
                continue
            timestamp = 1_000 + sequence * MODULE.SSH_TRANSPORT_PROBE_INTERVAL_SECONDS
            records.append(
                f"phase6-ssh-heartbeat|{sequence}|{timestamp}"
            )
        return "\n".join(records)

    def test_probe_duration_is_at_least_seven_minutes(self) -> None:
        self.assertGreaterEqual(MODULE.SSH_TRANSPORT_PROBE_DURATION_SECONDS, 7 * 60)
        gate = MODULE.CapacityGate.__new__(MODULE.CapacityGate)
        command = gate.transport_probe_command()
        self.assertIn(
            f"sleep {MODULE.SSH_TRANSPORT_PROBE_INTERVAL_SECONDS}", command
        )
        self.assertIn(
            f'while test "$heartbeat" -lt {MODULE.SSH_TRANSPORT_PROBE_HEARTBEATS}',
            command,
        )

    def test_heartbeat_loss_fails_probe(self) -> None:
        result = MODULE.validate_transport_probe(
            self.trace(), self.remote_state(), self.heartbeats(missing=3)
        )
        self.assertFalse(result["criteria"]["allHeartbeatsObserved"])
        self.assertFalse(result["passed"])

    def test_ssh_exit_255_fails_probe(self) -> None:
        result = MODULE.validate_transport_probe(
            self.trace(
                returnCode=255,
                stderrFirst2KiB="client_loop: send disconnect: Broken pipe",
            ),
            self.remote_state(alive=True, exitStatus=None, exitStatusAvailable=False),
            self.heartbeats(),
        )
        self.assertFalse(result["criteria"]["localSshExitZero"])
        self.assertFalse(result["criteria"]["noBrokenPipe"])
        self.assertFalse(result["passed"])

    def test_remote_nonzero_exit_fails_probe(self) -> None:
        result = MODULE.validate_transport_probe(
            self.trace(), self.remote_state(exitStatus=1), self.heartbeats()
        )
        self.assertFalse(result["criteria"]["remoteExitZero"])
        self.assertFalse(result["passed"])

    def test_timeout_or_orphaned_remote_process_fails_probe(self) -> None:
        result = MODULE.validate_transport_probe(
            self.trace(timeoutExpired=True),
            self.remote_state(alive=True),
            self.heartbeats(),
        )
        self.assertFalse(result["criteria"]["noTimeout"])
        self.assertFalse(result["criteria"]["remoteProcessStopped"])
        self.assertFalse(result["passed"])

    def test_successful_seven_minute_supervision_passes(self) -> None:
        result = MODULE.validate_transport_probe(
            self.trace(), self.remote_state(), self.heartbeats()
        )
        self.assertEqual(
            result["observedDurationSeconds"],
            MODULE.SSH_TRANSPORT_PROBE_DURATION_SECONDS,
        )
        self.assertTrue(result["passed"])

    def test_probe_mode_skips_supabase_and_fantasy_provisioning(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            gate = MODULE.CapacityGate.__new__(MODULE.CapacityGate)
            gate.mode = MODULE.SSH_TRANSPORT_PROBE_MODE
            gate.run_id = "transport-probe-test"
            gate.artifact_dir = Path(temporary)
            gate.metrics_process = None
            gate.sql_sampler_stop = threading.Event()
            gate.sql_sampler_thread = None
            gate.user_creation_stats = Counter()
            gate.preflight = mock.Mock()
            gate.provision_runners = mock.Mock()
            gate.run_ssh_transport_probe = mock.Mock(
                return_value={
                    "passed": True,
                    "runners": [
                        {"runnerId": index} for index in range(MODULE.RUNNER_COUNT)
                    ],
                }
            )
            cleanup = {
                "database": {"temporary_records": 0},
                "verification": {
                    key: 0 for key in MODULE.CLEANUP_EXTERNAL_RESOURCE_KEYS
                },
            }
            gate.cleanup = mock.Mock(return_value=cleanup)
            forbidden = (
                "create_temporary_key",
                "prepare_capacity_gameweek",
                "create_users",
                "seed_user_fantasy_state",
                "deploy_and_provision_sessions",
                "start_metrics",
                "run_setup_rehearsal",
                "run_profile",
            )
            for method_name in forbidden:
                setattr(
                    gate,
                    method_name,
                    mock.Mock(side_effect=AssertionError(method_name)),
                )
            result = gate.run()
        self.assertEqual(result, 0)
        gate.provision_runners.assert_called_once_with()
        gate.run_ssh_transport_probe.assert_called_once_with()
        for method_name in forbidden:
            getattr(gate, method_name).assert_not_called()


if __name__ == "__main__":
    unittest.main()
