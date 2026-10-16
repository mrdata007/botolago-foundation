"""Tests for the launch-sized load profile and for the full-gate lock beside it.

The launch-sized profile is a separate, explicitly named mode (1,000 users,
175 RPS for 10 s then 65 RPS, plus a soak). These tests pin two things:

* the approved merge gate (2,500 users, 600 then 250 RPS) is still hard-locked,
  and its orchestrator command is byte-for-byte what it was before the
  launch-sized mode existed;
* the launch-sized mode is its own thing: its own profile names, fixed
  dimensions, its own evidence label, and it cannot be used to pass as the
  full gate (or the reverse).
"""

from __future__ import annotations

import asyncio
import atexit
import base64
import importlib.util
import json
import os
import shutil
import sys
import tempfile
import time
import unittest
import uuid
from pathlib import Path
from unittest import mock

SCRIPTS = Path(__file__).resolve().parents[1]


def load_module(name: str, filename: str, env: dict[str, str] | None = None):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    with mock.patch.dict(os.environ, env or {}):
        spec.loader.exec_module(module)
    return module


_RUNTIME_DIR = tempfile.mkdtemp(prefix="botolago-launch-sized-test-")
atexit.register(shutil.rmtree, _RUNTIME_DIR, ignore_errors=True)

LOAD = load_module("fantasy_load_test_launch", "fantasy-load-test.py")
ORCH = load_module(
    "fantasy_capacity_launch",
    "fantasy-capacity-orchestrator.py",
    {
        "BOTOLAGO_PHASE6_RUNTIME_DIR": _RUNTIME_DIR,
        "BOTOLAGO_PHASE6_EVIDENCE_DIR": str(Path(_RUNTIME_DIR) / "evidence"),
    },
)
REPORT = load_module("fantasy_capacity_report_launch", "fantasy-capacity-report.py")


def fake_jwt() -> str:
    def part(value: dict[str, object]) -> str:
        raw = json.dumps(value).encode()
        return base64.urlsafe_b64encode(raw).decode().rstrip("=")

    claims = {
        "sub": str(uuid.uuid4()),
        "role": "authenticated",
        "exp": int(time.time()) + 24 * 3600,
    }
    return f"{part({'alg': 'none'})}.{part(claims)}.signature"


class RunnerEnvironment:
    """Builds the environment FantasyLoadRunner reads, with a real session cache."""

    def __init__(self, testcase: unittest.TestCase) -> None:
        self.directory = Path(tempfile.mkdtemp(prefix="botolago-load-env-"))
        testcase.addCleanup(shutil.rmtree, self.directory, ignore_errors=True)

    def cache(self, users: int) -> Path:
        path = self.directory / f"sessions-{users}.json"
        records = [
            {"number": number, "access_token": fake_jwt()}
            for number in range(1, users + 1)
        ]
        path.write_text(json.dumps(records))
        path.chmod(0o600)
        return path

    def values(
        self,
        profile: str,
        users: int,
        sustained: int,
        burst: int,
        burst_seconds: int,
        duration: int,
    ) -> dict[str, str]:
        shards = 5
        return {
            "BOTOLAGO_STAGING_SUPABASE_URL": "https://staging.example.invalid",
            "BOTOLAGO_STAGING_PUBLISHABLE_KEY": "sb_publishable_test",
            "BOTOLAGO_LOAD_ENVIRONMENT": "staging-v2",
            "BOTOLAGO_LOAD_SESSION_CACHE": str(self.cache(users // shards)),
            "BOTOLAGO_LOAD_RESULTS_PATH": str(self.directory / "result.json"),
            "BOTOLAGO_LOAD_PROFILE": profile,
            "BOTOLAGO_LOAD_USERS": str(users),
            "BOTOLAGO_LOAD_SUSTAINED_RPS": str(sustained),
            "BOTOLAGO_LOAD_BURST_RPS": str(burst),
            "BOTOLAGO_LOAD_BURST_SECONDS": str(burst_seconds),
            "BOTOLAGO_LOAD_DURATION_SECONDS": str(duration),
            "BOTOLAGO_LOAD_SHARD_COUNT": str(shards),
            "BOTOLAGO_LOAD_SHARD_INDEX": "0",
            "BOTOLAGO_LOAD_FIRST_USER": "1",
        }


class LoadRunnerLockTests(unittest.TestCase):
    def build(self, profile, users, sustained, burst, burst_seconds, duration):
        values = RunnerEnvironment(self).values(
            profile, users, sustained, burst, burst_seconds, duration
        )
        with mock.patch.dict(os.environ, values):
            return LOAD.FantasyLoadRunner()

    # The approved merge gate must stay locked.

    def test_merge_gate_still_accepts_only_the_approved_dimensions(self) -> None:
        runner = self.build("merge_gate", 2500, 250, 600, 10, 60)
        self.assertEqual(runner.users, 500)
        self.assertEqual((runner.sustained_rps, runner.burst_rps), (50, 120))

    def test_telemetry_soak_still_accepts_only_the_approved_dimensions(self) -> None:
        runner = self.build("telemetry_soak", 2500, 250, 600, 0, 600)
        self.assertEqual(runner.users, 500)

    def test_merge_gate_rejects_every_weakening(self) -> None:
        for users, sustained, burst in (
            (2495, 250, 600),
            (1000, 250, 600),
            (2500, 245, 600),
            (2500, 65, 600),
            (2500, 250, 595),
            (2500, 250, 175),
            # The launch-sized numbers must never pass under the gate's name.
            (1000, 65, 175),
        ):
            with self.subTest(users=users, sustained=sustained, burst=burst):
                with self.assertRaises(SystemExit) as caught:
                    self.build("merge_gate", users, sustained, burst, 10, 60)
                self.assertIn("may not be weakened", str(caught.exception))

    def test_telemetry_soak_rejects_launch_sized_numbers(self) -> None:
        with self.assertRaises(SystemExit) as caught:
            self.build("telemetry_soak", 1000, 65, 175, 0, 600)
        self.assertIn("may not be weakened", str(caught.exception))

    def test_merge_gate_duration_is_still_fixed(self) -> None:
        with self.assertRaises(SystemExit):
            self.build("merge_gate", 2500, 250, 600, 10, 30)

    # The launch-sized profile is its own thing.

    def test_launch_sized_gate_accepts_its_dimensions(self) -> None:
        runner = self.build("launch_sized_gate", 1000, 65, 175, 10, 60)
        self.assertEqual(runner.users, 200)
        self.assertEqual((runner.sustained_rps, runner.burst_rps), (13, 35))

    def test_launch_sized_soak_accepts_its_dimensions(self) -> None:
        for duration in (300, 600):
            with self.subTest(duration=duration):
                runner = self.build("launch_sized_soak", 1000, 65, 175, 0, duration)
                self.assertEqual(runner.users, 200)

    def test_launch_sized_profiles_reject_other_dimensions(self) -> None:
        for profile, burst_seconds, duration in (
            ("launch_sized_gate", 10, 60),
            ("launch_sized_soak", 0, 600),
        ):
            for users, sustained, burst in (
                (2500, 250, 600),
                (1000, 66, 175),
                (1000, 65, 176),
                (995, 65, 175),
                (1500, 65, 175),
                (1000, 130, 350),
            ):
                with self.subTest(profile=profile, users=users, sustained=sustained):
                    with self.assertRaises(SystemExit) as caught:
                        self.build(profile, users, sustained, burst, burst_seconds, duration)
                    self.assertIn("launch-sized load dimensions", str(caught.exception))

    def test_launch_sized_profiles_keep_their_shapes(self) -> None:
        with self.assertRaises(SystemExit):
            self.build("launch_sized_gate", 1000, 65, 175, 10, 30)
        with self.assertRaises(SystemExit):
            self.build("launch_sized_gate", 1000, 65, 175, 0, 60)
        with self.assertRaises(SystemExit):
            self.build("launch_sized_soak", 1000, 65, 175, 10, 600)
        with self.assertRaises(SystemExit):
            self.build("launch_sized_soak", 1000, 65, 175, 0, 60)

    def test_unknown_profile_is_still_refused(self) -> None:
        with self.assertRaises(SystemExit):
            self.build("launch_sized", 1000, 65, 175, 10, 60)
        with self.assertRaises(SystemExit):
            self.build("launch_gate", 1000, 65, 175, 10, 60)

    def test_launch_sized_profile_names_never_collide_with_the_gate(self) -> None:
        self.assertEqual(
            LOAD.LAUNCH_SIZED_PROFILES & {"merge_gate", "telemetry_soak", "setup_rehearsal"},
            set(),
        )

    def test_launch_sized_mix_is_exact_per_shard(self) -> None:
        """Each shard's request count is a whole number of 100-request cycles."""

        for profile, burst_seconds, duration in (
            ("launch_sized_gate", 10, 60),
            ("launch_sized_soak", 0, 600),
        ):
            runner = self.build(profile, 1000, 65, 175, burst_seconds, duration)
            requests = burst_seconds * runner.burst_rps + (
                duration - burst_seconds
            ) * runner.sustained_rps
            self.assertEqual(requests % 100, 0, profile)
            counts: dict[str, int] = {}
            for number in range(requests):
                operation = runner.pick_operation(number)
                counts[operation] = counts.get(operation, 0) + 1
            cycles = requests // 100
            self.assertEqual(
                counts,
                {
                    "lineup": 60 * cycles,
                    "transfer_preview": 15 * cycles,
                    "transfer_confirm": 15 * cycles,
                    "chip": 5 * cycles,
                    "team_read": 5 * cycles,
                },
            )


class OrchestratorDimensionTests(unittest.TestCase):
    def test_full_gate_dimensions_are_unchanged(self) -> None:
        self.assertEqual(
            ORCH.load_profile_dimensions("merge_gate"), (2500, 250, 600, 18_500)
        )
        self.assertEqual(
            ORCH.load_profile_dimensions("telemetry_soak"), (2500, 250, 600, 150_000)
        )
        self.assertEqual(ORCH.USERS_PER_RUNNER, 500)
        self.assertEqual(ORCH.TOTAL_USERS, 2500)

    def test_launch_sized_dimensions(self) -> None:
        self.assertEqual(
            ORCH.load_profile_dimensions("launch_sized_gate"), (1000, 65, 175, 5_000)
        )
        self.assertEqual(
            ORCH.load_profile_dimensions("launch_sized_soak"), (1000, 65, 175, 39_000)
        )
        self.assertEqual(ORCH.LAUNCH_SIZED_TOTAL_USERS, 1000)

    def test_unknown_profile_is_refused(self) -> None:
        for profile in ("launch_sized", "setup_rehearsal", "merge-gate", ""):
            with self.subTest(profile=profile), self.assertRaises(RuntimeError):
                ORCH.load_profile_dimensions(profile)

    def test_orchestrator_and_runner_agree_on_launch_sized_numbers(self) -> None:
        self.assertEqual(ORCH.LAUNCH_SIZED_TOTAL_USERS, LOAD.LAUNCH_SIZED_USERS)
        self.assertEqual(ORCH.LAUNCH_SIZED_SUSTAINED_RPS, LOAD.LAUNCH_SIZED_SUSTAINED_RPS)
        self.assertEqual(ORCH.LAUNCH_SIZED_BURST_RPS, LOAD.LAUNCH_SIZED_BURST_RPS)
        self.assertEqual(ORCH.LAUNCH_SIZED_GATE_PROFILE, LOAD.LAUNCH_SIZED_GATE_PROFILE)
        self.assertEqual(ORCH.LAUNCH_SIZED_SOAK_PROFILE, LOAD.LAUNCH_SIZED_SOAK_PROFILE)

    def test_launch_sized_is_much_smaller_than_the_gate(self) -> None:
        launch = ORCH.load_profile_dimensions("launch_sized_soak")
        gate = ORCH.load_profile_dimensions("telemetry_soak")
        self.assertLess(launch.users, gate.users)
        self.assertLess(launch.sustained_rps, gate.sustained_rps)
        self.assertLess(launch.burst_rps, gate.burst_rps)

    def test_every_profile_schedules_whole_hundred_request_cycles_per_runner(self) -> None:
        for profile in (
            "merge_gate",
            "telemetry_soak",
            "launch_sized_gate",
            "launch_sized_soak",
        ):
            dimensions = ORCH.load_profile_dimensions(profile)
            self.assertEqual(dimensions.requests % ORCH.RUNNER_COUNT, 0)
            self.assertEqual((dimensions.requests // ORCH.RUNNER_COUNT) % 100, 0, profile)

    def test_each_mode_runs_only_its_own_profile_pair(self) -> None:
        self.assertEqual(
            ORCH.measured_profile_names(ORCH.FULL_GATE_MODE),
            ("merge_gate", "telemetry_soak"),
        )
        self.assertEqual(
            ORCH.measured_profile_names(ORCH.LAUNCH_SIZED_MODE),
            ("launch_sized_gate", "launch_sized_soak"),
        )
        for mode in (
            ORCH.SETUP_REHEARSAL_MODE,
            ORCH.SESSION_PROVISIONING_REHEARSAL_MODE,
            ORCH.CLEANUP_RECOVERY_MODE,
        ):
            with self.subTest(mode=mode), self.assertRaises(RuntimeError):
                ORCH.measured_profile_names(mode)

    def test_launch_sized_mode_name_is_distinct_from_the_gate(self) -> None:
        self.assertNotEqual(ORCH.LAUNCH_SIZED_MODE, ORCH.FULL_GATE_MODE)
        self.assertIn("NOT the full", ORCH.LAUNCH_SIZED_EVIDENCE_LABEL)

    def test_launch_sized_user_range_fits_inside_the_cleanup_range(self) -> None:
        # Cleanup and recovery enumerate FIRST_USER_NUMBER .. +TOTAL_USERS-1
        # (the full-gate range), so a launch-sized run is always covered.
        last = ORCH.FIRST_USER_NUMBER + ORCH.LAUNCH_SIZED_TOTAL_USERS - 1
        self.assertLessEqual(last, ORCH.FIRST_USER_NUMBER + ORCH.TOTAL_USERS - 1)


FAKE_RUNTIME = {
    "AWS_REGION": "eu-west-3",
    "AWS_ACCESS_KEY_ID": "example-access-key-id",
    "AWS_SECRET_ACCESS_KEY": "example",
    "SUPABASE_STAGING_PROJECT_REF": "srdrflfrfpwixsllveid",
    "SUPABASE_STAGING_URL": "https://srdrflfrfpwixsllveid.supabase.co",
    "SUPABASE_ACCESS_TOKEN": "example",
    "SUPABASE_STAGING_PUBLISHABLE_KEY": "example",
}


class GateModeTests(unittest.TestCase):
    def gate(self, mode: str):
        return ORCH.CapacityGate(mode, runtime=dict(FAKE_RUNTIME))

    def test_full_gate_mode_is_unchanged(self) -> None:
        gate = self.gate(ORCH.FULL_GATE_MODE)
        self.assertEqual(gate.users_per_runner, 500)
        self.assertEqual(gate.total_users, 2500)
        self.assertEqual(gate.first_user_number, 50_001)
        self.assertEqual(gate.last_user_number, 52_500)

    def test_launch_sized_mode_creates_one_thousand_users(self) -> None:
        gate = self.gate(ORCH.LAUNCH_SIZED_MODE)
        self.assertEqual(gate.users_per_runner, 200)
        self.assertEqual(gate.total_users, 1000)
        self.assertEqual(gate.first_user_number, 50_001)
        self.assertEqual(gate.last_user_number, 51_000)

    def test_unsupported_mode_is_refused(self) -> None:
        with self.assertRaises(RuntimeError):
            self.gate("launch")

    def run_profile(self, mode: str, profile: str, duration: int, burst_seconds: int):
        gate = ORCH.CapacityGate.__new__(ORCH.CapacityGate)
        gate.mode = mode
        gate.instance_ips = [f"10.0.0.{index}" for index in range(ORCH.RUNNER_COUNT)]
        gate.artifact_dir = Path(tempfile.mkdtemp(prefix="botolago-run-profile-"))
        self.addCleanup(shutil.rmtree, gate.artifact_dir, ignore_errors=True)
        commands: list[str] = []

        def ssh(ip: str, command: str, timeout: int | None = None) -> str:
            commands.append(command)
            return ""

        def scp_from(ip: str, remote: str, local: Path) -> None:
            Path(local).write_text("{}")

        gate.ssh = ssh
        gate.scp_from = scp_from
        gate.aggregate_profile = lambda name, shards: {
            "profile": {"requests": 0},
            "overall": {"unexpectedErrors": 0},
        }
        with (
            mock.patch.object(ORCH, "runner_preparation_delay", return_value=0),
            mock.patch.object(ORCH.time, "time", return_value=1000.0),
        ):
            gate.run_profile(profile, duration, burst_seconds)
        return sorted(commands)

    def test_merge_gate_command_is_byte_for_byte_unchanged(self) -> None:
        commands = self.run_profile(ORCH.FULL_GATE_MODE, "merge_gate", 60, 10)
        self.assertEqual(len(commands), 5)
        self.assertEqual(
            commands[0],
            "umask 077; set -a; . /opt/botolago/runtime.env; set +a; "
            "BOTOLAGO_LOAD_PROFILE=merge_gate BOTOLAGO_LOAD_USERS=2500 "
            "BOTOLAGO_LOAD_SHARD_COUNT=5 BOTOLAGO_LOAD_FIRST_USER=50001 "
            "BOTOLAGO_LOAD_SUSTAINED_RPS=250 BOTOLAGO_LOAD_BURST_RPS=600 "
            "BOTOLAGO_LOAD_BURST_SECONDS=10 BOTOLAGO_LOAD_DURATION_SECONDS=60 "
            "BOTOLAGO_LOAD_START_AT=1075.000 BOTOLAGO_LOAD_INCLUDE_SAMPLES=1 "
            "BOTOLAGO_LOAD_SESSION_CACHE=/opt/botolago/sessions.json "
            "BOTOLAGO_LOAD_RESULTS_PATH=/opt/botolago/merge_gate.json "
            "BOTOLAGO_LOAD_SHARD_INDEX=0 /opt/botolago-venv/bin/python "
            "/opt/botolago/fantasy-load-test.py "
            "> /opt/botolago/merge_gate.summary.json "
            "2> /opt/botolago/merge_gate.error.log",
        )

    def test_telemetry_soak_command_is_byte_for_byte_unchanged(self) -> None:
        commands = self.run_profile(ORCH.FULL_GATE_MODE, "telemetry_soak", 600, 0)
        self.assertEqual(
            commands[0],
            "umask 077; set -a; . /opt/botolago/runtime.env; set +a; "
            "BOTOLAGO_LOAD_PROFILE=telemetry_soak BOTOLAGO_LOAD_USERS=2500 "
            "BOTOLAGO_LOAD_SHARD_COUNT=5 BOTOLAGO_LOAD_FIRST_USER=50001 "
            "BOTOLAGO_LOAD_SUSTAINED_RPS=250 BOTOLAGO_LOAD_BURST_RPS=600 "
            "BOTOLAGO_LOAD_BURST_SECONDS=0 BOTOLAGO_LOAD_DURATION_SECONDS=600 "
            "BOTOLAGO_LOAD_START_AT=1075.000 BOTOLAGO_LOAD_INCLUDE_SAMPLES=1 "
            "BOTOLAGO_LOAD_SESSION_CACHE=/opt/botolago/sessions.json "
            "BOTOLAGO_LOAD_RESULTS_PATH=/opt/botolago/telemetry_soak.json "
            "BOTOLAGO_LOAD_SHARD_INDEX=0 /opt/botolago-venv/bin/python "
            "/opt/botolago/fantasy-load-test.py "
            "> /opt/botolago/telemetry_soak.summary.json "
            "2> /opt/botolago/telemetry_soak.error.log",
        )

    def test_launch_sized_command_carries_its_own_dimensions(self) -> None:
        commands = self.run_profile(
            ORCH.LAUNCH_SIZED_MODE, "launch_sized_gate", 60, 10
        )
        self.assertEqual(len(commands), 5)
        for command in commands:
            self.assertIn("BOTOLAGO_LOAD_PROFILE=launch_sized_gate ", command)
            self.assertIn("BOTOLAGO_LOAD_USERS=1000 ", command)
            self.assertIn("BOTOLAGO_LOAD_SUSTAINED_RPS=65 ", command)
            self.assertIn("BOTOLAGO_LOAD_BURST_RPS=175 ", command)
            self.assertNotIn("2500", command)
            self.assertNotIn("=250 ", command)
            self.assertNotIn("=600 ", command.replace("DURATION_SECONDS=600", ""))
        soak = self.run_profile(ORCH.LAUNCH_SIZED_MODE, "launch_sized_soak", 600, 0)
        self.assertIn("BOTOLAGO_LOAD_PROFILE=launch_sized_soak ", soak[0])
        self.assertIn("BOTOLAGO_LOAD_USERS=1000 ", soak[0])

    def test_a_mode_cannot_run_the_other_modes_profiles(self) -> None:
        with self.assertRaises(RuntimeError):
            self.run_profile(ORCH.LAUNCH_SIZED_MODE, "merge_gate", 60, 10)
        with self.assertRaises(RuntimeError):
            self.run_profile(ORCH.LAUNCH_SIZED_MODE, "telemetry_soak", 600, 0)
        with self.assertRaises(RuntimeError):
            self.run_profile(ORCH.FULL_GATE_MODE, "launch_sized_gate", 60, 10)
        with self.assertRaises(RuntimeError):
            self.run_profile(ORCH.FULL_GATE_MODE, "launch_sized_soak", 600, 0)

    def shard(self, profile: str, requests: int, index: int) -> dict[str, object]:
        # One runner's share of the approved mix, in whole 100-request cycles.
        cycles = requests // 100
        operations = {
            "lineup": 60 * cycles,
            "transfer_preview": 15 * cycles,
            "transfer_confirm": 15 * cycles,
            "chip": 5 * cycles,
            "team_read": 5 * cycles,
        }
        return {
            "profile": {"loadProfile": profile, "requests": requests},
            "overall": {"expectedRejections": 0, "unexpectedErrors": 0},
            "errorCodes": {},
            "latencySamplesMs": {name: [10.0] * count for name, count in operations.items()},
            "operations": {name: {"count": count} for name, count in operations.items()},
        }

    def aggregate(self, mode: str, profile: str):
        gate = ORCH.CapacityGate.__new__(ORCH.CapacityGate)
        gate.mode = mode
        per_shard = ORCH.load_profile_dimensions(profile).requests // ORCH.RUNNER_COUNT
        return gate.aggregate_profile(
            profile,
            [self.shard(profile, per_shard, index) for index in range(ORCH.RUNNER_COUNT)],
        )

    def test_launch_sized_aggregate_is_labelled_and_uses_the_gate_thresholds(self) -> None:
        for profile in ("launch_sized_gate", "launch_sized_soak"):
            result = self.aggregate(ORCH.LAUNCH_SIZED_MODE, profile)
            self.assertEqual(result["profile"]["users"], 1000)
            self.assertIs(result["profile"]["fullGate"], False)
            self.assertIn("NOT the full", result["profile"]["evidenceLabel"])
            self.assertEqual(
                set(result["passCriteria"]),
                {
                    "readP95",
                    "mutationP95",
                    "mutationP99",
                    "unexpectedErrorRate",
                    "lockTimeoutRate",
                },
            )
            self.assertTrue(all(result["passCriteria"].values()))

    def test_full_gate_aggregate_is_not_labelled_launch_sized(self) -> None:
        for profile in ("merge_gate", "telemetry_soak"):
            result = self.aggregate(ORCH.FULL_GATE_MODE, profile)
            self.assertEqual(result["profile"]["users"], 2500)
            self.assertNotIn("evidenceLabel", result["profile"])
            self.assertNotIn("fullGate", result["profile"])

    def test_launch_sized_thresholds_are_the_gates_thresholds(self) -> None:
        source = (SCRIPTS / "fantasy-capacity-orchestrator.py").read_text()
        for threshold in (
            'overall["readP95Ms"] <= 500',
            'overall["mutationP95Ms"] <= 1500',
            'overall["mutationP99Ms"] <= 3000',
            "unexpected_rate < 0.005",
            "lock_timeout_rate < 0.001",
            'metrics["maxConnectionUtilizationPercent"] < 80',
            'metrics["maxCpuPercent"] < 80',
            'metrics["maxPoolUtilizationPercent"] < 80',
            'metrics["deadlockDelta"] == 0',
            'metrics["conflictDelta"] == 0',
        ):
            self.assertEqual(source.count(threshold), 1, threshold)
        # The measured branch is shared by both modes, not copied.
        self.assertIn("elif self.mode in {FULL_GATE_MODE, LAUNCH_SIZED_MODE}:", source)


class ReportLabelTests(unittest.TestCase):
    def render(self, scope: str, summaries: dict[str, dict[str, object]]):
        root = Path(tempfile.mkdtemp(prefix="botolago-report-"))
        self.addCleanup(shutil.rmtree, root, ignore_errors=True)
        for index, (mode, summary) in enumerate(summaries.items()):
            directory = root / "evidence" / f"run-{index}-{mode}"
            directory.mkdir(parents=True)
            (directory / "gate-summary.json").write_text(
                json.dumps({"mode": mode, **summary})
            )
        recovery = root / "evidence" / "recovery"
        recovery.mkdir(parents=True)
        (recovery / "recovery-cleanup-summary.json").write_text(json.dumps({"passed": True}))
        args = mock.Mock(
            evidence_root=root / "evidence",
            output=root / "summary.md",
            result=root / "result.json",
            run_url="https://example.invalid/run/1",
            run_label="run 1",
            oidc_outcome="success",
            capacity_exit=0,
            cleanup_exit=0,
            scope=scope,
        )
        self.assertEqual(REPORT.render(args), 0)
        return (root / "summary.md").read_text(), json.loads((root / "result.json").read_text())

    def test_launch_sized_pass_is_labelled_and_is_not_a_full_gate_pass(self) -> None:
        text, result = self.render(
            "launch-sized",
            {"setup_rehearsal": {"passed": True}, "launch_sized": {"passed": True}},
        )
        self.assertIn("LAUNCH-SIZED PASS (not the full gate)", text)
        self.assertIn("NOT the full capacity gate", text)
        self.assertIn("NOT RUN in this scope", text)
        self.assertNotIn("Verdict: **PASS**", text)
        self.assertTrue(result["gatePassed"])
        self.assertTrue(result["launchSizedPassed"])
        self.assertFalse(result["fullGatePassed"])
        self.assertIn("NOT the full", result["evidenceLabel"])

    def test_a_full_gate_pass_cannot_satisfy_a_launch_sized_scope(self) -> None:
        _, result = self.render(
            "launch-sized",
            {"setup_rehearsal": {"passed": True}, "full_gate": {"passed": True}},
        )
        self.assertFalse(result["gatePassed"])
        self.assertFalse(result["launchSizedPassed"])
        self.assertFalse(result["fullGatePassed"])

    def test_a_launch_sized_pass_cannot_satisfy_the_full_scope(self) -> None:
        text, result = self.render(
            "full",
            {"setup_rehearsal": {"passed": True}, "launch_sized": {"passed": True}},
        )
        self.assertFalse(result["gatePassed"])
        self.assertFalse(result["fullGatePassed"])
        self.assertFalse(result["launchSizedPassed"])
        self.assertIn("Verdict: **FAIL/BLOCKED**", text)

    def test_a_failed_launch_sized_run_is_a_fail(self) -> None:
        text, result = self.render(
            "launch-sized",
            {"setup_rehearsal": {"passed": True}, "launch_sized": {"passed": False}},
        )
        self.assertIn("Verdict: **FAIL/BLOCKED**", text)
        self.assertFalse(result["gatePassed"])

    def test_full_gate_report_text_is_unchanged(self) -> None:
        text, result = self.render(
            "full",
            {"setup_rehearsal": {"passed": True}, "full_gate": {"passed": True}},
        )
        self.assertIn("## Fantasy load test (Phase 6 capacity gate, staging)", text)
        self.assertIn("Scope: rehearsal, then the 2,500-user gate and soak", text)
        self.assertIn("Verdict: **PASS**", text)
        self.assertIn("- Exact 2,500-user gate and soak: pass", text)
        self.assertTrue(result["gatePassed"])
        self.assertTrue(result["fullGatePassed"])
        self.assertFalse(result["launchSizedPassed"])
        self.assertEqual(result["evidenceLabel"], "full gate")

    def test_rehearsal_scope_is_unchanged(self) -> None:
        text, result = self.render("rehearsal", {"setup_rehearsal": {"passed": True}})
        self.assertIn("Scope: setup rehearsal only", text)
        self.assertTrue(result["gatePassed"])
        self.assertFalse(result["fullGatePassed"])


class ProvisionerModeTests(unittest.TestCase):
    PROVISIONER = load_module(
        "fantasy_session_provisioner_launch", "fantasy-session-provisioner.py"
    )

    def provision(self, mode: str, expected_users: int, records: int = 1) -> None:
        root = Path(tempfile.mkdtemp(prefix="botolago-provisioner-"))
        self.addCleanup(shutil.rmtree, root, ignore_errors=True)
        credentials = root / "credentials.json"
        credentials.write_text(
            json.dumps(
                [
                    {
                        "number": 50001 + index,
                        "email": f"gate-user-{index}@staging.invalid",
                        "password": "temporary-password",
                        "user_id": str(uuid.uuid4()),
                    }
                    for index in range(records)
                ]
            )
        )
        credentials.chmod(0o600)
        environment = {
            "BOTOLAGO_LOAD_ENVIRONMENT": "staging-v2",
            "BOTOLAGO_STAGING_SUPABASE_URL": "https://example.supabase.co",
            "BOTOLAGO_STAGING_PUBLISHABLE_KEY": "sb_publishable_example",
            "BOTOLAGO_LOAD_CREDENTIAL_CACHE": str(credentials),
            "BOTOLAGO_LOAD_SESSION_CACHE": str(root / "sessions.json"),
            "BOTOLAGO_SESSION_DIAGNOSTICS_PATH": str(root / "diagnostics.ndjson"),
            "BOTOLAGO_RUNNER_ID": "0",
            "BOTOLAGO_AUTH_RATE_PER_SECOND": "0.4",
            "BOTOLAGO_CAPACITY_MODE": mode,
            "BOTOLAGO_EXPECTED_SESSION_USERS": str(expected_users),
        }
        with mock.patch.dict(os.environ, environment, clear=True):
            asyncio.run(self.PROVISIONER.provision())

    def test_launch_sized_requires_exactly_200_users_per_runner(self) -> None:
        for users in (1, 25, 199, 201, 500):
            with self.subTest(users=users), self.assertRaises(SystemExit) as caught:
                self.provision("launch_sized", users)
            self.assertIn("exactly 200 users per runner", str(caught.exception))

    def test_launch_sized_mode_is_recognised(self) -> None:
        # With 200 expected users the mode check passes and the run stops later,
        # on the credential-record count, not on "unsupported capacity mode".
        with self.assertRaises(SystemExit) as caught:
            self.provision("launch_sized", 200, records=1)
        self.assertIn("exactly 200 credential records", str(caught.exception))

    def test_full_gate_still_requires_exactly_500_users_per_runner(self) -> None:
        for users in (200, 499, 501):
            with self.subTest(users=users), self.assertRaises(SystemExit) as caught:
                self.provision("full_gate", users)
            self.assertIn("exactly 500 users per runner", str(caught.exception))

    def test_unknown_mode_is_still_refused(self) -> None:
        with self.assertRaises(SystemExit) as caught:
            self.provision("launch", 200)
        self.assertIn("unsupported capacity mode", str(caught.exception))


class WorkflowTests(unittest.TestCase):
    def test_workflow_offers_launch_sized_as_its_own_scope(self) -> None:
        text = (
            SCRIPTS.parents[1] / ".github/workflows/fantasy-load-test.yml"
        ).read_text()
        self.assertIn("- launch-sized", text)
        self.assertIn("rehearsal|full|launch-sized", text)
        self.assertIn('launch-sized) mode="--rehearsal-then-launch-sized"', text)
        # The default and the full path still run the unchanged full gate.
        self.assertIn("default: full", text)
        self.assertIn('*) mode="--rehearsal-then-full"', text)


if __name__ == "__main__":
    unittest.main()
