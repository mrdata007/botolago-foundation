import importlib.util
import json
import os
from pathlib import Path
import unittest
from unittest.mock import Mock, patch
import contextlib
import io

PATH=Path(__file__).resolve().parents[1]/'staging-reminder-drill.py'
SPEC=importlib.util.spec_from_file_location('reminder_drill_tests',PATH)
D=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(D)


class ReminderSafetyTests(unittest.TestCase):
    def test_real_unsubscribe_protocol_is_plain_text_not_rpc_json(self):
        response=Mock()
        response.status=200
        response.headers={}
        response.read.return_value=b'Unsubscribed'
        response.__enter__=Mock(return_value=response)
        response.__exit__=Mock(return_value=False)
        opener=Mock()
        opener.open.return_value=response
        with patch.object(D.urllib.request,'build_opener',return_value=opener):
            status,location,body=D.unsubscribe_request('x'*32,'POST')
        self.assertEqual((status,location,body),(200,None,'Unsubscribed'))
        request=opener.open.call_args.args[0]
        self.assertEqual(request.method,'POST')
        self.assertEqual(request.data,b'List-Unsubscribe=One-Click')

    def test_missing_private_handoff_cannot_mutate_staging(self):
        target=Mock()
        target.execute.return_value=[]
        with patch.dict(os.environ,{'ACTION':'run','SUPABASE_STAGING_PROJECT_REF':D.R.REF,'SUPABASE_ACCESS_TOKEN':'private','STAGING_QA_OWNER_IDS':'','STAGING_APP_ORIGIN':'https://192.168.1.2:8443'}),patch.object(D.R.UPDATE,'ManagementTarget',return_value=target):
            with self.assertRaisesRegex(RuntimeError,'private_owner_handoff_required'):
                D.main()
        self.assertEqual(target.execute.call_count,1)
        self.assertTrue(target.execute.call_args.args[0].startswith('select decrypted_secret'))
        target._request.assert_not_called()

    def test_cleanup_keeps_recovery_context_when_a_retirement_fails(self):
        ids=['f9710000-0000-4000-8000-000000000001','f9710000-0000-4000-8000-000000000002']
        prefs=[{'user_id':u,'email_notifications_enabled':True,'updated_at':'old'} for u in ids]
        profiles=[{'id':u,'preferred_language':'fr'} for u in ids]
        settings={'cron':[],'rivals':True,'email':{'id':True,'mode':'off','updated_at':'old'},'preferences':prefs,'profiles':profiles}
        target=Mock()
        target.rows.side_effect=[[{'p':{k:v for k,v in p.items() if k!='updated_at'}} for p in prefs],profiles,[{'state':{'id':True,'mode':'off'}}]]
        target._request.return_value=[]
        with patch.object(D.E,'wait_idle'),patch.object(D.E,'baseline',return_value={'old':1}),patch.object(D.E,'restore',return_value=[]) as schedules,patch.object(D,'retire',side_effect=RuntimeError('simulated')),contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(RuntimeError,'restoration_failed'):
                D.restore(target,settings,ids,{'old':1},True,True)
        schedules.assert_called_once()
        queries=[call.args[0] for call in target.execute.call_args_list]
        self.assertTrue(any(q.startswith('update app.user_preferences') for q in queries))
        self.assertTrue(any(q.startswith('update app_private.notification_email_settings') for q in queries))
        self.assertFalse(any(q.startswith('delete from app_private.staging_reminder_recovery') for q in queries))

    def test_an_unsettled_writer_keeps_cron_paused_and_the_context_intact(self):
        target=Mock()
        with patch.object(D.E,'wait_idle',side_effect=RuntimeError('still active')),patch.object(D.E,'restore') as schedules,patch.object(D,'retire') as retirement:
            with self.assertRaisesRegex(RuntimeError,'writer_not_settled'):
                D.restore(target,{},[],{},True,True)
        schedules.assert_not_called()
        retirement.assert_not_called()
        target._request.assert_not_called()

    def test_missing_recovery_context_cannot_pause_or_overwrite_settings(self):
        ids=['f9710000-0000-4000-8000-000000000001','f9710000-0000-4000-8000-000000000002']
        target=Mock()
        target.execute.return_value=[]
        with patch.dict(os.environ,{'ACTION':'reminderrecover','SUPABASE_STAGING_PROJECT_REF':D.R.REF,'SUPABASE_ACCESS_TOKEN':'private','STAGING_QA_OWNER_IDS':json.dumps(ids),'STAGING_APP_ORIGIN':'https://192.168.1.2:8443'}),patch.object(D.R.UPDATE,'ManagementTarget',return_value=target):
            with self.assertRaisesRegex(RuntimeError,'recovery_context_required'):
                D.main()
        self.assertEqual(target.execute.call_count,1)
        self.assertTrue(target.execute.call_args.args[0].startswith('select state'))

    def test_production_refused_before_network(self):
        with patch.dict(os.environ,{'SUPABASE_STAGING_PROJECT_REF':'tkewgajrljbwgwedqsxn'}), patch.object(D.R.UPDATE,'ManagementTarget') as target:
            with self.assertRaisesRegex(RuntimeError,'refused_target'):
                D.main()
            target.assert_not_called()

    def test_email_links_cannot_use_production_plaintext_or_non_lan_origins(self):
        for url in ['https://botolago.com','http://192.168.1.2:8443','https://127.0.0.1:8443','https://192.168.1.2:8443/evil','https://user:pass@192.168.1.2:8443','https://198.18.0.1:8443','https://192.168.1.2:8443?token=x']:
            with self.subTest(url=url),self.assertRaises(RuntimeError):
                D.validate_origin(url)
        self.assertEqual(D.validate_origin('https://192.168.1.2:8443/'),'https://192.168.1.2:8443')

    def test_owners_are_distinct_uuids_never_sql_fragments(self):
        good=['f9710000-0000-4000-8000-000000000001','f9710000-0000-4000-8000-000000000002']
        self.assertEqual(D.owner_ids(json.dumps(good)),good)
        for bad in [good[:1],[good[0],good[0]],['sql-fragment',good[0]]]:
            with self.subTest(value=bad),self.assertRaises((RuntimeError,ValueError)):
                D.owner_ids(json.dumps(bad))


if __name__=='__main__':
    unittest.main()
