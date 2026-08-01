-- BotolaGO Production V2
-- Gate 3B: service-only historical player, squad, and standings persistence.

create or replace function api.ingest_football_squad(
  p_provider_name text,
  p_season_external_id text,
  p_team_external_id text,
  p_memberships jsonb,
  p_observed_at timestamptz,
  p_source_sequence bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
  v_team_id uuid;
  v_season_starts_on date;
  v_season_ends_on date;
  v_item jsonb;
  v_external_player_id text;
  v_player_id uuid;
  v_membership_id uuid;
  v_mapped_last_seen_at timestamptz;
  v_mapped_source_version text;
  v_player_updated_at timestamptz;
  v_player_source_sequence bigint;
  v_source_version text;
  v_full_name text;
  v_display_name text;
  v_first_name text;
  v_last_name text;
  v_date_of_birth date;
  v_position app.football_position;
  v_preferred_foot app.preferred_foot;
  v_shirt_number integer;
  v_players_inserted integer := 0;
  v_players_updated integer := 0;
  v_players_skipped integer := 0;
  v_memberships_inserted integer := 0;
  v_memberships_updated integer := 0;
begin
  if p_provider_name is null
    or p_season_external_id is null
    or p_team_external_id is null
    or p_observed_at is null
    or p_source_sequence is null
    or p_source_sequence < 0
    or p_season_external_id <> btrim(p_season_external_id)
    or p_team_external_id <> btrim(p_team_external_id)
    or char_length(p_season_external_id) not between 1 and 200
    or char_length(p_team_external_id) not between 1 and 200
    or p_memberships is null
    or jsonb_typeof(p_memberships) <> 'array'
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;
  if jsonb_array_length(p_memberships) > 100
    or octet_length(p_memberships::text) > 262144
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;
  if not exists (
    select 1 from app_private.football_providers
    where name = p_provider_name and active
  ) then
    raise exception using errcode = 'P0002', message = 'PROVIDER_NOT_FOUND';
  end if;

  select mapping.internal_entity_id
  into v_season_id
  from app_private.football_provider_mappings mapping
  where mapping.provider_name = p_provider_name
    and mapping.entity_type = 'season'
    and mapping.external_id = p_season_external_id
    and mapping.active;
  select mapping.internal_entity_id
  into v_team_id
  from app_private.football_provider_mappings mapping
  where mapping.provider_name = p_provider_name
    and mapping.entity_type = 'team'
    and mapping.external_id = p_team_external_id
    and mapping.active;
  if v_season_id is null or v_team_id is null then
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  end if;
  select starts_on, ends_on
  into v_season_starts_on, v_season_ends_on
  from app.seasons
  where id = v_season_id;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_provider_name || ':squad:' || p_season_external_id || ':' || p_team_external_id,
      0
    )
  );

  for v_item in select value from jsonb_array_elements(p_memberships)
  loop
    if jsonb_typeof(v_item) <> 'object' or octet_length(v_item::text) > 8192 then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end if;
    begin
      v_external_player_id := nullif(v_item ->> 'externalPlayerId', '');
      v_full_name := nullif(btrim(v_item ->> 'fullName'), '');
      v_display_name := nullif(btrim(v_item ->> 'displayName'), '');
      v_first_name := nullif(btrim(v_item ->> 'firstName'), '');
      v_last_name := nullif(btrim(v_item ->> 'lastName'), '');
      v_date_of_birth := nullif(v_item ->> 'dateOfBirth', '')::date;
      v_position := (v_item ->> 'position')::app.football_position;
      v_preferred_foot := coalesce(v_item ->> 'preferredFoot', 'unknown')::app.preferred_foot;
      v_shirt_number := nullif(v_item ->> 'shirtNumber', '')::integer;
      v_player_updated_at := (v_item #>> '{freshness,updatedAt}')::timestamptz;
      v_player_source_sequence := (v_item #>> '{freshness,sourceSequence}')::bigint;
      v_source_version := nullif(v_item #>> '{freshness,sourceVersion}', '');
    exception when invalid_text_representation or datetime_field_overflow then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end;
    if v_external_player_id is null
      or v_external_player_id <> btrim(v_external_player_id)
      or char_length(v_external_player_id) not between 1 and 200
      or v_full_name is null
      or v_display_name is null
      or v_position is null
      or v_player_updated_at is null
      or v_player_source_sequence is null
      or v_player_source_sequence < 0
      or v_source_version is null
    then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        p_provider_name || ':player:' || v_external_player_id,
        0
      )
    );
    select mapping.internal_entity_id, mapping.last_seen_at, mapping.source_version
    into v_player_id, v_mapped_last_seen_at, v_mapped_source_version
    from app_private.football_provider_mappings mapping
    where mapping.provider_name = p_provider_name
      and mapping.entity_type = 'player'
      and mapping.external_id = v_external_player_id
      and mapping.active;

    if v_mapped_last_seen_at is not null and v_player_updated_at < v_mapped_last_seen_at then
      raise exception using errcode = 'P0001', message = 'STALE_UPDATE';
    end if;
    if v_player_id is null then
      v_player_id := gen_random_uuid();
      insert into app.players (
        id, slug, full_name, display_name, first_name, last_name,
        date_of_birth, position, preferred_foot, active
      ) values (
        v_player_id,
        app_private.football_catalog_slug('player', v_display_name, v_player_id),
        v_full_name, v_display_name, v_first_name, v_last_name,
        v_date_of_birth, v_position, v_preferred_foot, true
      );
      v_players_inserted := v_players_inserted + 1;
    elsif v_mapped_last_seen_at = v_player_updated_at
      and v_mapped_source_version is not distinct from v_source_version
    then
      v_players_skipped := v_players_skipped + 1;
    else
      update app.players set
        full_name = v_full_name,
        display_name = v_display_name,
        first_name = v_first_name,
        last_name = v_last_name,
        date_of_birth = v_date_of_birth,
        position = v_position,
        preferred_foot = v_preferred_foot,
        active = true
      where id = v_player_id;
      v_players_updated := v_players_updated + 1;
    end if;
    perform api.resolve_football_mapping(
      p_provider_name, 'player', v_external_player_id, v_player_id,
      v_source_version, v_player_updated_at
    );

    select membership.id
    into v_membership_id
    from app.team_memberships membership
    where membership.player_id = v_player_id
      and membership.team_id = v_team_id
      and membership.season_id = v_season_id
      and membership.valid_from = v_season_starts_on;
    if v_membership_id is null then
      insert into app.team_memberships (
        player_id, team_id, season_id, shirt_number, squad_role,
        valid_from, valid_to, active
      ) values (
        v_player_id, v_team_id, v_season_id, v_shirt_number, 'player',
        v_season_starts_on, v_season_ends_on, false
      );
      v_memberships_inserted := v_memberships_inserted + 1;
    else
      update app.team_memberships set
        shirt_number = v_shirt_number,
        squad_role = 'player',
        valid_to = v_season_ends_on,
        active = false
      where id = v_membership_id;
      v_memberships_updated := v_memberships_updated + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'playersInserted', v_players_inserted,
    'playersUpdated', v_players_updated,
    'playersSkipped', v_players_skipped,
    'membershipsInserted', v_memberships_inserted,
    'membershipsUpdated', v_memberships_updated
  );
exception
  when foreign_key_violation then
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  when check_violation or not_null_violation or string_data_right_truncation then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'MAPPING_COLLISION';
end;
$$;

revoke all on function api.ingest_football_squad(text, text, text, jsonb, timestamptz, bigint)
  from public, anon, authenticated, service_role;
grant execute on function api.ingest_football_squad(text, text, text, jsonb, timestamptz, bigint)
  to service_role;

comment on function api.ingest_football_squad(text, text, text, jsonb, timestamptz, bigint) is
  'Service-role-only historical player and completed-season squad snapshot persistence.';

create or replace function api.ingest_football_standings(
  p_provider_name text,
  p_season_external_id text,
  p_rows jsonb,
  p_observed_at timestamptz,
  p_source_sequence bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
  v_competition_id uuid;
  v_team_id uuid;
  v_existing_id uuid;
  v_existing_updated_at timestamptz;
  v_item jsonb;
  v_team_external_id text;
  v_rank integer;
  v_played integer;
  v_won integer;
  v_drawn integer;
  v_lost integer;
  v_goals_for integer;
  v_goals_against integer;
  v_points integer;
  v_form text;
  v_inserted integer := 0;
  v_updated integer := 0;
begin
  if p_provider_name is null
    or p_season_external_id is null
    or p_observed_at is null
    or p_source_sequence is null
    or p_source_sequence < 0
    or p_season_external_id <> btrim(p_season_external_id)
    or char_length(p_season_external_id) not between 1 and 200
    or p_rows is null
    or jsonb_typeof(p_rows) <> 'array'
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;
  if jsonb_array_length(p_rows) > 50
    or octet_length(p_rows::text) > 131072
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;
  if not exists (
    select 1 from app_private.football_providers
    where name = p_provider_name and active
  ) then
    raise exception using errcode = 'P0002', message = 'PROVIDER_NOT_FOUND';
  end if;
  select mapping.internal_entity_id
  into v_season_id
  from app_private.football_provider_mappings mapping
  where mapping.provider_name = p_provider_name
    and mapping.entity_type = 'season'
    and mapping.external_id = p_season_external_id
    and mapping.active;
  if v_season_id is null then
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  end if;
  select competition_id into v_competition_id from app.seasons where id = v_season_id;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_provider_name || ':standings:' || p_season_external_id,
      0
    )
  );

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(v_item) <> 'object' or octet_length(v_item::text) > 4096 then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end if;
    begin
      v_team_external_id := nullif(v_item ->> 'teamExternalId', '');
      v_rank := (v_item ->> 'rank')::integer;
      v_played := (v_item ->> 'played')::integer;
      v_won := (v_item ->> 'won')::integer;
      v_drawn := (v_item ->> 'drawn')::integer;
      v_lost := (v_item ->> 'lost')::integer;
      v_goals_for := (v_item ->> 'goalsFor')::integer;
      v_goals_against := (v_item ->> 'goalsAgainst')::integer;
      v_points := (v_item ->> 'points')::integer;
      v_form := nullif(v_item ->> 'form', '');
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end;
    if v_team_external_id is null or v_team_external_id <> btrim(v_team_external_id) then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end if;
    select mapping.internal_entity_id
    into v_team_id
    from app_private.football_provider_mappings mapping
    where mapping.provider_name = p_provider_name
      and mapping.entity_type = 'team'
      and mapping.external_id = v_team_external_id
      and mapping.active;
    if v_team_id is null then
      raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
    end if;

    select standing.id, standing.provider_updated_at
    into v_existing_id, v_existing_updated_at
    from app.standings standing
    where standing.season_id = v_season_id
      and standing.group_key = ''
      and standing.table_type = 'overall'
      and standing.team_id = v_team_id;
    if v_existing_updated_at is not null and p_observed_at < v_existing_updated_at then
      raise exception using errcode = 'P0001', message = 'STALE_UPDATE';
    end if;
    if v_existing_id is null then
      insert into app.standings (
        competition_id, season_id, group_key, table_type, team_id, rank,
        played, won, drawn, lost, goals_for, goals_against, points, form,
        provider_updated_at, source_sequence
      ) values (
        v_competition_id, v_season_id, '', 'overall', v_team_id, v_rank,
        v_played, v_won, v_drawn, v_lost, v_goals_for, v_goals_against,
        v_points, v_form, p_observed_at, p_source_sequence
      );
      v_inserted := v_inserted + 1;
    else
      update app.standings set
        competition_id = v_competition_id,
        rank = v_rank,
        played = v_played,
        won = v_won,
        drawn = v_drawn,
        lost = v_lost,
        goals_for = v_goals_for,
        goals_against = v_goals_against,
        points = v_points,
        form = v_form,
        provider_updated_at = p_observed_at,
        source_sequence = p_source_sequence
      where id = v_existing_id;
      v_updated := v_updated + 1;
    end if;
  end loop;
  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated);
exception
  when foreign_key_violation then
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  when check_violation or not_null_violation or string_data_right_truncation then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'MAPPING_COLLISION';
end;
$$;

revoke all on function api.ingest_football_standings(text, text, jsonb, timestamptz, bigint)
  from public, anon, authenticated, service_role;
grant execute on function api.ingest_football_standings(text, text, jsonb, timestamptz, bigint)
  to service_role;

comment on function api.ingest_football_standings(text, text, jsonb, timestamptz, bigint) is
  'Service-role-only season standings snapshot persistence with mapped canonical teams.';

create or replace function api.football_team_squad(
  p_team_id uuid,
  p_season_id uuid default null,
  p_language text default 'fr'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform app_private.football_language(p_language);
  if not exists (select 1 from app.teams where id = p_team_id) then
    raise exception using errcode = 'P0002', message = 'TEAM_NOT_FOUND';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'membershipId', membership.id,
    'playerId', player.id,
    'slug', player.slug,
    'displayName', player.display_name,
    'fullName', player.full_name,
    'position', player.position,
    'shirtNumber', membership.shirt_number,
    'squadRole', membership.squad_role,
    'validFrom', membership.valid_from,
    'validTo', membership.valid_to,
    'active', membership.active
  ) order by player.position, membership.shirt_number nulls last, player.display_name, player.id), '[]'::jsonb)
  into result
  from app.team_memberships membership
  join app.players player on player.id = membership.player_id
  where membership.team_id = p_team_id
    and (
      (p_season_id is null and membership.active)
      or (p_season_id is not null and membership.season_id = p_season_id)
    );
  return result;
end;
$$;

comment on function api.football_team_squad(uuid, uuid, text) is
  'Returns current active memberships by default, or the full stored snapshot for an explicit historical season.';
