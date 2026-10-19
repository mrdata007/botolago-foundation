#!/usr/bin/env python3
"""Read-only Auth configuration inventory; never print returned secret values."""
from __future__ import annotations
import importlib.util
import json
import os
from pathlib import Path
import re
from urllib.parse import urlsplit

ROOT=Path(__file__).resolve().parents[2]
SPEC=importlib.util.spec_from_file_location('auth_preflight_runtime',ROOT/'scripts/backend/staging-release-runtime.py')
R=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)


def template_kind(value):
    if not value:
        return 'default_or_unset'
    code=bool(re.search(r'{{\s*\.Token\s*}}',value))
    link=bool(re.search(r'{{\s*\.ConfirmationURL\s*}}',value))
    return 'code_and_link' if code and link else 'code' if code else 'confirmation_link' if link else 'custom_other'


def public_metadata(config):
    try:
        parsed=urlsplit(config.get('site_url') or '')
        kind=('production' if parsed.hostname in ('botolago.com','www.botolago.com') else
              'localhost' if parsed.hostname in ('localhost','127.0.0.1','::1') else
              'other_https' if parsed.scheme=='https' and parsed.hostname else 'unconfigured_or_invalid')
    except ValueError:
        kind='unconfigured_or_invalid'
    return {
        'customSmtpConfigured':all(bool(config.get(k)) for k in ('smtp_host','smtp_user','smtp_pass','smtp_admin_email')),
        'emailProviderEnabled':config.get('external_email_enabled'),
        'emailAutoConfirm':config.get('mailer_autoconfirm'),
        'googleProviderEnabled':config.get('external_google_enabled'),
        'appleProviderEnabled':config.get('external_apple_enabled'),
        'siteUrlKind':kind,
        'redirectCount':len([v for v in str(config.get('uri_allow_list') or '').split(',') if v.strip()]),
        'emailRateLimit':config.get('rate_limit_email_sent'),
        'emailOtpLength':config.get('mailer_otp_length'),
        'confirmationTemplateKind':template_kind(config.get('mailer_templates_confirmation_content')),
        'recoveryTemplateKind':template_kind(config.get('mailer_templates_recovery_content')),
    }


def main():
    ref=os.environ.get('SUPABASE_STAGING_PROJECT_REF','')
    R.validate_ref(ref)
    target=R.UPDATE.ManagementTarget(os.environ['SUPABASE_ACCESS_TOKEN'],ref)
    config=target._request('GET',f'/v1/projects/{ref}/config/auth',None,60)
    metadata=public_metadata(config)
    del config
    print(json.dumps({'staging':True,'readOnly':True,**metadata},sort_keys=True))


if __name__=='__main__':
    try:
        main()
    except Exception as error:
        # Configuration responses can contain secrets. No upstream text.
        print(json.dumps({'passed':False,'error':'staging_auth_preflight_failed','errorType':type(error).__name__}))
        raise SystemExit(1)
