from __future__ import annotations

import importlib.util
import inspect
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


if __name__ == "__main__":
    unittest.main()
