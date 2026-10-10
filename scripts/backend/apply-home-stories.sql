-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn): home image stories.
-- Owner-authorized deployment. Check external writers/workflows first.
-- Run this exact file for rehearsal; after verifying rollback, change only
-- the final rollback to commit. Never loosen a guard. No story content is seeded.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select app_private.hold_scheduled_jobs();
lock table app.media_assets, app_private.editorial_audit_events in share mode;

do $preflight$
begin
  if to_regclass('app.home_stories') is not null then
    raise exception 'stop: home stories already exists';
  end if;
  if (select max(version) from supabase_migrations.schema_migrations) <> '20261009091728'
     or (select count(*) from supabase_migrations.schema_migrations) <> 166 then
    raise exception 'stop: production migration baseline changed';
  end if;
  if exists(select 1 from pg_stat_activity where pid<>pg_backend_pid()
    and backend_type='client backend' and state='active'
    and query !~* '^\s*(select|show)\s') then
    raise exception 'stop: another database writer is active';
  end if;
  if exists(select 1 from (values
    ('app_private.admin_assert_permission(text,boolean)','a9bb48ed096f051119501ff54afefacb'),
    ('app_private.write_editorial_audit(text,uuid,uuid,jsonb)','ecac47c5acd0cbf8897ad47670ec6a10'),
    ('app_private.hold_scheduled_jobs()','744f5327e1a6d3d1ae6904e556bc25b3')
  ) expected(routine,source_md5) left join pg_proc p on p.oid=to_regprocedure(expected.routine)
    where md5(p.prosrc) is distinct from expected.source_md5) then
    raise exception 'stop: reviewed authorization or scheduling helper changed';
  end if;
  if not exists(select 1 from storage.buckets where id='news-media' and public) then
    raise exception 'stop: existing news-media upload bucket is missing';
  end if;
end;
$preflight$;
create temporary table home_stories_rollout_baseline on commit drop as
select (select count(*) from app.media_assets) media_count,
       (select count(*) from app_private.editorial_audit_events) audit_count;

insert into supabase_migrations.schema_migrations(version,name,statements)
values ('20261009094920','home_stories',array[$migration_20261009094920$-- Home image stories. Media uploads reuse the existing trusted news-media-upload
-- function; only metadata lives here. No browser table writes or storage policies.
create table app.home_stories (
  id uuid primary key default gen_random_uuid(),
  title_fr text not null check (char_length(btrim(title_fr)) between 1 and 60),
  title_ar text not null check (char_length(btrim(title_ar)) between 1 and 60),
  alt_fr text not null check (char_length(btrim(alt_fr)) between 1 and 300),
  alt_ar text not null check (char_length(btrim(alt_ar)) between 1 and 300),
  media_asset_id uuid not null references app.media_assets(id),
  destination text check (destination in ('/news','/fantasy','/matches','/matches/standings','/pronostics','/pepites','/clubs','/prizes')),
  credit text check (char_length(credit) <= 300),
  position integer not null default 0 check (position between 0 and 999),
  published boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.home_stories enable row level security;
revoke all on app.home_stories from public, anon, authenticated;
create index home_stories_public_order on app.home_stories(position, created_at, id) where published;

create function app_private.home_story_dto(story app.home_stories)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', story.id, 'titleFr', story.title_fr, 'titleAr', story.title_ar,
    'altFr', story.alt_fr, 'altAr', story.alt_ar, 'mediaAssetId', story.media_asset_id,
    'storagePath', media.storage_path, 'credit', story.credit,
    'destination', story.destination, 'position', story.position,
    'published', story.published, 'version', story.version
  ) from app.media_assets media where media.id = story.media_asset_id
$$;
revoke all on function app_private.home_story_dto(app.home_stories) from public, anon, authenticated;

create function api.home_stories()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(app_private.home_story_dto(story)
    order by story.position, story.created_at, story.id), '[]'::jsonb)
  from app.home_stories story join app.media_assets media on media.id = story.media_asset_id
  where story.published and media.validation_status = 'validated'
    and media.storage_path like 'news/%'
$$;
revoke all on function api.home_stories() from public, anon, authenticated;
grant execute on function api.home_stories() to anon, authenticated;

create function api.admin_home_stories()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.admin_assert_permission('editorial.read');
  return (select coalesce(jsonb_agg(app_private.home_story_dto(story)
    order by story.position, story.created_at, story.id), '[]'::jsonb) from app.home_stories story);
end;
$$;
revoke all on function api.admin_home_stories() from public, anon, authenticated;
grant execute on function api.admin_home_stories() to authenticated;

create function api.admin_save_home_story(
  p_id uuid, p_version integer, p_title_fr text, p_title_ar text,
  p_alt_fr text, p_alt_ar text, p_media_asset_id uuid, p_destination text, p_credit text, p_position integer
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  story app.home_stories%rowtype;
begin
  perform app_private.admin_assert_permission('editorial.write');
  if p_id is not null then
    select * into story from app.home_stories where id = p_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'story_not_found'; end if;
    if p_version is distinct from story.version then
      raise exception using errcode = '40001', message = 'story_conflict';
    end if;
    -- Editing content already visible to readers is itself a publication.
    if story.published then perform app_private.admin_assert_permission('editorial.publish'); end if;
  end if;
  if not exists (select 1 from app.media_assets where id = p_media_asset_id
    and validation_status = 'validated' and storage_path like 'news/%'
    and mime_type in ('image/jpeg','image/png','image/webp','image/avif')) then
    raise exception using errcode = '22023', message = 'story_invalid_media';
  end if;
  if p_id is null then
    insert into app.home_stories(title_fr,title_ar,alt_fr,alt_ar,media_asset_id,destination,credit,position)
    values(btrim(p_title_fr),btrim(p_title_ar),btrim(p_alt_fr),btrim(p_alt_ar),p_media_asset_id,p_destination,nullif(btrim(p_credit),''),p_position)
    returning * into story;
  else
    update app.home_stories set title_fr=btrim(p_title_fr),title_ar=btrim(p_title_ar),
      alt_fr=btrim(p_alt_fr),alt_ar=btrim(p_alt_ar),media_asset_id=p_media_asset_id,
      destination=p_destination,credit=nullif(btrim(p_credit),''),position=p_position,version=version+1,updated_at=clock_timestamp()
    where id=p_id returning * into story;
  end if;
  perform app_private.write_editorial_audit('home_story_saved', null, null,
    jsonb_build_object('homeStoryId',story.id,'version',story.version));
  return app_private.home_story_dto(story);
end;
$$;
revoke all on function api.admin_save_home_story(uuid,integer,text,text,text,text,uuid,text,text,integer) from public, anon, authenticated;
grant execute on function api.admin_save_home_story(uuid,integer,text,text,text,text,uuid,text,text,integer) to authenticated;

create function api.admin_publish_home_story(p_id uuid, p_version integer, p_published boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare story app.home_stories%rowtype;
begin
  perform app_private.admin_assert_permission('editorial.publish');
  select * into story from app.home_stories where id=p_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'story_not_found'; end if;
  if p_version is distinct from story.version then
    raise exception using errcode = '40001', message = 'story_conflict';
  end if;
  if p_published and not exists (select 1 from app.media_assets where id=story.media_asset_id
    and validation_status='validated' and storage_path like 'news/%') then
    raise exception using errcode='22023', message='story_invalid_media';
  end if;
  update app.home_stories set published=p_published,version=version+1,updated_at=clock_timestamp()
    where id=p_id returning * into story;
  perform app_private.write_editorial_audit('home_story_visibility_changed', null, null,
    jsonb_build_object('homeStoryId',story.id,'published',story.published,'version',story.version));
  return app_private.home_story_dto(story);
end;
$$;
revoke all on function api.admin_publish_home_story(uuid,integer,boolean) from public, anon, authenticated;
grant execute on function api.admin_publish_home_story(uuid,integer,boolean) to authenticated;
$migration_20261009094920$]);
do $apply$
declare source text := (select statements[1] from supabase_migrations.schema_migrations where version='20261009094920');
begin
  if encode(sha256(convert_to(source,'UTF8')),'hex') <> 'ef78eed7013eef937f55b2447130cc4c82bd15be765bd882221e2c87f79abcb6' then
    raise exception 'stop: migration 20261009094920 differs from reviewed bytes';
  end if;
  execute source;
end;
$apply$;

insert into supabase_migrations.schema_migrations(version,name,statements)
values ('20261009113132','home_stories_force_rls',array[$migration_20261009113132$-- Match the canonical app-table RLS contract, including owner queries.
-- Public and staff access remains through the explicitly granted RPCs.
alter table app.home_stories force row level security;
$migration_20261009113132$]);
do $apply$
declare source text := (select statements[1] from supabase_migrations.schema_migrations where version='20261009113132');
begin
  if encode(sha256(convert_to(source,'UTF8')),'hex') <> 'd4f8019a75d32772b5a13ef60bb2872d1f6e71d4bcaf9585fb9a24c47cf7e5b1' then
    raise exception 'stop: migration 20261009113132 differs from reviewed bytes';
  end if;
  execute source;
end;
$apply$;

do $postflight$
declare sig regprocedure; who text;
begin
  if api.home_stories() <> '[]'::jsonb then raise exception 'stop: unexpected public content'; end if;
  if not exists(select 1 from pg_class where oid='app.home_stories'::regclass
    and relrowsecurity and relforcerowsecurity) then raise exception 'stop: RLS missing'; end if;
  foreach who in array array['anon','authenticated'] loop
    if has_table_privilege(who,'app.home_stories','select,insert,update,delete') then
      raise exception 'stop: direct browser table access';
    end if;
    if not has_function_privilege(who,'api.home_stories()','execute') then
      raise exception 'stop: public story read missing';
    end if;
  end loop;
  foreach sig in array array[
    'api.admin_home_stories()'::regprocedure,
    'api.admin_save_home_story(uuid,integer,text,text,text,text,uuid,text,text,integer)'::regprocedure,
    'api.admin_publish_home_story(uuid,integer,boolean)'::regprocedure
  ] loop
    if has_function_privilege('anon',sig,'execute')
      or not has_function_privilege('authenticated',sig,'execute')
      or pg_get_functiondef(sig) not like '%admin_assert_permission%' then
      raise exception 'stop: staff RPC grants or checks invalid: %',sig;
    end if;
  end loop;
  if exists(select 1 from home_stories_rollout_baseline where
    media_count <> (select count(*) from app.media_assets)
    or audit_count <> (select count(*) from app_private.editorial_audit_events)) then
    raise exception 'stop: existing media or audit data changed';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations) <> 168 then
    raise exception 'stop: migration history count mismatch';
  end if;
end;
$postflight$;
-- Rehearsal by default. Change only this line to commit after verifying rollback.
rollback;
select case when to_regclass('app.home_stories') is null
  then 'Rehearsal passed; rolled back' else 'Home stories applied' end as result;
