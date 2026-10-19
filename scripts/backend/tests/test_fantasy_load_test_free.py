from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'fantasy-load-test-free.py'
SPEC = importlib.util.spec_from_file_location('free_load', SCRIPT)
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


def ready(count=200):
    result = []
    for i in range(5):
        item = {'runnerId': i, 'origin': f'198.51.100.{i}', 'source': 'source',
                'sessions': count, 'minimumExpiry': 5000}
        for field in ('subjectFingerprints', 'sessionFingerprints', 'accessTokenFingerprints', 'refreshTokenFingerprints'):
            item[field] = [f'{field}-{i}-{n}' for n in range(count)]
        result.append(item)
    return result


class FreeLoadSafetyTests(unittest.TestCase):
    def test_artifact_lookup_selects_only_the_current_attempt(self):
        import json
        listing = {'artifacts': [{'name': f'free-context-attempt-{n}', 'expired': False} for n in (1, 2)]}
        with tempfile.TemporaryDirectory() as directory, patch.object(M, 'RUNTIME', Path(directory)), patch.dict(os.environ, {
            'GITHUB_RUN_ATTEMPT': '2', 'GITHUB_RUN_ID': '1', 'GITHUB_REPOSITORY': 'owner/repo'}), patch.object(M, 'github', side_effect=[json.dumps(listing), '']) as github:
            path = M.artifact('free-context')
            self.assertEqual(path.name, 'free-context-attempt-2')
            self.assertEqual(github.call_args.args[0][4], 'free-context-attempt-2')

    def test_old_attempt_artifacts_are_never_downloaded(self):
        import json
        listing = {'artifacts': [{'name': 'free-context-attempt-1', 'expired': False}]}
        with patch.dict(os.environ, {'GITHUB_RUN_ATTEMPT': '2', 'GITHUB_RUN_ID': '1', 'GITHUB_REPOSITORY': 'owner/repo'}), patch.object(M, 'github', return_value=json.dumps(listing)) as github, patch.object(M.time, 'monotonic', side_effect=[0, 0, 2]), patch.object(M.time, 'sleep'):
            with self.assertRaisesRegex(RuntimeError, 'free_barrier_timeout'):
                M.artifact('free-context', wait_seconds=1)
            self.assertEqual(github.call_count, 1)

    def test_duplicate_current_attempt_artifacts_are_refused(self):
        import json
        listing = {'artifacts': [{'name': 'free-context-attempt-2', 'expired': False}] * 2}
        with patch.dict(os.environ, {'GITHUB_RUN_ATTEMPT': '2', 'GITHUB_RUN_ID': '1', 'GITHUB_REPOSITORY': 'owner/repo'}), patch.object(M, 'github', return_value=json.dumps(listing)) as github:
            with self.assertRaisesRegex(RuntimeError, 'free_duplicate_artifact'):
                M.artifact('free-context')
            self.assertEqual(github.call_count, 1)

    def test_context_from_another_attempt_is_refused(self):
        with patch.dict(os.environ, {'GITHUB_RUN_ID': '1', 'GITHUB_RUN_ATTEMPT': '2', 'GITHUB_SHA': 'source', 'SCOPE': 'launch-sized'}):
            with self.assertRaisesRegex(RuntimeError, 'free_current_attempt_context_required'):
                M.validate_context_identity({'runId': 'gha-1-1', 'source': 'source', 'scope': 'launch-sized'})
            M.validate_context_identity({'runId': 'gha-1-2', 'source': 'source', 'scope': 'launch-sized'})

    def test_production_is_rejected_before_network(self):
        with patch.dict(os.environ, {'SUPABASE_STAGING_PROJECT_REF': 'tkewgajrljbwgwedqsxn'}), patch.object(M.UPDATE, 'ManagementTarget') as target:
            with self.assertRaisesRegex(RuntimeError, 'free_target_refused'):
                M.FreeGate()
            target.assert_not_called()

    def test_github_constructor_never_creates_aws_clients(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(M, 'PUBLIC', Path(directory)), patch.object(M.BASE.boto3, 'Session') as aws, patch.object(M.UPDATE, 'ManagementTarget'), patch.dict(os.environ, {
            'SUPABASE_ACCESS_TOKEN': 'secret', 'SUPABASE_STAGING_PROJECT_REF': M.REF,
            'SUPABASE_STAGING_URL': f'https://{M.REF}.supabase.co', 'SUPABASE_STAGING_PUBLISHABLE_KEY': 'key',
            'SCOPE': 'launch-sized', 'GITHUB_RUN_ID': '1', 'GITHUB_RUN_ATTEMPT': '1'}):
            gate = M.FreeGate()
            self.assertEqual(gate.total_users, 1000)
            aws.assert_not_called()

    def test_password_is_bound_to_secret_run_and_user(self):
        values = {M.password('secret', 'run', 1), M.password('different', 'run', 1),
                  M.password('secret', 'next-run', 1), M.password('secret', 'run', 2)}
        self.assertEqual(len(values), 4)
        self.assertEqual(M.password('secret', 'run', 1), M.password('secret', 'run', 1))

    def test_child_never_inherits_privileged_credentials(self):
        with patch.dict(os.environ, {'SUPABASE_ACCESS_TOKEN': 'secret', 'GITHUB_TOKEN': 'secret',
                                    'AWS_SECRET_ACCESS_KEY': 'secret', 'BOTOLAGO_LOAD_PROFILE': 'launch_sized_gate'}, clear=True):
            self.assertEqual(M.child_environment(), {'BOTOLAGO_LOAD_PROFILE': 'launch_sized_gate'})

    def test_barrier_requires_distinct_origins_sessions_source_and_validity(self):
        M.validate_ready(ready(), 200, 'source', 1000)
        for mutate in (
            lambda r: r[1].update(origin=r[0]['origin']),
            lambda r: r[1].update(subjectFingerprints=r[0]['subjectFingerprints']),
            lambda r: r[1].update(source='other'),
            lambda r: r[1].update(minimumExpiry=1500),
            lambda r: r[1].update(sessions=199),
            lambda r: r.pop(),
        ):
            shards = ready()
            mutate(shards)
            with self.assertRaises(RuntimeError):
                M.validate_ready(shards, 200, 'source', 1000)

    def test_metrics_cadence_uses_the_existing_rehearsal_and_load_windows(self):
        self.assertTrue(M.metrics_complete({'scrapeErrors': 0, 'scrapes': 6}, True))
        self.assertFalse(M.metrics_complete({'scrapeErrors': 0, 'scrapes': 6}, False))
        self.assertTrue(M.metrics_complete({'scrapeErrors': 0, 'scrapes': 16}, False))
        self.assertFalse(M.metrics_complete({'scrapeErrors': 1, 'scrapes': 16}, False))

    def test_postgrest_secret_never_enters_recovery_state(self):
        from unittest.mock import Mock
        original = {"db_schema":"api", "max_rows":1000, "db_extra_search_path":"public", "db_pool":20, "db_pool_acquisition_timeout":10}
        gate = Mock()
        gate.management.return_value = {**original,"jwt_secret":"never-print-this","unknown_secret":"also-private"}
        self.assertEqual(M.public_postgrest_config(gate),original)

    def test_pool_reduction_restores_exact_original_without_overwriting_drift(self):
        from unittest.mock import Mock
        original = {"db_schema":"api", "max_rows":1000, "db_extra_search_path":"public", "db_pool":20, "db_pool_acquisition_timeout":10}
        gate = Mock()
        state = {"postgrest":original,"postgrestPool":"8"}
        with patch.object(M,'public_postgrest_config',side_effect=[{**original,'db_pool':8},original]):
            self.assertTrue(M.restore_postgrest(gate,state))
        gate.management.assert_called_once_with('PATCH',f'/v1/projects/{M.REF}/postgrest',{'db_pool':20})
        gate.reset_mock()
        with patch.object(M,'public_postgrest_config',return_value={**original,'db_pool':35}):
            with self.assertRaisesRegex(RuntimeError,'configuration_drift'):
                M.restore_postgrest(gate,state)
        gate.management.assert_not_called()

    def test_automatic_reset_must_succeed_as_a_noop_before_pool_reduction(self):
        from unittest.mock import Mock
        original = {"db_pool":None,"db_schema":"api"}
        state = {"postgrest":original,"postgrestPool":"8"}
        gate = Mock()
        with patch.object(M,'public_postgrest_config',return_value=original), patch.object(M.BASE,'private_json') as persist:
            M.prove_automatic_pool_reset(gate,state)
        gate.management.assert_called_once_with('PATCH',f'/v1/projects/{M.REF}/postgrest',{'db_pool':None})
        self.assertTrue(state['automaticPoolResetProven'])
        persist.assert_called_once()
        gate = Mock()
        gate.management.side_effect = RuntimeError('HTTP 400')
        refused = {"postgrest":original,"postgrestPool":"8"}
        with self.assertRaisesRegex(RuntimeError,'automatic_reset_refused'):
            M.prove_automatic_pool_reset(gate,refused)
        self.assertNotIn('automaticPoolResetProven',refused)

    def test_automatic_original_cannot_be_restored_without_saved_reset_proof(self):
        from unittest.mock import Mock
        gate = Mock()
        original = {'db_pool':None}
        with patch.object(M,'public_postgrest_config',return_value={'db_pool':8}):
            with self.assertRaisesRegex(RuntimeError,'automatic_reset_not_proven'):
                M.restore_postgrest(gate,{'postgrest':original,'postgrestPool':'8'})
        gate.management.assert_not_called()

    def test_cleanup_failure_still_restores_exact_original_cron_flags(self):
        import json
        with tempfile.TemporaryDirectory() as directory:
            context = Path(directory) / 'context.json'
            context.write_text(json.dumps({'runId': 'gha-1-1', 'source': 'source',
                'baseline': {}, 'settings': {'rivals': True, 'cron': [
                    {'jobid': 11, 'active': True}, {'jobid': 12, 'active': False}]}}))
            class Gate:
                run_id = 'gha-1-2'
                users = []
                commands = []
                def sql(self, query):
                    self.commands.append(query)
                    if query.startswith('select jobid'):
                        return [{'jobid': 11, 'active': True}, {'jobid': 12, 'active': False}]
                    return []
                def delete_users_and_state(self):
                    raise RuntimeError('simulated cleanup failure')
            gate = Gate()
            with patch.object(M, 'CONTEXT', context), patch.object(M, 'PUBLIC', Path(directory)), patch.object(M, 'FreeGate', return_value=gate), patch.dict(os.environ, {
                'GITHUB_SHA': 'source', 'GITHUB_RUN_ID': '1', 'GITHUB_RUN_ATTEMPT': '2', 'SCOPE': 'rehearsal'}):
                self.assertEqual(M.finish(), 2)
            self.assertIn('select cron.alter_job(11, active:=true)', gate.commands)
            self.assertIn('select cron.alter_job(12, active:=false)', gate.commands)
            self.assertIn('select app_private.rivals_configure(true)', gate.commands)
            verdict = json.loads((Path(directory) / 'verdict.json').read_text())
            self.assertFalse(verdict['passed'])
            self.assertTrue(verdict['cronRestored'])
            self.assertEqual(verdict['cleanupErrors'], ['RuntimeError'])


if __name__ == '__main__':
    unittest.main()
