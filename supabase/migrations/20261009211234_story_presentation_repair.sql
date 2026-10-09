-- More specific visual briefs and safe replacement of existing illustrations.
alter table app_private.ai_home_story_jobs add column visual_context jsonb not null default '{}'::jsonb;
alter table app_private.ai_home_story_jobs drop constraint ai_home_story_jobs_status_check;
alter table app_private.ai_home_story_jobs add constraint ai_home_story_jobs_status_check
  check(status in ('generating','published','failed','superseded'));

create function app_private.ai_home_story_visual_context(p_story uuid,p_edition uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
   'article',left(regexp_replace(e.body_html,'<[^>]+>',' ','g'),3000),
   'kind',a.kind,
   'match',case when f.id is not null then jsonb_build_object(
     'home',h.name,'away',v.name,'homeScore',f.home_score,'awayScore',f.away_score,
     'status',f.status,'kickoff',f.kickoff_at) else null end,
   'clubs',(select coalesce(jsonb_agg(t.name),'[]'::jsonb) from app.story_teams st join app.teams t on t.id=st.team_id where st.story_id=p_story))
 from app.article_editions e
 left join app_private.ai_content_articles a on a.article_edition_id=e.id
 left join app.fixtures f on f.id=a.fixture_id
 left join app.teams h on h.id=f.home_team_id
 left join app.teams v on v.id=f.away_team_id
 where e.id=p_edition and e.story_id=p_story
$$;
revoke all on function app_private.ai_home_story_visual_context(uuid,uuid) from public,anon,authenticated,service_role;

-- Owner-only bounded regeneration, while paused and drained. Existing public
-- images remain visible until each replacement commits. Preserve audit history.
create function app_private.ai_home_stories_queue_refresh(p_job_ids uuid[])
returns integer language plpgsql security definer set search_path='' as $$
declare settings app_private.ai_home_story_settings%rowtype; requested integer;
begin
 select * into settings from app_private.ai_home_story_settings where id for update;
 if settings.enabled or exists(select 1 from app_private.ai_home_story_jobs where status='generating') then
   raise exception 'pause_and_drain_required'; end if;
 requested:=cardinality(p_job_ids);
 if requested is null or requested not between 1 and 6 or requested<>(select count(distinct x) from unnest(p_job_ids) x) then raise exception 'invalid_refresh_jobs'; end if;
 if requested<>(select count(*) from app_private.ai_home_story_jobs j join app.home_stories h on h.id=j.home_story_id
     where j.id=any(p_job_ids) and j.status='published' and h.published and app_private.ai_home_story_source_visible(j)
       and (select count(*) from app_private.ai_home_story_jobs previous where previous.source_story_id=j.source_story_id)<2)
   then raise exception 'refresh_source_not_eligible'; end if;
 if requested+(select count(*) from app_private.ai_home_story_jobs where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>settings.max_attempts_per_day then raise exception 'daily_budget_exceeded'; end if;
 update app_private.ai_home_story_jobs set status='superseded' where id=any(p_job_ids);
 perform app_private.write_editorial_audit('ai_home_stories_refresh_queued',null,null,jsonb_build_object('jobIds',p_job_ids));
 return requested;
end;
$$;
revoke all on function app_private.ai_home_stories_queue_refresh(uuid[]) from public,anon,authenticated,service_role;

create or replace function api.service_claim_ai_home_story()
returns jsonb language plpgsql security definer set search_path='' as $$
declare settings app_private.ai_home_story_settings%rowtype; job app_private.ai_home_story_jobs%rowtype;
begin
  if not app_private.is_service_request() then raise exception using errcode='42501',message='service_role_required'; end if;
  select * into settings from app_private.ai_home_story_settings where id for update;
  if not settings.enabled then return null; end if;
  update app_private.ai_home_story_jobs set status='failed',finished_at=clock_timestamp(),error_code='lease_expired'
    where status='generating' and created_at<now()-interval '10 minutes';
  -- One outstanding image generation globally; cap counts failed attempts too.
  if exists(select 1 from app_private.ai_home_story_jobs where status='generating')
    or (select count(*) from app_private.ai_home_story_jobs where created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') >= settings.max_attempts_per_day
  then return null; end if;
  insert into app_private.ai_home_story_jobs(source_story_id,edition_fr_id,edition_ar_id,title_fr,title_ar,summary_fr,source_name,visual_context)
  select s.id,fr.id,ar.id,fr.title,ar.title,fr.summary,coalesce(p.name,'BotolaGO'),app_private.ai_home_story_visual_context(s.id,fr.id)
  from app.stories s
  join app.article_editions fr on fr.story_id=s.id and fr.language='fr'
  join app.article_editions ar on ar.story_id=s.id and ar.language='ar'
  left join app.publishers p on p.id=s.publisher_id
  where s.deleted_at is null and fr.status='published' and fr.visibility='public'
    and ar.status='published' and ar.visibility='public'
    and greatest(fr.published_at,ar.published_at) between now()-interval '72 hours' and now()
    and char_length(btrim(fr.title)) between 1 and 200 and char_length(btrim(ar.title)) between 1 and 200
    and not exists(select 1 from app_private.ai_home_story_jobs j where j.source_story_id=s.id and j.status in ('generating','published'))
    and not exists(select 1 from app_private.ai_home_story_jobs j join app.home_stories h on h.id=j.home_story_id where j.source_story_id=s.id and j.status='superseded' and not h.published)
    and (select count(*) from app_private.ai_home_story_jobs j where j.source_story_id=s.id)<2
  order by greatest(fr.published_at,ar.published_at) desc,s.id limit 1
  returning * into job;
  if job.id is null then return null; end if;
  return jsonb_build_object('id',job.id,'titleFr',job.title_fr,'titleAr',job.title_ar,'summaryFr',left(job.summary_fr,1200),'visualContext',job.visual_context);
end;
$$;

create or replace function api.service_complete_ai_home_story(p_job_id uuid,p_model text,p_width integer,p_height integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job app_private.ai_home_story_jobs%rowtype; enabled boolean; asset uuid; story uuid; storage_path text;
begin
  if not app_private.is_service_request() then raise exception using errcode='42501',message='service_role_required'; end if;
  select s.enabled into enabled from app_private.ai_home_story_settings s where id for update;
  select * into job from app_private.ai_home_story_jobs where id=p_job_id for update;
  if not found then raise exception using errcode='P0002',message='job_not_found'; end if;
  if job.status='published' then return jsonb_build_object('status','published','id',job.home_story_id); end if;
  if job.status<>'generating' then return jsonb_build_object('status',job.status); end if;
  if not enabled or job.created_at<now()-interval '10 minutes' or not app_private.ai_home_story_source_visible(job)
    or exists(select 1 from app_private.ai_home_story_jobs previous join app.home_stories h on h.id=previous.home_story_id where previous.source_story_id=job.source_story_id and previous.status='superseded' and not h.published) then
    update app_private.ai_home_story_jobs set status='failed',finished_at=clock_timestamp(),error_code='publication_cancelled' where id=job.id;
    return jsonb_build_object('status','failed');
  end if;
  if p_model is null or char_length(p_model) not between 1 and 100 or p_width is distinct from 1024 or p_height is distinct from 1536 then
    raise exception using errcode='22023',message='invalid_generated_image';
  end if;
  storage_path := 'news/ai-stories/'||job.id::text||'.png';
  if not exists(select 1 from storage.objects o where o.bucket_id='news-media' and o.name=storage_path) then
    raise exception using errcode='22023',message='generated_image_missing';
  end if;
  insert into app.media_assets(kind,storage_path,validation_status,validated_at,mime_type,width,height,alt_text,credit)
    values('article_hero',storage_path,'validated',clock_timestamp(),'image/png',p_width,p_height,left('Illustration IA : '||job.title_fr,300),null) returning id into asset;
  insert into app.home_stories(title_fr,title_ar,alt_fr,alt_ar,media_asset_id,credit,published)
    values(job.title_fr,job.title_ar,left('Illustration IA : '||job.title_fr,300),left('صورة توضيحية بالذكاء الاصطناعي: '||job.title_ar,300),asset,null,true) returning id into story;
  update app.home_stories h set published=false,version=version+1,updated_at=clock_timestamp()
    from app_private.ai_home_story_jobs previous where previous.source_story_id=job.source_story_id
      and previous.status='superseded' and h.id=previous.home_story_id and h.published;
  update app_private.ai_home_story_jobs set status='published',finished_at=clock_timestamp(),home_story_id=story,model=p_model where id=job.id;
  perform app_private.write_editorial_audit('ai_home_story_published',job.source_story_id,job.edition_fr_id,jsonb_build_object('homeStoryId',story,'jobId',job.id,'model',p_model));
  return jsonb_build_object('status','published','id',story);
end;
$$;
