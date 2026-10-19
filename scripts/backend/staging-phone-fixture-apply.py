#!/usr/bin/env python3
"""Execute only the reviewed phone seed/finish SQL in a paused staging window."""
import importlib.util
import json
import os
from pathlib import Path
import uuid

ROOT=Path(__file__).resolve().parents[2]
SPEC=importlib.util.spec_from_file_location('phone_auth_guard',ROOT/'scripts/backend/staging-auth-preflight.py')
A=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(A)


def main():
    ref=os.environ.get('SUPABASE_STAGING_PROJECT_REF','')
    A.R.validate_ref(ref)
    action=os.environ.get('ACTION','')
    filename={'seedphone':'staging-phone-fixture.sql','finishphone':'staging-phone-fixture-finish.sql'}.get(action)
    if filename is None:
        raise RuntimeError('staging_phone_fixture_action_refused')
    target=A.R.UPDATE.ManagementTarget(os.environ['SUPABASE_ACCESS_TOKEN'],ref)
    A.assert_idle_writer(target)
    rows=target.execute("select decrypted_secret as ids from vault.decrypted_secrets where name='botolago_staging_qa_owner_ids'",60)
    ids=[str(uuid.UUID(value)) for value in json.loads(rows[0]['ids'])] if len(rows)==1 else []
    if len(ids)!=2 or len(set(ids))!=2:
        raise RuntimeError('staging_phone_fixture_private_owners_required')
    source=(ROOT/'scripts/backend'/filename).read_text()
    if not source.endswith('commit;\n') or source.count('\nbegin;\n')!=1:
        raise RuntimeError('staging_phone_fixture_transaction_boundary_changed')
    source=source.replace('\nbegin;\n',f"\nbegin;\nselect set_config('botolago.release_drill','{ref}',true);\n"
                          f"select set_config('botolago.qa_owner_ids','{json.dumps(ids)}',true);\n",1)
    baseline="""select jsonb_build_object(
      'users',(select count(*) from auth.users where id<>'f9600000-0000-4000-8000-000000090000'),
      'teams',(select md5(string_agg(to_jsonb(t)::text,'' order by id)) from app.fantasy_teams t where fantasy_season_id<>'f9600000-0000-4000-8000-000000000005'),
      'results',(select md5(string_agg(to_jsonb(r)::text,'' order by r.id)) from app.fantasy_team_gameweek_results r join app.fantasy_gameweeks g on g.id=r.gameweek_id where g.fantasy_season_id<>'f9600000-0000-4000-8000-000000000005'),
      'gameweeks',(select md5(string_agg(to_jsonb(g)::text,'' order by id)) from app.fantasy_gameweeks g where fantasy_season_id<>'f9600000-0000-4000-8000-000000000005'),
      'ownSeason',(select to_jsonb(s) from app.fantasy_seasons s where id='f9600000-0000-4000-8000-000000000005')) as state"""
    before=target.rows(baseline)[0]['state']
    target.execute(source.removesuffix('commit;\n')+'rollback;\n',180)
    if target.rows(baseline)[0]['state']!=before:
        raise RuntimeError('staging_phone_fixture_rollback_changed_baseline')
    print(json.dumps({'stagingOnly':True,'action':action,'rehearsalRollbackVerified':True}),flush=True)
    A.assert_idle_writer(target)
    target.execute(source,180)
    after=target.rows(baseline)[0]['state']
    if {k:v for k,v in after.items() if k!='ownSeason'}!={k:v for k,v in before.items() if k!='ownSeason'}:
        raise RuntimeError('staging_phone_fixture_old_rows_changed')
    print(json.dumps({'stagingOnly':True,'action':action,'applied':True,'oldRowsUnchanged':True}),flush=True)


if __name__=='__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'passed':False,'error':'staging_phone_fixture_failed','errorType':type(error).__name__}))
        raise SystemExit(1)
