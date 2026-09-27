-- Adaptive scoring is opt-in. No existing season or finalized result is changed.
create table app_private.fantasy_adaptive_policy (
  season_id uuid primary key references app.fantasy_seasons(id),
  from_gameweek integer not null check (from_gameweek > 0),
  ruleset_id uuid not null references app.fantasy_rulesets(id),
  activated_at timestamptz not null default statement_timestamp(),
  paused boolean not null default false
);
create table app_private.fantasy_fixture_observations (
  id bigint generated always as identity primary key,
  fixture_id uuid not null references app.fixtures(id),
  observed_at timestamptz not null default statement_timestamp(),
  source text not null check (source in ('sportsmonks','reviewed-correction')),
  digest text not null check (digest ~ '^[0-9a-f]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload)='object' and pg_column_size(payload)<2097152),
  full_ready boolean not null,
  simple_ready boolean not null,
  unique(fixture_id, observed_at), unique(fixture_id,digest)
);
create index fantasy_fixture_observations_cutoff on app_private.fantasy_fixture_observations(fixture_id,observed_at desc);
create table app_private.fantasy_fixture_scoring_modes (
  gameweek_id uuid not null references app.fantasy_gameweeks(id),
  fixture_id uuid not null references app.fixtures(id),
  cutoff_at timestamptz not null,
  mode text check (mode in ('full','simple')),
  selected_at timestamptz,
  selection_observation_id bigint references app_private.fantasy_fixture_observations(id),
  reason text,
  primary key(gameweek_id,fixture_id),
  check ((mode is null and selected_at is null) or (mode is not null and selected_at is not null))
);
-- These are private service-owned audit records, never client-writable.
alter table app_private.fantasy_adaptive_policy enable row level security;
alter table app_private.fantasy_fixture_observations enable row level security;
alter table app_private.fantasy_fixture_scoring_modes enable row level security;
alter table app_private.fantasy_adaptive_policy force row level security;
alter table app_private.fantasy_fixture_observations force row level security;
alter table app_private.fantasy_fixture_scoring_modes force row level security;
revoke all on app_private.fantasy_adaptive_policy, app_private.fantasy_fixture_observations,
  app_private.fantasy_fixture_scoring_modes from public,anon,authenticated,service_role;

-- Copy the published catalogs to a new major version. Never update v1.
do $$
declare old_id uuid := 'f6100000-0000-4000-8000-000000000101';
 new_id uuid := 'f6200000-0000-4000-8000-000000000200'; tbl text; cols text;
begin
 insert into app.fantasy_rulesets select (jsonb_populate_record(null::app.fantasy_rulesets,
  to_jsonb(r)||jsonb_build_object('id',new_id,'version',2,'minor_version',0,
   'ruleset_code','botolago-fantasy-v2.0','name','BotolaGO Adaptive Fantasy v2.0',
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

create function app_private.fantasy_adaptive_enabled(p_gameweek_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from app.fantasy_gameweeks g join app_private.fantasy_adaptive_policy p
 on p.season_id=g.fantasy_season_id where g.id=p_gameweek_id and g.sequence_number>=p.from_gameweek);
$$;
revoke all on function app_private.fantasy_adaptive_enabled(uuid) from public,anon,authenticated,service_role;

create function app_private.fantasy_field_certified(p_row jsonb,p_field text)
returns boolean language plpgsql stable set search_path='' as $$
declare e jsonb:=p_row#>array['evidence',p_field]; v jsonb:=p_row#>array['stats',p_field];
begin
 return coalesce(e->>'state' in ('verified','derived') and length(btrim(e->>'source'))>0
  and e->>'observedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' and (e->>'observedAt')::timestamptz is not null and jsonb_typeof(e->'references')='array'
  and jsonb_array_length(e->'references')>0 and not exists(select 1 from jsonb_array_elements(e->'references') ref where jsonb_typeof(ref)<>'string' or length(btrim(ref#>>'{}'))=0) and case when p_field='cleanSheet' then jsonb_typeof(v)='boolean'
   else jsonb_typeof(v)='number' and v::text ~ '^[0-9]+$' and v::numeric between 0 and case when p_field='minutes' then 90 else 130 end end,false);
exception when others then return false;
end $$;
revoke all on function app_private.fantasy_field_certified(jsonb,text) from public,anon,authenticated,service_role;

-- A bounded, service-only canonical correction/observation input. Identities
-- are existing internal UUIDs, never invented provider identifiers.
create function api.service_record_fantasy_observation(p_fixture_id uuid,p_payload jsonb,p_source text)
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
 row_core:=row_core and app_private.fantasy_field_certified(r,field);
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
 and not coalesce(p_payload->'verifiedNonParticipants' ? fp.football_player_id::text,false)) then core:=false; end if;
 select coalesce(sum(case when (entry->>'teamId')::uuid=f.home_team_id then (entry#>>'{stats,goals}')::integer else (entry#>>'{stats,ownGoals}')::integer end),0),
 coalesce(sum(case when (entry->>'teamId')::uuid=f.away_team_id then (entry#>>'{stats,goals}')::integer else (entry#>>'{stats,ownGoals}')::integer end),0)
 into home_goals,away_goals from jsonb_array_elements(rows) entry;
 core:=core and home_goals=f.home_score and away_goals=f.away_score;
 full_stats:=coalesce(full_stats and core,false); core:=coalesce(core,false);
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
revoke all on function api.service_record_fantasy_observation(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function api.service_record_fantasy_observation(uuid,jsonb,text) to service_role;

create function api.service_select_fantasy_scoring_modes(p_gameweek_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g app.fantasy_gameweeks%rowtype; f record; s app_private.fantasy_fixture_observations%rowtype;
 policy app_private.fantasy_adaptive_policy%rowtype; cutoff timestamptz;
begin
 if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
 select * into g from app.fantasy_gameweeks where id=p_gameweek_id for update;
 if not app_private.fantasy_adaptive_enabled(g.id) then return jsonb_build_object('enabled',false); end if;
 select * into policy from app_private.fantasy_adaptive_policy where season_id=g.fantasy_season_id;
 if policy.paused then raise exception using errcode='PT409',message='adaptive_scoring_paused'; end if;
 if g.status in ('finalizing','finalized','corrected','cancelled') then return jsonb_build_object('enabled',true); end if;
 for f in select fi.* from app.fantasy_fixture_assignments a join app.fixtures fi on fi.id=a.fixture_id
 where a.gameweek_id=g.id and a.superseded_at is null and a.counts_points and fi.status='finished'
 order by fi.id for update of fi loop
 if f.finalized_at is null then continue; end if;
 cutoff:=f.finalized_at+interval '12 hours';
 if cutoff<policy.activated_at then
 -- Overdue rollout fixtures select their first audit snapshot, never whichever
 -- payload happens to be current when the scoring worker restarts.
 select * into s from app_private.fantasy_fixture_observations where fixture_id=f.id
 and observed_at>=policy.activated_at order by observed_at,id limit 1;
 if not found then continue; end if;
 cutoff:=s.observed_at;
 end if;
 insert into app_private.fantasy_fixture_scoring_modes(gameweek_id,fixture_id,cutoff_at)
 values(g.id,f.id,cutoff) on conflict do nothing;
 if statement_timestamp()>=cutoff then
 select * into s from app_private.fantasy_fixture_observations where fixture_id=f.id and observed_at<=cutoff order by observed_at desc,id desc limit 1;
 update app_private.fantasy_fixture_scoring_modes set mode=case when coalesce(s.full_ready,false) then 'full' else 'simple' end,
 selected_at=statement_timestamp(),selection_observation_id=s.id,reason=case when coalesce(s.full_ready,false) then 'complete_at_cutoff' else 'detailed_statistics_incomplete' end
 where gameweek_id=g.id and fixture_id=f.id and mode is null;
 end if;
 end loop;
 return jsonb_build_object('enabled',true);
end $$;
revoke all on function api.service_select_fantasy_scoring_modes(uuid) from public,anon,authenticated;
grant execute on function api.service_select_fantasy_scoring_modes(uuid) to service_role;

-- Preserve the byte-for-byte legacy document for seasons without an assignment.
alter function app_private.fantasy_scoring_input_document(uuid) rename to fantasy_scoring_input_document_v1;
create function app_private.fantasy_scoring_input_document(p_gameweek_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare doc jsonb; fixtures jsonb:='[]'::jsonb; performances jsonb:='[]'::jsonb; fixture jsonb; player jsonb; r jsonb; obs app_private.fantasy_fixture_observations%rowtype;
 mode_row app_private.fantasy_fixture_scoring_modes%rowtype; policy app_private.fantasy_adaptive_policy%rowtype;
 stats jsonb; evidence jsonb; field text; known_absent boolean; mode_ready boolean;
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
 'adaptiveReady',mode_ready,'observationDigest',obs.digest,'observationId',obs.id));
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
 known_absent:=r is null and coalesce((obs.payload->>'participationComplete')::boolean,false) and
 coalesce(obs.payload->'verifiedNonParticipants' ? (player->>'playerId'),false);
 if known_absent then
 stats:=jsonb_build_object('minutes',0,'goals',0,'cleanSheet',false,'goalsConceded',0,'yellowCards',0,'redCards',0,
 'secondYellowDismissals',0,'ownGoals',0,'assists',0,'saves',0,'penaltiesSaved',0,'penaltiesMissed',0);
 evidence:='{}';
 for field in select jsonb_object_keys(stats) loop
 evidence:=evidence||jsonb_build_object(field,jsonb_build_object('state','verified','source','verified-nonparticipation',
 'observedAt',obs.observed_at,'references',obs.payload->'references'));
 end loop;
 else stats:=coalesce(r->'stats','{}'); evidence:=coalesce(r->'evidence','{}'); end if;
 performances:=performances||jsonb_build_array(player||jsonb_build_object('stats',stats,'evidence',evidence,
 'scoringMode',mode_row.mode,'statisticsComplete',mode_ready,'participationKnown',app_private.fantasy_field_certified(jsonb_build_object('stats',stats,'evidence',evidence),'minutes'),
 'fixtureTeamId',coalesce(r->>'teamId',player->>'fixtureTeamId')));
 end loop;
 end loop;
 return doc||jsonb_build_object('fixtures',fixtures,'playerFixtures',performances);
end $$;
revoke all on function app_private.fantasy_scoring_input_document(uuid) from public,anon,authenticated,service_role;

alter function app_private.fantasy_validate_scoring_document(jsonb) rename to fantasy_validate_scoring_document_v1;
create function app_private.fantasy_validate_scoring_document(p_document jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce((p_document->>'adaptive')::boolean,false) then
 if coalesce((p_document->>'policyPaused')::boolean,true) or jsonb_array_length(p_document->'fixtures')=0
 or jsonb_array_length(p_document->'playerFixtures')=0 then
 raise exception using errcode='PT409',message='adaptive_scoring_pending'; end if;
 if exists(select 1 from jsonb_array_elements(p_document->'fixtures') f where f#>>'{assignment,frozen_at}' is null or (f#>>'{assignment,counts_points}')::boolean is distinct from true) then
 raise exception using errcode='PT409',message='adaptive_scoring_pending'; end if;
 else perform app_private.fantasy_validate_scoring_document_v1(p_document); end if;
end $$;
revoke all on function app_private.fantasy_validate_scoring_document(jsonb) from public,anon,authenticated,service_role;

-- Refuse sealing while mode selection or essential facts are unresolved.
alter function api.service_begin_fantasy_finalization(uuid,bigint,text) rename to service_begin_fantasy_finalization_v1;
revoke all on function api.service_begin_fantasy_finalization_v1(uuid,bigint,text) from public,anon,authenticated,service_role;
create function api.service_begin_fantasy_finalization(p_gameweek_id uuid,p_calculation_version bigint,p_input_digest text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d jsonb;
begin
 if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
 if app_private.fantasy_adaptive_enabled(p_gameweek_id) then
 d:=app_private.fantasy_scoring_input_document(p_gameweek_id);
 if (d->>'policyPaused')::boolean or exists(select 1 from jsonb_array_elements(d->'fixtures') f where
 (f->>'adaptiveReady')::boolean is distinct from true or f->>'scoringMode' is null) then
 raise exception using errcode='PT409',message='adaptive_scoring_pending'; end if;
 end if;
 return api.service_begin_fantasy_finalization_v1(p_gameweek_id,p_calculation_version,p_input_digest);
end $$;
revoke all on function api.service_begin_fantasy_finalization(uuid,bigint,text) from public,anon,authenticated;
grant execute on function api.service_begin_fantasy_finalization(uuid,bigint,text) to service_role;
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
          and not exists(select 1 from unnest(fields) field where not app_private.fantasy_field_certified(input_row,field));
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
revoke all on function api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb) to service_role;


-- Activation is explicit and guarded; migration deployment alone is inert.
create function api.service_activate_adaptive_scoring(p_season_id uuid,p_from_gameweek integer,p_expected_digest text,p_pause boolean default false)
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
 if exists(select 1 from app_private.fantasy_adaptive_policy where season_id=p_season_id and from_gameweek<>p_from_gameweek) then
 raise exception using errcode='PT409',message='adaptive_assignment_immutable'; end if;
 if not exists(select 1 from app_private.fantasy_adaptive_policy where season_id=p_season_id) then
 update app.fantasy_gameweeks set scoring_input_version=greatest(1,scoring_input_version)+1 where fantasy_season_id=p_season_id and sequence_number>=p_from_gameweek;
 end if;
 insert into app_private.fantasy_adaptive_policy(season_id,from_gameweek,ruleset_id,paused)
 values(p_season_id,p_from_gameweek,'f6200000-0000-4000-8000-000000000200',p_pause)
 on conflict(season_id) do update set paused=excluded.paused;
 return jsonb_build_object('enabled',not p_pause,'fromGameweek',p_from_gameweek);
end $$;
revoke all on function api.service_activate_adaptive_scoring(uuid,integer,text,boolean) from public,anon,authenticated;
grant execute on function api.service_activate_adaptive_scoring(uuid,integer,text,boolean) to service_role;

create function app_private.fantasy_fixture_mode_details(p_gameweek_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('fixtureId',a.fixture_id,'teamIds',jsonb_build_array(f.home_team_id,f.away_team_id),'mode',m.mode,
 'pending',m.mode is null or not coalesce(case m.mode when 'full' then o.full_ready else o.simple_ready end,false),
 'cutoffAt',m.cutoff_at,'reason',m.reason,
 'excludedCategories',case when m.mode='simple' then '["assist","saves","penalty_save","penalty_miss"]'::jsonb else '[]'::jsonb end) order by a.fixture_id),'[]')
 from app.fantasy_fixture_assignments a join app.fixtures f on f.id=a.fixture_id
 left join app_private.fantasy_fixture_scoring_modes m on m.gameweek_id=a.gameweek_id and m.fixture_id=a.fixture_id
 left join lateral(select full_ready,simple_ready from app_private.fantasy_fixture_observations where fixture_id=a.fixture_id order by observed_at desc,id desc limit 1) o on true
 where a.gameweek_id=p_gameweek_id and a.superseded_at is null and a.counts_points
 and app_private.fantasy_adaptive_enabled(p_gameweek_id);
$$;
revoke all on function app_private.fantasy_fixture_mode_details(uuid) from public,anon,authenticated,service_role;

create function app_private.fantasy_player_fixture_modes(p_gameweek_id uuid,p_player_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(detail),'[]') from jsonb_array_elements(app_private.fantasy_fixture_mode_details(p_gameweek_id)) detail
 join app.fixtures f on f.id=(detail->>'fixtureId')::uuid join app.fantasy_players fp on fp.id=p_player_id
 where exists(select 1 from app.team_memberships m where m.player_id=fp.football_player_id
 and m.season_id=f.season_id and m.team_id in(f.home_team_id,f.away_team_id)
 and m.valid_from<=f.kickoff_at::date and (m.valid_to is null or m.valid_to>=f.kickoff_at::date));
$$;
revoke all on function app_private.fantasy_player_fixture_modes(uuid,uuid) from public,anon,authenticated,service_role;

alter function api.get_my_fantasy_points(uuid,uuid) rename to get_my_fantasy_points_v1;
revoke all on function api.get_my_fantasy_points_v1(uuid,uuid) from public,anon,authenticated,service_role;
create function api.get_my_fantasy_points(p_team_id uuid,p_gameweek_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select doc||jsonb_build_object('fixtureScoring',app_private.fantasy_fixture_mode_details(p_gameweek_id),
 'players',(select coalesce(jsonb_agg(player||jsonb_build_object('fixtureScoring',app_private.fantasy_player_fixture_modes(p_gameweek_id,(player->>'fantasyPlayerId')::uuid))),'[]') from jsonb_array_elements(doc->'players') player))
 from (select api.get_my_fantasy_points_v1(p_team_id,p_gameweek_id) doc) authorized;
$$;
revoke all on function api.get_my_fantasy_points(uuid,uuid) from public,anon;
grant execute on function api.get_my_fantasy_points(uuid,uuid) to authenticated,service_role;

alter function api.fantasy_player_gameweek_history(uuid) rename to fantasy_player_gameweek_history_v1;
revoke all on function api.fantasy_player_gameweek_history_v1(uuid) from public,anon,authenticated,service_role;
create function api.fantasy_player_gameweek_history(p_fantasy_player_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(v||jsonb_build_object('fixtureScoring',app_private.fantasy_player_fixture_modes((v->>'gameweekId')::uuid,p_fantasy_player_id)) order by ord),'[]')
 from jsonb_array_elements(api.fantasy_player_gameweek_history_v1(p_fantasy_player_id)) with ordinality x(v,ord);
$$;
revoke all on function api.fantasy_player_gameweek_history(uuid) from public;
grant execute on function api.fantasy_player_gameweek_history(uuid) to anon,authenticated,service_role;

alter function api.fantasy_rules(uuid) rename to fantasy_rules_v1;
revoke all on function api.fantasy_rules_v1(uuid) from public,anon,authenticated,service_role;
create function api.fantasy_rules(p_season_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select api.fantasy_rules_v1(p_season_id)||coalesce((select jsonb_build_object('adaptiveScoring',
 jsonb_build_object('fromGameweek',p.from_gameweek,'selectionDelayHours',12,'scope','fixture','lateModeUpgrade',false),
 'rulesetId',p.ruleset_id,'rulesetCode','botolago-fantasy-v2.0','rulesetVersion',2,'rulesetSemanticVersion','2.0')
 from app_private.fantasy_adaptive_policy p where p.season_id=p_season_id),'{}');
$$;
revoke all on function api.fantasy_rules(uuid) from public;
grant execute on function api.fantasy_rules(uuid) to anon,authenticated,service_role;
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
  if not coalesce((current_document->>'adaptive')::boolean,false) and app_private.fantasy_goal_reconciliation(current_document) <> '[]'::jsonb then
    raise exception using errcode='PT409',message='fantasy_goal_totals_mismatch';
  end if;
  if encode(extensions.digest(current_document::text,'sha256'),'hex')<>snapshot.input_digest then
    raise exception using errcode='PT409',message='fantasy_scoring_input_changed';
  end if;
  return snapshot;
end;
$$;
revoke all on function app_private.fantasy_assert_scoring_snapshot(uuid,bigint,text) from public,anon,authenticated,service_role;


-- Every changed observation/mode creates a new calculation version. Old
-- snapshots and point ledger entries remain auditable, sealed rows untouched.
create function app_private.fantasy_adaptive_input_changed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 update app.fantasy_gameweeks g set scoring_input_version=greatest(1,g.scoring_input_version)+1
 where g.status not in ('finalizing','finalized','corrected','cancelled') and exists(
 select 1 from app.fantasy_fixture_assignments a where a.gameweek_id=g.id and a.fixture_id=new.fixture_id
 and a.superseded_at is null and app_private.fantasy_adaptive_enabled(g.id));
 return new;
end $$;
revoke all on function app_private.fantasy_adaptive_input_changed() from public,anon,authenticated,service_role;
create trigger adaptive_observation_changed after insert on app_private.fantasy_fixture_observations
 for each row execute function app_private.fantasy_adaptive_input_changed();
create trigger adaptive_mode_changed after update on app_private.fantasy_fixture_scoring_modes
 for each row when(old.mode is distinct from new.mode) execute function app_private.fantasy_adaptive_input_changed();

alter function api.ingest_current_player_fixture_performance(text,text,text,jsonb,jsonb,timestamptz)
 rename to ingest_current_player_fixture_performance_v1;
revoke all on function api.ingest_current_player_fixture_performance_v1(text,text,text,jsonb,jsonb,timestamptz) from public,anon,authenticated,service_role;
create function api.ingest_current_player_fixture_performance(p_provider_name text,p_season_external_id text,
 p_fixture_external_id text,p_rows jsonb,p_coverage jsonb,p_observed_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f app.fixtures%rowtype; r jsonb; pr uuid; tm uuid; rows jsonb:='[]'::jsonb; ev jsonb; stats jsonb;
 payload jsonb; result jsonb; anonymous jsonb:='{}'::jsonb;
begin
 if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
 select fi.* into f from app.fixtures fi join app_private.football_provider_mappings m on m.internal_entity_id=fi.id
 where m.provider_name=p_provider_name and m.entity_type='fixture' and m.external_id=p_fixture_external_id and m.active;
 if not exists(select 1 from app.fantasy_fixture_assignments a where a.fixture_id=f.id and a.superseded_at is null
 and app_private.fantasy_adaptive_enabled(a.gameweek_id)) then
 return api.ingest_current_player_fixture_performance_v1(p_provider_name,p_season_external_id,p_fixture_external_id,p_rows,p_coverage,p_observed_at);
 end if;
 if p_provider_name is distinct from 'sportsmonks' or p_season_external_id is distinct from '28647'
 or p_observed_at is null or p_observed_at>statement_timestamp()+interval '1 minute'
 or p_observed_at<statement_timestamp()-interval '15 minutes' or jsonb_typeof(p_rows) is distinct from 'array'
 or jsonb_typeof(p_coverage->'adaptiveFieldEvidence') is distinct from 'object' then
 raise exception using errcode='PT400',message='adaptive_payload_invalid'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
 select internal_entity_id into pr from app_private.football_provider_mappings where provider_name=p_provider_name
 and entity_type='player' and external_id=r->>'externalPlayerId' and active;
 select internal_entity_id into tm from app_private.football_provider_mappings where provider_name=p_provider_name
 and entity_type='team' and external_id=r->>'externalTeamId' and active;
 if pr is null or tm is null then raise exception using errcode='PT409',message='adaptive_player_mapping_missing'; end if;
 ev:=coalesce(p_coverage#>array['adaptiveFieldEvidence',r->>'externalPlayerId'],'{}');
 stats:=jsonb_build_object('minutes',r->'minutes','goals',r->'goals','assists',r->'assists',
 'cleanSheet',(r->>'cleanSheets')::integer>0,'goalsConceded',r->'goalsConceded','saves',r->'saves',
 'penaltiesSaved',r->'penaltiesSaved','penaltiesMissed',r->'penaltiesMissed','yellowCards',r->'yellowCards',
 'redCards',r->'redCards','secondYellowDismissals',r->'secondYellowDismissals','ownGoals',r->'ownGoals');
 -- Strip every synthesized legacy value without evidence. Unknown is NULL,
 -- not zero, in the adaptive observation record.
 select coalesce(jsonb_object_agg(key,case when ev ? key then value else 'null'::jsonb end),'{}') into stats from jsonb_each(stats);
 rows:=rows||jsonb_build_array(jsonb_build_object('playerId',pr,'teamId',tm,'started',r->'started','stats',stats,'evidence',ev));
 end loop;
 select coalesce(jsonb_object_agg(team_id::text,11-starters),'{}') into anonymous from (
 select team_id,(select count(*) from jsonb_array_elements(rows) entry where entry->>'teamId'=team_id::text and (entry->>'started')::boolean) starters
 from unnest(array[f.home_team_id,f.away_team_id]) team_id) t;
 payload:=jsonb_build_object('players',rows,'homeScore',f.home_score,'awayScore',f.away_score,
 'anonymousStarters',coalesce((p_coverage->>'anonymousStarterRows')::integer,0),'anonymousByTeam',anonymous,
 'references',jsonb_build_array('sportsmonks:fixture:'||p_fixture_external_id),
 'participationComplete',not exists(select 1 from jsonb_array_elements(rows) entry where not app_private.fantasy_field_certified(entry,'minutes')),
 'disciplineComplete',not exists(select 1 from jsonb_array_elements(rows) entry where
 not app_private.fantasy_field_certified(entry,'yellowCards') or not app_private.fantasy_field_certified(entry,'redCards')
 or not app_private.fantasy_field_certified(entry,'secondYellowDismissals')));
 result:=api.service_record_fantasy_observation(f.id,payload,'sportsmonks');
 return result||jsonb_build_object('adaptive',true,'active',jsonb_array_length(rows),'reconciled',true,
 'scoringStatisticsComplete',(result->>'fullReady')::boolean,'sourceVersion','sportsmonks-current-fixture:'||(result->>'digest'));
end $$;
revoke all on function api.ingest_current_player_fixture_performance(text,text,text,jsonb,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function api.ingest_current_player_fixture_performance(text,text,text,jsonb,jsonb,timestamptz) to service_role;

create function api.service_adaptive_scoring_audit(p_gameweek_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g app.fantasy_gameweeks%rowtype; d text;
begin
 if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
 select * into g from app.fantasy_gameweeks where id=p_gameweek_id;
 if not found then raise exception using errcode='PT404',message='fantasy_gameweek_not_found'; end if;
 select encode(extensions.digest(coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'version',scoring_input_version) order by sequence_number),'[]')::text,'sha256'),'hex')
 into d from app.fantasy_gameweeks where fantasy_season_id=g.fantasy_season_id and sequence_number>=g.sequence_number;
 return jsonb_build_object('writesAttempted',false,'activationDigest',d,'gameweekId',g.id,
 'seasonId',g.fantasy_season_id,'fromGameweek',g.sequence_number,
 'document',app_private.fantasy_scoring_input_document(g.id),
 'fixtureScoring',app_private.fantasy_fixture_mode_details(g.id));
end $$;
revoke all on function api.service_adaptive_scoring_audit(uuid) from public,anon,authenticated;
grant execute on function api.service_adaptive_scoring_audit(uuid) to service_role;

alter function api.service_fantasy_lifecycle_state(uuid) rename to service_fantasy_lifecycle_state_v1;
revoke all on function api.service_fantasy_lifecycle_state_v1(uuid) from public,anon,authenticated,service_role;
create function api.service_fantasy_lifecycle_state(p_gameweek_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select api.service_fantasy_lifecycle_state_v1(p_gameweek_id)||jsonb_build_object('adaptiveScoringEnabled',app_private.fantasy_adaptive_enabled(p_gameweek_id));
$$;
revoke all on function api.service_fantasy_lifecycle_state(uuid) from public,anon,authenticated;
grant execute on function api.service_fantasy_lifecycle_state(uuid) to service_role;

alter function api.football_current_performance_fixture_batch(text,text,text,integer) rename to football_current_performance_fixture_batch_v1;
revoke all on function api.football_current_performance_fixture_batch_v1(text,text,text,integer) from public,anon,authenticated,service_role;
create function api.football_current_performance_fixture_batch(p_provider_name text,p_season_external_id text,p_after_fixture_external_id text default null,p_limit integer default 5)
returns jsonb language sql stable security definer set search_path='' as $$
 select api.football_current_performance_fixture_batch_v1(p_provider_name,p_season_external_id,p_after_fixture_external_id,p_limit)
 ||jsonb_build_object('adaptive',exists(select 1 from app_private.fantasy_adaptive_policy p join app.fantasy_seasons s on s.id=p.season_id
 join app_private.football_provider_mappings m on m.internal_entity_id=s.football_season_id and m.entity_type='season'
 where m.provider_name=p_provider_name and m.external_id=p_season_external_id and m.active));
$$;
revoke all on function api.football_current_performance_fixture_batch(text,text,text,integer) from public,anon,authenticated;
grant execute on function api.football_current_performance_fixture_batch(text,text,text,integer) to service_role;

create function api.service_record_adaptive_gap(p_fixture_external_id text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f app.fixtures%rowtype; payload jsonb; d text;
begin
 if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
 if p_reason is null or p_reason!~'^[a-zA-Z0-9_]{3,100}$' then raise exception using errcode='PT400',message='validation_failed'; end if;
 select fi.* into f from app.fixtures fi join app_private.football_provider_mappings m on m.internal_entity_id=fi.id
 where m.provider_name='sportsmonks' and m.entity_type='fixture' and m.external_id=p_fixture_external_id and m.active;
 if not found or f.status<>'finished' then raise exception using errcode='PT409',message='adaptive_fixture_not_finished'; end if;
 perform g.id from app.fantasy_gameweeks g join app.fantasy_fixture_assignments a on a.gameweek_id=g.id
 where a.fixture_id=f.id and a.superseded_at is null order by g.id for update of g;
 perform id from app.fixtures where id=f.id for update;
 if not exists(select 1 from app.fantasy_fixture_assignments a join app.fantasy_gameweeks g on g.id=a.gameweek_id
 where a.fixture_id=f.id and a.superseded_at is null and app_private.fantasy_adaptive_enabled(g.id)
 and g.status not in ('finalizing','finalized','corrected','cancelled')) then return jsonb_build_object('recorded',false); end if;
 -- Transport errors do not invalidate an existing certified observation.
 if exists(select 1 from app_private.fantasy_fixture_observations where fixture_id=f.id) then
 return jsonb_build_object('recorded',false,'certified',exists(select 1 from app.fantasy_fixture_assignments a where a.fixture_id=f.id and a.superseded_at is null and a.counts_points and app_private.fantasy_fixture_ready(a.gameweek_id,f.id,false))); end if;
 payload:=jsonb_build_object('players','[]'::jsonb,'reason',p_reason,'references',jsonb_build_array('sportsmonks:fixture:'||p_fixture_external_id));
 d:=encode(extensions.digest(payload::text,'sha256'),'hex');
 insert into app_private.fantasy_fixture_observations(fixture_id,source,digest,payload,full_ready,simple_ready)
 values(f.id,'sportsmonks',d,payload,false,false) on conflict do nothing;
 return jsonb_build_object('recorded',true);
end $$;
revoke all on function api.service_record_adaptive_gap(text,text) from public,anon,authenticated;
grant execute on function api.service_record_adaptive_gap(text,text) to service_role;

create function app_private.fantasy_fixture_ready(p_gameweek_id uuid,p_fixture_id uuid,p_legacy_ready boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select case when app_private.fantasy_adaptive_enabled(p_gameweek_id) then coalesce((
 select case m.mode when 'full' then o.full_ready when 'simple' then o.simple_ready else false end
 from app_private.fantasy_fixture_scoring_modes m
 join lateral(select full_ready,simple_ready from app_private.fantasy_fixture_observations where fixture_id=p_fixture_id order by observed_at desc,id desc limit 1) o on true
 where m.gameweek_id=p_gameweek_id and m.fixture_id=p_fixture_id),false) else coalesce(p_legacy_ready,false) end;
$$;
revoke all on function app_private.fantasy_fixture_ready(uuid,uuid,boolean) from public,anon,authenticated,service_role;

-- Preserve the deployed health checks, changing only fixture readiness.
do $adaptive_health$
declare definition text;
begin
 definition:=pg_get_functiondef('app_private.ops_health_checks()'::regprocedure);
 definition:=replace(definition,'coalesce(c.scoring_statistics_complete and c.reconciled, false)',
 'app_private.fantasy_fixture_ready(g.id,f.id,c.scoring_statistics_complete and c.reconciled)');
 definition:=replace(definition,'case when f.status = ''finished'' and c.scoring_statistics_complete and c.reconciled then coalesce(',
 'case when f.status = ''finished'' and app_private.fantasy_fixture_ready(g.id,f.id,c.scoring_statistics_complete and c.reconciled) then coalesce((select max(o.observed_at) from app_private.fantasy_fixture_observations o where o.fixture_id=f.id),');
 execute definition;
end $adaptive_health$;

-- A rollback pauses future scoring without rewriting assignments, modes or ledger.
create function api.service_pause_adaptive_scoring(p_season_id uuid,p_paused boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
 if p_paused is null then raise exception using errcode='PT400',message='validation_failed'; end if;
 perform id from app.fantasy_gameweeks where fantasy_season_id=p_season_id order by id for update;
 update app_private.fantasy_adaptive_policy set paused=p_paused where season_id=p_season_id;
 if not found then raise exception using errcode='PT404',message='adaptive_policy_missing'; end if;
 return jsonb_build_object('paused',p_paused);
end $$;
revoke all on function api.service_pause_adaptive_scoring(uuid,boolean) from public,anon,authenticated;
grant execute on function api.service_pause_adaptive_scoring(uuid,boolean) to service_role;
create or replace function api.service_get_fantasy_scoring_snapshot(
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
  if gw.status not in ('provisional','finalizing') and not (gw.status='live' and app_private.fantasy_adaptive_enabled(gw.id)) then raise exception using errcode='PT409',message='gameweek_not_finalizable'; end if;
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


alter function app_private.ops_health_checks() rename to ops_health_checks_before_adaptive;
create function app_private.ops_health_checks()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare result jsonb; counts jsonb;
begin
 result:=app_private.ops_health_checks_before_adaptive();
 select jsonb_build_object('full',count(*) filter(where m.mode='full'),
 'simple',count(*) filter(where m.mode='simple'),'awaitingSelection',count(*) filter(where m.mode is null),
 'pendingCore',count(*) filter(where not app_private.fantasy_fixture_ready(a.gameweek_id,a.fixture_id,false)),
 'fallbackReasons',(select coalesce(jsonb_object_agg(reason,n),'{}') from (
 select reason,count(*) n from app_private.fantasy_fixture_scoring_modes where mode='simple' group by reason) reasons))
 into counts from app.fantasy_fixture_assignments a
 join app.fantasy_gameweeks g on g.id=a.gameweek_id
 left join app_private.fantasy_fixture_scoring_modes m on m.gameweek_id=a.gameweek_id and m.fixture_id=a.fixture_id
 where a.superseded_at is null and a.counts_points and app_private.fantasy_adaptive_enabled(g.id)
 and g.status in ('live','provisional','finalizing');
 return result||jsonb_build_object('adaptiveScoring',counts);
end $$;
revoke all on function app_private.ops_health_checks() from public,anon,authenticated,service_role;
