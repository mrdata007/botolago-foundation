-- Fantasy rating-input non-degeneracy guard (BG-0027, AC-c).
--
-- The first production catalog was staged on rating inputs that were all the
-- neutral fallback (rating 6.0 / confidence 0), so every opening price
-- collapsed to the position-band neutral value (BG-0011). Nothing at the
-- database boundary could tell that state apart from a healthy one: the
-- catalog candidates resolve a missing rating to 6.0 / 0 by design, and the
-- placeholder rows written by the ratings worker looked identical.
--
-- This migration is additive:
--   * `app_private.fantasy_rating_inputs_degenerate(season)` inspects exactly
--     the rating inputs `app_private.fantasy_catalog_candidates` consumes
--     (same season, membership and source-rating resolution) and reports
--     {candidates, distinctRatings, maxConfidence, degenerate}, where
--     degenerate = candidates > 0 and count(distinct source_rating) = 1 and
--     max(source_confidence) = 0;
--   * `api.preview_fantasy_catalog_activation` keeps its existing body and
--     adds the field `ratingDegeneracy` to its result so operators see the
--     signal before staging (blockers, digest and counts are unchanged);
--   * `api.service_stage_fantasy_catalog` keeps its existing body and raises
--     `PT409` `fantasy_rating_inputs_degenerate` before any insert when the
--     inputs are degenerate. There is no override parameter: an optional
--     tenth argument would make every existing nine-argument call ambiguous
--     with the current signature, and a block is the required behaviour.
-- Non-degenerate input behaves exactly as before.

create or replace function app_private.fantasy_rating_inputs_degenerate(
  p_football_season_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'candidates', count(*),
    'distinctRatings', count(distinct candidate.source_rating),
    'maxConfidence', max(candidate.source_confidence),
    'degenerate', count(*) > 0
      and count(distinct candidate.source_rating) = 1
      and max(candidate.source_confidence) = 0
  )
  from app_private.fantasy_catalog_candidates(p_football_season_id) candidate;
$$;

create or replace function api.preview_fantasy_catalog_activation(
  p_football_season_id uuid,
  p_ruleset_code text default 'botolago-fantasy-v1.1',
  p_expected_team_count integer default 16,
  p_expected_round_count integer default 30,
  p_expected_fixture_count integer default 240,
  p_minimum_player_count integer default 240,
  p_maximum_player_count integer default 800
)
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
  return app_private.fantasy_catalog_activation_preview(
    p_football_season_id, p_ruleset_code, p_expected_team_count,
    p_expected_round_count, p_expected_fixture_count,
    p_minimum_player_count, p_maximum_player_count
  ) || jsonb_build_object(
    'ratingDegeneracy', app_private.fantasy_rating_inputs_degenerate(p_football_season_id)
  );
end;
$$;

create or replace function api.service_stage_fantasy_catalog(
  p_football_season_id uuid,
  p_ruleset_code text,
  p_expected_source_digest text,
  p_idempotency_key uuid,
  p_expected_team_count integer,
  p_expected_round_count integer,
  p_expected_fixture_count integer,
  p_minimum_player_count integer,
  p_maximum_player_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare preview jsonb;
declare target_season app.seasons%rowtype;
declare target_competition app.competitions%rowtype;
declare target_ruleset app.fantasy_rulesets%rowtype;
declare target_fantasy_competition_id uuid;
declare target_fantasy_season_id uuid;
declare existing_run app_private.fantasy_catalog_activation_runs%rowtype;
declare player_count integer;
declare gameweek_count integer;
declare fixture_count integer;
declare rating_degeneracy jsonb;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_idempotency_key is null or p_expected_source_digest !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  select * into target_ruleset from app.fantasy_rulesets
  where ruleset_code = p_ruleset_code and active and published_at is not null;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_ruleset_not_found';
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'fantasy:catalog:' || p_football_season_id::text, 0
  ));

  select * into existing_run from app_private.fantasy_catalog_activation_runs
  where id = p_idempotency_key;
  if found then
    if existing_run.football_season_id <> p_football_season_id
      or existing_run.source_digest <> p_expected_source_digest
      or existing_run.ruleset_id <> target_ruleset.id
      or existing_run.expected_team_count <> p_expected_team_count
      or existing_run.expected_round_count <> p_expected_round_count
      or existing_run.expected_fixture_count <> p_expected_fixture_count
      or existing_run.minimum_player_count <> p_minimum_player_count
      or existing_run.maximum_player_count <> p_maximum_player_count then
      raise exception using errcode = 'PT409', message = 'idempotency_conflict';
    end if;
    return app_private.fantasy_catalog_stage_dto(existing_run);
  end if;

  if exists (select 1 from app_private.fantasy_catalog_activation_runs run
    where run.football_season_id = p_football_season_id and run.rolled_back_at is null) then
    raise exception using errcode = 'PT409', message = 'fantasy_catalog_already_staged';
  end if;
  if exists (select 1 from app.fantasy_seasons fantasy_season
    where fantasy_season.football_season_id = p_football_season_id) then
    raise exception using errcode = 'PT409', message = 'fantasy_catalog_already_staged';
  end if;

  preview := app_private.fantasy_catalog_activation_preview(
    p_football_season_id, p_ruleset_code, p_expected_team_count,
    p_expected_round_count, p_expected_fixture_count,
    p_minimum_player_count, p_maximum_player_count
  );
  if not (preview ->> 'ready')::boolean then
    raise exception using errcode = 'PT409', message = 'fantasy_catalog_not_ready',
      detail = (preview -> 'blockers')::text;
  end if;
  if preview ->> 'sourceDigest' <> p_expected_source_digest then
    raise exception using errcode = 'PT409', message = 'stale_update';
  end if;

  -- Non-degeneracy guard: refuse to price a catalog when every candidate
  -- carries one identical rating with confidence 0 (no real rating evidence).
  rating_degeneracy := app_private.fantasy_rating_inputs_degenerate(p_football_season_id);
  if (rating_degeneracy ->> 'degenerate')::boolean then
    raise exception using errcode = 'PT409', message = 'fantasy_rating_inputs_degenerate',
      detail = rating_degeneracy::text;
  end if;

  select * into target_season from app.seasons where id = p_football_season_id;
  select * into target_competition from app.competitions
  where id = target_season.competition_id;
  select competition.id into target_fantasy_competition_id
  from app.fantasy_competitions competition
  where competition.football_competition_id = target_competition.id;
  if not found then
    insert into app.fantasy_competitions (
      football_competition_id, slug, name, active
    ) values (
      target_competition.id, target_competition.slug,
      target_competition.name || ' Fantasy', false
    ) returning id into target_fantasy_competition_id;
  end if;

  insert into app.fantasy_seasons (
    fantasy_competition_id, football_season_id, ruleset_id, name, status,
    starts_at, ends_at, wildcard_split_gameweek
  ) values (
    target_fantasy_competition_id, target_season.id, target_ruleset.id,
    target_season.label, 'planned', target_season.starts_on::timestamptz,
    (target_season.ends_on + 1)::timestamptz - interval '1 microsecond',
    ceil(p_expected_round_count / 2.0)::integer
  ) returning id into target_fantasy_season_id;

  insert into app.fantasy_gameweeks (
    fantasy_season_id, football_round_id, sequence_number, name,
    deadline_at, starts_at, ends_at, status, points_state
  )
  select target_fantasy_season_id, round_row.id, round_row.round_number,
    round_row.name,
    app_private.fantasy_calculate_deadline(target_ruleset.id, min(fixture.kickoff_at)),
    min(fixture.kickoff_at), max(fixture.kickoff_at) + interval '6 hours',
    'scheduled', 'provisional'
  from app.rounds round_row
  join app.fixtures fixture on fixture.round_id = round_row.id
    and fixture.season_id = target_season.id
    and fixture.status not in ('cancelled', 'abandoned')
  where round_row.season_id = target_season.id
  group by round_row.id, round_row.round_number, round_row.name
  order by round_row.round_number;

  insert into app.fantasy_players (
    fantasy_season_id, football_player_id, football_team_id, position_id,
    price, status, eligible, active
  )
  select target_fantasy_season_id, candidate.football_player_id,
    candidate.football_team_id, candidate.fantasy_position_id,
    candidate.initial_price, 'available', true, true
  from app_private.fantasy_catalog_candidates(target_season.id) candidate;

  insert into app_private.fantasy_initial_price_evidence (
    fantasy_player_id, algorithm_code, source_rating_season_id,
    source_rating_algorithm, source_rating, source_confidence, calculated_price
  )
  select fantasy_player.id, 'botolago-initial-price-v1.0',
    candidate.source_rating_season_id, candidate.source_rating_algorithm,
    candidate.source_rating, candidate.source_confidence, candidate.initial_price
  from app.fantasy_players fantasy_player
  join app_private.fantasy_catalog_candidates(target_season.id) candidate
    on candidate.football_player_id = fantasy_player.football_player_id
  where fantasy_player.fantasy_season_id = target_fantasy_season_id;

  insert into app.fantasy_player_price_history (
    fantasy_player_id, gameweek_id, old_price, new_price, reason,
    effective_at, source_version, movement
  )
  select fantasy_player.id, null, null, fantasy_player.price,
    'initial_catalog_v1', statement_timestamp(), 1, 0
  from app.fantasy_players fantasy_player
  where fantasy_player.fantasy_season_id = target_fantasy_season_id;

  insert into app.fantasy_fixture_assignments (
    fantasy_season_id, fixture_id, gameweek_id, original_gameweek_id,
    original_kickoff_at, assigned_kickoff_at, assignment_status,
    counts_points, source_version
  )
  select target_fantasy_season_id, fixture.id, gameweek.id, gameweek.id,
    fixture.kickoff_at, fixture.kickoff_at, 'assigned', true,
    greatest(1, fixture.source_sequence)
  from app.fixtures fixture
  join app.fantasy_gameweeks gameweek
    on gameweek.fantasy_season_id = target_fantasy_season_id
    and gameweek.football_round_id = fixture.round_id
  where fixture.season_id = target_season.id
    and fixture.status not in ('cancelled', 'abandoned');

  select count(*) into player_count from app.fantasy_players
  where fantasy_players.fantasy_season_id = target_fantasy_season_id;
  select count(*) into gameweek_count from app.fantasy_gameweeks
  where fantasy_gameweeks.fantasy_season_id = target_fantasy_season_id;
  select count(*) into fixture_count from app.fantasy_fixture_assignments
  where fantasy_fixture_assignments.fantasy_season_id = target_fantasy_season_id
    and superseded_at is null;

  if player_count <> (preview -> 'counts' ->> 'players')::integer
    or gameweek_count <> p_expected_round_count
    or fixture_count <> p_expected_fixture_count then
    raise exception using errcode = 'PT409', message = 'fantasy_catalog_integrity_failed';
  end if;

  insert into app_private.fantasy_catalog_activation_runs (
    id, football_season_id, fantasy_season_id, ruleset_id, source_digest,
    initial_price_algorithm, expected_team_count, expected_round_count,
    expected_fixture_count, minimum_player_count, maximum_player_count,
    player_count, gameweek_count, fixture_count
  ) values (
    p_idempotency_key, target_season.id, target_fantasy_season_id, target_ruleset.id,
    p_expected_source_digest, 'botolago-initial-price-v1.0',
    p_expected_team_count, p_expected_round_count, p_expected_fixture_count,
    p_minimum_player_count, p_maximum_player_count,
    player_count, gameweek_count, fixture_count
  ) returning * into existing_run;

  return app_private.fantasy_catalog_stage_dto(existing_run);
end;
$$;

revoke all on function app_private.fantasy_rating_inputs_degenerate(uuid)
  from public, anon, authenticated, service_role;

revoke all on function api.preview_fantasy_catalog_activation(
  uuid, text, integer, integer, integer, integer, integer
) from public, anon, authenticated, service_role;
revoke all on function api.service_stage_fantasy_catalog(
  uuid, text, text, uuid, integer, integer, integer, integer, integer
) from public, anon, authenticated, service_role;

grant execute on function api.preview_fantasy_catalog_activation(
  uuid, text, integer, integer, integer, integer, integer
) to service_role;
grant execute on function api.service_stage_fantasy_catalog(
  uuid, text, text, uuid, integer, integer, integer, integer, integer
) to service_role;
