-- BotolaGO Production V2
-- Pronostics (score predictions), part 3 of 6: the functions the app calls.
--
--   api.predictions_round        public   one journée: matches, open/locked state,
--                                          results, the journée switcher
--   api.predictions_leaderboard  public   journée or season ranking, 50 a page
--   api.my_predictions           signed   the caller's predictions and totals
--   api.save_predictions         signed   save up to 16 predictions in one call
--   api.claim_guest_predictions  signed   import predictions made on the phone
--                                          before signing up
--
-- Every function checks the off / testers / public switch itself, so calling it
-- directly gets exactly the rules the app gets. The lock is checked in the same
-- statement that writes, against statement_timestamp(); no function takes a
-- time from the caller. Visitor-callable signatures use pg_catalog types only
-- (anon has no USAGE on schema app; see 20260921120000).
--
-- Error keys: PT401 predictions_unauthenticated, PT403 predictions_unavailable,
-- PT403 account_banned (ban trigger), PT400 predictions_invalid_payload,
-- PT400 validation_failed, PT404 predictions_round_not_found.
--
-- Plan: docs/backend/PREDICTIONS_DOMAIN_PLAN.md (BG-0146).

-- ---------------------------------------------------------------------------
-- Internal: resolve a journée of the current season (null = the default one)
-- ---------------------------------------------------------------------------
create or replace function app_private.predictions_resolve_round(
  p_season_id uuid, p_round_number integer, p_now timestamptz
)
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare target_id uuid;
begin
  if p_season_id is null then
    return null;
  end if;
  if p_round_number is null then
    return app_private.predictions_current_round(p_season_id, p_now);
  end if;
  select round_row.id into target_id
  from app.rounds round_row
  where round_row.season_id = p_season_id and round_row.round_number = p_round_number;
  if not found then
    raise exception using errcode = 'PT404', message = 'predictions_round_not_found';
  end if;
  return target_id;
end;
$$;

revoke all on function app_private.predictions_resolve_round(uuid, integer, timestamptz)
  from public, anon, authenticated, service_role;

-- Internal: validate a list of {fixtureId, home, away[, homeTeamId, awayTeamId]}
create or replace function app_private.predictions_assert_items(p_items jsonb, p_max integer)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  uuid_pattern constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and p_max
    or pg_catalog.pg_column_size(p_items) > 16384
  then
    raise exception using errcode = 'PT400', message = 'predictions_invalid_payload';
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
    -- A missing key makes these tests null, not true: "is distinct from" and
    -- the outer coalesce make anything not proven valid invalid.
    if coalesce(
      jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item -> 'fixtureId') is distinct from 'string'
      or (item ->> 'fixtureId') !~ uuid_pattern
      or jsonb_typeof(item -> 'home') is distinct from 'number'
      or (item ->> 'home') !~ '^[0-9]{1,2}$'
      or jsonb_typeof(item -> 'away') is distinct from 'number'
      or (item ->> 'away') !~ '^[0-9]{1,2}$'
      or (item ->> 'home')::integer > 20 or (item ->> 'away')::integer > 20
      or (item ? 'homeTeamId' and ((item ->> 'homeTeamId') is null or (item ->> 'homeTeamId') !~ uuid_pattern))
      or (item ? 'awayTeamId' and ((item ->> 'awayTeamId') is null or (item ->> 'awayTeamId') !~ uuid_pattern)),
      true)
    then
      raise exception using errcode = 'PT400', message = 'predictions_invalid_payload';
    end if;
  end loop;
  if (select count(distinct lower(value ->> 'fixtureId')) from jsonb_array_elements(p_items))
    <> jsonb_array_length(p_items)
  then
    raise exception using errcode = 'PT400', message = 'predictions_invalid_payload';
  end if;
end;
$$;

revoke all on function app_private.predictions_assert_items(jsonb, integer)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- api.predictions_round: one journée, public
-- ---------------------------------------------------------------------------
create or replace function api.predictions_round(
  p_round_number integer default null,
  p_language text default 'fr'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  now_ts timestamptz := statement_timestamp();
  settings app_private.prediction_settings%rowtype;
  season app.seasons%rowtype;
  target app.rounds%rowtype;
  target_id uuid;
  fixtures jsonb := '[]'::jsonb;
  rounds jsonb := '[]'::jsonb;
  next_lock timestamptz;
  scoring_version bigint := 0;
  round_state text;
begin
  perform app_private.football_language(p_language);
  select * into settings from app_private.prediction_settings where id;
  if not app_private.predictions_access_allowed(caller) then
    return jsonb_build_object('schemaVersion', 1, 'mode', settings.mode, 'allowed', false,
      'serverTime', now_ts);
  end if;

  select * into season from app.seasons where id = app_private.predictions_current_season();
  if season.id is null then
    return jsonb_build_object('schemaVersion', 1, 'mode', settings.mode, 'allowed', true,
      'serverTime', now_ts, 'season', null, 'round', null,
      'rounds', '[]'::jsonb, 'fixtures', '[]'::jsonb);
  end if;

  target_id := app_private.predictions_resolve_round(season.id, p_round_number, now_ts);
  select * into target from app.rounds where id = target_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'number', round_row.round_number,
      'state', app_private.prediction_round_state(round_row.id, now_ts)
    ) order by round_row.round_number), '[]'::jsonb)
  into rounds
  from app.rounds round_row
  where round_row.season_id = season.id
    and round_row.round_number is not null
    and exists (select 1 from app.fixtures fixture where fixture.round_id = round_row.id);

  if target.id is null then
    return jsonb_build_object('schemaVersion', 1, 'mode', settings.mode, 'allowed', true,
      'serverTime', now_ts, 'season', jsonb_build_object('id', season.id, 'label', season.label),
      'round', null, 'rounds', rounds, 'fixtures', '[]'::jsonb);
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', fixture.id,
      'kickoffAt', fixture.kickoff_at,
      'kickoffConfirmed', app_private.fantasy_kickoff_confirmed(fixture.kickoff_at),
      'status', fixture.status,
      'open', app_private.prediction_fixture_open(fixture.status, fixture.kickoff_at, now_ts),
      'home', app_private.football_team_json(fixture.home_team_id, p_language),
      'away', app_private.football_team_json(fixture.away_team_id, p_language),
      -- The provider's running score while the match is played. A postponed
      -- match can carry a stored 0-0 (FAR Rabat v Raja, 24 Sept 2026), so no
      -- score is ever shown outside these statuses.
      'live', case
        when fixture.status in ('live_first_half', 'half_time', 'live_second_half',
          'extra_time', 'penalties', 'suspended')
          and fixture.home_score is not null and fixture.away_score is not null
        then jsonb_build_object('home', fixture.home_score, 'away', fixture.away_score)
      end,
      'result', case
        when fixture.status = 'finished' and fixture.finalized_at is not null
          and fixture.home_score is not null and fixture.away_score is not null
        then jsonb_build_object('home', fixture.home_score, 'away', fixture.away_score)
      end,
      'final', (fixture.status = 'finished' and fixture.finalized_at is not null),
      'void', (fixture.status in ('cancelled', 'abandoned') or coalesce(scoring.override = 'void', false)),
      'corrected', (scoring.state = 'scored' and scoring.corrected_at is not null)
    ) order by fixture.kickoff_at, fixture.id), '[]'::jsonb),
    min(fixture.kickoff_at) filter (
      where app_private.prediction_fixture_open(fixture.status, fixture.kickoff_at, now_ts)
    ),
    coalesce(sum(scoring.revision), 0)
  into fixtures, next_lock, scoring_version
  from app.fixtures fixture
  left join app_private.prediction_fixture_scoring scoring on scoring.fixture_id = fixture.id
  where fixture.round_id = target.id;

  round_state := app_private.prediction_round_state(target.id, now_ts);

  return jsonb_build_object(
    'schemaVersion', 1,
    'mode', settings.mode,
    'allowed', true,
    'serverTime', now_ts,
    'season', jsonb_build_object('id', season.id, 'label', season.label),
    'round', jsonb_build_object(
      'id', target.id,
      'number', target.round_number,
      'name', target.name,
      'state', round_state,
      'provisional', round_state <> 'completed',
      'nextLockAt', next_lock,
      'scoringVersion', scoring_version
    ),
    'rounds', rounds,
    'fixtures', fixtures
  );
end;
$$;

comment on function api.predictions_round(integer, text) is
  'Public: one journée of the current season (null = the default journée), with each match''s open/locked state against the database clock, results only when final, and the journée switcher. Returns {allowed:false} while the feature is off for the caller.';

-- ---------------------------------------------------------------------------
-- api.my_predictions: the caller's predictions for a journée or one match
-- ---------------------------------------------------------------------------
create or replace function api.my_predictions(
  p_round_number integer default null,
  p_fixture_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  now_ts timestamptz := statement_timestamp();
  v_season_id uuid;
  target_id uuid;
  items jsonb := '[]'::jsonb;
  total_fixtures integer := 0;
  round_row app.prediction_standings%rowtype;
  season_row app.prediction_standings%rowtype;
begin
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  v_season_id := app_private.predictions_current_season();
  if v_season_id is null then
    return jsonb_build_object('serverTime', now_ts, 'items', '[]'::jsonb, 'summary', null);
  end if;

  if p_fixture_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
        'fixtureId', prediction.fixture_id,
        'home', prediction.home_goals,
        'away', prediction.away_goals,
        'submittedAt', prediction.submitted_at,
        'points', prediction.points,
        'resultKind', prediction.result_kind
      )), '[]'::jsonb)
    into items
    from app.predictions prediction
    join app.fixtures fixture on fixture.id = prediction.fixture_id
    where prediction.user_id = caller and prediction.fixture_id = p_fixture_id
      and fixture.season_id = v_season_id;
    return jsonb_build_object('serverTime', now_ts, 'items', items, 'summary', null);
  end if;

  target_id := app_private.predictions_resolve_round(v_season_id, p_round_number, now_ts);
  if target_id is null then
    return jsonb_build_object('serverTime', now_ts, 'items', '[]'::jsonb, 'summary', null);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'fixtureId', prediction.fixture_id,
      'home', prediction.home_goals,
      'away', prediction.away_goals,
      'submittedAt', prediction.submitted_at,
      'points', prediction.points,
      'resultKind', prediction.result_kind
    ) order by fixture.kickoff_at, fixture.id), '[]'::jsonb)
  into items
  from app.predictions prediction
  join app.fixtures fixture on fixture.id = prediction.fixture_id
  where prediction.user_id = caller and fixture.round_id = target_id;

  select count(*) into total_fixtures
  from app.fixtures fixture
  left join app_private.prediction_fixture_scoring scoring on scoring.fixture_id = fixture.id
  where fixture.round_id = target_id
    and fixture.status not in ('cancelled', 'abandoned')
    and scoring.override is distinct from 'void';

  select * into round_row from app.prediction_standings standing
  where standing.round_id = target_id and standing.user_id = caller;
  select * into season_row from app.prediction_standings standing
  where standing.season_id = v_season_id and standing.round_id is null and standing.user_id = caller;

  return jsonb_build_object(
    'serverTime', now_ts,
    'items', items,
    'summary', jsonb_build_object(
      'predicted', jsonb_array_length(items),
      'total', total_fixtures,
      'points', coalesce(round_row.points, 0),
      'exact', coalesce(round_row.exact_count, 0),
      'rank', round_row.rank,
      'seasonPoints', coalesce(season_row.points, 0),
      'seasonRank', season_row.rank,
      'roundsPlayed', coalesce(season_row.rounds_played, 0)
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- api.save_predictions: save up to max_items_per_save predictions at once
-- ---------------------------------------------------------------------------
-- Per item: saved (written), unchanged (open, same values), locked (the match
-- is no longer open), not_eligible (not a match of the current season's
-- journées). Last write wins. The app sends one request at a time.
create or replace function api.save_predictions(p_items jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  now_ts timestamptz := statement_timestamp();
  settings app_private.prediction_settings%rowtype;
  v_season_id uuid;
  results jsonb;
begin
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  select * into settings from app_private.prediction_settings where id;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  perform app_private.predictions_assert_items(p_items, settings.max_items_per_save);
  v_season_id := app_private.predictions_current_season();

  with input as (
    select (item.value ->> 'fixtureId')::uuid as fixture_id,
      (item.value ->> 'home')::smallint as home_goals,
      (item.value ->> 'away')::smallint as away_goals,
      item.ordinality as position
    from jsonb_array_elements(p_items) with ordinality as item
  ),
  candidate as (
    select input.*, fixture.home_team_id, fixture.away_team_id,
      coalesce(fixture.id is not null and fixture.season_id = v_season_id
        and fixture.round_id is not null, false) as eligible,
      coalesce(fixture.id is not null and fixture.season_id = v_season_id
        and fixture.round_id is not null
        and app_private.prediction_fixture_open(fixture.status, fixture.kickoff_at, now_ts), false)
        as is_open
    from input
    left join app.fixtures fixture on fixture.id = input.fixture_id
  ),
  written as (
    insert into app.predictions as prediction (
      user_id, fixture_id, home_goals, away_goals, home_team_id, away_team_id, origin, submitted_at
    )
    select caller, candidate.fixture_id, candidate.home_goals, candidate.away_goals,
      candidate.home_team_id, candidate.away_team_id, 'direct', now_ts
    from candidate
    where candidate.is_open
    on conflict (fixture_id, user_id) do update set
      home_goals = excluded.home_goals,
      away_goals = excluded.away_goals,
      home_team_id = excluded.home_team_id,
      away_team_id = excluded.away_team_id,
      submitted_at = excluded.submitted_at
    where (prediction.home_goals, prediction.away_goals, prediction.home_team_id, prediction.away_team_id)
      is distinct from (excluded.home_goals, excluded.away_goals, excluded.home_team_id, excluded.away_team_id)
    returning prediction.fixture_id, prediction.home_goals, prediction.away_goals, prediction.submitted_at
  )
  select jsonb_agg(jsonb_build_object(
      'fixtureId', candidate.fixture_id,
      'status', case
        when written.fixture_id is not null then 'saved'
        when candidate.is_open then 'unchanged'
        when candidate.eligible then 'locked'
        else 'not_eligible'
      end,
      'home', coalesce(written.home_goals, existing.home_goals),
      'away', coalesce(written.away_goals, existing.away_goals),
      'submittedAt', coalesce(written.submitted_at, existing.submitted_at)
    ) order by candidate.position)
  into results
  from candidate
  left join written on written.fixture_id = candidate.fixture_id
  left join app.predictions existing
    on existing.fixture_id = candidate.fixture_id and existing.user_id = caller;

  return jsonb_build_object('serverTime', now_ts, 'results', results);
end;
$$;

comment on function api.save_predictions(jsonb) is
  'Signed-in: save 1 to max_items_per_save predictions [{fixtureId, home, away}]. Only matches still open at statement_timestamp() are written, in the same statement that checks it. Returns a status per item: saved, unchanged, locked or not_eligible.';

-- ---------------------------------------------------------------------------
-- api.claim_guest_predictions: import the phone's predictions after sign-up
-- ---------------------------------------------------------------------------
-- Per item: imported (match still open, nothing on the account yet), kept (the
-- account already has a prediction for that match: the account wins, because a
-- phone's clock cannot be trusted), started (the match is no longer open: no
-- one may "predict" a result after seeing it) or invalid (not a match of the
-- current season, or the teams no longer match). Goals are mapped by team, so a
-- provider home/away swap keeps what the guest meant. Running it again changes
-- nothing. One app_private.prediction_guest_claims row per call.
create or replace function api.claim_guest_predictions(p_items jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  now_ts timestamptz := statement_timestamp();
  settings app_private.prediction_settings%rowtype;
  v_season_id uuid;
  results jsonb;
  imported_count integer;
  kept_count integer;
  started_count integer;
  invalid_count integer;
begin
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  select * into settings from app_private.prediction_settings where id;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  perform app_private.predictions_assert_items(p_items, settings.max_claim_items);
  v_season_id := app_private.predictions_current_season();

  -- One statement: every CTE reads the same snapshot, so had_prediction is the
  -- account's state before this call; a concurrent save for the same match is
  -- absorbed by "on conflict do nothing" and reported as kept.
  with input as (
    select (item.value ->> 'fixtureId')::uuid as fixture_id,
      (item.value ->> 'home')::smallint as home_goals,
      (item.value ->> 'away')::smallint as away_goals,
      (item.value ->> 'homeTeamId')::uuid as claimed_home,
      (item.value ->> 'awayTeamId')::uuid as claimed_away,
      item.ordinality as position
    from jsonb_array_elements(p_items) with ordinality as item
  ),
  claim as (
    select input.fixture_id, input.position,
      fixture.home_team_id, fixture.away_team_id,
      -- swapped: the guest saw the teams the other way round (provider swap)
      (input.claimed_home is not null and input.claimed_away is not null
        and (input.claimed_home, input.claimed_away)
          = (fixture.away_team_id, fixture.home_team_id)) as swapped,
      input.home_goals, input.away_goals,
      coalesce(fixture.id is not null and fixture.season_id = v_season_id
        and fixture.round_id is not null
        and (input.claimed_home is null or input.claimed_away is null
          or (input.claimed_home, input.claimed_away)
            in ((fixture.home_team_id, fixture.away_team_id),
                (fixture.away_team_id, fixture.home_team_id))), false) as valid,
      coalesce(app_private.prediction_fixture_open(fixture.status, fixture.kickoff_at, now_ts), false)
        as is_open,
      exists (
        select 1 from app.predictions existing
        where existing.fixture_id = input.fixture_id and existing.user_id = caller
      ) as had_prediction
    from input
    left join app.fixtures fixture on fixture.id = input.fixture_id
  ),
  inserted as (
    insert into app.predictions (
      user_id, fixture_id, home_goals, away_goals, home_team_id, away_team_id, origin, submitted_at
    )
    select caller, claim.fixture_id,
      case when claim.swapped then claim.away_goals else claim.home_goals end,
      case when claim.swapped then claim.home_goals else claim.away_goals end,
      claim.home_team_id, claim.away_team_id, 'guest_claim', now_ts
    from claim
    where claim.valid and claim.is_open and not claim.had_prediction
    on conflict (fixture_id, user_id) do nothing
    returning fixture_id
  ),
  classified as (
    select claim.fixture_id, claim.position,
      case
        when not claim.valid then 'invalid'
        when inserted.fixture_id is not null then 'imported'
        when claim.had_prediction or claim.is_open then 'kept'
        else 'started'
      end as status
    from claim
    left join inserted on inserted.fixture_id = claim.fixture_id
  )
  select
    jsonb_agg(jsonb_build_object('fixtureId', classified.fixture_id, 'status', classified.status)
      order by classified.position),
    count(*) filter (where classified.status = 'imported'),
    count(*) filter (where classified.status = 'kept'),
    count(*) filter (where classified.status = 'started'),
    count(*) filter (where classified.status = 'invalid')
  into results, imported_count, kept_count, started_count, invalid_count
  from classified;

  insert into app_private.prediction_guest_claims (
    user_id, submitted, imported, kept_existing, rejected_started, rejected_invalid
  ) values (
    caller, jsonb_array_length(p_items), imported_count, kept_count, started_count, invalid_count
  );

  return jsonb_build_object(
    'serverTime', now_ts,
    'imported', imported_count,
    'keptExisting', kept_count,
    'started', started_count,
    'invalid', invalid_count,
    'results', results
  );
end;
$$;

comment on function api.claim_guest_predictions(jsonb) is
  'Signed-in: import up to max_claim_items predictions made on the phone before sign-up. Only matches still open are imported; the account''s own prediction always wins; goals are mapped by team. Logged in app_private.prediction_guest_claims.';

-- ---------------------------------------------------------------------------
-- api.predictions_leaderboard: journée or season ranking, public, paged
-- ---------------------------------------------------------------------------
-- Ranks are saved by the scoring job (points, then exact scores, then a shared
-- rank). Pages continue "after (rank, id)"; the cursor never carries a user id.
-- Signed-in viewers see display names; visitors see masked usernames.
--
-- A player banned or deleted after the last scoring run keeps a saved rank
-- until the next run re-ranks that journée or season, so the list itself leaves
-- such players out when read: a ban removes the name at once, and the rank
-- numbers close the gap at the next re-rank.
create or replace function api.predictions_leaderboard(
  p_scope text default 'round',
  p_round_number integer default null,
  p_after_rank integer default null,
  p_after_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  now_ts timestamptz := statement_timestamp();
  settings app_private.prediction_settings%rowtype;
  v_season_id uuid;
  v_round_id uuid;
  v_round_number integer;
  page_ids uuid[];
  items jsonb := '[]'::jsonb;
  total integer;
  me jsonb;
  last_rank integer;
  last_id uuid;
  round_state text;
  matches_left integer;
  has_more boolean;
begin
  if p_scope is null or p_scope not in ('round', 'season')
    or p_limit is null or p_limit not between 1 and 100
    or ((p_after_rank is null) <> (p_after_id is null))
  then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select * into settings from app_private.prediction_settings where id;
  if not app_private.predictions_access_allowed(caller) then
    return jsonb_build_object('allowed', false, 'mode', settings.mode);
  end if;
  v_season_id := app_private.predictions_current_season();
  if p_scope = 'round' then
    v_round_id := app_private.predictions_resolve_round(v_season_id, p_round_number, now_ts);
  end if;
  if v_season_id is null or (p_scope = 'round' and v_round_id is null) then
    return jsonb_build_object('allowed', true, 'scope', p_scope, 'items', '[]'::jsonb,
      'total', 0, 'nextCursor', null, 'me', null);
  end if;

  -- The page: one index range per scope (journée rows, or season rows).
  if p_scope = 'round' then
    select round_number into v_round_number from app.rounds where id = v_round_id;
    round_state := app_private.prediction_round_state(v_round_id, now_ts);
    select count(*) into matches_left
    from app.fixtures fixture
    left join app_private.prediction_fixture_scoring scoring on scoring.fixture_id = fixture.id
    where fixture.round_id = v_round_id
      and not (fixture.status = 'finished' and fixture.finalized_at is not null)
      and fixture.status not in ('cancelled', 'abandoned')
      and scoring.override is distinct from 'void';

    select array_agg(page.id order by page.rank, page.id) into page_ids
    from (
      select standing.id, standing.rank
      from app.prediction_standings standing
      join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
      where standing.round_id = v_round_id and standing.rank is not null
        and (p_after_rank is null or (standing.rank, standing.id) > (p_after_rank, p_after_id))
        and not exists (
          select 1 from app_private.user_bans ban
          where ban.user_id = standing.user_id and ban.lifted_at is null
            and ban.starts_at <= now_ts and (ban.ends_at is null or ban.ends_at > now_ts)
        )
      order by standing.rank, standing.id
      limit p_limit + 1
    ) page;
    if p_after_rank is null then
      select count(*) into total
      from app.prediction_standings standing
      join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
      where standing.round_id = v_round_id and standing.rank is not null
        and not exists (
          select 1 from app_private.user_bans ban
          where ban.user_id = standing.user_id and ban.lifted_at is null
            and ban.starts_at <= now_ts and (ban.ends_at is null or ban.ends_at > now_ts)
        );
    end if;
    if caller is not null then
      select jsonb_build_object('rank', standing.rank, 'points', standing.points,
        'exact', standing.exact_count)
      into me from app.prediction_standings standing
      where standing.round_id = v_round_id and standing.user_id = caller;
    end if;
  else
    select array_agg(page.id order by page.rank, page.id) into page_ids
    from (
      select standing.id, standing.rank
      from app.prediction_standings standing
      join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
      where standing.season_id = v_season_id and standing.round_id is null
        and standing.rank is not null
        and (p_after_rank is null or (standing.rank, standing.id) > (p_after_rank, p_after_id))
        and not exists (
          select 1 from app_private.user_bans ban
          where ban.user_id = standing.user_id and ban.lifted_at is null
            and ban.starts_at <= now_ts and (ban.ends_at is null or ban.ends_at > now_ts)
        )
      order by standing.rank, standing.id
      limit p_limit + 1
    ) page;
    if p_after_rank is null then
      select count(*) into total
      from app.prediction_standings standing
      join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
      where standing.season_id = v_season_id and standing.round_id is null
        and standing.rank is not null
        and not exists (
          select 1 from app_private.user_bans ban
          where ban.user_id = standing.user_id and ban.lifted_at is null
            and ban.starts_at <= now_ts and (ban.ends_at is null or ban.ends_at > now_ts)
        );
    end if;
    if caller is not null then
      select jsonb_build_object('rank', standing.rank, 'points', standing.points,
        'exact', standing.exact_count, 'roundsPlayed', standing.rounds_played)
      into me from app.prediction_standings standing
      where standing.season_id = v_season_id and standing.round_id is null
        and standing.user_id = caller;
    end if;
  end if;

  -- One row more than asked says whether another page follows.
  has_more := coalesce(cardinality(page_ids), 0) > p_limit;
  if has_more then
    page_ids := page_ids[1:p_limit];
  end if;

  -- The rows of the page (at most p_limit), with names and ties.
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', standing.id,
      'rank', standing.rank,
      -- Two probes so each one stays on its own partial rank index.
      'tied', case
        when standing.round_id is null then exists (
          select 1 from app.prediction_standings other
          where other.season_id = standing.season_id and other.round_id is null
            and other.rank = standing.rank and other.id <> standing.id)
        else exists (
          select 1 from app.prediction_standings other
          where other.round_id = standing.round_id
            and other.rank = standing.rank and other.id <> standing.id)
      end,
      'name', case
        when caller is null then app_private.fantasy_mask_username(profile.username)
        else coalesce(nullif(btrim(profile.display_name), ''),
          app_private.fantasy_mask_username(profile.username))
      end,
      'points', standing.points,
      'exact', standing.exact_count,
      'roundsPlayed', standing.rounds_played,
      'isMe', coalesce(standing.user_id = caller, false)
    ) order by standing.rank, standing.id), '[]'::jsonb),
    (array_agg(standing.rank order by standing.rank desc, standing.id desc))[1],
    (array_agg(standing.id order by standing.rank desc, standing.id desc))[1]
  into items, last_rank, last_id
  from app.prediction_standings standing
  left join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
  where standing.id = any(coalesce(page_ids, '{}'::uuid[]));

  return jsonb_build_object(
    'allowed', true,
    'scope', p_scope,
    'round', v_round_number,
    'provisional', case when p_scope = 'round' then round_state <> 'completed' end,
    'matchesLeft', matches_left,
    'total', total,
    'items', items,
    'nextCursor', case when has_more
      then jsonb_build_object('rank', last_rank, 'id', last_id) end,
    'me', me
  );
end;
$$;

comment on function api.predictions_leaderboard(text, integer, integer, uuid, integer) is
  'Public: the saved journée (scope round) or season ranking, p_limit (1-100) rows after (p_after_rank, p_after_id). Shared ranks carry tied=true. Display names for signed-in viewers, masked usernames for visitors.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function api.predictions_round(integer, text) from public;
revoke all on function api.predictions_leaderboard(text, integer, integer, uuid, integer) from public;
revoke all on function api.my_predictions(integer, uuid) from public;
revoke all on function api.save_predictions(jsonb) from public;
revoke all on function api.claim_guest_predictions(jsonb) from public;

grant execute on function api.predictions_round(integer, text) to anon, authenticated, service_role;
grant execute on function api.predictions_leaderboard(text, integer, integer, uuid, integer)
  to anon, authenticated, service_role;
grant execute on function api.my_predictions(integer, uuid) to authenticated, service_role;
grant execute on function api.save_predictions(jsonb) to authenticated, service_role;
grant execute on function api.claim_guest_predictions(jsonb) to authenticated, service_role;
