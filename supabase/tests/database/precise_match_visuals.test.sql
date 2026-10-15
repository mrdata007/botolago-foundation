begin;
select extensions.plan(16);
select extensions.ok((select not public from storage.buckets where id='match-visual-drafts'),'originals and results use a private bucket');
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='app_private.match_visual_drafts'::regclass),'draft table has forced RLS');
select extensions.ok(not has_table_privilege('authenticated','app_private.match_visual_drafts','select,insert,update,delete'),'browser has no direct private-table access');
select extensions.ok(not has_function_privilege('anon','api.admin_match_visual_drafts()','execute'),'anonymous cannot list held drafts');
select extensions.ok(not has_function_privilege('authenticated','api.service_finish_match_visual_edit(uuid,uuid,text)','execute'),'staff cannot bypass edit completion with service RPC');
select extensions.ok(has_function_privilege('service_role','api.service_finish_match_visual_edit(uuid,uuid,text)','execute'),'service may finish only its private edit');
select extensions.ok(not has_function_privilege('anon','api.admin_get_match_visual_draft(uuid)','execute'),'anonymous cannot obtain private preview paths');
select set_config('request.jwt.claims','{}',true);
select extensions.throws_ok('select api.admin_match_visual_drafts()','PT401','staff_access_denied','private list requires MFA staff context');
select extensions.throws_ok('select api.admin_get_match_visual_draft(gen_random_uuid())','PT401','staff_access_denied','private preview requires MFA staff context');
select extensions.throws_ok('select api.admin_import_match_visual_draft(''{}''::jsonb)','PT401','staff_access_denied','private import requires MFA staff context before validating metadata');
select extensions.throws_ok('select api.admin_begin_match_visual_edit(gen_random_uuid(),1,gen_random_uuid(),''{}''::jsonb)','PT401','staff_access_denied','private edits require MFA staff context before claiming an attempt');
select extensions.throws_ok('select api.admin_discard_match_visual_draft(gen_random_uuid(),1)','PT401','staff_access_denied','private discard requires MFA staff context');
select extensions.throws_ok('select api.service_finish_match_visual_edit(gen_random_uuid(),gen_random_uuid(),null)','42501','service_only','completion refuses non-service JWT');
select extensions.lives_ok($scenario$
DO $$
declare v_id uuid:=gen_random_uuid(); v_attempt uuid:=gen_random_uuid(); v_source text; v_before jsonb; v_after jsonb; v_ok boolean;
begin
 v_source:=v_id::text||'/source.png';
 select jsonb_build_object('stories',(select count(*) from app.home_stories),'media',(select count(*) from app.media_assets),'heroes',(select coalesce(jsonb_agg(jsonb_build_array(id,hero_asset_id) order by id),'[]') from app.article_editions)) into v_before;
 insert into app_private.match_visual_drafts(id,source_url,source_hash,label,width,height,created_by,status,attempt_id,lease_until)
 values(v_id,'https://www.instagram.com/p/private-draft-test/',repeat('a',64),'Private QA draft',120,100,gen_random_uuid(),'processing',v_attempt,clock_timestamp()+interval '10 minutes');
 insert into storage.objects(bucket_id,name) values('match-visual-drafts',v_id::text||'/'||v_attempt::text||'/result.png');
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 v_ok:=api.service_finish_match_visual_edit(v_id,v_attempt,null);
 if v_ok is distinct from true or not exists(select 1 from app_private.match_visual_drafts where id=v_id and status='held' and rights_status='unverified' and result_path is not null) then raise exception 'completion must hold without granting rights'; end if;
 if api.service_finish_match_visual_edit(v_id,v_attempt,'draft_edit_failed') then raise exception 'duplicate callback overwrote held result'; end if;
 update app_private.match_visual_drafts set status='processing',attempt_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '10 minutes' where id=v_id;
 if api.service_finish_match_visual_edit(v_id,v_attempt,null) then raise exception 'stale attempt overwrote new attempt'; end if;
 select attempt_id into v_attempt from app_private.match_visual_drafts where id=v_id;
 update app_private.match_visual_drafts set status='discarded',lease_until=null where id=v_id;
 if api.service_finish_match_visual_edit(v_id,v_attempt,null) then raise exception 'discarded draft completed'; end if;
 update app_private.match_visual_drafts set status='processing',lease_until=clock_timestamp()-interval '1 second' where id=v_id;
 if api.service_finish_match_visual_edit(v_id,v_attempt,null) then raise exception 'expired attempt completed'; end if;
 update app_private.match_visual_drafts set lease_until=clock_timestamp()+interval '1 minute' where id=v_id;
 if api.service_finish_match_visual_edit(v_id,v_attempt,'provider_error') is distinct from true then raise exception 'provider failure not recorded'; end if;
 if not exists(select 1 from app_private.match_visual_drafts where id=v_id and status='failed' and error_code='draft_edit_failed') then raise exception 'safe retry state missing'; end if;
 select jsonb_build_object('stories',(select count(*) from app.home_stories),'media',(select count(*) from app.media_assets),'heroes',(select coalesce(jsonb_agg(jsonb_build_array(id,hero_asset_id) order by id),'[]') from app.article_editions)) into v_after;
 if v_before is distinct from v_after then raise exception 'private edit changed public stories/media/heroes'; end if;
end $$;
$scenario$,'completion, failures, expiry and cancellation never publish');
select extensions.ok((select not enabled from app_private.match_visual_collection_settings where id),'collection is disabled by default');
select extensions.lives_ok($collector$
DO $$
declare v_id uuid:=gen_random_uuid(); v_data jsonb; v_result jsonb;
begin
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 v_data:=jsonb_build_object('id',v_id,'sourceUrl','https://instagram.com/p/collector-qa/','sourceHash',repeat('b',64),'label','Collector QA','width',120,'height',100);
 begin perform api.service_import_match_visual_draft(v_data); raise exception 'paused collection imported'; exception when others then if SQLERRM<>'draft_collection_paused' then raise; end if; end;
 insert into storage.objects(bucket_id,name) values('match-visual-drafts',v_id::text||'/source.png');
 perform app_private.match_visual_collection_configure(true);
 v_result:=api.service_import_match_visual_draft(v_data);
 if v_result->>'status'<>'held' or v_result->>'rightsStatus'<>'unverified' then raise exception 'collector did not hold source'; end if;
 update app_private.match_visual_drafts set status='discarded' where id=v_id;
 v_result:=api.service_import_match_visual_draft(v_data||jsonb_build_object('id',gen_random_uuid()));
 if v_result->>'id'<>v_id::text or v_result->>'status'<>'discarded' then raise exception 'collector resurrected discarded source'; end if;
 perform app_private.match_visual_collection_configure(false);
end $$;
$collector$,'collector is paused by default, holds sources and never resurrects discarded posts');
select * from extensions.finish();
rollback;
