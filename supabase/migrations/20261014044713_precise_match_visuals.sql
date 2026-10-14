-- Protected-pixel match artwork. No published rows or automation switches are
-- edited. Rollout requires paused/drained workers and reviewed deployment.
do $guard$
begin
  perform 1 from app_private.ai_home_story_settings where id for update;
  if (select enabled from app_private.ai_home_story_settings where id)
    or exists(select 1 from app_private.ai_home_story_jobs where status='generating') then
    raise exception 'pause_and_drain_image_workers_required';
  end if;
end $guard$;

create table app_private.precise_match_visual_briefs (
  story_id uuid primary key references app.stories(id) on delete cascade,
  fixture_id uuid not null references app.fixtures(id),
  manifest jsonb not null check(jsonb_typeof(manifest)='object' and octet_length(manifest::text)<=65536),
  active boolean not null default true,
  registered_at timestamptz not null default clock_timestamp()
);
alter table app_private.precise_match_visual_briefs enable row level security;
alter table app_private.precise_match_visual_briefs force row level security;
revoke all on app_private.precise_match_visual_briefs from public,anon,authenticated,service_role;
alter table app_private.ai_home_story_jobs add column article_media_asset_id uuid references app.media_assets(id);
create index precise_match_visual_article_asset on app_private.ai_home_story_jobs(article_media_asset_id) where article_media_asset_id is not null;

-- The owner compares lettering/artwork with THIS snapshot, never an LLM's
-- reading of a screenshot. Own goals retain their real event/team identities.
create function app_private.precise_match_facts(p_fixture uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('fixtureId',f.id,'homeTeamId',f.home_team_id,'awayTeamId',f.away_team_id,
    'home',h.name,'away',a.name,'status',f.status,'homeScore',f.home_score,'awayScore',f.away_score,
    'kickoff',f.kickoff_at,'venue',v.default_name,
    'goals',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'teamId',e.team_id,'playerId',e.player_id,
      'player',p.display_name,'type',e.event_type,'minute',e.minute,'addedTime',e.added_time)
      order by e.minute,e.added_time,e.sequence_number,e.id),'[]'::jsonb)
      from app.match_events e left join app.players p on p.id=e.player_id
      where e.fixture_id=f.id and e.event_type in ('goal','penalty_goal','own_goal')))
  from app.fixtures f join app.teams h on h.id=f.home_team_id join app.teams a on a.id=f.away_team_id
  left join app.venues v on v.id=f.venue_id where f.id=p_fixture
$$;
revoke all on function app_private.precise_match_facts(uuid) from public,anon,authenticated,service_role;

-- Owner-only registration, using approved derivatives and masks reviewed for
-- both sizes. Public Instagram access is not a derivative licence.
create function app_private.register_precise_match_visual(p_story uuid,p_manifest jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare fixture uuid; edition uuid; variant text; role text; asset jsonb;
begin
  perform 1 from app_private.ai_home_story_settings where id for update;
  if (select enabled from app_private.ai_home_story_settings where id)
    or exists(select 1 from app_private.ai_home_story_jobs where status='generating') then
    raise exception 'pause_and_drain_image_workers_required'; end if;
  select e.id,a.fixture_id into edition,fixture from app.article_editions e
    join app_private.ai_content_articles a on a.article_edition_id=e.id
    where e.story_id=p_story and e.language='fr';
  if fixture is null or p_manifest->>'fixtureId' is distinct from fixture::text
    or p_manifest->'version' is distinct from '1'::jsonb
    or p_manifest->'facts' is distinct from app_private.precise_match_facts(fixture)
    or not coalesce(p_manifest->'approval' @> '{"faces":true,"kits":true,"crests":true,"scores":true,"lettering":true,"derivatives":true,"branding":true}'::jsonb,false)
    or p_manifest->>'referenceUrl' is null or p_manifest->>'referenceUrl' !~ '^https://[^[:space:]@]+'
    or char_length(coalesce(p_manifest->>'credit','')) not between 1 and 200
    or p_manifest->>'approvedAt' is null or (p_manifest->>'approvedAt')::timestamptz>clock_timestamp()
    or p_manifest->>'rightsUntil' is null or (p_manifest->>'rightsUntil')::timestamptz<=clock_timestamp()
    or (p_manifest->'facts'->>'status') not in ('finished','scheduled','not_started') then
    raise exception 'invalid_precise_match_approval'; end if;
  foreach variant in array array['story','article'] loop
    foreach role in array array['source','protection','branding'] loop
      asset:=p_manifest->variant->role;
      if asset->>'path' is null or asset->>'path' !~ '^news/match-visual-inputs/[0-9a-f-]{36}/[a-z0-9_-]+\.png$'
        or asset->>'sha256' is null or asset->>'sha256' !~ '^[0-9a-f]{64}$'
        or not exists(select 1 from storage.objects o where o.bucket_id='news-media' and o.name=asset->>'path') then
        raise exception 'precise_visual_asset_missing_or_invalid'; end if;
    end loop;
  end loop;
  insert into app_private.precise_match_visual_briefs(story_id,fixture_id,manifest) values(p_story,fixture,p_manifest)
    on conflict(story_id) do update set fixture_id=excluded.fixture_id,manifest=excluded.manifest,active=true,registered_at=clock_timestamp();
  -- A new reviewed revision may replace an active predecessor. An identical
  -- registration is idempotent; a manually unpublished story stays suppressed.
  update app_private.ai_home_story_jobs j set status='superseded'
    from app.home_stories h where j.source_story_id=p_story and j.status='published'
      and h.id=j.home_story_id and h.published
      and j.visual_context->'preciseMatchVisual' is distinct from p_manifest;
  perform app_private.write_editorial_audit('precise_match_visual_approved',p_story,edition,jsonb_build_object('fixtureId',fixture));
end;
$$;
revoke all on function app_private.register_precise_match_visual(uuid,jsonb) from public,anon,authenticated,service_role;

create function app_private.precise_match_visual_ready(p_story uuid,p_edition uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from app_private.precise_match_visual_briefs b
    join app_private.ai_content_articles a on a.article_edition_id=p_edition and a.fixture_id=b.fixture_id
    where b.story_id=p_story and b.active
      and (b.manifest->>'rightsUntil')::timestamptz>now()
      and b.manifest->'facts'=app_private.precise_match_facts(b.fixture_id)
      and not exists(select 1 from unnest(array['story','article']) variant
        cross join unnest(array['source','protection','branding']) role
        where not exists(select 1 from storage.objects o where o.bucket_id='news-media' and o.name=b.manifest->variant->role->>'path')))
$$;
revoke all on function app_private.precise_match_visual_ready(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function app_private.ai_home_story_visual_context(p_story uuid,p_edition uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select context.value || jsonb_build_object('railLabel',app_private.ai_home_story_rail_label(context.value))
 from lateral (select jsonb_build_object(
   'article',left(regexp_replace(e.body_html,'<[^>]+>',' ','g'),3000),'kind',a.kind,
   'match',case when f.id is not null then jsonb_build_object('home',h.name,'away',v.name,
     'homeScore',f.home_score,'awayScore',f.away_score,'status',f.status,'kickoff',f.kickoff_at) else null end,
   'articleHeroFrId',e.hero_asset_id,
   'articleHeroArId',(select ar.hero_asset_id from app.article_editions ar where ar.story_id=p_story and ar.language='ar'),
   'preciseMatchVisual',(select b.manifest from app_private.precise_match_visual_briefs b
     where b.story_id=p_story and app_private.precise_match_visual_ready(p_story,p_edition)),
   'clubs',(select coalesce(jsonb_agg(t.name),'[]'::jsonb) from app.story_teams st join app.teams t on t.id=st.team_id where st.story_id=p_story)) as value
 from app.article_editions e left join app_private.ai_content_articles a on a.article_edition_id=e.id
 left join app.fixtures f on f.id=a.fixture_id left join app.teams h on h.id=f.home_team_id left join app.teams v on v.id=f.away_team_id
 where e.id=p_edition and e.story_id=p_story) context
$$;

-- Also used for landscape media, without the Home rail's 72-hour age limit.
create function app_private.precise_match_job_valid(p_job app_private.ai_home_story_jobs)
returns boolean language sql stable security invoker set search_path='' as $$
  select p_job.visual_context->'preciseMatchVisual' is not null
    and p_job.visual_context->'preciseMatchVisual'<>'null'::jsonb
    and app_private.precise_match_visual_ready(p_job.source_story_id,p_job.edition_fr_id)
    and exists(select 1 from app_private.precise_match_visual_briefs b where b.story_id=p_job.source_story_id
      and b.manifest=p_job.visual_context->'preciseMatchVisual')
    and exists(select 1 from app.stories s join app.article_editions fr on fr.id=p_job.edition_fr_id and fr.story_id=s.id
      join app.article_editions ar on ar.id=p_job.edition_ar_id and ar.story_id=s.id
      where s.id=p_job.source_story_id and s.deleted_at is null and fr.status='published' and fr.visibility='public'
        and ar.status='published' and ar.visibility='public' and fr.title=p_job.title_fr and ar.title=p_job.title_ar and fr.summary=p_job.summary_fr)
$$;
revoke all on function app_private.precise_match_job_valid(app_private.ai_home_story_jobs) from public,anon,authenticated,service_role;

create or replace function app_private.ai_home_story_source_visible(p_job app_private.ai_home_story_jobs)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from app.stories s join app.article_editions fr on fr.id=p_job.edition_fr_id and fr.story_id=s.id
   join app.article_editions ar on ar.id=p_job.edition_ar_id and ar.story_id=s.id
   where s.id=p_job.source_story_id and s.deleted_at is null and fr.status='published' and fr.visibility='public'
     and ar.status='published' and ar.visibility='public' and fr.title=p_job.title_fr and ar.title=p_job.title_ar and fr.summary=p_job.summary_fr
     and greatest(fr.published_at,ar.published_at) between now()-interval '72 hours' and now())
   and (p_job.visual_context->'match' is null or p_job.visual_context->'match'='null'::jsonb
     or app_private.precise_match_job_valid(p_job))
$$;

create function api.service_complete_precise_home_story(p_job_id uuid,p_renderer text,p_article_width integer,p_article_height integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job app_private.ai_home_story_jobs%rowtype; result jsonb; article_asset uuid; story_asset uuid; path text; photo_credit text;
begin
  if not app_private.is_service_request() then raise exception using errcode='42501',message='service_role_required'; end if;
  perform 1 from app_private.ai_home_story_settings where id for update;
  select * into job from app_private.ai_home_story_jobs where id=p_job_id for update;
  if not found then raise exception 'job_not_found'; end if;
  if job.status='published' and job.article_media_asset_id is not null then
    return jsonb_build_object('status','published','id',job.home_story_id); end if;
  if job.status<>'generating' then return jsonb_build_object('status',job.status); end if;
  if p_renderer is distinct from 'botolago-protected-pixels-v1' or p_article_width is distinct from 1536 or p_article_height is distinct from 1024 then
    raise exception 'invalid_precise_renderer'; end if;
  -- Serialize against an editor replacing a hero or withdrawing an edition.
  perform 1 from app.article_editions where id in (job.edition_fr_id,job.edition_ar_id) order by id for update;
  if not app_private.precise_match_job_valid(job)
    or exists(select 1 from app.article_editions e where e.id in (job.edition_fr_id,job.edition_ar_id)
      and coalesce(to_jsonb(e.hero_asset_id),'null'::jsonb) is distinct from
        coalesce(case when e.language='fr' then job.visual_context->'articleHeroFrId' else job.visual_context->'articleHeroArId' end,'null'::jsonb)) then
    update app_private.ai_home_story_jobs set status='failed',finished_at=clock_timestamp(),error_code='precise_source_changed' where id=job.id;
    return jsonb_build_object('status','failed'); end if;
  path:='news/match-covers/'||job.id::text||'.png';
  if not exists(select 1 from storage.objects o where o.bucket_id='news-media' and o.name=path) then raise exception 'precise_article_image_missing'; end if;
  -- Preserve the existing pause, lease, withdrawal and manual suppression guards.
  result:=api.service_complete_ai_home_story(job.id,p_renderer,1024,1536);
  if result->>'status'<>'published' then return result; end if;
  photo_credit:=job.visual_context->'preciseMatchVisual'->>'credit';
  select h.media_asset_id into story_asset from app.home_stories h where h.id=(result->>'id')::uuid;
  update app.media_assets set credit=photo_credit,alt_text=left('Affiche du match : '||job.title_fr,300) where id=story_asset;
  update app.home_stories set credit=photo_credit,alt_fr=left('Affiche du match : '||job.title_fr,300),alt_ar=left('ملصق المباراة: '||job.title_ar,300) where id=(result->>'id')::uuid;
  insert into app.media_assets(kind,storage_path,validation_status,validated_at,mime_type,width,height,alt_text,credit)
    values('article_hero',path,'validated',clock_timestamp(),'image/png',1536,1024,left('Affiche du match : '||job.title_fr,300),photo_credit) returning id into article_asset;
  update app.article_editions set hero_asset_id=article_asset,updated_at=clock_timestamp() where id in (job.edition_fr_id,job.edition_ar_id);
  update app_private.ai_home_story_jobs set article_media_asset_id=article_asset where id=job.id;
  perform app_private.write_editorial_audit('precise_match_visual_published',job.source_story_id,job.edition_fr_id,
    jsonb_build_object('jobId',job.id,'articleMediaAssetId',article_asset,'renderer',p_renderer));
  return result;
end;
$$;
revoke all on function api.service_complete_precise_home_story(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function api.service_complete_precise_home_story(uuid,text,integer,integer) to service_role;

create or replace function app_private.news_media_dto(asset_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select case when media.id is null then null else jsonb_build_object('id',media.id,'sourceUrl',media.source_url,
   'storagePath',media.storage_path,'alt',media.alt_text,'caption',media.caption,'credit',coalesce(media.credit,media.attribution),
   'width',media.width,'height',media.height,'mimeType',media.mime_type) end
 from (select 1) seed left join app.media_assets media on media.id=asset_id and media.validation_status='validated'
   and not exists(select 1 from app_private.ai_home_story_jobs j where j.article_media_asset_id=media.id and not app_private.precise_match_job_valid(j))
$$;

-- Unapproved match sources are skipped before reserving an attempt.
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
    and not exists(select 1 from app_private.ai_content_articles precise_source
      where precise_source.article_edition_id=fr.id and precise_source.fixture_id is not null
        and not app_private.precise_match_visual_ready(s.id,fr.id))
    and ar.status='published' and ar.visibility='public'
    and greatest(fr.published_at,ar.published_at) between now()-interval '72 hours' and now()
    and char_length(btrim(fr.title)) between 1 and 200 and char_length(btrim(ar.title)) between 1 and 200
    and not exists(select 1 from app_private.ai_home_story_jobs j where j.source_story_id=s.id and j.status in ('generating','published'))
    and not exists(select 1 from app_private.ai_home_story_jobs j join app.home_stories h on h.id=j.home_story_id where j.source_story_id=s.id and j.status='superseded' and not h.published)
    and case when exists(select 1 from app_private.ai_content_articles a where a.article_edition_id=fr.id and a.fixture_id is not null) then
      (select count(*) from app_private.ai_home_story_jobs j where j.source_story_id=s.id
        and j.visual_context->'preciseMatchVisual'=(select b.manifest from app_private.precise_match_visual_briefs b where b.story_id=s.id))<2
      else (select count(*) from app_private.ai_home_story_jobs j where j.source_story_id=s.id)<2 end
  order by exists(select 1 from app_private.ai_home_story_jobs pending where pending.source_story_id=s.id and pending.status='superseded') desc,
    greatest(fr.published_at,ar.published_at) desc,s.id limit 1
  returning * into job;
  if job.id is null then return null; end if;
  return jsonb_build_object('id',job.id,'titleFr',job.title_fr,'titleAr',job.title_ar,'summaryFr',left(job.summary_fr,1200),'visualContext',job.visual_context);
end;
$$;

-- An old worker cannot publish a generic image for a precise match job.
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
  if job.visual_context->'match' is not null and job.visual_context->'match'<>'null'::jsonb
    and p_model is distinct from 'botolago-protected-pixels-v1' then
    update app_private.ai_home_story_jobs set status='failed',finished_at=clock_timestamp(),error_code='precise_renderer_required' where id=job.id;
    return jsonb_build_object('status','failed'); end if;
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
