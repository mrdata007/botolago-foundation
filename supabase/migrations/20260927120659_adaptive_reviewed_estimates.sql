-- Owner-approved best-available simple scoring. Opt-in v2.1; existing policies and history stay intact.


do $$
declare old_id uuid := 'f6200000-0000-4000-8000-000000000200';
 new_id uuid := 'f6200000-0000-4000-8000-000000000201'; tbl text; cols text;
begin
 insert into app.fantasy_rulesets select (jsonb_populate_record(null::app.fantasy_rulesets,
  to_jsonb(r)||jsonb_build_object('id',new_id,'version',2,'minor_version',1,
   'ruleset_code','botolago-fantasy-v2.1','name','BotolaGO Adaptive Fantasy v2.1',
   'effective_from',statement_timestamp(),'published_at',statement_timestamp()))).*
 from app.fantasy_rulesets r where r.id=old_id;
 foreach tbl in array array['fantasy_position_rules','fantasy_scoring_rules','fantasy_ruleset_features',
  'fantasy_deadline_rules','fantasy_chip_rules','fantasy_price_rules','fantasy_ranking_tiebreak_rules','fantasy_fixture_rules','fantasy_fixture_difficulty_rules'] loop
  select string_agg(quote_ident(column_name),',' order by ordinal_position) into cols
   from information_schema.columns where table_schema='app' and table_name=tbl and column_name<>'id';
  execute format('insert into app.%I (%s) select %s from jsonb_populate_recordset(null::app.%I,
    (select jsonb_agg(to_jsonb(t)||jsonb_build_object(''ruleset_id'',$1)) from app.%I t where ruleset_id=$2))',tbl,cols,cols,tbl,tbl)
   using new_id,old_id;
 end loop;
end $$;


create function app_private.fantasy_observation_estimated(p_payload jsonb)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_array_length(p_payload->'estimatedNonParticipants'),0)>0 or exists(
 select 1 from jsonb_array_elements(coalesce(p_payload->'players','[]')) p,
 lateral jsonb_each(coalesce(p->'evidence','{}')) e where e.value->>'state'='estimated');
$$;
revoke all on function app_private.fantasy_observation_estimated(jsonb) from public,anon,authenticated,service_role;

-- "Scorable" deliberately differs from "certified". Only accepted simple
-- evidence can use this branch; full scoring still requires verified facts.
create function app_private.fantasy_field_scorable(p_row jsonb,p_field text)
returns boolean language plpgsql stable set search_path='' as $$
declare e jsonb:=p_row#>array['evidence',p_field]; adjusted jsonb;
begin
 if app_private.fantasy_field_certified(p_row,p_field) then return true; end if;
 if p_field not in ('minutes','goals','cleanSheet','goalsConceded','yellowCards','redCards','secondYellowDismissals','ownGoals')
 or e->>'state' is distinct from 'estimated' or e->>'source' is distinct from 'reviewed-best-available'
 or length(btrim(coalesce(e->>'reason',''))) not between 8 and 500 then return false; end if;
 -- Reuse numeric/provenance validation without mutating the stored evidence.
 adjusted:=jsonb_set(p_row,array['evidence',p_field,'state'],'"derived"');
 return app_private.fantasy_field_certified(adjusted,p_field);
end $$;
revoke all on function app_private.fantasy_field_scorable(jsonb,text) from public,anon,authenticated,service_role;


create or replace function api.service_record_fantasy_observation(p_fixture_id uuid,p_payload jsonb,p_source text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f app.fixtures%rowtype; r jsonb; field text; rows jsonb:=p_payload->'players';
 core boolean:=true; full_stats boolean:=true; row_core boolean; position text; d text; existing bigint;
 home_goals integer; away_goals integer; anon_count integer; team uuid; n integer;
begin
 if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
 if p_source not in ('sportsmonks','reviewed-correction') or p_source is null
 or jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>2097152
 or jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) not between 18 and 100
 or jsonb_typeof(p_payload->'references') is distinct from 'array' or jsonb_array_length(p_payload->'references')=0 then
 raise exception using errcode='PT400',message='adaptive_payload_invalid'; end if;
 perform g.id from app.fantasy_gameweeks g join app.fantasy_fixture_assignments a on a.gameweek_id=g.id
 where a.fixture_id=p_fixture_id and a.superseded_at is null order by g.id for update of g;
 select * into f from app.fixtures where id=p_fixture_id for update;
 if not found or f.status<>'finished' or f.finalized_at is null then
 raise exception using errcode='PT409',message='adaptive_fixture_not_finished'; end if;
 if not exists(select 1 from app.fantasy_fixture_assignments a where a.fixture_id=f.id and a.superseded_at is null
 and app_private.fantasy_adaptive_enabled(a.gameweek_id)) then
 raise exception using errcode='PT409',message='adaptive_policy_not_enabled'; end if;
 if exists(select 1 from app.fantasy_fixture_assignments a join app.fantasy_gameweeks g on g.id=a.gameweek_id
 where a.fixture_id=f.id and a.superseded_at is null and g.status in ('finalizing','finalized','corrected')) then
 raise exception using errcode='PT409',message='adaptive_reviewed_correction_required'; end if;
 if exists(select 1 from app_private.fantasy_scoring_snapshots s join app.fantasy_fixture_assignments a on a.gameweek_id=s.gameweek_id
 where a.fixture_id=f.id and a.superseded_at is null and s.sealed_at is not null) then
 raise exception using errcode='PT409',message='fantasy_scoring_sealed'; end if;

 if app_private.fantasy_observation_estimated(p_payload) then
 if p_source<>'reviewed-correction' or p_payload#>>'{estimateAcceptance,policy}' is distinct from 'best-available-v1'
 or p_payload#>'{estimateAcceptance,finalForRankings}' is distinct from 'true'::jsonb
 or jsonb_typeof(p_payload#>'{estimateAcceptance,assumptions}') is distinct from 'array'
 or jsonb_array_length(p_payload#>'{estimateAcceptance,assumptions}')=0
 or exists(select 1 from jsonb_array_elements(p_payload#>'{estimateAcceptance,assumptions}') a where jsonb_typeof(a)<>'string' or length(btrim(a#>>'{}'))<3)
 then raise exception using errcode='PT400',message='adaptive_estimate_acceptance_required'; end if;
 if exists(select 1 from app.fantasy_fixture_assignments a join app.fantasy_gameweeks g on g.id=a.gameweek_id
 left join app_private.fantasy_adaptive_policy policy on policy.season_id=g.fantasy_season_id
 where a.fixture_id=f.id and a.superseded_at is null and a.counts_points
 and (policy.ruleset_id is distinct from 'f6200000-0000-4000-8000-000000000201'::uuid or g.sequence_number<policy.from_gameweek)) then
 raise exception using errcode='PT409',message='adaptive_estimates_policy_required'; end if;
 if exists(select 1 from app_private.fantasy_fixture_scoring_modes where fixture_id=f.id and mode='full') then
 raise exception using errcode='PT409',message='adaptive_estimates_simple_only'; end if;
 if exists(select 1 from jsonb_array_elements(rows) player,lateral jsonb_each(coalesce(player->'evidence','{}')) e
 where e.value->>'state'='estimated' and not app_private.fantasy_field_scorable(player,e.key)) then
 raise exception using errcode='PT400',message='adaptive_estimate_evidence_invalid'; end if;
 end if;
 if jsonb_typeof(coalesce(p_payload->'estimatedNonParticipants','[]')) is distinct from 'array'
 or jsonb_typeof(coalesce(p_payload->'verifiedNonParticipants','[]')) is distinct from 'array' then
 raise exception using errcode='PT400',message='adaptive_payload_invalid'; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_payload->'estimatedNonParticipants','[]')||coalesce(p_payload->'verifiedNonParticipants','[]')) absent
 where jsonb_typeof(absent)<>'string' or exists(select 1 from jsonb_array_elements(rows) player where player->>'playerId'=absent#>>'{}')
 or not exists(select 1 from app.team_memberships membership where membership.player_id=(absent#>>'{}')::uuid
 and membership.team_id in(f.home_team_id,f.away_team_id) and membership.season_id=f.season_id
 and membership.valid_from<=f.kickoff_at::date and (membership.valid_to is null or membership.valid_to>=f.kickoff_at::date)))
 or (select count(*)<>count(distinct absent) from jsonb_array_elements(coalesce(p_payload->'estimatedNonParticipants','[]')||coalesce(p_payload->'verifiedNonParticipants','[]')) absent) then
 raise exception using errcode='PT400',message='adaptive_conflicting_participation'; end if;
 if p_source='sportsmonks' then
 select id into existing from app_private.fantasy_fixture_observations where fixture_id=f.id and source='reviewed-correction' order by observed_at desc,id desc limit 1;
 if existing is not null then return (select jsonb_build_object('observationId',id,'digest',digest,'fullReady',full_ready,'simpleReady',simple_ready,'reviewedOverride',true) from app_private.fantasy_fixture_observations where id=existing); end if;
 end if;
 if (p_payload->>'homeScore')::integer is distinct from f.home_score or
 (p_payload->>'awayScore')::integer is distinct from f.away_score then
 raise exception using errcode='PT409',message='adaptive_final_score_mismatch'; end if;
 anon_count:=coalesce((p_payload->>'anonymousStarters')::integer,0);
 if anon_count not between 0 and 4 or (select count(distinct v->>'playerId') from jsonb_array_elements(rows) v)<>jsonb_array_length(rows) then
 raise exception using errcode='PT400',message='adaptive_lineup_invalid'; end if;
 foreach team in array array[f.home_team_id,f.away_team_id] loop
 select count(*) into n from jsonb_array_elements(rows) v where (v->>'teamId')::uuid=team and (v->>'started')::boolean;
 if n+coalesce((p_payload#>>array['anonymousByTeam',team::text])::integer,0)<>11 then
 raise exception using errcode='PT400',message='adaptive_starters_incomplete'; end if;
 end loop;
 if (select count(*) from jsonb_array_elements(rows) v where (v->>'started')::boolean)+anon_count<>22 then
 raise exception using errcode='PT400',message='adaptive_starters_incomplete'; end if;
 for r in select value from jsonb_array_elements(rows) loop
 if not exists(select 1 from app.team_memberships m where m.player_id=(r->>'playerId')::uuid
 and m.team_id=(r->>'teamId')::uuid and m.season_id=f.season_id and m.team_id in(f.home_team_id,f.away_team_id)
 and m.valid_from<=f.kickoff_at::date and (m.valid_to is null or m.valid_to>=f.kickoff_at::date)) then
 raise exception using errcode='PT409',message='adaptive_player_membership_missing'; end if;
 select p.position::text into position from app.players p where p.id=(r->>'playerId')::uuid;
 row_core:=true;
 foreach field in array array['minutes','goals','cleanSheet','goalsConceded','yellowCards','redCards','secondYellowDismissals','ownGoals'] loop
 row_core:=row_core and app_private.fantasy_field_scorable(r,field);
 end loop;
 if row_core and ((r#>>'{stats,minutes}')::integer>90 or
 (r#>>'{stats,cleanSheet}')::boolean is distinct from ((r#>>'{stats,minutes}')::integer>=60 and (r#>>'{stats,goalsConceded}')::integer=0)
 or ((r->>'started')::boolean and (r#>>'{stats,minutes}')::integer=0)
 or (r#>>'{stats,goalsConceded}')::integer>case when (r->>'teamId')::uuid=f.home_team_id then f.away_score else f.home_score end) then
 raise exception using errcode='PT400',message='adaptive_statistics_inconsistent'; end if;
 if row_core and (r#>>'{stats,minutes}')::integer=0 and ((r#>>'{stats,goals}')::integer>0 or (r#>>'{stats,ownGoals}')::integer>0) then
 raise exception using errcode='PT400',message='adaptive_statistics_inconsistent'; end if;
 if coalesce((r#>>'{stats,secondYellowDismissals}')::integer,0)>0
 and (coalesce((r#>>'{stats,yellowCards}')::integer,0)>0 or coalesce((r#>>'{stats,redCards}')::integer,0)>0) then
 raise exception using errcode='PT409',message='adaptive_disciplinary_overlap_review_required'; end if;
 core:=core and row_core;
 full_stats:=full_stats and row_core and not exists(select 1 from unnest(array['minutes','goals','goalsConceded','yellowCards','redCards','secondYellowDismissals','ownGoals']) required_field where r#>>array['evidence',required_field,'state'] is distinct from 'verified');
 foreach field in array array['assists','penaltiesMissed','saves','penaltiesSaved'] loop
 if position='goalkeeper' or exists(select 1 from app.fantasy_players fp join app.fantasy_positions pos on pos.id=fp.position_id where fp.football_player_id=(r->>'playerId')::uuid and pos.code='GK') or field not in('saves','penaltiesSaved') then
 full_stats:=full_stats and app_private.fantasy_field_certified(r,field) and r#>>array['evidence',field,'state']='verified';
 end if;
 end loop;
 end loop;
 core:=core and coalesce((p_payload->>'disciplineComplete')::boolean,false)
 and coalesce((p_payload->>'participationComplete')::boolean,false);
 -- Unidentified rows cannot certify nonappearance for an unmatched fantasy player.
 if exists(select 1 from app.fantasy_players fp join app.fantasy_lineup_players lp on lp.fantasy_player_id=fp.id
 join app.fantasy_lineups l on l.id=lp.lineup_id join app.fantasy_fixture_assignments a on a.gameweek_id=l.gameweek_id
 where a.fixture_id=f.id and a.superseded_at is null and fp.football_team_id in(f.home_team_id,f.away_team_id)
 and not exists(select 1 from jsonb_array_elements(rows) entry where entry->>'playerId'=fp.football_player_id::text)
 and not coalesce((coalesce(p_payload->'verifiedNonParticipants','[]')||coalesce(p_payload->'estimatedNonParticipants','[]')) ? fp.football_player_id::text,false)) then core:=false; end if;
 select coalesce(sum(case when (entry->>'teamId')::uuid=f.home_team_id then (entry#>>'{stats,goals}')::integer else (entry#>>'{stats,ownGoals}')::integer end),0),
 coalesce(sum(case when (entry->>'teamId')::uuid=f.away_team_id then (entry#>>'{stats,goals}')::integer else (entry#>>'{stats,ownGoals}')::integer end),0)
 into home_goals,away_goals from jsonb_array_elements(rows) entry;
 core:=core and home_goals=f.home_score and away_goals=f.away_score;
 full_stats:=coalesce(full_stats and core and not app_private.fantasy_observation_estimated(p_payload),false); core:=coalesce(core,false);
 d:=encode(extensions.digest((p_payload||jsonb_build_object('players',(select jsonb_agg(entry||jsonb_build_object('evidence',(select coalesce(jsonb_object_agg(key,value-'observedAt'),'{}') from jsonb_each(entry->'evidence'))) order by entry->>'playerId') from jsonb_array_elements(rows) entry)))::text,'sha256'),'hex');
 select id into existing from app_private.fantasy_fixture_observations where fixture_id=f.id and digest=d;
 if existing is null then
 if p_source='reviewed-correction' and ((p_payload->>'expectedDigest') is distinct from
 (select digest from app_private.fantasy_fixture_observations where fixture_id=f.id order by observed_at desc,id desc limit 1)
 or length(coalesce(p_payload->>'reason','')) not between 8 and 500
 or length(coalesce(p_payload->>'reviewer','')) not between 3 and 200) then
 raise exception using errcode='PT409',message='adaptive_correction_review_conflict'; end if;
 insert into app_private.fantasy_fixture_observations(fixture_id,source,digest,payload,full_ready,simple_ready)
 values(f.id,p_source,d,p_payload,full_stats,core) returning id into existing;
 end if;
 return jsonb_build_object('observationId',existing,'digest',d,'fullReady',full_stats,'simpleReady',core);
exception when invalid_text_representation or numeric_value_out_of_range then
 raise exception using errcode='PT400',message='adaptive_payload_invalid';
end $$;

create or replace function api.service_activate_adaptive_estimates(p_season_id uuid,p_from_gameweek integer,p_expected_digest text,p_pause boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d text;
begin
 if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
 perform id from app.fantasy_seasons where id=p_season_id for update;
 if not found or p_from_gameweek<1 then raise exception using errcode='PT400',message='adaptive_scope_invalid'; end if;
 perform id from app.fantasy_gameweeks where fantasy_season_id=p_season_id order by id for update;
 if exists(select 1 from app.fantasy_gameweeks where fantasy_season_id=p_season_id and sequence_number>=p_from_gameweek
 and status in ('finalizing','finalized','corrected')) then raise exception using errcode='PT409',message='adaptive_finalized_history_protected'; end if;
 select encode(extensions.digest(coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'version',scoring_input_version) order by sequence_number),'[]')::text,'sha256'),'hex')
 into d from app.fantasy_gameweeks where fantasy_season_id=p_season_id and sequence_number>=p_from_gameweek;
 if d is distinct from p_expected_digest then raise exception using errcode='PT409',message='adaptive_activation_baseline_changed'; end if;
 if exists(select 1 from app_private.fantasy_adaptive_policy where season_id=p_season_id and (from_gameweek<>p_from_gameweek or ruleset_id<>'f6200000-0000-4000-8000-000000000201')) then
 raise exception using errcode='PT409',message='adaptive_assignment_immutable'; end if;
 if not exists(select 1 from app_private.fantasy_adaptive_policy where season_id=p_season_id) then
 update app.fantasy_gameweeks set scoring_input_version=greatest(1,scoring_input_version)+1 where fantasy_season_id=p_season_id and sequence_number>=p_from_gameweek;
 end if;
 insert into app_private.fantasy_adaptive_policy(season_id,from_gameweek,ruleset_id,paused)
 values(p_season_id,p_from_gameweek,'f6200000-0000-4000-8000-000000000201',p_pause)
 on conflict(season_id) do update set paused=excluded.paused;
 return jsonb_build_object('enabled',not p_pause,'fromGameweek',p_from_gameweek);
end $$;

revoke all on function api.service_activate_adaptive_estimates(uuid,integer,text,boolean) from public,anon,authenticated;
grant execute on function api.service_activate_adaptive_estimates(uuid,integer,text,boolean) to service_role;

create or replace function app_private.fantasy_scoring_input_document(p_gameweek_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare doc jsonb; fixtures jsonb:='[]'::jsonb; performances jsonb:='[]'::jsonb; fixture jsonb; player jsonb; r jsonb; obs app_private.fantasy_fixture_observations%rowtype;
 mode_row app_private.fantasy_fixture_scoring_modes%rowtype; policy app_private.fantasy_adaptive_policy%rowtype;
 stats jsonb; evidence jsonb; field text; known_absent boolean; mode_ready boolean; estimated_absent boolean;
begin
 doc:=app_private.fantasy_scoring_input_document_v1(p_gameweek_id);
 if not app_private.fantasy_adaptive_enabled(p_gameweek_id) then return doc; end if;
 select p.* into policy from app_private.fantasy_adaptive_policy p where p.season_id=(doc->>'seasonId')::uuid;
 doc:=doc||jsonb_build_object('adaptive',true,'policyPaused',policy.paused,'scoringVersion',2,
  'ruleset',(select to_jsonb(rs)-'created_at'-'updated_at' from app.fantasy_rulesets rs where rs.id=policy.ruleset_id));
 for fixture in select value from jsonb_array_elements(doc->'fixtures') where coalesce((value#>>'{assignment,counts_points}')::boolean,false) loop
 select * into mode_row from app_private.fantasy_fixture_scoring_modes where gameweek_id=p_gameweek_id and fixture_id=(fixture->>'fixtureId')::uuid;
 select * into obs from app_private.fantasy_fixture_observations where fixture_id=(fixture->>'fixtureId')::uuid order by observed_at desc,id desc limit 1;
 mode_ready:=case mode_row.mode when 'full' then coalesce(obs.full_ready,false) when 'simple' then coalesce(obs.simple_ready,false) else false end;
 fixtures:=fixtures||jsonb_build_array(fixture||jsonb_build_object('scoringMode',mode_row.mode,
 'modeSelectedAt',mode_row.selected_at,'modeCutoffAt',mode_row.cutoff_at,'modeReason',mode_row.reason,
 'estimated',app_private.fantasy_observation_estimated(obs.payload),'adaptiveReady',mode_ready,'observationDigest',obs.digest,'observationId',obs.id));
 for player in select jsonb_build_object('fantasyPlayerId',fp.id,'playerId',fp.football_player_id,
 'fixtureId',fixture->>'fixtureId','position',pos.code,'sourceSequence',fixture->'sourceSequence','fixtureTeamId',fp.football_team_id)
 from app.fantasy_players fp join app.fantasy_positions pos on pos.id=fp.position_id
 join app.fixtures fi on fi.id=(fixture->>'fixtureId')::uuid
 where fp.fantasy_season_id=(doc->>'seasonId')::uuid and (
 exists(select 1 from app.team_memberships membership where membership.player_id=fp.football_player_id and membership.season_id=fi.season_id
 and membership.team_id in(fi.home_team_id,fi.away_team_id) and membership.valid_from<=fi.kickoff_at::date
 and (membership.valid_to is null or membership.valid_to>=fi.kickoff_at::date))

 or exists(select 1 from jsonb_array_elements(coalesce(obs.payload->'players','[]')) observed where observed->>'playerId'=fp.football_player_id::text)) order by fp.id loop
 select value into r from jsonb_array_elements(coalesce(obs.payload->'players','[]')) where value->>'playerId'=player->>'playerId';
 estimated_absent:=coalesce(obs.payload->'estimatedNonParticipants' ? (player->>'playerId'),false);
 known_absent:=r is null and coalesce((obs.payload->>'participationComplete')::boolean,false) and
 (coalesce(obs.payload->'verifiedNonParticipants' ? (player->>'playerId'),false) or estimated_absent);
 if known_absent then
 stats:=jsonb_build_object('minutes',0,'goals',0,'cleanSheet',false,'goalsConceded',0,'yellowCards',0,'redCards',0,
 'secondYellowDismissals',0,'ownGoals',0,'assists',0,'saves',0,'penaltiesSaved',0,'penaltiesMissed',0);
 evidence:='{}';
 for field in select jsonb_object_keys(stats) loop
 evidence:=evidence||jsonb_build_object(field,jsonb_build_object('state',case when estimated_absent then 'estimated' else 'verified' end,'source',case when estimated_absent then 'reviewed-best-available' else 'verified-nonparticipation' end,'reason',obs.payload->>'reason',
 'observedAt',obs.observed_at,'references',obs.payload->'references'));
 end loop;
 else stats:=coalesce(r->'stats','{}'); evidence:=coalesce(r->'evidence','{}'); end if;
 performances:=performances||jsonb_build_array(player||jsonb_build_object('stats',stats,'evidence',evidence,
 'scoringMode',mode_row.mode,'statisticsComplete',mode_ready,'participationKnown',case when mode_row.mode='simple' then app_private.fantasy_field_scorable(jsonb_build_object('stats',stats,'evidence',evidence),'minutes') else app_private.fantasy_field_certified(jsonb_build_object('stats',stats,'evidence',evidence),'minutes') end,
 'fixtureTeamId',coalesce(r->>'teamId',player->>'fixtureTeamId')));
 end loop;
 end loop;
 return doc||jsonb_build_object('fixtures',fixtures,'playerFixtures',performances);
end $$;

create or replace function api.service_persist_fantasy_scoring_results(
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
  if gw.status<>'provisional' and not (gw.status='live' and app_private.fantasy_adaptive_enabled(gw.id)) then raise exception using errcode='PT409',message='gameweek_not_scorable'; end if;
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
      if coalesce((snapshot.payload->>'adaptive')::boolean,false) then
        select coalesce(array_agg(category order by category),array[]::text[]) into categories
        from (values ('appearance',array['minutes']),('goal',array['goals']),('assist',array['assists']),
          ('clean_sheet',array['minutes','cleanSheet','goalsConceded']),('goals_conceded',array['minutes','goalsConceded']),
          ('saves',array['saves']),('penalty_save',array['penaltiesSaved']),('penalty_miss',array['penaltiesMissed']),
          ('yellow_card',array['yellowCards']),('red_card',array['redCards']),
          ('second_yellow_dismissal',array['secondYellowDismissals']),('own_goal',array['ownGoals'])) c(category,fields)
        where not (coalesce(input_row->>'scoringMode','pending')='simple' and category in ('assist','saves','penalty_save','penalty_miss'))
          and not exists(select 1 from unnest(fields) field where not case when input_row->>'scoringMode'='simple' then app_private.fantasy_field_scorable(input_row,field) else app_private.fantasy_field_certified(input_row,field) end);
      end if;
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

create or replace function app_private.fantasy_fixture_mode_details(p_gameweek_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('fixtureId',a.fixture_id,'teamIds',jsonb_build_array(f.home_team_id,f.away_team_id),'mode',m.mode,
 'estimated',coalesce(app_private.fantasy_observation_estimated(o.payload),false),'pending',m.mode is null or not coalesce(case m.mode when 'full' then o.full_ready else o.simple_ready end,false),
 'cutoffAt',m.cutoff_at,'reason',m.reason,
 'excludedCategories',case when m.mode='simple' then '["assist","saves","penalty_save","penalty_miss"]'::jsonb else '[]'::jsonb end) order by a.fixture_id),'[]')
 from app.fantasy_fixture_assignments a join app.fixtures f on f.id=a.fixture_id
 left join app_private.fantasy_fixture_scoring_modes m on m.gameweek_id=a.gameweek_id and m.fixture_id=a.fixture_id
 left join lateral(select full_ready,simple_ready,payload from app_private.fantasy_fixture_observations where fixture_id=a.fixture_id order by observed_at desc,id desc limit 1) o on true
 where a.gameweek_id=p_gameweek_id and a.superseded_at is null and a.counts_points
 and app_private.fantasy_adaptive_enabled(p_gameweek_id);
$$;

create or replace function api.fantasy_rules(p_season_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select api.fantasy_rules_v1(p_season_id)||coalesce((select jsonb_build_object('adaptiveScoring',
 jsonb_build_object('fromGameweek',p.from_gameweek,'selectionDelayHours',12,'scope','fixture','lateModeUpgrade',false,'estimatesFinalForRankings',p.ruleset_id='f6200000-0000-4000-8000-000000000201'::uuid),
 'rulesetId',p.ruleset_id,'rulesetCode',r.ruleset_code,'rulesetVersion',r.version,'rulesetSemanticVersion',r.version::text||'.'||r.minor_version::text)
 from app_private.fantasy_adaptive_policy p join app.fantasy_rulesets r on r.id=p.ruleset_id where p.season_id=p_season_id),'{}');
$$;
