import contextlib
import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import patch

PATH=Path(__file__).resolve().parents[1]/'staging-worker-alarm-drill.py'
SPEC=importlib.util.spec_from_file_location('alarm_drill_tests',PATH)
D=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(D)


class AlarmTests(unittest.TestCase):
    def test_production_target_refused_before_constructing_management_client(self):
        with patch.dict(D.os.environ,{'SUPABASE_STAGING_PROJECT_REF':'tkewgajrljbwgwedqsxn'}), patch.object(D.R.UPDATE,'ManagementTarget') as target:
            with self.assertRaisesRegex(RuntimeError,'refused_target'):
                D.main()
            target.assert_not_called()

    def test_a_retirement_failure_still_restores_alerts_and_schedules(self):
        target=unittest.mock.Mock()
        with patch.object(D,'retire',side_effect=RuntimeError('refused')), patch.object(D,'restore_alert_state') as alerts, patch.object(D.E,'baseline',return_value={'old':1}), patch.object(D.E,'restore',return_value=[]) as cron, contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(RuntimeError,'restoration_failed'):
                D.cleanup(target,{'cron':[]},{'old':1},True)
            alerts.assert_called_once()
            cron.assert_called_once()

    def test_failed_baseline_measurement_still_restores_schedules(self):
        target=unittest.mock.Mock()
        with patch.object(D,'restore_alert_state'), patch.object(D.E,'baseline',side_effect=RuntimeError('unreadable')), patch.object(D.E,'restore',return_value=[]) as cron, contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(RuntimeError,'restoration_failed'):
                D.cleanup(target,{'cron':[]},{},False)
            cron.assert_called_once()

    def test_unrelated_incident_cannot_be_counted_as_worker_alarm(self):
        value={'worker':{'status':'fail'},'health':{'checks':[{'name':'news_publication','status':'fail'}]}}
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaisesRegex(RuntimeError,'unrelated_failure'):
            D.assert_health(value,'fail')

    def test_fixture_never_reopens_the_previous_scoring_worlds(self):
        sql=(D.ROOT/'scripts/backend/staging-worker-alarm-fixture.sql').read_text()
        self.assertNotIn('f9500000',sql)
        self.assertNotIn('f9510000',sql)
        self.assertIn('generate_series(1,2)',sql)
        self.assertNotIn('generate_series(1,5000)',sql)
        self.assertIn('staging_drill_fixture_already_exists',sql)

    def test_preflight_uses_vault_metadata_without_decrypting_a_webhook(self):
        source=PATH.read_text()
        self.assertIn("vault.secrets where name='botolago_ops_alert_webhook'",source)
        self.assertNotIn('ops_alert_webhook()',source)
        self.assertNotIn('decrypted_secrets',source)

    def test_diagnostics_never_repeat_provider_payloads_or_addresses(self):
        import json
        value=D.error_metadata(RuntimeError('HTTP 400: permission denied for function secret_read; recipient=private@example.invalid; token=opaque-value'))
        self.assertEqual(value['categories'],['permission'])
        self.assertEqual(value['identifiers'],['secret_read'])
        self.assertNotIn('private@example.invalid',json.dumps(value))
        self.assertNotIn('opaque-value',json.dumps(value))


if __name__=='__main__':
    unittest.main()
