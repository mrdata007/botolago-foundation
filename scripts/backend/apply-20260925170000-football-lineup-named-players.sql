-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20260925170000_football_lineup_named_players: the Compos tab names
-- every player SportsMonks lists, including the ones BotolaGO's player list
-- does not know (by SportsMonks' name), instead of leaving them out.
--
-- WHEN
--   Any time no match is being played. Not at minute 12 of an hour (the
--   Fantasy orchestrator). Then deploy the Edge Function football-live-refresh
--   and run the backfill once: docs/production/APPLY_2026_09_25_LINEUP_NAMES.md.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Make sure no other database work is running right now.
--   2. Paste this WHOLE file and press Run. As shipped it is a REHEARSAL:
--      everything is applied inside one transaction, checked, then ROLLED
--      BACK. The result row should say "Rehearsal passed".
--   3. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied".
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass.
--
-- WHAT IT DOES
--   * refuses to run twice, before 20260925141500, or over any of the three
--     functions it replaces when they are not the versions measured in
--     production on 2026-09-25;
--   * records the migration file in supabase_migrations.schema_migrations and
--     runs it from that record once its sha256 matches the repository file;
--   * checks the result: each function body is the migration's, who may call
--     each, the new column and its checks, and that the backfill names the
--     matches stored so far again (their done marks are removed).
--   It changes no player, squad or Fantasy row. The lineups already stored
--   keep their players; the backfill then refetches those matches with every
--   player named.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20260925170000') then
    raise exception 'stop: migration 20260925170000 is already recorded as applied';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260925141500') then
    raise exception 'stop: the match details (20260925141500) are not applied yet';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'app' and table_name = 'lineup_players' and column_name = 'player_name') then
    raise exception 'stop: app.lineup_players.player_name already exists';
  end if;
  if md5((select prosrc from pg_proc
          where oid = 'api.ingest_football_match_details(text, text, jsonb)'::regprocedure))
    <> 'a0763ddc8e46298531358f034bac7ab9' then
    raise exception 'stop: api.ingest_football_match_details is not the version this update replaces (20260925141500)';
  end if;
  if md5((select prosrc from pg_proc
          where oid = 'api.service_football_match_details_due(text, text, text, integer)'::regprocedure))
    <> '3aa868a45fe1b83e3e5d406f688b5085' then
    raise exception 'stop: api.service_football_match_details_due is not the version this update replaces (20260925141500)';
  end if;
  if md5((select prosrc from pg_proc
          where oid = 'api.football_match_lineups(uuid, text)'::regprocedure))
    <> '77a7efc884592d2fbb0e594cc746b2b4' then
    raise exception 'stop: api.football_match_lineups is not the version this update replaces';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20260925170000, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260925170000',
  'football_lineup_named_players',
  array[$bg_20260925170000_file$-- Lineups name every player the provider lists, known to BotolaGO or not.
--
-- A lineup row needed a catalogue player, so the match-details ingestion
-- (20260925141500) left out anyone the catalogue does not know. On the first
-- match fetched (Amal Tiznit - Ittihad Tanger, 24 Sept) that was 16 of 35:
-- Amal Tiznit's and Widad Temara's squads were entered by hand from public
-- lists and carry no SportsMonks ids, and new signings are missing for every
-- club. The Compos tab showed Amal Tiznit with 5 starters.
--
--   * `app.lineup_players` takes a player the catalogue does not know by the
--     provider's name (`player_name`, with no `player_id`), as the timeline
--     already does for goals and cards. The player catalogue, the squads and
--     Fantasy are not touched.
--   * `api.ingest_football_match_details` stores those players by name.
--   * `api.football_match_lineups` returns them in a separate list,
--     `unlistedPlayers`, beside `players`: `players` keeps its shape (every
--     entry a catalogue player with a page), so a site that does not know the
--     new list reads the lineups as before.
--   * The backfill's only test is now the done mark: a finished match never
--     stored, or whose mark was removed, is fetched (again). The marks of the
--     matches stored so far are removed here, so the backfill fetches them
--     once more with their lineups whole.

alter table app.lineup_players alter column player_id drop not null;
alter table app.lineup_players add column player_name text;
alter table app.lineup_players add constraint lineup_players_player_check
  check (player_id is not null or player_name is not null);
alter table app.lineup_players add constraint lineup_players_player_name_check
  check (player_name is null or (player_name = btrim(player_name) and char_length(player_name) between 1 and 200));
comment on column app.lineup_players.player_name is
  'The provider''s name for a player the catalogue does not know (player_id null).';

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
  v_statistics_written integer := 0;
  v_lineups_written integer := 0;
  v_lineup_players integer := 0;
  v_unmapped_players integer := 0;
  v_pressure_written integer := 0;
  v_absences_written integer := 0;
  v_absences_removed integer := 0;
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

  -- Every club the payload names is one of this fixture's two.
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

    -- A player the catalogue does not know is listed by the provider's name,
    -- as the timeline already names them, and counted; one with neither a
    -- known id nor a name cannot be shown.
    select
      count(*) filter (where player_map.internal_entity_id is null),
      count(*) filter (where player_map.internal_entity_id is not null
        or nullif(btrim(player ->> 'playerName'), '') is not null)
    into v_unmapped, v_listed
    from jsonb_array_elements(v_lineup -> 'players') player
    left join app_private.football_provider_mappings player_map
      on player_map.provider_name = p_provider_name
     and player_map.entity_type = 'player'
     and player_map.external_id = player ->> 'playerExternalId'
     and player_map.active;
    v_unmapped_players := v_unmapped_players + v_unmapped;
    if v_listed = 0 then
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
        from jsonb_array_elements(v_lineup -> 'players') player
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
  end loop;

  -- Pressure index --------------------------------------------------------
  -- The whole curve, replaced: it only grows during a match, and the
  -- provider may revise earlier minutes.
  if jsonb_array_length(v_pressure) > 0 then
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
  end if;

  -- Absent players --------------------------------------------------------
  if v_absences is not null then
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
    'statistics', v_statistics_written,
    'lineups', v_lineups_written,
    'lineupPlayers', v_lineup_players,
    'unmappedPlayers', v_unmapped_players,
    'pressure', v_pressure_written,
    'absences', v_absences_written,
    'absencesRemoved', v_absences_removed
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
          -- Stored once, even with nothing in it: done. Removing the mark
          -- has the backfill fetch that match again.
          and not exists (
            select 1 from app_private.football_match_details_syncs sync
            where sync.fixture_id = fixture.id
          )
          -- Refused twice by the backfill (the provider will not serve it, or
          -- the reply cannot be stored): left out, so the fixtures behind it
          -- get their turn. The run's rejections say why.
          and (
            select count(*)
            from app_private.football_ingestion_rejections rejection
            join app_private.football_ingestion_runs run on run.id = rejection.run_id
            where run.provider_name = p_provider_name
              and run.job_type = 'match_events'
              and run.target_scope ->> 'scope' = 'backfill'
              and rejection.entity_type = 'fixture'
              and rejection.external_id = mapping.external_id
          ) < 2
      end
    order by rank_at, fixture.id
    limit p_limit
  ) due;
  return result;
end;
$$;

comment on function api.service_football_match_details_due(text, text, text, integer) is
  'The fixtures whose details a refresh should fetch: live (on, about to start, or finalized in the last two hours) or backfill (finished, not marked stored, not refused twice by the backfill). Service role only.';

revoke all on function api.service_football_match_details_due(text, text, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function api.service_football_match_details_due(text, text, text, integer)
  to service_role;

create or replace function api.football_match_lineups(
  p_fixture_id uuid,
  p_language text default 'fr'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform app_private.football_language(p_language);
  if not exists (select 1 from app.fixtures where id = p_fixture_id) then
    raise exception using errcode = 'P0002', message = 'FIXTURE_NOT_FOUND';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', lineup.id,
    'team', app_private.football_team_json(lineup.team_id, p_language),
    'formation', lineup.formation,
    'confirmed', lineup.confirmed,
    'publishedAt', lineup.published_at,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', player.id,
        'slug', player.slug,
        'displayName', player.display_name,
        'slot', selection.slot,
        'position', selection.position,
        'shirtNumber', selection.shirt_number,
        'order', selection.display_order,
        'captain', selection.captain
      ) order by selection.slot, selection.display_order, selection.id)
      from app.lineup_players selection
      join app.players player on player.id = selection.player_id
      where selection.lineup_id = lineup.id
    ), '[]'::jsonb),
    -- Players the catalogue does not know, by the provider's name: no page,
    -- so no slug; the id is the lineup row's.
    'unlistedPlayers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', selection.id,
        'displayName', selection.player_name,
        'slot', selection.slot,
        'position', selection.position,
        'shirtNumber', selection.shirt_number,
        'order', selection.display_order,
        'captain', selection.captain
      ) order by selection.slot, selection.display_order, selection.id)
      from app.lineup_players selection
      where selection.lineup_id = lineup.id
        and selection.player_id is null
    ), '[]'::jsonb)
  ) order by lineup.team_id), '[]'::jsonb)
  into result
  from app.lineups lineup
  where lineup.fixture_id = p_fixture_id;
  return result;
end;
$$;

revoke all on function api.football_match_lineups(uuid, text) from public, anon, authenticated, service_role;
grant execute on function api.football_match_lineups(uuid, text) to anon, authenticated, service_role;

-- The matches stored so far are fetched once more, with their lineups whole.
delete from app_private.football_match_details_syncs;
$bg_20260925170000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20260925170000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20260925170000'
  );
begin
  if encode(sha256(convert_to(part_20260925170000, 'UTF8')), 'hex')
    is distinct from '2888228ac6fe7da448714726311201a2d460b64261dc09054d64c61d375bc58a' then
    raise exception 'stop: 20260925170000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20260925170000;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  ingest constant regprocedure := 'api.ingest_football_match_details(text, text, jsonb)'::regprocedure;
  due constant regprocedure :=
    'api.service_football_match_details_due(text, text, text, integer)'::regprocedure;
  lineups constant regprocedure := 'api.football_match_lineups(uuid, text)'::regprocedure;
  answer jsonb;
  probe_fixture_id uuid;
begin
  -- Each function body is the migration's, measured by its source.
  if md5((select prosrc from pg_proc where oid = ingest)) <> '8f2d20b32202ea23860a47133312401e' then
    problems := problems || 'the ingestion is not the new version'::text;
  end if;
  if md5((select prosrc from pg_proc where oid = due)) <> '702bead6228e78b3e6a97590169dc844' then
    problems := problems || 'the due list is not the new version'::text;
  end if;
  if md5((select prosrc from pg_proc where oid = lineups)) <> 'c42273e57dbff94b5a6b404771859185' then
    problems := problems || 'the lineups read is not the new version'::text;
  end if;
  if has_function_privilege('anon', ingest, 'execute')
    or has_function_privilege('authenticated', ingest, 'execute')
    or not has_function_privilege('service_role', ingest, 'execute')
    or has_function_privilege('anon', due, 'execute')
    or has_function_privilege('authenticated', due, 'execute')
    or not has_function_privilege('service_role', due, 'execute')
    or not has_function_privilege('anon', lineups, 'execute')
    or not has_function_privilege('authenticated', lineups, 'execute') then
    problems := problems || 'a function is callable by the wrong roles'::text;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'app' and table_name = 'lineup_players'
                   and column_name = 'player_id' and is_nullable = 'YES')
    or not exists (select 1 from information_schema.columns
                   where table_schema = 'app' and table_name = 'lineup_players'
                     and column_name = 'player_name')
    or (select count(*) from pg_constraint
        where conrelid = 'app.lineup_players'::regclass
          and conname in ('lineup_players_player_check', 'lineup_players_player_name_check')) <> 2
    or has_table_privilege('anon', 'app.lineup_players', 'select') then
    problems := problems || 'app.lineup_players is not as the migration leaves it'::text;
  end if;
  if exists (select 1 from app.lineup_players where player_id is null) then
    problems := problems || 'a stored lineup row changed'::text;
  end if;
  if exists (select 1 from app_private.football_match_details_syncs) then
    problems := problems || 'a done mark was left'::text;
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260925170000') then
    problems := problems || 'history row missing'::text;
  end if;

  -- One real call of each read: the backfill names again every finished match
  -- of the season (28647 at SportsMonks) it has not refused twice, and the
  -- lineups of the latest one carry the new list.
  answer := api.service_football_match_details_due('sportsmonks', '28647', 'backfill', 20);
  if jsonb_typeof(answer) is distinct from 'array'
    or jsonb_array_length(answer) <> least(20, (
      select count(*) from app.fixtures fixture
      join app_private.football_provider_mappings season_mapping
        on season_mapping.provider_name = 'sportsmonks' and season_mapping.entity_type = 'season'
       and season_mapping.external_id = '28647' and season_mapping.active
       and season_mapping.internal_entity_id = fixture.season_id
      join app_private.football_provider_mappings mapping
        on mapping.provider_name = 'sportsmonks' and mapping.entity_type = 'fixture'
       and mapping.internal_entity_id = fixture.id and mapping.active
      where fixture.status = 'finished'
        -- as the backfill counts them: refused twice by it, left out
        and (select count(*)
             from app_private.football_ingestion_rejections rejection
             join app_private.football_ingestion_runs run on run.id = rejection.run_id
             where run.provider_name = 'sportsmonks' and run.job_type = 'match_events'
               and run.target_scope ->> 'scope' = 'backfill'
               and rejection.entity_type = 'fixture'
               and rejection.external_id = mapping.external_id) < 2)) then
    problems := problems || ('the backfill answered ' || coalesce(answer::text, 'null'));
  end if;
  select fixture.id into probe_fixture_id
  from app.fixtures fixture
  join app.seasons season on season.id = fixture.season_id and season.is_current
  where fixture.status = 'finished'
  order by fixture.kickoff_at desc limit 1;
  if probe_fixture_id is not null then
    answer := api.football_match_lineups(probe_fixture_id, 'fr');
    if jsonb_typeof(answer) is distinct from 'array'
      or exists (select 1 from jsonb_array_elements(answer) lineup
                 where jsonb_typeof(lineup -> 'unlistedPlayers') is distinct from 'array'
                    or jsonb_typeof(lineup -> 'players') is distinct from 'array') then
      problems := problems || 'the lineups read did not answer both lists'::text;
    end if;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20260925170000')
    then 'Applied. Next: deploy the Edge Function football-live-refresh, then run the backfill.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
