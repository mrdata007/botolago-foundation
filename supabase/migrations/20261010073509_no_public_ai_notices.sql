-- Public editorial rule: no AI notices on articles or illustrations.
-- Function guards and service-role-only privileges are preserved.
do $guard$
begin
  if (select enabled from app_private.ai_content_settings)
    or (select enabled from app_private.ai_home_story_settings)
    or exists(select 1 from app_private.ai_home_story_jobs where status='generating') then
    raise exception 'Pause article and image publishing and wait for workers before applying';
  end if;
end $guard$;

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
    values('article_hero',storage_path,'validated',clock_timestamp(),'image/png',p_width,p_height,left('Illustration : '||job.title_fr,300),null) returning id into asset;
  insert into app.home_stories(title_fr,title_ar,alt_fr,alt_ar,media_asset_id,credit,published)
    values(job.title_fr,job.title_ar,left('Illustration : '||job.title_fr,300),left('صورة توضيحية: '||job.title_ar,300),asset,null,true) returning id into story;
  update app.home_stories h set published=false,version=version+1,updated_at=clock_timestamp()
    from app_private.ai_home_story_jobs previous where previous.source_story_id=job.source_story_id
      and previous.status='superseded' and h.id=previous.home_story_id and h.published;
  update app_private.ai_home_story_jobs set status='published',finished_at=clock_timestamp(),home_story_id=story,model=p_model where id=job.id;
  perform app_private.write_editorial_audit('ai_home_story_published',job.source_story_id,job.edition_fr_id,jsonb_build_object('homeStoryId',story,'jobId',job.id,'model',p_model));
  return jsonb_build_object('status','published','id',story);
end;
$$;

-- Remove only the exact footer the publisher appended to its own editions.
-- Source links, article facts, private model records and audit events remain.
update app.article_editions e
set body_html = replace(replace(e.body_html,
  '<p><em>Cet article a été rédigé avec l&#39;aide de l&#39;intelligence artificielle à partir de données et d&#39;articles publics.</em></p>', ''),
  '<p><em>كُتب هذا المقال بمساعدة الذكاء الاصطناعي اعتماداً على بيانات ومقالات منشورة.</em></p>', '')
from app_private.ai_content_articles a
where a.article_edition_id = e.id
  and (e.body_html like '%<p><em>Cet article a été rédigé avec l&#39;aide de l&#39;intelligence artificielle à partir de données et d&#39;articles publics.</em></p>%'
    or e.body_html like '%<p><em>كُتب هذا المقال بمساعدة الذكاء الاصطناعي اعتماداً على بيانات ومقالات منشورة.</em></p>%');

-- Touch only illustrations owned by this generator, including superseded ones.
update app.home_stories s
set alt_fr = replace(s.alt_fr, 'Illustration IA : ', 'Illustration : '),
    alt_ar = replace(s.alt_ar, 'صورة توضيحية بالذكاء الاصطناعي: ', 'صورة توضيحية: '),
    credit = case when s.credit = 'BotolaGO · OpenAI' then null else s.credit end,
    version = s.version + 1, updated_at = clock_timestamp()
from app_private.ai_home_story_jobs j
where j.home_story_id = s.id
  and (s.alt_fr like 'Illustration IA : %'
    or s.alt_ar like 'صورة توضيحية بالذكاء الاصطناعي: %'
    or s.credit = 'BotolaGO · OpenAI');

update app.media_assets m
set alt_text = replace(m.alt_text, 'Illustration IA : ', 'Illustration : '),
    credit = case when m.credit = 'BotolaGO · OpenAI' then null else m.credit end,
    updated_at = clock_timestamp()
from app.home_stories s join app_private.ai_home_story_jobs j on j.home_story_id = s.id
where m.id = s.media_asset_id
  and (m.alt_text like 'Illustration IA : %' or m.credit = 'BotolaGO · OpenAI');
