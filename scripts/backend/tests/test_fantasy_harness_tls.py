from __future__ import annotations

import importlib.util
import os
import ssl
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock


SCRIPT = Path(__file__).resolve().parents[1] / "fantasy_harness_tls.py"
BACKEND_ROOT = SCRIPT.parent
SPEC = importlib.util.spec_from_file_location("fantasy_harness_tls_test", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def verified_context() -> SimpleNamespace:
    return SimpleNamespace(
        verify_mode=ssl.CERT_REQUIRED,
        check_hostname=True,
    )


class HarnessTlsTests(unittest.TestCase):
    def test_explicit_ca_bundle_wins_over_certifi(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            bundle = Path(directory) / "explicit-ca.pem"
            bundle.write_text("test-ca", encoding="utf-8")
            context = verified_context()
            with (
                mock.patch.dict(
                    os.environ,
                    {MODULE.CA_BUNDLE_ENV: str(bundle)},
                    clear=True,
                ),
                mock.patch.object(
                    MODULE.certifi,
                    "where",
                    side_effect=AssertionError("certifi fallback must not run"),
                ),
                mock.patch.object(
                    MODULE.ssl,
                    "create_default_context",
                    return_value=context,
                ) as create_context,
            ):
                self.assertIs(MODULE.create_verified_ssl_context(), context)

            create_context.assert_called_once_with(cafile=str(bundle))

    def test_certifi_is_the_fallback(self) -> None:
        context = verified_context()
        with (
            mock.patch.dict(os.environ, {}, clear=True),
            mock.patch.object(
                MODULE.certifi,
                "where",
                return_value="/trusted/certifi.pem",
            ),
            mock.patch.object(
                MODULE.ssl,
                "create_default_context",
                return_value=context,
            ) as create_context,
        ):
            self.assertIs(MODULE.create_verified_ssl_context(), context)

        create_context.assert_called_once_with(cafile="/trusted/certifi.pem")

    def test_unverified_context_is_rejected(self) -> None:
        insecure = SimpleNamespace(
            verify_mode=ssl.CERT_NONE,
            check_hostname=False,
        )
        with (
            mock.patch.dict(os.environ, {}, clear=True),
            mock.patch.object(
                MODULE.certifi,
                "where",
                return_value="/trusted/certifi.pem",
            ),
            mock.patch.object(
                MODULE.ssl,
                "create_default_context",
                return_value=insecure,
            ),
            self.assertRaisesRegex(RuntimeError, "refuses an unverified TLS context"),
        ):
            MODULE.create_verified_ssl_context()

    def test_missing_explicit_bundle_fails_closed(self) -> None:
        with (
            mock.patch.dict(
                os.environ,
                {MODULE.CA_BUNDLE_ENV: "/missing/phase6-ca.pem"},
                clear=True,
            ),
            self.assertRaisesRegex(RuntimeError, "existing CA bundle"),
        ):
            MODULE.create_verified_ssl_context()

    def test_every_phase6_https_client_uses_the_shared_helper(self) -> None:
        clients = (
            "fantasy-capacity-orchestrator.py",
            "fantasy-capacity-orchestrator-diagnostic.py",
            "fantasy-session-provisioner.py",
            "fantasy-session-provisioner-diagnostic.py",
            "fantasy-load-test.py",
            "supabase-metrics-collector.py",
            "fantasy-standings-benchmark.py",
        )
        for filename in clients:
            with self.subTest(filename=filename):
                source = (BACKEND_ROOT / filename).read_text(encoding="utf-8")
                self.assertIn("create_verified_ssl_context", source)
                self.assertNotIn("ssl=False", source.replace(" ", ""))
                self.assertNotIn("verify=False", source.replace(" ", ""))
                self.assertNotIn("CERT_NONE", source)

    def test_remote_runner_installs_certifi_and_receives_the_helper(self) -> None:
        for filename in (
            "fantasy-capacity-orchestrator.py",
            "fantasy-capacity-orchestrator-diagnostic.py",
        ):
            with self.subTest(filename=filename):
                source = (BACKEND_ROOT / filename).read_text(encoding="utf-8")
                self.assertIn("certifi==2026.7.22", source)
                self.assertIn(
                    '"/opt/botolago/fantasy_harness_tls.py"',
                    source,
                )


if __name__ == "__main__":
    unittest.main()
