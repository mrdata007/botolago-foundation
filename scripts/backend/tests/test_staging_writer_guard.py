from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "staging-writer-guard.py"
SPEC = importlib.util.spec_from_file_location("staging_writer_guard", SCRIPT)
assert SPEC and SPEC.loader
GUARD = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = GUARD
SPEC.loader.exec_module(GUARD)

WORKFLOWS = Path(__file__).resolve().parents[3] / ".github" / "workflows"


def run(run_id: int, workflow: str, status: str = "in_progress", branch: str = "main") -> dict:
    return {
        "id": run_id,
        "name": workflow,
        "path": f".github/workflows/{workflow}",
        "status": status,
        "head_branch": branch,
        "html_url": f"https://github.invalid/runs/{run_id}",
    }


class StagingWriterGuardTests(unittest.TestCase):
    def test_another_running_writer_is_found(self) -> None:
        writers = GUARD.running_writers(
            [run(1, "fantasy-load-test.yml"), run(2, "staging-database-update.yml")], "2"
        )
        self.assertEqual([item["id"] for item in writers], [1])

    def test_its_own_run_is_not_a_conflict(self) -> None:
        self.assertEqual(GUARD.running_writers([run(7, "fantasy-load-test.yml")], "7"), [])

    def test_workflows_that_do_not_write_to_staging_are_ignored(self) -> None:
        self.assertEqual(
            GUARD.running_writers([run(1, "backend-quality.yml"), run(2, "ops-watchdog.yml")], "9"),
            [],
        )

    def test_only_running_runs_count(self) -> None:
        runs = [
            run(1, "fantasy-load-test.yml", status="queued"),
            run(2, "fantasy-load-test.yml", status="waiting"),
        ]
        self.assertEqual(GUARD.running_writers(runs, "9"), [])

    def test_functional_acceptance_counts_only_on_its_staging_branch(self) -> None:
        runs = [
            run(1, "phase65-functional-acceptance.yml", branch="claude/some-feature"),
            run(2, "phase65-functional-acceptance.yml", branch="qa/phase6-functional-acceptance"),
        ]
        self.assertEqual([item["id"] for item in GUARD.running_writers(runs, "9")], [2])

    def test_every_listed_writer_exists_and_uses_the_guard_or_the_group(self) -> None:
        for workflow in GUARD.STAGING_WRITERS:
            text = (WORKFLOWS / workflow).read_text()
            self.assertTrue(
                "staging-writer-guard.py" in text or "group: phase6-staging-load-test" in text,
                workflow,
            )

    def test_every_staging_load_test_environment_workflow_is_listed(self) -> None:
        read_only = {"phase6-supabase-management-preflight.yml"}
        for path in sorted(WORKFLOWS.glob("*.yml")):
            if "environment: staging-load-test" in path.read_text() and path.name not in read_only:
                self.assertIn(path.name, GUARD.STAGING_WRITERS)


if __name__ == "__main__":
    unittest.main()
