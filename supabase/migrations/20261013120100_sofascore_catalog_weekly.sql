-- BotolaGO Production V2
-- Weekly refresh of clubs and players from SofaScore: what the Edge Function
-- `football-live-refresh` job `catalog_weekly` reads and writes.
-- Documentation: docs/backend/SOFASCORE_CATALOG_AND_STANDINGS.md.
--
-- Rules this migration enforces in the database, not only in the Edge code:
--   * It never creates a player, a team or a mapping. Every function below
--     starts from an ACTIVE `sofascore` row of
--     app_private.football_provider_mappings and updates the row it points at.
--     A SofaScore player with no mapping is counted and left for review.
--   * Nothing is matched by name. The only key is the SofaScore id.
--   * It changes only: players.display_name, players.position (only when the
--     caller says so), the shirt number of the player's CURRENT membership at
--     the mapped club, and the image pointers described below.
--   * A crest supplied by BotolaGO (`crest-curated.<ext>`,
--     20261001170000_curated_team_crests.sql) is never replaced.
--
-- Images. The bytes live in the existing public bucket `football-media`
-- (20260801010200), under football/sofascore/. The path carries a short hash of
-- the content, so a changed image is a new path (no stale cache) and an
-- unchanged one is not uploaded again. app_private.catalog_image_state keeps,
-- per club or player, the last SHA-256, the path, when it was last checked and
-- how often the fetch failed; the job sorts by it, so a run that stops at its
-- image limit continues the next week where it stopped.
--   * A club crest is linked the way the SportsMonks one is: an
--     app.media_assets row (kind team_crest) and app.teams.crest_asset_id, so
--     `crestPath` in api.football_team_json serves it with no change.
--   * A player photo is recorded in app.players.catalog_photo_path ONLY. It is
--     not app.players.photo_asset_id, which belongs to the signed-release
--     pipeline (20260926070000_player_photo_releases.sql: a photo is shown only
--     with a release). No API reads catalog_photo_path; showing it is an owner
--     decision (see the doc).

-- ---------------------------------------------------------------------------
-- Player photo pointer
-- ---------------------------------------------------------------------------
alter table app.players add column catalog_photo_path text;
alter table app.players add constraint players_catalog_photo_path_check check (
  catalog_photo_path is null
  or catalog_photo_path ~ '^football/sofascore/players/[0-9]{1,12}/photo-[0-9a-f]{12}[.](jpg|png|webp)$'
);
comment on column app.players.catalog_photo_path is
  'Copy of the SofaScore player image in football-media, written only by api.service_sofascore_catalog_record_image. Not a licensed photo: no API serves it (photo_asset_id is the released one).';

-- ---------------------------------------------------------------------------
-- Image state
-- ---------------------------------------------------------------------------
create table app_private.catalog_image_state (
  entity_type text not null,
  sofascore_id text not null,
  internal_id uuid not null,
  content_sha256 text,
  storage_path text,
  mime_type text,
  byte_size integer,
  status text not null default 'stored',
  failure_count integer not null default 0,
  checked_at timestamptz not null default statement_timestamp(),
  changed_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  constraint catalog_image_state_pkey primary key (entity_type, sofascore_id),
  constraint catalog_image_state_entity_check check (entity_type in ('team', 'player')),
  constraint catalog_image_state_status_check check (status in ('stored', 'missing', 'failed')),
  constraint catalog_image_state_sha_check check (
    content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint catalog_image_state_failure_check check (failure_count >= 0)
);
comment on table app_private.catalog_image_state is
  'Per club or player: the last SHA-256 of the SofaScore image stored in football-media, when it was last checked and how often the fetch failed. Orders the weekly job so it continues where it stopped. Written only by api.service_sofascore_catalog_record_image.';
alter table app_private.catalog_image_state enable row level security;
alter table app_private.catalog_image_state force row level security;
revoke all on app_private.catalog_image_state from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Read: what the job needs, in one call
-- ---------------------------------------------------------------------------
create or replace function api.football_sofascore_catalog_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  return jsonb_build_object(
    'teams', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'teamId', team.id,
        'sofascoreId', mapping.external_id,
        'crestCurated', coalesce(media.storage_path ~ '/crest-curated[.]', false)
      ) order by mapping.external_id), '[]'::jsonb)
      from app_private.football_provider_mappings mapping
      join app.teams team on team.id = mapping.internal_entity_id and team.active
      left join app.media_assets media on media.id = team.crest_asset_id
      where mapping.provider_name = 'sofascore' and mapping.entity_type = 'team'
        and mapping.active and mapping.external_id ~ '^[0-9]{1,12}$'
    ),
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'playerId', player.id,
        'sofascoreId', mapping.external_id,
        'displayName', player.display_name,
        'position', player.position::text,
        'teamSofascoreId', team_mapping.external_id,
        'shirtNumber', membership.shirt_number
      ) order by mapping.external_id), '[]'::jsonb)
      from app_private.football_provider_mappings mapping
      join app.players player on player.id = mapping.internal_entity_id and player.active
      left join lateral (
        select m.team_id, m.shirt_number
        from app.team_memberships m
        join app.seasons season on season.id = m.season_id and season.is_current
        where m.player_id = player.id and m.active
          and (m.valid_to is null or m.valid_to >= current_date)
        order by m.valid_from desc, m.id
        limit 1
      ) membership on true
      left join app_private.football_provider_mappings team_mapping
        on team_mapping.provider_name = 'sofascore' and team_mapping.entity_type = 'team'
       and team_mapping.active and team_mapping.internal_entity_id = membership.team_id
      where mapping.provider_name = 'sofascore' and mapping.entity_type = 'player'
        and mapping.active and mapping.external_id ~ '^[0-9]{1,12}$'
    ),
    'images', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'entityType', state.entity_type,
        'sofascoreId', state.sofascore_id,
        'sha256', state.content_sha256,
        'storagePath', state.storage_path,
        'status', state.status,
        'failureCount', state.failure_count,
        'checkedAt', state.checked_at
      )), '[]'::jsonb)
      from app_private.catalog_image_state state
    )
  );
end;
$$;

revoke all on function api.football_sofascore_catalog_snapshot()
  from public, anon, authenticated, service_role;
grant execute on function api.football_sofascore_catalog_snapshot() to service_role;
comment on function api.football_sofascore_catalog_snapshot() is
  'Service role, read only: clubs and players with an active SofaScore mapping, each player''s current club and shirt number, and the image state, for the catalog_weekly job.';

-- ---------------------------------------------------------------------------
-- Write: fields of already-mapped players
-- ---------------------------------------------------------------------------
-- p_updates: [{sofascoreId, teamSofascoreId?, displayName?, position?, shirtNumber?}]
-- Never inserts into app.players, app.team_memberships or the mappings table.
create or replace function api.service_sofascore_catalog_apply(
  p_updates jsonb,
  p_allow_position boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_player_id uuid;
  v_team_id uuid;
  v_membership_id uuid;
  v_name text;
  v_position text;
  v_shirt integer;
  v_names integer := 0;
  v_positions integer := 0;
  v_shirts integer := 0;
  v_not_mapped integer := 0;
  v_no_membership integer := 0;
  v_shirt_conflicts integer := 0;
  v_skipped_invalid integer := 0;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_updates is null or jsonb_typeof(p_updates) <> 'array'
    or jsonb_array_length(p_updates) > 1000
    or octet_length(p_updates::text) > 1048576
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;

  for v_item in select value from jsonb_array_elements(p_updates)
  loop
    if jsonb_typeof(v_item) <> 'object' or (v_item ->> 'sofascoreId') !~ '^[0-9]{1,12}$' then
      v_skipped_invalid := v_skipped_invalid + 1;
      continue;
    end if;
    select mapping.internal_entity_id into v_player_id
    from app_private.football_provider_mappings mapping
    join app.players player on player.id = mapping.internal_entity_id and player.active
    where mapping.provider_name = 'sofascore' and mapping.entity_type = 'player'
      and mapping.external_id = v_item ->> 'sofascoreId' and mapping.active;
    if v_player_id is null then
      v_not_mapped := v_not_mapped + 1;
      continue;
    end if;

    v_name := nullif(btrim(v_item ->> 'displayName'), '');
    if v_name is not null and char_length(v_name) between 2 and 120 then
      update app.players
      set display_name = v_name, updated_at = statement_timestamp()
      where id = v_player_id and display_name is distinct from v_name;
      if found then v_names := v_names + 1; end if;
    end if;

    v_position := v_item ->> 'position';
    if p_allow_position and v_position in ('goalkeeper', 'defender', 'midfielder', 'forward') then
      update app.players
      set position = v_position::app.football_position, updated_at = statement_timestamp()
      where id = v_player_id and position::text is distinct from v_position;
      if found then v_positions := v_positions + 1; end if;
    end if;

    if jsonb_typeof(v_item -> 'shirtNumber') = 'number'
      and (v_item ->> 'shirtNumber') ~ '^[0-9]{1,2}$'
      and (v_item ->> 'teamSofascoreId') ~ '^[0-9]{1,12}$'
    then
      v_shirt := (v_item ->> 'shirtNumber')::integer;
      if v_shirt between 1 and 99 then
        select mapping.internal_entity_id into v_team_id
        from app_private.football_provider_mappings mapping
        where mapping.provider_name = 'sofascore' and mapping.entity_type = 'team'
          and mapping.external_id = v_item ->> 'teamSofascoreId' and mapping.active;
        v_membership_id := null;
        if v_team_id is not null then
          select m.id into v_membership_id
          from app.team_memberships m
          join app.seasons season on season.id = m.season_id and season.is_current
          where m.player_id = v_player_id and m.team_id = v_team_id and m.active
            and (m.valid_to is null or m.valid_to >= current_date)
          order by m.valid_from desc, m.id
          limit 1;
        end if;
        if v_membership_id is null then
          v_no_membership := v_no_membership + 1;
        else
          begin
            update app.team_memberships
            set shirt_number = v_shirt, updated_at = statement_timestamp()
            where id = v_membership_id and shirt_number is distinct from v_shirt;
            if found then v_shirts := v_shirts + 1; end if;
          exception when unique_violation then
            -- Another active player holds that number at the club: leave both.
            v_shirt_conflicts := v_shirt_conflicts + 1;
          end;
        end if;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'names', v_names, 'positions', v_positions, 'shirts', v_shirts,
    'notMapped', v_not_mapped, 'noMembership', v_no_membership,
    'shirtConflicts', v_shirt_conflicts, 'invalid', v_skipped_invalid
  );
end;
$$;

revoke all on function api.service_sofascore_catalog_apply(jsonb, boolean)
  from public, anon, authenticated, service_role;
grant execute on function api.service_sofascore_catalog_apply(jsonb, boolean) to service_role;
comment on function api.service_sofascore_catalog_apply(jsonb, boolean) is
  'Service role: updates display name, (optionally) position and current shirt number of players that already have an active SofaScore mapping. Never creates a player, membership or mapping; unmapped ids are only counted.';

-- ---------------------------------------------------------------------------
-- Write: one stored image, or the outcome of trying
-- ---------------------------------------------------------------------------
-- p_status 'stored'    the bytes are in football-media at p_storage_path
--          'unchanged' same SHA-256 as before: only the check time moves
--          'missing'   SofaScore has no image (404)
--          'failed'    the fetch or the upload failed
-- Returns {previousPath, linked}: the path this replaces (the caller removes
-- the old object), and whether the club's crest now points at the new copy.
create or replace function api.service_sofascore_catalog_record_image(
  p_entity_type text,
  p_sofascore_id text,
  p_status text,
  p_sha256 text default null,
  p_storage_path text default null,
  p_mime_type text default null,
  p_byte_size integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_internal_id uuid;
  v_previous_path text;
  v_asset_id uuid;
  v_team_name text;
  v_current_path text;
  v_linked boolean := false;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_entity_type not in ('team', 'player')
    or p_sofascore_id is null or p_sofascore_id !~ '^[0-9]{1,12}$'
    or p_status not in ('stored', 'unchanged', 'missing', 'failed')
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;

  -- The mapping is the only way in: no mapping, no row.
  select mapping.internal_entity_id into v_internal_id
  from app_private.football_provider_mappings mapping
  where mapping.provider_name = 'sofascore'
    and mapping.entity_type = p_entity_type::app_private.football_entity_type
    and mapping.external_id = p_sofascore_id and mapping.active;
  if v_internal_id is null then
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sofascore:catalog-image:' || p_entity_type || ':' || p_sofascore_id, 0)
  );
  select storage_path into v_previous_path
  from app_private.catalog_image_state
  where entity_type = p_entity_type and sofascore_id = p_sofascore_id
  for update;

  if p_status = 'unchanged' then
    update app_private.catalog_image_state
    set checked_at = statement_timestamp(), failure_count = 0, status = 'stored',
        updated_at = statement_timestamp()
    where entity_type = p_entity_type and sofascore_id = p_sofascore_id
      and content_sha256 is not null;
    if not found then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end if;
    return jsonb_build_object('previousPath', null, 'linked', false);
  end if;

  if p_status in ('missing', 'failed') then
    insert into app_private.catalog_image_state (
      entity_type, sofascore_id, internal_id, status, failure_count, checked_at
    ) values (p_entity_type, p_sofascore_id, v_internal_id, p_status, 1, statement_timestamp())
    on conflict (entity_type, sofascore_id) do update
    set status = case when app_private.catalog_image_state.content_sha256 is null
                      then excluded.status else app_private.catalog_image_state.status end,
        failure_count = app_private.catalog_image_state.failure_count + 1,
        checked_at = statement_timestamp(),
        updated_at = statement_timestamp();
    return jsonb_build_object('previousPath', null, 'linked', false);
  end if;

  -- stored
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
    or p_mime_type is null or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
    or p_byte_size is null or p_byte_size not between 1 and 2000000
    or p_storage_path is null
    or (p_entity_type = 'team' and p_storage_path !~
      ('^football/sofascore/teams/' || p_sofascore_id || '/crest-[0-9a-f]{12}[.](jpg|png|webp)$'))
    or (p_entity_type = 'player' and p_storage_path !~
      ('^football/sofascore/players/' || p_sofascore_id || '/photo-[0-9a-f]{12}[.](jpg|png|webp)$'))
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;

  insert into app_private.catalog_image_state (
    entity_type, sofascore_id, internal_id, content_sha256, storage_path, mime_type,
    byte_size, status, failure_count, checked_at, changed_at
  ) values (
    p_entity_type, p_sofascore_id, v_internal_id, p_sha256, p_storage_path, p_mime_type,
    p_byte_size, 'stored', 0, statement_timestamp(), statement_timestamp()
  )
  on conflict (entity_type, sofascore_id) do update
  set internal_id = excluded.internal_id,
      content_sha256 = excluded.content_sha256,
      storage_path = excluded.storage_path,
      mime_type = excluded.mime_type,
      byte_size = excluded.byte_size,
      status = 'stored',
      failure_count = 0,
      checked_at = statement_timestamp(),
      changed_at = statement_timestamp(),
      updated_at = statement_timestamp();

  if p_entity_type = 'player' then
    update app.players
    set catalog_photo_path = p_storage_path, updated_at = statement_timestamp()
    where id = v_internal_id;
  else
    select team.name, media.storage_path into v_team_name, v_current_path
    from app.teams team
    left join app.media_assets media on media.id = team.crest_asset_id
    where team.id = v_internal_id;
    select id into v_asset_id
    from app.media_assets
    where kind = 'team_crest' and storage_path = p_storage_path
    for update;
    if v_asset_id is null then
      insert into app.media_assets (
        kind, storage_path, attribution, validation_status, validated_at, mime_type, alt_text
      ) values (
        'team_crest', p_storage_path, 'SofaScore', 'validated', statement_timestamp(),
        p_mime_type, v_team_name || ' crest'
      )
      returning id into v_asset_id;
    end if;
    -- A crest supplied by BotolaGO stays; the copy is stored but not linked.
    if v_current_path is null or v_current_path !~ '/crest-curated[.]' then
      update app.teams
      set crest_asset_id = v_asset_id, updated_at = statement_timestamp()
      where id = v_internal_id;
      v_linked := true;
    end if;
  end if;

  return jsonb_build_object(
    'previousPath',
    case when v_previous_path is distinct from p_storage_path then v_previous_path else null end,
    'linked', v_linked
  );
exception
  when check_violation or not_null_violation or string_data_right_truncation then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
end;
$$;

revoke all on function api.service_sofascore_catalog_record_image(text, text, text, text, text, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function api.service_sofascore_catalog_record_image(text, text, text, text, text, text, integer)
  to service_role;
comment on function api.service_sofascore_catalog_record_image(text, text, text, text, text, text, integer) is
  'Service role: records the outcome of fetching one SofaScore club crest or player image for an already-mapped club or player. A stored crest is linked to the club unless it has a BotolaGO-supplied one; a player copy goes to catalog_photo_path only.';
