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


if __name__ == '__main__':
    unittest.main()
