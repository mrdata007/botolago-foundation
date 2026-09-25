-- Match details: the events, team statistics and lineups behind a match page.
--
-- The Résumé, Stats and Compos tabs read `app.match_events`,
-- `app.fixture_team_statistics` and `app.lineups` / `app.lineup_players`
-- (through `api.football_match_timeline`, `api.football_match_statistics` and
-- `api.football_match_lineups`). Nothing ever wrote them: the SportsMonks
-- adapter asks only for participants, state and scores, and no ingestion RPC
-- existed for the three tables. Production held 481 finished fixtures and not
-- one event, statistic or lineup row, so every match page showed three empty
-- tabs, finished matches included.
--
-- This migration adds the write side and tells the live refresh when to use
-- it; the adapter that fetches the data lives in
-- supabase/functions/_shared/sportsmonks-match-details.ts.
--
--   * `api.ingest_football_match_details` stores one fixture's details from a
--     normalized provider payload, atomically. Events are upserted on a key
--     derived from the provider's event id, so an event keeps its row id from
--     one refresh to the next: the match page tracks events by id, and a new
--     id would replay the goal takeover for a goal already on the sheet.
--     An event the provider no longer reports (a goal ruled out) is removed.
--     A section the provider sent empty is left as stored, so a thin or
--     failed reply never wipes what an earlier one delivered. An older reply
--     than the one stored changes nothing.
--   * `api.service_football_match_details_due` names the fixtures a refresh
--     should fetch details for: those on or about to start, those finalized
--     in the last two hours (providers settle statistics and correct events
--     after the whistle), or, for the one-off backfill, finished fixtures
--     with no details at all.
--   * `app_private.football_live_refresh_tick` keeps calling the live refresh
--     every 15 minutes for two hours after a match is finalized, so that
--     settling reaches the page. It was idle as soon as the match ended.
--
-- Both RPCs are service_role only, security definer, empty search_path, like
-- every other ingestion RPC. No table is created or altered and no row is
-- written by the migration itself.

create or replace function api.ingest_football_match_details(
  p_provider_name text,
  p_fixture_external_id text,
  p_details jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fixture_id uuid;
  v_home_team_id uuid;
  v_away_team_id uuid;
  v_updated_at timestamptz;
  v_sequence bigint;
  v_events jsonb;
  v_statistics jsonb;
  v_lineups jsonb;
  v_lineup jsonb;
  v_team_id uuid;
  v_lineup_id uuid;
  v_formation text;
  v_mapped integer;
  v_unmapped integer;
  v_count integer;
  v_event_prefix text;
  v_events_written integer := 0;
  v_events_removed integer := 0;
  v_statistics_written integer := 0;
  v_lineups_written integer := 0;
  v_lineup_players integer := 0;
  v_unmapped_players integer := 0;
begin
  if jsonb_typeof(p_details) is distinct from 'object'
    or octet_length(p_details::text) > 262144
    or p_fixture_external_id is null
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;
  v_events := coalesce(p_details -> 'events', '[]'::jsonb);
  v_statistics := coalesce(p_details -> 'statistics', '[]'::jsonb);
  v_lineups := coalesce(p_details -> 'lineups', '[]'::jsonb);
  if jsonb_typeof(v_events) <> 'array' or jsonb_array_length(v_events) > 400
    or jsonb_typeof(v_statistics) <> 'array' or jsonb_array_length(v_statistics) > 200
    or jsonb_typeof(v_lineups) <> 'array' or jsonb_array_length(v_lineups) > 2
    or exists (
      select 1 from jsonb_array_elements(v_events || v_statistics || v_lineups) item
      where jsonb_typeof(item) <> 'object'
    )
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
    v_updated_at := (p_details ->> 'providerUpdatedAt')::timestamptz;
    v_sequence := coalesce((p_details ->> 'sourceSequence')::bigint, 0);
  exception when invalid_text_representation or datetime_field_overflow
    or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end;
  if v_updated_at is null or v_sequence < 0 then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;

  -- One writer per fixture at a time (the live refresh and a backfill can
  -- overlap); the freshness check below then orders them.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_provider_name || ':fixture-details:' || p_fixture_external_id, 0)
  );

  select fixture.id, fixture.home_team_id, fixture.away_team_id
  into v_fixture_id, v_home_team_id, v_away_team_id
  from app_private.football_provider_mappings mapping
  join app.fixtures fixture on fixture.id = mapping.internal_entity_id
  where mapping.provider_name = p_provider_name
    and mapping.entity_type = 'fixture'
    and mapping.external_id = p_fixture_external_id
    and mapping.active;
  if v_fixture_id is null then
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  end if;

  -- An older reply than the newest one stored changes nothing. The row
  -- triggers enforce the same order row by row; checking once up front keeps
  -- a late reply from deleting or re-adding anything.
  if exists (
    select 1 from (
      select provider_updated_at, source_sequence
      from app.match_events where fixture_id = v_fixture_id
      union all
      select provider_updated_at, source_sequence
      from app.lineups where fixture_id = v_fixture_id
      union all
      select provider_updated_at, source_sequence
      from app.fixture_team_statistics where fixture_id = v_fixture_id
    ) stored
    where (stored.provider_updated_at, stored.source_sequence) > (v_updated_at, v_sequence)
  ) then
    return jsonb_build_object('outcome', 'stale', 'fixtureId', v_fixture_id);
  end if;

  -- Every club the payload names is one of this fixture's two.
  if exists (
    select 1
    from (
      select item ->> 'teamExternalId' as external_id, false as required
      from jsonb_array_elements(v_events) item
      union all
      select item ->> 'teamExternalId', true from jsonb_array_elements(v_statistics) item
      union all
      select item ->> 'teamExternalId', true from jsonb_array_elements(v_lineups) item
    ) named
    where (named.external_id is null and named.required)
      or (named.external_id is not null and not exists (
        select 1 from app_private.football_provider_mappings mapping
        where mapping.provider_name = p_provider_name
          and mapping.entity_type = 'team'
          and mapping.external_id = named.external_id
          and mapping.active
          and mapping.internal_entity_id in (v_home_team_id, v_away_team_id)
      ))
  ) then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;

  -- Events ------------------------------------------------------------------
  if jsonb_array_length(v_events) > 0 then
    if exists (
      select 1 from jsonb_array_elements(v_events) item
      where coalesce(item ->> 'key', '') !~ '^[A-Za-z0-9._-]{1,120}$'
    ) or (
      select count(distinct item ->> 'key') from jsonb_array_elements(v_events) item
    ) <> jsonb_array_length(v_events) then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end if;

    v_event_prefix := p_provider_name || ':event:';
    insert into app.match_events as event (
      fixture_id, team_id, player_id, related_player_id, event_type, detail,
      minute, added_time, sequence_number, period, idempotency_key,
      provider_event_key, provider_updated_at, source_sequence
    )
    select
      v_fixture_id,
      team_map.internal_entity_id,
      player_map.internal_entity_id,
      nullif(related_map.internal_entity_id, player_map.internal_entity_id),
      (item ->> 'type')::app.match_event_type,
      -- The club's own spelling of a known player (what the lineups show);
      -- the provider's text for anyone the catalogue does not know.
      coalesce(player.display_name, nullif(btrim(left(btrim(item ->> 'detail'), 500)), '')),
      (item ->> 'minute')::integer,
      coalesce((item ->> 'addedTime')::integer, 0),
      (item ->> 'sequence')::integer,
      (item ->> 'period')::app.fixture_period,
      v_event_prefix || (item ->> 'key'),
      item ->> 'key',
      v_updated_at,
      v_sequence
    from jsonb_array_elements(v_events) item
    left join app_private.football_provider_mappings team_map
      on team_map.provider_name = p_provider_name
     and team_map.entity_type = 'team'
     and team_map.external_id = item ->> 'teamExternalId'
     and team_map.active
    left join app_private.football_provider_mappings player_map
      on player_map.provider_name = p_provider_name
     and player_map.entity_type = 'player'
     and player_map.external_id = item ->> 'playerExternalId'
     and player_map.active
    left join app.players player on player.id = player_map.internal_entity_id
    left join app_private.football_provider_mappings related_map
      on related_map.provider_name = p_provider_name
     and related_map.entity_type = 'player'
     and related_map.external_id = item ->> 'relatedPlayerExternalId'
     and related_map.active
    on conflict (fixture_id, idempotency_key) do update set
      team_id = excluded.team_id,
      player_id = excluded.player_id,
      related_player_id = excluded.related_player_id,
      event_type = excluded.event_type,
      detail = excluded.detail,
      minute = excluded.minute,
      added_time = excluded.added_time,
      sequence_number = excluded.sequence_number,
      period = excluded.period,
      provider_event_key = excluded.provider_event_key,
      provider_updated_at = excluded.provider_updated_at,
      source_sequence = excluded.source_sequence;
    get diagnostics v_events_written = row_count;

    -- The provider no longer reports it (a goal ruled out, a card rescinded).
    delete from app.match_events event
    where event.fixture_id = v_fixture_id
      and pg_catalog.starts_with(event.idempotency_key, v_event_prefix)
      and not exists (
        select 1 from jsonb_array_elements(v_events) item
        where v_event_prefix || (item ->> 'key') = event.idempotency_key
      );
    get diagnostics v_events_removed = row_count;
  end if;

  -- Team statistics ---------------------------------------------------------
  if jsonb_array_length(v_statistics) > 0 then
    if (
      select count(*) from (
        select distinct item ->> 'teamExternalId', item ->> 'code'
        from jsonb_array_elements(v_statistics) item
      ) pairs
    ) <> jsonb_array_length(v_statistics) then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end if;

    -- A code with no active definition is not shown, so it is not stored.
    insert into app.fixture_team_statistics as stat (
      fixture_id, team_id, statistic_definition_id, numeric_value, display_value,
      provider_updated_at, source_sequence
    )
    select
      v_fixture_id,
      team_map.internal_entity_id,
      definition.id,
      (item ->> 'value')::numeric,
      nullif(btrim(left(btrim(item ->> 'displayValue'), 60)), ''),
      v_updated_at,
      v_sequence
    from jsonb_array_elements(v_statistics) item
    join app_private.football_provider_mappings team_map
      on team_map.provider_name = p_provider_name
     and team_map.entity_type = 'team'
     and team_map.external_id = item ->> 'teamExternalId'
     and team_map.active
    join app.statistic_definitions definition
      on definition.code = item ->> 'code' and definition.active
    on conflict (fixture_id, team_id, statistic_definition_id) do update set
      numeric_value = excluded.numeric_value,
      display_value = excluded.display_value,
      provider_updated_at = excluded.provider_updated_at,
      source_sequence = excluded.source_sequence;
    get diagnostics v_statistics_written = row_count;

    if v_statistics_written > 0 then
      delete from app.fixture_team_statistics stat
      where stat.fixture_id = v_fixture_id
        and not exists (
          select 1
          from jsonb_array_elements(v_statistics) item
          join app_private.football_provider_mappings team_map
            on team_map.provider_name = p_provider_name
           and team_map.entity_type = 'team'
           and team_map.external_id = item ->> 'teamExternalId'
           and team_map.active
          join app.statistic_definitions definition on definition.code = item ->> 'code'
          where team_map.internal_entity_id = stat.team_id
            and definition.id = stat.statistic_definition_id
        );
    end if;
  end if;

  -- Lineups -----------------------------------------------------------------
  if (
    select count(distinct item ->> 'teamExternalId') from jsonb_array_elements(v_lineups) item
  ) <> jsonb_array_length(v_lineups) then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;

  for v_lineup in select item from jsonb_array_elements(v_lineups) item loop
    if jsonb_typeof(v_lineup -> 'players') is distinct from 'array'
      or jsonb_array_length(v_lineup -> 'players') > 60
      or exists (
        select 1 from jsonb_array_elements(v_lineup -> 'players') player
        where jsonb_typeof(player) <> 'object'
      )
    then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end if;

    select mapping.internal_entity_id into v_team_id
    from app_private.football_provider_mappings mapping
    where mapping.provider_name = p_provider_name
      and mapping.entity_type = 'team'
      and mapping.external_id = v_lineup ->> 'teamExternalId'
      and mapping.active;

    -- A player the catalogue does not know cannot be listed (a lineup row
    -- needs a player). They are counted, and the rest of the lineup stands.
    select
      count(*) filter (where player_map.internal_entity_id is null),
      count(distinct player_map.internal_entity_id)
    into v_unmapped, v_mapped
    from jsonb_array_elements(v_lineup -> 'players') player
    left join app_private.football_provider_mappings player_map
      on player_map.provider_name = p_provider_name
     and player_map.entity_type = 'player'
     and player_map.external_id = player ->> 'playerExternalId'
     and player_map.active;
    v_unmapped_players := v_unmapped_players + v_unmapped;
    if v_mapped = 0 then
      continue;
    end if;

    v_formation := nullif(btrim(v_lineup ->> 'formation'), '');
    if v_formation !~ '^[1-5](?:-[1-5]){1,4}$' then
      v_formation := null;
    end if;

    insert into app.lineups as lineup (
      fixture_id, team_id, formation, confirmed, published_at,
      provider_updated_at, source_sequence
    ) values (
      v_fixture_id, v_team_id, v_formation,
      coalesce((v_lineup ->> 'confirmed')::boolean, true),
      statement_timestamp(), v_updated_at, v_sequence
    )
    on conflict (fixture_id, team_id) do update set
      formation = excluded.formation,
      confirmed = excluded.confirmed,
      -- When BotolaGO first had it.
      published_at = coalesce(lineup.published_at, excluded.published_at),
      provider_updated_at = excluded.provider_updated_at,
      source_sequence = excluded.source_sequence
    returning lineup.id into v_lineup_id;

    -- Replaced whole: the order is renumbered 1..n per slot, which an
    -- in-place update could collide on. The page keys players by player id.
    delete from app.lineup_players where lineup_id = v_lineup_id;
    insert into app.lineup_players (
      lineup_id, player_id, slot, position, shirt_number, display_order, captain
    )
    select
      v_lineup_id,
      chosen.player_id,
      chosen.slot,
      chosen.position,
      chosen.shirt_number,
      row_number() over (
        partition by chosen.slot order by chosen.provider_order, chosen.external_id
      )::integer,
      false
    from (
      select distinct on (player_map.internal_entity_id)
        player_map.internal_entity_id as player_id,
        (player ->> 'slot')::app.lineup_slot as slot,
        coalesce((player ->> 'position')::app.football_position, catalog_player.position) as position,
        case
          when (player ->> 'shirtNumber')::integer between 1 and 99
            then (player ->> 'shirtNumber')::integer
        end as shirt_number,
        coalesce((player ->> 'order')::integer, 1000) as provider_order,
        player_map.external_id
      from jsonb_array_elements(v_lineup -> 'players') player
      join app_private.football_provider_mappings player_map
        on player_map.provider_name = p_provider_name
       and player_map.entity_type = 'player'
       and player_map.external_id = player ->> 'playerExternalId'
       and player_map.active
      join app.players catalog_player on catalog_player.id = player_map.internal_entity_id
      order by
        player_map.internal_entity_id,
        (player ->> 'slot') is distinct from 'starting',
        coalesce((player ->> 'order')::integer, 1000)
    ) chosen;
    get diagnostics v_count = row_count;
    v_lineup_players := v_lineup_players + v_count;
    v_lineups_written := v_lineups_written + 1;
  end loop;

  return jsonb_build_object(
    'outcome', 'stored',
    'fixtureId', v_fixture_id,
    'events', v_events_written,
    'eventsRemoved', v_events_removed,
    'statistics', v_statistics_written,
    'lineups', v_lineups_written,
    'lineupPlayers', v_lineup_players,
    'unmappedPlayers', v_unmapped_players
  );
exception
  when foreign_key_violation then
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  when check_violation or not_null_violation or invalid_text_representation
    or numeric_value_out_of_range or datetime_field_overflow or unique_violation
    or cardinality_violation then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
end;
$$;

comment on function api.ingest_football_match_details(text, text, jsonb) is
  'Stores one fixture''s provider events, team statistics and lineups. Service role only.';

revoke all on function api.ingest_football_match_details(text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function api.ingest_football_match_details(text, text, jsonb) to service_role;

create or replace function api.service_football_match_details_due(
  p_provider_name text,
  p_season_external_id text,
  p_scope text,
  p_limit integer default 8
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  now_at timestamptz := statement_timestamp();
  v_season_id uuid;
  result jsonb;
begin
  if p_scope is null or p_scope not in ('live', 'backfill') then
    raise exception using errcode = '22023', message = 'INVALID_DETAILS_SCOPE';
  end if;
  if p_limit is null or p_limit not between 1 and 20 then
    raise exception using errcode = '22023', message = 'INVALID_PAGE_LIMIT';
  end if;

  select internal_entity_id into v_season_id
  from app_private.football_provider_mappings
  where provider_name = p_provider_name
    and entity_type = 'season'
    and external_id = p_season_external_id
    and active;
  if v_season_id is null then
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'externalId', due.external_id,
    'status', due.status
  ) order by due.rank_at, due.id), '[]'::jsonb)
  into result
  from (
    select
      fixture.id,
      mapping.external_id,
      fixture.status,
      -- Live: in kick-off order. Backfill: the most recent first.
      case when p_scope = 'backfill'
        then -extract(epoch from fixture.kickoff_at)
        else extract(epoch from fixture.kickoff_at)
      end as rank_at
    from app.fixtures fixture
    join app_private.football_provider_mappings mapping
      on mapping.provider_name = p_provider_name
     and mapping.entity_type = 'fixture'
     and mapping.internal_entity_id = fixture.id
     and mapping.active
    where fixture.season_id = v_season_id
      and case p_scope
        when 'live' then
          -- In play, delayed or interrupted: the same window the tick uses.
          (fixture.status in ('delayed', 'live_first_half', 'half_time', 'live_second_half',
              'extra_time', 'penalties', 'suspended')
            and fixture.kickoff_at between now_at - interval '24 hours'
              and now_at + interval '10 minutes')
          -- About to start, or started without the provider saying so: the
          -- lineups are out by then.
          or (fixture.status in ('scheduled', 'not_started')
            and app_private.fantasy_kickoff_confirmed(fixture.kickoff_at)
            and fixture.kickoff_at between now_at - interval '3 hours'
              and now_at + interval '15 minutes')
          -- Just over: statistics settle and events get corrected.
          or (fixture.status = 'finished'
            and fixture.finalized_at >= now_at - interval '2 hours')
        else
          fixture.status = 'finished'
          and not exists (select 1 from app.match_events event where event.fixture_id = fixture.id)
          and not exists (select 1 from app.lineups lineup where lineup.fixture_id = fixture.id)
          and not exists (
            select 1 from app.fixture_team_statistics stat where stat.fixture_id = fixture.id
          )
      end
    order by rank_at, fixture.id
    limit p_limit
  ) due;
  return result;
end;
$$;

comment on function api.service_football_match_details_due(text, text, text, integer) is
  'The fixtures whose details a refresh should fetch: live (on, about to start, or finalized in the last two hours) or backfill (finished with none stored). Service role only.';

revoke all on function api.service_football_match_details_due(text, text, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function api.service_football_match_details_due(text, text, text, integer)
  to service_role;

-- The live refresh tick (20260924200500), with one more tier: a match
-- finalized in the last two hours is refreshed every 15 minutes, so its
-- settled statistics and corrected events reach the page. Eight calls per
-- match; unchanged otherwise.
create or replace function app_private.football_live_refresh_tick()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings app_private.notification_email_settings%rowtype;
  beat app_private.football_live_refresh_heartbeat%rowtype;
  now_at timestamptz := statement_timestamp();
  cadence interval;
begin
  select * into settings from app_private.notification_email_settings where id;
  if not settings.football_live_refresh_enabled or settings.functions_base_url is null then
    return 'disabled';
  end if;

  select case
    when exists (
      select 1 from app.fixtures fixture
      join app.seasons season on season.id = fixture.season_id and season.is_current
      where app_private.fantasy_kickoff_confirmed(fixture.kickoff_at)
        and (
          -- still being played, delayed or interrupted, however long it takes
          -- (bounded, so a fixture the provider never closes cannot keep the
          -- refresh running for ever)
          (fixture.status in ('delayed', 'live_first_half', 'half_time', 'live_second_half',
              'extra_time', 'penalties', 'suspended')
            and fixture.kickoff_at between now_at - interval '24 hours' and now_at + interval '10 minutes')
          -- started without the provider saying so yet
          or (fixture.status in ('scheduled', 'not_started')
            and fixture.kickoff_at between now_at - interval '3 hours' and now_at)
        )
    ) then interval '2 minutes'
    when exists (
      select 1 from app.fixtures fixture
      join app.seasons season on season.id = fixture.season_id and season.is_current
      where app_private.fantasy_kickoff_confirmed(fixture.kickoff_at)
        and fixture.status in ('scheduled', 'not_started')
        and fixture.kickoff_at > now_at and fixture.kickoff_at <= now_at + interval '10 minutes'
    ) then interval '5 minutes'
    -- just finalized: the match details settle after the whistle
    when exists (
      select 1 from app.fixtures fixture
      join app.seasons season on season.id = fixture.season_id and season.is_current
      where fixture.status = 'finished'
        and fixture.finalized_at >= now_at - interval '2 hours'
    ) then interval '15 minutes'
  end into cadence;

  select * into beat from app_private.football_live_refresh_heartbeat where id for update;

  if cadence is null then
    -- Nothing on: forget the last call, so the next match is refreshed at once.
    if beat.last_invoked_at is not null then
      update app_private.football_live_refresh_heartbeat
      set last_invoked_at = null, last_outcome = 'idle', updated_at = now_at
      where id;
    end if;
    return 'idle';
  end if;

  -- pg_cron can start a tick a few seconds late; 20 seconds of slack keeps a
  -- two-minute cadence from slipping to three.
  if beat.last_invoked_at is not null
    and beat.last_invoked_at > now_at - cadence + interval '20 seconds' then
    return 'waiting';
  end if;

  if app_private.invoke_scheduled_function(
    settings.functions_base_url, 'football-live-refresh', '{"job":"fixtures"}'::jsonb
  ) is null then
    return 'not_configured';
  end if;
  update app_private.football_live_refresh_heartbeat
  set last_invoked_at = now_at, last_outcome = 'invoked', updated_at = now_at
  where id;
  return 'invoked';
end;
$$;
