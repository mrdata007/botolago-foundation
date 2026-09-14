"""Recovery tests run without credentials, network, or production writes."""

import importlib.util
from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("elbotola_recovery", Path(__file__).with_name("elbotola-recovery.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def environment(**overrides):
    return {
        "EXPECTED_COMMIT": "a" * 40, "GITHUB_SHA": "a" * 40,
        "GITHUB_REPOSITORY": MODULE.REPOSITORY, "GITHUB_REF": "refs/heads/main",
        "GITHUB_RUN_ATTEMPT": "1", "GITHUB_RUN_ID": "123",
        "GITHUB_EVENT_NAME": "workflow_dispatch", "GITHUB_ACTOR": "mrdata007",
        "CONFIRMATION": "RUN_ELBOTOLA_RECOVERY", "ELBOTOLA_RECOVERY_MODE": "canary",
        "SUPABASE_PRODUCTION_PROJECT_REF": MODULE.PROJECT,
        "SUPABASE_PRODUCTION_PROJECT_NAME": MODULE.PROJECT_NAME,
        "SUPABASE_PRODUCTION_URL": f"https://{MODULE.PROJECT}.supabase.co",
        "SUPABASE_ACCESS_TOKEN": "test-management-credential",
        "SUPABASE_SECRET_KEY": "test-service-credential",
        **overrides,
    }


def response(**overrides):
    return {"provider": "elbotola", "languages": ["ar"], "counters": {
        "fetched": 10, "validated": 10, "inserted": 10, "updated": 0,
        "skipped": 0, "rejected": 0, "retries": 0, **overrides,
    }}


class RecoveryTests(unittest.TestCase):
    def test_only_confirmed_owner_main_first_attempt_can_mutate(self):
        MODULE.guard(environment())
        for overrides in (
            {"GITHUB_ACTOR": "someone-else"}, {"GITHUB_REF": "refs/heads/preview"},
            {"GITHUB_RUN_ATTEMPT": "2"}, {"EXPECTED_COMMIT": "b" * 40},
            {"CONFIRMATION": ""}, {"SUPABASE_PRODUCTION_PROJECT_REF": "another-project"},
            {"GITHUB_EVENT_NAME": "push"}, {"SUPABASE_SECRET_KEY": ""},
        ):
            with self.subTest(overrides=overrides), self.assertRaises(MODULE.RecoveryError):
                MODULE.guard(environment(**overrides))

    def test_schedule_is_opt_in_and_cannot_deploy(self):
        MODULE.guard(environment(GITHUB_EVENT_NAME="schedule", ELBOTOLA_RECOVERY_MODE="refresh", ELBOTOLA_SCHEDULE_ENABLED="true"))
        for overrides in ({"ELBOTOLA_SCHEDULE_ENABLED": "false"}, {"ELBOTOLA_RECOVERY_MODE": "canary"}):
            values = environment(GITHUB_EVENT_NAME="schedule", ELBOTOLA_RECOVERY_MODE="refresh", ELBOTOLA_SCHEDULE_ENABLED="true")
            values.update(overrides)
            with self.assertRaises(MODULE.RecoveryError):
                MODULE.guard(values)

    def test_dedicated_auth_never_writes_shared_news_or_football_secrets(self):
        trigger = MODULE.dedicated_trigger("test-service-credential")
        self.assertRegex(trigger, r"^[0-9a-f]{64}$")
        self.assertEqual(trigger, MODULE.dedicated_trigger("test-service-credential"))
        self.assertNotEqual(trigger, MODULE.dedicated_trigger("rotated-service-credential"))
        payload = MODULE.configuration_payload(trigger)
        self.assertTrue(all(item["name"].startswith("ELBOTOLA_") for item in payload))
        self.assertEqual(next(item["value"] for item in payload if item["name"] == "ELBOTOLA_INGESTION_TRIGGER_SECRET"), trigger)

    def test_schedule_rejects_out_of_band_function_redeployment(self):
        MODULE.validate_scheduled_function({"version": 1}, "1")
        for actual, approved in ((2, "1"), (1, ""), (1, "not-verified")):
            with self.assertRaises(MODULE.RecoveryError):
                MODULE.validate_scheduled_function({"version": actual}, approved)

    def test_ingestion_requires_bounded_zero_rejection_exact_reconciliation(self):
        self.assertEqual(MODULE.validate_response(response())["inserted"], 10)
        for values in (
            {"fetched": 0, "validated": 0, "inserted": 0},
            {"fetched": 11, "validated": 11, "inserted": 11},
            {"inserted": 9}, {"rejected": 1}, {"validated": 9}, {"fetched": True},
        ):
            with self.subTest(values=values), self.assertRaises(MODULE.RecoveryError):
                MODULE.validate_response(response(**values))
        wrong_language = response()
        wrong_language["languages"] = ["fr"]
        with self.assertRaises(MODULE.RecoveryError):
            MODULE.validate_response(wrong_language)

    def test_database_verification_rejects_old_runs_stale_news_and_mismatch(self):
        started = datetime.now(timezone.utc)
        counters = MODULE.validate_response(response())
        row = {
            "run": {**counters, "status": "succeeded", "startedAt": (started + timedelta(seconds=1)).isoformat()},
            "published_articles": 10, "with_hero": 10, "invalid_metadata": 0,
            "latest_publication": started.isoformat(),
        }
        self.assertEqual(MODULE.validate_database([row], counters, started)["published_articles"], 10)
        for overrides in (
            {"latest_publication": (started - timedelta(days=3)).isoformat()},
            {"invalid_metadata": 1}, {"published_articles": 9},
            {"run": {**row["run"], "startedAt": (started - timedelta(seconds=1)).isoformat()}},
            {"run": {**row["run"], "inserted": 9}},
            {"run": {**row["run"], "status": "partially_succeeded"}},
        ):
            with self.subTest(overrides=overrides), self.assertRaises(MODULE.RecoveryError):
                MODULE.validate_database([{**row, **overrides}], counters, started)

    def test_canary_proof_requires_successful_first_attempt_owned_workflow(self):
        run = {"path": MODULE.WORKFLOW, "event": "workflow_dispatch", "conclusion": "success",
               "head_branch": "main", "head_sha": "b" * 40, "run_attempt": 1,
               "repository": {"full_name": MODULE.REPOSITORY}}
        MODULE.validate_canary_run(run)
        for overrides in ({"conclusion": "failure"}, {"run_attempt": 2}, {"event": "schedule"}, {"path": "another.yml"}):
            with self.assertRaises(MODULE.RecoveryError):
                MODULE.validate_canary_run({**run, **overrides})

    def test_failed_first_canary_restores_publisher_without_deleting_articles(self):
        with tempfile.TemporaryDirectory() as directory:
            recovery = MODULE.Recovery(environment(ELBOTOLA_RECOVERY_DIR=directory))
            recovery.save("preflight.json", {"previousPublisherActive": False, "previousPublisherTrust": "review_required"})
            with patch.object(recovery, "sql") as sql:
                recovery.rollback()
                self.assertIn("set active=false", sql.call_args.args[0])
                self.assertNotIn("delete", sql.call_args.args[0].lower())
            recovery.save("preflight.json", {"previousPublisherActive": True, "previousPublisherTrust": "trusted"})
            with patch.object(recovery, "sql") as sql:
                recovery.rollback()
                sql.assert_not_called()

    def test_evidence_rejects_credentials_and_dedicated_trigger(self):
        with tempfile.TemporaryDirectory() as directory:
            recovery = MODULE.Recovery(environment(ELBOTOLA_RECOVERY_DIR=directory))
            recovery.save("result.json", {"verdict": "pass", "counters": response()["counters"]})
            recovery.scan()
            for credential in (recovery.env["SUPABASE_SECRET_KEY"], recovery.trigger):
                recovery.save("result.json", {"unexpected": credential})
                with self.assertRaises(MODULE.RecoveryError):
                    recovery.scan()


if __name__ == "__main__":
    unittest.main()
