-- BotolaGO Production V2
-- Persist validated SportsMonks team crests in a dedicated public media bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'football-media',
  'football-media',
  true,
  2000000,
  array['image/avif', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function api.attach_football_team_crest(
  p_provider_name text,
  p_external_team_id text,
  p_source_url text,
  p_storage_path text,
  p_mime_type text,
  p_observed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_team_id uuid;
  target_team_name text;
  target_asset_id uuid;
  expected_extension text;
  expected_path text;
begin
  if p_provider_name <> 'sportsmonks'
    or p_external_team_id is null
    or p_external_team_id !~ '^[0-9]{1,20}$'
    or p_source_url is null
    or p_source_url !~* '^https://([a-z0-9-]+[.])*sportmonks[.]com/'
    or p_source_url ~* '(access[_-]?token|api[_-]?key|signature|credential)='
    or p_observed_at is null
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;

  expected_extension := case p_mime_type
    when 'image/avif' then 'avif'
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    else null
  end;
  expected_path := 'football/teams/' || p_external_team_id || '/crest.' || expected_extension;
  if expected_extension is null or p_storage_path is distinct from expected_path then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_provider_name || ':team_crest:' || p_external_team_id,
      0
    )
  );

  select mapping.internal_entity_id, team.name
  into target_team_id, target_team_name
  from app_private.football_provider_mappings mapping
  join app.teams team on team.id = mapping.internal_entity_id
  where mapping.provider_name = p_provider_name
    and mapping.entity_type = 'team'
    and mapping.external_id = p_external_team_id
    and mapping.active
    and team.active;

  if target_team_id is null then
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  end if;

  select id into target_asset_id
  from app.media_assets
  where kind = 'team_crest'
    and storage_path = p_storage_path
  for update;

  if target_asset_id is null then
    insert into app.media_assets (
      kind,
      source_url,
      storage_path,
      attribution,
      validation_status,
      validated_at,
      mime_type,
      alt_text
    ) values (
      'team_crest',
      p_source_url,
      p_storage_path,
      'SportsMonks Football API',
      'validated',
      p_observed_at,
      p_mime_type,
      target_team_name || ' crest'
    )
    returning id into target_asset_id;
  else
    update app.media_assets
    set source_url = p_source_url,
        attribution = 'SportsMonks Football API',
        validation_status = 'validated',
        validated_at = p_observed_at,
        mime_type = p_mime_type,
        alt_text = target_team_name || ' crest',
        updated_at = statement_timestamp()
    where id = target_asset_id;
  end if;

  update app.teams
  set crest_asset_id = target_asset_id,
      updated_at = statement_timestamp()
  where id = target_team_id;

  return jsonb_build_object(
    'teamId', target_team_id,
    'assetId', target_asset_id,
    'storagePath', p_storage_path
  );
exception
  when check_violation or not_null_violation or string_data_right_truncation then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
end;
$$;

revoke all on function api.attach_football_team_crest(
  text, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function api.attach_football_team_crest(
  text, text, text, text, text, timestamptz
) to service_role;

comment on function api.attach_football_team_crest(
  text, text, text, text, text, timestamptz
) is
  'Links a validated SportsMonks crest stored in football-media to its canonical team.';
