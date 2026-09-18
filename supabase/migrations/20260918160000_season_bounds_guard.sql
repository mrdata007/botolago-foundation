-- BotolaGO Production V2
-- BG-0031: season bounds guard.
--
-- 1. app.seasons gains an explicit, auditable owner lock (bounds_locked_at /
--    bounds_locked_reason). While a lock is set, any UPDATE that does not itself
--    change bounds_locked_at keeps the stored starts_on / ends_on (provider
--    ingestion included). An owner correction that sets a new bounds_locked_at
--    (or clears it) passes through.
-- 2. api.ingest_football_catalog_entity's `when 'season'` UPDATE branch becomes
--    monotone and correction-aware: the provider ends_on never shrinks the season
--    below greatest(existing ends_on, last fixture kickoff date, last membership
--    valid_to, fantasy season end), a provider ending_at <= starting_at is treated
--    as provisional, and a provider start later than the first published fixture
--    keeps the existing starts_on. The decision is reported in the returned jsonb
--    ("endsOnPreserved", "startsOnPreserved") so ingestion evidence shows it.
--
-- The rest of the function body is copied verbatim from
-- 20260731180229_gate2b_football_catalog_ingestion.sql (the only prior definition).
-- No data is changed here: the 2026/27 row correction and its lock are an
-- owner-approved production write (see docs/engineering/tasks/BG-0031).

alter table app.seasons
  add column if not exists bounds_locked_at timestamptz,
  add column if not exists bounds_locked_reason text;

comment on column app.seasons.bounds_locked_at is
  'When set, starts_on/ends_on are pinned by an owner correction; only an UPDATE that changes this value may move them.';
comment on column app.seasons.bounds_locked_reason is
  'Free-text reason recorded with bounds_locked_at (task id, correction date, source).';

create or replace function app_private.protect_locked_season_bounds()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.bounds_locked_at is not null
    and new.bounds_locked_at is not distinct from old.bounds_locked_at
  then
    new.starts_on := old.starts_on;
    new.ends_on := old.ends_on;
  end if;
  return new;
end;
$$;

revoke all on function app_private.protect_locked_season_bounds()
  from public, anon, authenticated, service_role;
grant execute on function app_private.protect_locked_season_bounds() to postgres;

drop trigger if exists seasons_protect_locked_bounds on app.seasons;
create trigger seasons_protect_locked_bounds
before update on app.seasons
for each row execute function app_private.protect_locked_season_bounds();

create or replace function api.ingest_football_catalog_entity(
  p_provider_name text,
  p_entity_type text,
  p_external_id text,
  p_entity jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_entity_type app_private.football_entity_type;
  target_id uuid;
  mapped_last_seen_at timestamptz;
  v_provider_updated_at timestamptz;
  v_source_sequence bigint;
  v_source_version text;
  v_country_id uuid;
  v_parent_id uuid;
  v_name text;
  v_short_name text;
  v_code text;
  v_label text;
  v_starts_on date;
  v_ends_on date;
  v_is_current boolean;
  v_round_number integer;
  v_outcome text := 'updated';
  -- BG-0031 season bounds guard (UPDATE branch of `when 'season'` only).
  v_existing_starts_on date;
  v_existing_ends_on date;
  v_first_kickoff_on date;
  v_floor_ends_on date;
  v_ends_on_preserved boolean;
  v_starts_on_preserved boolean;
  v_result_extra jsonb := '{}'::jsonb;
begin
  if p_entity_type not in ('competition', 'season', 'round', 'team') then
    raise exception using errcode = '22023', message = 'INVALID_ENTITY_TYPE';
  end if;
  if p_external_id is null or p_external_id <> btrim(p_external_id)
    or char_length(p_external_id) not between 1 and 200
    or jsonb_typeof(p_entity) <> 'object'
    or octet_length(p_entity::text) > 8192
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;
  if not exists (
    select 1 from app_private.football_providers
    where name = p_provider_name and active
  ) then
    raise exception using errcode = 'P0002', message = 'PROVIDER_NOT_FOUND';
  end if;

  begin
    v_provider_updated_at := (p_entity #>> '{freshness,updatedAt}')::timestamptz;
    v_source_sequence := (p_entity #>> '{freshness,sourceSequence}')::bigint;
    v_source_version := nullif(p_entity #>> '{freshness,sourceVersion}', '');
  exception when invalid_text_representation or datetime_field_overflow then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end;
  if v_provider_updated_at is null or v_source_sequence is null or v_source_sequence < 0 then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;

  normalized_entity_type := p_entity_type::app_private.football_entity_type;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_provider_name || ':' || p_entity_type || ':' || p_external_id, 0)
  );
  select internal_entity_id, last_seen_at
  into target_id, mapped_last_seen_at
  from app_private.football_provider_mappings
  where provider_name = p_provider_name
    and entity_type = normalized_entity_type
    and external_id = p_external_id
    and active;

  if mapped_last_seen_at is not null and v_provider_updated_at < mapped_last_seen_at then
    raise exception using errcode = 'P0001', message = 'STALE_UPDATE';
  end if;
  if mapped_last_seen_at = v_provider_updated_at
    and exists (
      select 1 from app_private.football_provider_mappings
      where provider_name = p_provider_name
        and entity_type = normalized_entity_type
        and external_id = p_external_id
        and source_version is not distinct from v_source_version
    )
  then
    return jsonb_build_object('id', target_id, 'outcome', 'skipped');
  end if;

  case p_entity_type
    when 'competition' then
      begin
        v_name := p_entity ->> 'name';
        v_short_name := nullif(p_entity ->> 'shortName', '');
        v_country_id := app_private.resolve_football_country(
          nullif(pg_catalog.upper(p_entity ->> 'countryCode'), '')
        );
        if (p_entity ->> 'type')::app.competition_type is null then
          raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
        end if;
      exception when invalid_text_representation then
        raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
      end;
      if target_id is null then
        target_id := gen_random_uuid();
        insert into app.competitions (
          id, slug, name, short_name, competition_type, country_id, active
        ) values (
          target_id,
          app_private.football_catalog_slug('competition', v_name, target_id),
          v_name, v_short_name, (p_entity ->> 'type')::app.competition_type,
          v_country_id, true
        );
        v_outcome := 'inserted';
      else
        update app.competitions set
          name = v_name,
          short_name = v_short_name,
          competition_type = (p_entity ->> 'type')::app.competition_type,
          country_id = v_country_id,
          active = true
        where id = target_id;
      end if;

    when 'season' then
      select internal_entity_id into v_parent_id
      from app_private.football_provider_mappings
      where provider_name = p_provider_name
        and entity_type = 'competition'
        and external_id = p_entity ->> 'competitionExternalId'
        and active;
      if v_parent_id is null then
        raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
      end if;
      begin
        v_label := p_entity ->> 'label';
        v_starts_on := (p_entity ->> 'startsOn')::date;
        v_ends_on := (p_entity ->> 'endsOn')::date;
        v_is_current := (p_entity ->> 'current')::boolean;
      exception when invalid_text_representation or datetime_field_overflow then
        raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
      end;
      if v_label is null or v_starts_on is null or v_ends_on is null or v_is_current is null then
        raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
      end if;
      if v_is_current then
        update app.seasons set is_current = false
        where competition_id = v_parent_id and id is distinct from target_id and is_current;
      end if;
      if target_id is null then
        target_id := gen_random_uuid();
        insert into app.seasons (
          id, competition_id, label, starts_on, ends_on, status, is_current
        ) values (
          target_id, v_parent_id, v_label, v_starts_on, v_ends_on,
          case when v_is_current then 'active'::app.season_status
            when v_ends_on < current_date then 'completed'::app.season_status
            else 'planned'::app.season_status end,
          v_is_current
        );
        v_outcome := 'inserted';
      else
        -- BG-0031: monotone, correction-aware season bounds. The provider value
        -- is provisional when ending_at <= starting_at or when it would shrink
        -- the season below data already attached to it; in either case the
        -- existing ends_on is kept. A provider start later than the first
        -- published fixture keeps the existing starts_on.
        select season.starts_on, season.ends_on
        into v_existing_starts_on, v_existing_ends_on
        from app.seasons season
        where season.id = target_id;
        select
          min((fixture.kickoff_at at time zone 'UTC')::date),
          max((fixture.kickoff_at at time zone 'UTC')::date)
        into v_first_kickoff_on, v_floor_ends_on
        from app.fixtures fixture
        where fixture.season_id = target_id;
        v_floor_ends_on := greatest(
          v_existing_ends_on,
          v_floor_ends_on,
          (select max(membership.valid_to)
             from app.team_memberships membership
            where membership.season_id = target_id),
          (select max((fantasy_season.ends_at at time zone 'UTC')::date)
             from app.fantasy_seasons fantasy_season
            where fantasy_season.football_season_id = target_id)
        );
        v_ends_on_preserved := v_ends_on <= v_starts_on or v_ends_on < v_floor_ends_on;
        if v_ends_on_preserved then
          v_ends_on := v_existing_ends_on;
        end if;
        v_starts_on_preserved := v_first_kickoff_on is not null
          and v_starts_on > v_first_kickoff_on;
        if v_starts_on_preserved then
          v_starts_on := v_existing_starts_on;
        end if;
        v_result_extra := jsonb_build_object(
          'endsOnPreserved', v_ends_on_preserved,
          'startsOnPreserved', v_starts_on_preserved
        );
        update app.seasons set
          competition_id = v_parent_id,
          label = v_label,
          starts_on = v_starts_on,
          ends_on = v_ends_on,
          status = case when v_is_current then 'active'::app.season_status
            when v_ends_on < current_date then 'completed'::app.season_status
            else 'planned'::app.season_status end,
          is_current = v_is_current
        where id = target_id;
      end if;

    when 'round' then
      select internal_entity_id into v_parent_id
      from app_private.football_provider_mappings
      where provider_name = p_provider_name
        and entity_type = 'season'
        and external_id = p_entity ->> 'seasonExternalId'
        and active;
      if v_parent_id is null then
        raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
      end if;
      begin
        v_name := p_entity ->> 'name';
        v_round_number := nullif(p_entity ->> 'number', '')::integer;
      exception when invalid_text_representation then
        raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
      end;
      if target_id is null then
        target_id := gen_random_uuid();
        insert into app.rounds (id, season_id, round_number, name, status)
        values (target_id, v_parent_id, v_round_number, v_name, 'planned');
        v_outcome := 'inserted';
      else
        update app.rounds set
          season_id = v_parent_id,
          round_number = v_round_number,
          name = v_name
        where id = target_id;
      end if;

    when 'team' then
      v_name := p_entity ->> 'name';
      v_short_name := p_entity ->> 'shortName';
      v_code := nullif(pg_catalog.upper(p_entity ->> 'code'), '');
      v_country_id := app_private.resolve_football_country(
        nullif(pg_catalog.upper(p_entity ->> 'countryCode'), '')
      );
      if target_id is null then
        target_id := gen_random_uuid();
        insert into app.teams (
          id, slug, name, short_name, code, country_id, active
        ) values (
          target_id,
          app_private.football_catalog_slug('team', v_name, target_id),
          v_name, v_short_name, v_code, v_country_id, true
        );
        v_outcome := 'inserted';
      else
        update app.teams set
          name = v_name,
          short_name = v_short_name,
          code = v_code,
          country_id = v_country_id,
          active = true
        where id = target_id;
      end if;
  end case;

  perform api.resolve_football_mapping(
    p_provider_name, p_entity_type, p_external_id, target_id,
    v_source_version, v_provider_updated_at
  );
  return jsonb_build_object('id', target_id, 'outcome', v_outcome) || v_result_extra;
exception
  when foreign_key_violation then
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  when check_violation or not_null_violation or string_data_right_truncation then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'MAPPING_COLLISION';
end;
$$;

revoke all on function api.ingest_football_catalog_entity(text, text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function api.ingest_football_catalog_entity(text, text, text, jsonb)
  to service_role;

comment on function api.ingest_football_catalog_entity(text, text, text, jsonb) is
  'Idempotent service-role-only catalog persistence for normalized competition, season, round, and team provider entities.';
