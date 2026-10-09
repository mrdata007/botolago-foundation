begin;
select extensions.plan(1);
select extensions.lives_ok($scenario$
do $test$
declare source_id uuid := gen_random_uuid(); fr_id uuid:=gen_random_uuid(); ar_id uuid:=gen_random_uuid(); job jsonb; result jsonb; story_id uuid; attempts integer;
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
  update app.article_editions set visibility='unlisted' where id=fr_id;
  if exists(select 1 from jsonb_array_elements(api.home_stories()) s where s->>'id'=story_id::text) then raise exception 'withdrawn source visible'; end if;
  update app.article_editions set visibility='public' where id=fr_id;
  update app.home_stories set published=false where id=story_id;
  if api.service_claim_ai_home_story() is not null then raise exception 'unpublished story regenerated'; end if;
  -- A failed source gets one retry, bounded by the daily attempt cap.
  source_id:=gen_random_uuid(); fr_id:=gen_random_uuid(); ar_id:=gen_random_uuid();
  insert into app.stories(id,original_language) values(source_id,'fr');
  insert into app.article_editions(id,story_id,language,slug,title,summary,body_format,body_html,reading_time_minutes,sanitizer_version,status,visibility,published_at)
    values(fr_id,source_id,'fr','qa-image-retry-fr','Deuxième actualité pour les images','Une nouvelle actualité publiée pour tester les images.','rich_text','<p>Une actualité de football pour le test.</p>',1,'test','published','public',now()),
    (ar_id,source_id,'ar','qa-image-retry-ar','خبر ثان لاختبار الصور','خبر منشور لاختبار الرسوم التوضيحية.','rich_text','<p>خبر عن كرة القدم لاختبار إنشاء الصور.</p>',1,'test','published','public',now());
  perform app_private.ai_home_stories_configure(true,2);
  job:=api.service_claim_ai_home_story();
  if job is null then raise exception 'retry source missing'; end if;
  perform api.service_fail_ai_home_story((job->>'id')::uuid,'provider_http_429');
  if api.service_claim_ai_home_story() is not null then raise exception 'failed attempt not budgeted'; end if;
  perform app_private.ai_home_stories_configure(true,6);
  job:=api.service_claim_ai_home_story();
  if job is null then raise exception 'retry not available'; end if;
  perform app_private.ai_home_stories_configure(false);
  if api.service_complete_ai_home_story((job->>'id')::uuid,'test',1024,1536)->>'status'<>'failed' then raise exception 'paused worker published'; end if;
  perform app_private.ai_home_stories_configure(true,6);
  if api.service_claim_ai_home_story() is not null then raise exception 'retry limit exceeded'; end if;
end;
$test$;
$scenario$, 'AI stories enforce authorization, pause, bounded claims, atomic image publication, idempotency, source withdrawal, editorial suppression and retry budgets');
select * from extensions.finish();
rollback;
