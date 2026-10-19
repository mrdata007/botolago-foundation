#!/usr/bin/env python3
"""Protected staging-only season selection; rehearse, verify rollback, apply."""
import importlib.util
import json
import os
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
SPEC=importlib.util.spec_from_file_location('phone_selection_runtime',ROOT/'scripts/backend/staging-release-runtime.py')
R=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)


def main():
    ref=os.environ.get('SUPABASE_STAGING_PROJECT_REF','')
    R.validate_ref(ref)
    action={'parkphone':'park','restorephone':'restore'}.get(os.environ.get('ACTION',''))
    if action is None:
        raise RuntimeError('staging_phone_selection_action_refused')
    target=R.UPDATE.ManagementTarget(os.environ['SUPABASE_ACCESS_TOKEN'],ref)
    source=(ROOT/'scripts/backend/staging-phone-season-selection.sql').read_text()
    if not source.endswith('commit;\n') or source.count('\nbegin;\n')!=1:
        raise RuntimeError('staging_phone_selection_transaction_boundary_changed')
    source=source.replace('\nbegin;\n',f"\nbegin;\nselect set_config('botolago.release_drill','{ref}',true);\n"
                          f"select set_config('botolago.phone_selection_action','{action}',true);\n",1)
    baseline="""select jsonb_build_object(
      'seasons',(select jsonb_agg(to_jsonb(s) order by s.id) from app.fantasy_seasons s where s.id in
        ('1a0c2026-1018-4000-8000-000000000004','fa630000-0000-4000-8000-000000000001')),
      'context',(select jsonb_agg(jsonb_build_object('id',id,'digest',md5(secret)) order by id)
        from vault.secrets where name='botolago_staging_phone_season_selection')) as state"""
    before=target.execute(baseline,60)
    target.execute(source.removesuffix('commit;\n')+'rollback;\n',180)
    if target.execute(baseline,60)!=before:
        raise RuntimeError('staging_phone_selection_rehearsal_rollback_failed')
    print(json.dumps({'stagingOnly':True,'action':action,'rehearsalRollbackVerified':True}),flush=True)
    target.execute(source,180)
    print(json.dumps({'stagingOnly':True,'action':action,'appliedAndVerified':True}),flush=True)


if __name__=='__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'passed':False,'error':'staging_phone_selection_failed','errorType':type(error).__name__}))
        raise SystemExit(1)
