from __future__ import annotations
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

PATH = Path(__file__).resolve().parents[1]/'staging-edge-runtime-drill.py'
SPEC = importlib.util.spec_from_file_location('edge_drill_test',PATH)
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class EdgeDrillSafetyTests(unittest.TestCase):
    def test_production_target_refused_before_network(self):
        with patch.dict(M.os.environ,{'SUPABASE_STAGING_PROJECT_REF':'tkewgajrljbwgwedqsxn'}), patch.object(M.R.UPDATE,'ManagementTarget') as target:
            with self.assertRaisesRegex(RuntimeError,'refused_target'):
                M.main()
            target.assert_not_called()

    def test_failed_retirement_still_restores_original_job_flags_and_rivals(self):
        class Target:
            commands = []
            def execute(self,sql,timeout):
                self.commands.append(sql)
                if sql.startswith('begin;'):
                    raise RuntimeError('fixture retirement failed')
            def rows(self,sql):
                if sql.startswith('select jobid'):
                    return [{'jobid':1,'active':False},{'jobid':2,'active':True}]
                return [{'enabled':True}]
        target = Target()
        settings = {'cron':[{'jobid':1,'active':False},{'jobid':2,'active':True}],'rivals':True}
        output = io.StringIO()
        with contextlib.redirect_stdout(output), patch.object(M,'baseline',return_value={'fingerprint':'unchanged'}):
            with self.assertRaisesRegex(RuntimeError,'restoration_failed'):
                M.cleanup(target,settings,{'fingerprint':'unchanged'},True)
        self.assertIn('select cron.alter_job(1,active:=false)',target.commands)
        self.assertIn('select cron.alter_job(2,active:=true)',target.commands)
        self.assertIn('select app_private.rivals_configure(true)',target.commands)
        self.assertEqual(json.loads(output.getvalue())['errors'],['fixture_retirement_failed'])

    def test_provider_payloads_and_scheduler_never_enter_edge_evidence(self):
        secret = 'never-print-this-secret'
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self,*args): pass
            def read(self): return json.dumps({'status':'partial','recorded':True,'calls':42,'upstream_error':secret}).encode()
        with patch.object(M.urllib.request,'urlopen',return_value=Response()) as request:
            result = M.edge(None,secret)
        self.assertEqual(result['status'],'partial')
        self.assertNotIn(secret,json.dumps(result))
        self.assertNotIn('upstream_error',result)
        self.assertEqual(request.call_args.kwargs['timeout'],160)

    def test_unsettled_writer_prevents_mutation_not_forced_release(self):
        class Target:
            def rows(self,sql): return [{'busy':True}]
        with self.assertRaisesRegex(RuntimeError,'did_not_settle'):
            M.wait_idle(Target(),0)


if __name__=='__main__': unittest.main()
