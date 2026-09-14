-- This recovery imports complete, observed current squads. Historical import
-- routines retain their inactive-membership semantics. No Fantasy rows or
-- worker schedules are created by this migration.
create table app_private.current_football_squad_imports (
  season_id uuid primary key references app.seasons(id) on delete restrict,
  provider_name text not null,
  observed_at timestamptz not null,
  source_digest text not null check (source_digest ~ '^[0-9a-f]{64}$'),
  result jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);
alter table app_private.current_football_squad_imports enable row level security;
alter table app_private.current_football_squad_imports force row level security;
revoke all on table app_private.current_football_squad_imports from public, anon, authenticated, service_role;

create function api.service_ingest_current_football_squads(
  p_provider_name text,
  p_season_external_id text,
  p_team_squads jsonb,
  p_observed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_season app.seasons%rowtype;
  prior_import app_private.current_football_squad_imports%rowtype;
  team_squad jsonb;
  source_digest text;
  source_player_count integer;
  activated_count integer;
  result jsonb;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_provider_name is distinct from 'sportsmonks'
    or p_season_external_id is distinct from '28647'
    or p_team_squads is null or jsonb_typeof(p_team_squads) <> 'array'
    or p_observed_at is null
    or p_observed_at < statement_timestamp() - interval '15 minutes'
    or p_observed_at > statement_timestamp() + interval '1 minute'
  then
    raise exception using errcode = 'PT400', message = 'invalid_current_squad_input';
  end if;
  if jsonb_array_length(p_team_squads) <> 16 or octet_length(p_team_squads::text) > 2097152 then
    raise exception using errcode = 'PT400', message = 'invalid_current_squad_bounds';
  end if;
  select season.* into target_season
  from app.seasons season
  join app_private.football_provider_mappings mapping
    on mapping.internal_entity_id = season.id and mapping.entity_type = 'season'
    and mapping.provider_name = p_provider_name and mapping.external_id = p_season_external_id and mapping.active
  join app_private.football_provider_mappings competition_mapping
    on competition_mapping.internal_entity_id = season.competition_id
    and competition_mapping.entity_type = 'competition' and competition_mapping.provider_name = p_provider_name
    and competition_mapping.external_id = '860' and competition_mapping.active
  join app.competitions competition on competition.id = season.competition_id and competition.active;
  if target_season.id is null or not target_season.is_current
    or target_season.label <> '2026/2027'
    or target_season.status not in ('planned', 'active')
    or target_season.ends_on < current_date
  then
    raise exception using errcode = 'PT409', message = 'current_season_required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'fantasy:catalog:' || target_season.id::text, 0));
  -- Recovery is a pre-activation operation. Later transfers need a separately
  -- reconciled live catalog update, not silent changes to a playable catalog.
  if exists (select 1 from app.fantasy_seasons season where season.football_season_id = target_season.id) then
    raise exception using errcode = 'PT409', message = 'fantasy_catalog_already_staged';
  end if;
  source_digest := encode(extensions.digest(p_team_squads::text, 'sha256'), 'hex');
  select * into prior_import from app_private.current_football_squad_imports where season_id = target_season.id;
  if found then
    if prior_import.observed_at = p_observed_at and prior_import.source_digest = source_digest then
      return prior_import.result;
    end if;
    if prior_import.observed_at >= p_observed_at then
      raise exception using errcode = 'PT409', message = 'stale_current_squad_observation';
    end if;
  end if;

  for team_squad in select value from jsonb_array_elements(p_team_squads)
  loop
    if jsonb_typeof(team_squad) <> 'object'
      or coalesce(team_squad ->> 'teamExternalId', '') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(team_squad -> 'memberships') is distinct from 'array'
    then
      raise exception using errcode = 'PT400', message = 'invalid_current_squad_shape';
    end if;
    if jsonb_array_length(team_squad -> 'memberships') not between 1 and 100 then
      raise exception using errcode = 'PT400', message = 'current_squad_empty_or_oversized';
    end if;
    if not exists (
      select 1 from app_private.football_provider_mappings mapping
      join app.teams team on team.id = mapping.internal_entity_id and team.active
      where mapping.provider_name = p_provider_name and mapping.entity_type = 'team'
        and mapping.external_id = team_squad ->> 'teamExternalId' and mapping.active
    ) then
      raise exception using errcode = 'PT409', message = 'current_team_mapping_missing';
    end if;
  end loop;
  if (select count(distinct value ->> 'teamExternalId') from jsonb_array_elements(p_team_squads)) <> 16 then
    raise exception using errcode = 'PT400', message = 'duplicate_current_team';
  end if;
  select count(*) into source_player_count
  from jsonb_array_elements(p_team_squads) squad
  cross join lateral jsonb_array_elements(squad -> 'memberships') member;
  if (select count(distinct member ->> 'externalPlayerId')
      from jsonb_array_elements(p_team_squads) squad
      cross join lateral jsonb_array_elements(squad -> 'memberships') member) <> source_player_count then
    raise exception using errcode = 'PT400', message = 'duplicate_current_player_membership';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_team_squads) squad
    cross join lateral jsonb_array_elements(squad -> 'memberships') member
    where member ->> 'shirtNumber' is not null
    group by squad ->> 'teamExternalId', member ->> 'shirtNumber' having count(*) > 1
  ) then
    raise exception using errcode = 'PT400', message = 'duplicate_current_shirt_number';
  end if;
  if exists (
    select 1 from app.fixtures fixture
    cross join lateral (values (fixture.home_team_id), (fixture.away_team_id)) participant(team_id)
    where fixture.season_id = target_season.id and not exists (
      select 1 from jsonb_array_elements(p_team_squads) squad
      join app_private.football_provider_mappings mapping
        on mapping.provider_name = p_provider_name and mapping.entity_type = 'team'
        and mapping.external_id = squad ->> 'teamExternalId' and mapping.active
      where mapping.internal_entity_id = participant.team_id
    )
  ) then
    raise exception using errcode = 'PT409', message = 'current_fixture_team_not_in_squads';
  end if;

  -- Replace only the selected current season's active membership set in one
  -- transaction. Any validation/mapping/collision failure rolls everything back.
  update app.team_memberships set active = false
  where season_id = target_season.id and active;
  for team_squad in select value from jsonb_array_elements(p_team_squads)
  loop
    perform api.ingest_football_squad(p_provider_name, p_season_external_id,
      team_squad ->> 'teamExternalId', team_squad -> 'memberships',
      p_observed_at, (extract(epoch from p_observed_at) * 1000)::bigint);
  end loop;
  update app.team_memberships membership set active = true
  where membership.season_id = target_season.id and exists (
    select 1 from jsonb_array_elements(p_team_squads) squad
    cross join lateral jsonb_array_elements(squad -> 'memberships') member
    join app_private.football_provider_mappings player_mapping
      on player_mapping.provider_name = p_provider_name and player_mapping.entity_type = 'player'
      and player_mapping.external_id = member ->> 'externalPlayerId' and player_mapping.active
    join app_private.football_provider_mappings team_mapping
      on team_mapping.provider_name = p_provider_name and team_mapping.entity_type = 'team'
      and team_mapping.external_id = squad ->> 'teamExternalId' and team_mapping.active
    where player_mapping.internal_entity_id = membership.player_id
      and team_mapping.internal_entity_id = membership.team_id
      and membership.valid_from = target_season.starts_on
  );
  get diagnostics activated_count = row_count;
  if activated_count <> source_player_count then
    raise exception using errcode = 'PT409', message = 'current_squad_activation_count_mismatch';
  end if;
  result := jsonb_build_object('seasonId', target_season.id, 'teams', 16,
    'activeMemberships', activated_count, 'observedAt', p_observed_at,
    'sourceDigest', source_digest, 'fantasyActivated', false);
  insert into app_private.current_football_squad_imports(season_id, provider_name, observed_at, source_digest, result)
  values (target_season.id, p_provider_name, p_observed_at, source_digest, result)
  on conflict (season_id) do update set observed_at = excluded.observed_at,
    source_digest = excluded.source_digest, result = excluded.result, updated_at = statement_timestamp();
  return result;
end;
$$;
revoke all on function api.service_ingest_current_football_squads(text,text,jsonb,timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function api.service_ingest_current_football_squads(text,text,jsonb,timestamptz) to service_role;
notify pgrst, 'reload schema';
