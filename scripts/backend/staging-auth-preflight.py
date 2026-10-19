#!/usr/bin/env python3
"""Inspect or configure staging phone Auth; never print private configuration.

The protected workflow serializes configuration writes. The private Vault
baseline permits retry and later removal of the temporary LAN callback URLs.
"""
from __future__ import annotations
import importlib.util
import ipaddress
import json
import os
from pathlib import Path
import re
from urllib.parse import urlsplit

ROOT=Path(__file__).resolve().parents[2]
SPEC=importlib.util.spec_from_file_location('auth_preflight_runtime',ROOT/'scripts/backend/staging-release-runtime.py')
R=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)
BASELINE_NAME='botolago_staging_phone_auth_baseline'
FIELDS=('site_url','uri_allow_list','mailer_otp_length','mailer_templates_confirmation_content')


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


def phone_origin(value):
    try:
        parsed=urlsplit(value)
        address=ipaddress.ip_address(parsed.hostname or '')
        private=any(address in ipaddress.ip_network(v) for v in ('10.0.0.0/8','172.16.0.0/12','192.168.0.0/16'))
        valid=(address.version==4 and private and parsed.scheme=='https' and parsed.port==8443
               and not parsed.username and not parsed.password and parsed.path in ('','/')
               and not parsed.query and not parsed.fragment)
    except ValueError:
        valid=False
    if not valid:
        raise RuntimeError('staging_auth_private_phone_origin_required')
    return f'https://{address}:8443'


def phone_config(saved,origin):
    code='<p>BotolaGO STAGING — Code de vérification / رمز التحقق : <strong>{{ .Token }}</strong></p>'
    content=saved['mailer_templates_confirmation_content']
    body=re.search(r'<body\b[^>]*>',content,re.IGNORECASE)
    template=content[:body.end()]+code+content[body.end():] if body else code+content
    paths=('/auth/callback','/auth/callback?next=%2F',
           '/auth/callback?next=/auth/update-password','/auth/update-password',
           r'/auth/callback\?**')
    return {'mailer_otp_length':6,'mailer_templates_confirmation_content':template,
            'site_url':origin,'uri_allow_list':','.join(origin+p for p in paths)}


def configure_phone(target,ref,config,origin,cleanup=False):
    R.validate_ref(ref)
    origin=phone_origin(origin)
    # The shared workflow group/guard owns this staging window. Persist only
    # the fields this action changes, never SMTP passwords or OAuth secrets.
    busy=target.rows("""select exists(select 1 from app_private.fantasy_worker_lease
      where released_at is null and expires_at>now())
      or exists(select 1 from cron.job where active)
      or exists(select 1 from app_private.rivals_settings where enabled)
      or exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled or lifecycle_worker_enabled)
      or exists(select 1 from app_private.notification_email_settings where mode<>'off' or football_live_refresh_enabled)
      or exists(select 1 from app_private.notification_push_settings where mode<>'off')
      or exists(select 1 from app_private.ops_alert_state where enabled)
      or exists(select 1 from app_private.ai_content_settings where enabled)
      or exists(select 1 from app_private.ai_home_story_settings where enabled)
      or exists(select 1 from app_private.ai_home_story_jobs where status='generating')
      or exists(select 1 from app.notification_deliveries where status='claimed')
      or exists(select 1 from app.account_deletion_requests where status='processing')
      or exists(select 1 from app_private.account_deletion_settings where enabled)
      or exists(select 1 from app_private.manager_card_settings where compute_enabled)
      or exists(select 1 from app_private.trophy_settings where enabled)
      or exists(select 1 from app_private.pepites_settings where mode<>'off')
      or exists(select 1 from app_private.prediction_settings where mode<>'off')
      or exists(select 1 from pg_stat_activity where backend_type='client backend'
        and pid<>pg_backend_pid() and state<>'idle') as busy""")[0]['busy']
    if busy:
        raise RuntimeError('staging_auth_writer_not_idle')
    saved_rows=target.execute(f"select decrypted_secret as state from vault.decrypted_secrets where name='{BASELINE_NAME}'",60)
    if saved_rows:
        state=json.loads(saved_rows[0]['state'])
        if state['origin']!=origin:
            raise RuntimeError('staging_auth_baseline_origin_mismatch')
        saved=state['before']
    else:
        if cleanup:
            raise RuntimeError('staging_auth_cleanup_context_missing')
        metadata=public_metadata(config)
        if (metadata['siteUrlKind']!='localhost' or metadata['redirectCount']!=0
                or metadata['emailOtpLength']!=8 or metadata['confirmationTemplateKind']!='confirmation_link'):
            raise RuntimeError('staging_auth_unreviewed_baseline')
        saved={k:config.get(k) for k in FIELDS}
        state={'before':saved,'origin':origin}
        literal="'"+json.dumps(state,ensure_ascii=False).replace("'","''")+"'"
        target.execute(f"select vault.create_secret({literal},'{BASELINE_NAME}','Staging phone Auth URL and code-template baseline',null)",60)
    desired=phone_config(saved,origin)
    # Recognize exactly the four-entry version already applied by this run.
    # An unrelated redirect/template change still refuses rather than being
    # overwritten. The extra glob fixes dynamic next= values on this same
    # exact callback path and trusted origin; it cannot match another host.
    legacy={**desired,'uri_allow_list':','.join(desired['uri_allow_list'].split(',')[:-1])}
    current={k:config.get(k) for k in FIELDS}
    if cleanup:
        cleaned={**desired,'site_url':saved['site_url'],'uri_allow_list':saved['uri_allow_list']}
        if current not in (desired,legacy,cleaned):
            raise RuntimeError('staging_auth_cleanup_configuration_drift')
        desired=cleaned
    elif current not in (saved,legacy,desired):
        raise RuntimeError('staging_auth_configuration_drift')
    if current!=desired:
        target._request('PATCH',f'/v1/projects/{ref}/config/auth',desired,60)
    actual=target._request('GET',f'/v1/projects/{ref}/config/auth',None,60)
    if {k:actual.get(k) for k in FIELDS}!=desired:
        raise RuntimeError('staging_auth_configuration_readback_failed')
    if cleanup:
        target.execute(f"delete from vault.secrets where name='{BASELINE_NAME}'",60)
    return actual


def main():
    ref=os.environ.get('SUPABASE_STAGING_PROJECT_REF','')
    R.validate_ref(ref)
    action=os.environ.get('ACTION','authpreflight')
    if action not in ('authpreflight','authconfigure','authcleanup'):
        raise RuntimeError('staging_auth_action_refused')
    origin=phone_origin(os.environ.get('STAGING_APP_ORIGIN','')) if action!='authpreflight' else None
    target=R.UPDATE.ManagementTarget(os.environ['SUPABASE_ACCESS_TOKEN'],ref)
    config=target._request('GET',f'/v1/projects/{ref}/config/auth',None,60)
    if origin:
        config=configure_phone(target,ref,config,origin,cleanup=action=='authcleanup')
    metadata=public_metadata(config)
    del config
    print(json.dumps({'staging':True,'readOnly':action=='authpreflight','action':action,**metadata},sort_keys=True))


if __name__=='__main__':
    try:
        main()
    except Exception as error:
        # Configuration responses can contain secrets. No upstream text.
        print(json.dumps({'passed':False,'error':'staging_auth_preflight_failed','errorType':type(error).__name__}))
        raise SystemExit(1)
