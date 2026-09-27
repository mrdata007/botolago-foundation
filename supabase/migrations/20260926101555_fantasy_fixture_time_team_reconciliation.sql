-- A transfer after a fixture must not move its goals to the new club at
-- scoring time. Keep a played match in the scoring document even if the
-- player has since moved outside both participating clubs.

create or replace function app_private.fantasy_scoring_input_document(p_gameweek_id uuid)
returns jsonb language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  select jsonb_build_object(
    'gameweekId', gw.id, 'seasonId', fs.id, 'footballSeasonId', fs.football_season_id,
    'scoringVersion', rules.version, 'ruleset', to_jsonb(rules) - 'created_at' - 'updated_at',
    'features', (select to_jsonb(features) - 'created_at' - 'updated_at' from app.fantasy_ruleset_features features where features.ruleset_id = rules.id),
    'positionRules', (select jsonb_agg(jsonb_build_object(
      'code', pos.code, 'squad_quota', pr.squad_quota,
      'starting_minimum', pr.starting_minimum, 'starting_maximum', pr.starting_maximum,
      'goal_points', pr.goal_points, 'clean_sheet_points', pr.clean_sheet_points
    ) order by pos.code) from app.fantasy_position_rules pr join app.fantasy_positions pos on pos.id = pr.position_id where pr.ruleset_id = rules.id),
    'scoringRules', (select jsonb_agg(jsonb_build_object('category', sr.category,
      'points', sr.points, 'threshold', sr.threshold, 'positionCode', pos.code)
      order by sr.category, pos.code, sr.threshold)
      from app.fantasy_scoring_rules sr left join app.fantasy_positions pos on pos.id = sr.position_id
      where sr.ruleset_id = rules.id and sr.active),
    'fixtures', (select coalesce(jsonb_agg(jsonb_build_object(
      'fixtureId', f.id, 'seasonId', f.season_id, 'status', f.status,
      'finalizedAt', f.finalized_at, 'sourceSequence', f.source_sequence,
      'sourceVersion', f.source_version, 'homeTeamId', f.home_team_id, 'awayTeamId', f.away_team_id,
      'homeScore', f.home_score, 'awayScore', f.away_score,
      'assignment', to_jsonb(a) - 'updated_at' - 'created_at',
      'coverage', to_jsonb(c) - 'updated_at' - 'created_at' - 'provider_observed_at',
      'activePerformanceCount', (select count(*) from app.player_fixture_performances p where p.fixture_id=f.id and p.active),
      'performanceDigest', (select encode(extensions.digest(coalesce(string_agg((to_jsonb(p) - 'created_at' - 'updated_at' - 'provider_observed_at')::text, ',' order by p.player_id), ''), 'sha256'),'hex') from app.player_fixture_performances p where p.fixture_id=f.id and p.active)
    ) order by f.id), '[]'::jsonb)
      from app.fantasy_fixture_assignments a join app.fixtures f on f.id=a.fixture_id
      left join app_private.historical_performance_fixture_coverage c on c.fixture_id=f.id
      where a.gameweek_id=gw.id and a.superseded_at is null),
    'players', (select coalesce(jsonb_agg(jsonb_build_object('fantasyPlayerId', fp.id,
      'playerId', fp.football_player_id, 'teamId',fp.football_team_id,'position', pos.code)
      order by fp.id), '[]'::jsonb) from app.fantasy_players fp join app.fantasy_positions pos on pos.id=fp.position_id where fp.fantasy_season_id=fs.id),
    'playerFixtures', (select coalesce(jsonb_agg(jsonb_build_object(
      'fantasyPlayerId', fp.id, 'playerId', fp.football_player_id, 'fixtureId', f.id,
      'position', pos.code, 'sourceSequence', f.source_sequence,
      'statisticsComplete',p.id is null or pos.code<>'GK' or (p.saves is not null and p.penalties_saved is not null),
      'stats', jsonb_build_object('minutes',coalesce(p.minutes,0), 'goals',coalesce(p.goals,0),
        'assists',coalesce(p.assists,0), 'cleanSheet',coalesce(p.clean_sheets>0,false),
        'goalsConceded',coalesce(p.goals_conceded,0), 'saves',coalesce(p.saves,0),
        'penaltiesSaved',coalesce(p.penalties_saved,0),'penaltiesMissed',coalesce(p.penalties_missed,0),
        'yellowCards',coalesce(p.yellow_cards,0),'redCards',coalesce(p.red_cards,0),
        'secondYellowDismissals',coalesce(p.second_yellow_dismissals,0),'ownGoals',coalesce(p.own_goals,0),
        'bonus',0,'playerOfMatchPoints',0))
      -- Keep unchanged scoring documents (and in-flight snapshot digests)
      -- byte-for-byte compatible. Record the fixture club only when a later
      -- transfer made the fantasy player's current club misleading.
      || case when p.id is not null and p.team_id is distinct from fp.football_team_id
        then jsonb_build_object('fixtureTeamId', p.team_id) else '{}'::jsonb end
    order by fp.id,f.id), '[]'::jsonb)
      from app.fantasy_players fp join app.fantasy_positions pos on pos.id=fp.position_id
      join app.fantasy_fixture_assignments a on a.gameweek_id=gw.id and a.superseded_at is null and a.counts_points
      join app.fixtures f on f.id=a.fixture_id
      left join app.player_fixture_performances p on p.fixture_id=f.id and p.player_id=fp.football_player_id and p.active
      where fp.fantasy_season_id=fs.id
        and (fp.football_team_id in (f.home_team_id,f.away_team_id) or p.id is not null)),
    'lineupCount',(select count(*) from app.fantasy_lineups l where l.gameweek_id=gw.id),
    'lineupsDigest',(select encode(extensions.digest(coalesce(string_agg(jsonb_build_object(
      'lineupId',l.id,'teamId',l.fantasy_team_id,'teamVersion',l.team_version,'lockedAt',l.locked_at,
      'players',(select jsonb_agg(to_jsonb(lp)-'created_at'-'updated_at' order by lp.fantasy_player_id) from app.fantasy_lineup_players lp where lp.lineup_id=l.id),
      'chip',(select jsonb_build_object('id',c.id,'chip_type',c.chip_type) from app.fantasy_chip_uses c where c.gameweek_id=gw.id and c.fantasy_team_id=l.fantasy_team_id and c.cancelled_at is null),
      'hit',(select coalesce(sum(b.point_hit),0) from app.fantasy_transfer_batches b where b.gameweek_id=gw.id and b.fantasy_team_id=l.fantasy_team_id and b.status='confirmed')
      )::text, ',' order by l.fantasy_team_id),''),'sha256'),'hex') from app.fantasy_lineups l where l.gameweek_id=gw.id)
  ) from app.fantasy_gameweeks gw join app.fantasy_seasons fs on fs.id=gw.fantasy_season_id
  join app.fantasy_rulesets rules on rules.id=fs.ruleset_id where gw.id=p_gameweek_id;
$$;
revoke all on function app_private.fantasy_scoring_input_document(uuid) from public,anon,authenticated,service_role;

create or replace function app_private.fantasy_goal_reconciliation(p_document jsonb)
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
        and (coalesce(performance->>'fixtureTeamId',
          player_teams->>(performance->>'fantasyPlayerId')) is null
          or jsonb_typeof(performance#>'{stats,goals}') is distinct from 'number'
          or jsonb_typeof(performance#>'{stats,ownGoals}') is distinct from 'number')
    ) then
      result := result || jsonb_build_array(jsonb_build_object(
        'fixtureId', fixture->>'fixtureId', 'reason', 'player_statistics_missing'));
      continue;
    end if;
    select
      coalesce(sum(case when coalesce(performance->>'fixtureTeamId',
        player_teams->>(performance->>'fantasyPlayerId')) = fixture->>'homeTeamId'
        then (performance#>>'{stats,goals}')::bigint else 0 end), 0)
      + coalesce(sum(case when coalesce(performance->>'fixtureTeamId',
        player_teams->>(performance->>'fantasyPlayerId')) = fixture->>'awayTeamId'
        then (performance#>>'{stats,ownGoals}')::bigint else 0 end), 0),
      coalesce(sum(case when coalesce(performance->>'fixtureTeamId',
        player_teams->>(performance->>'fantasyPlayerId')) = fixture->>'awayTeamId'
        then (performance#>>'{stats,goals}')::bigint else 0 end), 0)
      + coalesce(sum(case when coalesce(performance->>'fixtureTeamId',
        player_teams->>(performance->>'fantasyPlayerId')) = fixture->>'homeTeamId'
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

-- A pre-existing provisional/finalizing snapshot must remain usable. If
-- fixture-time attribution really changes its input, abort the whole migration
-- instead of stranding finalization behind a changed digest. The operator can
-- complete/recover that gameweek first and then retry this migration.
do $$
declare affected record;
begin
  select s.gameweek_id, s.calculation_version into affected
  from app_private.fantasy_scoring_snapshots s
  join app.fantasy_gameweeks gw on gw.id=s.gameweek_id
  where gw.status in ('provisional','finalizing')
    and encode(extensions.digest(
      app_private.fantasy_scoring_input_document(s.gameweek_id)::text,'sha256'),'hex')
      is distinct from s.input_digest
  limit 1;
  if found then
    raise exception 'fantasy_scoring_snapshot_migration_blocked: gameweek %, version %',
      affected.gameweek_id, affected.calculation_version;
  end if;
end;
$$;
