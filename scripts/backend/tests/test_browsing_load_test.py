from __future__ import annotations

import argparse
import importlib.util
import json
import os
import random
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

BACKEND = Path(__file__).resolve().parents[1]


def load(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, BACKEND / filename)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


BROWSING = load("browsing_load_test", "browsing-load-test.py")
ORCHESTRATOR = load("fantasy_capacity_orchestrator_browsing", "fantasy-capacity-orchestrator.py")
REPORT = load("fantasy_capacity_report_browsing", "fantasy-capacity-report.py")

CONTENT = BROWSING.Content(
    season_id="s",
    competition_id="c",
    live_fixture_ids=["live-1", "live-2"],
    fixture_ids=[f"f{n}" for n in range(60)],
    match_day="2026-09-26",
    article_ids={"fr": [f"a{n}" for n in range(80)], "ar": [f"b{n}" for n in range(40)]},
    fantasy_season_id="fs",
    fantasy_gameweek_id="fg",
)


def shard(index: int, visitors: int = 100, latencies=(100.0, 200.0), errors=None) -> dict:
    return {
        "profile": {
            "loadProfile": "browsing",
            "visitorsTotal": visitors,
            "requests": len(latencies),
            "durationSeconds": 600,
        },
        "content": CONTENT.coverage(),
        "rpcs": {"news_feed": {"count": len(latencies)}},
        "errorCodes": errors or {},
        "latencySamplesMs": list(latencies),
        "pageSamplesMs": [300.0],
    }


class BrowsingWorkloadTests(unittest.TestCase):
    def test_refuses_production_and_legacy(self) -> None:
        for ref in ("tkewgajrljbwgwedqsxn", "kxpaudvntwxpahyjtxbk"):
            with self.assertRaises(SystemExit):
                BROWSING.assert_staging_url(f"https://{ref}.supabase.co")
        BROWSING.assert_staging_url("https://srdrflfrfpwixsllveid.supabase.co")
        BROWSING.assert_staging_url("http://127.0.0.1:55321")
        with self.assertRaises(SystemExit):
            BROWSING.assert_staging_url("https://example.com")

    def test_every_page_makes_the_calls_the_app_makes(self) -> None:
        rng = random.Random(1)
        counts = {
            page: sum(len(group) for group in BROWSING.page_calls(page, CONTENT, rng, "fr"))
            for page in BROWSING.PAGE_WEIGHTS
        }
        self.assertEqual(counts["match_live"], 8)  # 7 match reads + news
        self.assertEqual(counts["news_article"], 3)
        self.assertEqual(counts["fantasy_rankings"], 21)  # hub + 20 board pages
        self.assertGreaterEqual(counts["home"], 13)
        self.assertEqual(sum(BROWSING.PAGE_WEIGHTS.values()), 100)

    def test_rankings_skip_the_board_without_a_fantasy_season(self) -> None:
        content = BROWSING.Content(**{**CONTENT.__dict__, "fantasy_season_id": None})
        calls = BROWSING.page_calls("fantasy_rankings", content, random.Random(1), "fr")
        self.assertEqual([[rpc for rpc, _ in group] for group in calls], [["fantasy_hub"]])

    def test_items_of_reads_every_envelope(self) -> None:
        self.assertEqual(BROWSING.items_of([1]), [1])
        self.assertEqual(BROWSING.items_of({"items": [2]}), [2])
        self.assertEqual(BROWSING.items_of({"matches": [3]}), [3])
        self.assertEqual(BROWSING.items_of(None), [])

    def test_quantile(self) -> None:
        self.assertEqual(BROWSING.quantile([], 0.95), 0.0)
        self.assertEqual(BROWSING.quantile([float(n) for n in range(1, 101)], 0.95), 95.0)

    def test_empty_content_blocks_instead_of_passing(self) -> None:
        short = BROWSING.Content(**{**CONTENT.__dict__, "live_fixture_ids": []}).coverage()
        missing = {k: v for k, v in short.items() if v < BROWSING.MIN_CONTENT[k]}
        self.assertEqual(missing, {"liveMatches": 0})

    def test_visitors_must_divide_across_shards(self) -> None:
        env = {
            "BOTOLAGO_STAGING_SUPABASE_URL": "http://127.0.0.1:55321",
            "BOTOLAGO_LOAD_ENVIRONMENT": "staging-local",
            "BOTOLAGO_STAGING_PUBLISHABLE_KEY": "key",
            "BOTOLAGO_BROWSING_VISITORS": "7",
            "BOTOLAGO_BROWSING_DURATION_SECONDS": "600",
            "BOTOLAGO_LOAD_SHARD_COUNT": "5",
            "BOTOLAGO_LOAD_RESULTS_PATH": "/tmp/unused.json",
        }
        with mock.patch.dict(os.environ, env, clear=True):
            with self.assertRaises(SystemExit):
                BROWSING.BrowsingRunner()


class OrchestratorBrowsingTests(unittest.TestCase):
    def test_settings_default_and_bounds(self) -> None:
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(ORCHESTRATOR.browsing_settings(), (2000, 600))
        for visitors in ("7", "0", "20005"):
            with mock.patch.dict(os.environ, {"BOTOLAGO_BROWSING_VISITORS": visitors}, clear=True):
                with self.assertRaises(RuntimeError):
                    ORCHESTRATOR.browsing_settings()

    def test_aggregate_merges_five_shards(self) -> None:
        result = ORCHESTRATOR.aggregate_browsing([shard(i) for i in range(5)], 100)
        self.assertEqual(result["profile"]["requests"], 10)
        self.assertEqual(result["overall"]["readP95Ms"], 200.0)
        self.assertTrue(all(result["passCriteria"].values()))

    def test_aggregate_fails_on_errors_and_wrong_shards(self) -> None:
        shards = [shard(i, errors={"TimeoutError": 1}) for i in range(5)]
        result = ORCHESTRATOR.aggregate_browsing(shards, 100)
        self.assertFalse(result["passCriteria"]["unexpectedErrorRate"])
        with self.assertRaises(RuntimeError):
            ORCHESTRATOR.aggregate_browsing([shard(i) for i in range(4)], 100)
        with self.assertRaises(RuntimeError):
            ORCHESTRATOR.aggregate_browsing([shard(i, visitors=50) for i in range(5)], 100)

    def test_browsing_is_a_mode_and_the_gate_modes_are_unchanged(self) -> None:
        self.assertEqual(ORCHESTRATOR.BROWSING_MODE, "browsing")
        self.assertEqual(ORCHESTRATOR.FULL_GATE_MODE, "full_gate")

    def test_pool_utilisation_counts_postgrest_busy_connections(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            gate = ORCHESTRATOR.CapacityGate.__new__(ORCHESTRATOR.CapacityGate)
            gate.artifact_dir = Path(temporary)
            record = {
                "metrics": [
                    {"series": 'pgrst_db_pool_max{service_type="postgrest"}', "value": 50},
                    {"series": 'pgrst_db_pool_available{service_type="postgrest"}', "value": 0},
                    {"series": 'pgbouncer_pools_server_active_connections{db="postgres"}', "value": 0},
                ]
            }
            (gate.artifact_dir / "metrics.ndjson").write_text(json.dumps(record) + "\n")
            gate.sql_samples = [
                {"connections": 20, "max_connections": 160, "api_pool_busy": 10, "lock_waits": 0, "deadlocks": 0, "conflicts": 0, "cache_hit_ratio": 1},
                {"connections": 60, "max_connections": 160, "api_pool_busy": 45, "lock_waits": 0, "deadlocks": 0, "conflicts": 0, "cache_hit_ratio": 1},
            ]
            metrics = gate.analyze_metrics()
        # 45 of 50 busy is 90%; the lazily opened pool's "available 0" is not.
        self.assertEqual(metrics["maxPoolUtilizationPercent"], 90.0)


class ReportBrowsingTests(unittest.TestCase):
    def render(self, browsing_passed: bool) -> dict:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "evidence"
            for name, summary in (
                ("r", {"mode": "setup_rehearsal", "passed": True}),
                (
                    "b",
                    {
                        "mode": "browsing",
                        "passed": browsing_passed,
                        "browsing": {"overall": {"readP95Ms": 120.0}, "profile": {"visitors": 2000}},
                        "metrics": {"maxCpuPercent": 50.0},
                    },
                ),
            ):
                (root / name).mkdir(parents=True)
                (root / name / "gate-summary.json").write_text(json.dumps(summary))
            (root / "c").mkdir()
            (root / "c" / "recovery-cleanup-summary.json").write_text(json.dumps({"passed": True}))
            args = argparse.Namespace(
                evidence_root=root,
                output=Path(temporary) / "summary.md",
                result=Path(temporary) / "result.json",
                run_url="https://github.invalid/run",
                run_label="run 1",
                oidc_outcome="success",
                capacity_exit=0 if browsing_passed else 2,
                cleanup_exit=0,
                scope="browsing",
            )
            REPORT.render(args)
            text = args.output.read_text()
            result = json.loads(args.result.read_text())
        self.assertIn("match-day browsing workload", text)
        self.assertIn("read p50/p95/p99", text)
        return result

    def test_browsing_scope_passes_only_on_a_passed_browsing_run(self) -> None:
        self.assertTrue(self.render(True)["gatePassed"])
        self.assertFalse(self.render(False)["gatePassed"])


if __name__ == "__main__":
    unittest.main()
