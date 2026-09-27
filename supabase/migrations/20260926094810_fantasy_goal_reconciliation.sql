-- Fail closed before creating any scoring snapshot. This also checks fixtures
-- certified under the older coverage rule, including Tangier–Tiznit.

-- The read-only result provides fixture ids and counts for an operator to
-- reconcile. Own goals by the opposing side contribute to a team's score.
-- Only finished, counted fixtures are inspected, so this can be used during
-- a live gameweek as well as at snapshot creation.
create function app_private.fantasy_goal_reconciliation(p_document jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  fixture jsonb;
  player_teams jsonb;
  attributed_home bigint;
  attributed_away bigint;
  result jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_document->'fixtures') is distinct from 'array'
    or jsonb_typeof(p_document->'players') is distinct from 'array'
    or jsonb_typeof(p_document->'playerFixtures') is distinct from 'array' then
    return jsonb_build_array(jsonb_build_object('reason', 'scoring_document_incomplete'));
  end if;
  select coalesce(jsonb_object_agg(player->>'fantasyPlayerId', player->>'teamId'), '{}'::jsonb)
    into player_teams from jsonb_array_elements(p_document->'players') player;
  for fixture in select value from jsonb_array_elements(p_document->'fixtures') loop
    if fixture->>'status' is distinct from 'finished'
      or (fixture#>>'{assignment,counts_points}')::boolean is distinct from true then
      continue;
    end if;
    if fixture->>'homeScore' is null or fixture->>'awayScore' is null then
      result := result || jsonb_build_array(jsonb_build_object(
        'fixtureId', fixture->>'fixtureId', 'reason', 'final_score_missing'));
      continue;
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_document->'playerFixtures') performance
      where performance->>'fixtureId' = fixture->>'fixtureId'
        and (player_teams->>(performance->>'fantasyPlayerId') is null
          or jsonb_typeof(performance#>'{stats,goals}') is distinct from 'number'
          or jsonb_typeof(performance#>'{stats,ownGoals}') is distinct from 'number')
    ) then
      result := result || jsonb_build_array(jsonb_build_object(
        'fixtureId', fixture->>'fixtureId', 'reason', 'player_statistics_missing'));
      continue;
    end if;
    select
      coalesce(sum(case when player_teams->>(performance->>'fantasyPlayerId') = fixture->>'homeTeamId'
        then (performance#>>'{stats,goals}')::bigint else 0 end), 0)
      + coalesce(sum(case when player_teams->>(performance->>'fantasyPlayerId') = fixture->>'awayTeamId'
        then (performance#>>'{stats,ownGoals}')::bigint else 0 end), 0),
      coalesce(sum(case when player_teams->>(performance->>'fantasyPlayerId') = fixture->>'awayTeamId'
        then (performance#>>'{stats,goals}')::bigint else 0 end), 0)
      + coalesce(sum(case when player_teams->>(performance->>'fantasyPlayerId') = fixture->>'homeTeamId'
        then (performance#>>'{stats,ownGoals}')::bigint else 0 end), 0)
      into attributed_home, attributed_away
      from jsonb_array_elements(p_document->'playerFixtures') performance
      where performance->>'fixtureId' = fixture->>'fixtureId';
    if attributed_home <> (fixture->>'homeScore')::bigint
      or attributed_away <> (fixture->>'awayScore')::bigint then
      result := result || jsonb_build_array(jsonb_build_object(
        'fixtureId', fixture->>'fixtureId',
        'homeScore', (fixture->>'homeScore')::bigint, 'awayScore', (fixture->>'awayScore')::bigint,
        'homeAttributed', attributed_home, 'awayAttributed', attributed_away));
    end if;
  end loop;
  return result;
end;
$$;
revoke all on function app_private.fantasy_goal_reconciliation(jsonb)
  from public, anon, authenticated, service_role;

create or replace function app_private.fantasy_validate_scoring_document(p_document jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare f jsonb;
begin
  if p_document is null or jsonb_array_length(p_document->'fixtures') not between 1 and 64
    or jsonb_array_length(p_document->'players') not between 1 and 2000
    or jsonb_array_length(p_document->'playerFixtures') not between 1 and 10000
    or pg_column_size(p_document)>16777216 then
    raise exception using errcode='PT409',message='fantasy_scoring_input_incomplete';
  end if;
  if p_document->'features' is null or p_document->'features'='null'::jsonb
    or (p_document#>>'{features,bonus_points_enabled}')::boolean
    or (p_document#>>'{features,player_of_match_enabled}')::boolean then
    raise exception using errcode='PT409',message='fantasy_scoring_feature_unsupported';
  end if;
  if exists(select 1 from jsonb_array_elements(p_document->'playerFixtures') row_input
    where (row_input->>'statisticsComplete')::boolean is distinct from true) then
    raise exception using errcode='PT409',message='fantasy_scoring_coverage_incomplete'; end if;
  for f in select value from jsonb_array_elements(p_document->'fixtures') loop
    if f->>'status'<>'finished' or f->>'finalizedAt' is null
      or f->>'seasonId'<>p_document->>'footballSeasonId'
      or f#>>'{assignment,frozen_at}' is null
      or (f#>>'{assignment,counts_points}')::boolean is distinct from true
      or f#>>'{assignment,assignment_status}' not in ('assigned','confirmed','reassigned')
      or (f#>>'{coverage,reconciled}')::boolean is distinct from true
      or (f#>>'{coverage,scoring_statistics_complete}')::boolean is distinct from true
      or (f#>>'{coverage,invalid_detail_rows}')::integer is distinct from 0
      -- BG-0011 option B (owner decision 2026-09-25): up to 4 of the 22
      -- starters unnamed; the rows left out are the unnamed ones, at most 20.
      or f#>>'{coverage,coverage_outcome}' is distinct from 'accepted'
      or coalesce((f#>>'{coverage,anonymous_starter_rows}')::integer,-1) not between 0 and 4
      or coalesce((f#>>'{coverage,excluded_incomplete_rows}')::integer,-1)
        not between coalesce((f#>>'{coverage,anonymous_starter_rows}')::integer,0) and 20
      or coalesce((f#>>'{coverage,excluded_mapping_rows}')::integer,0)<>0
      or (f#>>'{coverage,starter_rows}')::integer is distinct from
        22-coalesce((f#>>'{coverage,anonymous_starter_rows}')::integer,0)
      or (f#>>'{coverage,team_count}')::integer is distinct from 2
      or (f#>>'{coverage,performance_rows}')::integer is distinct from (f->>'activePerformanceCount')::integer
      or f#>>'{coverage,football_season_id}' is distinct from p_document->>'footballSeasonId'
      or exists (select 1 from app.player_fixture_performances p where p.fixture_id=(f->>'fixtureId')::uuid and p.active
        and (p.source_version is distinct from f#>>'{coverage,source_version}' or p.football_season_id::text<>p_document->>'footballSeasonId')) then
      raise exception using errcode='PT409',message='fantasy_scoring_coverage_incomplete';
    end if;
  end loop;
  if app_private.fantasy_goal_reconciliation(p_document) <> '[]'::jsonb then
    raise exception using errcode='PT409',message='fantasy_goal_totals_mismatch';
  end if;
end;
$$;


revoke all on function app_private.fantasy_validate_scoring_document(jsonb) from public, anon, authenticated, service_role;

-- Recheck a snapshot at every persistence/finalization step. A snapshot
-- created before this migration must not bypass the reconciliation gate.
create or replace function app_private.fantasy_assert_scoring_snapshot(
  p_gameweek_id uuid,p_calculation_version bigint,p_input_digest text default null
) returns app_private.fantasy_scoring_snapshots
language plpgsql security definer set search_path='' as $$
declare snapshot app_private.fantasy_scoring_snapshots%rowtype; current_document jsonb;
begin
  select * into snapshot from app_private.fantasy_scoring_snapshots
  where gameweek_id=p_gameweek_id and calculation_version=p_calculation_version for update;
  if not found or (p_input_digest is not null and snapshot.input_digest<>p_input_digest) then
    raise exception using errcode='PT409',message='fantasy_scoring_snapshot_missing';
  end if;
  if exists(select 1 from app_private.fantasy_scoring_snapshots s where s.gameweek_id=p_gameweek_id and s.calculation_version>p_calculation_version) then
    raise exception using errcode='PT409',message='stale_update';
  end if;
  -- Small configuration catalogs are locked against inserts as well as edits;
  -- a new scoring rule cannot race the hash check.
  lock table app.fantasy_rulesets, app.fantasy_ruleset_features,
    app.fantasy_position_rules, app.fantasy_scoring_rules in share mode;
  perform f.id from app.fixtures f join app.fantasy_fixture_assignments a on a.fixture_id=f.id
  where a.gameweek_id=p_gameweek_id and a.superseded_at is null order by f.id for share of f;
  current_document:=app_private.fantasy_scoring_input_document(p_gameweek_id);
  if app_private.fantasy_goal_reconciliation(current_document) <> '[]'::jsonb then
    raise exception using errcode='PT409',message='fantasy_goal_totals_mismatch';
  end if;
  if encode(extensions.digest(current_document::text,'sha256'),'hex')<>snapshot.input_digest then
    raise exception using errcode='PT409',message='fantasy_scoring_input_changed';
  end if;
  return snapshot;
end;
$$;
revoke all on function app_private.fantasy_assert_scoring_snapshot(uuid,bigint,text) from public,anon,authenticated,service_role;

