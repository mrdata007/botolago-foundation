-- BG-0011 / BG-0032 / BG-0048 — scripts/backend/fantasy-catalog-restage-maintenance.sql
--
-- Exercises the maintenance transaction end-to-end against a synthetic
-- catalog that matches PRODUCTION's REAL reviewed launch profile (16 clubs,
-- 1 round, 8 fixtures) rather than the runbook's full 16/30/240 profile that
-- supabase/tests/database/fantasy_catalog_activation.test.sql already
-- covers. Reuses one shared fixture-building helper
-- (pg_temp.fantasy_restage_build_catalog) across every scenario below
-- instead of repeating the club/player/season/fixture setup per case.
begin;

select extensions.no_plan();

-- ---------------------------------------------------------------------
-- Shared base data: 16 clubs, 240 players (15 per club, matching squad_size
-- 15 and the GK/DEF/MID/FWD quotas of ruleset botolago-fantasy-v1.1), all
-- reused across every scenario below. Only the season/round/fixture rows
-- (and the rating rows on the prior season) are scenario-specific.
-- ---------------------------------------------------------------------
insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('d0000000-0000-4000-8000-000000000001', 'MA', 'MAR');

-- One competition per scenario suffix (app.seasons enforces at most one
-- current season per competition, and every scenario needs its own current
-- target season).
insert into app.competitions (id, slug, name, short_name, competition_type, country_id, active)
select md5('restage-competition:' || suffix)::uuid,
  'restage-maintenance-' || suffix, 'Restage Maintenance ' || suffix, 'RML',
  'league', 'd0000000-0000-4000-8000-000000000001', true
from unnest(array['happy', 'control', 'extra', 'jobruns', 'atomic', 'permuted']) suffix;

insert into app.teams (id, slug, name, short_name, code, country_id, active)
select md5('restage-club:' || team_number)::uuid,
  'restage-club-' || team_number, 'Restage Club ' || team_number,
  'Club ' || team_number, 'R' || lpad(team_number::text, 2, '0'),
  'd0000000-0000-4000-8000-000000000001', true
from generate_series(1, 16) team_number;

insert into app.players (id, slug, full_name, display_name, position, active)
select md5('restage-player:' || team_number || ':' || player_number)::uuid,
  'restage-player-' || team_number || '-' || player_number,
  'Restage Player ' || team_number || ' ' || player_number,
  'RP ' || team_number || '-' || player_number,
  case
    when player_number <= 2 then 'goalkeeper'::app.football_position
    when player_number <= 7 then 'defender'::app.football_position
    when player_number <= 12 then 'midfielder'::app.football_position
    else 'forward'::app.football_position
  end,
  true
from generate_series(1, 16) team_number
cross join generate_series(1, 15) player_number;

-- ---------------------------------------------------------------------
-- Shared fixture-building helper: one prior (completed) season carrying
-- ratings, one target (planned/current) season with a 16-club single-round
-- 8-fixture calendar. p_rated = false yields a fully degenerate rating
-- input (every candidate falls back to 6.0 / confidence 0) for the atomic-
-- rollback-on-stage-failure scenario.
-- ---------------------------------------------------------------------
create function pg_temp.fantasy_restage_build_catalog(p_suffix text, p_rated boolean)
returns uuid
language plpgsql
as $$
declare
  v_competition uuid := md5('restage-competition:' || p_suffix)::uuid;
  v_prior_season uuid := md5('restage-prior:' || p_suffix)::uuid;
  v_target_season uuid := md5('restage-target:' || p_suffix)::uuid;
  v_round uuid := md5('restage-round:' || p_suffix)::uuid;
begin
  insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
  values
    (v_prior_season, v_competition, 'Prior ' || p_suffix,
      current_date - 400, current_date - 40, 'completed', false),
    (v_target_season, v_competition, 'Target ' || p_suffix,
      current_date + 40, current_date + 300, 'planned', true);

  insert into app.team_memberships (
    id, player_id, team_id, season_id, shirt_number, squad_role, valid_from, active
  )
  select md5('restage-membership:' || p_suffix || ':' || team_number || ':' || player_number)::uuid,
    md5('restage-player:' || team_number || ':' || player_number)::uuid,
    md5('restage-club:' || team_number)::uuid,
    v_target_season, player_number, 'player', current_date + 40, true
  from generate_series(1, 16) team_number
  cross join generate_series(1, 15) player_number;

  if p_rated then
    -- Realistic mixed distribution: a positive-confidence majority among
    -- the RATED subset (varied ratings 4.5-9.5, confidence 0.4-1.0), plus a
    -- handful of explicit zero-confidence rated rows, on top of the
    -- (unrated) fallback 6.0/0 the remaining players legitimately receive.
    -- The pricing formula and degeneracy guard are confidence-only, so this
    -- aggregate mix is sufficient without reproducing every real-world
    -- zero-confidence sub-case.
    insert into app.player_season_ratings (
      id, football_season_id, player_id, position, source_provider,
      source_version, algorithm_version, appearances, starts, minutes,
      goals, assists, clean_sheets, goals_conceded, saves, penalties_saved,
      penalties_missed, yellow_cards, red_cards, second_yellow_dismissals,
      own_goals, provider_rating, fantasy_equivalent_points, points_per_90,
      confidence, rating, active, source_updated_at
    )
    select
      md5('restage-rating:' || p_suffix || ':' || team_number || ':' || player_number)::uuid,
      v_prior_season,
      md5('restage-player:' || team_number || ':' || player_number)::uuid,
      case when player_number <= 2 then 'goalkeeper'::app.football_position
        when player_number <= 7 then 'defender'::app.football_position
        when player_number <= 12 then 'midfielder'::app.football_position
        else 'forward'::app.football_position end,
      'sportsmonks', 'restage-test:v1', 'botolago-preseason-rating-v1',
      28, 25, 2200, 5, 4, 3, 10, 0, 0, 0, 2, 0, 0, 0, 6.5, 90, 4.5,
      case when player_number in (2, 15) then 0.0
        else (0.4 + (player_number::numeric % 6) * 0.1) end,
      4.5 + (player_number::numeric % 6),
      true, statement_timestamp()
    from generate_series(1, 16) team_number
    cross join generate_series(1, 15) player_number
    -- rate a representative subset per club (positions 1,2,4,8,10,13,15)
    -- rather than all 15, so most players legitimately keep the unrated
    -- fallback, matching the real production mix.
    where player_number in (1, 2, 4, 8, 10, 13, 15);
  end if;

  insert into app.rounds (id, season_id, round_number, name, starts_at, ends_at, status)
  values (v_round, v_target_season, 1, 'Gameweek 1',
    statement_timestamp() + interval '45 days', statement_timestamp() + interval '47 days',
    'planned');

  insert into app.fixtures (
    id, competition_id, season_id, round_id, home_team_id, away_team_id,
    kickoff_at, status, period, provider_updated_at, source_sequence, source_version
  )
  select md5('restage-fixture:' || p_suffix || ':' || match_number)::uuid,
    v_competition, v_target_season, v_round,
    md5('restage-club:' || match_number)::uuid,
    md5('restage-club:' || (17 - match_number))::uuid,
    statement_timestamp() + interval '45 days' + match_number * interval '1 hour',
    'scheduled', 'pre_match', statement_timestamp(), match_number, 'restage-test:v1'
  from generate_series(1, 8) match_number;

  return v_target_season;
end;
$$;

-- Convenience: stage a football season's catalog as the trusted service
-- caller, returning the stage DTO.
create function pg_temp.fantasy_restage_stage(p_football_season_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
as $$
declare v_preview jsonb; declare v_stage jsonb;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  v_preview := api.preview_fantasy_catalog_activation(
    p_football_season_id, 'botolago-fantasy-v1.1', 16, 1, 8, 240, 800
  );
  v_stage := api.service_stage_fantasy_catalog(
    p_football_season_id, 'botolago-fantasy-v1.1',
    v_preview ->> 'sourceDigest', p_idempotency_key, 16, 1, 8, 240, 800
  );
  perform set_config('request.jwt.claim.role', null, true);
  return v_stage;
end;
$$;

-- Convenience: create one synthetic e2e-style team (deliberately-patterned
-- test uuid, matching the real allow-listed pattern) plus a representative
-- set of dependents against a staged fantasy season, using two of its real
-- fantasy_players so squad membership/lineup/transfer rows are genuine FK
-- references, not placeholders.
create function pg_temp.fantasy_restage_seed_e2e_team(
  p_team_id uuid, p_owner_id uuid, p_owner_email text, p_fantasy_season_id uuid
)
returns void
language plpgsql
as $$
declare
  v_gameweek uuid;
  v_player_a uuid; v_player_b uuid; v_player_c uuid;
  v_lineup uuid;
  v_batch uuid := md5('restage-batch:' || p_team_id::text)::uuid;
  v_league uuid := md5('restage-league:' || p_owner_id::text || ':' || p_fantasy_season_id::text)::uuid;
begin
  if not exists (select 1 from auth.users where id = p_owner_id) then
    insert into auth.users (
      id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      p_owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      p_owner_email, statement_timestamp(), 'hash', '{}', '{}',
      statement_timestamp(), statement_timestamp()
    );
  end if;

  select id into v_gameweek from app.fantasy_gameweeks
  where fantasy_season_id = p_fantasy_season_id order by sequence_number limit 1;
  select id into v_player_a from app.fantasy_players
  where fantasy_season_id = p_fantasy_season_id order by id limit 1 offset 0;
  select id into v_player_b from app.fantasy_players
  where fantasy_season_id = p_fantasy_season_id order by id limit 1 offset 1;
  select id into v_player_c from app.fantasy_players
  where fantasy_season_id = p_fantasy_season_id order by id limit 1 offset 2;

  insert into app.fantasy_teams (
    id, user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers
  ) values (
    p_team_id, p_owner_id, p_fantasy_season_id, v_gameweek, 'E2E Team ' || left(p_team_id::text, 8),
    5, 95, 1
  );

  insert into app.fantasy_squad_memberships (
    fantasy_team_id, fantasy_player_id, purchase_price, current_sale_price, acquired_gameweek_id
  )
  select p_team_id, player.id, player.price, player.price, v_gameweek
  from app.fantasy_players player
  where player.fantasy_season_id = p_fantasy_season_id
  order by player.id limit 5;

  insert into app.fantasy_lineups (id, fantasy_team_id, gameweek_id, team_version)
  values (md5('restage-lineup:' || p_team_id::text)::uuid, p_team_id, v_gameweek, 1)
  returning id into v_lineup;
  insert into app.fantasy_lineup_players (
    lineup_id, fantasy_player_id, slot, slot_order, captain, vice_captain, multiplier, snapshot_price
  ) values
    (v_lineup, v_player_a, 'starter', 1, true, false, 2, 6),
    (v_lineup, v_player_b, 'starter', 2, false, true, 1, 6);

  insert into app.fantasy_transfer_batches (
    id, fantasy_team_id, gameweek_id, idempotency_key, base_team_version,
    resulting_team_version, transfers_count, free_transfers_before,
    free_transfers_used, point_hit, bank_before, bank_after
  ) values (
    v_batch, p_team_id, v_gameweek, md5('restage-batch-key:' || p_team_id::text)::uuid,
    1, 2, 1, 1, 1, 0, 10, 5
  );
  insert into app.fantasy_transfers (
    transfer_batch_id, sequence_number, player_out_id, player_in_id, sale_price, purchase_price
  ) values (v_batch, 1, v_player_c, v_player_a, 6, 6);

  if not exists (select 1 from app.fantasy_leagues where id = v_league) then
    insert into app.fantasy_leagues (id, fantasy_season_id, owner_user_id, name, visibility)
    values (v_league, p_fantasy_season_id, p_owner_id, 'E2E League ' || left(v_league::text, 8), 'public');
  end if;
  insert into app.fantasy_league_memberships (league_id, fantasy_team_id, user_id)
  values (v_league, p_team_id, p_owner_id);

  insert into app_private.fantasy_mutation_audit (
    user_id, fantasy_team_id, operation, accepted, resulting_version, safe_metadata
  ) values (p_owner_id, p_team_id, 'create_team', true, 1, '{}'::jsonb);
end;
$$;

-- =======================================================================
-- Scenario "happy": the real path — 3 allow-listed teams, dependents,
-- rollback + restage in one transaction, differentiated new prices, old
-- accounts preserved, an unrelated control season untouched, and a valid
-- squad purchase against the new catalog succeeds.
-- =======================================================================
select set_config('test.happy_football_season',
  pg_temp.fantasy_restage_build_catalog('happy', true)::text, true);
select set_config('test.happy_stage',
  pg_temp.fantasy_restage_stage(
    current_setting('test.happy_football_season')::uuid,
    'd1a00000-0000-4000-8000-000000000001'
  )::text, true);
select set_config('test.happy_fantasy_season',
  current_setting('test.happy_stage')::jsonb ->> 'fantasySeasonId', true);

select pg_temp.fantasy_restage_seed_e2e_team(
  'e2e10000-0000-4000-8000-00000000f001', 'e2e00000-0000-4000-8000-00000000f001',
  'e2e.fantasy.recovery@botolago.test', current_setting('test.happy_fantasy_season')::uuid
);
select pg_temp.fantasy_restage_seed_e2e_team(
  'e2e10000-0000-4000-8000-00000000f002', 'e2e00000-0000-4000-8000-00000000f002',
  'e2e.fantasy.newcomer@botolago.test', current_setting('test.happy_fantasy_season')::uuid
);
select pg_temp.fantasy_restage_seed_e2e_team(
  'e2e10000-0000-4000-8000-00000000f003', 'e2e00000-0000-4000-8000-00000000f003',
  'e2e.fantasy.launch@botolago.test', current_setting('test.happy_fantasy_season')::uuid
);

-- Control: an entirely unrelated season/catalog/team that must be
-- untouched by everything below.
select set_config('test.control_football_season',
  pg_temp.fantasy_restage_build_catalog('control', true)::text, true);
select set_config('test.control_stage',
  pg_temp.fantasy_restage_stage(
    current_setting('test.control_football_season')::uuid,
    'd1a00000-0000-4000-8000-000000000002'
  )::text, true);
select set_config('test.control_fantasy_season',
  current_setting('test.control_stage')::jsonb ->> 'fantasySeasonId', true);
select pg_temp.fantasy_restage_seed_e2e_team(
  'c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-0000000000f0',
  'control.owner@botolago.test', current_setting('test.control_fantasy_season')::uuid
);

select extensions.is(
  (select count(*)::integer from app.fantasy_teams
   where fantasy_season_id = current_setting('test.happy_fantasy_season')::uuid),
  3, 'fixture setup: exactly 3 teams exist for the happy-path fantasy season'
);

-- Byte-for-byte copy of pg_temp.fantasy_catalog_restage_pre_export from
-- scripts/backend/fantasy-catalog-restage-maintenance.sql — same
-- keep-in-sync note as the maintenance function below.
create function pg_temp.fantasy_catalog_restage_pre_export(
  p_fantasy_season_id uuid,
  p_allowed_team_ids uuid[]
)
returns table (export_json jsonb)
language sql
stable
as $$
  select jsonb_build_object(
    'exportedAt', statement_timestamp(),
    'fantasySeasonId', p_fantasy_season_id,
    'allowedTeamIds', to_jsonb(p_allowed_team_ids),
    'activationRun', (
      select to_jsonb(run) from app_private.fantasy_catalog_activation_runs run
      where run.fantasy_season_id = p_fantasy_season_id
    ),
    'gameweeks', (
      select coalesce(jsonb_agg(to_jsonb(gameweek)), '[]'::jsonb)
      from app.fantasy_gameweeks gameweek
      where gameweek.fantasy_season_id = p_fantasy_season_id
    ),
    'teams', (
      select coalesce(jsonb_agg(to_jsonb(team)), '[]'::jsonb)
      from app.fantasy_teams team
      where team.id = any (p_allowed_team_ids)
    ),
    'squadMemberships', (
      select coalesce(jsonb_agg(to_jsonb(squad)), '[]'::jsonb)
      from app.fantasy_squad_memberships squad
      where squad.fantasy_team_id = any (p_allowed_team_ids)
    ),
    'transferBatches', (
      select coalesce(jsonb_agg(to_jsonb(batch)), '[]'::jsonb)
      from app.fantasy_transfer_batches batch
      where batch.fantasy_team_id = any (p_allowed_team_ids)
    ),
    'transfers', (
      select coalesce(jsonb_agg(to_jsonb(transfer)), '[]'::jsonb)
      from app.fantasy_transfers transfer
      join app.fantasy_transfer_batches batch on batch.id = transfer.transfer_batch_id
      where batch.fantasy_team_id = any (p_allowed_team_ids)
    ),
    'lineups', (
      select coalesce(jsonb_agg(to_jsonb(lineup)), '[]'::jsonb)
      from app.fantasy_lineups lineup
      where lineup.fantasy_team_id = any (p_allowed_team_ids)
    ),
    'lineupPlayers', (
      select coalesce(jsonb_agg(to_jsonb(lineup_player)), '[]'::jsonb)
      from app.fantasy_lineup_players lineup_player
      join app.fantasy_lineups lineup on lineup.id = lineup_player.lineup_id
      where lineup.fantasy_team_id = any (p_allowed_team_ids)
    ),
    'leagueMemberships', (
      select coalesce(jsonb_agg(to_jsonb(membership)), '[]'::jsonb)
      from app.fantasy_league_memberships membership
      where membership.fantasy_team_id = any (p_allowed_team_ids)
    ),
    'leagues', (
      select coalesce(jsonb_agg(to_jsonb(league)), '[]'::jsonb)
      from app.fantasy_leagues league
      where league.fantasy_season_id = p_fantasy_season_id
    ),
    'mutationAudit', (
      select coalesce(jsonb_agg(to_jsonb(audit)), '[]'::jsonb)
      from app_private.fantasy_mutation_audit audit
      where audit.fantasy_team_id = any (p_allowed_team_ids)
    ),
    'priceEvidence', (
      select coalesce(jsonb_agg(to_jsonb(evidence)), '[]'::jsonb)
      from app_private.fantasy_initial_price_evidence evidence
      join app.fantasy_players player on player.id = evidence.fantasy_player_id
      where player.fantasy_season_id = p_fantasy_season_id
    ),
    'priceHistory', (
      select coalesce(jsonb_agg(to_jsonb(history)), '[]'::jsonb)
      from app.fantasy_player_price_history history
      join app.fantasy_players player on player.id = history.fantasy_player_id
      where player.fantasy_season_id = p_fantasy_season_id
    )
  ) as export_json;
$$;

-- Load the maintenance function under test. This is an intentional,
-- byte-for-byte copy of the pg_temp.fantasy_catalog_restage_maintenance
-- function body from scripts/backend/fantasy-catalog-restage-maintenance.sql
-- (kept in sync manually): the pgTAP/`supabase test db` harness runs psql
-- inside a container that only has the supabase/ tree mounted, so a plain
-- `\i`/`\ir` of a path under scripts/backend is not reachable from here.
-- If you change the function in the script, update this copy in the same
-- change.
create function pg_temp.fantasy_catalog_restage_maintenance(
  p_fantasy_season_id uuid,
  p_football_season_id uuid,
  p_activation_run_id uuid,
  p_allowed_team_ids uuid[],
  p_allowed_owner_ids uuid[],
  p_expected_squad_memberships integer,
  p_expected_transfer_batches integer,
  p_expected_transfers integer,
  p_expected_lineups integer,
  p_expected_lineup_players integer,
  p_expected_league_memberships integer,
  p_expected_mutation_audit_rows integer,
  p_expected_leagues integer,
  p_ruleset_code text,
  p_expected_team_count integer,
  p_expected_round_count integer,
  p_expected_fixture_count integer,
  p_minimum_player_count integer,
  p_maximum_player_count integer,
  p_new_idempotency_key uuid
)
returns table (
  stored_digest text,
  removed_squad_memberships integer,
  removed_transfer_batches integer,
  removed_transfers integer,
  removed_lineups integer,
  removed_lineup_players integer,
  removed_league_memberships integer,
  removed_mutation_audit_rows integer,
  removed_teams integer,
  rollback_result jsonb,
  preview_result jsonb,
  stage_result jsonb
)
language plpgsql
as $BODY$
declare
  v_stored_digest text;
  v_activation app_private.fantasy_catalog_activation_runs%rowtype;
  v_team_count integer;
  v_bad_owner_count integer;
  v_other_team_count integer;
  v_squad_memberships integer;
  v_transfer_batches integer;
  v_transfers integer;
  v_lineups integer;
  v_lineup_players integer;
  v_league_memberships integer;
  v_mutation_audit_rows integer;
  v_leagues integer;
  v_job_runs_by_season integer;
  v_job_runs_by_gameweek integer;
  v_rollback jsonb;
  v_preview jsonb;
  v_stage jsonb;
begin
  if p_fantasy_season_id is null or p_football_season_id is null
    or p_activation_run_id is null or p_new_idempotency_key is null
    or p_allowed_team_ids is null or cardinality(p_allowed_team_ids) <> 3
    or p_allowed_owner_ids is null or cardinality(p_allowed_owner_ids) <> 3
  then
    raise exception using errcode = 'PT400',
      message = 'fantasy_restage_maintenance_invalid_arguments';
  end if;

  if not (select rolbypassrls from pg_roles where rolname = current_user) then
    raise exception using errcode = 'PT403',
      message = 'fantasy_restage_maintenance_requires_bypassrls_session';
  end if;

  raise notice 'fantasy-catalog-restage-maintenance: starting for fantasy season %, football season %',
    p_fantasy_season_id, p_football_season_id;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'fantasy:catalog:' || p_football_season_id::text, 0
  ));

  select count(*) into v_job_runs_by_season
  from app_private.fantasy_job_runs run
  where run.fantasy_season_id = p_fantasy_season_id;
  if v_job_runs_by_season > 0 then
    raise exception using errcode = 'PT409',
      message = 'fantasy_restage_maintenance_job_runs_present_season_scoped',
      detail = format('%s row(s) in app_private.fantasy_job_runs reference fantasy_season_id %s',
        v_job_runs_by_season, p_fantasy_season_id);
  end if;

  select count(*) into v_job_runs_by_gameweek
  from app_private.fantasy_job_runs run
  join app.fantasy_gameweeks gameweek on gameweek.id = run.gameweek_id
  where gameweek.fantasy_season_id = p_fantasy_season_id;
  if v_job_runs_by_gameweek > 0 then
    raise exception using errcode = 'PT409',
      message = 'fantasy_restage_maintenance_job_runs_present_gameweek_scoped',
      detail = format('%s row(s) in app_private.fantasy_job_runs reference a gameweek of fantasy_season_id %s',
        v_job_runs_by_gameweek, p_fantasy_season_id);
  end if;
  raise notice 'fantasy-catalog-restage-maintenance: fantasy_job_runs clear on both FK paths (season=0, gameweek=0)';

  select count(*) into v_team_count
  from app.fantasy_teams team
  where team.fantasy_season_id = p_fantasy_season_id;
  if v_team_count <> 3 then
    raise exception using errcode = 'PT409',
      message = 'fantasy_restage_maintenance_unexpected_team_count',
      detail = format('expected exactly 3 fantasy_teams for season %s, found %s',
        p_fantasy_season_id, v_team_count);
  end if;

  select count(*) into v_other_team_count
  from app.fantasy_teams team
  where team.fantasy_season_id = p_fantasy_season_id
    and team.id <> all (p_allowed_team_ids);
  if v_other_team_count > 0 then
    raise exception using errcode = 'PT409',
      message = 'fantasy_restage_maintenance_unallowlisted_team_present',
      detail = format('%s team(s) for season %s are not in the allow-listed 3 ids',
        v_other_team_count, p_fantasy_season_id);
  end if;

  -- Kept byte-for-byte in sync with scripts/backend/fantasy-catalog-restage-maintenance.sql
  -- (strict pairwise team/owner correspondence, not independent set membership).
  select count(*) into v_bad_owner_count
  from unnest(p_allowed_team_ids, p_allowed_owner_ids) as expected(team_id, owner_id)
  join app.fantasy_teams team on team.id = expected.team_id
  where team.fantasy_season_id = p_fantasy_season_id
    and team.user_id <> expected.owner_id;
  if v_bad_owner_count > 0 then
    raise exception using errcode = 'PT409',
      message = 'fantasy_restage_maintenance_unexpected_owner',
      detail = 'a team id/owner pair for this season does not match the allow-listed pairing';
  end if;

  if (select count(*) from app.fantasy_teams team
      where team.id = any (p_allowed_team_ids)
        and team.fantasy_season_id = p_fantasy_season_id) <> 3 then
    raise exception using errcode = 'PT409',
      message = 'fantasy_restage_maintenance_allowlisted_team_missing';
  end if;

  if (select count(distinct team.user_id) from app.fantasy_teams team
      where team.fantasy_season_id = p_fantasy_season_id
        and team.user_id = any (p_allowed_owner_ids)) <> 3 then
    raise exception using errcode = 'PT409',
      message = 'fantasy_restage_maintenance_allowlisted_owner_missing',
      detail = 'not all 3 allow-listed owner ids own one of this season''s teams';
  end if;

  select count(*) into v_squad_memberships
  from app.fantasy_squad_memberships squad
  where squad.fantasy_team_id = any (p_allowed_team_ids);
  select count(*) into v_transfer_batches
  from app.fantasy_transfer_batches batch
  where batch.fantasy_team_id = any (p_allowed_team_ids);
  select count(*) into v_transfers
  from app.fantasy_transfers transfer
  join app.fantasy_transfer_batches batch on batch.id = transfer.transfer_batch_id
  where batch.fantasy_team_id = any (p_allowed_team_ids);
  select count(*) into v_lineups
  from app.fantasy_lineups lineup
  where lineup.fantasy_team_id = any (p_allowed_team_ids);
  select count(*) into v_lineup_players
  from app.fantasy_lineup_players lineup_player
  join app.fantasy_lineups lineup on lineup.id = lineup_player.lineup_id
  where lineup.fantasy_team_id = any (p_allowed_team_ids);
  select count(*) into v_league_memberships
  from app.fantasy_league_memberships membership
  where membership.fantasy_team_id = any (p_allowed_team_ids);
  select count(*) into v_mutation_audit_rows
  from app_private.fantasy_mutation_audit audit
  where audit.fantasy_team_id = any (p_allowed_team_ids);
  select count(*) into v_leagues
  from app.fantasy_leagues league
  where league.fantasy_season_id = p_fantasy_season_id;

  if v_squad_memberships <> p_expected_squad_memberships
    or v_transfer_batches <> p_expected_transfer_batches
    or v_transfers <> p_expected_transfers
    or v_lineups <> p_expected_lineups
    or v_lineup_players <> p_expected_lineup_players
    or v_league_memberships <> p_expected_league_memberships
    or v_mutation_audit_rows <> p_expected_mutation_audit_rows
    or v_leagues <> p_expected_leagues
  then
    raise exception using errcode = 'PT409',
      message = 'fantasy_restage_maintenance_unexpected_dependent_counts',
      detail = format(
        'squad_memberships=%s(expected %s) transfer_batches=%s(expected %s) transfers=%s(expected %s) '
        'lineups=%s(expected %s) lineup_players=%s(expected %s) league_memberships=%s(expected %s) '
        'mutation_audit=%s(expected %s) leagues=%s(expected %s)',
        v_squad_memberships, p_expected_squad_memberships,
        v_transfer_batches, p_expected_transfer_batches,
        v_transfers, p_expected_transfers,
        v_lineups, p_expected_lineups,
        v_lineup_players, p_expected_lineup_players,
        v_league_memberships, p_expected_league_memberships,
        v_mutation_audit_rows, p_expected_mutation_audit_rows,
        v_leagues, p_expected_leagues
      );
  end if;

  if exists (select 1 from app.fantasy_chip_uses c where c.fantasy_team_id = any (p_allowed_team_ids))
    or exists (select 1 from app.fantasy_free_hit_snapshots s where s.fantasy_team_id = any (p_allowed_team_ids))
    or exists (select 1 from app.fantasy_rankings r where r.fantasy_team_id = any (p_allowed_team_ids))
    or exists (select 1 from app.fantasy_team_gameweek_results g where g.fantasy_team_id = any (p_allowed_team_ids))
  then
    raise exception using errcode = 'PT409',
      message = 'fantasy_restage_maintenance_unexpected_rows_in_expected_empty_tables';
  end if;

  raise notice 'fantasy-catalog-restage-maintenance: pre-check passed — 3 allow-listed teams, % squad memberships, % transfer batches, % transfers, % lineups, % lineup players, % league memberships, % mutation audit rows, % leagues',
    v_squad_memberships, v_transfer_batches, v_transfers, v_lineups, v_lineup_players,
    v_league_memberships, v_mutation_audit_rows, v_leagues;

  delete from app.fantasy_transfers transfer
  using app.fantasy_transfer_batches batch
  where transfer.transfer_batch_id = batch.id
    and batch.fantasy_team_id = any (p_allowed_team_ids);
  get diagnostics v_transfers = row_count;

  delete from app.fantasy_transfer_batches batch
  where batch.fantasy_team_id = any (p_allowed_team_ids);
  get diagnostics v_transfer_batches = row_count;

  delete from app.fantasy_lineup_players lineup_player
  using app.fantasy_lineups lineup
  where lineup_player.lineup_id = lineup.id
    and lineup.fantasy_team_id = any (p_allowed_team_ids);
  get diagnostics v_lineup_players = row_count;

  delete from app.fantasy_lineups lineup
  where lineup.fantasy_team_id = any (p_allowed_team_ids);
  get diagnostics v_lineups = row_count;

  delete from app.fantasy_squad_memberships squad
  where squad.fantasy_team_id = any (p_allowed_team_ids);
  get diagnostics v_squad_memberships = row_count;

  delete from app.fantasy_league_memberships membership
  where membership.fantasy_team_id = any (p_allowed_team_ids);
  get diagnostics v_league_memberships = row_count;

  delete from app_private.fantasy_mutation_audit audit
  where audit.fantasy_team_id = any (p_allowed_team_ids);
  get diagnostics v_mutation_audit_rows = row_count;

  delete from app.fantasy_teams team
  where team.id = any (p_allowed_team_ids);
  get diagnostics v_team_count = row_count;
  if v_team_count <> 3 then
    raise exception using errcode = 'PT409',
      message = 'fantasy_restage_maintenance_team_delete_count_mismatch',
      detail = format('expected to delete exactly 3 teams, deleted %s', v_team_count);
  end if;

  raise notice 'fantasy-catalog-restage-maintenance: deleted % transfers, % transfer_batches, % lineup_players, % lineups, % squad_memberships, % league_memberships, % mutation_audit rows, 3 teams',
    v_transfers, v_transfer_batches, v_lineup_players, v_lineups, v_squad_memberships,
    v_league_memberships, v_mutation_audit_rows;

  select * into v_activation from app_private.fantasy_catalog_activation_runs
  where id = p_activation_run_id;
  if not found then
    raise exception using errcode = 'PT404',
      message = 'fantasy_restage_maintenance_activation_run_not_found';
  end if;
  v_stored_digest := v_activation.source_digest;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  v_rollback := api.service_rollback_fantasy_catalog(p_activation_run_id, v_stored_digest);
  raise notice 'fantasy-catalog-restage-maintenance: rollback result: %', v_rollback;

  v_preview := api.preview_fantasy_catalog_activation(
    p_football_season_id, p_ruleset_code, p_expected_team_count,
    p_expected_round_count, p_expected_fixture_count,
    p_minimum_player_count, p_maximum_player_count
  );
  raise notice 'fantasy-catalog-restage-maintenance: preview result: %', v_preview;

  v_stage := api.service_stage_fantasy_catalog(
    p_football_season_id, p_ruleset_code,
    v_preview ->> 'sourceDigest', p_new_idempotency_key,
    p_expected_team_count, p_expected_round_count, p_expected_fixture_count,
    p_minimum_player_count, p_maximum_player_count
  );
  raise notice 'fantasy-catalog-restage-maintenance: stage result: activationId=%, fantasySeasonId=%, playerCount=%, sourceDigest=%',
    v_stage ->> 'activationId', v_stage ->> 'fantasySeasonId',
    v_stage ->> 'playerCount', v_stage ->> 'sourceDigest';

  perform set_config('request.jwt.claim.role', null, true);
  perform set_config('request.jwt.claims', null, true);

  return query select
    v_stored_digest,
    v_squad_memberships, v_transfer_batches, v_transfers, v_lineups, v_lineup_players,
    v_league_memberships, v_mutation_audit_rows, 3,
    v_rollback, v_preview, v_stage;
end;
$BODY$;

select set_config('test.happy_activation_run',
  current_setting('test.happy_stage')::jsonb ->> 'activationId', true);

select set_config('test.happy_result', (
  select row_to_json(r)::text from pg_temp.fantasy_catalog_restage_maintenance(
    p_fantasy_season_id => current_setting('test.happy_fantasy_season')::uuid,
    p_football_season_id => current_setting('test.happy_football_season')::uuid,
    p_activation_run_id => current_setting('test.happy_activation_run')::uuid,
    p_allowed_team_ids => array[
      'e2e10000-0000-4000-8000-00000000f001', 'e2e10000-0000-4000-8000-00000000f002',
      'e2e10000-0000-4000-8000-00000000f003']::uuid[],
    p_allowed_owner_ids => array[
      'e2e00000-0000-4000-8000-00000000f001', 'e2e00000-0000-4000-8000-00000000f002',
      'e2e00000-0000-4000-8000-00000000f003']::uuid[],
    p_expected_squad_memberships => 15, p_expected_transfer_batches => 3,
    p_expected_transfers => 3, p_expected_lineups => 3, p_expected_lineup_players => 6,
    p_expected_league_memberships => 3, p_expected_mutation_audit_rows => 3,
    p_expected_leagues => 3,
    p_ruleset_code => 'botolago-fantasy-v1.1', p_expected_team_count => 16,
    p_expected_round_count => 1, p_expected_fixture_count => 8,
    p_minimum_player_count => 240, p_maximum_player_count => 800,
    p_new_idempotency_key => 'd1a00000-0000-4000-8000-000000000003'
  ) r
), true);

select extensions.is(
  (select count(*)::integer from app.fantasy_teams
   where id = any (array['e2e10000-0000-4000-8000-00000000f001',
     'e2e10000-0000-4000-8000-00000000f002', 'e2e10000-0000-4000-8000-00000000f003']::uuid[])),
  0, 'the 3 allow-listed teams are gone after the maintenance transaction'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_squad_memberships
   where fantasy_player_id in (select id from app.fantasy_players
     where fantasy_season_id = current_setting('test.happy_fantasy_season')::uuid)),
  0, 'squad memberships of the deleted teams are gone'
);
select extensions.is(
  (select count(*)::integer from app_private.fantasy_mutation_audit
   where fantasy_team_id = 'e2e10000-0000-4000-8000-00000000f001'),
  0, 'mutation audit rows of the deleted teams are gone'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_leagues
   where fantasy_season_id = current_setting('test.happy_fantasy_season')::uuid),
  0, 'the old season''s leagues are gone (cleaned up by service_rollback_fantasy_catalog itself)'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_seasons
   where id = current_setting('test.happy_fantasy_season')::uuid),
  0, 'the old (degenerate-pricing-shaped) fantasy season is gone'
);

-- The 3 synthetic "login accounts" are explicitly retained.
select extensions.is(
  (select count(*)::integer from auth.users
   where id = any (array['e2e00000-0000-4000-8000-00000000f001',
     'e2e00000-0000-4000-8000-00000000f002', 'e2e00000-0000-4000-8000-00000000f003']::uuid[])),
  3, 'all 3 e2e auth.users accounts are retained'
);
select extensions.is(
  (select count(*)::integer from app.profiles
   where id = any (array['e2e00000-0000-4000-8000-00000000f001',
     'e2e00000-0000-4000-8000-00000000f002', 'e2e00000-0000-4000-8000-00000000f003']::uuid[])),
  3, 'all 3 e2e profiles are retained'
);

-- New catalog: rolled back + restaged in the same transaction, new season
-- id, differentiated prices.
select set_config('test.happy_new_fantasy_season',
  current_setting('test.happy_result')::jsonb -> 'stage_result' ->> 'fantasySeasonId', true);
select extensions.ok(
  current_setting('test.happy_new_fantasy_season') is not null
    and current_setting('test.happy_new_fantasy_season')
      <> current_setting('test.happy_fantasy_season'),
  'restage creates a brand new fantasy season id, distinct from the rolled-back one'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_players
   where fantasy_season_id = current_setting('test.happy_new_fantasy_season')::uuid),
  240, 'the restaged catalog carries the full 240-player pool'
);
select extensions.ok(
  exists (
    select 1 from (
      select distinct position.code, player.price
      from app.fantasy_players player
      join app.fantasy_positions position on position.id = player.position_id
      where player.fantasy_season_id = current_setting('test.happy_new_fantasy_season')::uuid
    ) distinct_by_position group by code having count(*) > 1
  ),
  'at least one position has more than one distinct price in the restaged catalog'
);
select extensions.ok(
  not (current_setting('test.happy_result')::jsonb -> 'rollback_result' ->> 'alreadyRolledBack')::boolean,
  'the rollback call inside the maintenance transaction actually performed a rollback'
);
select extensions.is(
  current_setting('test.happy_result')::jsonb -> 'rollback_result' -> 'removed' ->> 'players',
  '240', 'rollback reports removing the old catalog''s 240 players'
);

-- Control season/team/catalog: completely untouched.
select extensions.is(
  (select count(*)::integer from app.fantasy_teams where id = 'c0000000-0000-4000-8000-000000000001'),
  1, 'the unrelated control team is untouched'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_seasons
   where id = current_setting('test.control_fantasy_season')::uuid),
  1, 'the unrelated control season is untouched'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_players
   where fantasy_season_id = current_setting('test.control_fantasy_season')::uuid),
  240, 'the unrelated control catalog is untouched'
);

-- A valid, budget-feasible squad purchase succeeds against the NEW
-- catalog's real prices (cheapest eligible players per position, capped at
-- 3 per club, matching ruleset botolago-fantasy-v1.1).
-- Deterministic one-per-club selection (2 GK, 5 DEF, 5 MID, 3 FWD from 15
-- distinct clubs, well within the ruleset's max 3 players per club),
-- resolved against the NEW catalog's real fantasy_players via the stable
-- football_player_id each was built from.
-- Formation-valid: exactly 1 starting GK (quota 2, starting max 1), 4 of 5
-- starting DEF (min 3), 3 of 5 starting MID (min 2), all 3 FWD starting
-- (min 1) = 11 starters + 4 bench, matching botolago-fantasy-v1.1 exactly.
select set_config('test.happy_new_selection', (
  with wanted as (
    select team_number, player_number, slot, slot_order
    from (values
      (1, 1, 'starter', 1), (2, 1, 'bench', 1),
      (3, 3, 'starter', 2), (4, 3, 'starter', 3), (5, 3, 'starter', 4),
      (6, 3, 'starter', 5), (7, 3, 'bench', 2),
      (8, 8, 'starter', 6), (9, 8, 'starter', 7), (10, 8, 'starter', 8),
      (11, 8, 'bench', 3), (12, 8, 'bench', 4),
      (13, 13, 'starter', 9), (14, 13, 'starter', 10), (15, 13, 'starter', 11)
    ) as picks(team_number, player_number, slot, slot_order)
  )
  select jsonb_agg(jsonb_build_object(
    'fantasy_player_id', player.id, 'slot', wanted.slot, 'slot_order', wanted.slot_order,
    'captain', wanted.slot = 'starter' and wanted.slot_order = 1,
    'vice_captain', wanted.slot = 'starter' and wanted.slot_order = 2
  ))::text
  from wanted
  join app.fantasy_players player
    on player.football_player_id = md5(
      'restage-player:' || wanted.team_number || ':' || wanted.player_number
    )::uuid
    and player.fantasy_season_id = current_setting('test.happy_new_fantasy_season')::uuid
), true);
select extensions.is(
  jsonb_array_length(current_setting('test.happy_new_selection')::jsonb), 15,
  'a full 15-player, club-capped selection was built from the new catalog'
);
-- Simulate the separate, independently-verified api.service_open_fantasy_registration
-- step this maintenance script deliberately does not call, purely so a
-- squad purchase can be exercised end-to-end against the new catalog.
update app.fantasy_seasons set status = 'registration_open'
where id = current_setting('test.happy_new_fantasy_season')::uuid;
update app.fantasy_gameweeks set status = 'open'
where fantasy_season_id = current_setting('test.happy_new_fantasy_season')::uuid;

select set_config('request.jwt.claims',
  '{"sub":"e2e00000-0000-4000-8000-00000000f001","role":"authenticated"}', true);
select set_config('test.happy_new_team', api.create_fantasy_team(
  current_setting('test.happy_new_fantasy_season')::uuid,
  (select id from app.fantasy_gameweeks
    where fantasy_season_id = current_setting('test.happy_new_fantasy_season')::uuid limit 1),
  'Post Restage XI', current_setting('test.happy_new_selection')::jsonb,
  'd1a00000-0000-4000-8000-000000000099'
)::text, true);
select extensions.is(
  jsonb_array_length(current_setting('test.happy_new_team')::jsonb -> 'squad'), 15,
  'a valid squad can be purchased against the new catalog''s real prices after the restage'
);
select set_config('request.jwt.claims', null, true);

-- =======================================================================
-- Negative: an extra, non-allowlisted 4th team → abort before any deletion.
-- =======================================================================
select set_config('test.extra_football_season',
  pg_temp.fantasy_restage_build_catalog('extra', true)::text, true);
select set_config('test.extra_stage',
  pg_temp.fantasy_restage_stage(
    current_setting('test.extra_football_season')::uuid,
    'd1a00000-0000-4000-8000-000000000010'
  )::text, true);
select set_config('test.extra_fantasy_season',
  current_setting('test.extra_stage')::jsonb ->> 'fantasySeasonId', true);
select pg_temp.fantasy_restage_seed_e2e_team(
  'e2e20000-0000-4000-8000-00000000f001', 'e2e00000-0000-4000-8000-00000000f001',
  'e2e.fantasy.recovery@botolago.test', current_setting('test.extra_fantasy_season')::uuid
);
select pg_temp.fantasy_restage_seed_e2e_team(
  'e2e20000-0000-4000-8000-00000000f002', 'e2e00000-0000-4000-8000-00000000f002',
  'e2e.fantasy.newcomer@botolago.test', current_setting('test.extra_fantasy_season')::uuid
);
select pg_temp.fantasy_restage_seed_e2e_team(
  'e2e20000-0000-4000-8000-00000000f003', 'e2e00000-0000-4000-8000-00000000f003',
  'e2e.fantasy.launch@botolago.test', current_setting('test.extra_fantasy_season')::uuid
);
select pg_temp.fantasy_restage_seed_e2e_team(
  'e2e20000-0000-4000-8000-00000000f004', 'e2e00000-0000-4000-8000-00000000f9ff',
  'unexpected.fourth@botolago.test', current_setting('test.extra_fantasy_season')::uuid
);

select extensions.throws_ok(
  $$select * from pg_temp.fantasy_catalog_restage_maintenance(
    p_fantasy_season_id => current_setting('test.extra_fantasy_season')::uuid,
    p_football_season_id => current_setting('test.extra_football_season')::uuid,
    p_activation_run_id => (current_setting('test.extra_stage')::jsonb ->> 'activationId')::uuid,
    p_allowed_team_ids => array[
      'e2e20000-0000-4000-8000-00000000f001', 'e2e20000-0000-4000-8000-00000000f002',
      'e2e20000-0000-4000-8000-00000000f003']::uuid[],
    p_allowed_owner_ids => array[
      'e2e00000-0000-4000-8000-00000000f001', 'e2e00000-0000-4000-8000-00000000f002',
      'e2e00000-0000-4000-8000-00000000f003']::uuid[],
    p_expected_squad_memberships => 15, p_expected_transfer_batches => 3,
    p_expected_transfers => 3, p_expected_lineups => 3, p_expected_lineup_players => 6,
    p_expected_league_memberships => 3, p_expected_mutation_audit_rows => 3,
    p_expected_leagues => 3,
    p_ruleset_code => 'botolago-fantasy-v1.1', p_expected_team_count => 16,
    p_expected_round_count => 1, p_expected_fixture_count => 8,
    p_minimum_player_count => 240, p_maximum_player_count => 800,
    p_new_idempotency_key => 'd1a00000-0000-4000-8000-000000000011'
  )$$,
  'PT409', 'fantasy_restage_maintenance_unexpected_team_count',
  'a 4th, non-allowlisted team aborts the maintenance transaction before any deletion'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_teams
   where fantasy_season_id = current_setting('test.extra_fantasy_season')::uuid),
  4, 'all 4 teams (including the unexpected one) remain after the aborted attempt'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_seasons
   where id = current_setting('test.extra_fantasy_season')::uuid),
  1, 'the season under the aborted attempt is untouched'
);

-- =======================================================================
-- Negative: the 3 correct teams exist, but two owners are PERMUTED across
-- them (team ids match the allow-list exactly; owner ids are each drawn
-- from the allow-list, but assigned to the wrong team) → the strict
-- pairwise check must abort before any deletion, proving this is not just
-- independent set-membership on team ids and owner ids.
-- =======================================================================
select set_config('test.permuted_football_season',
  pg_temp.fantasy_restage_build_catalog('permuted', true)::text, true);
select set_config('test.permuted_stage',
  pg_temp.fantasy_restage_stage(
    current_setting('test.permuted_football_season')::uuid,
    'd1a00000-0000-4000-8000-000000000015'
  )::text, true);
select set_config('test.permuted_fantasy_season',
  current_setting('test.permuted_stage')::jsonb ->> 'fantasySeasonId', true);
-- Team f001 is (incorrectly) owned by owner f002, and vice versa; f003 is correct.
select pg_temp.fantasy_restage_seed_e2e_team(
  'e2e15000-0000-4000-8000-00000000f001', 'e2e00000-0000-4000-8000-00000000f002',
  'e2e.fantasy.recovery@botolago.test', current_setting('test.permuted_fantasy_season')::uuid
);
select pg_temp.fantasy_restage_seed_e2e_team(
  'e2e15000-0000-4000-8000-00000000f002', 'e2e00000-0000-4000-8000-00000000f001',
  'e2e.fantasy.newcomer@botolago.test', current_setting('test.permuted_fantasy_season')::uuid
);
select pg_temp.fantasy_restage_seed_e2e_team(
  'e2e15000-0000-4000-8000-00000000f003', 'e2e00000-0000-4000-8000-00000000f003',
  'e2e.fantasy.launch@botolago.test', current_setting('test.permuted_fantasy_season')::uuid
);

select extensions.throws_ok(
  $$select * from pg_temp.fantasy_catalog_restage_maintenance(
    p_fantasy_season_id => current_setting('test.permuted_fantasy_season')::uuid,
    p_football_season_id => current_setting('test.permuted_football_season')::uuid,
    p_activation_run_id => (current_setting('test.permuted_stage')::jsonb ->> 'activationId')::uuid,
    p_allowed_team_ids => array[
      'e2e15000-0000-4000-8000-00000000f001', 'e2e15000-0000-4000-8000-00000000f002',
      'e2e15000-0000-4000-8000-00000000f003']::uuid[],
    p_allowed_owner_ids => array[
      'e2e00000-0000-4000-8000-00000000f001', 'e2e00000-0000-4000-8000-00000000f002',
      'e2e00000-0000-4000-8000-00000000f003']::uuid[],
    p_expected_squad_memberships => 15, p_expected_transfer_batches => 3,
    p_expected_transfers => 3, p_expected_lineups => 3, p_expected_lineup_players => 6,
    p_expected_league_memberships => 3, p_expected_mutation_audit_rows => 3,
    p_expected_leagues => 3,
    p_ruleset_code => 'botolago-fantasy-v1.1', p_expected_team_count => 16,
    p_expected_round_count => 1, p_expected_fixture_count => 8,
    p_minimum_player_count => 240, p_maximum_player_count => 800,
    p_new_idempotency_key => 'd1a00000-0000-4000-8000-000000000016'
  )$$,
  'PT409', 'fantasy_restage_maintenance_unexpected_owner',
  'a permuted (but individually allow-listed) team/owner pairing aborts before any deletion'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_teams
   where fantasy_season_id = current_setting('test.permuted_fantasy_season')::uuid),
  3, 'all 3 teams remain, untouched, after the aborted permuted-owner attempt'
);

-- =======================================================================
-- Read-only pre-export sanity check: run it against the still-intact
-- "permuted" scenario above and confirm it returns the expected shape and
-- counts without deleting or modifying anything.
-- =======================================================================
select set_config('test.export_json',
  (select export_json::text from pg_temp.fantasy_catalog_restage_pre_export(
    p_fantasy_season_id => current_setting('test.permuted_fantasy_season')::uuid,
    p_allowed_team_ids => array[
      'e2e15000-0000-4000-8000-00000000f001', 'e2e15000-0000-4000-8000-00000000f002',
      'e2e15000-0000-4000-8000-00000000f003']::uuid[]
  )), true);
select extensions.is(
  jsonb_array_length(current_setting('test.export_json')::jsonb -> 'teams'),
  3, 'pre-export returns exactly the 3 allow-listed teams'
);
select extensions.is(
  (current_setting('test.export_json')::jsonb -> 'activationRun' ->> 'fantasy_season_id')::uuid,
  current_setting('test.permuted_fantasy_season')::uuid,
  'pre-export includes the activation run row for this fantasy season'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_teams
   where fantasy_season_id = current_setting('test.permuted_fantasy_season')::uuid),
  3, 'the pre-export is genuinely read-only: all 3 teams still present afterward'
);

-- =======================================================================
-- Negative: a fantasy_job_runs row (season-scoped, then gameweek-scoped)
-- → abort safely before any deletion. BG-0048 stays narrow: no cleanup.
-- =======================================================================
select set_config('test.jobruns_football_season',
  pg_temp.fantasy_restage_build_catalog('jobruns', true)::text, true);
select set_config('test.jobruns_stage',
  pg_temp.fantasy_restage_stage(
    current_setting('test.jobruns_football_season')::uuid,
    'd1a00000-0000-4000-8000-000000000020'
  )::text, true);
select set_config('test.jobruns_fantasy_season',
  current_setting('test.jobruns_stage')::jsonb ->> 'fantasySeasonId', true);
select pg_temp.fantasy_restage_seed_e2e_team(
  'e2e30000-0000-4000-8000-00000000f001', 'e2e00000-0000-4000-8000-00000000f001',
  'e2e.fantasy.recovery@botolago.test', current_setting('test.jobruns_fantasy_season')::uuid
);
select pg_temp.fantasy_restage_seed_e2e_team(
  'e2e30000-0000-4000-8000-00000000f002', 'e2e00000-0000-4000-8000-00000000f002',
  'e2e.fantasy.newcomer@botolago.test', current_setting('test.jobruns_fantasy_season')::uuid
);
select pg_temp.fantasy_restage_seed_e2e_team(
  'e2e30000-0000-4000-8000-00000000f003', 'e2e00000-0000-4000-8000-00000000f003',
  'e2e.fantasy.launch@botolago.test', current_setting('test.jobruns_fantasy_season')::uuid
);

insert into app_private.fantasy_job_runs (id, job_type, fantasy_season_id, status)
values ('e2e30000-0000-4000-8000-0000000000a1', 'scoring_batch',
  current_setting('test.jobruns_fantasy_season')::uuid, 'pending');

select extensions.throws_ok(
  $$select * from pg_temp.fantasy_catalog_restage_maintenance(
    p_fantasy_season_id => current_setting('test.jobruns_fantasy_season')::uuid,
    p_football_season_id => current_setting('test.jobruns_football_season')::uuid,
    p_activation_run_id => (current_setting('test.jobruns_stage')::jsonb ->> 'activationId')::uuid,
    p_allowed_team_ids => array[
      'e2e30000-0000-4000-8000-00000000f001', 'e2e30000-0000-4000-8000-00000000f002',
      'e2e30000-0000-4000-8000-00000000f003']::uuid[],
    p_allowed_owner_ids => array[
      'e2e00000-0000-4000-8000-00000000f001', 'e2e00000-0000-4000-8000-00000000f002',
      'e2e00000-0000-4000-8000-00000000f003']::uuid[],
    p_expected_squad_memberships => 15, p_expected_transfer_batches => 3,
    p_expected_transfers => 3, p_expected_lineups => 3, p_expected_lineup_players => 6,
    p_expected_league_memberships => 3, p_expected_mutation_audit_rows => 3,
    p_expected_leagues => 3,
    p_ruleset_code => 'botolago-fantasy-v1.1', p_expected_team_count => 16,
    p_expected_round_count => 1, p_expected_fixture_count => 8,
    p_minimum_player_count => 240, p_maximum_player_count => 800,
    p_new_idempotency_key => 'd1a00000-0000-4000-8000-000000000021'
  )$$,
  'PT409', 'fantasy_restage_maintenance_job_runs_present_season_scoped',
  'a season-scoped fantasy_job_runs row aborts the maintenance transaction safely'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_teams
   where fantasy_season_id = current_setting('test.jobruns_fantasy_season')::uuid),
  3, 'the 3 teams are untouched after the season-scoped job_runs abort'
);

delete from app_private.fantasy_job_runs where id = 'e2e30000-0000-4000-8000-0000000000a1';
insert into app_private.fantasy_job_runs (id, job_type, gameweek_id, status)
values ('e2e30000-0000-4000-8000-0000000000a2', 'gameweek_scoring',
  (select id from app.fantasy_gameweeks
    where fantasy_season_id = current_setting('test.jobruns_fantasy_season')::uuid limit 1),
  'pending');

select extensions.throws_ok(
  $$select * from pg_temp.fantasy_catalog_restage_maintenance(
    p_fantasy_season_id => current_setting('test.jobruns_fantasy_season')::uuid,
    p_football_season_id => current_setting('test.jobruns_football_season')::uuid,
    p_activation_run_id => (current_setting('test.jobruns_stage')::jsonb ->> 'activationId')::uuid,
    p_allowed_team_ids => array[
      'e2e30000-0000-4000-8000-00000000f001', 'e2e30000-0000-4000-8000-00000000f002',
      'e2e30000-0000-4000-8000-00000000f003']::uuid[],
    p_allowed_owner_ids => array[
      'e2e00000-0000-4000-8000-00000000f001', 'e2e00000-0000-4000-8000-00000000f002',
      'e2e00000-0000-4000-8000-00000000f003']::uuid[],
    p_expected_squad_memberships => 15, p_expected_transfer_batches => 3,
    p_expected_transfers => 3, p_expected_lineups => 3, p_expected_lineup_players => 6,
    p_expected_league_memberships => 3, p_expected_mutation_audit_rows => 3,
    p_expected_leagues => 3,
    p_ruleset_code => 'botolago-fantasy-v1.1', p_expected_team_count => 16,
    p_expected_round_count => 1, p_expected_fixture_count => 8,
    p_minimum_player_count => 240, p_maximum_player_count => 800,
    p_new_idempotency_key => 'd1a00000-0000-4000-8000-000000000022'
  )$$,
  'PT409', 'fantasy_restage_maintenance_job_runs_present_gameweek_scoped',
  'a gameweek-scoped fantasy_job_runs row aborts the maintenance transaction safely'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_teams
   where fantasy_season_id = current_setting('test.jobruns_fantasy_season')::uuid),
  3, 'the 3 teams are untouched after the gameweek-scoped job_runs abort'
);
delete from app_private.fantasy_job_runs where id = 'e2e30000-0000-4000-8000-0000000000a2';

-- =======================================================================
-- Atomic rollback: the re-stage step fails (forced degenerate rating
-- inputs for the new candidate set) → the ENTIRE transaction rolls back,
-- so the old catalog and the 3 teams are untouched, not just left staged.
-- =======================================================================
select set_config('test.atomic_football_season',
  pg_temp.fantasy_restage_build_catalog('atomic', true)::text, true);
select set_config('test.atomic_stage',
  pg_temp.fantasy_restage_stage(
    current_setting('test.atomic_football_season')::uuid,
    'd1a00000-0000-4000-8000-000000000030'
  )::text, true);
select set_config('test.atomic_fantasy_season',
  current_setting('test.atomic_stage')::jsonb ->> 'fantasySeasonId', true);
select pg_temp.fantasy_restage_seed_e2e_team(
  'e2e40000-0000-4000-8000-00000000f001', 'e2e00000-0000-4000-8000-00000000f001',
  'e2e.fantasy.recovery@botolago.test', current_setting('test.atomic_fantasy_season')::uuid
);
select pg_temp.fantasy_restage_seed_e2e_team(
  'e2e40000-0000-4000-8000-00000000f002', 'e2e00000-0000-4000-8000-00000000f002',
  'e2e.fantasy.newcomer@botolago.test', current_setting('test.atomic_fantasy_season')::uuid
);
select pg_temp.fantasy_restage_seed_e2e_team(
  'e2e40000-0000-4000-8000-00000000f003', 'e2e00000-0000-4000-8000-00000000f003',
  'e2e.fantasy.launch@botolago.test', current_setting('test.atomic_fantasy_season')::uuid
);

-- Force the football season's rating inputs to become degenerate (as if
-- every historical rating evaporated) so the re-stage step inside the
-- maintenance transaction hits the reviewed non-degeneracy guard.
update app.player_season_ratings
set active = false
where football_season_id = md5('restage-prior:atomic')::uuid;

select extensions.throws_ok(
  $$select * from pg_temp.fantasy_catalog_restage_maintenance(
    p_fantasy_season_id => current_setting('test.atomic_fantasy_season')::uuid,
    p_football_season_id => current_setting('test.atomic_football_season')::uuid,
    p_activation_run_id => (current_setting('test.atomic_stage')::jsonb ->> 'activationId')::uuid,
    p_allowed_team_ids => array[
      'e2e40000-0000-4000-8000-00000000f001', 'e2e40000-0000-4000-8000-00000000f002',
      'e2e40000-0000-4000-8000-00000000f003']::uuid[],
    p_allowed_owner_ids => array[
      'e2e00000-0000-4000-8000-00000000f001', 'e2e00000-0000-4000-8000-00000000f002',
      'e2e00000-0000-4000-8000-00000000f003']::uuid[],
    p_expected_squad_memberships => 15, p_expected_transfer_batches => 3,
    p_expected_transfers => 3, p_expected_lineups => 3, p_expected_lineup_players => 6,
    p_expected_league_memberships => 3, p_expected_mutation_audit_rows => 3,
    p_expected_leagues => 3,
    p_ruleset_code => 'botolago-fantasy-v1.1', p_expected_team_count => 16,
    p_expected_round_count => 1, p_expected_fixture_count => 8,
    p_minimum_player_count => 240, p_maximum_player_count => 800,
    p_new_idempotency_key => 'd1a00000-0000-4000-8000-000000000031'
  )$$,
  'PT409', 'fantasy_rating_inputs_degenerate',
  'a degenerate re-stage rolls back the entire transaction, not just the stage step'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_teams
   where id = any (array['e2e40000-0000-4000-8000-00000000f001',
     'e2e40000-0000-4000-8000-00000000f002', 'e2e40000-0000-4000-8000-00000000f003']::uuid[])),
  3, 'all 3 teams still exist: the destructive cleanup was rolled back too'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_seasons
   where id = current_setting('test.atomic_fantasy_season')::uuid),
  1, 'the old fantasy season still exists: the rollback call was rolled back too'
);
select extensions.ok(
  (select rolled_back_at is null from app_private.fantasy_catalog_activation_runs
   where id = (current_setting('test.atomic_stage')::jsonb ->> 'activationId')::uuid),
  'the old activation run''s rolled_back_at was never stamped: full atomicity confirmed'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_squad_memberships
   where fantasy_team_id = 'e2e40000-0000-4000-8000-00000000f001'),
  5, 'the old squad memberships of a still-existing team were never touched'
);

select * from extensions.finish();
rollback;
