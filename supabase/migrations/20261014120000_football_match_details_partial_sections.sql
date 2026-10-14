-- Match details: one bad section or row no longer throws the whole delivery away.
--
-- api.ingest_football_match_details (last 20260925170000) stored a delivery
-- all or nothing: one event with a type the page does not know, one minute out
-- of range, two pressure values for the same minute, an absence with an
-- unknown category, or an event Fantasy still references and the provider
-- dropped, refused the whole call with INVALID_PROVIDER_PAYLOAD or
-- MAPPING_NOT_FOUND, and with it the goals, the lineups and the team
-- statistics of the same reply. On the live path that meant a match page with
-- a live score and an empty timeline (FUS Rabat - Raja, 2026-10-13: every
-- details attempt during play refused, all 11 events written at full time).
-- Nothing needs the sections to land together: the Résumé, Compos and Stats
-- tabs read them separately and Fantasy scores from its own observations.
--
-- Now:
--   * The delivery as a whole is still refused, exactly as before, when it
--     cannot be this fixture's: not an object, too large, a section that is not
--     a list, an unknown or inactive provider, a fixture BotolaGO does not know
--     (MAPPING_NOT_FOUND), a club that is not one of the match's two, or a
--     statistic, lineup, pressure value or absence with no club. An older
--     reply than the one stored is still `stale` and changes nothing.
--   * Inside it, each section (events, statistics, each club's lineup,
--     pressure, absences) is stored on its own. A section that fails is rolled
--     back alone, keeps what was stored before, and is named in
--     `rejectedSections`; the others are stored.
--   * Inside a section, a row that cannot be stored (an event type, period,
--     minute, added time or order out of range; a statistic value that is not
--     a non-negative number; a lineup player with an unknown slot or position)
--     is left out and counted (`eventsRejected`, `statisticsRejected`,
--     `lineupPlayersRejected`). An event left out is not deleted: the stored
--     version stays until a valid one replaces it.
--   * Keys that cannot identify a row (an event or absence key that is
--     missing, malformed or repeated, a statistic or pressure value given twice)
--     still refuse their section, not the delivery.
--
-- api.football_sofascore_live_snapshot also tells, per fixture, whether a
-- lineup is stored (`hasLineups`), so the live refresh can read the lineups of
-- a match in play until it has them instead of only on the tick that sees the
-- kickoff.
--
-- Same signatures and grants. The answer of the ingestion gains four keys;
-- callers that do not know them read it as before.

-- Each test is a CASE so a cast only runs on text the pattern already
-- accepted (AND does not promise an evaluation order).
create or replace function app_private.football_detail_event_ok(p_item jsonb)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    coalesce((p_item ->> 'type') = any (enum_range(null::app.match_event_type)::text[]), false)
    and coalesce((p_item ->> 'period') = any (enum_range(null::app.fixture_period)::text[]), false)
    and case
      when coalesce(p_item ->> 'minute', '') ~ '^[0-9]{1,3}$'
        then (p_item ->> 'minute')::integer <= 180
      else false
    end
    and case
      when p_item ->> 'addedTime' is null then true
      when (p_item ->> 'addedTime') ~ '^[0-9]{1,2}$' then (p_item ->> 'addedTime')::integer <= 60
      else false
    end
    and case
      when coalesce(p_item ->> 'sequence', '') ~ '^[0-9]{1,5}$'
        then (p_item ->> 'sequence')::integer <= 10000
      else false
    end
$$;

create or replace function app_private.football_detail_statistic_ok(p_item jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    nullif(btrim(coalesce(p_item ->> 'code', '')), '') is not null
    and case
      when coalesce(p_item ->> 'value', '') ~ '^[0-9]{1,10}(\.[0-9]+)?$'
        then (p_item ->> 'value')::numeric < 10000000000
      else false
    end
$$;

create or replace function app_private.football_detail_lineup_player_ok(p_item jsonb)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    coalesce((p_item ->> 'slot') = any (enum_range(null::app.lineup_slot)::text[]), false)
    and (p_item ->> 'position' is null
      or (p_item ->> 'position') = any (enum_range(null::app.football_position)::text[]))
    and (p_item ->> 'shirtNumber' is null or (p_item ->> 'shirtNumber') ~ '^[0-9]{1,4}$')
    and (p_item ->> 'order' is null or (p_item ->> 'order') ~ '^-?[0-9]{1,6}$')
$$;

revoke all on function app_private.football_detail_event_ok(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function app_private.football_detail_statistic_ok(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function app_private.football_detail_lineup_player_ok(jsonb)
  from public, anon, authenticated, service_role;

comment on function app_private.football_detail_event_ok(jsonb) is
  'True when one match-details event row can be stored (type, period, minute, added time and order in range). Used by api.ingest_football_match_details to leave out a bad row instead of refusing the delivery.';
comment on function app_private.football_detail_statistic_ok(jsonb) is
  'True when one match-details statistic row can be stored (a code and a non-negative number that fits numeric(14,4)).';
comment on function app_private.football_detail_lineup_player_ok(jsonb) is
  'True when one lineup player row can be stored (slot and position known, shirt number and order whole numbers).';

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
  v_pressure jsonb;
  v_absences jsonb;
  v_valid jsonb;
  v_players jsonb;
  v_lineup jsonb;
  v_team_id uuid;
  v_lineup_id uuid;
  v_formation text;
  v_listed integer;
  v_unmapped integer;
  v_count integer;
  v_event_prefix text;
  v_events_written integer := 0;
  v_events_removed integer := 0;
  v_events_rejected integer := 0;
  v_statistics_written integer := 0;
  v_statistics_rejected integer := 0;
  v_lineups_written integer := 0;
  v_lineup_players integer := 0;
  v_lineup_players_rejected integer := 0;
  v_unmapped_players integer := 0;
  v_pressure_written integer := 0;
  v_absences_written integer := 0;
  v_absences_removed integer := 0;
  v_rejected text[] := '{}';
begin
  if jsonb_typeof(p_details) is distinct from 'object'
    or octet_length(p_details::text) > 262144
    or p_fixture_external_id is null
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;
  -- Events and absences, absent: keep what is stored. A list, even empty, is
  -- the provider's current word (the only goal ruled out, a player back from
  -- injury: each drops off it).
  v_events := nullif(coalesce(p_details -> 'events', 'null'::jsonb), 'null'::jsonb);
  v_statistics := coalesce(p_details -> 'statistics', '[]'::jsonb);
  v_lineups := coalesce(p_details -> 'lineups', '[]'::jsonb);
  v_pressure := coalesce(p_details -> 'pressure', '[]'::jsonb);
  v_absences := nullif(coalesce(p_details -> 'absences', 'null'::jsonb), 'null'::jsonb);
  if (v_events is not null
      and (jsonb_typeof(v_events) <> 'array' or jsonb_array_length(v_events) > 400))
    or jsonb_typeof(v_statistics) <> 'array' or jsonb_array_length(v_statistics) > 200
    or jsonb_typeof(v_lineups) <> 'array' or jsonb_array_length(v_lineups) > 2
    or jsonb_typeof(v_pressure) <> 'array' or jsonb_array_length(v_pressure) > 400
    or (v_absences is not null
      and (jsonb_typeof(v_absences) <> 'array' or jsonb_array_length(v_absences) > 100))
    or exists (
      select 1
      from jsonb_array_elements(
        coalesce(v_events, '[]'::jsonb) || v_statistics || v_lineups || v_pressure
          || coalesce(v_absences, '[]'::jsonb)
      ) item
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
    or numeric_value_out_of_range or invalid_datetime_format then
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
      union all
      select provider_updated_at, source_sequence
      from app.fixture_pressure where fixture_id = v_fixture_id
      union all
      select provider_updated_at, source_sequence
      from app.fixture_absences where fixture_id = v_fixture_id
    ) stored
    where (stored.provider_updated_at, stored.source_sequence) > (v_updated_at, v_sequence)
  ) then
    return jsonb_build_object('outcome', 'stale', 'fixtureId', v_fixture_id);
  end if;

  -- Every club the payload names is one of this fixture's two: a reply that
  -- names another club is not this match's, and is refused whole.
  if exists (
    select 1
    from (
      select item ->> 'teamExternalId' as external_id, false as required
      from jsonb_array_elements(coalesce(v_events, '[]'::jsonb)) item
      union all
      select item ->> 'teamExternalId', true from jsonb_array_elements(v_statistics) item
      union all
      select item ->> 'teamExternalId', true from jsonb_array_elements(v_lineups) item
      union all
      select item ->> 'teamExternalId', true from jsonb_array_elements(v_pressure) item
      union all
      select item ->> 'teamExternalId', true
      from jsonb_array_elements(coalesce(v_absences, '[]'::jsonb)) item
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
  if v_events is not null then
    begin
      if exists (
        select 1 from jsonb_array_elements(v_events) item
        where coalesce(item ->> 'key', '') !~ '^[A-Za-z0-9._-]{1,120}$'
      ) or (
        select count(distinct item ->> 'key') from jsonb_array_elements(v_events) item
      ) <> jsonb_array_length(v_events) then
        raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
      end if;

      select coalesce(jsonb_agg(item order by ordinality), '[]'::jsonb)
      into v_valid
      from jsonb_array_elements(v_events) with ordinality as listed(item, ordinality)
      where app_private.football_detail_event_ok(item);
      v_events_rejected := jsonb_array_length(v_events) - jsonb_array_length(v_valid);

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
      from jsonb_array_elements(v_valid) item
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
      -- A row it still reports but that was left out above keeps its stored
      -- version.
      delete from app.match_events event
      where event.fixture_id = v_fixture_id
        and pg_catalog.starts_with(event.idempotency_key, v_event_prefix)
        and not exists (
          select 1 from jsonb_array_elements(v_events) item
          where v_event_prefix || (item ->> 'key') = event.idempotency_key
        );
      get diagnostics v_events_removed = row_count;
    exception
      when invalid_parameter_value or check_violation or not_null_violation
        or invalid_text_representation or numeric_value_out_of_range
        or datetime_field_overflow or invalid_datetime_format or unique_violation
        or cardinality_violation or foreign_key_violation then
      v_rejected := v_rejected || 'events'::text;
      v_events_written := 0;
      v_events_removed := 0;
      v_events_rejected := jsonb_array_length(v_events);
    end;
  end if;

  -- Team statistics ---------------------------------------------------------
  if jsonb_array_length(v_statistics) > 0 then
    begin
      if (
        select count(*) from (
          select distinct item ->> 'teamExternalId', item ->> 'code'
          from jsonb_array_elements(v_statistics) item
        ) pairs
      ) <> jsonb_array_length(v_statistics) then
        raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
      end if;

      select coalesce(jsonb_agg(item), '[]'::jsonb)
      into v_valid
      from jsonb_array_elements(v_statistics) item
      where app_private.football_detail_statistic_ok(item);
      v_statistics_rejected := jsonb_array_length(v_statistics) - jsonb_array_length(v_valid);

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
      from jsonb_array_elements(v_valid) item
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

      -- Replaced as a set, as before; a figure left out above as unreadable
      -- keeps its stored value.
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
    exception
      when invalid_parameter_value or check_violation or not_null_violation
        or invalid_text_representation or numeric_value_out_of_range
        or datetime_field_overflow or invalid_datetime_format or unique_violation
        or cardinality_violation or foreign_key_violation then
      v_rejected := v_rejected || 'statistics'::text;
      v_statistics_written := 0;
      v_statistics_rejected := jsonb_array_length(v_statistics);
    end;
  end if;

  -- Lineups -----------------------------------------------------------------
  -- Each club's lineup on its own: one club's unreadable list does not hold
  -- back the other's.
  for v_lineup in select item from jsonb_array_elements(v_lineups) item loop
    begin
      if (
        select count(*) from jsonb_array_elements(v_lineups) other
        where other ->> 'teamExternalId' = v_lineup ->> 'teamExternalId'
      ) <> 1
        or jsonb_typeof(v_lineup -> 'players') is distinct from 'array'
        or jsonb_array_length(v_lineup -> 'players') > 60
        or exists (
          select 1 from jsonb_array_elements(v_lineup -> 'players') player
          where jsonb_typeof(player) <> 'object'
        )
      then
        raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
      end if;

      select coalesce(jsonb_agg(player order by ordinality), '[]'::jsonb)
      into v_players
      from jsonb_array_elements(v_lineup -> 'players') with ordinality as listed(player, ordinality)
      where app_private.football_detail_lineup_player_ok(player);
      v_lineup_players_rejected := v_lineup_players_rejected
        + jsonb_array_length(v_lineup -> 'players') - jsonb_array_length(v_players);

      select mapping.internal_entity_id into v_team_id
      from app_private.football_provider_mappings mapping
      where mapping.provider_name = p_provider_name
        and mapping.entity_type = 'team'
        and mapping.external_id = v_lineup ->> 'teamExternalId'
        and mapping.active;

      -- A player the catalogue does not know is listed by the provider's name,
      -- as the timeline already names them, and counted; one with neither a
      -- known id nor a name cannot be shown.
      select
        count(*) filter (where player_map.internal_entity_id is null),
        count(*) filter (where player_map.internal_entity_id is not null
          or nullif(btrim(player ->> 'playerName'), '') is not null)
      into v_unmapped, v_listed
      from jsonb_array_elements(v_players) player
      left join app_private.football_provider_mappings player_map
        on player_map.provider_name = p_provider_name
       and player_map.entity_type = 'player'
       and player_map.external_id = player ->> 'playerExternalId'
       and player_map.active;
      v_unmapped_players := v_unmapped_players + v_unmapped;
      if v_listed > 0 then
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
          lineup_id, player_id, player_name, slot, position, shirt_number, display_order, captain
        )
        select
          v_lineup_id,
          chosen.player_id,
          chosen.player_name,
          chosen.slot,
          chosen.position,
          chosen.shirt_number,
          row_number() over (
            partition by chosen.slot
            order by chosen.provider_order, chosen.external_id, chosen.player_name
          )::integer,
          false
        from (
          -- One row per person: a known player once, an unknown one once per
          -- provider id (or, without one, per name).
          select distinct on (listed.person)
            listed.player_id, listed.player_name, listed.slot, listed.position,
            listed.shirt_number, listed.provider_order, listed.external_id
          from (
            select
              coalesce(
                player_map.internal_entity_id::text,
                'provider:' || coalesce(player ->> 'playerExternalId',
                  'name:' || lower(btrim(player ->> 'playerName')))
              ) as person,
              player_map.internal_entity_id as player_id,
              case when player_map.internal_entity_id is null
                then nullif(btrim(left(btrim(player ->> 'playerName'), 200)), '')
              end as player_name,
              (player ->> 'slot')::app.lineup_slot as slot,
              coalesce((player ->> 'position')::app.football_position, catalog_player.position) as position,
              case
                when (player ->> 'shirtNumber')::integer between 1 and 99
                  then (player ->> 'shirtNumber')::integer
              end as shirt_number,
              coalesce((player ->> 'order')::integer, 1000) as provider_order,
              coalesce(player_map.external_id, player ->> 'playerExternalId', '') as external_id
            from jsonb_array_elements(v_players) player
            left join app_private.football_provider_mappings player_map
              on player_map.provider_name = p_provider_name
             and player_map.entity_type = 'player'
             and player_map.external_id = player ->> 'playerExternalId'
             and player_map.active
            left join app.players catalog_player on catalog_player.id = player_map.internal_entity_id
            where player_map.internal_entity_id is not null
              or nullif(btrim(player ->> 'playerName'), '') is not null
          ) listed
          order by
            listed.person,
            listed.slot is distinct from 'starting',
            listed.provider_order
        ) chosen;
        get diagnostics v_count = row_count;
        v_lineup_players := v_lineup_players + v_count;
        v_lineups_written := v_lineups_written + 1;
      end if;
    exception
      when invalid_parameter_value or check_violation or not_null_violation
        or invalid_text_representation or numeric_value_out_of_range
        or datetime_field_overflow or invalid_datetime_format or unique_violation
        or cardinality_violation or foreign_key_violation then
      v_rejected := v_rejected
        || ('lineup:' || left(coalesce(v_lineup ->> 'teamExternalId', 'unknown'), 60))::text;
    end;
  end loop;

  -- Pressure index --------------------------------------------------------
  -- The whole curve, replaced: it only grows during a match, and the
  -- provider may revise earlier minutes.
  if jsonb_array_length(v_pressure) > 0 then
    begin
      if (
        select count(*) from (
          select distinct item ->> 'teamExternalId', item ->> 'minute'
          from jsonb_array_elements(v_pressure) item
        ) pairs
      ) <> jsonb_array_length(v_pressure) then
        raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
      end if;
      delete from app.fixture_pressure where fixture_id = v_fixture_id;
      insert into app.fixture_pressure (
        fixture_id, team_id, minute, pressure, provider_updated_at, source_sequence
      )
      select
        v_fixture_id,
        team_map.internal_entity_id,
        (item ->> 'minute')::integer,
        (item ->> 'value')::numeric,
        v_updated_at,
        v_sequence
      from jsonb_array_elements(v_pressure) item
      join app_private.football_provider_mappings team_map
        on team_map.provider_name = p_provider_name
       and team_map.entity_type = 'team'
       and team_map.external_id = item ->> 'teamExternalId'
       and team_map.active;
      get diagnostics v_pressure_written = row_count;
    exception
      when invalid_parameter_value or check_violation or not_null_violation
        or invalid_text_representation or numeric_value_out_of_range
        or datetime_field_overflow or invalid_datetime_format or unique_violation
        or cardinality_violation or foreign_key_violation then
      v_rejected := v_rejected || 'pressure'::text;
      v_pressure_written := 0;
    end;
  end if;

  -- Absent players --------------------------------------------------------
  if v_absences is not null then
    begin
      if exists (
        select 1 from jsonb_array_elements(v_absences) item
        where coalesce(item ->> 'key', '') !~ '^[A-Za-z0-9._-]{1,120}$'
      ) or (
        select count(distinct item ->> 'key') from jsonb_array_elements(v_absences) item
      ) <> jsonb_array_length(v_absences) then
        raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
      end if;

      insert into app.fixture_absences as absence (
        fixture_id, team_id, player_id, player_name, category, expected_return_on,
        games_missed, provider_key, provider_updated_at, source_sequence
      )
      select
        v_fixture_id,
        team_map.internal_entity_id,
        player_map.internal_entity_id,
        nullif(btrim(left(btrim(item ->> 'playerName'), 200)), ''),
        item ->> 'category',
        (item ->> 'expectedReturnOn')::date,
        (item ->> 'gamesMissed')::integer,
        p_provider_name || ':sidelined:' || (item ->> 'key'),
        v_updated_at,
        v_sequence
      from jsonb_array_elements(v_absences) item
      join app_private.football_provider_mappings team_map
        on team_map.provider_name = p_provider_name
       and team_map.entity_type = 'team'
       and team_map.external_id = item ->> 'teamExternalId'
       and team_map.active
      left join app_private.football_provider_mappings player_map
        on player_map.provider_name = p_provider_name
       and player_map.entity_type = 'player'
       and player_map.external_id = item ->> 'playerExternalId'
       and player_map.active
      on conflict (fixture_id, provider_key) do update set
        team_id = excluded.team_id,
        player_id = excluded.player_id,
        player_name = excluded.player_name,
        category = excluded.category,
        expected_return_on = excluded.expected_return_on,
        games_missed = excluded.games_missed,
        provider_updated_at = excluded.provider_updated_at,
        source_sequence = excluded.source_sequence;
      get diagnostics v_absences_written = row_count;

      delete from app.fixture_absences absence
      where absence.fixture_id = v_fixture_id
        and not exists (
          select 1 from jsonb_array_elements(v_absences) item
          where p_provider_name || ':sidelined:' || (item ->> 'key') = absence.provider_key
        );
      get diagnostics v_absences_removed = row_count;
    exception
      when invalid_parameter_value or check_violation or not_null_violation
        or invalid_text_representation or numeric_value_out_of_range
        or datetime_field_overflow or invalid_datetime_format or unique_violation
        or cardinality_violation or foreign_key_violation then
      v_rejected := v_rejected || 'absences'::text;
      v_absences_written := 0;
      v_absences_removed := 0;
    end;
  end if;

  -- Done, even with nothing to store: the backfill does not ask again.
  insert into app_private.football_match_details_syncs as sync (fixture_id)
  values (v_fixture_id)
  on conflict (fixture_id) do update set last_stored_at = excluded.last_stored_at;

  return jsonb_build_object(
    'outcome', 'stored',
    'fixtureId', v_fixture_id,
    'events', v_events_written,
    'eventsRemoved', v_events_removed,
    'eventsRejected', v_events_rejected,
    'statistics', v_statistics_written,
    'statisticsRejected', v_statistics_rejected,
    'lineups', v_lineups_written,
    'lineupPlayers', v_lineup_players,
    'lineupPlayersRejected', v_lineup_players_rejected,
    'unmappedPlayers', v_unmapped_players,
    'pressure', v_pressure_written,
    'absences', v_absences_written,
    'absencesRemoved', v_absences_removed,
    'rejectedSections', to_jsonb(v_rejected)
  );
exception
  when foreign_key_violation then
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  when check_violation or not_null_violation or invalid_text_representation
    or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format
    or unique_violation or cardinality_violation then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
end;
$$;

revoke all on function api.ingest_football_match_details(text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function api.ingest_football_match_details(text, text, jsonb) to service_role;

comment on function api.ingest_football_match_details(text, text, jsonb) is
  'Service role: stores one fixture''s match details (events, team statistics, lineups, pressure, absences) from a provider reply. The delivery is refused whole only when it cannot be this fixture''s; each section is stored on its own and a failing one is named in rejectedSections, a bad row is left out and counted.';

create or replace function api.football_sofascore_live_snapshot()
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
    'mappings', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'provider_name', m.provider_name,
        'entity_type', m.entity_type::text,
        'external_id', m.external_id,
        'internal_entity_id', m.internal_entity_id,
        'active', m.active) order by m.entity_type::text, m.external_id), '[]'::jsonb)
      from app_private.football_provider_mappings m
      where m.provider_name = 'sofascore' and m.active
    ),
    'fixtures', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id,
        'externalId', m.external_id,
        'kickoffAt', f.kickoff_at,
        'status', f.status::text,
        'period', f.period::text,
        'homeScore', f.home_score,
        'awayScore', f.away_score,
        'providerUpdatedAt', f.provider_updated_at,
        'sourceSequence', f.source_sequence,
        'finalizedAt', f.finalized_at,
        'homeTeamId', f.home_team_id,
        'awayTeamId', f.away_team_id,
        'minute', f.minute,
        'hasLineups', exists (select 1 from app.lineups l where l.fixture_id = f.id))
        order by f.kickoff_at, f.id), '[]'::jsonb)
      from app_private.football_provider_mappings m
      join app.fixtures f on f.id = m.internal_entity_id
      where m.provider_name = 'sofascore' and m.entity_type = 'fixture' and m.active
    )
  );
end;
$$;

revoke all on function api.football_sofascore_live_snapshot()
  from public, anon, authenticated, service_role;
grant execute on function api.football_sofascore_live_snapshot() to service_role;

comment on function api.football_sofascore_live_snapshot() is
  'Service role, read only: the active SofaScore provider mappings and the current state of the fixtures mapped to SofaScore (with their internal home and away team ids, the stored live minute and whether a lineup is stored), for the football-live-refresh Edge Function.';
