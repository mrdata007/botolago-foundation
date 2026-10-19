-- Unattended, approved-ID-only collection. Ships OFF. No production activation.
-- Existing season discovery -> this queue -> existing observation recorder ->
-- existing ten-minute Fantasy worker. No scoring rule or deadline is changed.
create table app_private.sofascore_collection_settings (
  id boolean primary key default true check(id), enabled boolean not null default false,
  holder uuid, lease_until timestamptz, run_id uuid, worker_token uuid,
  quota_month date not null default date_trunc('month', now())::date,
  reserved_calls integer not null default 0 check(reserved_calls between 0 and 1600),
  lease_calls integer not null default 0 check(lease_calls between 0 and 8),
  blocked_until timestamptz, last_attempt_at timestamptz, last_success_at timestamptz,
  enabled_at timestamptz not null default statement_timestamp(),
  last_error text, quota_remaining integer check(quota_remaining >= 0)
);
insert into app_private.sofascore_collection_settings(id) values(true);
create table app_private.sofascore_collection_queue (
  fixture_id uuid primary key references app.fixtures(id), event_id text not null check(event_id ~ '^[1-9][0-9]{0,11}$'),
  attempts integer not null default 0 check(attempts between 0 and 10),
  next_attempt_at timestamptz not null default now(), last_attempt_at timestamptz,
  last_success_at timestamptz, last_error text, missing_ratings integer,
  complete boolean not null default false, last_digest text, claimed_by uuid
);
alter table app_private.sofascore_collection_settings enable row level security;
alter table app_private.sofascore_collection_settings force row level security;
alter table app_private.sofascore_collection_queue enable row level security;
alter table app_private.sofascore_collection_queue force row level security;
revoke all on app_private.sofascore_collection_settings, app_private.sofascore_collection_queue from public, anon, authenticated, service_role;

create function app_private.sofascore_collection_configure(p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_enabled is null then raise exception 'collection_configuration_invalid'; end if;
  update app_private.sofascore_collection_settings set enabled=p_enabled, enabled_at=case when p_enabled and not enabled then statement_timestamp() else enabled_at end where id;
end $$;
revoke all on function app_private.sofascore_collection_configure(boolean) from public,anon,authenticated,service_role;
grant execute on function app_private.sofascore_collection_configure(boolean) to postgres;

-- Read-only discovery from the calendar already refreshed by the hourly SofaScore
-- season worker. No caller chooses event IDs. Unapproved fixtures are never guessed.
create function app_private.sofascore_collection_candidates()
returns table(fixture_id uuid,event_id text,kickoff_at timestamptz,season_id text,home_external text,away_external text)
language sql stable security definer set search_path='' as $$
 select f.id,m.external_id,f.kickoff_at,
  (select x.external_id from app_private.football_provider_mappings x where x.provider_name='sofascore' and x.entity_type='season' and x.active and x.internal_entity_id=f.season_id limit 1),
  (select x.external_id from app_private.football_provider_mappings x where x.provider_name='sofascore' and x.entity_type='team' and x.active and x.internal_entity_id=f.home_team_id limit 1),
  (select x.external_id from app_private.football_provider_mappings x where x.provider_name='sofascore' and x.entity_type='team' and x.active and x.internal_entity_id=f.away_team_id limit 1)
 from app.fixtures f join app.seasons s on s.id=f.season_id and s.is_current
 join app_private.football_provider_mappings m on m.internal_entity_id=f.id and m.provider_name='sofascore' and m.entity_type='fixture' and m.active
 where f.status='finished' and f.finalized_at is not null and f.kickoff_at <= statement_timestamp()
 and f.kickoff_at + app_private.sofascore_fantasy_hold_window() > statement_timestamp()
 and exists(select 1 from app_private.football_provider_mappings c where c.provider_name='sofascore' and c.entity_type='competition' and c.active and c.external_id='937' and c.internal_entity_id=f.competition_id)
 and exists(select 1 from app.fantasy_fixture_assignments a join app.fantasy_gameweeks g on g.id=a.gameweek_id
   where a.fixture_id=f.id and a.superseded_at is null and g.status not in ('finalizing','finalized','corrected') and app_private.fantasy_adaptive_enabled(g.id))
 and not exists(select 1 from app_private.fantasy_fixture_observations o where o.fixture_id=f.id and o.source='reviewed-correction');
$$;
revoke all on function app_private.sofascore_collection_candidates() from public,anon,authenticated,service_role;

create function api.service_sofascore_collection_plan()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
 return jsonb_build_object('enabled',(select enabled from app_private.sofascore_collection_settings where id),
 'seasonId',(select m.external_id from app.seasons s join app_private.football_provider_mappings m on m.internal_entity_id=s.id and m.provider_name='sofascore' and m.entity_type='season' and m.active
  where s.is_current and exists(select 1 from app_private.football_provider_mappings c where c.provider_name='sofascore' and c.entity_type='competition' and c.external_id='937' and c.active and c.internal_entity_id=s.competition_id) limit 1),
 'due',coalesce((select jsonb_agg(to_jsonb(c)) from (
 select c.* from app_private.sofascore_collection_candidates() c left join app_private.sofascore_collection_queue q on q.fixture_id=c.fixture_id
 where q.fixture_id is null or (not q.complete and q.attempts<10 and q.next_attempt_at<=statement_timestamp())
 order by coalesce(q.next_attempt_at,c.kickoff_at), c.fixture_id limit 2) c),'[]'::jsonb));
end $$;

create function api.service_sofascore_collection_claim(p_holder uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare s app_private.sofascore_collection_settings%rowtype; plan jsonb; rid uuid; worker jsonb;
begin
 if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
 if p_holder is null then raise exception 'collection_holder_required'; end if;
 select * into s from app_private.sofascore_collection_settings where id for update;
 if not s.enabled or app_private.football_data_source() <> 'sofascore' then return jsonb_build_object('status','disabled'); end if;
 if s.lease_until>statement_timestamp() then return jsonb_build_object('status','busy'); end if;
 if s.blocked_until>statement_timestamp() then return jsonb_build_object('status','cooldown'); end if;
 if s.quota_month<>date_trunc('month',statement_timestamp())::date then
  s.reserved_calls:=0;
  update app_private.sofascore_collection_settings set quota_month=date_trunc('month',statement_timestamp())::date,reserved_calls=0,quota_remaining=null where id;
 end if;
 if s.reserved_calls>=1600 or (s.quota_month=date_trunc('month',statement_timestamp())::date and s.quota_remaining<=1000) or app_private.rapidapi_calls_this_month()>=9000 then return jsonb_build_object('status','budget_stop'); end if;
 plan:=api.service_sofascore_collection_plan();
 if jsonb_array_length(plan->'due')=0 then return jsonb_build_object('status','idle'); end if;
 if s.run_id is not null then
   perform api.complete_football_ingestion(s.run_id,'failed',jsonb_build_object('reason','collection_lease_expired'));
 end if;
 worker:=api.service_fantasy_worker_lease_acquire('edge:ratings-'||p_holder::text,240);
 if (worker->>'acquired')::boolean is not true then return jsonb_build_object('status','scoring_lease_held_or_disabled'); end if;
 rid:=api.begin_football_ingestion('sofascore','player_ratings',jsonb_build_object('job','ratings_collection'), '{}');
 update app_private.sofascore_collection_settings set holder=p_holder,lease_until=statement_timestamp()+interval '4 minutes',
  run_id=rid,worker_token=(worker->>'token')::uuid,lease_calls=0,last_attempt_at=statement_timestamp() where id;
 insert into app_private.sofascore_collection_queue(fixture_id,event_id)
 select (x->>'fixture_id')::uuid,x->>'event_id' from jsonb_array_elements(plan->'due') x on conflict do nothing;
 update app_private.sofascore_collection_queue q set claimed_by=p_holder, attempts=q.attempts+1,last_attempt_at=statement_timestamp(),
  next_attempt_at=coalesce((select min(c.kickoff_at+make_interval(hours=>h)) from app_private.sofascore_collection_candidates() c cross join unnest(array[6,24,72,144,216,288,360,432,500]) h
    where c.fixture_id=q.fixture_id and c.kickoff_at+make_interval(hours=>h)>statement_timestamp()+interval '5 minutes'),statement_timestamp()+interval '1 day')
 where q.fixture_id in (select (x->>'fixture_id')::uuid from jsonb_array_elements(plan->'due') x);
 return plan||jsonb_build_object('status','claimed','runId',rid);
end $$;

-- Reserve BEFORE every HTTP attempt. A crash may overcount one reservation,
-- never undercount. Shared monthly counting includes all provider jobs.
create function api.service_sofascore_collection_reserve(p_holder uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare s app_private.sofascore_collection_settings%rowtype; global_calls bigint; counted bigint;
begin
 if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
 select * into s from app_private.sofascore_collection_settings where id for update;
 if not s.enabled or s.holder is distinct from p_holder or s.lease_until<=statement_timestamp() then return false; end if;
 if s.quota_month<>date_trunc('month',statement_timestamp())::date then
  s.reserved_calls:=0;
  update app_private.sofascore_collection_settings set quota_month=date_trunc('month',statement_timestamp())::date,reserved_calls=0,quota_remaining=null where id;
 end if;
 select coalesce(sum(calls),0) into counted from app_private.rapidapi_call_counts where job='ratings_collection' and day>=date_trunc('month',statement_timestamp())::date;
 global_calls:=app_private.rapidapi_calls_this_month()+greatest(0,s.reserved_calls-counted);
 if s.reserved_calls>=1600 or global_calls>=9000 or s.lease_calls>=8 or s.blocked_until>statement_timestamp() then return false; end if;
 update app_private.sofascore_collection_settings set reserved_calls=reserved_calls+1,lease_calls=lease_calls+1 where id;
 return true;
end $$;

-- The recorder and queue state commit under the lease row lock. An expired old
-- holder cannot write after a successor acquires the lease (a database fence).
create function api.service_sofascore_collection_commit(p_holder uuid,p_fixture_id uuid,p_request jsonb,p_meta jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare s app_private.sofascore_collection_settings%rowtype; q app_private.sofascore_collection_queue%rowtype;
 result jsonb:='{}'; code text; next_at timestamptz; kick timestamptz; missing integer; valid boolean; staged jsonb;
begin
 if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
 select * into s from app_private.sofascore_collection_settings where id for update;
 if not s.enabled or s.holder is distinct from p_holder or s.lease_until<=statement_timestamp() then raise exception 'collection_lease_lost'; end if;
 perform 1 from app_private.fantasy_worker_lease where id and token=s.worker_token and released_at is null and expires_at>statement_timestamp() for update;
 if not found then raise exception 'collection_scoring_lease_lost'; end if;
 select * into q from app_private.sofascore_collection_queue where fixture_id=p_fixture_id for update;
 if not found or q.claimed_by is distinct from p_holder or q.complete or q.attempts>10 then raise exception 'collection_fixture_not_claimed'; end if;
 if p_meta is null or coalesce(p_meta->>'code','') !~ '^[a-z][a-z0-9_]{0,79}$' then raise exception 'collection_metadata_invalid'; end if;
 code:=p_meta->>'code';
 missing:=case when p_meta->>'missingRatings' ~ '^[0-9]{1,3}$' then (p_meta->>'missingRatings')::integer else null end;
 valid:=coalesce((p_meta->>'validated')::boolean,false) and p_request is not null;
 if p_request is not null and exists(select 1 from app_private.sofascore_staged_stats where fixture_id=p_fixture_id and coverage='full') and p_meta->>'coverage'<>'full' then
  valid:=false; code:='coverage_regressed'; p_request:=null;
 end if;
 if p_request is not null then
  if not exists(select 1 from app_private.sofascore_collection_candidates() c where c.fixture_id=p_fixture_id and c.event_id=p_request->>'sofascoreEventId') then raise exception 'collection_fixture_no_longer_eligible'; end if;
  -- Every identity is rechecked transactionally by the existing recorder. No auto-mapping.
  begin
   if q.last_digest is not null and q.last_digest=p_meta->>'digest' then
    result:=jsonb_build_object('created',false,'unchanged',true);
   else
   result:=api.service_record_sofascore_fantasy_observation(p_fixture_id,p_request,false);
   end if;
   staged:=api.service_sofascore_staged_record_pull(p_fixture_id,jsonb_build_object(
     'outcome','pulled','coverage',p_meta->>'coverage','dataDigest',p_meta->>'digest',
     'requests',4,'matchData',p_meta->'matchData')
     ||case when result ? 'observationId' then jsonb_build_object('observationId',result->'observationId') else '{}'::jsonb end);
   begin
    perform api.service_sync_sofascore_player_performances(p_fixture_id,1,coalesce(p_meta->'ratings','{}'::jsonb));
   exception when others then result:=result||jsonb_build_object('performanceSync','pending'); end;
  exception when others then
   code:=case when sqlerrm ~ '^(sofascore|fantasy|adaptive)_[a-z0-9_]{1,60}$' then sqlerrm else 'observation_rejected' end;
   valid:=false;
  end;
 end if;
 select kickoff_at into kick from app.fixtures where id=p_fixture_id;
 select min(kick+make_interval(hours=>h)) into next_at from unnest(array[6,24,72,144,216,288,360,432,500]) h
 where kick+make_interval(hours=>h)>statement_timestamp()+interval '5 minutes'
 and kick+make_interval(hours=>h)<kick+app_private.sofascore_fantasy_hold_window();
 update app_private.sofascore_collection_queue set last_attempt_at=statement_timestamp(),
 next_attempt_at=coalesce(case when staged->>'status'='PROVISIONAL' then
   case when missing=0 then (staged->>'nextPullAt')::timestamptz else least(next_at,(staged->>'nextPullAt')::timestamptz) end else next_at end,
   kick+app_private.sofascore_fantasy_hold_window()),
 complete=(valid and missing=0 and p_request is not null and (coalesce(staged->>'status','FINAL')<>'PROVISIONAL' or not exists(
   select 1 from app.fantasy_fixture_assignments a join app.fantasy_gameweeks g on g.id=a.gameweek_id
   where a.fixture_id=p_fixture_id and a.superseded_at is null and app_private.fantasy_staged_enabled(g.id)))),
 last_success_at=case when valid then statement_timestamp() else last_success_at end,
 missing_ratings=missing,last_error=case when valid then null else code end,
 last_digest=coalesce(p_meta->>'digest',last_digest) where fixture_id=p_fixture_id;
 if valid then update app_private.sofascore_collection_settings set last_success_at=statement_timestamp(),last_error=null where id; end if;
 return result||jsonb_build_object('code',code,'validated',valid,'missingRatings',missing);
end $$;

create function api.service_sofascore_collection_finish(p_holder uuid,p_summary jsonb)
returns void language plpgsql volatile security definer set search_path='' as $$
declare s app_private.sofascore_collection_settings%rowtype; code text; cool integer;
begin
 if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
 select * into s from app_private.sofascore_collection_settings where id for update;
 if s.holder is distinct from p_holder then raise exception 'collection_lease_lost'; end if;
 code:=case when p_summary->>'code' ~ '^[a-z][a-z0-9_]{0,79}$' then p_summary->>'code' else 'collection_failed' end;
 cool:=case when p_summary->>'cooldownSeconds' ~ '^[0-9]{1,9}$' then (p_summary->>'cooldownSeconds')::integer else 0 end;
 perform api.complete_football_ingestion(s.run_id,
  case when code='collected' then 'succeeded' else 'partial' end,
  jsonb_build_object('job','ratings_collection','summary',p_summary,'requests',s.lease_calls,'quotaReserved',s.reserved_calls),
  p_records_fetched=>coalesce((p_summary->>'fetched')::integer,0),
  p_records_validated=>coalesce((p_summary->>'validated')::integer,0),
  p_records_updated=>coalesce((p_summary->>'created')::integer,0),
  p_error_code=>case when code='collected' then null else code end);
 perform api.service_fantasy_worker_lease_release(s.worker_token);
 update app_private.sofascore_collection_settings set holder=null,lease_until=null,run_id=null,worker_token=null,
  blocked_until=case when cool>0 then statement_timestamp()+make_interval(secs=>cool) else blocked_until end,
  quota_remaining=case when p_summary->>'quotaRemaining' ~ '^[0-9]{1,9}$' then (p_summary->>'quotaRemaining')::integer else quota_remaining end,
  last_error=case when code='collected' then null else code end where id;
end $$;

-- Existing cron wakes this function every ten minutes. Preserve hourly fixture
-- discovery priority and reuse its dispatcher/authentication for the new job.
alter table app_private.football_refresh_dispatch drop constraint football_refresh_dispatch_job_check;
alter table app_private.football_refresh_dispatch add constraint football_refresh_dispatch_job_check check(job in ('fixtures','season_fixtures','ratings_collection'));
alter function app_private.football_refresh_invoke(text,text) rename to football_refresh_invoke_before_collection;
create function app_private.football_refresh_invoke(p_functions_base_url text,p_job text)
returns text language plpgsql volatile security definer set search_path='' as $$
declare d app_private.football_refresh_dispatch%rowtype; request_id bigint;
begin
 if p_job<>'ratings_collection' then return app_private.football_refresh_invoke_before_collection(p_functions_base_url,p_job); end if;
 select * into d from app_private.football_refresh_dispatch where id for update;
 if d.dispatched_at>statement_timestamp()-interval '4 minutes' and not exists(select 1 from net._http_response r where r.id=d.request_id and not coalesce(r.timed_out,false) and coalesce(r.error_msg,'') not ilike '%timeout%') then return 'busy'; end if;
 request_id:=app_private.invoke_scheduled_function(p_functions_base_url,'football-live-refresh',jsonb_build_object('job',p_job));
 if request_id is null then return 'not_configured'; end if;
 update app_private.football_refresh_dispatch set job=p_job,request_id=request_id,dispatched_at=statement_timestamp(),updated_at=statement_timestamp() where id;
 return 'invoked';
end $$;
alter function app_private.football_season_refresh_tick() rename to football_season_refresh_tick_before_collection;
create function app_private.football_season_refresh_tick()
returns text language plpgsql volatile security definer set search_path='' as $$
declare outcome text; plan jsonb; url text;
begin
 outcome:=app_private.football_season_refresh_tick_before_collection();
 if outcome not in ('waiting','idle') then return outcome; end if;
 if not exists(select 1 from app_private.sofascore_collection_settings where id and enabled and (blocked_until is null or blocked_until<=statement_timestamp()) and (lease_until is null or lease_until<=statement_timestamp())) then return outcome; end if;
 -- The private discovery function is safe here; the public plan requires a service JWT.
 perform app_private.sofascore_staged_settle_due(statement_timestamp());
 update app_private.sofascore_collection_queue q set complete=true
 from app_private.sofascore_staged_stats s where q.fixture_id=s.fixture_id and s.status='FINAL' and q.missing_ratings=0 and not q.complete;
 if not exists(select 1 from app_private.sofascore_collection_candidates() c left join app_private.sofascore_collection_queue q using(fixture_id)
  where q.fixture_id is null or (not q.complete and q.attempts<10 and q.next_attempt_at<=statement_timestamp())) then return 'idle'; end if;
 select functions_base_url into url from app_private.notification_email_settings where id;
 return app_private.football_refresh_invoke(url,'ratings_collection');
end $$;

-- Existing operations health/alert surface, plus existing ingestion run history.
create function app_private.sofascore_collection_health()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('name','sofascore_collection','status',case when not s.enabled then 'ok'
  when coalesce(s.last_success_at,s.last_attempt_at,s.enabled_at)<statement_timestamp()-interval '2 hours' and s.enabled_at<statement_timestamp()-interval '2 hours' and exists(
   select 1 from app_private.sofascore_collection_candidates() c left join app_private.sofascore_collection_queue q using(fixture_id)
   where (q.fixture_id is null and c.kickoff_at<statement_timestamp()-interval '5 hours') or
    (not q.complete and q.attempts<10 and q.next_attempt_at<statement_timestamp()-interval '2 hours')) then 'fail'
  when s.last_error is not null or exists(select 1 from app_private.sofascore_collection_queue q where not q.complete) then 'warn' else 'ok' end,
 'detail',jsonb_build_object('enabled',s.enabled,'lastSuccessfulCollectionAt',s.last_success_at,'lastAttemptAt',s.last_attempt_at,
 'lastError',s.last_error,'reservedMonthlyRequests',s.reserved_calls,'monthlyBudget',1600,'quotaRemaining',s.quota_remaining,
 'blockedUntil',s.blocked_until,'pendingFixtures',(select count(*) from app_private.sofascore_collection_queue where not complete))::text)
 from app_private.sofascore_collection_settings s where id;
$$;
alter function app_private.ops_health_checks() rename to ops_health_checks_before_sofascore_collection;
create function app_private.ops_health_checks()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare result jsonb:=app_private.ops_health_checks_before_sofascore_collection(); checks jsonb;
begin
 checks:=coalesce(result->'checks','[]'::jsonb)||app_private.sofascore_collection_health();
 return result||jsonb_build_object('checks',checks,'status',case
 when exists(select 1 from jsonb_array_elements(checks) c where c->>'status'='fail') then 'fail'
 when exists(select 1 from jsonb_array_elements(checks) c where c->>'status'='warn') then 'warn' else 'ok' end);
end $$;

revoke all on function api.service_sofascore_collection_plan(),api.service_sofascore_collection_claim(uuid),api.service_sofascore_collection_reserve(uuid),api.service_sofascore_collection_commit(uuid,uuid,jsonb,jsonb),api.service_sofascore_collection_finish(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function api.service_sofascore_collection_plan(),api.service_sofascore_collection_claim(uuid),api.service_sofascore_collection_reserve(uuid),api.service_sofascore_collection_commit(uuid,uuid,jsonb,jsonb),api.service_sofascore_collection_finish(uuid,jsonb) to service_role;
revoke all on function app_private.football_refresh_invoke(text,text),app_private.football_refresh_invoke_before_collection(text,text),app_private.football_season_refresh_tick(),app_private.football_season_refresh_tick_before_collection(),app_private.sofascore_collection_health(),app_private.ops_health_checks(),app_private.ops_health_checks_before_sofascore_collection() from public,anon,authenticated,service_role;
grant execute on function app_private.ops_health_checks(),app_private.football_season_refresh_tick() to postgres;
