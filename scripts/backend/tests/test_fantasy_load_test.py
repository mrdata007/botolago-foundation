from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from unittest import mock


SCRIPT = Path(__file__).resolve().parents[1] / "fantasy-load-test.py"
SPEC = importlib.util.spec_from_file_location("fantasy_load_test", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class PreparationHardeningTests(unittest.TestCase):
    def test_preparation_concurrency_is_bounded(self) -> None:
        self.assertEqual(MODULE.PREPARATION_CONCURRENCY, 10)

    def test_retry_delay_uses_full_jitter_bounds(self) -> None:
        for attempt, maximum in ((0, 0.5), (1, 1.0), (2, 2.0)):
            with self.subTest(attempt=attempt), mock.patch.object(
                MODULE.random, "uniform", return_value=maximum
            ) as uniform:
                self.assertEqual(MODULE.preparation_retry_delay(attempt), maximum)
                uniform.assert_called_once_with(0.0, maximum)

    def test_retry_delay_rejects_negative_attempt(self) -> None:
        with self.assertRaises(ValueError):
            MODULE.preparation_retry_delay(-1)


if __name__ == "__main__":
    unittest.main()
