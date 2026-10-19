import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

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
