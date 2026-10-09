-- Run after bootstrap.sql, the real admin foundation, audit helper, and the new migration.
-- These statements write only to the disposable local database.
begin;
insert into auth.users values
 ('91000000-0000-4000-8000-000000000001','editor@example.test',now()),
 ('91000000-0000-4000-8000-000000000002','publisher@example.test',now());
insert into auth.sessions values
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',now()),
 ('92000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000002',now());
insert into auth.mfa_factors values
 ('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','verified'),
 ('93000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000002','verified');
insert into app_private.staff_principals(auth_user_id) select id from auth.users;
insert into app_private.staff_role_assignments(staff_principal_id,role_id,grant_reason)
 select p.id,r.id,'Home stories isolated test' from app_private.staff_principals p
 join app_private.admin_roles r on r.name=case when p.auth_user_id::text like '%001' then 'editor' else 'publisher' end;
insert into app.media_assets values ('94000000-0000-4000-8000-000000000001','news/test/story.webp','image/webp','validated','Test');
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if sqlerrm like '%'||expected||'%' then return; end if; raise;
  end;
  raise exception 'Expected error % for %',expected,statement;
end; $$;
set local role anon;
select pg_temp.expect_error('select * from app.home_stories','permission denied');
select pg_temp.expect_error('select api.admin_home_stories()','permission denied');
select api.home_stories();
reset role;
set local role authenticated;
select pg_temp.expect_error('select api.admin_home_stories()','staff_access_denied');
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","session_id":"92000000-0000-4000-8000-000000000001","aal":"aal1"}',true);
select pg_temp.expect_error('select api.admin_home_stories()','mfa_assurance_insufficient');
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","session_id":"92000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select set_config('test.story',api.admin_save_home_story(null,null,'Matchs','مباريات','Un stade','ملعب','94000000-0000-4000-8000-000000000001','/matches','Test',2)::text,true);
do $$ begin
 if jsonb_array_length(api.home_stories())<>0 then raise exception 'draft leaked';end if;
 if jsonb_array_length(api.admin_home_stories())<>1 then raise exception 'draft missing';end if;
end $$;
select pg_temp.expect_error(format('select api.admin_publish_home_story(%L,1,true)',current_setting('test.story')::jsonb->>'id'),'permission_missing');
select pg_temp.expect_error($q$select api.admin_save_home_story(null,null,'X','س','alt','بديل','94000000-0000-4000-8000-000000000001','javascript:alert(1)',null,0)$q$,'check constraint');
select pg_temp.expect_error($q$select api.admin_save_home_story(null,null,'X','س','alt','بديل','94000000-0000-4000-8000-000000000099',null,null,0)$q$,'story_invalid_media');
select pg_temp.expect_error(format($q$select api.admin_save_home_story(%L,99,'X','س','alt','بديل','94000000-0000-4000-8000-000000000001',null,null,0)$q$,current_setting('test.story')::jsonb->>'id'),'story_conflict');
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000002","session_id":"92000000-0000-4000-8000-000000000002","aal":"aal2"}',true);
select api.admin_publish_home_story((current_setting('test.story')::jsonb->>'id')::uuid,1,true);
select pg_temp.expect_error(format('select api.admin_publish_home_story(%L,1,false)',current_setting('test.story')::jsonb->>'id'),'story_conflict');
set local role anon;
do $$ begin if jsonb_array_length(api.home_stories())<>1 then raise exception 'publication missing';end if;end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","session_id":"92000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select pg_temp.expect_error(format($q$select api.admin_save_home_story(%L,2,'X','س','alt','بديل','94000000-0000-4000-8000-000000000001',null,null,0)$q$,current_setting('test.story')::jsonb->>'id'),'permission_missing');
reset role;
update app.media_assets set validation_status='expired';
set local role anon;
do $$ begin if jsonb_array_length(api.home_stories())<>0 then raise exception 'expired media exposed';end if;end $$;
reset role;
update app.media_assets set validation_status='validated';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000002","session_id":"92000000-0000-4000-8000-000000000002","aal":"aal2"}',true);
select api.admin_publish_home_story((current_setting('test.story')::jsonb->>'id')::uuid,2,false);
do $$ begin if jsonb_array_length(api.home_stories())<>0 then raise exception 'unpublish failed';end if;end $$;
reset role;
do $$ begin
 if (select count(*) from app_private.editorial_audit_events)<>3 then raise exception 'audit mismatch';end if;
end $$;
rollback;
select 'Stories migration assertions passed' as result;
