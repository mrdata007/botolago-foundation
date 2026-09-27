-- Save the detailed Stats in the same sealed snapshot as the ranking inputs.
-- Existing sealed runs deliberately keep NULL for detail never captured: live
-- provider rows cannot reconstruct their historical values. No backfill.
alter table app_private.pepites_run_appearances
  add column clean_sheets integer,
  add column goals_conceded integer,
  add column penalties_saved integer,
  add column penalties_missed integer,
  add column yellow_cards integer,
  add column red_cards integer,
  add column own_goals integer;

create or replace function app_private.pepites_input_fingerprint(
  p_season_id uuid,
  p_kind text,
  p_round integer,
  p_cutoff timestamptz,
  p_age_limit integer
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(extensions.digest(
    coalesce((select string_agg(
      format('P|%s|%s|%s|%s|%s|%s', source.player_id, to_char(source.date_of_birth, 'YYYY-MM-DD'), source.position_group,
        source.team_id, source.membership_id, source.in_pool), E'\n' order by source.player_id)
      from app_private.pepites_source_players(p_season_id, p_kind, p_round, p_cutoff, p_age_limit) source), '')
    || E'\n#\n' ||
    coalesce((select string_agg(
      format('A|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s', source.player_id, source.fixture_id,
        source.team_id, source.round_number, extract(epoch from source.kickoff_at), source.minutes, source.started,
        source.goals, source.assists, source.saves, source.rating, source.team_conceded,
        performance.clean_sheets, performance.goals_conceded, performance.penalties_saved, performance.penalties_missed, performance.yellow_cards, performance.red_cards, performance.own_goals),
      E'\n' order by source.player_id, source.fixture_id)
      from app_private.pepites_source_appearances(p_season_id, p_kind, p_round, p_cutoff) source
      left join app.player_fixture_performances performance
        on performance.fixture_id = source.fixture_id and performance.player_id = source.player_id
        and performance.active), '')
    || E'\n#\n' ||
    coalesce((select string_agg(
      format('T|%s|%s|%s', source.team_id, source.fixture_id, source.round_number),
      E'\n' order by source.team_id, source.fixture_id)
      from app_private.pepites_source_team_fixtures(p_season_id, p_kind, p_round, p_cutoff) source), ''),
    'sha256'), 'hex');
$$;

create or replace function app_private.pepites_snapshot_fingerprint(p_run_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(extensions.digest(
    coalesce((select string_agg(
      format('P|%s|%s|%s|%s|%s|%s', snapshot.player_id, to_char(snapshot.date_of_birth, 'YYYY-MM-DD'), snapshot.position_group,
        snapshot.team_id, snapshot.membership_id, snapshot.in_pool), E'\n' order by snapshot.player_id)
      from app_private.pepites_run_players snapshot where snapshot.run_id = p_run_id), '')
    || E'\n#\n' ||
    coalesce((select string_agg(
      format('A|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s', snapshot.player_id, snapshot.fixture_id,
        snapshot.team_id, snapshot.round_number, extract(epoch from snapshot.kickoff_at), snapshot.minutes, snapshot.started,
        snapshot.goals, snapshot.assists, snapshot.saves, snapshot.rating, snapshot.team_conceded,
        snapshot.clean_sheets, snapshot.goals_conceded, snapshot.penalties_saved, snapshot.penalties_missed, snapshot.yellow_cards, snapshot.red_cards, snapshot.own_goals),
      E'\n' order by snapshot.player_id, snapshot.fixture_id)
      from app_private.pepites_run_appearances snapshot where snapshot.run_id = p_run_id), '')
    || E'\n#\n' ||
    coalesce((select string_agg(
      format('T|%s|%s|%s', snapshot.team_id, snapshot.fixture_id, snapshot.round_number),
      E'\n' order by snapshot.team_id, snapshot.fixture_id)
      from app_private.pepites_run_team_fixtures snapshot where snapshot.run_id = p_run_id), ''),
    'sha256'), 'hex');
$$;

create or replace function app_private.pepites_gather(p_run_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run app.pepites_runs%rowtype;
  v_age_limit integer;
  v_fingerprint text;
begin
  select * into v_run from app.pepites_runs where id = p_run_id;
  if not found or v_run.status <> 'running' then
    raise exception using errcode = '55000', message = 'PEPITES_RUN_NOT_RUNNING';
  end if;
  select (methodology.params ->> 'age_limit')::integer into v_age_limit
  from app.pepites_methodologies methodology where methodology.version = v_run.methodology_version;

  insert into app_private.pepites_run_team_fixtures (run_id, team_id, fixture_id, round_number)
  select p_run_id, source.team_id, source.fixture_id, source.round_number
  from app_private.pepites_source_team_fixtures(v_run.season_id, v_run.kind,
    v_run.as_of_round_number, v_run.input_cutoff_at) source;

  insert into app_private.pepites_run_appearances (
    run_id, player_id, fixture_id, team_id, round_number, kickoff_at, minutes, started,
    goals, assists, saves, rating, team_conceded,
    clean_sheets, goals_conceded, penalties_saved, penalties_missed, yellow_cards, red_cards, own_goals
  )
  select p_run_id, source.player_id, source.fixture_id, source.team_id, source.round_number,
    source.kickoff_at, source.minutes, source.started, source.goals, source.assists,
    source.saves, source.rating, source.team_conceded,
    performance.clean_sheets, performance.goals_conceded, performance.penalties_saved, performance.penalties_missed, performance.yellow_cards, performance.red_cards, performance.own_goals
  from app_private.pepites_source_appearances(v_run.season_id, v_run.kind,
    v_run.as_of_round_number, v_run.input_cutoff_at) source
  left join app.player_fixture_performances performance
    on performance.fixture_id = source.fixture_id and performance.player_id = source.player_id
    and performance.active;

  insert into app_private.pepites_run_players (
    run_id, player_id, date_of_birth, position_group, team_id, membership_id, in_pool
  )
  select p_run_id, source.player_id, source.date_of_birth, source.position_group,
    source.team_id, source.membership_id, source.in_pool
  from app_private.pepites_source_players(v_run.season_id, v_run.kind,
    v_run.as_of_round_number, v_run.input_cutoff_at, v_age_limit) source;

  v_fingerprint := app_private.pepites_snapshot_fingerprint(p_run_id);
  update app.pepites_runs set input_fingerprint = v_fingerprint where id = p_run_id;
  return v_fingerprint;
end;
$$;

create or replace function api.pepites_player_stats(p_version text, p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_access text := app_private.pepites_access();
  v_version jsonb;
  v_run_id uuid;
begin
  if v_access = 'none' then
    return pg_catalog.jsonb_build_object('available', false);
  end if;
  v_version := app_private.pepites_resolve_version(p_version);
  v_run_id := (v_version ->> 'runId')::uuid;
  if v_version is null or v_version ->> 'status' = 'withdrawn' or not exists (
    select 1 from app_private.pepites_run_players pool
    where pool.run_id = v_run_id and pool.player_id = p_player_id and pool.in_pool
  ) then
    return pg_catalog.jsonb_build_object('available', true, 'preview', v_access = 'staff_preview',
      'found', false);
  end if;
  return pg_catalog.jsonb_build_object(
    'available', true, 'preview', v_access = 'staff_preview', 'found', true,
    'version', v_version ->> 'version', 'source', v_version ->> 'source',
    'stats', (
      select pg_catalog.jsonb_build_object(
        'apps', count(*)::integer,
        'starts', (count(*) filter (where a.started))::integer,
        'minutes', coalesce(sum(a.minutes), 0)::integer,
        'goals', coalesce(sum(a.goals), 0)::integer,
        'assists', coalesce(sum(a.assists), 0)::integer,
        'saves', sum(a.saves)::integer,
        'cleanSheets', case when count(a.clean_sheets) = count(*) then coalesce(sum(a.clean_sheets), 0)::integer else null end,
        'goalsConceded', case when count(a.goals_conceded) = count(*) then coalesce(sum(a.goals_conceded), 0)::integer else null end,
        'penaltiesSaved', case when count(a.penalties_saved) = count(*) then coalesce(sum(a.penalties_saved), 0)::integer else null end,
        'penaltiesMissed', case when count(a.penalties_missed) = count(*) then coalesce(sum(a.penalties_missed), 0)::integer else null end,
        'yellowCards', case when count(a.yellow_cards) = count(*) then coalesce(sum(a.yellow_cards), 0)::integer else null end,
        'redCards', case when count(a.red_cards) = count(*) then coalesce(sum(a.red_cards), 0)::integer else null end,
        'ownGoals', case when count(a.own_goals) = count(*) then coalesce(sum(a.own_goals), 0)::integer else null end)
      from app_private.pepites_run_appearances a
      where a.run_id = v_run_id and a.player_id = p_player_id),
    'split', (
      select pg_catalog.jsonb_build_object(
        'firstTo', split.first_to, 'lastRound', split.last_round,
        'firstMinutes', split.first_minutes, 'secondMinutes', split.second_minutes,
        'firstMatches', split.first_matches, 'secondMatches', split.second_matches)
      from app_private.pepites_minutes_split(v_run_id) split
      where split.player_id = p_player_id),
    -- The same player in the open Fantasy game, for "＋ Fantasy".
    'fantasyPlayerId', (
      select fantasy_player.id
      from app.fantasy_players fantasy_player
      join app.fantasy_seasons fantasy_season on fantasy_season.id = fantasy_player.fantasy_season_id
      where fantasy_player.football_player_id = p_player_id
        and fantasy_season.id = (
          select current_season.id from app.fantasy_seasons current_season
          where current_season.status in ('registration_open', 'active')
          order by current_season.starts_at desc limit 1)
        and fantasy_player.active and fantasy_player.eligible
        and fantasy_player.status <> 'ineligible'
      order by fantasy_season.starts_at desc nulls last
      limit 1)
  );
end;
$$;

-- CREATE OR REPLACE preserves the existing restricted grants and access gates.
