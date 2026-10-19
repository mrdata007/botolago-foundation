#!/usr/bin/env python3
"""Real, bounded Edge passes followed by the scoped operator fallback.

One protected staging writer owns setup, probes and retirement. Neither clocks,
Edge budgets nor database timeout settings are changed. The old f950 evidence
fixture is never reopened. Credentials remain in process memory.
"""
from __future__ import annotations
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('edge_runtime_setup', ROOT / 'scripts/backend/staging-release-runtime.py')
R = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)
PREFIX = 'f9510000-0000-4000-8000-'
SEASON = PREFIX + '000000000005'
GW = PREFIX + '000000000021'


def report(kind, **data):
    print(json.dumps({'kind': kind, **data}), flush=True)


def baseline(target):
    return target.rows(f"""select jsonb_build_object(
      'users',(select count(*) from auth.users),
      'oldTeams',(select md5(string_agg(to_jsonb(t)::text,'' order by id)) from app.fantasy_teams t where fantasy_season_id<>'{SEASON}'),
      'oldResults',(select md5(string_agg(to_jsonb(r)::text,'' order by id)) from app.fantasy_team_gameweek_results r where gameweek_id not in ('{GW}','{PREFIX}000000000022')),
      'oldGameweeks',(select md5(string_agg(to_jsonb(g)::text,'' order by id)) from app.fantasy_gameweeks g where fantasy_season_id<>'{SEASON}')) as state""")[0]['state']


def wait_idle(target, deadline_seconds=480):
    until = time.monotonic() + deadline_seconds
    while True:
        busy = target.rows("""select exists(select 1 from app_private.fantasy_worker_lease where released_at is null and expires_at>now())
          or exists(select 1 from pg_stat_activity where backend_type='client backend' and pid<>pg_backend_pid() and state<>'idle') as busy""")[0]['busy']
        if not busy:
            return
        if time.monotonic() >= until:
            raise RuntimeError('staging_edge_writer_did_not_settle')
        time.sleep(5)


def progress(target):
    return target.rows(f"""select
      (select status from app.fantasy_gameweeks where id='{GW}') as status,
      (select count(*) from app.fantasy_team_gameweek_results where gameweek_id='{GW}') as scored,
      (select fantasy_team_id::text from app.fantasy_team_gameweek_results where gameweek_id='{GW}' order by fantasy_team_id desc limit 1) as last_team,
      (select count(*) from app.fantasy_team_gameweek_results where gameweek_id='{GW}' and state='final') as finalized,
      (select count(*) from app.fantasy_rankings where fantasy_season_id='{SEASON}') as rankings,
      (select count(*) from app.fantasy_team_gameweek_results where gameweek_id='{GW}' and state='final' and final_score=96 and bench_points=32) as correct_results,
      (select count(*) from app_private.fantasy_free_transfer_rollovers where gameweek_id='{GW}') as rollovers,
      (select count(*) from app.fantasy_lineups where gameweek_id='{PREFIX}000000000022') as next_lineups,
      exists(select 1 from app_private.fantasy_gameweek_postwork w join app.fantasy_gameweeks g on g.id=w.gameweek_id
        where g.id='{GW}' and w.calculation_version=g.scoring_input_version and w.completed_at is not null) as postwork,
      exists(select 1 from app_private.fantasy_gameweek_progressions where previous_gameweek_id='{GW}'
        and next_gameweek_id='{PREFIX}000000000022' and opened_at is not null) as advanced""")[0]


def complete(value):
    return (value['status']=='finalized' and value['finalized']==5000
        and value['correct_results']==5000 and value['rankings']==61900
        and value['rollovers']==5000 and value['next_lineups']==5000
        and value['postwork'] and value['advanced'])


def edge(target, scheduler):
    request = urllib.request.Request(f'https://{R.REF}.supabase.co/functions/v1/fantasy-lifecycle-worker',
        data=b'{"job":"lifecycle"}', headers={'Content-Type':'application/json','x-botolago-scheduler-token':scheduler})
    began = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=160) as response:
            status, body = response.status, json.load(response)
    except urllib.error.HTTPError as error:
        status = error.code
        try:
            body = json.load(error)
        except (ValueError, UnicodeDecodeError):
            body = {}
    except (TimeoutError, urllib.error.URLError):
        status, body = None, {}
    # Never print response payloads or exception bodies. Only the handler's
    # stable outcome fields; independently query durable progress after quiescence.
    return {'httpStatus':status,'elapsedMs':round((time.monotonic()-began)*1000),
            **{k:body[k] for k in ('status','workerCode','recorded','calls') if k in body}}


def restore(target, settings):
    errors = []
    for job in settings['cron']:
        try:
            target.execute(f"select cron.alter_job({int(job['jobid'])},active:={str(job['active']).lower()})",60)
        except Exception:
            errors.append('cron_restore_failed')
    try:
        target.execute(f"select app_private.rivals_configure({str(settings['rivals']).lower()})",60)
    except Exception:
        errors.append('rivals_restore_failed')
    actual = target.rows("select jobid,active from cron.job order by jobid")
    rivals = target.rows('select enabled from app_private.rivals_settings')[0]['enabled']
    if actual != settings['cron'] or rivals != settings['rivals']:
        errors.append('restoration_mismatch')
    return errors


def cleanup(target, settings, before, fixture_started):
    # Called only after the worker switches are off and all leases/writes settle.
    errors = []
    try:
        if fixture_started:
            target.execute(f"""begin; set local lock_timeout='10s';
            update app.fantasy_teams set status='archived' where fantasy_season_id='{SEASON}';
            update app.fantasy_seasons set status='completed' where id='{SEASON}' and name='Staging Edge Drill 5000';
            update app.seasons set status='completed' where id='{PREFIX}000000000003';
            update app.fantasy_competitions set active=false where id='{PREFIX}000000000004';
            update app.competitions set active=false where id='{PREFIX}000000000002';
            update app.fantasy_leagues set active=false where fantasy_season_id='{SEASON}';
            update app.fantasy_players set active=false where fantasy_season_id='{SEASON}';
            update app.players set active=false where id in (select football_player_id from app.fantasy_players where fantasy_season_id='{SEASON}');
            update app.teams set active=false where id in (select football_team_id from app.fantasy_players where fantasy_season_id='{SEASON}'); commit;""",180)
    except Exception:
        errors.append('fixture_retirement_failed')
    finally:
        # A failed retirement must not prevent restoring the original schedules.
        try:
            unchanged = baseline(target) == before
        except Exception:
            unchanged = False
        errors.extend(restore(target, settings))
        report('restoration', oldBaselineUnchanged=unchanged, errors=errors)
    if errors or not unchanged:
        raise RuntimeError('staging_edge_restoration_failed')


def main():
    ref = os.environ.get('SUPABASE_STAGING_PROJECT_REF','')
    R.validate_ref(ref)
    target = R.UPDATE.ManagementTarget(os.environ['SUPABASE_ACCESS_TOKEN'],ref)
    secret_names = {x['name'] for x in target._request('GET',f'/v1/projects/{ref}/secrets',None,60)}
    if secret_names & {'FANTASY_WORKER_BUDGET_MS','FANTASY_WORKER_MAX_GAMEWEEKS','FANTASY_WORKER_MAX_CALLS'}:
        raise RuntimeError('staging_edge_runtime_limits_overridden')
    if R.UPDATE.pending_migrations(R.UPDATE.load_migrations(),R.UPDATE.read_history(target)):
        raise RuntimeError('staging_edge_migrations_pending')
    disk = target.free_disk_gb()
    if disk is None or disk < 5:
        raise RuntimeError('staging_edge_disk_guard')
    settings = target.rows("""select
      (select jsonb_agg(jsonb_build_object('jobid',jobid,'active',active) order by jobid) from cron.job) as cron,
      (select enabled from app_private.rivals_settings) as rivals,
      (exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled or lifecycle_worker_enabled)
       or exists(select 1 from app_private.notification_email_settings where mode<>'off' or football_live_refresh_enabled)
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
       or exists(select 1 from app.fantasy_prizes where active)) as other_writers""")[0]
    if settings['other_writers']:
        raise RuntimeError('staging_edge_writer_guard')
    wait_idle(target,30)
    before = baseline(target)
    report('baseline',state=before,settings=settings,freeDiskGb=disk,
           sourceSha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip())
    paused = False
    fixture_started = False
    outcomes = []
    try:
        # Set before the first call: an HTTP failure can still mean this write committed.
        paused = True
        target.execute('select cron.alter_job(jobid,active:=false) from cron.job; select app_private.rivals_configure(false);',60)
        wait_idle(target,30)
        R.readiness(target)
        fixture = (ROOT/'scripts/backend/staging-edge-5000-fixture.sql').read_text()
        guarded = f"select set_config('botolago.release_drill','{ref}',false);\n" + fixture
        target.execute(guarded.rsplit('commit;',1)[0]+'rollback;',180)
        if baseline(target) != before or target.rows(f"select exists(select 1 from app.fantasy_seasons where id='{SEASON}') as present")[0]['present']:
            raise RuntimeError('staging_edge_rehearsal_changed_baseline')
        fixture_started = True
        target.execute(guarded,180)
        selected = target.rows("select id from app.fantasy_seasons where status in ('planned','registration_open','active') order by created_at desc limit 1")[0]['id']
        if selected != SEASON:
            raise RuntimeError('staging_edge_discovery_scope_refused')
        scheduler = target.execute('select app_private.scheduler_token() as token',60)[0]['token']
        target.execute('select app_private.fantasy_automation_configure(true); select app_private.fantasy_worker_configure(true);',60)
        for number in (1,2):
            outcome = edge(target,scheduler)
            wait_idle(target)
            outcome['progress'] = progress(target)
            outcomes.append(outcome)
            report('real_edge_pass',number=number,**outcome)
            if complete(outcome['progress']):
                break
        target.execute('select app_private.fantasy_automation_configure(false); select app_private.fantasy_worker_configure(false);',60)
        if not complete(outcomes[-1]['progress']):
            # Same production lifecycle, scoped to f951; unchanged 20-minute
            # operator budget. A fallback success does not turn an Edge failure green.
            child = subprocess.run([sys.executable,str(ROOT/'scripts/backend/staging-5000-rating-drill.py')],
                cwd=ROOT,env={**os.environ,'STAGING_DRILL_FIXTURE':'edge-runtime'},
                capture_output=True,text=True,timeout=1500)
            for line in child.stdout.splitlines():
                if line.startswith('{"kind":'):
                    print(line,flush=True)
            if child.returncode:
                raise RuntimeError('staging_edge_operator_fallback_failed')
        proof = progress(target)
        report('worker_runtime_verdict',edgeCompleted=any(complete(x['progress']) for x in outcomes),
            edgeProgressed=(len(outcomes)<2 or outcomes[0]['progress']!=outcomes[1]['progress']),
            fallbackCompleted=complete(proof),progress=proof)
        if not complete(proof):
            raise RuntimeError('staging_edge_completion_proof_failed')
    finally:
        if paused:
            target.execute('select app_private.fantasy_automation_configure(false); select app_private.fantasy_worker_configure(false);',60)
            # A killed Edge instance may have left a write or lease behind.
            # Fail closed and leave cron paused if we cannot establish quiescence.
            wait_idle(target)
            cleanup(target,settings,before,fixture_started)
    return 0 if outcomes and any(complete(x['progress']) for x in outcomes) else 2


if __name__=='__main__':
    try:
        sys.exit(main())
    except Exception as error:
        report('failure',errorType=type(error).__name__,code=str(error) if str(error).startswith('staging_') else 'staging_edge_drill_failed')
        sys.exit(1)
