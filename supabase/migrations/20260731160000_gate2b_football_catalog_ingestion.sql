-- BotolaGO Production V2
-- Gate 2B: provider-independent catalog persistence for the SportsMonks canary.

insert into app_private.football_providers (name, display_name)
values ('sportsmonks', 'SportsMonks Football API')
on conflict (name) do update
set display_name = excluded.display_name,
    active = true;

create or replace function app_private.football_catalog_slug(
  p_prefix text,
  p_name text,
  p_id uuid
)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  normalized text;
begin
  normalized := trim(both '-' from pg_catalog.regexp_replace(
    pg_catalog.lower(p_name), '[^a-z0-9]+', '-', 'g'
  ));
  if normalized = '' then normalized := p_prefix; end if;
  return pg_catalog.left(normalized, 130)
    || '-' || pg_catalog.left(pg_catalog.replace(p_id::text, '-', ''), 12);
end;
$$;

revoke all on function app_private.football_catalog_slug(text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function app_private.football_catalog_slug(text, text, uuid) to postgres;

create or replace function app_private.resolve_football_country(p_iso_alpha2 text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  country_id uuid;
begin
  if p_iso_alpha2 is null then return null; end if;
  if p_iso_alpha2 !~ '^[A-Z]{2}$' then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;

  select id into country_id
  from app.countries
  where iso_alpha2 = p_iso_alpha2 and active;
  if country_id is not null then return country_id; end if;

  -- Gate 2 is deliberately scoped to Morocco. Other countries must be added
  -- through a reviewed reference-data migration before they can be ingested.
  if p_iso_alpha2 <> 'MA' then
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  end if;

  insert into app.countries (iso_alpha2, iso_alpha3, flag_emoji)
  values ('MA', 'MAR', '🇲🇦')
  on conflict (iso_alpha2) do update set active = true
  returning id into country_id;

  insert into app.country_translations (country_id, language, display_name)
  values (country_id, 'fr', 'Maroc'), (country_id, 'ar', 'المغرب')
  on conflict (country_id, language) do nothing;
  return country_id;
end;
$$;

revoke all on function app_private.resolve_football_country(text)
  from public, anon, authenticated, service_role;
grant execute on function app_private.resolve_football_country(text) to postgres;

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
  return jsonb_build_object('id', target_id, 'outcome', v_outcome);
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
