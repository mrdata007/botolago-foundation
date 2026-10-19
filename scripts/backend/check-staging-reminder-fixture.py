#!/usr/bin/env python3
"""Local Docker-only fixture/planner contract; no real-clock or inbox claim."""
from pathlib import Path
import json
import os
import re
import subprocess

ROOT=Path(__file__).resolve().parents[2]
CONTAINER='supabase_db_botolago-production-v2'
OWNERS=['f9710000-0000-4000-8000-000000000001','f9710000-0000-4000-8000-000000000002']


def query(sql):
    result=subprocess.run(['docker','exec','-i',CONTAINER,'psql','-X','-q','-A','-t','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input=sql,capture_output=True,text=True,timeout=180)
    if result.returncode:
        raise RuntimeError('local_reminder_fixture_failed: '+result.stderr[-1500:])
    return result.stdout.strip().splitlines()


def main():
    if os.environ.get('DOCKER_HOST','') not in ('','unix:///var/run/docker.sock') or os.environ.get('DOCKER_CONTEXT','') not in ('','default'):
        raise RuntimeError('reminder_remote_docker_refused')
    baseline="select jsonb_build_object('users',(select count(*) from auth.users),'teams',(select count(*) from app.fantasy_teams),'events',(select count(*) from app_private.notification_events))"
    before=query(baseline)[-1]
    source=(ROOT/'scripts/backend/staging-reminder-fixture.sql').read_text()
    if not source.endswith('commit;\n'):
        raise RuntimeError('reminder_transaction_boundary_changed')
    source=re.sub(r'(?m)^begin;\s*$','',source,count=1).removesuffix('commit;\n')
    setup="""begin;
      select cron.alter_job(jobid,active:=false) from cron.job;
      select app_private.rivals_configure(false);
      select set_config('botolago.release_drill','srdrflfrfpwixsllveid',true);
      select set_config('botolago.qa_owner_ids','OWNER_IDS',true);
      insert into app.countries(id,iso_alpha2,iso_alpha3)
        values('f9710000-0000-4000-8000-000000000010','MA','MAR') on conflict do nothing;
      insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,encrypted_password,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
        'reminder-owner-'||n||'@example.invalid',now(),'',
        '{"provider":"email","providers":["email"]}',jsonb_build_object('username','reminder_owner_'||n),now(),now()
      from (values(1,'f9710000-0000-4000-8000-000000000001'::uuid),
                  (2,'f9710000-0000-4000-8000-000000000002'::uuid)) owners(n,id);
      insert into app.profiles(id,display_name)
      select id,'Reminder QA '||n from (values(1,'f9710000-0000-4000-8000-000000000001'::uuid),
                  (2,'f9710000-0000-4000-8000-000000000002'::uuid)) owners(n,id) on conflict(id) do nothing;
    """.replace('OWNER_IDS',json.dumps(OWNERS))
    proof="""
      do $$ begin
        if (select count(*) from app.fantasy_teams where fantasy_season_id='f9700000-0000-4000-8000-000000000005')<>2
        or (select count(*) from app.fantasy_squad_memberships where fantasy_team_id in
          ('f9700000-0000-4000-8000-000000010001','f9700000-0000-4000-8000-000000010002'))<>30
        or (select deadline_at-now() from app.fantasy_gameweeks where id='f9700000-0000-4000-8000-000000000022')<>interval '25 hours'
        or (select kickoff_at-now() from app.fixtures where id='f9700000-0000-4000-8000-000000003020')<>interval '125 minutes'
        then raise exception 'reminder_fixture_contract_failed'; end if;
      end $$;
      insert into app.notification_subscriptions(user_id,kind,fixture_id,enabled)
      values('f9710000-0000-4000-8000-000000000001','match','f9700000-0000-4000-8000-000000003020',true);
      select app_private.notification_email_plan(statement_timestamp());
      do $$ begin
        if exists(select 1 from app_private.notification_events where source_entity_id in
          ('f9700000-0000-4000-8000-000000000022','f9700000-0000-4000-8000-000000003020'))
        then raise exception 'reminder_planned_early'; end if;
      end $$;
      -- Contract test advances only this local function argument. Hosted proof
      -- must use the real clock and never treats this as elapsed-time evidence.
      select app_private.notification_email_plan(now()+interval '61 minutes');
      do $$ begin
        if (select count(*) from app_private.notification_events where event_type='deadline_24h'
          and source_entity_id='f9700000-0000-4000-8000-000000000022')<>1
        or (select count(*) from app_private.notification_events where event_type='match_starting'
          and source_entity_id='f9700000-0000-4000-8000-000000003020')<>1
        then raise exception 'reminder_planner_contract_failed'; end if;
      end $$;
      rollback;
    """
    query(setup+source+proof)
    after=query(baseline)[-1]
    absent=query("select not exists(select 1 from app.fantasy_seasons where id='f9700000-0000-4000-8000-000000000005')")[-1]=='t'
    if after!=before or not absent:
        raise RuntimeError('reminder_local_rollback_failed')
    print(json.dumps({'passed':True,'localOnly':True,'plannerContract':True,'rollbackVerified':True,'realClockEvidence':False}))


if __name__=='__main__':
    main()
