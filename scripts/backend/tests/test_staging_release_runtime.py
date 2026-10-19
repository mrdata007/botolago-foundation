from __future__ import annotations
import contextlib
import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace
import unittest

PATH = Path(__file__).resolve().parents[1] / "staging-release-runtime.py"
SPEC = importlib.util.spec_from_file_location("runtime_setup", PATH)
RUNTIME = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNTIME)
TOKEN = "test-secret-that-must-never-be-in-reports-123456789"


class Target:
    def __init__(self, active=0, lease=False):
        self.active = active
        self.lease = lease
        self.requests = []
        self.executed = []

    def rows(self, sql):
        if "schema_migrations" in sql:
            return [{"version": m.version, "name": m.name} for m in RUNTIME.UPDATE.load_migrations()]
        if "scheduler_token()" in sql:
            return [{"token": TOKEN}]
        return [{"active_cron": self.active, "fantasy_on": False, "worker_on": False,
                 "email_mode": "off", "push_mode": "off", "generating": 0, "lease_held":self.lease, "scheduler_present": True}]

    def execute(self, sql, timeout):
        self.executed.append(sql)
        if "scheduler_token()" in sql:
            return [{"token": TOKEN}]

    def _request(self, method, path, body, timeout):
        self.requests.append((method, path, body))
        if path.endswith("/functions"):
            config=RUNTIME.tomllib.loads((RUNTIME.ROOT / "supabase/config.toml").read_text())
            return [{"slug": p.name, "status": "ACTIVE", "version": 2, "verify_jwt": config.get("functions",{}).get(p.name,{}).get("verify_jwt",True)}
                    for p in (RUNTIME.ROOT / "supabase/functions").iterdir() if (p / "index.ts").is_file()]
        if method == "GET" and path.endswith("/secrets"):
            return [{"name": "BOTOLAGO_SCHEDULER_TOKEN"}]
        return []


class RuntimeTests(unittest.TestCase):
    def test_production_is_rejected_before_any_api_or_deploy_call(self):
        target = Target()
        with self.assertRaisesRegex(RuntimeError, "refused_target"):
            RUNTIME.deploy(target, "tkewgajrljbwgwedqsxn")
        self.assertEqual(target.requests, [])

    def test_an_active_scheduled_writer_prevents_secret_and_runtime_mutations(self):
        target = Target(active=1)
        with self.assertRaisesRegex(RuntimeError, "writers_not_paused"):
            RUNTIME.deploy(target, RUNTIME.REF)
        self.assertEqual(target.requests, [])

    def test_scheduler_is_transferred_privately_and_every_deploy_is_staging(self):
        target = Target()
        calls = []
        def run(command, **kwargs):
            calls.append(command)
            return SimpleNamespace(returncode=0)
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            report = RUNTIME.deploy(target, RUNTIME.REF, run)
        transfer = next(request for request in target.requests if request[0] == "POST")
        self.assertEqual(transfer[2][0]["value"], TOKEN)
        self.assertNotIn(TOKEN, output.getvalue() + json.dumps(report))
        self.assertEqual(len(calls), len(report["functions"]))
        self.assertGreater(len(calls), 10)
        self.assertTrue(all(command[command.index("--project-ref")+1] == RUNTIME.REF for command in calls))
        worker = next(command for command in calls if "fantasy-lifecycle-worker" in command)
        self.assertIn("--no-verify-jwt", worker)
        ingest = next(command for command in calls if "football-ingest" in command)
        self.assertNotIn("--no-verify-jwt", ingest)
        self.assertFalse(report["email_provider_secret_present"])

    def test_inflight_worker_blocks_mutations_even_with_schedules_paused(self):
        target=Target(lease=True)
        with self.assertRaisesRegex(RuntimeError,"writers_not_paused"):
            RUNTIME.deploy(target,RUNTIME.REF)
        self.assertEqual(target.requests,[])

    def test_failed_deployment_reports_only_fixed_categories_and_presence(self):
        output = io.StringIO()
        def run(command, **kwargs):
            return SimpleNamespace(returncode=1, stderr=f"Failed to bundle: import {TOKEN}; HTTP 403 forbidden")
        with contextlib.redirect_stdout(output), self.assertRaisesRegex(RuntimeError, "deploy_failed"):
            RUNTIME.deploy(Target(), RUNTIME.REF, run)
        lines = [json.loads(line) for line in output.getvalue().splitlines()]
        failure = next(line for line in lines if line["phase"] == "deploy_failure")
        self.assertEqual(failure["categories"], ["authorization", "dependency"])
        self.assertNotIn(TOKEN, output.getvalue())
        self.assertTrue(any(line["phase"] == "secret_name_preflight" for line in lines))


if __name__ == "__main__":
    unittest.main()
