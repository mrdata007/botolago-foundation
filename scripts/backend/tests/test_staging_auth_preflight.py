import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

PATH=Path(__file__).resolve().parents[1]/'staging-auth-preflight.py'
SPEC=importlib.util.spec_from_file_location('auth_preflight_tests',PATH)
M=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class AuthPreflightTests(unittest.TestCase):
    def test_production_refused_before_constructing_client(self):
        with patch.dict(M.os.environ,{'SUPABASE_STAGING_PROJECT_REF':'tkewgajrljbwgwedqsxn'}),patch.object(M.R.UPDATE,'ManagementTarget') as client:
            with self.assertRaisesRegex(RuntimeError,'refused_target'):
                M.main()
            client.assert_not_called()

    def test_provider_secrets_and_private_redirect_values_never_enter_metadata(self):
        source={'smtp_host':'smtp.example.invalid','smtp_user':'private-user','smtp_pass':'private-secret',
                'smtp_admin_email':'private@example.invalid','external_google_secret':'google-secret',
                'site_url':'https://botolago.com?token=private-token','uri_allow_list':'https://private.example.invalid/callback'}
        metadata=M.public_metadata(source)
        encoded=json.dumps(metadata)
        for value in ('private-secret','private-user','private@example.invalid','google-secret','private-token','private.example.invalid'):
            self.assertNotIn(value,encoded)
        self.assertTrue(metadata['customSmtpConfigured'])
        self.assertEqual(metadata['siteUrlKind'],'production')

    def test_partial_smtp_configuration_is_not_a_delivery_pass(self):
        self.assertFalse(M.public_metadata({'smtp_host':'smtp.resend.com','smtp_user':'resend'})['customSmtpConfigured'])

    def test_email_template_structure_without_disclosing_content(self):
        source={'mailer_templates_confirmation_content':'Private wording {{ .Token }} and {{.ConfirmationURL}}',
                'mailer_templates_recovery_content':'Private recovery {{ .ConfirmationURL }}',
                'mailer_otp_length':6}
        metadata=M.public_metadata(source)
        self.assertEqual(metadata['confirmationTemplateKind'],'code_and_link')
        self.assertEqual(metadata['recoveryTemplateKind'],'confirmation_link')
        self.assertEqual(metadata['emailOtpLength'],6)
        self.assertNotIn('Private',json.dumps(metadata))

    def test_missing_or_link_only_template_is_not_a_code_confirmation(self):
        self.assertEqual(M.template_kind(None),'default_or_unset')
        self.assertEqual(M.template_kind('<a href="{{ .ConfirmationURL }}">Confirm</a>'),'confirmation_link')
        self.assertEqual(M.template_kind('{{ .TokenHash }}'),'custom_other')

    def test_phone_origin_rejects_untrusted_targets(self):
        for origin in ('https://botolago.com:8443','http://192.168.1.2:8443',
                       'https://192.168.1.2:443','https://127.0.0.1:8443',
                       'https://192.168.1.2:8443/path'):
            with self.subTest(origin=origin),self.assertRaises(RuntimeError):
                M.phone_origin(origin)

    def test_configuration_and_cleanup_preserve_smtp_and_private_baseline(self):
        original={'site_url':'http://localhost:3000','uri_allow_list':'','mailer_otp_length':8,
                  'mailer_templates_confirmation_content':'<html><body><a href="{{ .ConfirmationURL }}">Confirm</a></body></html>',
                  'smtp_pass':'private-smtp-value'}
        origin='https://192.168.1.2:8443'
        current=dict(original)
        target=MagicMock()
        target.rows.return_value=[{'busy':False}]
        target.execute.return_value=[]
        patches=[]
        def request(method,path,payload,timeout):
            if method=='PATCH':
                patches.append(dict(payload));current.update(payload)
            return dict(current)
        target._request.side_effect=request
        result=M.configure_phone(target,M.R.REF,original,origin)
        self.assertEqual(result['mailer_otp_length'],6)
        self.assertEqual(M.template_kind(result['mailer_templates_confirmation_content']),'code_and_link')
        self.assertIn('<body><p>BotolaGO STAGING',result['mailer_templates_confirmation_content'])
        self.assertEqual(set(patches[0]),set(M.FIELDS))
        self.assertEqual(current['smtp_pass'],'private-smtp-value')
        backup_sql=target.execute.call_args_list[1].args[0]
        self.assertIn('vault.create_secret',backup_sql)
        self.assertNotIn('private-smtp-value',backup_sql)
        state={'origin':origin,'before':{k:original[k] for k in M.FIELDS}}
        target.execute.return_value=[{'state':json.dumps(state)}]
        M.configure_phone(target,M.R.REF,dict(current),origin,cleanup=True)
        self.assertEqual(current['site_url'],original['site_url'])
        self.assertEqual(current['uri_allow_list'],original['uri_allow_list'])
        self.assertEqual(current['mailer_otp_length'],6)
        self.assertEqual(current['smtp_pass'],'private-smtp-value')
        self.assertIn('delete from vault.secrets',target.execute.call_args.args[0])

    def test_production_and_configuration_drift_refuse_before_mutation(self):
        target=MagicMock()
        with self.assertRaisesRegex(RuntimeError,'refused_target'):
            M.configure_phone(target,'tkewgajrljbwgwedqsxn',{},'https://192.168.1.2:8443')
        target.execute.assert_not_called()
        target._request.assert_not_called()
        target.rows.return_value=[{'busy':False}]
        target.execute.return_value=[]
        with self.assertRaisesRegex(RuntimeError,'unreviewed_baseline'):
            M.configure_phone(target,M.R.REF,{'mailer_otp_length':7},'https://192.168.1.2:8443')
        target._request.assert_not_called()

    def test_retry_confirms_existing_configuration_without_reinserting_code(self):
        origin='https://192.168.1.2:8443'
        saved={'site_url':'http://localhost:3000','uri_allow_list':'','mailer_otp_length':8,
               'mailer_templates_confirmation_content':'<a href="{{ .ConfirmationURL }}">Confirm</a>'}
        desired=M.phone_config(saved,origin)
        target=MagicMock()
        target.rows.return_value=[{'busy':False}]
        target.execute.return_value=[{'state':json.dumps({'before':saved,'origin':origin})}]
        target._request.return_value=dict(desired)
        self.assertEqual(M.configure_phone(target,M.R.REF,desired,origin),desired)
        self.assertEqual([c.args[0] for c in target._request.call_args_list],['GET'])
        self.assertEqual(target.execute.call_count,1)
        with self.assertRaisesRegex(RuntimeError,'configuration_drift'):
            M.configure_phone(target,M.R.REF,{**desired,'mailer_otp_length':7},origin)

    def test_active_writer_refuses_before_snapshot_or_config_write(self):
        target=MagicMock()
        target.rows.return_value=[{'busy':True}]
        with self.assertRaisesRegex(RuntimeError,'writer_not_idle'):
            M.configure_phone(target,M.R.REF,{},'https://192.168.1.2:8443')
        target.execute.assert_not_called()
        target._request.assert_not_called()
