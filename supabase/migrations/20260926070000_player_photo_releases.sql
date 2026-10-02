-- BotolaGO Production V2
-- Pépites, migration 2 of the v1 sequence: player photo releases.
-- docs/engineering/PEPITES_ARCHITECTURE.md §3.3 (revision 3, Gate A approved
-- for local implementation 2026-09-26).
--
-- A player photo is shown only with a signed release, and never enters a
-- public bucket before approval. football-media is public
-- (20260801010200_sportsmonks_team_crests.sql): anyone holding a path could
-- fetch what is in it, so hiding a URL protects nothing.
--
--   player-photo-intake     private  the original, as received
--   player-photo-releases   private  the signed release document
--   football-media          public   only the approved derivative, at
--                                    football/players/<player_id>/<release_id>.webp
--
-- No storage.objects policy is created for the two private buckets: only the
-- service role (which bypasses RLS) and the database owner reach them.
--
-- app_private.player_photo_releases holds one release per original. Its facts
-- (who, which file, when taken, when signed, who signed, scope, licence,
-- credit, expiry) never change after submission. Its status moves
--
--   pending -> approved -> published -> revoked | expired | replaced
--   pending | approved -> rejected | revoked,   approved -> expired
--
-- and approval and publication both re-check the prerequisites: the original
-- and the signed document are in their private buckets, the player's date of
-- birth is known, a player under 18 on the capture date has a guardian
-- release, and the release has not expired. The public media_assets row is
-- created only at publication, from the derivative a server job wrote.
--
-- app_private.player_photo_for(player, use, on) is the one read helper: a
-- photo only for a published, unrevoked, unexpired release whose rules still
-- hold on that day (the date of birth is re-read, so a correction that makes
-- the player a minor on the capture date hides a player-signed photo), and for
-- use 'share' only with scope in_app_and_social. Otherwise null, and the UI
-- draws the silhouette (src/components/common/PlayerPhoto.tsx).
--
-- Revocation and expiry take effect at once for that helper, clear
-- app.players.photo_asset_id, mark the public asset rejected or expired, and
-- queue the public derivative and the original for deletion. The queue is
-- processed through the Storage API by a server job (a later PR): deleting
-- storage.objects rows in SQL would orphan the files. The signed document is
-- kept as the record of the consent that was given.
--
-- Not here, by the architecture's order: the admin and service API wrappers
-- with their permissions (migration 8, pepites_api) and the storage job that
-- makes derivatives and processes deletions.

-- ---------------------------------------------------------------------------
-- Private buckets
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('player-photo-intake', 'player-photo-intake', false, 20971520,
    array['image/jpeg', 'image/png', 'image/webp']::text[]),
  ('player-photo-releases', 'player-photo-releases', false, 10485760,
    array['application/pdf', 'image/jpeg', 'image/png']::text[])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Releases
-- ---------------------------------------------------------------------------
create table app_private.player_photo_releases (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references app.players(id) on delete restrict,
  -- Paths inside the private buckets, relative to the bucket.
  intake_path text not null,
  document_path text not null,
  captured_on date not null,
  signed_on date not null,
  signer_role text not null,
  scope text not null,
  licence_code text not null,
  credit text not null,
  copyright_owner text not null,
  expires_on date,
  status text not null default 'pending',
  submitted_by uuid not null,
  submitted_at timestamptz not null default statement_timestamp(),
  approved_by uuid,
  approved_at timestamptz,
  published_at timestamptz,
  public_asset_id uuid references app.media_assets(id) on delete restrict,
  public_path text,
  ended_at timestamptz,
  ended_by uuid,
  end_reason text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint player_photo_releases_intake_path_key unique (intake_path),
  constraint player_photo_releases_intake_path_check check (
    intake_path ~ '^players/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|jpeg|png|webp)$'
  ),
  constraint player_photo_releases_document_path_check check (
    document_path ~ '^players/[0-9a-f-]{36}/[a-z0-9_-]{1,80}[.](pdf|jpg|jpeg|png)$'
  ),
  constraint player_photo_releases_signer_role_check check (signer_role in ('player', 'guardian')),
  constraint player_photo_releases_scope_check check (scope in ('in_app', 'in_app_and_social')),
  constraint player_photo_releases_licence_code_check check (
    licence_code in ('club_licence', 'botolago_release', 'agency_licence')
  ),
  constraint player_photo_releases_text_check check (
    credit = btrim(credit) and char_length(credit) between 1 and 200
    and copyright_owner = btrim(copyright_owner) and char_length(copyright_owner) between 1 and 200
    and (end_reason is null or char_length(end_reason) between 1 and 500)
  ),
  constraint player_photo_releases_status_check check (status in (
    'pending', 'approved', 'published', 'rejected', 'revoked', 'expired', 'replaced'
  )),
  constraint player_photo_releases_approved_check check (
    status in ('pending', 'rejected') or (approved_by is not null and approved_at is not null)
    or (status = 'revoked' and approved_at is null)
  ),
  constraint player_photo_releases_published_check check (
    (status = 'published') <= (public_asset_id is not null and public_path is not null
      and published_at is not null)
  ),
  constraint player_photo_releases_public_path_check check (
    public_path is null
    or public_path = 'football/players/' || player_id || '/' || id || '.webp'
  ),
  constraint player_photo_releases_ended_check check (
    (status in ('rejected', 'revoked', 'expired', 'replaced')) = (ended_at is not null)
    and (status not in ('rejected', 'revoked') or end_reason is not null)
  )
);

comment on table app_private.player_photo_releases is
  'One signed release per player photo original. Facts are immutable after submission; status moves only forward (pending, approved, published, then rejected/revoked/expired/replaced). Read through app_private.player_photo_for only.';

-- One published photo per player.
create unique index player_photo_releases_published_key
  on app_private.player_photo_releases (player_id)
  where status = 'published';
create index player_photo_releases_player_idx
  on app_private.player_photo_releases (player_id, status);
create index player_photo_releases_expiry_idx
  on app_private.player_photo_releases (expires_on)
  where status in ('approved', 'published') and expires_on is not null;
create index player_photo_releases_public_asset_idx
  on app_private.player_photo_releases (public_asset_id)
  where public_asset_id is not null;

alter table app_private.player_photo_releases enable row level security;
alter table app_private.player_photo_releases force row level security;
revoke all on table app_private.player_photo_releases
  from public, anon, authenticated, service_role;

create trigger player_photo_releases_set_updated_at
before update on app_private.player_photo_releases
for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Storage deletions waiting for the storage job
-- ---------------------------------------------------------------------------
create table app_private.player_photo_storage_deletions (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references app_private.player_photo_releases(id) on delete restrict,
  bucket_id text not null,
  object_path text not null,
  reason text not null,
  requested_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  constraint player_photo_storage_deletions_bucket_check check (
    bucket_id in ('football-media', 'player-photo-intake')
  ),
  constraint player_photo_storage_deletions_reason_check check (
    reason in ('revoked', 'expired', 'replaced', 'rejected')
  )
);

comment on table app_private.player_photo_storage_deletions is
  'Objects to delete through the Storage API (the public derivative and the original). The signed release document is never queued: it is the record of the consent given.';

create unique index player_photo_storage_deletions_open_key
  on app_private.player_photo_storage_deletions (bucket_id, object_path)
  where completed_at is null;
create index player_photo_storage_deletions_release_idx
  on app_private.player_photo_storage_deletions (release_id);

alter table app_private.player_photo_storage_deletions enable row level security;
alter table app_private.player_photo_storage_deletions force row level security;
revoke all on table app_private.player_photo_storage_deletions
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Prerequisites
-- ---------------------------------------------------------------------------
-- What stops a release from being approved or published on a given day. An
-- empty array means nothing does. Read as the owner: storage.objects and
-- app.players are behind row-level security.
create function app_private.player_photo_release_problems(
  p_release app_private.player_photo_releases,
  p_on date default current_date
)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_remove(array[
    case when not exists (
      select 1 from storage.objects object
      where object.bucket_id = 'player-photo-intake' and object.name = p_release.intake_path
    ) then 'intake_missing' end,
    case when not exists (
      select 1 from storage.objects object
      where object.bucket_id = 'player-photo-releases' and object.name = p_release.document_path
    ) then 'document_missing' end,
    case when player.date_of_birth is null then 'date_of_birth_unknown' end,
    case when p_release.captured_on < player.date_of_birth then 'captured_before_birth' end,
    case when p_release.captured_on > p_on then 'captured_in_future' end,
    case when p_release.signed_on > p_on then 'signed_in_future' end,
    -- Under 18 on the capture date: a guardian must have signed.
    case when player.date_of_birth is not null
      and p_release.captured_on < (player.date_of_birth + interval '18 years')::date
      and p_release.signer_role <> 'guardian'
    then 'guardian_required' end,
    case when p_release.expires_on is not null and p_release.expires_on <= p_on
    then 'expired' end
  ], null)
  from app.players player
  where player.id = p_release.player_id;
$$;

-- ---------------------------------------------------------------------------
-- The guard: immutable facts, forward-only status, no delete
-- ---------------------------------------------------------------------------
create function app_private.player_photo_releases_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  problems text[];
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception using errcode = '55000', message = 'PHOTO_RELEASE_IMMUTABLE';
  end if;

  if (new.id, new.player_id, new.intake_path, new.document_path, new.captured_on,
      new.signed_on, new.signer_role, new.scope, new.licence_code, new.credit,
      new.copyright_owner, new.expires_on, new.submitted_by, new.submitted_at, new.created_at)
    is distinct from
     (old.id, old.player_id, old.intake_path, old.document_path, old.captured_on,
      old.signed_on, old.signer_role, old.scope, old.licence_code, old.credit,
      old.copyright_owner, old.expires_on, old.submitted_by, old.submitted_at, old.created_at)
  then
    raise exception using errcode = '55000', message = 'PHOTO_RELEASE_IMMUTABLE';
  end if;

  if new.status is distinct from old.status then
    if not (old.status, new.status) in (
      ('pending', 'approved'), ('pending', 'rejected'), ('pending', 'revoked'),
      ('approved', 'published'), ('approved', 'rejected'), ('approved', 'revoked'),
      ('approved', 'expired'),
      ('published', 'revoked'), ('published', 'expired'), ('published', 'replaced')
    ) then
      raise exception using errcode = '55000', message = 'PHOTO_RELEASE_TRANSITION_NOT_ALLOWED',
        detail = old.status || ' -> ' || new.status;
    end if;
    if new.status in ('approved', 'published') then
      problems := app_private.player_photo_release_problems(new);
      if cardinality(problems) > 0 then
        raise exception using errcode = '23514', message = 'PHOTO_RELEASE_PREREQUISITES',
          detail = array_to_string(problems, ',');
      end if;
    end if;
  elsif (new.approved_by, new.approved_at, new.published_at, new.public_asset_id,
      new.public_path, new.ended_at, new.ended_by, new.end_reason)
    is distinct from
     (old.approved_by, old.approved_at, old.published_at, old.public_asset_id,
      old.public_path, old.ended_at, old.ended_by, old.end_reason)
  then
    -- Lifecycle columns change only together with the status.
    raise exception using errcode = '55000', message = 'PHOTO_RELEASE_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger player_photo_releases_guard
before update or delete on app_private.player_photo_releases
for each row execute function app_private.player_photo_releases_guard();
create trigger player_photo_releases_no_truncate
before truncate on app_private.player_photo_releases
for each statement execute function app_private.player_photo_releases_guard();

-- ---------------------------------------------------------------------------
-- Submit, approve, reject
-- ---------------------------------------------------------------------------
create function app_private.submit_player_photo_release(
  p_player_id uuid,
  p_intake_path text,
  p_document_path text,
  p_captured_on date,
  p_signed_on date,
  p_signer_role text,
  p_scope text,
  p_licence_code text,
  p_credit text,
  p_copyright_owner text,
  p_expires_on date,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_actor is null then
    raise exception using errcode = '23514', message = 'PHOTO_RELEASE_ACTOR_REQUIRED';
  end if;
  if not exists (select 1 from app.players where id = p_player_id) then
    raise exception using errcode = 'P0002', message = 'PLAYER_NOT_FOUND';
  end if;
  -- Both files live under the player's own folder of their private bucket.
  if p_intake_path is null or split_part(p_intake_path, '/', 2) <> p_player_id::text
    or p_document_path is null or split_part(p_document_path, '/', 2) <> p_player_id::text
  then
    raise exception using errcode = '23514', message = 'PHOTO_RELEASE_PATH_INVALID';
  end if;
  if p_captured_on is null or p_signed_on is null
    or p_captured_on > current_date or p_signed_on > current_date
  then
    raise exception using errcode = '23514', message = 'PHOTO_RELEASE_DATES_INVALID';
  end if;

  insert into app_private.player_photo_releases (
    player_id, intake_path, document_path, captured_on, signed_on, signer_role, scope,
    licence_code, credit, copyright_owner, expires_on, submitted_by
  ) values (
    p_player_id, p_intake_path, p_document_path, p_captured_on, p_signed_on, p_signer_role,
    p_scope, p_licence_code, btrim(p_credit), btrim(p_copyright_owner), p_expires_on, p_actor
  )
  returning id into v_id;
  return v_id;
exception
  when check_violation or not_null_violation then
    if sqlerrm like 'PHOTO_RELEASE_%' then
      raise;
    end if;
    raise exception using errcode = '23514', message = 'PHOTO_RELEASE_INVALID', detail = sqlerrm;
end;
$$;

create function app_private.approve_player_photo_release(p_release_id uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor is null then
    raise exception using errcode = '23514', message = 'PHOTO_RELEASE_ACTOR_REQUIRED';
  end if;
  update app_private.player_photo_releases
  set status = 'approved', approved_by = p_actor, approved_at = statement_timestamp()
  where id = p_release_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'PHOTO_RELEASE_NOT_FOUND';
  end if;
end;
$$;

-- The one path in football-media a release's derivative may take. The storage
-- job writes there and publication checks it; ending a release that was
-- approved but not yet published queues it for deletion, since the job may
-- have written the file before it could publish (a stopped run).
create function app_private.player_photo_public_path(p_player_id uuid, p_release_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'football/players/' || p_player_id || '/' || p_release_id || '.webp';
$$;

create function app_private.reject_player_photo_release(
  p_release_id uuid,
  p_reason text,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_release app_private.player_photo_releases%rowtype;
begin
  if p_actor is null then
    raise exception using errcode = '23514', message = 'PHOTO_RELEASE_ACTOR_REQUIRED';
  end if;
  select * into v_release from app_private.player_photo_releases
  where id = p_release_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PHOTO_RELEASE_NOT_FOUND';
  end if;
  update app_private.player_photo_releases
  set status = 'rejected', ended_at = statement_timestamp(), ended_by = p_actor,
    end_reason = p_reason
  where id = p_release_id;
  -- Approved, so the storage job may already have written the derivative.
  if v_release.status = 'approved' then
    insert into app_private.player_photo_storage_deletions (release_id, bucket_id, object_path, reason)
    values (v_release.id, 'football-media',
      app_private.player_photo_public_path(v_release.player_id, v_release.id), 'rejected')
    on conflict do nothing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ending a release: shared by revoke, expire and replace
-- ---------------------------------------------------------------------------
-- Moves the release to its end status, withdraws the public asset, clears the
-- player's photo if it is this one, and queues the public derivative and the
-- original for deletion. The signed document stays.
create function app_private.end_player_photo_release(
  p_release app_private.player_photo_releases,
  p_status text,
  p_reason text,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update app_private.player_photo_releases
  set status = p_status, ended_at = statement_timestamp(), ended_by = p_actor,
    end_reason = p_reason
  where id = p_release.id;

  if p_release.public_asset_id is not null then
    update app.media_assets
    set validation_status = case when p_status = 'revoked' then 'rejected' else 'expired' end
        ::app.media_validation_status,
      updated_at = statement_timestamp()
    where id = p_release.public_asset_id;
    update app.players
    set photo_asset_id = null
    where id = p_release.player_id and photo_asset_id = p_release.public_asset_id;
  end if;

  -- The public derivative: the published one, or, for a release approved
  -- but not yet published, the file the storage job may already have
  -- written at the release's one path.
  if p_release.public_asset_id is not null or p_release.status = 'approved' then
    insert into app_private.player_photo_storage_deletions (release_id, bucket_id, object_path, reason)
    values (p_release.id, 'football-media',
      coalesce(p_release.public_path,
        app_private.player_photo_public_path(p_release.player_id, p_release.id)), p_status)
    on conflict do nothing;
  end if;

  if p_status in ('revoked', 'expired', 'replaced') then
    insert into app_private.player_photo_storage_deletions (release_id, bucket_id, object_path, reason)
    values (p_release.id, 'player-photo-intake', p_release.intake_path, p_status)
    on conflict do nothing;
  end if;
end;
$$;

create function app_private.revoke_player_photo_release(
  p_release_id uuid,
  p_reason text,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_release app_private.player_photo_releases%rowtype;
begin
  if p_actor is null or p_reason is null or btrim(p_reason) = '' then
    raise exception using errcode = '23514', message = 'PHOTO_RELEASE_REASON_REQUIRED';
  end if;
  select * into v_release from app_private.player_photo_releases
  where id = p_release_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PHOTO_RELEASE_NOT_FOUND';
  end if;
  perform app_private.end_player_photo_release(v_release, 'revoked', btrim(p_reason), p_actor);
end;
$$;

-- The daily sweep. Idempotent: an ended release is not touched again.
create function app_private.expire_player_photo_releases(p_today date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_release app_private.player_photo_releases%rowtype;
  v_count integer := 0;
begin
  for v_release in
    select * from app_private.player_photo_releases release
    where release.status in ('approved', 'published')
      and release.expires_on is not null
      and release.expires_on <= p_today
    order by release.id
    for update
  loop
    perform app_private.end_player_photo_release(v_release, 'expired', 'Licence expired', null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Publication: the derivative is in football-media
-- ---------------------------------------------------------------------------
-- Called with what the storage job wrote. Creates the public asset, links it
-- to the player, and replaces the player's previous published photo.
create function app_private.publish_player_photo_release(
  p_release_id uuid,
  p_public_path text,
  p_width integer,
  p_height integer,
  p_mime_type text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_release app_private.player_photo_releases%rowtype;
  v_previous app_private.player_photo_releases%rowtype;
  v_player app.players%rowtype;
  v_asset_id uuid;
begin
  select * into v_release from app_private.player_photo_releases
  where id = p_release_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PHOTO_RELEASE_NOT_FOUND';
  end if;
  if v_release.status <> 'approved' then
    raise exception using errcode = '55000', message = 'PHOTO_RELEASE_TRANSITION_NOT_ALLOWED',
      detail = v_release.status || ' -> published';
  end if;
  -- The derivative: square WebP at the one path this release may use.
  if p_public_path is distinct from
      app_private.player_photo_public_path(v_release.player_id, v_release.id)
    or p_mime_type is distinct from 'image/webp'
    or p_width is null or p_width <> p_height or p_width not between 128 and 1024
  then
    raise exception using errcode = '23514', message = 'PHOTO_DERIVATIVE_INVALID';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'football-media' and object.name = p_public_path
  ) then
    raise exception using errcode = 'P0002', message = 'PHOTO_DERIVATIVE_MISSING';
  end if;

  select * into v_player from app.players where id = v_release.player_id for update;

  -- The player's current photo, if any, is replaced first: one published
  -- release per player.
  select * into v_previous from app_private.player_photo_releases
  where player_id = v_release.player_id and status = 'published'
  for update;
  if found then
    perform app_private.end_player_photo_release(v_previous, 'replaced', 'Replaced by a newer release', null);
  end if;

  insert into app.media_assets (
    kind, storage_path, license_code, credit, copyright_owner, attribution,
    validation_status, validated_at, width, height, mime_type, alt_text
  ) values (
    'player_photo', p_public_path, v_release.licence_code, v_release.credit,
    v_release.copyright_owner, v_release.credit,
    'validated', statement_timestamp(), p_width, p_height, p_mime_type, v_player.display_name
  )
  returning id into v_asset_id;

  update app_private.player_photo_releases
  set status = 'published', published_at = statement_timestamp(),
    public_asset_id = v_asset_id, public_path = p_public_path
  where id = v_release.id;

  update app.players set photo_asset_id = v_asset_id where id = v_release.player_id;
  return v_asset_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- The read helper
-- ---------------------------------------------------------------------------
-- p_use: 'app' (any approved photo) or 'share' (share images: scope
-- in_app_and_social only). p_on: the day to judge; today by default.
create function app_private.player_photo_for(
  p_player_id uuid,
  p_use text,
  p_on date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_release app_private.player_photo_releases%rowtype;
begin
  if p_use is null or p_use not in ('app', 'share') then
    raise exception using errcode = '22023', message = 'PHOTO_USE_INVALID';
  end if;

  select release.* into v_release
  from app_private.player_photo_releases release
  join app.players player on player.id = release.player_id
  join app.media_assets asset on asset.id = release.public_asset_id
  where release.player_id = p_player_id
    and release.status = 'published'
    and player.photo_asset_id = release.public_asset_id
    and asset.validation_status = 'validated'
    and (p_use = 'app' or release.scope = 'in_app_and_social');
  if not found then
    return null;
  end if;

  -- The rights are judged again on the day, with today's date of birth.
  if cardinality(array_remove(
      app_private.player_photo_release_problems(v_release, p_on),
      -- The files may already be moved or cleaned up after publication; the
      -- public derivative is what is shown.
      'intake_missing'
    )) > 0
  then
    return null;
  end if;

  return pg_catalog.jsonb_build_object(
    'assetId', v_release.public_asset_id,
    'storagePath', v_release.public_path,
    'credit', v_release.credit,
    'copyrightOwner', v_release.copyright_owner,
    'scope', v_release.scope
  );
end;
$$;

comment on function app_private.player_photo_for(uuid, text, date) is
  'The only way to read a player photo: the public derivative of a published release whose rights hold on p_on, or null (the UI draws the silhouette). p_use share requires scope in_app_and_social.';

-- ---------------------------------------------------------------------------
-- Grants: nothing here is callable or readable by a client
-- ---------------------------------------------------------------------------
revoke all on function app_private.player_photo_release_problems(app_private.player_photo_releases, date)
  from public, anon, authenticated, service_role;
revoke all on function app_private.player_photo_releases_guard()
  from public, anon, authenticated, service_role;
revoke all on function app_private.submit_player_photo_release(
  uuid, text, text, date, date, text, text, text, text, text, date, uuid
) from public, anon, authenticated, service_role;
revoke all on function app_private.approve_player_photo_release(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.player_photo_public_path(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.reject_player_photo_release(uuid, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.end_player_photo_release(
  app_private.player_photo_releases, text, text, uuid
) from public, anon, authenticated, service_role;
revoke all on function app_private.revoke_player_photo_release(uuid, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.expire_player_photo_releases(date)
  from public, anon, authenticated, service_role;
revoke all on function app_private.publish_player_photo_release(uuid, text, integer, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.player_photo_for(uuid, text, date)
  from public, anon, authenticated, service_role;
