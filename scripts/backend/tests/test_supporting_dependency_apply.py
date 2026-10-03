"""The apply runner for the Flashscore supporting-dependency guard: the commit payload, the manifest
checks, and the verifier, tested without a database. (The same flows run against a disposable
Postgres in the local scenario run recorded in the pull request.)"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts" / "backend" / "production-mapping-supporting-dependency-apply.py"
SPEC = importlib.util.spec_from_file_location("supporting_dependency_apply", SCRIPT)
assert SPEC and SPEC.loader
A = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = A
SPEC.loader.exec_module(A)

WRAPPER_BYTES = (ROOT / A.WRAPPER).read_bytes()
MANIFEST_BYTES = (ROOT / A.MANIFEST).read_bytes()


def make_before() -> dict:
    md5 = {sig: md5v for sig, md5v in A.OLD_MD5.items()}
    md5[A.RESOLVER] = A.RESOLVER_MD5
    md5["api.admin_football_mapping_decide(uuid,text,text,text,boolean,uuid)"] = "6a23f72de1be2af83ed7d92d3abd40b8"
    acl = {sig: "{postgres=X/postgres}" for sig in md5}
    for sig in md5:
        if sig.startswith("api."):
            acl[sig] = "{postgres=X/postgres,authenticated=X/postgres}"
    base = {
        "history_rows": 146, "history_has_guard": 0, "latest_version": "20261002110000",
        "migrations_after_reviewed": A.HISTORY_AFTER_REVIEWED, "compute_signatures": A.OLD_COMPUTE,
        "guard_functions": 0, "function_md5": md5, "function_acl": acl, "other_functions_digest": "o" * 32,
        "api_functions": 312, "private_functions": 330,
        "proposal_columns": ["id:uuid:NO", "self_approved:boolean:YES"],
        "proposal_constraints": {"football_player_mapping_proposals_pkey": "PRIMARY KEY (id)"},
        "proposal_indexes": {"football_player_mapping_proposals_pkey": "CREATE UNIQUE INDEX ..."},
        "proposal_triggers": {"t": "def"}, "mapping_constraints": {"c": "def"}, "mapping_triggers": {"t": "def"},
        "mapping_indexes": {"i": "def"}, "table_grants": {"x": "acl"}, "guard_constraint": 0, "guard_index": 0,
        "new_column_use": 0, "mapping_rows": 1732, "mapping_digest": "m" * 32, "sofascore_active": 191,
        "flashscore_mappings": 0, "proposals_by_status": {"executed": 191}, "proposal_digest": "p" * 32,
        "candidates": 1004, "candidate_digest": "c" * 32, "observations": 1006, "observation_digest": "b" * 32,
        "manifest_candidates_unmapped": 53, "single_operator_on": True, "settings_digest": "s" * 32,
        "permissions_digest": "1" * 32, "roles_digest": "2" * 32, "principals_digest": "3" * 32,
        "assignments_digest": "4" * 32, "role_permissions_digest": "5" * 32, "players_digest": "6" * 32,
        "memberships_digest": "7" * 32, "cron_jobs": 14, "cron_digest": "8" * 32, "automation_digest": "9" * 32,
        "audit_events": 579, "idempotency_keys": 393, "fantasy_table_counts": {"fantasy_teams": 7},
        "gameweek_digest": "g" * 32, "busy_sessions": 0, "finalizing_gameweeks": 0, "lifecycle_tick_enabled": 0,
    }
    for key in A.EXPECT_BEFORE:
        if key.startswith("f_"):
            base[key] = A.EXPECT_BEFORE[key]
    return base


def apply_expected(before: dict) -> dict:
    after = json.loads(json.dumps(before))
    after.update(A.expected_after(before))
    return after


GOOD_CHECKS = {
    "fingerprint_rows": 42, "fingerprints_matching": 42, "fingerprints_not_matching": [],
    "supporting_expected_state": 42, "sofascore_active": 191, "sofascore_reviewed": 191,
    "grants": dict(A.EXPECT_GRANTS),
}


class CommitPayload(unittest.TestCase):
    def test_only_the_final_rollback_becomes_commit(self) -> None:
        payload = A.build_commit_payload(WRAPPER_BYTES)
        before = WRAPPER_BYTES.decode("utf-8").split("\n")
        after = payload.split("\n")
        self.assertEqual(len(before), len(after))
        changed = [(i, a, b) for i, (a, b) in enumerate(zip(before, after)) if a != b]
        self.assertEqual(len(changed), 1)
        self.assertEqual(changed[0][1:], ("rollback;", "commit;"))
        # It is the last statement before the closing result row, not a word inside a comment or a body.
        self.assertIn("select case\n  when exists (select 1 from supabase_migrations.schema_migrations", "\n".join(after[changed[0][0] + 1:]))
        self.assertEqual(hashlib.sha256(payload.encode()).hexdigest(), A.COMMIT_PAYLOAD_SHA256)

    def test_everything_that_must_be_preserved_is_preserved(self) -> None:
        payload = A.build_commit_payload(WRAPPER_BYTES)
        wrapper = WRAPPER_BYTES.decode("utf-8")
        migration = (ROOT / A.MIGRATION).read_text(encoding="utf-8")
        self.assertIn(migration, payload)
        self.assertEqual(len(re.findall(r"(?im)^\s*drop\s+function\b", payload)), 1)
        self.assertEqual(payload.lower().count("on commit drop"), wrapper.lower().count("on commit drop"))
        for text in ("hold_scheduled_jobs", "manifest check failed", "postflight failed", "set local lock_timeout"):
            self.assertEqual(payload.count(text), wrapper.count(text))
        self.assertNotRegex(payload, r"(?i)\bcascade\b")
        self.assertNotRegex(payload, r"(?i)disable\s+trigger|session_replication_role")
        self.assertEqual([l for l in payload.split("\n") if l == "rollback;"], [])

    def test_a_changed_wrapper_is_refused(self) -> None:
        with self.assertRaises(A.ApplyError):
            A.build_commit_payload(WRAPPER_BYTES + b"\n")

    def test_zero_or_two_transaction_endings_are_refused(self) -> None:
        original = A.WRAPPER_SHA256
        try:
            for text in (WRAPPER_BYTES.decode().replace("\nrollback;\n", "\n-- gone\n"),
                         WRAPPER_BYTES.decode() + "\nrollback;\n",
                         WRAPPER_BYTES.decode() + "\ncommit;\n"):
                raw = text.encode()
                A.WRAPPER_SHA256 = hashlib.sha256(raw).hexdigest()
                with self.assertRaises(A.ApplyError):
                    A.build_commit_payload(raw)
        finally:
            A.WRAPPER_SHA256 = original


class ManifestChecks(unittest.TestCase):
    def test_both_hashes_are_checked_with_their_own_algorithms(self) -> None:
        manifest = A.verify_manifest(MANIFEST_BYTES)
        self.assertEqual(manifest["manifestSha256"], A.MANIFEST_CANONICAL_SHA256)
        self.assertNotEqual(A.MANIFEST_FILE_SHA256, A.MANIFEST_CANONICAL_SHA256)
        self.assertEqual(hashlib.sha256(MANIFEST_BYTES).hexdigest(), A.MANIFEST_FILE_SHA256)

    def test_changed_file_bytes_are_refused(self) -> None:
        with self.assertRaises(A.ApplyError):
            A.verify_manifest(MANIFEST_BYTES + b" ")

    def test_changed_content_with_a_matching_file_hash_is_still_refused(self) -> None:
        tampered = json.loads(MANIFEST_BYTES)
        tampered["rows"][0]["externalId"] = "tampered"
        raw = json.dumps(tampered, indent=2).encode()
        original = A.MANIFEST_FILE_SHA256
        try:
            A.MANIFEST_FILE_SHA256 = hashlib.sha256(raw).hexdigest()
            with self.assertRaises(A.ApplyError):
                A.verify_manifest(raw)
        finally:
            A.MANIFEST_FILE_SHA256 = original

    def test_42_rows_and_11_held_rows(self) -> None:
        rows, reasons, ids = A.manifest_inputs(A.verify_manifest(MANIFEST_BYTES))
        self.assertEqual((len(rows), len(ids)), (42, 53))
        self.assertEqual(sum(r["k"].startswith("F1_") for r in rows), 24)
        self.assertEqual(sum(r["k"].startswith("F2_") for r in rows), 18)
        self.assertEqual(set(reasons), {"F1_REVIEWED_SOFASCORE_EVENTS", "F2_REVIEWED_SOFASCORE_SHIRT_DOB"})


class SnapshotShape(unittest.TestCase):
    def test_every_jsonb_build_object_stays_under_the_100_argument_limit(self) -> None:
        for part in (A._SNAPSHOT_SCHEMA, A._SNAPSHOT_FRAGMENTS, A._business_sql(["a"])):
            keys = re.findall(r"^  '[a-z_0-9]+', ", part, re.M)
            self.assertLessEqual(len(keys), 50)

    def test_no_lookup_casts_an_object_that_the_commit_removes(self) -> None:
        sql = A.snapshot_sql(["00000000-0000-4000-8000-000000000000"])
        self.assertNotIn("::regprocedure", sql.replace("p.oid::regprocedure", ""))
        self.assertNotIn("football_mapping_compute(text", sql)

    def test_every_snapshot_key_is_classified(self) -> None:
        sql = A.snapshot_sql(["00000000-0000-4000-8000-000000000000"])
        keys = set(re.findall(r"^  '([a-z_0-9]+)', ", sql, re.M))
        self.assertEqual(keys, A.CHANGED_KEYS | A.PROTECTED_KEYS | A.LIVE_KEYS)


class Verifier(unittest.TestCase):
    def test_the_pre_state_is_accepted_and_drift_is_not(self) -> None:
        before = make_before()
        self.assertEqual(A.check_pre(before), [])
        for key, value in (("mapping_rows", 1733), ("flashscore_mappings", 1), ("single_operator_on", False),
                           ("proposals_by_status", {"executed": 190, "pending": 1}), ("history_has_guard", 1)):
            changed = dict(before, **{key: value})
            self.assertTrue(A.check_pre(changed), key)
        changed = make_before()
        changed["function_md5"][A.OLD_COMPUTE] = "0" * 32
        self.assertTrue(A.check_pre(changed))

    def test_the_exact_expected_post_state_passes(self) -> None:
        before = make_before()
        self.assertEqual(A.verify_post(before, apply_expected(before)), [])
        self.assertEqual(A.verify_post_checks(GOOD_CHECKS, apply_expected(before)), [])

    def test_an_unchanged_schema_is_not_a_successful_migration(self) -> None:
        before = make_before()
        self.assertTrue(A.verify_post(before, before))

    def test_each_kind_of_unexpected_change_is_rejected(self) -> None:
        before = make_before()
        mutations = {
            "legacy compute copy remains": lambda a: a["function_md5"].update({A.OLD_COMPUTE: "x" * 32}),
            "a replaced function differs": lambda a: a["function_md5"].update({"api.admin_football_mapping_execute(uuid,uuid)": "0" * 32}),
            "an extra function": lambda a: a["function_md5"].update({"api.admin_football_mapping_evil()": "0" * 32}),
            "a grant widened": lambda a: a["function_acl"].update({A.NEW_COMPUTE: "{postgres=X/postgres,authenticated=X/postgres}"}),
            "index missing": lambda a: (a["proposal_indexes"].pop(A.INDEX_NAME), a.update(guard_index=0)),
            "check wrong": lambda a: a["proposal_constraints"].update({A.CHECK_NAME: "CHECK (true)"}),
            "extra column": lambda a: a["proposal_columns"].append("surprise:text:YES"),
            "mapping row changed": lambda a: a.update(mapping_digest="z" * 32),
            "a mapping appeared": lambda a: a.update(mapping_rows=1733),
            "a proposal appeared": lambda a: a.update(proposals_by_status={"executed": 191, "pending": 1}),
            "legacy proposal content changed": lambda a: a.update(proposal_digest="z" * 32),
            "a dependency appeared on an old proposal": lambda a: a.update(new_column_use=1),
            "single-operator off": lambda a: a.update(single_operator_on=False),
            "audit row appeared": lambda a: a.update(audit_events=580),
            "unrelated function changed": lambda a: a.update(other_functions_digest="z" * 32),
            "schedule changed": lambda a: a.update(cron_digest="z" * 32),
            "history grew twice": lambda a: a.update(history_rows=148),
            "an unknown key appeared": lambda a: a.update(surprise=1),
            "a held row got mapped": lambda a: a.update(manifest_candidates_unmapped=52),
        }
        for name, mutate in mutations.items():
            after = apply_expected(before)
            mutate(after)
            self.assertTrue(A.verify_post(before, after), name)

    def test_post_checks_reject_a_mismatch(self) -> None:
        after = apply_expected(make_before())
        for key, value in (("fingerprints_matching", 41), ("supporting_expected_state", 41), ("sofascore_reviewed", 190),
                           ("grants", dict(A.EXPECT_GRANTS, read_anon=True))):
            self.assertTrue(A.verify_post_checks(dict(GOOD_CHECKS, **{key: value}), after), key)


class Decisions(unittest.TestCase):
    """The whole flow with injected transport: every outcome, and the apply is sent at most once."""

    def run_flow(self, query_states, response=(200, "Applied. The Flashscore supporting-dependency guard is installed.", ""),
                 checks=GOOD_CHECKS, expect=None):
        sent: list[str] = []
        snapshots = list(query_states)

        def query(sql: str, read_only: bool):
            self.assertTrue(read_only)
            if "fingerprint_rows" in sql or sql.lstrip().startswith("with m as"):
                return [{"checks": checks}]
            value = snapshots.pop(0) if len(snapshots) > 1 else snapshots[0]
            if isinstance(value, Exception):
                raise value
            return [{"snapshot": value}]

        def send(payload: str):
            sent.append(payload)
            return response

        outcome, evidence = A.decide(query, send, "PAYLOAD", "SNAP", "with m as (select fingerprint_rows)", expect_before=expect, pause=0)
        return outcome, evidence, sent

    def test_committed_and_verified(self) -> None:
        before = make_before()
        outcome, evidence, sent = self.run_flow([before, apply_expected(before)])
        self.assertEqual((outcome, len(sent)), (A.OUT_OK, 1))
        self.assertEqual(evidence["warnings"], [])

    def test_a_lost_response_after_a_successful_commit_is_a_warning_not_a_failure(self) -> None:
        before = make_before()
        outcome, evidence, sent = self.run_flow(
            [before, apply_expected(before)], response=(None, "connection reset", "transport"))
        self.assertEqual((outcome, len(sent)), (A.OUT_OK, 1))
        self.assertTrue(evidence["warnings"])

    def test_a_timeout_that_left_the_database_untouched_is_a_rolled_back_failure(self) -> None:
        before = make_before()
        outcome, evidence, sent = self.run_flow([before, before], response=(None, "timed out", "transport"))
        self.assertEqual((outcome, len(sent)), (A.OUT_FAILED, 1))

    def test_a_database_error_leaves_it_rolled_back(self) -> None:
        before = make_before()
        outcome, _, sent = self.run_flow([before, before], response=(400, "ERROR: stop: postflight failed", ""))
        self.assertEqual((outcome, len(sent)), (A.OUT_FAILED, 1))

    def test_a_reported_success_over_an_unchanged_database_is_unverified(self) -> None:
        before = make_before()
        outcome, _, _ = self.run_flow([before, before])
        self.assertEqual(outcome, A.OUT_UNVERIFIED)

    def test_committed_but_failing_verification_needs_review(self) -> None:
        before = make_before()
        broken = apply_expected(before)
        broken["mapping_rows"] = 1733
        outcome, evidence, _ = self.run_flow([before, broken])
        self.assertEqual(outcome, A.OUT_REVIEW)
        self.assertTrue(evidence["problems"])

    def test_committed_but_the_42_fingerprints_do_not_match_needs_review(self) -> None:
        before = make_before()
        outcome, _, _ = self.run_flow(
            [before, apply_expected(before)], checks=dict(GOOD_CHECKS, fingerprints_matching=41))
        self.assertEqual(outcome, A.OUT_REVIEW)

    def test_neither_state_is_unverified(self) -> None:
        before = make_before()
        odd = json.loads(json.dumps(before))
        odd["api_functions"] += 1
        outcome, _, _ = self.run_flow([before, odd], response=(400, "ERROR", ""))
        self.assertEqual(outcome, A.OUT_UNVERIFIED)

    def test_an_unreadable_production_afterwards_is_unverified(self) -> None:
        before = make_before()
        outcome, evidence, sent = self.run_flow([before, A.ApplyError("down")])
        self.assertEqual((outcome, len(sent)), (A.OUT_UNVERIFIED, 1))

    def test_a_drifted_pre_state_blocks_before_anything_is_sent(self) -> None:
        drifted = dict(make_before(), flashscore_mappings=1)
        outcome, evidence, sent = self.run_flow([drifted])
        self.assertEqual((outcome, len(sent)), (A.OUT_BLOCKED, 0))
        self.assertTrue(evidence["pre_state_problems"])

    def test_an_unreadable_production_beforehand_blocks_without_sending(self) -> None:
        outcome, _, sent = self.run_flow([A.ApplyError("down")])
        self.assertEqual((outcome, len(sent)), (A.OUT_BLOCKED, 0))

    def test_the_apply_is_sent_exactly_once_in_every_outcome(self) -> None:
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertEqual(source.count("send(payload)"), 1)
        self.assertNotIn("while ", source.split("def decide")[1].split("def main")[0])


class AmbiguousResponses(unittest.TestCase):
    """A timeout or a lost connection does not say what happened to the transaction: the request may still be
    running in the database and commit after the first read. Polling decides, and the apply is never resent."""

    def flow(self, snapshots, response, checks_factory=None):
        sent: list[str] = []
        reads: list[int] = []
        queue = list(snapshots)

        def query(sql: str, read_only: bool):
            if sql.lstrip().startswith("with m as"):
                if checks_factory:
                    return checks_factory()
                return [{"checks": GOOD_CHECKS}]
            reads.append(1)
            value = queue.pop(0) if len(queue) > 1 else queue[0]
            if isinstance(value, Exception):
                raise value
            return [{"snapshot": value}]

        def send(payload: str):
            sent.append(payload)
            return response

        outcome, evidence = A.decide(query, send, "PAYLOAD", "SNAP", "with m as (select 1)", pause=0)
        return outcome, evidence, sent, len(reads)

    def busy(self, before: dict, sessions: int) -> dict:
        return dict(before, busy_sessions=sessions)

    def test_an_unchanged_state_while_the_request_may_still_run_is_not_a_rollback(self) -> None:
        before = make_before()
        outcome, evidence, sent, _ = self.flow(
            [before, self.busy(before, 1)], (None, "timed out", "transport"))
        self.assertEqual((outcome, len(sent)), (A.OUT_UNVERIFIED, 1))
        self.assertIn("may still be running", evidence["problems"][0])

    def test_it_is_a_rollback_only_once_the_database_has_been_quiet_twice(self) -> None:
        before = make_before()
        outcome, evidence, sent, reads = self.flow(
            [before, self.busy(before, 1), self.busy(before, 1), before, before], (504, "gateway timeout", ""))
        self.assertEqual((outcome, len(sent)), (A.OUT_FAILED, 1))
        self.assertGreaterEqual(reads, 5)
        self.assertTrue(evidence["settled_after_ambiguous_response"])

    def test_a_commit_that_lands_after_the_client_gave_up_is_found_and_verified(self) -> None:
        before = make_before()
        outcome, evidence, sent, _ = self.flow(
            [before, self.busy(before, 1), self.busy(before, 1), apply_expected(before)], (None, "reset", "transport"))
        self.assertEqual((outcome, len(sent)), (A.OUT_OK, 1))
        self.assertTrue(evidence["warnings"])

    def test_a_definitive_database_error_does_not_wait(self) -> None:
        before = make_before()
        outcome, _, sent, reads = self.flow(
            [before, self.busy(before, 1)], (400, "ERROR: stop: postflight failed", ""))
        self.assertEqual((outcome, len(sent), reads), (A.OUT_FAILED, 1, 2))

    def test_any_other_server_error_is_treated_as_ambiguous(self) -> None:
        self.assertEqual(A.classify_response(500, "internal error", ""), "gateway_timeout_or_unavailable")
        self.assertEqual(A.classify_response(400, "ERROR: stop: x", ""), "script_stop_guard")
        self.assertEqual(A.classify_response(400, "ERROR: 57014 canceling statement", ""), "database_statement_timeout")

    def test_the_post_commit_read_is_retried_like_the_snapshots(self) -> None:
        before = make_before()
        calls = {"n": 0}

        def flaky():
            calls["n"] += 1
            if calls["n"] < 3:
                raise A.ApplyError("transient")
            return [{"checks": GOOD_CHECKS}]

        outcome, _, _, _ = self.flow(
            [before, apply_expected(before)], (200, "Applied. The Flashscore supporting-dependency guard is installed.", ""),
            checks_factory=flaky)
        self.assertEqual((outcome, calls["n"]), (A.OUT_OK, 3))

    def test_a_post_commit_read_that_never_works_needs_review(self) -> None:
        before = make_before()

        def broken():
            raise A.ApplyError("down")

        outcome, evidence, _, _ = self.flow(
            [before, apply_expected(before)], (200, "Applied. The Flashscore supporting-dependency guard is installed.", ""),
            checks_factory=broken)
        self.assertEqual(outcome, A.OUT_REVIEW)
        self.assertTrue(any("post-commit checks" in p for p in evidence["problems"]))


class RehearsalWorkflowsStayRehearsalOnly(unittest.TestCase):
    def test_no_rehearsal_workflow_can_commit(self) -> None:
        for name in ("production-mapping-supporting-dependency-rehearsal.yml",
                     "staging-mapping-supporting-dependency-rehearsal.yml"):
            text = (ROOT / ".github" / "workflows" / name).read_text(encoding="utf-8")
            body = "\n".join(line for line in text.split("\n") if not line.strip().startswith("#"))
            self.assertNotIn("APPLY_SUPPORTING_DEPENDENCY_PRODUCTION", body)
            self.assertNotIn("-apply.py", body)


if __name__ == "__main__":
    unittest.main()
