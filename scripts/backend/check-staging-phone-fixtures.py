#!/usr/bin/env python3
"""Exercise phone fixture SQL and real saved-list RPCs in local Docker only.

No remote database URL or credential is accepted. The complete fixture and
synthetic identities live in one rolled-back transaction. No hosted DB is used.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
import re
import subprocess

ROOT=Path(__file__).resolve().parents[2]
CONTAINER='supabase_db_botolago-production-v2'
PSQL=['docker','exec','-i',CONTAINER,'psql','-X','-q','-A','-t','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
OWNERS=['f9610000-0000-4000-8000-000000000001','f9610000-0000-4000-8000-000000000002']


def query(sql,timeout=180):
    result=subprocess.run(PSQL,input=sql,capture_output=True,text=True,timeout=timeout)
    if result.returncode:
        raise RuntimeError('local_phone_fixture_sql_failed: '+result.stderr[-2500:])
    return result.stdout.strip().splitlines()


def main():
    if os.environ.get('DOCKER_HOST','') not in ('','unix:///var/run/docker.sock') or os.environ.get('DOCKER_CONTEXT','') not in ('','default'):
        raise RuntimeError('phone_fixture_remote_docker_refused')
    before=query("select jsonb_build_object('users',(select count(*) from auth.users),'stories',(select count(*) from app.stories),'teams',(select count(*) from app.fantasy_teams))")[-1]
    source=(ROOT/'scripts/backend/staging-phone-fixture.sql').read_text().rstrip()
    if not source.endswith('commit;'):
        raise RuntimeError('phone_fixture_transaction_boundary_changed')
    source=re.sub(r'(?m)^begin;\s*$','',source,count=1).removesuffix('commit;')
    setup="""begin;
      select cron.alter_job(jobid,active:=false) from cron.job;
      select app_private.rivals_configure(false);
      select set_config('botolago.release_drill','srdrflfrfpwixsllveid',true);
      select set_config('botolago.qa_owner_ids','OWNER_IDS',true);
      insert into app.countries(id,iso_alpha2,iso_alpha3)
      values('f9610000-0000-4000-8000-000000000010','MA','MAR') on conflict do nothing;
      insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,encrypted_password,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      select md5('fantasy-load-user-'||n)::uuid,'00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','fantasy-load-'||n||'@staging.botolago.invalid',now(),'',
        '{"provider":"email","providers":["email"]}',jsonb_build_object('username','qa_cohort_'||n),now(),now()
      from generate_series(1,120) n on conflict(id) do nothing;
      insert into app.profiles(id,display_name)
      select md5('fantasy-load-user-'||n)::uuid,'Phone QA synthetic '||n from generate_series(1,120) n
      on conflict(id) do nothing;
      insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,encrypted_password,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
        'phone-qa-owner-'||n||'@example.invalid',now(),'',
        '{"provider":"email","providers":["email"]}',jsonb_build_object('username','phone_qa_owner_'||n),now(),now()
      from (values (1,'f9610000-0000-4000-8000-000000000001'::uuid),
        (2,'f9610000-0000-4000-8000-000000000002'::uuid)) owners(n,id);
      insert into app.profiles(id,display_name) select id,'Phone QA owner '||n
      from (values (1,'f9610000-0000-4000-8000-000000000001'::uuid),
        (2,'f9610000-0000-4000-8000-000000000002'::uuid)) owners(n,id) on conflict(id) do nothing;
    """.replace('OWNER_IDS',json.dumps(OWNERS))
    proof="""
      set local role authenticated;
      do $$ declare page jsonb; cursor jsonb; total integer; pages integer; ids uuid[]; who integer; item jsonb;
      begin
        for who in 0..1 loop
          perform set_config('request.jwt.claims',jsonb_build_object('sub',
            current_setting('botolago.qa_owner_ids')::jsonb->>who,'role','authenticated','aal','aal1')::text,true);
          cursor:=null; total:=0; pages:=0; ids:='{}';
          loop
            page:=api.news_saved_articles(50,(cursor->>'createdAt')::timestamptz,(cursor->>'articleId')::uuid);
            if jsonb_array_length(page->'items')>50 then raise exception 'phone_qa_saved_page_oversized'; end if;
            for item in select value from jsonb_array_elements(page->'items') loop
              ids:=array_append(ids,(item->>'id')::uuid);
            end loop;
            total:=total+jsonb_array_length(page->'items'); pages:=pages+1; cursor:=page->'nextCursor';
            exit when cursor is null or cursor='null'::jsonb;
            if pages>50 then raise exception 'phone_qa_saved_cursor_did_not_terminate'; end if;
          end loop;
          if total<>case when who=0 then 60 else 2001 end or total<>(select count(distinct v) from unnest(ids) v)
            or pages<>case when who=0 then 2 else 41 end then raise exception 'phone_qa_saved_pagination_mismatch'; end if;
        end loop;
      end $$;
      reset role;
      do $$ begin
        if (select count(*) from app.fantasy_teams where fantasy_season_id='f9600000-0000-4000-8000-000000000005')<>123
        or (select count(*) from app.fantasy_league_memberships where league_id='f9600000-0000-4000-8000-000000040000')<>123
        or (select count(*) from app.article_editions where id::text like 'f9600000-%')<>4002
        then raise exception 'phone_qa_cohort_mismatch'; end if;
      end $$;
      select jsonb_build_object('passed',true,'savedA',60,'savedB',2001,'savedPagesA',2,'savedPagesB',41,
        'uniqueSavedIds',true,'teams',123,'privateLeagueMembers',123,'bilingualEditions',4002) as phone_fixture_proof;
      rollback;
    """
    lines=query(setup+source+proof)
    result=json.loads(lines[-1])
    after=query("select jsonb_build_object('users',(select count(*) from auth.users),'stories',(select count(*) from app.stories),'teams',(select count(*) from app.fantasy_teams))")[-1]
    if after!=before or query("select count(*) from app.fantasy_seasons where id='f9600000-0000-4000-8000-000000000005'")[-1]!='0':
        raise RuntimeError('phone_fixture_local_rollback_failed')
    print(json.dumps({**result,'rollbackVerified':True},indent=2))


if __name__=='__main__':
    main()
