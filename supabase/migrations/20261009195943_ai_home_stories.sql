-- Automatic news illustrations. Ships paused; activation follows guarded rollout.
-- No credentials in SQL. The Edge Function reads OpenAI_Image_Gen server-side.
alter table app.home_stories drop constraint home_stories_title_fr_check;
alter table app.home_stories drop constraint home_stories_title_ar_check;
alter table app.home_stories add constraint home_stories_title_fr_check check (char_length(btrim(title_fr)) between 1 and 200);
alter table app.home_stories add constraint home_stories_title_ar_check check (char_length(btrim(title_ar)) between 1 and 200);

create table app_private.ai_home_story_settings (
  id boolean primary key default true check(id),
  enabled boolean not null default false,
  max_attempts_per_day integer not null default 6 check(max_attempts_per_day between 1 and 24)
);
insert into app_private.ai_home_story_settings(id) values(true);
create table app_private.ai_home_story_jobs (
  id uuid primary key default gen_random_uuid(),
  source_story_id uuid not null references app.stories(id),
  edition_fr_id uuid not null references app.article_editions(id),
  edition_ar_id uuid not null references app.article_editions(id),
  title_fr text not null,
  title_ar text not null,
  summary_fr text not null,
  source_name text not null,
  status text not null default 'generating' check(status in ('generating','published','failed')),
  created_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  home_story_id uuid unique references app.home_stories(id),
  model text,
  error_code text check(error_code is null or error_code ~ '^[a-z0-9_]{1,80}$')
);
create unique index ai_home_story_one_source on app_private.ai_home_story_jobs(source_story_id) where status in ('generating','published');
create index ai_home_story_jobs_created on app_private.ai_home_story_jobs(created_at);
create index ai_home_story_jobs_source on app_private.ai_home_story_jobs(source_story_id);
alter table app_private.ai_home_story_settings enable row level security;
alter table app_private.ai_home_story_settings force row level security;
alter table app_private.ai_home_story_jobs enable row level security;
alter table app_private.ai_home_story_jobs force row level security;
revoke all on app_private.ai_home_story_settings,app_private.ai_home_story_jobs from public,anon,authenticated,service_role;

create function app_private.ai_home_stories_configure(p_enabled boolean, p_max_attempts_per_day integer default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  -- Same row lock used by claiming and publication: pausing wins before later writes.
  update app_private.ai_home_story_settings set enabled=p_enabled,
    max_attempts_per_day=coalesce(p_max_attempts_per_day,max_attempts_per_day) where id;
end;
$$;
revoke all on function app_private.ai_home_stories_configure(boolean,integer) from public,anon,authenticated,service_role;

create function app_private.ai_home_story_source_visible(p_job app_private.ai_home_story_jobs)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(
    select 1 from app.stories s
    join app.article_editions fr on fr.id=p_job.edition_fr_id and fr.story_id=s.id
    join app.article_editions ar on ar.id=p_job.edition_ar_id and ar.story_id=s.id
    where s.id=p_job.source_story_id and s.deleted_at is null
      and fr.status='published' and fr.visibility='public'
      and ar.status='published' and ar.visibility='public'
      and fr.title=p_job.title_fr and ar.title=p_job.title_ar and fr.summary=p_job.summary_fr
      and greatest(fr.published_at,ar.published_at) between now()-interval '72 hours' and now()
  )
$$;
revoke all on function app_private.ai_home_story_source_visible(app_private.ai_home_story_jobs) from public,anon,authenticated,service_role;

create function api.service_claim_ai_home_story()
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
  insert into app_private.ai_home_story_jobs(source_story_id,edition_fr_id,edition_ar_id,title_fr,title_ar,summary_fr,source_name)
  select s.id,fr.id,ar.id,fr.title,ar.title,fr.summary,coalesce(p.name,'BotolaGO')
  from app.stories s
  join app.article_editions fr on fr.story_id=s.id and fr.language='fr'
  join app.article_editions ar on ar.story_id=s.id and ar.language='ar'
  left join app.publishers p on p.id=s.publisher_id
  where s.deleted_at is null and fr.status='published' and fr.visibility='public'
    and ar.status='published' and ar.visibility='public'
    and greatest(fr.published_at,ar.published_at) between now()-interval '72 hours' and now()
    and char_length(btrim(fr.title)) between 1 and 200 and char_length(btrim(ar.title)) between 1 and 200
    and not exists(select 1 from app_private.ai_home_story_jobs j where j.source_story_id=s.id and j.status in ('generating','published'))
    and (select count(*) from app_private.ai_home_story_jobs j where j.source_story_id=s.id)<2
  order by greatest(fr.published_at,ar.published_at) desc,s.id limit 1
  returning * into job;
  if job.id is null then return null; end if;
  return jsonb_build_object('id',job.id,'titleFr',job.title_fr,'titleAr',job.title_ar,'summaryFr',left(job.summary_fr,1200));
end;
$$;

create function api.service_complete_ai_home_story(p_job_id uuid,p_model text,p_width integer,p_height integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job app_private.ai_home_story_jobs%rowtype; enabled boolean; asset uuid; story uuid; storage_path text;
begin
  if not app_private.is_service_request() then raise exception using errcode='42501',message='service_role_required'; end if;
  select s.enabled into enabled from app_private.ai_home_story_settings s where id for update;
  select * into job from app_private.ai_home_story_jobs where id=p_job_id for update;
  if not found then raise exception using errcode='P0002',message='job_not_found'; end if;
  if job.status='published' then return jsonb_build_object('status','published','id',job.home_story_id); end if;
  if job.status<>'generating' then return jsonb_build_object('status',job.status); end if;
  if not enabled or job.created_at<now()-interval '10 minutes' or not app_private.ai_home_story_source_visible(job) then
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
    values('image',storage_path,'validated',clock_timestamp(),'image/png',p_width,p_height,left('Illustration IA : '||job.title_fr,300),'BotolaGO · OpenAI') returning id into asset;
  insert into app.home_stories(title_fr,title_ar,alt_fr,alt_ar,media_asset_id,credit,published)
    values(job.title_fr,job.title_ar,left('Illustration IA : '||job.title_fr,300),left('صورة توضيحية بالذكاء الاصطناعي: '||job.title_ar,300),asset,'BotolaGO · OpenAI',true) returning id into story;
  update app_private.ai_home_story_jobs set status='published',finished_at=clock_timestamp(),home_story_id=story,model=p_model where id=job.id;
  perform app_private.write_editorial_audit('ai_home_story_published',job.source_story_id,job.edition_fr_id,jsonb_build_object('homeStoryId',story,'jobId',job.id,'model',p_model));
  return jsonb_build_object('status','published','id',story);
end;
$$;

create function api.service_fail_ai_home_story(p_job_id uuid,p_error_code text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not app_private.is_service_request() then raise exception using errcode='42501',message='service_role_required'; end if;
  update app_private.ai_home_story_jobs set status='failed',finished_at=clock_timestamp(),error_code=p_error_code where id=p_job_id and status='generating';
end;
$$;
revoke all on function api.service_claim_ai_home_story(),api.service_complete_ai_home_story(uuid,text,integer,integer),api.service_fail_ai_home_story(uuid,text) from public,anon,authenticated;
grant execute on function api.service_claim_ai_home_story(),api.service_complete_ai_home_story(uuid,text,integer,integer),api.service_fail_ai_home_story(uuid,text) to service_role;

create or replace function app_private.home_story_dto(story app.home_stories)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',story.id,'titleFr',story.title_fr,'titleAr',story.title_ar,
    'altFr',story.alt_fr,'altAr',story.alt_ar,'mediaAssetId',story.media_asset_id,
    'storagePath',media.storage_path,'credit',story.credit,'destination',null,
    'position',story.position,'published',story.published,'version',story.version,
    'generated',job.id is not null,'sourceName',job.source_name)
  from app.media_assets media left join app_private.ai_home_story_jobs job on job.home_story_id=story.id
  where media.id=story.media_asset_id
$$;
create or replace function api.home_stories()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(app_private.home_story_dto(story) order by story.position,story.created_at desc,story.id),'[]'::jsonb)
  from (
    select h.* from app.home_stories h join app.media_assets m on m.id=h.media_asset_id
    left join app_private.ai_home_story_jobs job on job.home_story_id=h.id
    where h.published and m.validation_status='validated' and m.storage_path like 'news/%'
      and (job.id is null or app_private.ai_home_story_source_visible(job))
    order by h.position,h.created_at desc,h.id limit 12
  ) story
$$;

create function app_private.ai_home_stories_tick()
returns bigint language plpgsql security definer set search_path='' as $$
declare base_url text;
begin
  if not (select enabled from app_private.ai_home_story_settings where id) then return null; end if;
  select functions_base_url into base_url from app_private.notification_email_settings where id;
  return app_private.invoke_scheduled_function(base_url,'home-story-generate','{}'::jsonb);
end;
$$;
revoke all on function app_private.ai_home_stories_tick() from public,anon,authenticated,service_role;
grant execute on function app_private.ai_home_stories_tick() to postgres;
select cron.schedule('ai-home-stories','4,14,24,34,44,54 * * * *','select app_private.ai_home_stories_tick();');
