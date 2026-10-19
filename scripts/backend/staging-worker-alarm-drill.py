#!/usr/bin/env python3
"""Own a staging-only, real-clock 30/90-minute worker alarm/recovery window.

No alarm timestamp or threshold is edited. The recipient is configured privately
before dispatch; no address, credential or provider payload enters the report.
All normal cron jobs stay paused. The operator calls the unrelated maintenance
functions sequentially so their genuine heartbeats do not become false incidents.
"""
from __future__ import annotations
import importlib.util
import json
import os
import re
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('alarm_edge', ROOT/'scripts/backend/staging-edge-runtime-drill.py')
E = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(E)
R = E.R
PREFIX = 'f9530000-0000-4000-8000-'
SEASON = PREFIX+'000000000005'
GW = PREFIX+'000000000021'
URL = 'https://srdrflfrfpwixsllveid.supabase.co/functions/v1'
E.PREFIX, E.SEASON, E.GW = PREFIX, SEASON, GW
LAST_PHASE='initialization'


def phase(name):
    global LAST_PHASE
    LAST_PHASE=name
    E.report('alarm_phase',name=name)


def error_metadata(error):
    # Fixed categories and identifier-only matches. Never report upstream text.
    value=str(error).lower()
    categories=[name for name,pattern in {
        'permission':r'permission denied|not permitted|forbidden',
        'read_only':r'read.only|non-volatile function',
        'timeout':r'timeout|timed out|canceling statement',
        'constraint':r'violates|constraint',
        'missing_object':r'does not exist|undefined',
        'configuration':r'not.configured|unreachable|channel.missing',
        'network':r'network error|connection|\b50[0-9]\b',
    }.items() if re.search(pattern,value)]
    identifiers=[]
    for pattern in (r'permission denied for (?:function|table|schema) ([a-z_][a-z0-9_.]*)',
                    r'constraint "([a-z_][a-z0-9_]*)"',
                    r'function ([a-z_][a-z0-9_.]*)\('):
        identifiers.extend(re.findall(pattern,value))
    http=re.search(r'http (\d{3})',value)
    return {'phase':LAST_PHASE,'categories':categories,'identifiers':identifiers,
            'httpStatus':int(http[1]) if http else None}


def literal(value):
    return "'"+json.dumps(value, separators=(',', ':')).replace("'", "''")+"'::jsonb"


def expected_progress(value):
    return (value['status']=='finalized' and value['finalized']==2
            and value['correct_results']==2 and value['rankings']==8
            and value['rollovers']==2 and value['next_lineups']==2
            and value['postwork'] and value['advanced'])


def maintenance(target):
    # Production code, genuine execution timestamps, one call at a time.
    for sql in ('select app_private.news_publish_due_editions()',
                'select app_private.news_sitemap_refresh()',
                'select app_private.fantasy_lifecycle_tick()'):
        target.execute(sql,60)


def health(target):
    return target.rows("""select app_private.ops_health_checks() as health,
      app_private.fantasy_worker_health() as worker,
      extract(epoch from statement_timestamp()-greatest(d.counting_from,d.pending_since,
        (select max(finished_at) from app_private.fantasy_worker_runs where outcome='ok')))/60 as elapsed_minutes,
      d.counting_from,d.pending_since,d.last_outcome from app_private.fantasy_worker_dispatch d where id""")[0]


def assert_health(value, expected):
    if value['worker']['status'] != expected:
        raise RuntimeError('staging_alarm_worker_threshold_failed')
    unrelated=[c['name'] for c in value['health']['checks'] if c['status']=='fail' and c['name']!='fantasy_worker']
    if unrelated:
        E.report('unrelated_health_failures',checks=unrelated)
        raise RuntimeError('staging_alarm_unrelated_failure')


def confirmed_alert(target, expected_tick, expected_status):
    tick=target.execute('select app_private.ops_alert_tick() as outcome',60)[0]['outcome']
    if tick!=expected_tick:
        raise RuntimeError('staging_alarm_notification_not_queued')
    request=target.rows("select pending_request_id as request_id from app_private.ops_alert_channels where channel='email'")[0]['request_id']
    until=time.monotonic()+90
    while True:
        response=target.rows(f"select status_code,timed_out,content::jsonb->>'sent' as sent from net._http_response where id={int(request)}")
        if response:
            if response[0]['status_code']!=200 or response[0]['timed_out'] or response[0]['sent']!='true':
                raise RuntimeError('staging_alarm_provider_refused')
            break
        if time.monotonic()>=until:
            raise RuntimeError('staging_alarm_delivery_unconfirmed')
        time.sleep(3)
    if target.execute('select app_private.ops_alert_tick() as outcome',60)[0]['outcome']!='quiet':
        raise RuntimeError('staging_alarm_duplicate_or_changed_incident')
    row=target.rows("select delivered_status,pending_request_id,last_outcome from app_private.ops_alert_channels where channel='email'")[0]
    if row['delivered_status']!=expected_status or row['pending_request_id'] is not None or row['last_outcome']!='delivered':
        raise RuntimeError('staging_alarm_confirmation_missing')
    E.report('alarm_delivery',kind_of_message=expected_tick,requestId=request,httpStatus=200,channel=row)


def restore_alert_state(target, settings):
    saved=dict(settings['ops'])
    # Recipient was provisioned privately for this run, from an absent baseline.
    saved['email_to']=None
    columns=['enabled','email_to','last_sent_at','last_status','last_signature',
             'last_request_id','last_email_request_id','updated_at','repeat_after']
    names=','.join(columns)
    target.execute(f"""begin;
      update app_private.ops_alert_state set ({names})=(select {names}
        from jsonb_populate_record(null::app_private.ops_alert_state,{literal(saved)})) where id;
      delete from app_private.ops_alert_channels;
      insert into app_private.ops_alert_channels select * from jsonb_populate_recordset(
        null::app_private.ops_alert_channels,{literal(settings['channels'])}); commit;""",60)


def retire(target):
    target.execute(f"""begin;
      update app.fantasy_teams set status='archived' where fantasy_season_id='{SEASON}';
      update app.fantasy_seasons set status='completed' where id='{SEASON}' and name='Staging Alarm Drill 2';
      update app.seasons set status='completed' where id='{PREFIX}000000000003';
      update app.fantasy_competitions set active=false where id='{PREFIX}000000000004';
      update app.competitions set active=false where id='{PREFIX}000000000002';
      update app.fantasy_leagues set active=false where fantasy_season_id='{SEASON}';
      update app.fantasy_players set active=false where fantasy_season_id='{SEASON}';
      update app.players set active=false where id in(select football_player_id from app.fantasy_players where fantasy_season_id='{SEASON}');
      update app.teams set active=false where id in(select football_team_id from app.fantasy_players where fantasy_season_id='{SEASON}'); commit;""",90)


def cleanup(target, settings, before, fixture_started):
    errors=[]
    operations=[('functions_url_restore_failed',lambda: target.execute(
        f"update app_private.notification_email_settings set functions_base_url='{URL}' where id; select app_private.fantasy_worker_tick();",60)),
        ('alarm_state_restore_failed',lambda: restore_alert_state(target,settings))]
    if fixture_started:
        operations.append(('alarm_fixture_retirement_failed',lambda: retire(target)))
    for code,operation in operations:
        try:
            operation()
        except Exception:
            errors.append(code)
    try:
        unchanged=E.baseline(target)==before
    except Exception:
        unchanged=False
    errors.extend(E.restore(target,settings))
    E.report('alarm_restoration',oldBaselineUnchanged=unchanged,errors=errors)
    if errors or not unchanged:
        raise RuntimeError('staging_alarm_restoration_failed')


def main():
    ref=os.environ.get('SUPABASE_STAGING_PROJECT_REF','')
    R.validate_ref(ref)
    target=R.UPDATE.ManagementTarget(os.environ['SUPABASE_ACCESS_TOKEN'],ref)
    phase('migration_and_secret_names')
    if R.UPDATE.pending_migrations(R.UPDATE.load_migrations(),R.UPDATE.read_history(target)):
        raise RuntimeError('staging_alarm_pending_migrations')
    names={v['name'] for v in target._request('GET',f'/v1/projects/{ref}/secrets',None,60)}
    if 'RESEND_API_KEY' not in names or names & {'FANTASY_WORKER_BUDGET_MS','FANTASY_WORKER_MAX_GAMEWEEKS','FANTASY_WORKER_MAX_CALLS'}:
        raise RuntimeError('staging_alarm_runtime_configuration')
    phase('settings_metadata')
    settings=target.rows("""select
      (select jsonb_agg(jsonb_build_object('jobid',jobid,'active',active) order by jobid) from cron.job) as cron,
      (select enabled from app_private.rivals_settings) as rivals,
      (select to_jsonb(s) from app_private.ops_alert_state s) as ops,
      (select jsonb_agg(to_jsonb(c) order by channel) from app_private.ops_alert_channels c) as channels,
      (select functions_base_url from app_private.notification_email_settings) as functions_url,
      (select lifecycle_worker_interval_minutes from app_private.fantasy_automation_settings) as interval,
      (exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled or lifecycle_worker_enabled)
       or exists(select 1 from app_private.notification_email_settings where mode<>'off' or football_live_refresh_enabled)
       or exists(select 1 from app_private.notification_push_settings where mode<>'off')
       or exists(select 1 from app_private.ai_content_settings where enabled)
       or exists(select 1 from app_private.ai_home_story_settings where enabled)
       or exists(select 1 from app_private.ai_home_story_jobs where status='generating')
       or exists(select 1 from app_private.account_deletion_settings where enabled)
       or exists(select 1 from app_private.manager_card_settings where compute_enabled)
       or exists(select 1 from app_private.trophy_settings where enabled)
       or exists(select 1 from app_private.pepites_settings where mode<>'off')
       or exists(select 1 from app_private.prediction_settings where mode<>'off')
       or exists(select 1 from app.fantasy_prizes where active)
       or exists(select 1 from app.article_editions where status='scheduled')) as other_writers,
      exists(select 1 from vault.secrets where name='botolago_ops_alert_webhook') as webhook""")[0]
    if (settings['other_writers'] or settings['ops']['enabled'] or not settings['ops']['email_to']
        or settings['webhook'] or settings['functions_url']!=URL or settings['interval']!=10
        or any(c['pending_request_id'] is not None for c in settings['channels'])):
        raise RuntimeError('staging_alarm_preflight_refused')
    phase('health_read_preflight')
    health(target)
    E.wait_idle(target,30)
    phase('baseline')
    before=E.baseline(target)
    E.report('alarm_baseline',state=before,sourceSha=os.environ.get('GITHUB_SHA'),waitMinutes=90)
    paused=False
    fixture_started=False
    try:
        paused=True
        target.execute('select cron.alter_job(jobid,active:=false) from cron.job; select app_private.rivals_configure(false);',60)
        E.wait_idle(target,30)
        R.readiness(target)
        phase('fixture_rehearsal')
        fixture=(ROOT/'scripts/backend/staging-worker-alarm-fixture.sql').read_text()
        guarded=f"select set_config('botolago.release_drill','{ref}',false);\n"+fixture
        target.execute(guarded.rsplit('commit;',1)[0]+'rollback;',180)
        if E.baseline(target)!=before or target.rows(f"select exists(select 1 from app.fantasy_seasons where id='{SEASON}') as present")[0]['present']:
            raise RuntimeError('staging_alarm_rehearsal_changed_baseline')
        fixture_started=True
        phase('fixture_commit')
        target.execute(guarded,180)
        # A real disabled tick resets the counting clock through production code.
        phase('clock_reset')
        target.execute('select app_private.fantasy_worker_tick();',60)
        target.execute("""select app_private.fantasy_automation_configure(true);
          select app_private.fantasy_worker_configure(true);
          update app_private.notification_email_settings set functions_base_url=null where id;""",60)
        phase('missing_url_probe')
        if target.execute('select app_private.fantasy_worker_tick() as outcome',60)[0]['outcome']!='not_configured':
            raise RuntimeError('staging_alarm_missing_url_probe_failed')
        phase('alert_enable')
        target.execute(f"update app_private.notification_email_settings set functions_base_url='{URL}' where id; select app_private.ops_alert_configure(true);",60)
        phase('maintenance')
        maintenance(target)
        phase('initial_health')
        value=health(target)
        assert_health(value,'ok')
        if float(value['elapsed_minutes'])>2:
            raise RuntimeError('staging_alarm_clock_did_not_reset')
        if target.execute('select app_private.ops_alert_tick() as outcome',60)[0]['outcome']!='quiet':
            raise RuntimeError('staging_alarm_initial_notification_unexpected')
        E.report('alarm_clock_started',**value)
        warned=False
        while True:
            # A sleeping operator is not a second writer. No clock field is edited.
            time.sleep(60)
            maintenance(target)
            value=health(target)
            minutes=float(value['elapsed_minutes'])
            expected='fail' if minutes>=90 else 'warn' if minutes>=30 else 'ok'
            assert_health(value,expected)
            if expected=='warn' and not warned:
                if target.execute('select app_private.ops_alert_tick() as outcome',60)[0]['outcome']!='quiet':
                    raise RuntimeError('staging_alarm_warning_paged')
                E.report('worker_warning',**value)
                warned=True
            elif int(minutes)%10==0:
                E.report('alarm_clock_progress',elapsedMinutes=minutes,workerStatus=expected)
            if expected=='fail':
                E.report('worker_failure',**value)
                break
        if not warned:
            raise RuntimeError('staging_alarm_warning_not_observed')
        confirmed_alert(target,'sent','fail')
        scheduler=target.execute('select app_private.scheduler_token() as token',60)[0]['token']
        outcome=E.edge(target,scheduler)
        E.wait_idle(target)
        proof=E.progress(target)
        E.report('alarm_worker_recovery',response=outcome,progress=proof)
        if outcome.get('status')!='ok' or not expected_progress(proof):
            raise RuntimeError('staging_alarm_worker_recovery_incomplete')
        maintenance(target)
        value=health(target)
        assert_health(value,'ok')
        E.report('worker_recovered_health',**value)
        confirmed_alert(target,'sent_recovery',value['health']['status'])
        E.report('alarm_verdict',passed=True,warningObserved=True,failureObserved=True,recoveryObserved=True,
                 inboxReceipt='owner confirmation required')
    finally:
        if paused:
            # If a writer cannot settle, do not release the window to cron.
            target.execute('select app_private.fantasy_automation_configure(false); select app_private.fantasy_worker_configure(false); select app_private.ops_alert_configure(false);',60)
            E.wait_idle(target)
            cleanup(target,settings,before,fixture_started)


if __name__=='__main__':
    try:
        main()
    except Exception as error:
        code=str(error) if type(error) is RuntimeError and str(error).startswith('staging_alarm_') else 'staging_alarm_failed'
        E.report('alarm_error',code=code,errorType=type(error).__name__,**error_metadata(error))
        sys.exit(1)
