from __future__ import annotations

import importlib.util
import inspect
import json
import stat
import tempfile
import unittest
from pathlib import Path


SCRIPT = (
    Path(__file__).resolve().parents[1]
    / "fantasy-capacity-orchestrator.py"
)
SPEC = importlib.util.spec_from_file_location("fantasy_capacity", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ProductionSshReliabilityTests(unittest.TestCase):
    def test_long_lived_ssh_uses_proven_keepalives_once(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            gate = MODULE.CapacityGate.__new__(MODULE.CapacityGate)
            gate.key_path = Path(temporary) / "runner.pem"
            gate.artifact_dir = Path(temporary)
            arguments = gate.ssh_base("203.0.113.10")

        for option in (
            "ServerAliveInterval=30",
            "ServerAliveCountMax=6",
            "TCPKeepAlive=yes",
            "BatchMode=yes",
            "ConnectTimeout=10",
            "StrictHostKeyChecking=accept-new",
        ):
            self.assertEqual(arguments.count(option), 1)

    def test_artifact_collection_precedes_fail_fast(self) -> None:
        source = inspect.getsource(
            MODULE.CapacityGate.deploy_and_provision_sessions
        )
        self.assertLess(
            source.index("self.scp_from(ip, remote, local)"),
            source.index("pkill -f '/opt/botolago/fantasy-session-provisioner.py'"),
        )


class PreparationAndObserverHardeningTests(unittest.TestCase):
    def test_runner_preparation_stagger_schedule(self) -> None:
        delays = [
            MODULE.runner_preparation_delay(index)
            for index in range(MODULE.RUNNER_COUNT)
        ]
        self.assertEqual(
            delays,
            [0, 15, 30, 45, 60],
        )
        self.assertEqual(MODULE.synchronized_preparation_lead_seconds(), 135)

    def test_database_observer_is_bounded_and_sanitized(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            gate = MODULE.CapacityGate.__new__(MODULE.CapacityGate)
            gate.database_observer_path = Path(temporary) / "database-observer.ndjson"
            gate.sql_samples = []
            queries: list[str] = []

            def sql(query: str) -> list[dict[str, object]]:
                queries.append(query)
                return [
                    {
                        "sampled_at": "2026-07-22T00:00:00Z",
                        "connections": 4,
                        "max_connections": 100,
                        "lock_waits": 1,
                        "waiting": 2,
                        "longest_query_age_seconds": 3.25,
                        "state_counts": {"active": 2, "idle": 2},
                        "blocking_pairs": [
                            {
                                "blockedFingerprint": "abc123",
                                "blockingFingerprint": "def456",
                            }
                        ],
                        "deadlocks": 0,
                        "conflicts": 0,
                        "cache_hit_ratio": 0.99,
                    }
                ]

            gate.sql = sql
            gate.sample_database()

            self.assertEqual(len(queries), 1)
            normalized = " ".join(queries[0].lower().split())
            self.assertIn("from pg_stat_activity", normalized)
            self.assertIn("pg_blocking_pids", normalized)
            self.assertIn("limit 20", normalized)
            self.assertNotIn("select query,", normalized)
            records = [
                json.loads(line)
                for line in gate.database_observer_path.read_text().splitlines()
            ]
            self.assertEqual(records, gate.sql_samples)
            self.assertNotIn("pid", json.dumps(records).lower())
            mode = stat.S_IMODE(gate.database_observer_path.stat().st_mode)
            self.assertEqual(mode, 0o600)

    def test_database_observer_is_fail_open(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            gate = MODULE.CapacityGate.__new__(MODULE.CapacityGate)
            gate.database_observer_path = Path(temporary) / "database-observer.ndjson"
            gate.sql_samples = []

            def fail(_query: str) -> object:
                raise TimeoutError("sensitive database detail")

            gate.sql = fail
            gate.sample_database()

            record = json.loads(gate.database_observer_path.read_text())
            self.assertEqual(record["observer_error"], "TimeoutError")
            self.assertNotIn("sensitive", json.dumps(record))

    def test_cleanup_inventory_uses_independent_bounded_counts(self) -> None:
        gate = MODULE.CapacityGate.__new__(MODULE.CapacityGate)
        gate.users = []
        queries: list[str] = []

        def sql(query: str) -> list[dict[str, int]]:
            queries.append(query)
            return [{"count": 0}]

        gate.sql = sql
        result = gate.verify_database_cleanup()

        self.assertEqual(len(queries), len(result))
        self.assertGreater(len(queries), 10)
        self.assertTrue(all(value == 0 for value in result.values()))
        self.assertTrue(all(" as count" in query.lower() for query in queries))


if __name__ == "__main__":
    unittest.main()
