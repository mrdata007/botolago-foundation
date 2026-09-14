-- A trusted worker reads a coherent, immutable football/rules snapshot and
-- commits bounded provisional team pages. Missing facts never mean zero.
create table app_private.fantasy_scoring_snapshots (
  gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete restrict,
  calculation_version bigint not null check (calculation_version > 0),
  input_digest text not null check (input_digest ~ '^[0-9a-f]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 16777216),
  players_persisted boolean not null default false,
  player_results_digest text check (player_results_digest ~ '^[0-9a-f]{64}$'),
  sealed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  primary key (gameweek_id, calculation_version)
);
alter table app_private.fantasy_scoring_snapshots enable row level security;
alter table app_private.fantasy_scoring_snapshots force row level security;
revoke all on app_private.fantasy_scoring_snapshots from public, anon, authenticated, service_role;

-- STABLE gives every component of this document the calling statement's MVCC
-- snapshot. Output deliberately excludes mutable scores/finalization fields
-- and audit observation timestamps. A provider refresh of identical canonical
-- facts may advance its stale-write watermark without invalidating a seal.
create function app_private.fantasy_scoring_input_document(p_gameweek_id uuid)
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
        'bonus',0,'playerOfMatchPoints',0)
    ) order by fp.id,f.id), '[]'::jsonb)
      from app.fantasy_players fp join app.fantasy_positions pos on pos.id=fp.position_id
      join app.fantasy_fixture_assignments a on a.gameweek_id=gw.id and a.superseded_at is null and a.counts_points
      join app.fixtures f on f.id=a.fixture_id and fp.football_team_id in (f.home_team_id,f.away_team_id)
      left join app.player_fixture_performances p on p.fixture_id=f.id and p.player_id=fp.football_player_id and p.active
      where fp.fantasy_season_id=fs.id),
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

create function app_private.fantasy_validate_scoring_document(p_document jsonb)
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
      or (f#>>'{coverage,excluded_incomplete_rows}')::integer is distinct from 0
      or coalesce((f#>>'{coverage,excluded_mapping_rows}')::integer,0)<>0
      or (f#>>'{coverage,starter_rows}')::integer is distinct from 22
      or (f#>>'{coverage,team_count}')::integer is distinct from 2
      or (f#>>'{coverage,performance_rows}')::integer is distinct from (f->>'activePerformanceCount')::integer
      or f#>>'{coverage,football_season_id}' is distinct from p_document->>'footballSeasonId'
      or exists (select 1 from app.player_fixture_performances p where p.fixture_id=(f->>'fixtureId')::uuid and p.active
        and (p.source_version is distinct from f#>>'{coverage,source_version}' or p.football_season_id::text<>p_document->>'footballSeasonId')) then
      raise exception using errcode='PT409',message='fantasy_scoring_coverage_incomplete';
    end if;
  end loop;
end;
$$;
revoke all on function app_private.fantasy_validate_scoring_document(jsonb) from public,anon,authenticated,service_role;

-- Lock fixture parents before rereading their facts. The provider writer takes
-- FOR UPDATE on the same fixture, preventing a correction between CAS and write.
create function app_private.fantasy_assert_scoring_snapshot(
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
  if encode(extensions.digest(current_document::text,'sha256'),'hex')<>snapshot.input_digest then
    raise exception using errcode='PT409',message='fantasy_scoring_input_changed';
  end if;
  return snapshot;
end;
$$;
revoke all on function app_private.fantasy_assert_scoring_snapshot(uuid,bigint,text) from public,anon,authenticated,service_role;

create function api.service_get_fantasy_scoring_snapshot(
 p_gameweek_id uuid,p_calculation_version bigint,p_after_team_id uuid default null,p_batch_size integer default 100
) returns jsonb language plpgsql security definer set search_path='' as $$
declare gw app.fantasy_gameweeks%rowtype; snapshot app_private.fantasy_scoring_snapshots%rowtype;
  doc jsonb; digest text; teams jsonb; last_id uuid;
begin
  if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
  if p_gameweek_id is null or p_calculation_version is null or p_calculation_version<1 or p_batch_size is null or p_batch_size not between 1 and 100 then
    raise exception using errcode='PT400',message='validation_failed'; end if;
  select * into gw from app.fantasy_gameweeks where id=p_gameweek_id for update;
  if not found then raise exception using errcode='PT404',message='fantasy_gameweek_not_found'; end if;
  if gw.status not in ('provisional','finalizing') then raise exception using errcode='PT409',message='gameweek_not_finalizable'; end if;
  if exists(select 1 from app.fantasy_lineups where gameweek_id=gw.id and locked_at is null) then
    raise exception using errcode='PT409',message='fantasy_lineup_not_locked'; end if;
  if exists(select 1 from app_private.fantasy_scoring_snapshots s where s.gameweek_id=gw.id and s.calculation_version>p_calculation_version) then
    raise exception using errcode='PT409',message='stale_update'; end if;
  select * into snapshot from app_private.fantasy_scoring_snapshots where gameweek_id=gw.id and calculation_version=p_calculation_version;
  if found then snapshot:=app_private.fantasy_assert_scoring_snapshot(gw.id,p_calculation_version,snapshot.input_digest);
  else
    if gw.status='finalizing' then raise exception using errcode='PT409',message='fantasy_scoring_snapshot_missing'; end if;
    doc:=app_private.fantasy_scoring_input_document(gw.id);
    perform app_private.fantasy_validate_scoring_document(doc);
    digest:=encode(extensions.digest(doc::text,'sha256'),'hex');
    insert into app_private.fantasy_scoring_snapshots(gameweek_id,calculation_version,input_digest,payload)
    values(gw.id,p_calculation_version,digest,doc) returning * into snapshot;
  end if;
  with page as (select * from app.fantasy_lineups where gameweek_id=gw.id
    and (p_after_team_id is null or fantasy_team_id>p_after_team_id) order by fantasy_team_id limit p_batch_size)
  select coalesce(jsonb_agg(jsonb_build_object('teamId',l.fantasy_team_id,'lineupId',l.id,
    'chipType',(select c.chip_type from app.fantasy_chip_uses c where c.gameweek_id=gw.id and c.fantasy_team_id=l.fantasy_team_id and c.cancelled_at is null),
    'transferHit',(select coalesce(sum(b.point_hit),0) from app.fantasy_transfer_batches b where b.gameweek_id=gw.id and b.fantasy_team_id=l.fantasy_team_id and b.status='confirmed'),
    'players',(select jsonb_agg(jsonb_build_object('id',lp.fantasy_player_id,'position',pos.code,
      'starter',lp.slot='starter','benchOrder',case when lp.slot='bench' then lp.slot_order else null end,
      'captain',lp.captain,'viceCaptain',lp.vice_captain) order by lp.slot,lp.slot_order)
      from app.fantasy_lineup_players lp join app.fantasy_players fp on fp.id=lp.fantasy_player_id
      join app.fantasy_positions pos on pos.id=fp.position_id where lp.lineup_id=l.id)
    ) order by l.fantasy_team_id),'[]'::jsonb), (array_agg(l.fantasy_team_id order by l.fantasy_team_id desc))[1]
    into teams,last_id from page l;
  return snapshot.payload || jsonb_build_object('schemaVersion',1,'calculationVersion',p_calculation_version,
    'inputDigest',snapshot.input_digest,'sealed',snapshot.sealed_at is not null,'teams',teams,
    'afterTeamId',last_id,'hasMore',exists(select 1 from app.fantasy_lineups where gameweek_id=gw.id and fantasy_team_id>last_id));
end;
$$;
revoke all on function api.service_get_fantasy_scoring_snapshot(uuid,bigint,uuid,integer) from public,anon,authenticated;
grant execute on function api.service_get_fantasy_scoring_snapshot(uuid,bigint,uuid,integer) to service_role;

create function api.service_persist_fantasy_scoring_results(
  p_gameweek_id uuid,p_calculation_version bigint,p_input_digest text,
  p_player_results jsonb,p_team_results jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare gw app.fantasy_gameweeks%rowtype; snapshot app_private.fantasy_scoring_snapshots%rowtype;
  input_row jsonb; result_row jsonb; event_row jsonb; team_result jsonb; substitution jsonb;
  player_count integer:=0; team_count integer:=0; lineup app.fantasy_lineups%rowtype;
  chip app.fantasy_chip_type; actual_hit integer; starting_points integer; bench_points integer;
  captain_points integer; actual_score integer; effective_captain uuid; captain_multiplier numeric;
  categories text[]:=array['appearance','goal','assist','clean_sheet','goals_conceded','saves','penalty_save','penalty_miss','yellow_card','red_card','second_yellow_dismissal','own_goal'];
begin
  if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
  if p_gameweek_id is null or p_calculation_version is null or p_calculation_version<1
    or p_input_digest is null or p_input_digest!~'^[0-9a-f]{64}$'
    or jsonb_typeof(p_player_results) is distinct from 'array'
    or jsonb_typeof(p_team_results) is distinct from 'array'
    or jsonb_array_length(p_player_results)>10000 or jsonb_array_length(p_team_results)>100
    or pg_column_size(p_player_results)>16777216 or pg_column_size(p_team_results)>1048576 then
    raise exception using errcode='PT400',message='validation_failed'; end if;
  select * into gw from app.fantasy_gameweeks where id=p_gameweek_id for update;
  if not found then raise exception using errcode='PT404',message='fantasy_gameweek_not_found'; end if;
  if gw.status<>'provisional' then raise exception using errcode='PT409',message='gameweek_not_scorable'; end if;
  snapshot:=app_private.fantasy_assert_scoring_snapshot(gw.id,p_calculation_version,p_input_digest);
  if snapshot.sealed_at is not null then raise exception using errcode='PT409',message='fantasy_scoring_sealed'; end if;

  if jsonb_array_length(p_player_results)=0 then
    if not snapshot.players_persisted then raise exception using errcode='PT409',message='fantasy_player_results_missing'; end if;
  else
    if snapshot.players_persisted and snapshot.player_results_digest is distinct from encode(extensions.digest(p_player_results::text,'sha256'),'hex') then
      raise exception using errcode='PT409',message='fantasy_scoring_replay_conflict'; end if;
    if jsonb_array_length(p_player_results)<>jsonb_array_length(snapshot.payload->'playerFixtures')
      or (select count(distinct (v->>'fantasyPlayerId',v->>'fixtureId')) from jsonb_array_elements(p_player_results) v)<>jsonb_array_length(p_player_results) then
      raise exception using errcode='PT400',message='fantasy_player_result_scope_invalid'; end if;
    for input_row in select value from jsonb_array_elements(snapshot.payload->'playerFixtures') loop
      select value into result_row from jsonb_array_elements(p_player_results)
      where value->>'fantasyPlayerId'=input_row->>'fantasyPlayerId' and value->>'fixtureId'=input_row->>'fixtureId';
      if not found or jsonb_typeof(result_row->'events') is distinct from 'array'
        or jsonb_array_length(result_row->'events')<>cardinality(categories)
        or (select count(distinct v->>'category') from jsonb_array_elements(result_row->'events') v)<>cardinality(categories) then
        raise exception using errcode='PT400',message='fantasy_player_result_scope_invalid'; end if;
      for event_row in select value from jsonb_array_elements(result_row->'events') loop
        if event_row->>'category' is null or not (event_row->>'category'=any(categories))
          or event_row->>'sourceKey' is distinct from ('fixture-stats:'||(input_row->>'fixtureId')||':'||(input_row->>'playerId')||':'||(event_row->>'category'))
          or jsonb_typeof(event_row->'points') is distinct from 'number'
          or (event_row->>'points')!~'^-?[0-9]+$' or (event_row->>'points')::integer not between -100 and 100 then
          raise exception using errcode='PT400',message='fantasy_point_event_invalid'; end if;
      end loop;
    end loop;
    -- Only aggregate snapshot categories are replaced. Independent official
    -- event keys remain outside this worker's namespace.
    update app.fantasy_player_point_events set superseded_at=statement_timestamp()
      where gameweek_id=gw.id and source_key like 'fixture-stats:%' and superseded_at is null;
    for input_row in select value from jsonb_array_elements(snapshot.payload->'playerFixtures') loop
      select value into result_row from jsonb_array_elements(p_player_results)
      where value->>'fantasyPlayerId'=input_row->>'fantasyPlayerId' and value->>'fixtureId'=input_row->>'fixtureId';
      for event_row in select value from jsonb_array_elements(result_row->'events') loop
        insert into app.fantasy_player_point_events(fantasy_player_id,gameweek_id,fixture_id,category,points,state,scoring_version,source_sequence,source_key)
        values((input_row->>'fantasyPlayerId')::uuid,gw.id,(input_row->>'fixtureId')::uuid,event_row->>'category',(event_row->>'points')::integer,
          'provisional',(snapshot.payload->>'scoringVersion')::integer,(input_row->>'sourceSequence')::bigint,event_row->>'sourceKey')
        on conflict(fantasy_player_id,fixture_id,source_key,scoring_version) do update set
          points=excluded.points,state='provisional',source_sequence=excluded.source_sequence,superseded_at=null;
      end loop;
    end loop;
    insert into app.fantasy_player_gameweek_points(fantasy_player_id,gameweek_id,provisional_points,minutes_played,did_play,calculation_version,football_input_version,final_points,finalized_at)
    select (player->>'fantasyPlayerId')::uuid,gw.id,
      coalesce((select sum(e.points) from app.fantasy_player_point_events e where e.gameweek_id=gw.id and e.fantasy_player_id=(player->>'fantasyPlayerId')::uuid and e.superseded_at is null),0),
      coalesce((select sum((f#>>'{stats,minutes}')::integer) from jsonb_array_elements(snapshot.payload->'playerFixtures') f where f->>'fantasyPlayerId'=player->>'fantasyPlayerId'),0),
      exists(select 1 from jsonb_array_elements(snapshot.payload->'playerFixtures') f where f->>'fantasyPlayerId'=player->>'fantasyPlayerId' and (f#>>'{stats,minutes}')::integer>0),
      p_calculation_version,coalesce((select max((f->>'sourceSequence')::bigint) from jsonb_array_elements(snapshot.payload->'playerFixtures') f where f->>'fantasyPlayerId'=player->>'fantasyPlayerId'),0),null,null
    from jsonb_array_elements(snapshot.payload->'players') player
    on conflict(fantasy_player_id,gameweek_id) do update set provisional_points=excluded.provisional_points,
      minutes_played=excluded.minutes_played,did_play=excluded.did_play,calculation_version=excluded.calculation_version,
      football_input_version=excluded.football_input_version,final_points=null,finalized_at=null;
    get diagnostics player_count=row_count;
    update app_private.fantasy_scoring_snapshots set players_persisted=true,player_results_digest=encode(extensions.digest(p_player_results::text,'sha256'),'hex') where gameweek_id=gw.id and calculation_version=p_calculation_version;
  end if;

  if (select count(distinct v->>'teamId') from jsonb_array_elements(p_team_results) v)<>jsonb_array_length(p_team_results) then
    raise exception using errcode='PT400',message='fantasy_team_result_scope_invalid'; end if;
  for team_result in select value from jsonb_array_elements(p_team_results) loop
    select * into lineup from app.fantasy_lineups l where l.id=(team_result->>'lineupId')::uuid
      and l.fantasy_team_id=(team_result->>'teamId')::uuid and l.gameweek_id=gw.id and l.locked_at is not null for update;
    if not found or jsonb_typeof(team_result->'players') is distinct from 'array'
      or jsonb_typeof(team_result->'substitutions') is distinct from 'array'
      or jsonb_array_length(team_result->'players')<>(snapshot.payload#>>'{ruleset,squad_size}')::integer
      or jsonb_array_length(team_result->'substitutions')>4
      or (select count(distinct v->>'fantasyPlayerId') from jsonb_array_elements(team_result->'players') v)<>jsonb_array_length(team_result->'players')
      or exists(select 1 from app.fantasy_lineup_players lp where lp.lineup_id=lineup.id and not exists(select 1 from jsonb_array_elements(team_result->'players') v where v->>'fantasyPlayerId'=lp.fantasy_player_id::text)) then
      raise exception using errcode='PT400',message='fantasy_team_result_scope_invalid'; end if;
    if exists(select 1 from app.fantasy_lineup_players lp left join app.fantasy_player_gameweek_points pp on pp.gameweek_id=gw.id and pp.fantasy_player_id=lp.fantasy_player_id
      where lp.lineup_id=lineup.id and pp.calculation_version is distinct from p_calculation_version) then
      raise exception using errcode='PT409',message='fantasy_player_results_missing'; end if;
    select c.chip_type into chip from app.fantasy_chip_uses c where c.fantasy_team_id=lineup.fantasy_team_id and c.gameweek_id=gw.id and c.cancelled_at is null;
    select coalesce(sum(b.point_hit),0) into actual_hit from app.fantasy_transfer_batches b where b.fantasy_team_id=lineup.fantasy_team_id and b.gameweek_id=gw.id and b.status='confirmed';
    select lp.fantasy_player_id into effective_captain from app.fantasy_lineup_players lp join app.fantasy_player_gameweek_points pp on pp.fantasy_player_id=lp.fantasy_player_id and pp.gameweek_id=gw.id
      where lp.lineup_id=lineup.id and (lp.captain or lp.vice_captain) and pp.did_play order by lp.captain desc limit 1;
    if team_result->>'effectiveCaptainId' is distinct from effective_captain::text then
      raise exception using errcode='PT400',message='fantasy_captain_result_invalid'; end if;
    captain_multiplier:=case when chip='triple_captain' then (snapshot.payload#>>'{ruleset,triple_captain_multiplier}')::numeric else (snapshot.payload#>>'{ruleset,captain_multiplier}')::numeric end;
    if (chip='bench_boost' and jsonb_array_length(team_result->'substitutions')<>0)
      or (select count(distinct v->>'playerOutId') from jsonb_array_elements(team_result->'substitutions') v)<>jsonb_array_length(team_result->'substitutions')
      or (select count(distinct v->>'playerInId') from jsonb_array_elements(team_result->'substitutions') v)<>jsonb_array_length(team_result->'substitutions') then
      raise exception using errcode='PT400',message='fantasy_substitution_invalid'; end if;
    for substitution in select value from jsonb_array_elements(team_result->'substitutions') loop
      if not exists(select 1 from app.fantasy_lineup_players outgoing
        join app.fantasy_player_gameweek_points po on po.fantasy_player_id=outgoing.fantasy_player_id and po.gameweek_id=gw.id
        join app.fantasy_players fo on fo.id=outgoing.fantasy_player_id join app.fantasy_positions opo on opo.id=fo.position_id
        cross join app.fantasy_lineup_players incoming
        join app.fantasy_player_gameweek_points pi on pi.fantasy_player_id=incoming.fantasy_player_id and pi.gameweek_id=gw.id
        join app.fantasy_players fi on fi.id=incoming.fantasy_player_id join app.fantasy_positions ip on ip.id=fi.position_id
        where outgoing.lineup_id=lineup.id and incoming.lineup_id=lineup.id
          and outgoing.fantasy_player_id::text=substitution->>'playerOutId' and incoming.fantasy_player_id::text=substitution->>'playerInId'
          and outgoing.slot='starter' and incoming.slot='bench' and not po.did_play and pi.did_play
          and ((opo.code='GK')=(ip.code='GK'))
          and substitution->>'reason'=case when opo.code='GK' then 'goalkeeper_did_not_play' else 'outfield_did_not_play' end) then
        raise exception using errcode='PT400',message='fantasy_substitution_invalid'; end if;
    end loop;
    if chip is distinct from 'bench_boost' and exists(
      select 1 from jsonb_array_elements(snapshot.payload->'positionRules') rule
      cross join lateral (select count(*) as n from app.fantasy_lineup_players lp
        join app.fantasy_players fp on fp.id=lp.fantasy_player_id
        join app.fantasy_positions pos on pos.id=fp.position_id
        where lp.lineup_id=lineup.id and pos.code=rule->>'code' and (
          (lp.slot='starter' and not exists(select 1 from jsonb_array_elements(team_result->'substitutions') s where s->>'playerOutId'=lp.fantasy_player_id::text))
          or exists(select 1 from jsonb_array_elements(team_result->'substitutions') s where s->>'playerInId'=lp.fantasy_player_id::text))) formation
      where formation.n<(rule->>'starting_minimum')::integer or formation.n>(rule->>'starting_maximum')::integer) then
      raise exception using errcode='PT400',message='fantasy_substitution_formation_invalid'; end if;
    -- Every multiplier is derived from frozen membership, substitution and the
    -- authoritative effective captain. Submitted totals are checked, not trusted.
    if exists(select 1 from jsonb_array_elements(team_result->'players') v
      left join app.fantasy_lineup_players lp on lp.lineup_id=lineup.id and lp.fantasy_player_id::text=v->>'fantasyPlayerId'
      where lp.fantasy_player_id is null or jsonb_typeof(v->'multiplier') is distinct from 'number'
        or (v->>'multiplier')::numeric is distinct from case
          when chip='bench_boost' or (lp.slot='starter' and not exists(select 1 from jsonb_array_elements(team_result->'substitutions') s where s->>'playerOutId'=lp.fantasy_player_id::text))
            or exists(select 1 from jsonb_array_elements(team_result->'substitutions') s where s->>'playerInId'=lp.fantasy_player_id::text)
          then case when lp.fantasy_player_id=effective_captain then captain_multiplier else 1 end else 0 end) then
      raise exception using errcode='PT400',message='fantasy_multiplier_invalid'; end if;
    select coalesce(sum(pp.provisional_points) filter(where
      (lp.slot='starter' and not exists(select 1 from jsonb_array_elements(team_result->'substitutions') s where s->>'playerOutId'=lp.fantasy_player_id::text))
      or exists(select 1 from jsonb_array_elements(team_result->'substitutions') s where s->>'playerInId'=lp.fantasy_player_id::text)),0),
      coalesce(sum(pp.provisional_points) filter(where lp.slot='bench' and not exists(select 1 from jsonb_array_elements(team_result->'substitutions') s where s->>'playerInId'=lp.fantasy_player_id::text)),0),
      coalesce(sum(pp.provisional_points*(captain_multiplier-1)) filter(where lp.fantasy_player_id=effective_captain),0)
      into starting_points,bench_points,captain_points
      from app.fantasy_lineup_players lp join app.fantasy_player_gameweek_points pp on pp.fantasy_player_id=lp.fantasy_player_id and pp.gameweek_id=gw.id where lp.lineup_id=lineup.id;
    actual_score:=starting_points+case when chip='bench_boost' then bench_points else 0 end+captain_points-actual_hit;
    if (team_result->>'startingPoints')::integer is distinct from starting_points
      or (team_result->>'benchPoints')::integer is distinct from bench_points
      or (team_result->>'captainPoints')::integer is distinct from captain_points
      or (team_result->>'transferHit')::integer is distinct from actual_hit
      or (team_result->>'provisionalScore')::integer is distinct from actual_score then
      raise exception using errcode='PT400',message='fantasy_team_total_invalid'; end if;
    delete from app.fantasy_auto_substitutions where lineup_id=lineup.id;
    insert into app.fantasy_auto_substitutions(lineup_id,player_out_id,player_in_id,sequence_number,reason,calculation_version)
      select lineup.id,(s->>'playerOutId')::uuid,(s->>'playerInId')::uuid,ordinality::integer,s->>'reason',p_calculation_version
      from jsonb_array_elements(team_result->'substitutions') with ordinality as substitutions(s,ordinality);
    insert into app.fantasy_team_gameweek_results(fantasy_team_id,gameweek_id,starting_points,bench_points,captain_points,transfer_hit,chip_type,provisional_score,calculation_version)
      values(lineup.fantasy_team_id,gw.id,starting_points,bench_points,captain_points,actual_hit,chip,actual_score,p_calculation_version)
      on conflict(fantasy_team_id,gameweek_id) do update set starting_points=excluded.starting_points,bench_points=excluded.bench_points,
        captain_points=excluded.captain_points,transfer_hit=excluded.transfer_hit,chip_type=excluded.chip_type,
        provisional_score=excluded.provisional_score,calculation_version=excluded.calculation_version
      where app.fantasy_team_gameweek_results.state='provisional';
    if not found then raise exception using errcode='PT409',message='fantasy_scoring_sealed'; end if;
    team_count:=team_count+1;
  end loop;
  return jsonb_build_object('playersPersisted',player_count,'teamsPersisted',team_count,'inputDigest',snapshot.input_digest,'calculationVersion',p_calculation_version);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode='PT400',message='validation_failed';
end;
$$;
revoke all on function api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb) to service_role;

create function api.service_begin_fantasy_finalization(p_gameweek_id uuid,p_calculation_version bigint,p_input_digest text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare gw app.fantasy_gameweeks%rowtype; snapshot app_private.fantasy_scoring_snapshots%rowtype;
begin
  if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
  if p_gameweek_id is null or p_calculation_version is null or p_calculation_version<1 or p_input_digest is null then
    raise exception using errcode='PT400',message='validation_failed'; end if;
  select * into gw from app.fantasy_gameweeks where id=p_gameweek_id for update;
  if not found then raise exception using errcode='PT404',message='fantasy_gameweek_not_found'; end if;
  if gw.status not in ('provisional','finalizing') then raise exception using errcode='PT409',message='gameweek_not_finalizable'; end if;
  snapshot:=app_private.fantasy_assert_scoring_snapshot(gw.id,p_calculation_version,p_input_digest);
  if not snapshot.players_persisted
    or exists(select 1 from jsonb_array_elements(snapshot.payload->'players') player
      left join app.fantasy_player_gameweek_points pp on pp.gameweek_id=gw.id and pp.fantasy_player_id::text=player->>'fantasyPlayerId'
      where pp.calculation_version is distinct from p_calculation_version)
    or exists(select 1 from app.fantasy_lineups l left join app.fantasy_team_gameweek_results r
      on r.gameweek_id=l.gameweek_id and r.fantasy_team_id=l.fantasy_team_id
      where l.gameweek_id=gw.id and (l.locked_at is null or r.calculation_version is distinct from p_calculation_version))
    or exists(select 1 from app.fantasy_team_gameweek_results r where r.gameweek_id=gw.id
      and (r.calculation_version<>p_calculation_version or not exists(select 1 from app.fantasy_lineups l where l.gameweek_id=gw.id and l.fantasy_team_id=r.fantasy_team_id))) then
    raise exception using errcode='PT409',message='fantasy_scoring_results_incomplete'; end if;
  update app_private.fantasy_scoring_snapshots set sealed_at=coalesce(sealed_at,statement_timestamp()) where gameweek_id=gw.id and calculation_version=p_calculation_version;
  update app.fantasy_gameweeks set status='finalizing' where id=gw.id and status='provisional';
  return jsonb_build_object('sealed',true,'stableResult',snapshot.sealed_at is not null,'calculationVersion',p_calculation_version,'inputDigest',snapshot.input_digest);
end;
$$;
revoke all on function api.service_begin_fantasy_finalization(uuid,bigint,text) from public,anon,authenticated;
grant execute on function api.service_begin_fantasy_finalization(uuid,bigint,text) to service_role;

create function api.service_fantasy_scoring_league_page(p_gameweek_id uuid,p_after_league_id uuid default null,p_batch_size integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare season_id uuid; ids jsonb; last_id uuid;
begin
  if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
  if p_gameweek_id is null or p_batch_size is null or p_batch_size not between 1 and 100 then raise exception using errcode='PT400',message='validation_failed'; end if;
  select fantasy_season_id into season_id from app.fantasy_gameweeks where id=p_gameweek_id;
  if not found then raise exception using errcode='PT404',message='fantasy_gameweek_not_found'; end if;
  select coalesce(jsonb_agg(id order by id),'[]'::jsonb),(array_agg(id order by id desc))[1] into ids,last_id
    from (select id from app.fantasy_leagues where fantasy_season_id=season_id and active and (p_after_league_id is null or id>p_after_league_id) order by id limit p_batch_size) page;
  return jsonb_build_object('leagueIds',ids,'afterLeagueId',last_id,'hasMore',exists(select 1 from app.fantasy_leagues where fantasy_season_id=season_id and active and id>last_id));
end;
$$;
revoke all on function api.service_fantasy_scoring_league_page(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function api.service_fantasy_scoring_league_page(uuid,uuid,integer) to service_role;
