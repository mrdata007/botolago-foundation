begin;
select extensions.plan(1);
select extensions.lives_ok($scenario$
do $test$
declare
  competition uuid:=gen_random_uuid(); season uuid:=gen_random_uuid(); home uuid:=gen_random_uuid(); away uuid:=gen_random_uuid();
  fixture uuid; scorer uuid; goal uuid; source uuid; fr uuid; ar uuid; spec jsonb; frame jsonb; job jsonb; result jsonb;
  asset uuid; portrait uuid; manual_asset uuid; variant text; role text; path text; scenario integer;
begin
  if (select public from storage.buckets where id='match-visual-inputs') then raise exception 'original artwork bucket is public'; end if;
  if has_function_privilege('anon','api.service_complete_precise_home_story(uuid,text,integer,integer)','execute')
    or has_function_privilege('authenticated','app_private.register_precise_match_visual(uuid,jsonb)','execute')
    or has_table_privilege('service_role','app_private.precise_match_visual_briefs','select') then raise exception 'browser or worker can approve source pixels'; end if;
  perform set_config('request.jwt.claim.role','authenticated',true);
  begin perform api.service_complete_precise_home_story(gen_random_uuid(),'botolago-protected-pixels-v1',1536,1024);
    raise exception 'service gate missing'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.role','service_role',true);
  insert into app.competitions(id,slug,name,competition_type) values(competition,'qa-precise-league','Precise league','league');
  insert into app.seasons(id,competition_id,label,starts_on,ends_on,status,is_current)
    values(season,competition,'Precise season',current_date-30,current_date+200,'active',true);
  insert into app.teams(id,slug,name,short_name,code) values(home,'qa-precise-fus','FUS Rabat','FUS','FUS'),(away,'qa-precise-raja','Raja Casablanca','Raja','RCA');
  for scenario in 1..3 loop
    fixture:=gen_random_uuid(); source:=gen_random_uuid(); fr:=gen_random_uuid(); ar:=gen_random_uuid();
    insert into app.fixtures(id,competition_id,season_id,home_team_id,away_team_id,kickoff_at,status,period,home_score,away_score,provider_updated_at)
      values(fixture,competition,season,home,away,now()-interval '3 hours','finished','post_match',1,1,now());
    scorer:=gen_random_uuid(); goal:=gen_random_uuid();
    insert into app.players(id,slug,full_name,display_name,position)
      values(scorer,'qa-precise-scorer-'||scenario,'Verified Scorer','M. Scorer','forward');
    insert into app.match_events(id,fixture_id,team_id,player_id,event_type,minute,added_time,sequence_number,period,idempotency_key,provider_updated_at)
      values(goal,fixture,home,scorer,'goal',69,0,1,'second_half','qa-precise-goal-'||scenario,now());
    insert into app.stories(id,original_language) values(source,'fr');
    insert into app.article_editions(id,story_id,language,slug,title,summary,body_format,body_html,reading_time_minutes,sanitizer_version,status,visibility,published_at)
      values(fr,source,'fr','qa-precise-fr-'||scenario,'FUS — Raja : 1–1','Les deux équipes font match nul.','rich_text','<p>Un but partout.</p>',1,'test','published','public',now()),
      (ar,source,'ar','qa-precise-ar-'||scenario,'الفتح — الرجاء: 1–1','تعادل الفريقان بهدف لمثله.','rich_text','<p>هدف لكل فريق.</p>',1,'test','published','public',now());
    insert into app_private.ai_content_articles(article_edition_id,story_id,kind,fixture_id,language,model)
      values(fr,source,'match_recap',fixture,'fr','test'),(ar,source,'match_recap',fixture,'ar','test');
    perform app_private.ai_home_stories_configure(true,6);
    if api.service_claim_ai_home_story() is not null then raise exception 'unapproved match spends an attempt'; end if;
    perform app_private.ai_home_stories_configure(false);
    spec:=jsonb_build_object('version',1,'fixtureId',fixture,'referenceUrl','https://www.instagram.com/p/qa/',
      'approvedAt',now()-interval '1 minute','rightsUntil',now()+interval '30 days','credit','Photographe autorisé',
      'approval','{"faces":true,"kits":true,"crests":true,"scores":true,"lettering":true,"derivatives":true,"branding":true}'::jsonb,
      'facts',app_private.precise_match_facts(fixture));
    foreach variant in array array['story','article'] loop
      frame:='{}'::jsonb;
      foreach role in array array['source','protection','branding'] loop
        path:='news/match-visual-inputs/'||source::text||'/'||variant||'-'||role||'.png';
        insert into storage.objects(bucket_id,name) values('match-visual-inputs',path);
        frame:=frame||jsonb_build_object(role,jsonb_build_object('path',path,'sha256',repeat('a',64)));
      end loop;
      spec:=spec||jsonb_build_object(variant,frame);
    end loop;
    begin perform app_private.register_precise_match_visual(source,jsonb_set(spec,'{facts,homeScore}','9'));
      raise exception 'wrong scoreboard approved'; exception when raise_exception then
      if sqlerrm<>'invalid_precise_match_approval' then raise; end if; end;
    perform app_private.register_precise_match_visual(source,spec);
    perform app_private.ai_home_stories_configure(true,6);
    job:=api.service_claim_ai_home_story();
    if job is null or job->>'id' is null or job->'visualContext'->'preciseMatchVisual'<>spec then raise exception 'approved assets not snapshotted'; end if;
    if api.service_claim_ai_home_story() is not null then raise exception 'overlapping worker'; end if;
    if scenario=1 then
      -- The old deployed worker is blocked while rolling out the new worker.
      if api.service_complete_ai_home_story((job->>'id')::uuid,'generic-model',1024,1536)->>'status'<>'failed' then raise exception 'generic match image published'; end if;
      job:=api.service_claim_ai_home_story();
    end if;
    insert into storage.objects(bucket_id,name) values('news-media','news/ai-stories/'||(job->>'id')||'.png'),
      ('news-media','news/match-covers/'||(job->>'id')||'.png');
    if scenario=1 then
      update app.fixtures set home_score=2 where id=fixture;
      if app_private.precise_match_job_valid((select j from app_private.ai_home_story_jobs j where j.id=(job->>'id')::uuid)) then raise exception 'score correction ignored'; end if;
      update app.fixtures set home_score=1 where id=fixture;
      update app.match_events set minute=70,event_type='own_goal' where id=goal;
      if app_private.precise_match_job_valid((select j from app_private.ai_home_story_jobs j where j.id=(job->>'id')::uuid)) then raise exception 'scorer minute or own-goal correction ignored'; end if;
      update app.match_events set minute=69,event_type='goal' where id=goal;
      result:=api.service_complete_precise_home_story((job->>'id')::uuid,'botolago-protected-pixels-v1',1536,1024);
      if result->>'status'<>'published' then raise exception 'precise publication failed'; end if;
      select j.article_media_asset_id,h.media_asset_id into asset,portrait from app_private.ai_home_story_jobs j
        join app.home_stories h on h.id=j.home_story_id where j.id=(job->>'id')::uuid;
      if asset is null or (select count(*) from app.article_editions where id in (fr,ar) and hero_asset_id=asset)<>2
        or (select width from app.media_assets where id=asset)<>1536 or (select height from app.media_assets where id=portrait)<>1536 then raise exception 'story/article pair not atomic'; end if;
      if (select credit from app.media_assets where id=asset)<>'Photographe autorisé' then raise exception 'photo credit lost'; end if;
      if api.service_complete_precise_home_story((job->>'id')::uuid,'botolago-protected-pixels-v1',1536,1024)<>result then raise exception 'completion not idempotent'; end if;
      perform app_private.ai_home_stories_configure(false);
      perform app_private.register_precise_match_visual(source,spec);
      if (select status from app_private.ai_home_story_jobs where id=(job->>'id')::uuid)<>'published' then raise exception 'identical approval queues a duplicate'; end if;
      perform app_private.ai_home_stories_configure(true,6);
      if api.service_claim_ai_home_story() is not null then raise exception 'identical approval regenerated'; end if;
      update app.article_editions set published_at=now()-interval '4 days' where id in (fr,ar);
      if app_private.news_media_dto(asset) is null then raise exception 'archive cover vanished with the Home age limit'; end if;
      update app.fixtures set away_score=2 where id=fixture;
      if app_private.news_media_dto(asset) is not null then raise exception 'stale article scoreboard visible'; end if;
      update app.fixtures set away_score=1 where id=fixture;
      update app.players set display_name='Corrected Scorer' where id=scorer;
      if app_private.news_media_dto(asset) is not null then raise exception 'stale scorer lettering visible'; end if;
      update app.players set display_name='M. Scorer' where id=scorer;
      update app_private.precise_match_visual_briefs set active=false where story_id=source;
      if app_private.news_media_dto(asset) is not null then raise exception 'revoked cover visible'; end if;
      -- Explicitly reviewed replacement can render after the original two
      -- attempts; retries are bounded per approval and by the global daily cap.
      update app.article_editions set published_at=now() where id in (fr,ar);
      perform app_private.ai_home_stories_configure(false);
      spec:=jsonb_set(spec,'{credit}','"Photographe autorisé, crédit corrigé"');
      update app.home_stories set published=false where id=(result->>'id')::uuid;
      perform app_private.register_precise_match_visual(source,spec);
      if (select status from app_private.ai_home_story_jobs where id=(job->>'id')::uuid)<>'published' then raise exception 'manual suppression lost'; end if;
      update app.home_stories set published=true where id=(result->>'id')::uuid;
      perform app_private.register_precise_match_visual(source,spec);
      perform app_private.ai_home_stories_configure(true,6);
      job:=api.service_claim_ai_home_story();
      if job is null or job->'visualContext'->'preciseMatchVisual'<>spec then raise exception 'approved replacement blocked by historical attempts'; end if;
      perform api.service_fail_ai_home_story((job->>'id')::uuid,'qa_revision_cleanup');
    elsif scenario=2 then
      insert into app.media_assets(kind,storage_path,validation_status,validated_at,mime_type,width,height)
        values('article_hero','news/qa-precise-manual.png','validated',now(),'image/png',1536,1024) returning id into manual_asset;
      update app.article_editions set hero_asset_id=manual_asset where id=fr;
      if api.service_complete_precise_home_story((job->>'id')::uuid,'botolago-protected-pixels-v1',1536,1024)->>'status'<>'failed'
        or (select hero_asset_id from app.article_editions where id=fr)<>manual_asset then raise exception 'newer manual cover overwritten'; end if;
    else
      perform app_private.ai_home_stories_configure(false);
      if api.service_complete_precise_home_story((job->>'id')::uuid,'botolago-protected-pixels-v1',1536,1024)->>'status'<>'failed' then raise exception 'paused worker published'; end if;
    end if;
    update app.article_editions set visibility='unlisted' where id in (fr,ar);
  end loop;
end;
$test$;
$scenario$, 'Precise visuals enforce private approval, exact fixture facts, no generic fallback, atomic bilingual covers, idempotency, corrections, revocation, manual covers and pause');
select * from extensions.finish();
rollback;
