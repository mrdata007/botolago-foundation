-- BotolaGO Production V2
-- Botola Pro table from SofaScore, written into the table the match screens read.
--
-- app.standings is what api.football_standings returns. Until now only
-- api.ingest_football_standings (Gate 3B, historical, SportsMonks-shaped)
-- wrote it, and it cannot serve a live table:
--   * it updates row by row, and standings_rank_key (season, group, type, rank)
--     is not deferrable, so two clubs swapping places raise a unique violation
--     half way through;
--   * one club without a mapping fails the whole table;
--   * a missing figure arrives as a null in a NOT NULL column and fails the
--     whole table.
--
-- This function takes the rows the Edge Function parsed from SofaScore and
-- applies them in one transaction:
--   * rows are matched to clubs by the active SofaScore team mapping only,
--     never by name; a club without one is skipped and reported;
--   * a row with ANY figure missing (null, not a whole number, or negative) is
--     skipped and reported. Nothing is replaced by 0: an unknown figure leaves
--     that club's stored row as it was;
--   * the existing rows of the clubs being written are first moved out of the
--     way (rank + 500), so any reordering is legal, then written for good;
--   * a row that already holds the same figures is not touched;
--   * a table older than what is stored raises STALE_UPDATE and writes nothing.
-- Service role only, like the other football ingestion functions.

create or replace function api.service_apply_sofascore_standings(
  p_season_external_id text,
  p_rows jsonb,
  p_observed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
  v_competition_id uuid;
  v_item jsonb;
  v_team_ext text;
  v_team_id uuid;
  v_keys text[] := array['rank', 'played', 'won', 'drawn', 'lost', 'goalsFor', 'goalsAgainst', 'points'];
  v_key text;
  v_complete boolean;
  v_rank integer;
  v_played integer;
  v_won integer;
  v_drawn integer;
  v_lost integer;
  v_gf integer;
  v_ga integer;
  v_points integer;
  v_form text;
  v_valid jsonb := '[]'::jsonb;
  v_ranks integer[] := '{}'::integer[];
  v_teams uuid[] := '{}'::uuid[];
  v_existing app.standings%rowtype;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
  v_skipped_incomplete text[] := '{}'::text[];
  v_skipped_unmapped text[] := '{}'::text[];
  v_sequence bigint := floor(extract(epoch from p_observed_at))::bigint;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_season_external_id is null
    or p_season_external_id !~ '^[0-9]{1,12}$'
    or p_observed_at is null
    or p_rows is null
    or jsonb_typeof(p_rows) <> 'array'
    or jsonb_array_length(p_rows) > 50
    or octet_length(p_rows::text) > 131072
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;
  if not exists (
    select 1 from app_private.football_providers where name = 'sofascore' and active
  ) then
    raise exception using errcode = 'P0002', message = 'PROVIDER_NOT_FOUND';
  end if;

  select mapping.internal_entity_id into v_season_id
  from app_private.football_provider_mappings mapping
  where mapping.provider_name = 'sofascore'
    and mapping.entity_type = 'season'
    and mapping.external_id = p_season_external_id
    and mapping.active;
  if v_season_id is null then
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  end if;
  select competition_id into v_competition_id from app.seasons where id = v_season_id;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sofascore:standings:' || p_season_external_id, 0)
  );

  -- Classify every row before anything is written.
  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end if;
    v_team_ext := nullif(v_item ->> 'teamExternalId', '');
    if v_team_ext is null or v_team_ext !~ '^[0-9]{1,12}$' then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end if;

    select mapping.internal_entity_id into v_team_id
    from app_private.football_provider_mappings mapping
    join app.teams team on team.id = mapping.internal_entity_id
    where mapping.provider_name = 'sofascore'
      and mapping.entity_type = 'team'
      and mapping.external_id = v_team_ext
      and mapping.active;
    if v_team_id is null then
      v_skipped_unmapped := v_skipped_unmapped || v_team_ext;
      continue;
    end if;

    -- Unknown is not zero: every figure must be a present whole number >= 0.
    v_complete := true;
    foreach v_key in array v_keys
    loop
      if jsonb_typeof(v_item -> v_key) is distinct from 'number'
        or (v_item ->> v_key) !~ '^[0-9]{1,6}$'
      then
        v_complete := false;
      end if;
    end loop;
    if not v_complete then
      v_skipped_incomplete := v_skipped_incomplete || v_team_ext;
      continue;
    end if;

    v_rank := (v_item ->> 'rank')::integer;
    v_played := (v_item ->> 'played')::integer;
    v_won := (v_item ->> 'won')::integer;
    v_drawn := (v_item ->> 'drawn')::integer;
    v_lost := (v_item ->> 'lost')::integer;
    v_gf := (v_item ->> 'goalsFor')::integer;
    v_ga := (v_item ->> 'goalsAgainst')::integer;
    v_points := (v_item ->> 'points')::integer;
    if v_rank not between 1 and 500 or v_won + v_drawn + v_lost > v_played then
      v_skipped_incomplete := v_skipped_incomplete || v_team_ext;
      continue;
    end if;
    if v_rank = any (v_ranks) or v_team_id = any (v_teams) then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end if;
    v_ranks := v_ranks || v_rank;
    v_teams := v_teams || v_team_id;
    v_valid := v_valid || jsonb_build_object(
      'teamId', v_team_id, 'rank', v_rank, 'played', v_played, 'won', v_won,
      'drawn', v_drawn, 'lost', v_lost, 'goalsFor', v_gf, 'goalsAgainst', v_ga,
      'points', v_points, 'form', nullif(v_item ->> 'form', '')
    );
  end loop;

  if jsonb_array_length(v_valid) = 0 then
    return jsonb_build_object(
      'inserted', 0, 'updated', 0, 'unchanged', 0,
      'skippedIncomplete', to_jsonb(v_skipped_incomplete),
      'skippedUnmapped', to_jsonb(v_skipped_unmapped)
    );
  end if;

  -- An older table never replaces a newer one.
  if exists (
    select 1 from app.standings s
    where s.season_id = v_season_id and s.group_key = '' and s.table_type = 'overall'
      and s.team_id = any (v_teams) and s.provider_updated_at > p_observed_at
  ) then
    raise exception using errcode = 'P0001', message = 'STALE_UPDATE';
  end if;

  -- Move the clubs being rewritten out of the unique rank range, so a swap is legal.
  update app.standings
  set rank = rank + 500
  where season_id = v_season_id and group_key = '' and table_type = 'overall'
    and team_id = any (v_teams) and rank <= 500;

  for v_item in select value from jsonb_array_elements(v_valid)
  loop
    v_team_id := (v_item ->> 'teamId')::uuid;
    v_form := v_item ->> 'form';
    select * into v_existing
    from app.standings s
    where s.season_id = v_season_id and s.group_key = '' and s.table_type = 'overall'
      and s.team_id = v_team_id;
    if not found then
      insert into app.standings (
        competition_id, season_id, group_key, table_type, team_id, rank,
        played, won, drawn, lost, goals_for, goals_against, points, form,
        provider_updated_at, source_sequence
      ) values (
        v_competition_id, v_season_id, '', 'overall', v_team_id, (v_item ->> 'rank')::integer,
        (v_item ->> 'played')::integer, (v_item ->> 'won')::integer,
        (v_item ->> 'drawn')::integer, (v_item ->> 'lost')::integer,
        (v_item ->> 'goalsFor')::integer, (v_item ->> 'goalsAgainst')::integer,
        (v_item ->> 'points')::integer, v_form, p_observed_at, v_sequence
      );
      v_inserted := v_inserted + 1;
    else
      -- The existing rank was parked at +500 above: compare the real one.
      if (v_existing.rank - case when v_existing.rank > 500 then 500 else 0 end)
          = (v_item ->> 'rank')::integer
        and v_existing.played = (v_item ->> 'played')::integer
        and v_existing.won = (v_item ->> 'won')::integer
        and v_existing.drawn = (v_item ->> 'drawn')::integer
        and v_existing.lost = (v_item ->> 'lost')::integer
        and v_existing.goals_for = (v_item ->> 'goalsFor')::integer
        and v_existing.goals_against = (v_item ->> 'goalsAgainst')::integer
        and v_existing.points = (v_item ->> 'points')::integer
        and v_existing.form is not distinct from coalesce(v_form, v_existing.form)
      then
        v_unchanged := v_unchanged + 1;
        update app.standings
        set rank = (v_item ->> 'rank')::integer
        where id = v_existing.id;
      else
        update app.standings set
          competition_id = v_competition_id,
          rank = (v_item ->> 'rank')::integer,
          played = (v_item ->> 'played')::integer,
          won = (v_item ->> 'won')::integer,
          drawn = (v_item ->> 'drawn')::integer,
          lost = (v_item ->> 'lost')::integer,
          goals_for = (v_item ->> 'goalsFor')::integer,
          goals_against = (v_item ->> 'goalsAgainst')::integer,
          points = (v_item ->> 'points')::integer,
          form = coalesce(v_form, v_existing.form),
          provider_updated_at = p_observed_at,
          source_sequence = v_sequence
        where id = v_existing.id;
        v_updated := v_updated + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted, 'updated', v_updated, 'unchanged', v_unchanged,
    'skippedIncomplete', to_jsonb(v_skipped_incomplete),
    'skippedUnmapped', to_jsonb(v_skipped_unmapped)
  );
exception
  when unique_violation then
    -- A club left out of this payload still holds a rank this table wants.
    raise exception using errcode = 'P0001', message = 'RANK_CONFLICT';
  when check_violation or not_null_violation or invalid_text_representation then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
end;
$$;

revoke all on function api.service_apply_sofascore_standings(text, jsonb, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function api.service_apply_sofascore_standings(text, jsonb, timestamptz)
  to service_role;

comment on function api.service_apply_sofascore_standings(text, jsonb, timestamptz) is
  'Service role: applies a parsed SofaScore Botola table to app.standings in one transaction. Clubs by active SofaScore team mapping only; a row with a missing figure is skipped, never written as 0; rank swaps are legal.';
