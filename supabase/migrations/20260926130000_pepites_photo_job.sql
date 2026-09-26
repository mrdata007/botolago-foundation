-- BotolaGO Production V2
-- Pépites: the photo storage job's database side.
-- docs/engineering/PEPITES_ARCHITECTURE.md §3.3.
--
-- The job (scripts/backend/pepites-photo-job.ts) runs with the service role:
--
--   1. reads its work: approved releases without a public derivative, and
--      queued storage deletions;
--   2. for each approved release: downloads the original from the private
--      intake bucket, makes the derivative (512 px square WebP, metadata
--      stripped), uploads it to football-media at the release's one path,
--      then publishes it through api.service_publish_player_photo; if the
--      rights no longer hold, publication refuses and the job deletes the
--      file it uploaded;
--   3. deletes each queued object through the Storage API, then marks it
--      done.
--
-- Staff upload originals and signed documents to the private buckets through
-- a server route that asks api.admin_player_photo_upload_paths for fresh
-- paths (permission checked here) and signs the uploads with the service
-- key. No browser writes to a bucket directly.

-- The job's work list.
create function api.service_player_photo_work(p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'service_role_required';
  end if;
  if coalesce(p_limit, 20) not between 1 and 100 then
    raise exception using errcode = 'PT400', message = 'invalid_limit';
  end if;
  return pg_catalog.jsonb_build_object(
    'publish', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'releaseId', release.id, 'playerId', release.player_id,
          'intakePath', release.intake_path,
          'publicPath', 'football/players/' || release.player_id || '/' || release.id || '.webp')
        order by release.approved_at)
      from (
        select * from app_private.player_photo_releases
        where status = 'approved'
        order by approved_at
        limit coalesce(p_limit, 20)
      ) release
    ), '[]'::jsonb),
    'delete', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id', deletion.id, 'bucket', deletion.bucket_id, 'path', deletion.object_path)
        order by deletion.requested_at)
      from (
        select * from app_private.player_photo_storage_deletions
        where completed_at is null
        order by requested_at
        limit coalesce(p_limit, 20)
      ) deletion
    ), '[]'::jsonb)
  );
end;
$$;

create function api.service_publish_player_photo(
  p_release_id uuid,
  p_public_path text,
  p_width integer,
  p_height integer,
  p_mime_type text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_release app_private.player_photo_releases%rowtype;
  v_problems text[];
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'service_role_required';
  end if;
  select * into v_release from app_private.player_photo_releases where id = p_release_id;
  if v_release.id is null then
    raise exception using errcode = 'P0002', message = 'PHOTO_RELEASE_NOT_FOUND';
  end if;
  -- The rights are checked again today (§3.3): a correction since approval
  -- may have made the player a minor on the capture date.
  v_problems := app_private.player_photo_release_problems(v_release, current_date);
  if cardinality(v_problems) > 0 then
    raise exception using errcode = '23514', message = 'PHOTO_RELEASE_PROBLEMS',
      detail = array_to_string(v_problems, ',');
  end if;
  return pg_catalog.jsonb_build_object('assetId',
    app_private.publish_player_photo_release(p_release_id, p_public_path, p_width, p_height, p_mime_type));
end;
$$;

create function api.service_complete_photo_deletion(p_deletion_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'service_role_required';
  end if;
  update app_private.player_photo_storage_deletions
  set completed_at = statement_timestamp()
  where id = p_deletion_id and completed_at is null;
  return pg_catalog.jsonb_build_object('id', p_deletion_id, 'completed', found);
end;
$$;

-- Fresh private paths for one release's files: the original and the signed
-- document. Staff only; the server route signs the uploads.
create function api.admin_player_photo_upload_paths(
  p_player_id uuid,
  p_photo_extension text,
  p_document_extension text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_photo text := lower(p_photo_extension);
  v_document text := lower(p_document_extension);
begin
  perform app_private.admin_assert_permission('football.correct', false);
  if not exists (select 1 from app.players player where player.id = p_player_id) then
    raise exception using errcode = 'PT404', message = 'PLAYER_NOT_FOUND';
  end if;
  if v_photo not in ('jpg', 'jpeg', 'png', 'webp') or v_document not in ('pdf', 'jpg', 'jpeg', 'png') then
    raise exception using errcode = '22023', message = 'PHOTO_UPLOAD_TYPE_INVALID';
  end if;
  return pg_catalog.jsonb_build_object(
    'intakeBucket', 'player-photo-intake',
    'intakePath', 'players/' || p_player_id || '/' || gen_random_uuid() || '.' || v_photo,
    'documentBucket', 'player-photo-releases',
    'documentPath', 'players/' || p_player_id || '/release-' || replace(gen_random_uuid()::text, '-', '') || '.' || v_document
  );
end;
$$;

revoke all on function api.service_player_photo_work(integer) from public, anon, authenticated;
revoke all on function api.service_publish_player_photo(uuid, text, integer, integer, text) from public, anon, authenticated;
revoke all on function api.service_complete_photo_deletion(uuid) from public, anon, authenticated;
grant execute on function api.service_player_photo_work(integer) to service_role;
grant execute on function api.service_publish_player_photo(uuid, text, integer, integer, text) to service_role;
grant execute on function api.service_complete_photo_deletion(uuid) to service_role;
revoke all on function api.admin_player_photo_upload_paths(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function api.admin_player_photo_upload_paths(uuid, text, text) to authenticated;
