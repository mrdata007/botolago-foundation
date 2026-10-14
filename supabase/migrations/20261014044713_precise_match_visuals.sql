-- Admin-only originals and edits. Never writes public media, stories or heroes.
-- Verified absent from production and staging migration histories on 2026-10-14.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('match-visual-drafts','match-visual-drafts',false,10485760,array['image/png'])
on conflict(id) do nothing;
DO $$ begin
  if exists(select 1 from storage.buckets where id='match-visual-drafts' and public) then
    raise exception 'match_visual_bucket_must_be_private';
  end if;
end $$;

create table app_private.match_visual_drafts (
  id uuid primary key,
  source_url text not null check(length(source_url) between 1 and 2048),
  source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
  label text not null check(length(btrim(label)) between 1 and 200),
  fixture_id uuid references app.fixtures(id),
  story_id uuid references app.stories(id),
  width integer not null check(width between 1 and 1536),
  height integer not null check(height between 1 and 1536),
  status text not null default 'held' check(status in ('held','processing','failed','discarded')),
  rights_status text not null default 'unverified' check(rights_status='unverified'),
  result_path text,
  edit_request jsonb,
  attempt_id uuid,
  attempts integer not null default 0,
  lease_until timestamptz,
  error_code text,
  version integer not null default 1,
  created_by uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(source_url,source_hash)
);
alter table app_private.match_visual_drafts enable row level security;
alter table app_private.match_visual_drafts force row level security;
revoke all on app_private.match_visual_drafts from public,anon,authenticated,service_role;
create index match_visual_draft_order on app_private.match_visual_drafts(created_at desc);

create function app_private.match_visual_draft_dto(d app_private.match_visual_drafts)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',d.id,'sourceUrl',d.source_url,'sourceHash',d.source_hash,'label',d.label,
 'fixtureId',d.fixture_id,'storyId',d.story_id,'width',d.width,'height',d.height,
 'status',d.status,'rightsStatus',d.rights_status,'hasResult',d.result_path is not null,
 'errorCode',d.error_code,'version',d.version,'createdAt',d.created_at,
 'updatedAt',d.updated_at,'attempts',d.attempts,'leaseUntil',d.lease_until)
$$;
revoke all on function app_private.match_visual_draft_dto(app_private.match_visual_drafts) from public,anon,authenticated,service_role;

create function api.admin_match_visual_drafts()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform app_private.admin_assert_permission('editorial.read');
 return (select coalesce(jsonb_agg(app_private.match_visual_draft_dto(d) order by d.created_at desc),'[]')
 from (select * from app_private.match_visual_drafts where status <> 'discarded' order by created_at desc limit 100) d);
end $$;

create function api.admin_get_match_visual_draft(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d app_private.match_visual_drafts;
begin
 perform app_private.admin_assert_permission('editorial.read');
 select * into d from app_private.match_visual_drafts where id=p_id and status <> 'discarded';
 if not found then raise exception 'draft_not_found'; end if;
 return app_private.match_visual_draft_dto(d) || jsonb_build_object('sourcePath',d.id::text||'/source.png','resultPath',d.result_path);
end $$;

create function app_private.import_match_visual_draft(p_data jsonb,p_actor uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare d app_private.match_visual_drafts; v_id uuid := (p_data->>'id')::uuid;
begin
 if (p_data->>'sourceUrl') !~ '^https://(www\.)?(instagram\.com/(p|reel)/[A-Za-z0-9_-]+/?|elbotola\.com/[^[:space:]]+)$'
   or not exists(select 1 from storage.objects where bucket_id='match-visual-drafts' and name=v_id::text||'/source.png') then
   raise exception 'draft_invalid_source';
 end if;
 insert into app_private.match_visual_drafts(id,source_url,source_hash,label,fixture_id,story_id,width,height,created_by)
 values(v_id,p_data->>'sourceUrl',p_data->>'sourceHash',btrim(p_data->>'label'),
 nullif(p_data->>'fixtureId','')::uuid,nullif(p_data->>'storyId','')::uuid,
 (p_data->>'width')::integer,(p_data->>'height')::integer,p_actor) on conflict(source_url,source_hash) do nothing returning * into d;
 if d.id is null then select * into d from app_private.match_visual_drafts where source_url=p_data->>'sourceUrl' and source_hash=p_data->>'sourceHash'; return app_private.match_visual_draft_dto(d); end if;
 perform app_private.write_editorial_audit('match_visual_imported',d.story_id,null,jsonb_build_object('draftId',d.id,'hold',true));
 return app_private.match_visual_draft_dto(d);
end $$;

revoke all on function app_private.import_match_visual_draft(jsonb,uuid) from public,anon,authenticated,service_role;
create function api.admin_import_match_visual_draft(p_data jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
 perform app_private.admin_assert_permission('editorial.write');
 return app_private.import_match_visual_draft(p_data,auth.uid());
end $$;

create function api.admin_begin_match_visual_edit(p_id uuid,p_version integer,p_attempt uuid,p_rect jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare d app_private.match_visual_drafts; x integer; y integer; w integer; h integer;
begin
 perform app_private.admin_assert_permission('editorial.write');
 -- Serializes the global provider budget across editors.
 perform pg_advisory_xact_lock(14044713);
 select * into d from app_private.match_visual_drafts where id=p_id for update;
 if not found or d.status='discarded' then raise exception 'draft_not_found'; end if;
 if d.version is distinct from p_version or (d.status='processing' and d.lease_until>clock_timestamp()) then raise exception 'draft_conflict'; end if;
 if d.attempts>=3 or (select count(*) from app_private.editorial_audit_events where event_type='match_visual_edit_started' and occurred_at>=(date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC'))>=6 then raise exception 'draft_edit_budget'; end if;
 x:=(p_rect->>'x')::integer; y:=(p_rect->>'y')::integer; w:=(p_rect->>'width')::integer; h:=(p_rect->>'height')::integer;
 if x is null or y is null or w is null or h is null or x<0 or y<0 or w<1 or h<1 or x+w>d.width or y+h>d.height
   or w::bigint*h>d.width::bigint*d.height/4 then raise exception 'draft_invalid_rectangle'; end if;
 if not exists(select 1 from storage.objects where bucket_id='match-visual-drafts' and name=d.id::text||'/'||p_attempt::text||'/branding.png') then raise exception 'draft_missing_branding'; end if;
 update app_private.match_visual_drafts set status='processing',attempt_id=p_attempt,edit_request=p_rect,
 lease_until=clock_timestamp()+interval '10 minutes',attempts=attempts+1,error_code=null,version=version+1,updated_at=clock_timestamp()
 where id=p_id returning * into d;
 perform app_private.write_editorial_audit('match_visual_edit_started',d.story_id,null,jsonb_build_object('draftId',d.id,'attemptId',p_attempt,'hold',true));
 return app_private.match_visual_draft_dto(d) || jsonb_build_object('attemptId',p_attempt,'rectangle',p_rect,'sourcePath',d.id::text||'/source.png','brandingPath',d.id::text||'/'||p_attempt::text||'/branding.png');
end $$;

create function api.service_finish_match_visual_edit(p_id uuid,p_attempt uuid,p_error text default null)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare d app_private.match_visual_drafts; v_result text:=p_id::text||'/'||p_attempt::text||'/result.png';
begin
 if not app_private.is_service_request() then raise exception using errcode='42501',message='service_only'; end if;
 select * into d from app_private.match_visual_drafts where id=p_id and status='processing' and attempt_id=p_attempt and lease_until>clock_timestamp() for update;
 if not found then return false; end if;
 if p_error is null and not exists(select 1 from storage.objects where bucket_id='match-visual-drafts' and name=v_result) then raise exception 'draft_missing_result'; end if;
 update app_private.match_visual_drafts set status=case when p_error is null then 'held' else 'failed' end,
 result_path=case when p_error is null then v_result else result_path end,
 error_code=case when p_error is null then null else 'draft_edit_failed' end,lease_until=null,version=version+1,updated_at=clock_timestamp() where id=p_id;
 perform app_private.write_editorial_audit('match_visual_edit_finished',d.story_id,null,jsonb_build_object('draftId',d.id,'attemptId',p_attempt,'hold',true,'success',p_error is null));
 return true;
end $$;

create function api.admin_discard_match_visual_draft(p_id uuid,p_version integer)
returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 perform app_private.admin_assert_permission('editorial.write');
 update app_private.match_visual_drafts set status='discarded',lease_until=null,version=version+1,updated_at=clock_timestamp() where id=p_id and version=p_version and status<>'discarded';
 if not found then raise exception 'draft_conflict'; end if;
 perform app_private.write_editorial_audit('match_visual_discarded',null,null,jsonb_build_object('draftId',p_id));
 return true;
end $$;

revoke all on function api.admin_match_visual_drafts(),api.admin_get_match_visual_draft(uuid),api.admin_import_match_visual_draft(jsonb),api.admin_begin_match_visual_edit(uuid,integer,uuid,jsonb),api.admin_discard_match_visual_draft(uuid,integer),api.service_finish_match_visual_edit(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function api.admin_match_visual_drafts(),api.admin_get_match_visual_draft(uuid),api.admin_import_match_visual_draft(jsonb),api.admin_begin_match_visual_edit(uuid,integer,uuid,jsonb),api.admin_discard_match_visual_draft(uuid,integer) to authenticated;
grant execute on function api.service_finish_match_visual_edit(uuid,uuid,text) to service_role;

-- Optional monitoring. Default off; no feed access or imports until configured.
create table app_private.match_visual_collection_settings (
 id boolean primary key default true check(id), enabled boolean not null default false
);
insert into app_private.match_visual_collection_settings(id) values(true);
alter table app_private.match_visual_collection_settings enable row level security;
alter table app_private.match_visual_collection_settings force row level security;
revoke all on app_private.match_visual_collection_settings from public,anon,authenticated,service_role;

create function app_private.match_visual_collection_configure(p_enabled boolean)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
 update app_private.match_visual_collection_settings set enabled=p_enabled where id;
end $$;
revoke all on function app_private.match_visual_collection_configure(boolean) from public,anon,authenticated,service_role;
grant execute on function app_private.match_visual_collection_configure(boolean) to postgres;

create function api.service_match_visual_collection_enabled()
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.is_service_request() then raise exception using errcode='42501',message='service_only'; end if;
 return (select enabled from app_private.match_visual_collection_settings where id);
end $$;

create function api.service_import_match_visual_draft(p_data jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
 if not app_private.is_service_request() then raise exception using errcode='42501',message='service_only'; end if;
 perform pg_advisory_xact_lock(14044714);
 if not (select enabled from app_private.match_visual_collection_settings where id for share) then raise exception 'draft_collection_paused'; end if;
 -- Duplicate sources, including discarded ones, remain suppressed indefinitely.
 if exists(select 1 from app_private.match_visual_drafts where source_url=p_data->>'sourceUrl' and source_hash=p_data->>'sourceHash') then
   return (select app_private.match_visual_draft_dto(d) from app_private.match_visual_drafts d where source_url=p_data->>'sourceUrl' and source_hash=p_data->>'sourceHash');
 end if;
 if (select count(*) from app_private.match_visual_drafts where created_by is null and created_at >= (date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC'))>=36 then raise exception 'draft_collection_budget'; end if;
 return app_private.import_match_visual_draft(p_data,null);
end $$;
revoke all on function api.service_match_visual_collection_enabled(),api.service_import_match_visual_draft(jsonb) from public,anon,authenticated,service_role;
grant execute on function api.service_match_visual_collection_enabled(),api.service_import_match_visual_draft(jsonb) to service_role;

create function app_private.match_visual_collection_tick()
returns bigint language plpgsql volatile security definer set search_path='' as $$
declare base_url text;
begin
 if not (select enabled from app_private.match_visual_collection_settings where id) then return null; end if;
 select functions_base_url into base_url from app_private.notification_email_settings where id;
 return app_private.invoke_scheduled_function(base_url,'match-visual-collect','{}'::jsonb);
end $$;
revoke all on function app_private.match_visual_collection_tick() from public,anon,authenticated,service_role;
grant execute on function app_private.match_visual_collection_tick() to postgres;
select cron.schedule('match-visual-collect','7,17,27,37,47,57 * * * *','select app_private.match_visual_collection_tick();');
