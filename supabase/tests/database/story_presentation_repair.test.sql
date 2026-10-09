begin;
select extensions.plan(1);
select extensions.lives_ok($scenario$
do $test$
declare source_id uuid := gen_random_uuid(); fr_id uuid:=gen_random_uuid(); ar_id uuid:=gen_random_uuid(); job jsonb; result jsonb; story_id uuid; attempts integer; original_job uuid; original_story uuid; unrelated uuid:=gen_random_uuid();
begin
  if has_function_privilege('anon','api.service_claim_ai_home_story()','execute') or has_function_privilege('authenticated','api.service_complete_ai_home_story(uuid,text,integer,integer)','execute') then raise exception 'browser may run worker'; end if;
  if has_table_privilege('service_role','app_private.ai_home_story_jobs','select') then raise exception 'worker has direct table access'; end if;
  perform set_config('request.jwt.claim.role','authenticated',true);
  begin perform api.service_claim_ai_home_story(); raise exception 'service check missing'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.role','service_role',true);
  if api.service_claim_ai_home_story() is not null then raise exception 'paused claim'; end if;
  insert into app.stories(id,original_language) values(source_id,'fr');
  insert into app.article_editions(id,story_id,language,slug,title,summary,body_format,body_html,reading_time_minutes,sanitizer_version,status,visibility,published_at)
    values(fr_id,source_id,'fr','qa-image-story-fr','Une longue actualité de football pour tester la publication automatique des images','Une actualité publiée pour tester les illustrations.','rich_text','<p>Une actualité de football pour le test.</p>',1,'test','published','public',now()),
    (ar_id,source_id,'ar','qa-image-story-ar','أخبار كرة القدم لاختبار النشر التلقائي للصور','خبر منشور لاختبار الرسوم التوضيحية.','rich_text','<p>خبر عن كرة القدم لاختبار إنشاء الصور.</p>',1,'test','published','public',now());
  perform app_private.ai_home_stories_configure(true,6);
  job:=api.service_claim_ai_home_story();
  if job is null or job->>'titleFr' not like 'Une longue%' then raise exception 'latest bilingual source not claimed'; end if;
  if api.service_claim_ai_home_story() is not null then raise exception 'overlapping claim'; end if;
  begin perform api.service_complete_ai_home_story((job->>'id')::uuid,'test',1024,1536); raise exception 'missing image published'; exception when invalid_parameter_value then null; end;
  insert into storage.objects(bucket_id,name) values('news-media','news/ai-stories/'||(job->>'id')||'.png');
  result:=api.service_complete_ai_home_story((job->>'id')::uuid,'test',1024,1536);
  story_id:=(result->>'id')::uuid;
  if result->>'status'<>'published' or story_id is null then raise exception 'publication failed'; end if;
  if api.service_complete_ai_home_story((job->>'id')::uuid,'test',1024,1536)<>result then raise exception 'completion not idempotent'; end if;
  if not exists(select 1 from jsonb_array_elements(api.home_stories()) s where s->>'id'=story_id::text and s->>'generated'='true' and s->>'destination' is null) then raise exception 'public generated dto missing'; end if;
  if exists(select 1 from jsonb_array_elements(api.home_stories()) s where s ? 'sourceName') then raise exception 'private source attribution exposed'; end if;
  -- Newer ordinary news must not spend the budget reserved for requested refreshes.
  update app.article_editions e set published_at=now()-interval '1 hour' where e.story_id=source_id;
  insert into app.stories(id,original_language) values(unrelated,'fr');
  insert into app.article_editions(id,story_id,language,slug,title,summary,body_format,body_html,reading_time_minutes,sanitizer_version,status,visibility,published_at)
    select gen_random_uuid(),unrelated,language,'qa-unrelated-'||language::text,title,summary,body_format,body_html,reading_time_minutes,sanitizer_version,status,visibility,now()
    from app.article_editions e where e.story_id=source_id;
  original_job:=(job->>'id')::uuid; original_story:=story_id;
  if (job->'visualContext'->>'article' like '%football%') is distinct from true then raise exception 'article context absent'; end if;
  if has_function_privilege('service_role','app_private.ai_home_stories_queue_refresh(uuid[])','execute') then raise exception 'worker may queue refresh'; end if;
  begin
    perform app_private.ai_home_stories_queue_refresh(array[original_job]);
    raise exception using errcode='PT999',message='enabled refresh permitted';
  exception when raise_exception then if sqlerrm<>'pause_and_drain_required' then raise; end if; end;
  perform app_private.ai_home_stories_configure(false,1);
  begin
    perform app_private.ai_home_stories_queue_refresh(array[original_job]);
    raise exception using errcode='PT999',message='refresh bypassed budget';
  exception when raise_exception then if sqlerrm<>'daily_budget_exceeded' then raise; end if; end;
  perform app_private.ai_home_stories_configure(false,6);
  if app_private.ai_home_stories_queue_refresh(array[original_job])<>1 then raise exception 'refresh not queued'; end if;
  if not exists(select 1 from jsonb_array_elements(api.home_stories()) h where h->>'id'=original_story::text) then raise exception 'refresh prematurely hid current image'; end if;
  perform app_private.ai_home_stories_configure(true,6);
  job:=api.service_claim_ai_home_story();
  if job is null or job->>'id'=original_job::text then raise exception 'replacement not claimed'; end if;
  if (select source_story_id from app_private.ai_home_story_jobs where id=(job->>'id')::uuid)<>source_id then raise exception 'unrelated news took refresh budget'; end if;
  insert into storage.objects(bucket_id,name) values('news-media','news/ai-stories/'||(job->>'id')||'.png');
  result:=api.service_complete_ai_home_story((job->>'id')::uuid,'test',1024,1536);
  if result->>'status'<>'published' then raise exception 'replacement not published'; end if;
  if (select published from app.home_stories where id=original_story) then raise exception 'old image still published'; end if;
  if exists(select 1 from jsonb_array_elements(api.home_stories()) h where h->>'id'=original_story::text) then raise exception 'duplicate image in feed'; end if;
  if not exists(select 1 from jsonb_array_elements(api.home_stories()) h where h->>'id'=result->>'id' and h->>'credit' is null) then raise exception 'replacement or credit wrong'; end if;
  if (select count(*) from app_private.ai_home_story_jobs where source_story_id=source_id)<>2 then raise exception 'history not retained'; end if;
  update app.article_editions e set visibility='unlisted' where e.story_id=unrelated;
  if api.service_claim_ai_home_story() is not null then raise exception 'extra generation allowed'; end if;
  -- An editor unpublishing after a refresh is queued still wins.
  -- A rollback-only test resets the fixture attempt to exercise this race.
  delete from app_private.ai_home_story_jobs where id=(job->>'id')::uuid;
  update app.home_stories set published=true where id=original_story;
  job:=api.service_claim_ai_home_story();
  if job is null then raise exception 'race fixture not claimed'; end if;
  update app.home_stories set published=false where id=original_story;
  if api.service_complete_ai_home_story((job->>'id')::uuid,'test',1024,1536)->>'status'<>'failed' then raise exception 'editorial unpublish ignored'; end if;
end;
$test$;
$scenario$, 'Story refresh preserves live media until atomic replacement, budgets, private context and editorial suppression');
select * from extensions.finish();
rollback;
