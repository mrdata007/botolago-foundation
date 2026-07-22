from __future__ import annotations

import importlib.util
import json
import signal
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock


SCRIPT = (
    Path(__file__).resolve().parents[1]
    / "fantasy-capacity-orchestrator-diagnostic.py"
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


if __name__ == "__main__":
    unittest.main()
