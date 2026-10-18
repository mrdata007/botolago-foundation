-- Production V2 only: tkewgajrljbwgwedqsxn.
-- Reviewed schema promotion for API-native rating inputs. No policy is enabled,
-- no player is linked and no score is changed by this script.
-- First list GitHub writers and inspect cron, async queues and worker leases
-- (AGENTS.md). This transaction holds scheduled jobs and pauses Fantasy only
-- for its own duration; it refuses a live worker or an undrained request queue.
-- A changed identity or score fingerprint refuses the whole transaction.
-- Run unchanged as a rehearsal; independently verify the history row is absent
-- and scores/flags unchanged. Then change ONLY the final rollback to commit.
-- Source import, historical staging and current-week cutover are separate
-- reviewed operations. See docs/backend/FANTASY_ALL_GAMEWEEK_RATINGS_20261018.md.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
select app_private.hold_scheduled_jobs();
do $guard$
begin
 if not exists(select 1 from app.fantasy_seasons where id='5ada3e98-2929-405a-a3f1-a26de8e51933') then raise exception 'wrong_production_season'; end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='20261018173321') then raise exception 'migration_already_applied'; end if;
 if to_regclass('app_private.fantasy_api_rating_sources') is not null then raise exception 'native_rating_objects_already_exist'; end if;
 if exists(select 1 from app_private.fantasy_worker_lease where released_at is null and expires_at>statement_timestamp()) then raise exception 'worker_lease_not_drained'; end if;
 if exists(select 1 from net.http_request_queue) then raise exception 'async_queue_not_drained'; end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20261018153305') then raise exception 'actual_rating_safeguard_required'; end if;
end $guard$;
create temporary table native_rating_switch_before on commit drop as select lifecycle_tick_enabled from app_private.fantasy_automation_settings;
select app_private.fantasy_automation_configure(false);
create temporary table native_rating_rows_before on commit drop as
select 'results' as name,md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'')) as digest from app.fantasy_team_gameweek_results t
union all select 'snapshots',md5(coalesce(jsonb_agg((to_jsonb(t)-'payload')||jsonb_build_object('payloadDigest',md5(t.payload::text)) order by t.gameweek_id,t.calculation_version)::text,'')) from app_private.fantasy_scoring_snapshots t
union all select 'events',md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'')) from app.fantasy_player_point_events t
union all select 'identities',md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'')) from app_private.football_provider_mappings t
union all select 'aliases',md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'')) from app_private.sofascore_player_aliases t
union all select 'policy',md5(coalesce(jsonb_agg(to_jsonb(t) order by t.season_id)::text,'')) from app_private.fantasy_rating_policy t;
insert into supabase_migrations.schema_migrations(version,name,statements) values('20261018173321','fantasy_api_rating_recovery',array[$native_rating_source$-- Owner-approved 2026-10-18: API ratings for every available gameweek.
-- A separate, audited correction path; ordinary activation/sealing guards stay.
-- Provider-native sources never create catalog players, aliases or mappings.
do $$ begin
 if md5((select prosrc from pg_proc where oid='api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure)) is distinct from '9722dc37a65013040a350383b08a478d'
 or md5((select prosrc from pg_proc where oid='api.fantasy_rules(uuid)'::regprocedure)) is distinct from '0b4e4f27ac3f510d968b21a8485aa9ae' then
 raise exception 'api_rating_recovery_unexpected_previous_body'; end if;
 if exists(select 1 from app_private.fantasy_rating_policy where enabled) then
 raise exception 'api_rating_recovery_existing_rating_policy'; end if;
end $$;

create table app_private.fantasy_api_rating_sources (
 id bigint generated always as identity primary key,
 fixture_id uuid not null references app.fixtures(id),
 event_id text not null check(event_id ~ '^[0-9]{1,12}$'),
 digest text not null check(digest ~ '^[0-9a-f]{64}$'),
 players jsonb not null check(jsonb_typeof(players)='array' and jsonb_array_length(players) between 22 and 80),
 ready boolean not null,
 captured_at timestamptz not null,
 created_at timestamptz not null default statement_timestamp()
);
create index fantasy_api_rating_sources_latest on app_private.fantasy_api_rating_sources(fixture_id,id desc);
create table app_private.fantasy_api_rating_polls (
 fixture_id uuid primary key references app.fixtures(id),
 last_fetched_at timestamptz,
 last_attempt_at timestamptz not null default statement_timestamp()
);
alter table app_private.fantasy_api_rating_polls enable row level security;
alter table app_private.fantasy_api_rating_polls force row level security;
revoke all on app_private.fantasy_api_rating_polls from public,anon,authenticated,service_role;
create table app_private.fantasy_api_rating_seasons (
 season_id uuid primary key references app.fantasy_seasons(id),
 from_gameweek integer not null check(from_gameweek>0),
 owner_approval text not null check(char_length(owner_approval) between 10 and 1000),
 created_at timestamptz not null default statement_timestamp()
);
create table app_private.fantasy_rating_recovery_plans (
 id bigint generated always as identity primary key,
 gameweek_id uuid not null references app.fantasy_gameweeks(id),
 calculation_version bigint not null,
 input_digest text not null check(input_digest ~ '^[0-9a-f]{64}$'),
 owner_approval text not null,
 previous_state jsonb not null,
 proposal jsonb not null,
 results jsonb not null,
 complete boolean not null,
 applied_at timestamptz not null default statement_timestamp(),
 unique(gameweek_id,calculation_version)
);
alter table app_private.fantasy_api_rating_sources enable row level security;
alter table app_private.fantasy_api_rating_sources force row level security;
alter table app_private.fantasy_api_rating_seasons enable row level security;
alter table app_private.fantasy_api_rating_seasons force row level security;
alter table app_private.fantasy_rating_recovery_plans enable row level security;
alter table app_private.fantasy_rating_recovery_plans force row level security;
revoke all on app_private.fantasy_api_rating_sources,app_private.fantasy_api_rating_seasons,
 app_private.fantasy_rating_recovery_plans from public,anon,authenticated,service_role;

create function api.service_record_fantasy_api_ratings(
 p_fixture_id uuid,p_event_id text,p_players jsonb,p_captured_at timestamptz
) returns jsonb language plpgsql security definer set search_path='' as $$
declare f app.fixtures%rowtype; v_ready boolean; v_digest text; v_id bigint;
begin
 if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
 if p_fixture_id is null or p_event_id is null or p_event_id !~ '^[0-9]{1,12}$'
 or jsonb_typeof(p_players) is distinct from 'array'
 or jsonb_array_length(p_players) not between 22 and 80 or pg_column_size(p_players)>131072
 or p_captured_at is null or p_captured_at>statement_timestamp()+interval '5 minutes'
 or p_captured_at<statement_timestamp()-interval '24 hours' then
 raise exception using errcode='PT400',message='fantasy_api_rating_payload_invalid'; end if;
 perform g.id from app.fantasy_gameweeks g join app.fantasy_fixture_assignments a on a.gameweek_id=g.id
 where a.fixture_id=p_fixture_id and a.superseded_at is null order by g.id for update of g;
 if exists(select 1 from app.fantasy_gameweeks g join app.fantasy_fixture_assignments a on a.gameweek_id=g.id
 where a.fixture_id=p_fixture_id and a.superseded_at is null and g.status='finalizing') then
 raise exception using errcode='PT409',message='fantasy_api_ratings_sealed'; end if;
 select * into f from app.fixtures where id=p_fixture_id for share;
 if not found or f.status<>'finished' or f.finalized_at is null then
 raise exception using errcode='PT409',message='fantasy_api_fixture_not_finished'; end if;
 if not exists(select 1 from app_private.football_provider_mappings m where m.provider_name='sofascore'
 and m.entity_type='fixture' and m.active and m.internal_entity_id=f.id and m.external_id=p_event_id) then
 raise exception using errcode='PT409',message='fantasy_api_event_mismatch'; end if;
 if (select count(distinct p->>'externalId') from jsonb_array_elements(p_players) p)<>jsonb_array_length(p_players)
 or exists(select 1 from jsonb_array_elements(p_players) p where
 jsonb_typeof(p) is distinct from 'object' or coalesce(p->>'externalId','') !~ '^[0-9]{1,12}$'
 or coalesce(p->>'side','') not in ('home','away')
 or jsonb_typeof(p->'starter') is distinct from 'boolean'
 or jsonb_typeof(p->'appeared') is distinct from 'boolean'
 or jsonb_typeof(p->'uncertain') is distinct from 'boolean'
 or not coalesce((jsonb_typeof(p->'rating')='null' or (jsonb_typeof(p->'rating')='number'
 and (p->>'rating')::numeric between 0 and 10 and round((p->>'rating')::numeric,2)=(p->>'rating')::numeric)),false)
 or not coalesce((jsonb_typeof(p->'minutes')='null' or (jsonb_typeof(p->'minutes')='number'
 and (p->>'minutes')::numeric between 0 and 120 and trunc((p->>'minutes')::numeric)=(p->>'minutes')::numeric)),false)
 or ((p->>'starter')::boolean or coalesce((p->>'minutes')::numeric>0,false) or jsonb_typeof(p->'rating')='number')
    is distinct from (p->>'appeared')::boolean
 or ((p->>'appeared')::boolean is false and (p->>'uncertain')::boolean is false
     and (p->'minutes'<>'null'::jsonb or p->'rating'<>'null'::jsonb)))
 or exists(select 1 from (values('home'),('away')) sides(side) where
 (select count(*) from jsonb_array_elements(p_players) p where p->>'side'=sides.side and (p->>'starter')::boolean)<>11) then
 raise exception using errcode='PT400',message='fantasy_api_rating_payload_invalid'; end if;
 if exists(select 1 from app_private.fantasy_api_rating_polls s where s.fixture_id=f.id and s.last_fetched_at>p_captured_at) then raise exception using errcode='PT409',message='stale_update'; end if;
 v_ready:=not exists(select 1 from jsonb_array_elements(p_players) p
 where (p->>'uncertain')::boolean or ((p->>'appeared')::boolean and p->'rating'='null'::jsonb));
 v_digest:=encode(extensions.digest(p_players::text,'sha256'),'hex');
 insert into app_private.fantasy_api_rating_polls(fixture_id,last_fetched_at) values(f.id,p_captured_at)
 on conflict(fixture_id) do update set last_fetched_at=excluded.last_fetched_at;
 select s.id into v_id from app_private.fantasy_api_rating_sources s where s.fixture_id=f.id
 and s.id=(select max(x.id) from app_private.fantasy_api_rating_sources x where x.fixture_id=f.id) and s.digest=v_digest;
 if v_id is null then
 insert into app_private.fantasy_api_rating_sources(fixture_id,event_id,digest,players,ready,captured_at)
 values(f.id,p_event_id,v_digest,p_players,v_ready,p_captured_at) returning id into v_id;
 end if;
 return jsonb_build_object('sourceId',v_id,'digest',v_digest,'ready',v_ready);
exception when invalid_text_representation or numeric_value_out_of_range then
 raise exception using errcode='PT400',message='fantasy_api_rating_payload_invalid';
end $$;
revoke all on function api.service_record_fantasy_api_ratings(uuid,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function api.service_record_fantasy_api_ratings(uuid,text,jsonb,timestamptz) to service_role;

-- Build a proposal without changing a policy, scoring version or result. An
-- API ID is read from the existing primary provider record. Aliases and name,
-- shirt-number and date-of-birth matching are deliberately absent.
create function app_private.fantasy_api_rating_document(p_gameweek_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d jsonb; old_sealed jsonb; fs jsonb; pending jsonb; pf jsonb; pp jsonb;
begin
 d:=app_private.fantasy_scoring_input_document_v1(p_gameweek_id);
 select payload into old_sealed from app_private.fantasy_scoring_snapshots
 where gameweek_id=p_gameweek_id and sealed_at is not null order by calculation_version desc limit 1;
 -- Preserve the historical player pool. Locked lineup and transfer-hit digests
 -- still come from the current database and are rechecked at commit.
 if old_sealed is not null then d:=d||jsonb_build_object('players',old_sealed->'players'); end if;
 with fixtures as (
 select f, s.id as source_id,s.digest,s.ready,s.players
 from jsonb_array_elements(d->'fixtures') f
 left join lateral(select s.* from app_private.fantasy_api_rating_sources s
 where s.fixture_id=(f->>'fixtureId')::uuid order by s.id desc limit 1) s on true
 where (f#>>'{assignment,counts_points}')::boolean is true
 ), marked as (
 select f||jsonb_build_object('apiRatingSourceId',source_id,'apiRatingDigest',digest,
 'scoringMode','full','adaptiveReady',coalesce(ready,false)) as f,
 source_id is not null and f->>'status'='finished' and f->>'finalizedAt' is not null as scorable,
 ready is true and f->>'status'='finished' and f->>'finalizedAt' is not null as complete
 from fixtures)
 select coalesce(jsonb_agg(f order by f->>'fixtureId') filter(where scorable),'[]'),
 coalesce(jsonb_agg(f||jsonb_build_object('pendingReason','fantasy_ratings_pending') order by f->>'fixtureId') filter(where not complete),'[]')
 into fs,pending from marked;
 with players as(select p from jsonb_array_elements(d->'players') p),
 fixtures as(select f from jsonb_array_elements(fs) f),
 pairs as (
 select distinct p,f,m.external_id,
 case when jsonb_typeof(raw.entry->'minutes')='number' then raw.entry->'minutes'
      when raw.entry is null and m.external_id is not null then '0'::jsonb else 'null'::jsonb end as minutes,
 case when raw.entry is not null then (raw.entry->>'appeared')::boolean else false end as appeared,
 raw.entry->'rating' as rating,
 m.external_id is not null as known
 from players cross join fixtures
 join app.fixtures fi on fi.id=(f->>'fixtureId')::uuid
 left join app_private.football_provider_mappings m on m.provider_name='sofascore' and m.entity_type='player'
 and m.active and m.internal_entity_id=(p->>'playerId')::uuid
 left join app_private.fantasy_api_rating_sources s on s.id=(f->>'apiRatingSourceId')::bigint
 left join lateral(select r as entry from jsonb_array_elements(s.players) r where r->>'externalId'=m.external_id) raw on true
 where (raw.entry is not null or (p->>'teamId')::uuid in(fi.home_team_id,fi.away_team_id)
 or exists(select 1 from app.team_memberships tm where tm.player_id=(p->>'playerId')::uuid
 and tm.season_id=fi.season_id and tm.team_id in(fi.home_team_id,fi.away_team_id)
 and tm.valid_from<=fi.kickoff_at::date and (tm.valid_to is null or tm.valid_to>=fi.kickoff_at::date)))
 and (raw.entry is null or ((raw.entry->>'uncertain')::boolean is false
 and ((raw.entry->>'appeared')::boolean is false or jsonb_typeof(raw.entry->'rating')='number')))
 ), built as (
 select jsonb_build_object('fantasyPlayerId',p->'fantasyPlayerId','playerId',p->'playerId','position',p->'position',
 'fixtureId',f->'fixtureId','sourceSequence',f->'sourceSequence','providerPlayerId',external_id,
 'apiAppeared',appeared,'rating',rating,'participationKnown',known,'scoringMode','full',
 'stats',jsonb_build_object('minutes',minutes),
 'evidence',jsonb_build_object('minutes',jsonb_build_object('state','verified','source','sofascore-api-ratings'))
 ) as p from pairs)
 select coalesce(jsonb_agg(p order by p->>'fantasyPlayerId',p->>'fixtureId'),'[]') into pf from built;
 select coalesce(jsonb_agg(distinct p->>'fantasyPlayerId'),'[]') into pp
 from jsonb_array_elements(d->'players') p
 where exists(select 1 from jsonb_array_elements(pf) x where x->>'fantasyPlayerId'=p->>'fantasyPlayerId' and (x->>'participationKnown')::boolean is not true
 and exists(select 1 from app.fantasy_lineup_players lp join app.fantasy_lineups l on l.id=lp.lineup_id
 where l.gameweek_id=p_gameweek_id and lp.fantasy_player_id=(p->>'fantasyPlayerId')::uuid))
 or exists(select 1 from jsonb_array_elements(pending) f join app.fixtures fi on fi.id=(f->>'fixtureId')::uuid
 where (p->>'teamId')::uuid in(fi.home_team_id,fi.away_team_id)
 or exists(select 1 from app.team_memberships tm where tm.player_id=(p->>'playerId')::uuid and tm.season_id=fi.season_id
 and tm.team_id in(fi.home_team_id,fi.away_team_id) and tm.valid_from<=fi.kickoff_at::date
 and (tm.valid_to is null or tm.valid_to>=fi.kickoff_at::date)));
 return d||jsonb_build_object('scoringVersion',3,'ratingScoring',true,'apiNativeRatings',true,
 'adaptive',true,'policyPaused',false,'incremental',true,
 'ruleset',(select to_jsonb(r)-'created_at'-'updated_at' from app.fantasy_rulesets r where r.id='f6200000-0000-4000-8000-000000000300'),
 'fixtures',fs,'pendingFixtures',pending,'pendingPlayerIds',pp,'playerFixtures',pf);
end $$;
revoke all on function app_private.fantasy_api_rating_document(uuid) from public,anon,authenticated,service_role;

alter function app_private.fantasy_scoring_input_document(uuid) rename to fantasy_scoring_input_document_before_api_ratings;
revoke all on function app_private.fantasy_scoring_input_document_before_api_ratings(uuid) from public,anon,authenticated,service_role;
create function app_private.fantasy_scoring_input_document(p_gameweek_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g app.fantasy_gameweeks%rowtype; frozen jsonb;
begin
 select * into g from app.fantasy_gameweeks where id=p_gameweek_id;
 if exists(select 1 from app_private.fantasy_api_rating_seasons p where p.season_id=g.fantasy_season_id and g.sequence_number>=p.from_gameweek)
 then
   if g.status in ('finalized','corrected') then
     select s.payload into frozen from app_private.fantasy_scoring_snapshots s
     where s.gameweek_id=g.id and s.sealed_at is not null and s.payload->>'apiNativeRatings'='true'
     order by s.calculation_version desc limit 1;
     if frozen is not null then return frozen; end if;
     return app_private.fantasy_scoring_input_document_before_api_ratings(p_gameweek_id);
   end if;
   return app_private.fantasy_api_rating_document(g.id);
 end if;
 return app_private.fantasy_scoring_input_document_before_api_ratings(p_gameweek_id);
end $$;
revoke all on function app_private.fantasy_scoring_input_document(uuid) from public,anon,authenticated,service_role;

alter function app_private.fantasy_validate_scoring_document(jsonb) rename to fantasy_validate_scoring_document_before_api_ratings;
revoke all on function app_private.fantasy_validate_scoring_document_before_api_ratings(jsonb) from public,anon,authenticated,service_role;
create function app_private.fantasy_validate_scoring_document(p_document jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_document->>'apiNativeRatings'='true' then
   if p_document->>'ratingScoring' is distinct from 'true' or p_document->>'scoringVersion' is distinct from '3'
   or p_document#>>'{ruleset,version}' is distinct from '3'
   or jsonb_array_length(p_document->'players') not between 1 and 2000
   or jsonb_array_length(p_document->'fixtures') not between 0 and 64
   or jsonb_array_length(p_document->'pendingFixtures') not between 0 and 64
   or jsonb_array_length(p_document->'fixtures')+jsonb_array_length(p_document->'pendingFixtures')=0
   or pg_column_size(p_document)>16777216
   or exists(select 1 from jsonb_array_elements(p_document->'fixtures') f
     left join app_private.fantasy_api_rating_sources s on s.id=(f->>'apiRatingSourceId')::bigint
     where s.id is null or (not s.ready and (p_document->>'incremental' is distinct from 'true'
       or not exists(select 1 from jsonb_array_elements(p_document->'pendingFixtures') pending where pending->>'fixtureId'=f->>'fixtureId')))
       or s.fixture_id is distinct from (f->>'fixtureId')::uuid
       or s.digest is distinct from f->>'apiRatingDigest'
       or f#>>'{assignment,frozen_at}' is null or f#>>'{assignment,counts_points}' is distinct from 'true')
   or app_private.fantasy_actual_ratings_pending(p_document) then
     raise exception using errcode='PT409',message='fantasy_ratings_pending';
   end if;
   return;
 end if;
 perform app_private.fantasy_validate_scoring_document_before_api_ratings(p_document);
end $$;
revoke all on function app_private.fantasy_validate_scoring_document(jsonb) from public,anon,authenticated,service_role;

create function api.service_fantasy_api_rating_context(p_fixture_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select case when not app_private.is_service_request() then null else jsonb_build_object('enabled',
 exists(select 1 from app.fixtures f join app.fantasy_seasons fs on fs.football_season_id=f.season_id
 join app_private.fantasy_api_rating_seasons p on p.season_id=fs.id
 where f.id=p_fixture_id)) end;
$$;
revoke all on function api.service_fantasy_api_rating_context(uuid) from public,anon,authenticated;
grant execute on function api.service_fantasy_api_rating_context(uuid) to service_role;

-- The missing-rating predicate also understands the API's direct appearance
-- evidence, so a starter with missing minutes can never become a DNP.
create or replace function app_private.fantasy_actual_ratings_pending(p_document jsonb)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(p_document->>'scoringVersion'='3' and p_document#>>'{ruleset,version}'='3'
 and p_document->>'ratingScoring'='true',false)
 and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(p_document->'playerFixtures')='array' then p_document->'playerFixtures' else '[]'::jsonb end) p
 where (p->>'apiAppeared'='true' or case when jsonb_typeof(p#>'{stats,minutes}')='number'
 then (p#>>'{stats,minutes}')::numeric>0 else false end)
 and jsonb_typeof(p->'rating') is distinct from 'number');
$$;

-- The reviewed result writer, with direct API appearance evidence.
create or replace function api.service_persist_fantasy_scoring_results(
  p_gameweek_id uuid,p_calculation_version bigint,p_input_digest text,
  p_player_results jsonb,p_team_results jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare gw app.fantasy_gameweeks%rowtype; snapshot app_private.fantasy_scoring_snapshots%rowtype;
  team_result jsonb; substitution jsonb;
  player_count integer:=0; team_count integer:=0; lineup app.fantasy_lineups%rowtype;
  chip app.fantasy_chip_type; actual_hit integer; starting_points integer; bench_points integer;
  captain_points integer; actual_score integer; effective_captain uuid; captain_multiplier numeric;
  -- snapshot.payload is large. Read each part once: a reference to the record field inside a
  -- loop or a per-row subquery makes the executor fetch and copy the whole document again.
  v_player_fixtures jsonb; v_players jsonb; v_pending jsonb; v_rules jsonb; v_ruleset jsonb;
  v_adaptive boolean:=false; v_api_native boolean:=false; v_bad integer; v_digest text; v_scoring_version text; v_rating boolean:=false;
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
  if gw.status<>'provisional' and not (gw.status='live' and (app_private.fantasy_adaptive_enabled(gw.id) or app_private.fantasy_live_scoring_enabled(gw.id))) then raise exception using errcode='PT409',message='gameweek_not_scorable'; end if;
  snapshot:=app_private.fantasy_assert_scoring_snapshot(gw.id,p_calculation_version,p_input_digest);
  if snapshot.sealed_at is not null then raise exception using errcode='PT409',message='fantasy_scoring_sealed'; end if;
  v_api_native:=snapshot.payload->>'apiNativeRatings'='true';
  v_player_fixtures:=snapshot.payload->'playerFixtures';
  v_players:=snapshot.payload->'players';
  v_pending:=coalesce(snapshot.payload->'pendingPlayerIds','[]'::jsonb);
  v_rules:=snapshot.payload->'positionRules';
  v_ruleset:=snapshot.payload->'ruleset';
  v_scoring_version:=snapshot.payload->>'scoringVersion';
  -- A rating gameweek's snapshot (20261014090000): ruleset 3, scoring version 3.
  v_rating:=v_scoring_version='3' and coalesce((snapshot.payload->>'ratingScoring')::boolean,false)
    and snapshot.payload#>>'{ruleset,version}'='3';
  if app_private.fantasy_actual_ratings_pending(snapshot.payload) then
    raise exception using errcode='PT409',message='fantasy_ratings_pending';
  end if;

  if jsonb_array_length(p_player_results)=0 and jsonb_array_length(v_player_fixtures)>0 then
    if not snapshot.players_persisted then raise exception using errcode='PT409',message='fantasy_player_results_missing'; end if;
  else
    v_digest:=encode(extensions.digest(p_player_results::text,'sha256'),'hex');
    if snapshot.players_persisted and snapshot.player_results_digest is distinct from v_digest then
      raise exception using errcode='PT409',message='fantasy_scoring_replay_conflict'; end if;
    if jsonb_array_length(p_player_results)<>jsonb_array_length(v_player_fixtures)
      or (select count(distinct (v->>'fantasyPlayerId',v->>'fixtureId')) from jsonb_array_elements(p_player_results) v)<>jsonb_array_length(p_player_results) then
      raise exception using errcode='PT400',message='fantasy_player_result_scope_invalid'; end if;
    if jsonb_array_length(v_player_fixtures)>0 then
      v_adaptive:=coalesce((snapshot.payload->>'adaptive')::boolean,false); end if;
    -- Validation, all snapshot rows at once. Row by row the old loop looked up the row's result,
    -- checked its event list against the row's allowed categories, then checked each event in
    -- order; the first failure in snapshot order raised. Here every row and event gets its
    -- verdict in one pass and the failure with the smallest snapshot position is raised:
    --   1 = fantasy_player_result_scope_invalid   (no result, events not an array, wrong number
    --       of events or of distinct categories)
    --   2 = fantasy_point_event_invalid
    --   3 = validation_failed                     (points are an integer in text, outside the
    --       integer range: the old ::integer cast raised it, and only after every earlier
    --       condition of that event had passed)
    with pf as materialized (
      select t.ord, t.value as j, t.value->>'fantasyPlayerId' as pid, t.value->>'fixtureId' as fid
      from jsonb_array_elements(v_player_fixtures) with ordinality t(value,ord)
    ), res as (
      select r.value as j, r.value->>'fantasyPlayerId' as pid, r.value->>'fixtureId' as fid
      from jsonb_array_elements(p_player_results) r
    ), allowed as materialized (
      select pf.ord, c.category, null::integer as expected
      from pf cross join (values ('appearance',array['minutes']),('goal',array['goals']),('assist',array['assists']),
          ('clean_sheet',array['minutes','cleanSheet','goalsConceded']),('goals_conceded',array['minutes','goalsConceded']),
          ('saves',array['saves']),('penalty_save',array['penaltiesSaved']),('penalty_miss',array['penaltiesMissed']),
          ('yellow_card',array['yellowCards']),('red_card',array['redCards']),
          ('second_yellow_dismissal',array['secondYellowDismissals']),('own_goal',array['ownGoals'])) c(category,fields)
      where not v_rating and (not v_adaptive
        or (not (coalesce(pf.j->>'scoringMode','pending')='simple' and c.category in ('assist','saves','penalty_save','penalty_miss'))
          and not exists(select 1 from unnest(c.fields) field
            where not case when pf.j->>'scoringMode'='simple' then app_private.fantasy_field_scorable(pf.j,field)
                           else app_private.fantasy_field_certified(pf.j,field) end)))
      union all
      -- The rating rule (20261014090000): exactly one `rating` event for a player who
      -- appeared (his minutes established as the adaptive scorer requires, and above
      -- zero), worth his actual rating rounded half up; none otherwise.
      select pf.ord, 'rating',
        floor((pf.j->>'rating')::numeric+0.5)::integer
      from pf
      where v_rating and v_adaptive
        and case when v_api_native then pf.j->>'apiAppeared'='true'
          else (case when pf.j->>'scoringMode'='simple' then app_private.fantasy_field_scorable(pf.j,'minutes')
                 else app_private.fantasy_field_certified(pf.j,'minutes') end
          and case when jsonb_typeof(pf.j#>'{stats,minutes}')='number' then (pf.j#>>'{stats,minutes}')::numeric>0 else false end) end
    ), counts as (
      select a.ord, count(*)::integer as n from allowed a group by a.ord
    ), rowinfo as (
      select pf.ord, pf.fid, pf.j->>'playerId' as player_id, rs.j as rv, coalesce(counts.n,0) as n,
        case when jsonb_typeof(rs.j->'events')='array' then rs.j->'events' else '[]'::jsonb end as evs
      from pf left join res rs on rs.pid=pf.pid and rs.fid=pf.fid left join counts on counts.ord=pf.ord
    ), events as (
      select ri.ord, e.ordinality as eord, e.value as v,
        ('fixture-stats:'||ri.fid||':'||ri.player_id||':'||(e.value->>'category')) as expected_key
      from rowinfo ri cross join lateral jsonb_array_elements(ri.evs) with ordinality e(value,ordinality)
    ), verdicts as (
      select ev.ord, ev.eord,
        case
          when ev.v->>'category' is null or a.category is null
            or ev.v->>'sourceKey' is distinct from ev.expected_key
            or jsonb_typeof(ev.v->'points') is distinct from 'number'
            or (ev.v->>'points')!~'^-?[0-9]+$' then 2
          else case
            when length(ltrim(ev.v->>'points','-0'))>10 then 3
            else case
              when (ev.v->>'points')::bigint not between -2147483648 and 2147483647 then 3
              when (ev.v->>'points')::integer not between -100 and 100 then 2
              when a.expected is not null and (ev.v->>'points')::integer<>a.expected then 2
              else 0 end
            end
          end as code
      from events ev left join allowed a on a.ord=ev.ord and a.category=ev.v->>'category'
    ), first_event as (
      select distinct on (vd.ord) vd.ord, vd.code from verdicts vd where vd.code>0 order by vd.ord, vd.eord
    )
    select z.code into v_bad from (
      select ri.ord,
        case when ri.rv is null or jsonb_typeof(ri.rv->'events') is distinct from 'array'
               or jsonb_array_length(ri.evs)<>ri.n
               or (select count(distinct x.value->>'category') from jsonb_array_elements(ri.evs) x)<>ri.n then 1
             else fe.code end as code
      from rowinfo ri left join first_event fe on fe.ord=ri.ord
    ) z where z.code is not null order by z.ord limit 1;
    if v_bad=1 then raise exception using errcode='PT400',message='fantasy_player_result_scope_invalid'; end if;
    if v_bad=2 then raise exception using errcode='PT400',message='fantasy_point_event_invalid'; end if;
    if v_bad=3 then raise exception using errcode='PT400',message='validation_failed'; end if;
    -- Only aggregate snapshot categories are replaced. Independent official
    -- event keys remain outside this worker's namespace.
    update app.fantasy_player_point_events set superseded_at=statement_timestamp()
      where gameweek_id=gw.id and source_key like 'fixture-stats:%' and superseded_at is null;
    -- One statement. A snapshot row or event repeating a conflict key is applied after the
    -- earlier one, so the last occurrence wins, as it did when the rows went in one by one.
    insert into app.fantasy_player_point_events(fantasy_player_id,gameweek_id,fixture_id,category,points,state,scoring_version,source_sequence,source_key)
    select distinct on (x.fantasy_player_id,x.fixture_id,x.source_key)
      x.fantasy_player_id,gw.id,x.fixture_id,x.category,x.points,'provisional',x.scoring_version,x.source_sequence,x.source_key
    from (
      select (pf.value->>'fantasyPlayerId')::uuid as fantasy_player_id,(pf.value->>'fixtureId')::uuid as fixture_id,
        ev.value->>'category' as category,(ev.value->>'points')::integer as points,
        v_scoring_version::integer as scoring_version,(pf.value->>'sourceSequence')::bigint as source_sequence,
        ev.value->>'sourceKey' as source_key,pf.ord,ev.ordinality as eord
      from jsonb_array_elements(v_player_fixtures) with ordinality pf(value,ord)
      join (select r.value as j,r.value->>'fantasyPlayerId' as pid,r.value->>'fixtureId' as fid
            from jsonb_array_elements(p_player_results) r) rs
        on rs.pid=pf.value->>'fantasyPlayerId' and rs.fid=pf.value->>'fixtureId'
      cross join lateral jsonb_array_elements(rs.j->'events') with ordinality ev(value,ordinality)
    ) x
    order by x.fantasy_player_id,x.fixture_id,x.source_key,x.scoring_version,x.ord desc,x.eord desc
    on conflict(fantasy_player_id,fixture_id,source_key,scoring_version) do update set
      points=excluded.points,state='provisional',source_sequence=excluded.source_sequence,superseded_at=null;
    -- Minutes and sequence numbers of every snapshot row, grouped once instead of once per
    -- player. (A row whose minutes are not a number fails the whole call, as it did when the
    -- per-player subqueries ran, whichever player the row belongs to.)
    insert into app.fantasy_player_gameweek_points(fantasy_player_id,gameweek_id,provisional_points,minutes_played,did_play,calculation_version,football_input_version,final_points,finalized_at)
    select (player.value->>'fantasyPlayerId')::uuid,gw.id,
      coalesce(points.total,0),
      coalesce(fixtures.minutes,0),
      coalesce(fixtures.played,false),
      p_calculation_version,coalesce(fixtures.last_sequence,0),null,null
    from jsonb_array_elements(v_players) player
    left join (select e.fantasy_player_id,sum(e.points) as total from app.fantasy_player_point_events e
      where e.gameweek_id=gw.id and e.superseded_at is null group by e.fantasy_player_id) points
      on points.fantasy_player_id=(player.value->>'fantasyPlayerId')::uuid
    left join (select f.value->>'fantasyPlayerId' as pid,
        sum((f.value#>>'{stats,minutes}')::integer) as minutes,
        bool_or(coalesce((f.value->>'apiAppeared')::boolean,(f.value#>>'{stats,minutes}')::integer>0)) as played,
        max((f.value->>'sourceSequence')::bigint) as last_sequence
      from jsonb_array_elements(v_player_fixtures) f
      group by f.value->>'fantasyPlayerId') fixtures
      on fixtures.pid=player.value->>'fantasyPlayerId'
    on conflict(fantasy_player_id,gameweek_id) do update set provisional_points=excluded.provisional_points,
      minutes_played=excluded.minutes_played,did_play=excluded.did_play,calculation_version=excluded.calculation_version,
      football_input_version=excluded.football_input_version,final_points=null,finalized_at=null;
    get diagnostics player_count=row_count;
    update app_private.fantasy_scoring_snapshots set players_persisted=true,player_results_digest=v_digest where gameweek_id=gw.id and calculation_version=p_calculation_version;
  end if;

  if (select count(distinct v->>'teamId') from jsonb_array_elements(p_team_results) v)<>jsonb_array_length(p_team_results) then
    raise exception using errcode='PT400',message='fantasy_team_result_scope_invalid'; end if;
  for team_result in select value from jsonb_array_elements(p_team_results) loop
    select * into lineup from app.fantasy_lineups l where l.id=(team_result->>'lineupId')::uuid
      and l.fantasy_team_id=(team_result->>'teamId')::uuid and l.gameweek_id=gw.id and l.locked_at is not null for update;
    if not found or jsonb_typeof(team_result->'players') is distinct from 'array'
      or jsonb_typeof(team_result->'substitutions') is distinct from 'array'
      or jsonb_array_length(team_result->'players')<>(v_ruleset->>'squad_size')::integer
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
    if exists(select 1 from app.fantasy_lineup_players lp where lp.lineup_id=lineup.id
       and v_pending ? lp.fantasy_player_id::text) then
      select lp.fantasy_player_id into effective_captain from app.fantasy_lineup_players lp
      join app.fantasy_player_gameweek_points pp on pp.fantasy_player_id=lp.fantasy_player_id and pp.gameweek_id=gw.id
      where lp.lineup_id=lineup.id and lp.captain and pp.did_play;
      if jsonb_array_length(team_result->'substitutions')<>0 then
        raise exception using errcode='PT409',message='fantasy_participation_pending'; end if;
    end if;
    if team_result->>'effectiveCaptainId' is distinct from effective_captain::text then
      raise exception using errcode='PT400',message='fantasy_captain_result_invalid'; end if;
    captain_multiplier:=case when chip='triple_captain' then (v_ruleset->>'triple_captain_multiplier')::numeric else (v_ruleset->>'captain_multiplier')::numeric end;
    if (chip='bench_boost' and jsonb_array_length(team_result->'substitutions')<>0)
      or (select count(distinct v->>'playerOutId') from jsonb_array_elements(team_result->'substitutions') v)<>jsonb_array_length(team_result->'substitutions')
      or (select count(distinct v->>'playerInId') from jsonb_array_elements(team_result->'substitutions') v)<>jsonb_array_length(team_result->'substitutions') then
      raise exception using errcode='PT400',message='fantasy_substitution_invalid'; end if;
    for substitution in select value from jsonb_array_elements(team_result->'substitutions') loop
      -- The lineup's fifteen rows are read once and both sides come from them. Written as two
      -- scans of the whole lineup-players table joined to the points of every player in the
      -- gameweek, the planner could pick a plan that read every player's row for each substitution.
      if not exists(with members as materialized (select lp.fantasy_player_id,lp.lineup_id,lp.slot from app.fantasy_lineup_players lp where lp.lineup_id=lineup.id)
        select 1 from members outgoing
        join app.fantasy_player_gameweek_points po on po.fantasy_player_id=outgoing.fantasy_player_id and po.gameweek_id=gw.id
        join app.fantasy_players fo on fo.id=outgoing.fantasy_player_id join app.fantasy_positions opo on opo.id=fo.position_id
        cross join members incoming
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
      select 1 from jsonb_array_elements(v_rules) rule
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
    insert into app.fantasy_team_gameweek_results(fantasy_team_id,gameweek_id,starting_points,bench_points,captain_points,transfer_hit,chip_type,provisional_score,calculation_version,scoring_details)
      values(lineup.fantasy_team_id,gw.id,starting_points,bench_points,captain_points,actual_hit,chip,actual_score,p_calculation_version,team_result)
      on conflict(fantasy_team_id,gameweek_id) do update set starting_points=excluded.starting_points,bench_points=excluded.bench_points,
        captain_points=excluded.captain_points,transfer_hit=excluded.transfer_hit,chip_type=excluded.chip_type,
        provisional_score=excluded.provisional_score,calculation_version=excluded.calculation_version,scoring_details=excluded.scoring_details
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

-- Explain the actual-rating policy while it is active; off remains unchanged.
-- Provider-native score ledger: one API ID, one fixture, a real rating or NULL.
-- These are independent of legacy catalog identity and are available for every
-- recorded gameweek. Unrated participants never get a zero/five-point fallback.
create view app_private.fantasy_api_rating_points with(security_invoker=true) as
select s.fixture_id,s.event_id,s.id as source_id,p->>'externalId' as api_player_id,
 (p->>'appeared')::boolean as appeared,
 case when jsonb_typeof(p->'rating')='number' then (p->>'rating')::numeric end as rating,
 case when (p->>'appeared')::boolean and jsonb_typeof(p->'rating')='number'
 then floor((p->>'rating')::numeric+0.5)::integer
 when (p->>'appeared')::boolean or (p->>'uncertain')::boolean then null else 0 end as points
from app_private.fantasy_api_rating_sources s
cross join lateral jsonb_array_elements(s.players) p
where not exists(select 1 from app_private.fantasy_api_rating_sources newer where newer.fixture_id=s.fixture_id and newer.id>s.id);
revoke all on app_private.fantasy_api_rating_points from public,anon,authenticated,service_role;

create function app_private.fantasy_api_rating_preview(p_gameweek_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d jsonb; teams jsonb; v bigint;
begin
 d:=app_private.fantasy_api_rating_document(p_gameweek_id);
 if d is null then raise exception 'fantasy_gameweek_not_found'; end if;
 if (select count(*) from app.fantasy_lineups where gameweek_id=p_gameweek_id)>100 then
 raise exception 'rating_preview_team_limit'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('teamId',l.fantasy_team_id,'lineupId',l.id,
 'chipType',(select c.chip_type from app.fantasy_chip_uses c where c.gameweek_id=p_gameweek_id and c.fantasy_team_id=l.fantasy_team_id and c.cancelled_at is null),
 'transferHit',(select coalesce(sum(b.point_hit),0) from app.fantasy_transfer_batches b where b.gameweek_id=p_gameweek_id and b.fantasy_team_id=l.fantasy_team_id and b.status='confirmed'),
 'players',(select jsonb_agg(jsonb_build_object('id',lp.fantasy_player_id,'position',pos.code,
 'starter',lp.slot='starter','benchOrder',case when lp.slot='bench' then lp.slot_order else null end,
 'captain',lp.captain,'viceCaptain',lp.vice_captain) order by lp.slot,lp.slot_order)
 from app.fantasy_lineup_players lp join app.fantasy_players fp on fp.id=lp.fantasy_player_id
 join app.fantasy_positions pos on pos.id=fp.position_id where lp.lineup_id=l.id)
 ) order by l.fantasy_team_id),'[]') into teams from app.fantasy_lineups l where l.gameweek_id=p_gameweek_id;
 select greatest(coalesce(max(s.calculation_version),0)+1,g.scoring_input_version,1) into v
 from app.fantasy_gameweeks g left join app_private.fantasy_scoring_snapshots s on s.gameweek_id=g.id
 where g.id=p_gameweek_id group by g.scoring_input_version;
 return d||jsonb_build_object('calculationVersion',v,'inputDigest',encode(extensions.digest(d::text,'sha256'),'hex'),
 'sealed',false,'teams',teams,'afterTeamId',null,'hasMore',false);
end $$;
revoke all on function app_private.fantasy_api_rating_preview(uuid) from public,anon,authenticated,service_role;

create function app_private.fantasy_stage_api_rating_recovery(
 p_gameweek_id uuid,p_digest text,p_results jsonb,p_owner_approval text
) returns jsonb language plpgsql set search_path='' as $$
declare d jsonb; preview jsonb; v bigint;
begin
 if p_owner_approval is null or char_length(p_owner_approval) not between 20 and 1000
 or jsonb_typeof(p_results->'playerResults') is distinct from 'array'
 or jsonb_typeof(p_results->'teamResults') is distinct from 'array' then raise exception 'rating_recovery_approval_and_results_required'; end if;
 perform id from app.fantasy_gameweeks where id=p_gameweek_id for update;
 preview:=app_private.fantasy_api_rating_preview(p_gameweek_id);
 if preview->>'inputDigest' is distinct from p_digest then raise exception 'rating_recovery_inputs_changed'; end if;
 d:=preview-'calculationVersion'-'inputDigest'-'sealed'-'teams'-'afterTeamId'-'hasMore';
 if jsonb_array_length(p_results->'playerResults')<>jsonb_array_length(d->'playerFixtures')
 or jsonb_array_length(p_results->'teamResults')<>jsonb_array_length(preview->'teams') then raise exception 'rating_recovery_result_scope_invalid'; end if;
 v:=(preview->>'calculationVersion')::bigint;
 insert into app_private.fantasy_rating_recovery_plans(gameweek_id,calculation_version,input_digest,owner_approval,previous_state,proposal,results,complete)
 select p_gameweek_id,v,p_digest,p_owner_approval,jsonb_build_object('gameweek',to_jsonb(g),
 'teamResults',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from app.fantasy_team_gameweek_results r where r.gameweek_id=g.id)),
 d,p_results,jsonb_array_length(d->'pendingFixtures')=0 and jsonb_array_length(d->'pendingPlayerIds')=0
 from app.fantasy_gameweeks g where g.id=p_gameweek_id;
 return jsonb_build_object('gameweekId',p_gameweek_id,'staged',true,'published',false,'inputDigest',p_digest);
end $$;
revoke all on function app_private.fantasy_stage_api_rating_recovery(uuid,text,jsonb,text) from public,anon,authenticated,service_role;

-- The native rating path does not use category full/simple selection or
-- FINAL_LIMITED as a substitute for a real rating. All old guards remain for
-- every gameweek that has not been explicitly moved to this input path.
alter function app_private.fantasy_staged_enabled(uuid) rename to fantasy_staged_enabled_before_api_ratings;
revoke all on function app_private.fantasy_staged_enabled_before_api_ratings(uuid) from public,anon,authenticated,service_role;
create function app_private.fantasy_staged_enabled(p_gameweek_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from app.fantasy_gameweeks g join app_private.fantasy_api_rating_seasons p
 on p.season_id=g.fantasy_season_id where g.id=p_gameweek_id and g.sequence_number>=p.from_gameweek)
 then false else app_private.fantasy_staged_enabled_before_api_ratings(p_gameweek_id) end;
$$;
revoke all on function app_private.fantasy_staged_enabled(uuid) from public,anon,authenticated,service_role;
alter function app_private.fantasy_fixture_ready(uuid,uuid,boolean) rename to fantasy_fixture_ready_before_api_ratings;
revoke all on function app_private.fantasy_fixture_ready_before_api_ratings(uuid,uuid,boolean) from public,anon,authenticated,service_role;
create function app_private.fantasy_fixture_ready(p_gameweek_id uuid,p_fixture_id uuid,p_legacy_ready boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from app.fantasy_gameweeks g join app_private.fantasy_api_rating_seasons p
 on p.season_id=g.fantasy_season_id where g.id=p_gameweek_id and g.sequence_number>=p.from_gameweek)
 then coalesce((select s.ready from app_private.fantasy_api_rating_sources s where s.fixture_id=p_fixture_id order by s.id desc limit 1),false)
 else app_private.fantasy_fixture_ready_before_api_ratings(p_gameweek_id,p_fixture_id,p_legacy_ready) end;
$$;
revoke all on function app_private.fantasy_fixture_ready(uuid,uuid,boolean) from public,anon,authenticated,service_role;

alter function api.fantasy_rules(uuid) rename to fantasy_rules_before_api_ratings;
revoke all on function api.fantasy_rules_before_api_ratings(uuid) from public,anon,authenticated,service_role;
create function api.fantasy_rules(p_season_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select api.fantasy_rules_before_api_ratings(p_season_id)||coalesce((select jsonb_build_object('ratingScoring',
 jsonb_build_object('fromGameweek',p.from_gameweek,'noRatingPoints',null,'waitForRating',true))
 from app_private.fantasy_api_rating_seasons p where p.season_id=p_season_id),'{}');
$$;
revoke all on function api.fantasy_rules(uuid) from public;
grant execute on function api.fantasy_rules(uuid) to anon,authenticated,service_role;

create function api.service_fantasy_api_ratings_due(p_limit integer default 3)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare claimed jsonb;
begin
 if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
 if p_limit is null or p_limit not between 0 and 12 then raise exception 'rating_due_limit_invalid'; end if;
 if not pg_try_advisory_xact_lock(hashtextextended('botolago:native-rating-polls',0)) then return '[]'::jsonb; end if;
 with candidates as materialized (
 select distinct f.id,m.external_id,f.kickoff_at from app.fixtures f
 join app.fantasy_fixture_assignments a on a.fixture_id=f.id and a.superseded_at is null
 join app.fantasy_gameweeks g on g.id=a.gameweek_id and g.status in ('live','provisional')
 join app_private.fantasy_api_rating_seasons p on p.season_id=g.fantasy_season_id and g.sequence_number>=p.from_gameweek
 join app_private.football_provider_mappings m on m.provider_name='sofascore' and m.entity_type='fixture' and m.active and m.internal_entity_id=f.id
 left join app_private.fantasy_api_rating_polls poll on poll.fixture_id=f.id
 where f.status='finished' and f.finalized_at is not null
 and (poll.last_fetched_at is null or poll.last_fetched_at<statement_timestamp()-interval '2 hours')
 and (poll.last_attempt_at is null or poll.last_attempt_at<statement_timestamp()-interval '15 minutes')
 order by f.kickoff_at,f.id limit p_limit
 ), reserved as (
 insert into app_private.fantasy_api_rating_polls(fixture_id,last_attempt_at)
 select id,statement_timestamp() from candidates
 on conflict(fixture_id) do update set last_attempt_at=excluded.last_attempt_at returning fixture_id
 ) select coalesce(jsonb_agg(jsonb_build_object('fixtureId',c.id,'eventId',c.external_id)),'[]')
 into claimed from candidates c join reserved r on r.fixture_id=c.id;
 return claimed;
end $$;
revoke all on function api.service_fantasy_api_ratings_due(integer) from public,anon,authenticated;
grant execute on function api.service_fantasy_api_ratings_due(integer) to service_role;

-- Owner-only, versioned cutover of the current unfinished week. Past seals and
-- results are never changed; staged past-week plans remain unpublished while
-- any real rating or selected API identity is missing.
create function app_private.fantasy_activate_api_ratings(
 p_gameweek_id uuid,p_expected_digest text,p_owner_approval text
) returns jsonb language plpgsql set search_path='' as $$
declare g app.fantasy_gameweeks%rowtype; plan app_private.fantasy_rating_recovery_plans%rowtype;
 d jsonb; old_claims text; v bigint; league record; baseline jsonb;
begin
 perform app_private.hold_scheduled_jobs();
 if exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled)
 or exists(select 1 from app_private.fantasy_worker_lease where released_at is null and expires_at>statement_timestamp())
 or exists(select 1 from app_private.notification_email_settings where football_live_refresh_enabled)
 or exists(select 1 from app_private.account_deletion_settings where enabled)
 or exists(select 1 from app_private.manager_card_settings where compute_enabled)
 or exists(select 1 from app_private.rivals_settings where enabled)
 or exists(select 1 from app_private.trophy_settings where enabled)
 or exists(select 1 from net.http_request_queue) then raise exception 'rating_cutover_writers_not_drained'; end if;
 if p_owner_approval is null or char_length(p_owner_approval) not between 20 and 1000 then raise exception 'rating_cutover_approval_required'; end if;
 select * into g from app.fantasy_gameweeks where id=p_gameweek_id for update;
 if not found or g.status not in ('live','provisional') or g.closed_at is not null then raise exception 'rating_cutover_requires_unfinished_week'; end if;
 if exists(select 1 from app_private.fantasy_rating_policy where enabled)
 or exists(select 1 from app_private.fantasy_api_rating_seasons where season_id=g.fantasy_season_id)
 or exists(select 1 from app.fantasy_gameweeks where fantasy_season_id=g.fantasy_season_id and status='finalizing') then raise exception 'rating_cutover_policy_conflict'; end if;
 lock table app_private.fantasy_api_rating_sources,app_private.football_provider_mappings,
 app.fantasy_players,app.team_memberships,app.fantasy_lineups,app.fantasy_lineup_players in share mode;
 d:=app_private.fantasy_api_rating_document(g.id);
 if encode(extensions.digest(d::text,'sha256'),'hex') is distinct from p_expected_digest
 or jsonb_array_length(d->'fixtures')=0 then raise exception 'rating_cutover_inputs_changed_or_no_ratings'; end if;
 select * into plan from app_private.fantasy_rating_recovery_plans where gameweek_id=g.id and input_digest=p_expected_digest order by id desc limit 1;
 if not found or plan.owner_approval<>p_owner_approval then raise exception 'rating_cutover_reviewed_plan_required'; end if;
 select jsonb_agg(jsonb_build_object('gameweekId',w.id,'results',(select jsonb_agg(to_jsonb(r) order by r.id)
 from app.fantasy_team_gameweek_results r where r.gameweek_id=w.id),'sealDigests',(select jsonb_agg(jsonb_build_object('version',s.calculation_version,'digest',s.input_digest,'payload',md5(s.payload::text)) order by s.calculation_version)
 from app_private.fantasy_scoring_snapshots s where s.gameweek_id=w.id and s.sealed_at is not null)) order by w.id)
 into baseline from app.fantasy_gameweeks w where w.fantasy_season_id=g.fantasy_season_id and w.status in ('finalized','corrected');
 insert into app_private.fantasy_api_rating_seasons(season_id,from_gameweek,owner_approval) values(g.fantasy_season_id,g.sequence_number,p_owner_approval);
 old_claims:=current_setting('request.jwt.claims',true);
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 v:=(api.service_prepare_fantasy_live_scoring(g.id)->>'calculationVersion')::bigint;
 perform api.service_get_fantasy_scoring_snapshot(g.id,v,null,100);
 perform api.service_persist_fantasy_scoring_results(g.id,v,p_expected_digest,plan.results->'playerResults',plan.results->'teamResults');
 perform api.service_recalculate_fantasy_rankings(g.fantasy_season_id,g.id,null,v);
 perform api.service_recalculate_fantasy_rankings(g.fantasy_season_id,null,null,v);
 for league in select id from app.fantasy_leagues where fantasy_season_id=g.fantasy_season_id and active loop
 perform api.service_recalculate_fantasy_rankings(g.fantasy_season_id,g.id,league.id,v);
 perform api.service_recalculate_fantasy_rankings(g.fantasy_season_id,null,league.id,v);
 end loop;
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 if baseline is distinct from (select jsonb_agg(jsonb_build_object('gameweekId',w.id,'results',(select jsonb_agg(to_jsonb(r) order by r.id)
 from app.fantasy_team_gameweek_results r where r.gameweek_id=w.id),'sealDigests',(select jsonb_agg(jsonb_build_object('version',s.calculation_version,'digest',s.input_digest,'payload',md5(s.payload::text)) order by s.calculation_version)
 from app_private.fantasy_scoring_snapshots s where s.gameweek_id=w.id and s.sealed_at is not null)) order by w.id)
 from app.fantasy_gameweeks w where w.fantasy_season_id=g.fantasy_season_id and w.status in ('finalized','corrected')) then raise exception 'rating_cutover_changed_final_history'; end if;
 return jsonb_build_object('gameweekId',g.id,'calculationVersion',v,'pendingFixtures',jsonb_array_length(d->'pendingFixtures'),
 'pendingPlayers',jsonb_array_length(d->'pendingPlayerIds'),'finalized',false);
end $$;
revoke all on function app_private.fantasy_activate_api_ratings(uuid,text,text) from public,anon,authenticated,service_role;

-- Native rating weeks do not run legacy category mode selection. The trusted
-- snapshot still carries the v3 rating rules and the same pending/seal guards.
alter function api.service_fantasy_lifecycle_state(uuid) rename to fantasy_lifecycle_state_before_api_ratings;
alter function api.fantasy_lifecycle_state_before_api_ratings(uuid) set schema app_private;
revoke all on function app_private.fantasy_lifecycle_state_before_api_ratings(uuid) from public,anon,authenticated,service_role;
create function api.service_fantasy_lifecycle_state(p_gameweek_id uuid)
returns jsonb language sql volatile security definer set search_path='' as $$
 select app_private.fantasy_lifecycle_state_before_api_ratings(p_gameweek_id)
 ||case when exists(select 1 from app.fantasy_gameweeks g join app_private.fantasy_api_rating_seasons p
 on p.season_id=g.fantasy_season_id where g.id=p_gameweek_id and g.sequence_number>=p.from_gameweek)
 then jsonb_build_object('adaptiveScoringEnabled',false,'apiNativeRatings',true) else '{}'::jsonb end;
$$;
revoke all on function api.service_fantasy_lifecycle_state(uuid) from public,anon,authenticated;
grant execute on function api.service_fantasy_lifecycle_state(uuid) to service_role;
$native_rating_source$]);
do $apply$
declare source text;
begin
 select statements[1] into source from supabase_migrations.schema_migrations where version='20261018173321';
 if encode(extensions.digest(source,'sha256'),'hex')<>'f7cf370891518869407db83e223837f8725da9f9d154c3dd490c1ae216216e82' then raise exception 'migration_source_hash_mismatch'; end if;
 execute source;
end $apply$;
do $verify$
begin
 if md5((select prosrc from pg_proc where oid='api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure))<>'8718cbd8ed1dfea8bac371c8f6be1a3b' then raise exception 'rating_writer_body_mismatch'; end if;
 if exists(select 1 from app_private.fantasy_api_rating_seasons) or exists(select 1 from app_private.fantasy_api_rating_sources)
 or exists(select 1 from app_private.fantasy_rating_recovery_plans) then raise exception 'migration_changed_rating_data'; end if;
 if exists(select 1 from native_rating_rows_before b join (
select 'results' as name,md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'')) as digest from app.fantasy_team_gameweek_results t
union all select 'snapshots',md5(coalesce(jsonb_agg((to_jsonb(t)-'payload')||jsonb_build_object('payloadDigest',md5(t.payload::text)) order by t.gameweek_id,t.calculation_version)::text,'')) from app_private.fantasy_scoring_snapshots t
union all select 'events',md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'')) from app.fantasy_player_point_events t
union all select 'identities',md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'')) from app_private.football_provider_mappings t
union all select 'aliases',md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'')) from app_private.sofascore_player_aliases t
union all select 'policy',md5(coalesce(jsonb_agg(to_jsonb(t) order by t.season_id)::text,'')) from app_private.fantasy_rating_policy t
 ) a using(name) where a.digest is distinct from b.digest) then raise exception 'migration_changed_scores_or_identities'; end if;
 if has_function_privilege('authenticated','api.service_record_fantasy_api_ratings(uuid,text,jsonb,timestamptz)','execute')
 or has_function_privilege('service_role','app_private.fantasy_activate_api_ratings(uuid,text,text)','execute') then raise exception 'native_rating_privilege_mismatch'; end if;
end $verify$;
select app_private.fantasy_automation_configure((select lifecycle_tick_enabled from native_rating_switch_before));
rollback;
select exists(select 1 from supabase_migrations.schema_migrations where version='20261018173321') as applied;
