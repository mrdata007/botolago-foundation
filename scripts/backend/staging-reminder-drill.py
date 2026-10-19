#!/usr/bin/env python3
"""One staging writer: real-clock reminder windows and response-loss recovery.

Owners arrive through a protected secret. No address, token or key is logged.
Existing timestamps/deadlines are never moved. This does not claim UI or inbox
receipt: the owner must independently confirm those after the provider accepts.
"""
from __future__ import annotations
import importlib.util
import ipaddress
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT=Path(__file__).resolve().parents[2]
SPEC=importlib.util.spec_from_file_location('reminder_alarm_support',ROOT/'scripts/backend/staging-worker-alarm-drill.py')
A=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(A)
R=A.R
E=A.E
PREFIX='f9700000-0000-4000-8000-'
SEASON=PREFIX+'000000000005'
GW=PREFIX+'000000000021'
NEXT=PREFIX+'000000000022'
MATCH=PREFIX+'000000003020'
LATER=PREFIX+'000000003021'
E.PREFIX,E.SEASON,E.GW=PREFIX,SEASON,GW


def report(kind,**data):
    print(json.dumps({'kind':kind,**data}),flush=True)


def validate_origin(value):
    try:
        parsed=urllib.parse.urlsplit(value)
        address=ipaddress.ip_address(parsed.hostname or '')
        private=any(address in ipaddress.ip_network(block) for block in ('10.0.0.0/8','172.16.0.0/12','192.168.0.0/16'))
        valid=(address.version==4 and private and not address.is_loopback
               and not address.is_link_local and not address.is_unspecified
               and parsed.scheme=='https' and parsed.port==8443
               and not parsed.username and not parsed.password
               and parsed.path in ('','/') and not parsed.query and not parsed.fragment)
    except ValueError:
        valid=False
    if not valid:
        raise RuntimeError('staging_reminder_private_https_origin_required')
    return f'https://{address}:8443'


def owner_ids(value):
    ids=json.loads(value)
    if not isinstance(ids,list) or len(ids)!=2:
        raise RuntimeError('staging_reminder_two_owners_required')
    result=[str(uuid.UUID(v)) for v in ids]
    if len(set(result))!=2:
        raise RuntimeError('staging_reminder_distinct_owners_required')
    return result


def sql_ids(ids):
    return ','.join("'"+v+"'::uuid" for v in ids)


def retire(target):
    target.execute(f"""begin;
      update app.fantasy_teams set status='archived' where fantasy_season_id='{SEASON}';
      update app.notification_subscriptions set enabled=false where fixture_id in('{MATCH}','{LATER}');
      update app.fantasy_seasons set status='completed' where id='{SEASON}' and name='Staging Reminder Drill';
      update app.seasons set status='completed',is_current=false where id='{PREFIX}000000000003';
      update app.fantasy_competitions set active=false where id='{PREFIX}000000000004';
      update app.competitions set active=false where id='{PREFIX}000000000002';
      update app.fantasy_leagues set active=false where fantasy_season_id='{SEASON}';
      update app.fantasy_players set active=false where fantasy_season_id='{SEASON}';
      update app.players set active=false where id in(select football_player_id from app.fantasy_players where fantasy_season_id='{SEASON}');
      update app.teams set active=false where id in(select football_team_id from app.fantasy_players where fantasy_season_id='{SEASON}');
      commit;""",90)


def evidence(target,ids):
    # Only synthetic entity ids and aggregate counts are public. Owner ids stay private.
    return target.rows(f"""select e.event_type::text as type,e.source_entity_id::text as source,
      count(distinct e.id)::int as events,
      count(distinct n.id) filter(where n.user_id='{ids[0]}')::int as positive_notifications,
      count(distinct n.id) filter(where n.user_id='{ids[1]}')::int as negative_notifications,
      count(distinct d.id) filter(where n.user_id='{ids[0]}' and d.channel='email' and d.status='sent')::int as sent,
      count(distinct d.id) filter(where n.user_id='{ids[0]}' and d.channel='in_app' and d.status='delivered')::int as inbox,
      max(d.sent_at) filter(where d.channel='email') as sent_at,
      max(e.occurred_at) as occurred_at,
      case when e.event_type='match_starting' then
        extract(epoch from ((select kickoff_at from app.fixtures where id=e.source_entity_id)-max(e.occurred_at)))/60
      when e.event_type='deadline_24h' then
        extract(epoch from ((select deadline_at from app.fantasy_gameweeks where id=e.source_entity_id)-max(e.occurred_at)))/60
      end as minutes_before
      from app_private.notification_events e
      left join app.notifications n on n.event_id=e.id
      left join app.notification_deliveries d on d.notification_id=n.id
      where e.source_entity_id in('{GW}','{NEXT}','{MATCH}','{LATER}')
      group by e.event_type,e.source_entity_id order by e.event_type,e.source_entity_id""")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args):
        return None


def unsubscribe_request(token,method):
    url=f'https://{R.REF}.supabase.co/functions/v1/notification-email-unsubscribe?'+urllib.parse.urlencode({'token':token})
    request=urllib.request.Request(url,method=method,
        data=b'List-Unsubscribe=One-Click' if method=='POST' else None,
        headers={'Content-Type':'application/x-www-form-urlencoded'})
    try:
        with urllib.request.build_opener(NoRedirect()).open(request,timeout=30) as response:
            return response.status,response.headers.get('Location'),json.load(response)
    except urllib.error.HTTPError as error:
        if error.code==303:
            return 303,error.headers.get('Location'),None
        raise RuntimeError('staging_reminder_unsubscribe_endpoint_failed') from None


def restore(target,settings,ids,before,fixture_started,secrets_added):
    errors=[]
    try:
        target.execute("select app_private.notification_email_configure('off'); select app_private.fantasy_automation_configure(false); select app_private.fantasy_worker_configure(false);",60)
        E.wait_idle(target)
    except Exception:
        # A still-active writer must not be overlapped by retirement or cron.
        raise RuntimeError('staging_reminder_writer_not_settled') from None
    operations=[]
    if fixture_started:
        operations.append(('fixture_retirement',lambda: retire(target)))
    email=settings['email']
    columns=[k for k in email if k not in ('id','updated_at')]
    operations.append(('email_restore',lambda: target.execute(
        'update app_private.notification_email_settings s set '+','.join(f'{c}=v.{c}' for c in columns)+
        f' from jsonb_populate_record(null::app_private.notification_email_settings,{A.literal(email)}) v where s.id;',60)))
    for pref in settings['preferences']:
        cols=[k for k in pref if k not in ('user_id','created_at','updated_at')]
        operations.append(('preference_restore',lambda pref=pref,cols=cols: target.execute(
            'update app.user_preferences p set '+','.join(f'{c}=v.{c}' for c in cols)+
            f' from jsonb_populate_record(null::app.user_preferences,{A.literal(pref)}) v where p.user_id=v.user_id;',60)))
    for profile in settings['profiles']:
        operations.append(('language_restore',lambda profile=profile: target.execute(
            f"update app.profiles set preferred_language='{profile['preferred_language']}' where id='{profile['id']}'",60)))
    if secrets_added:
        operations.append(('runtime_overrides_restore',lambda: target._request('DELETE',f'/v1/projects/{R.REF}/secrets',['APP_URL','EMAIL_FROM'],60)))
    operations.append(('news_heartbeat_restore',lambda: target.execute('select app_private.news_publish_due_editions(); select app_private.news_sitemap_refresh();',60)))
    for name,operation in operations:
        try:
            operation()
        except Exception:
            errors.append(name)
    try:
        unchanged=E.baseline(target)==before
        current=target.rows(f"select to_jsonb(p)-'updated_at' as p from app.user_preferences p where user_id in ({sql_ids(ids)}) order by user_id")
        expected=sorted(({k:v for k,v in p.items() if k!='updated_at'} for p in settings['preferences']),key=lambda p:p['user_id'])
        prefs_restored=[r['p'] for r in current]==expected
        profiles=target.rows(f"select id,preferred_language from app.profiles where id in ({sql_ids(ids)}) order by id")
        profiles_restored=profiles==sorted(settings['profiles'],key=lambda p:p['id'])
        email_now=target.rows("select to_jsonb(s)-'updated_at' as state from app_private.notification_email_settings s")[0]['state']
        email_restored=email_now=={k:v for k,v in email.items() if k!='updated_at'}
        remaining={v['name'] for v in target._request('GET',f'/v1/projects/{R.REF}/secrets',None,60)}
        overrides_restored=not bool(remaining & {'APP_URL','EMAIL_FROM'})
    except Exception:
        unchanged=prefs_restored=profiles_restored=email_restored=overrides_restored=False
    errors.extend(E.restore(target,settings))
    report('reminder_restoration',oldBaselineUnchanged=unchanged,preferencesRestored=prefs_restored,
           languagesRestored=profiles_restored,emailSettingsRestored=email_restored,
           runtimeOverridesRemoved=overrides_restored,errors=errors)
    if errors or not all((unchanged,prefs_restored,profiles_restored,email_restored,overrides_restored)):
        raise RuntimeError('staging_reminder_restoration_failed')
    target.execute('delete from app_private.staging_reminder_recovery where id',60)


def main():
    ref=os.environ.get('SUPABASE_STAGING_PROJECT_REF','')
    R.validate_ref(ref)
    if os.environ.get('ACTION') not in ('run','reminderrecover'):
        raise RuntimeError('staging_reminder_action_refused')
    origin=validate_origin(os.environ.get('STAGING_APP_ORIGIN',''))
    target=R.UPDATE.ManagementTarget(os.environ['SUPABASE_ACCESS_TOKEN'],ref)
    supplied=os.environ.get('STAGING_QA_OWNER_IDS','')
    if supplied:
        ids=owner_ids(supplied)
    else:
        handoff=target.execute("select decrypted_secret as ids from vault.decrypted_secrets where name='botolago_staging_qa_owner_ids'",60)
        if len(handoff)!=1:
            raise RuntimeError('staging_reminder_private_owner_handoff_required')
        ids=owner_ids(handoff[0]['ids'])
    if os.environ.get('ACTION')=='reminderrecover':
        saved=target.execute('select state from app_private.staging_reminder_recovery where id',60)
        if len(saved)!=1 or saved[0]['state']['ids']!=ids:
            raise RuntimeError('staging_reminder_recovery_context_required')
        state=saved[0]['state']
        target.execute('select cron.alter_job(jobid,active:=false) from cron.job; select app_private.rivals_configure(false);',60)
        restore(target,state['settings'],ids,state['before'],True,True)
        return
    names={v['name'] for v in target._request('GET',f'/v1/projects/{ref}/secrets',None,60)}
    if 'RESEND_API_KEY' not in names or names & {'APP_URL','EMAIL_FROM','FANTASY_WORKER_BUDGET_MS','FANTASY_WORKER_MAX_CALLS','FANTASY_WORKER_MAX_GAMEWEEKS'}:
        raise RuntimeError('staging_reminder_runtime_baseline_refused')
    settings=target.rows(f"""select
      (select jsonb_agg(jsonb_build_object('jobid',jobid,'active',active) order by jobid) from cron.job) as cron,
      (select enabled from app_private.rivals_settings) as rivals,
      (select to_jsonb(s) from app_private.notification_email_settings s) as email,
      (select jsonb_agg(to_jsonb(p) order by user_id) from app.user_preferences p where user_id in ({sql_ids(ids)})) as preferences,
      (select jsonb_agg(jsonb_build_object('id',id,'preferred_language',preferred_language) order by id) from app.profiles where id in ({sql_ids(ids)})) as profiles,
      (exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled or lifecycle_worker_enabled)
       or exists(select 1 from app_private.notification_email_settings where mode<>'off' or football_live_refresh_enabled or provider_paused_until is not null)
       or exists(select 1 from app_private.notification_push_settings where mode<>'off')
       or exists(select 1 from app_private.ops_alert_state where enabled)
       or exists(select 1 from app_private.ai_content_settings where enabled)
       or exists(select 1 from app_private.ai_home_story_settings where enabled)
       or exists(select 1 from app_private.ai_home_story_jobs where status='generating')
       or exists(select 1 from app_private.account_deletion_settings where enabled)
       or exists(select 1 from app_private.manager_card_settings where compute_enabled)
       or exists(select 1 from app_private.trophy_settings where enabled)
       or exists(select 1 from app_private.pepites_settings where mode<>'off')
       or exists(select 1 from app_private.prediction_settings where mode<>'off')
       or exists(select 1 from app.fantasy_prizes where active)
       or exists(select 1 from app.article_editions where status='scheduled')) as other_writers""")[0]
    if settings['other_writers'] or len(settings['preferences'] or [])!=2 or len(settings['profiles'] or [])!=2:
        raise RuntimeError('staging_reminder_preflight_refused')
    pending=R.UPDATE.pending_migrations(R.UPDATE.load_migrations(),R.UPDATE.read_history(target))
    if pending:
        raise RuntimeError('staging_reminder_pending_migrations')
    E.wait_idle(target,30)
    before=E.baseline(target)
    report('reminder_source',source=os.environ.get('GITHUB_SHA','unknown'),staging=True,extraSpending=0)
    paused=fixture_started=secrets_added=drill_passed=False
    # Owner-only durable recovery survives runner cancellation. It contains
    # settings and QA ids, never credentials; no public artifact is uploaded.
    state={'settings':settings,'ids':ids,'before':before,'origin':origin}
    target.execute(f"""begin; create table if not exists app_private.staging_reminder_recovery(
      id boolean primary key default true check(id), state jsonb not null);
      alter table app_private.staging_reminder_recovery enable row level security;
      revoke all on app_private.staging_reminder_recovery from public,anon,authenticated,service_role;
      insert into app_private.staging_reminder_recovery(id,state) values(true,{A.literal(state)});
      select cron.alter_job(jobid,active:=false) from cron.job;
      select app_private.rivals_configure(false); commit;""",60)
    paused=True
    try:
        E.wait_idle(target,30)
        R.readiness(target)
        fixture=(ROOT/'scripts/backend/staging-reminder-fixture.sql').read_text()
        if not fixture.endswith('commit;\n'):
            raise RuntimeError('staging_reminder_transaction_boundary_changed')
        guarded=f"select set_config('botolago.release_drill','{ref}',false); select set_config('botolago.qa_owner_ids',{A.literal(ids)}::text,false);\n"+fixture
        target.execute(guarded.removesuffix('commit;\n')+'rollback;',180)
        if E.baseline(target)!=before or target.rows(f"select exists(select 1 from app.fantasy_seasons where id='{SEASON}') as present")[0]['present']:
            raise RuntimeError('staging_reminder_rollback_failed')
        fixture_started=True
        target.execute(guarded,180)
        secrets_added=True
        target._request('POST',f'/v1/projects/{ref}/secrets',[
            {'name':'APP_URL','value':origin},
            {'name':'EMAIL_FROM','value':'BotolaGO STAGING <notifications@botolago.com>'}],60)
        status,location,_=unsubscribe_request('x'*32,'GET')
        if status!=303 or not location or not location.startswith(origin+'/unsubscribe?'):
            raise RuntimeError('staging_reminder_link_origin_not_active')
        target.execute(f"""begin;
          update app.user_preferences set notifications_enabled=true,in_app_notifications_enabled=true,
            push_notifications_enabled=false,email_notifications_enabled=(user_id='{ids[0]}'),
            match_alerts=true,fantasy_deadline_reminders=true where user_id in ({sql_ids(ids)});
          update app.profiles set preferred_language='fr' where id='{ids[0]}';
          insert into app.notification_subscriptions(user_id,kind,fixture_id,enabled)
          select u,'match',f,true from unnest(array[{sql_ids(ids)}]) u
          cross join unnest(array['{MATCH}'::uuid,'{LATER}'::uuid]) f;
          select app_private.notification_email_configure('test','https://{ref}.supabase.co/functions/v1',array[{sql_ids(ids)}],false);
          update app_private.notification_email_settings set activated_at=statement_timestamp() where id;
          commit;""",60)
        clocks=target.rows(f"select now() as activated_at,(select deadline_at from app.fantasy_gameweeks where id='{NEXT}') as deadline,(select kickoff_at from app.fixtures where id='{MATCH}') as kickoff")[0]
        report('reminder_clock_started',**clocks,ownerCount=2,negativeEmailOff=True)
        keys=target._request('GET',f'/v1/projects/{ref}/api-keys',None,60)
        key=next(k['api_key'] for k in keys if k.get('name')=='service_role')
        child_env={k:v for k,v in os.environ.items() if k in ('PATH','HOME','LANG')}
        child_env.update(STAGING_DRILL_URL=f'https://{ref}.supabase.co',STAGING_DRILL_SERVICE_KEY=key)
        child=subprocess.run(['bun','scripts/backend/staging-response-loss-drill.ts'],cwd=ROOT,env=child_env,capture_output=True,text=True,timeout=900)
        for line in child.stdout.splitlines():
            if line.startswith('{"kind":'):
                print(line,flush=True)
        if child.returncode:
            raise RuntimeError('staging_reminder_scoring_recovery_failed')
        proof=E.progress(target)
        if not (proof['status']=='finalized' and proof['finalized']==2 and proof['correct_results']==2
                and proof['rankings']>=8 and proof['rollovers']==2 and proof['next_lineups']==2
                and proof['postwork'] and proof['advanced']):
            raise RuntimeError('staging_reminder_score_proof_failed')
        report('reminder_independent_score_proof',**proof)
        payloads=target.rows(f"select count(*)::int as events,count(*) filter(where (safe_payload->>'points')::numeric=96)::int as correct from app_private.notification_events where event_type='gameweek_finalized' and source_entity_id='{GW}'")[0]
        if payloads!={'events':2,'correct':2}:
            raise RuntimeError('staging_reminder_recap_points_mismatch')
        until=time.monotonic()+100*60
        unsubscribed=False
        recap_fr=False
        while True:
            target.execute('select app_private.notification_email_tick()',60)
            rows=evidence(target,ids)
            report('reminder_observation',evidence=rows)
            if any(r['negative_notifications'] for r in rows):
                raise RuntimeError('staging_reminder_email_off_audience_leak')
            by_key={(r['type'],r['source']):r for r in rows}
            recap=by_key.get(('gameweek_finalized',GW))
            if recap and recap['sent']==1 and not recap_fr:
                target.execute(f"update app.profiles set preferred_language='ar' where id='{ids[0]}'",60)
                recap_fr=True
            required=[by_key.get(('gameweek_finalized',GW)),by_key.get(('deadline_24h',NEXT)),by_key.get(('match_starting',MATCH))]
            if all(r and r['positive_notifications']==1 and r['sent']==1 and r['inbox']==1 for r in required) and not unsubscribed:
                if [r['events'] for r in required]!=[2,1,1]:
                    raise RuntimeError('staging_reminder_duplicate_event')
                if not 10<float(required[2]['minutes_before'])<=65 or not 1435<=float(required[1]['minutes_before'])<=1440:
                    raise RuntimeError('staging_reminder_real_window_missed')
                token=target.execute(f"select app_private.notification_email_unsubscribe_token(d.id) as token from app.notification_deliveries d join app.notifications n on n.id=d.notification_id where n.user_id='{ids[0]}' and n.notification_type='match_starting' and n.source_entity_id='{MATCH}' and d.channel='email' and d.status='sent'",60)[0]['token']
                status,location,_=unsubscribe_request(token,'GET')
                still_on=target.rows(f"select email_notifications_enabled as email_enabled from app.user_preferences where user_id='{ids[0]}'")[0]['email_enabled']
                if status!=303 or not still_on or not location or not location.startswith(origin+'/unsubscribe?'):
                    raise RuntimeError('staging_reminder_link_scanner_mutated_or_wrong_origin')
                status,_,body=unsubscribe_request(token,'POST')
                status2,_,body2=unsubscribe_request(token,'POST')
                del token
                if status!=200 or body.get('status')!='unsubscribed' or status2!=200 or body2.get('status')!='already_unsubscribed':
                    raise RuntimeError('staging_reminder_unsubscribe_failed')
                unsubscribed=True
                report('reminder_unsubscribed',getDidNotMutate=True,postPassed=True,repeatedPostIdempotent=True)
            later=by_key.get(('match_starting',LATER))
            if unsubscribed and later:
                if (later['positive_notifications'] or later['sent'] or later['negative_notifications']
                    or not 10<float(later['minutes_before'])<=65):
                    raise RuntimeError('staging_reminder_unsubscribe_negative_failed')
                # Repeat genuine planner/fan-out passes to verify no duplicates.
                snapshot=rows
                target.execute('select app_private.notification_email_tick(); select app_private.notification_email_tick();',60)
                if evidence(target,ids)!=snapshot:
                    raise RuntimeError('staging_reminder_duplicate_delivery')
                report('reminder_verdict',passed=True,realClockWindows=True,inboxReceipt='owner confirmation required',uiChecks='owner device pending')
                drill_passed=True
                break
            if time.monotonic()>until:
                raise RuntimeError('staging_reminder_window_or_delivery_timeout')
            time.sleep(45)
    finally:
        if paused:
            # Keep a successful world visible for the owner's email/UI comparison.
            # Failed/partial worlds are retired. Sending and all settings still
            # return to baseline in either case; retirement follows owner review.
            restore(target,settings,ids,before,fixture_started and not drill_passed,secrets_added)
            report('reminder_fixture_handoff',retainedForOwnerUi=drill_passed)


if __name__=='__main__':
    try:
        main()
    except Exception as error:
        value=str(error)
        code=value if type(error) is RuntimeError and value.startswith('staging_reminder_') else 'staging_reminder_failed'
        report('reminder_error',code=code,errorType=type(error).__name__,**A.error_metadata(error))
        raise SystemExit(1)
