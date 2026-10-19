-- Owner approved 2026-10-19: actual rating stays NULL; a verified short
-- appearance may settle at zero points after 24h and two successful reads.
-- No manager compensation, catalog identities or locked selections change.
do $$begin
 if md5((select prosrc from pg_proc where oid='app_private.fantasy_actual_ratings_pending(jsonb)'::regprocedure))<>'413f352e52bf1b311eb12b0e1d1e5136'then raise exception 'not_rated_pending_baseline_changed';end if;
end $$;
create table app_private.fantasy_not_rated_policy(
 id boolean primary key default true check(id),
 enabled boolean not null default false,
 approved_at timestamptz,
 owner_approval text,
 check(not enabled or(approved_at is not null and char_length(owner_approval)>=20))
);
insert into app_private.fantasy_not_rated_policy(id)values(true);
alter table app_private.fantasy_not_rated_policy enable row level security;
alter table app_private.fantasy_not_rated_policy force row level security;
revoke all on app_private.fantasy_not_rated_policy from public,anon,authenticated,service_role;
create table app_private.fantasy_rating_checks(
 id bigint generated always as identity primary key,
 source_id bigint not null references app_private.fantasy_api_rating_sources(id),
 checked_at timestamptz not null,
 provenance text not null check(provenance in('source_receipt','successful_poll','live_receipt')),
 unique(source_id,checked_at)
);
create index fantasy_rating_checks_source_time on app_private.fantasy_rating_checks(source_id,checked_at);
create table app_private.fantasy_not_rated_settlements(
 source_id bigint not null references app_private.fantasy_api_rating_sources(id),
 api_player_id text not null check(api_player_id~'^[0-9]{1,12}$'),
 policy_version integer not null default 1 check(policy_version=1),
 minutes integer not null check(minutes between 1 and 9),
 first_check_id bigint not null references app_private.fantasy_rating_checks(id),
 second_check_id bigint not null references app_private.fantasy_rating_checks(id),
 settled_at timestamptz not null default statement_timestamp(),
 primary key(source_id,api_player_id),
 check(first_check_id<>second_check_id)
);
alter table app_private.fantasy_rating_checks enable row level security;
alter table app_private.fantasy_rating_checks force row level security;
alter table app_private.fantasy_not_rated_settlements enable row level security;
alter table app_private.fantasy_not_rated_settlements force row level security;
revoke all on app_private.fantasy_rating_checks,app_private.fantasy_not_rated_settlements from public,anon,authenticated,service_role;

create function app_private.fantasy_not_rated_evidence_immutable()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'not_rated_evidence_immutable';end $$;
revoke all on function app_private.fantasy_not_rated_evidence_immutable()from public,anon,authenticated,service_role;
create trigger fantasy_rating_checks_immutable before update or delete on app_private.fantasy_rating_checks
for each row execute function app_private.fantasy_not_rated_evidence_immutable();
create trigger fantasy_not_rated_settlements_immutable before update or delete on app_private.fantasy_not_rated_settlements
for each row execute function app_private.fantasy_not_rated_evidence_immutable();

-- Existing timestamps are evidence of successful validated ingestions, not
-- fabricated old checks. The poll clock advances only after full validation.
insert into app_private.fantasy_rating_checks(source_id,checked_at,provenance)
select id,created_at,'source_receipt'from app_private.fantasy_api_rating_sources;
insert into app_private.fantasy_rating_checks(source_id,checked_at,provenance)
select s.id,p.last_fetched_at,'successful_poll'
from app_private.fantasy_api_rating_polls p
join lateral(select *from app_private.fantasy_api_rating_sources s where s.fixture_id=p.fixture_id order by id desc limit 1)s on true
where p.last_fetched_at>s.created_at and p.last_fetched_at<=statement_timestamp()
on conflict do nothing;

create function app_private.fantasy_not_rated_evidence(p_source_id bigint,p_api_id text)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('policyVersion',d.policy_version,'sourceId',d.source_id,'minutes',d.minutes,
 'firstCheckId',d.first_check_id,'secondCheckId',d.second_check_id,
 'firstCheckedAt',a.checked_at,'secondCheckedAt',b.checked_at,'settledAt',d.settled_at)
 from app_private.fantasy_not_rated_settlements d
 join app_private.fantasy_rating_checks a on a.id=d.first_check_id
 join app_private.fantasy_rating_checks b on b.id=d.second_check_id
 join app_private.fantasy_api_rating_sources earlier on earlier.id=a.source_id
 join app_private.fantasy_api_rating_sources s on s.id=d.source_id
 join app.fixtures f on f.id=s.fixture_id
 where d.source_id=p_source_id and d.api_player_id=p_api_id
 and f.status='finished'and f.finalized_at<=d.settled_at-interval '24 hours'
 and b.checked_at>=a.checked_at+interval '24 hours'and b.checked_at<=d.settled_at
 and a.checked_at>=f.finalized_at and b.source_id=s.id and earlier.fixture_id=f.id
 and exists(select 1 from jsonb_array_elements(earlier.players)p where p->>'externalId'=d.api_player_id
  and p->>'appeared'='true'and p->>'uncertain'='false'and p->'rating'='null'::jsonb
  and(p->>'minutes')::integer=d.minutes)
 and exists(select 1 from jsonb_array_elements(s.players)p where p->>'externalId'=d.api_player_id
  and p->>'appeared'='true'and p->>'uncertain'='false'and p->'rating'='null'::jsonb
  and(p->>'minutes')::integer=d.minutes);
$$;
revoke all on function app_private.fantasy_not_rated_evidence(bigint,text)from public,anon,authenticated,service_role;

create function app_private.fantasy_settle_not_rated(p_source_id bigint)
returns integer language plpgsql security definer set search_path='' as $$
declare s app_private.fantasy_api_rating_sources%rowtype; f app.fixtures%rowtype;
 p jsonb; first_check bigint; second_check bigint; second_at timestamptz;n integer:=0;added integer;
begin
 if not exists(select 1 from app_private.fantasy_not_rated_policy where id and enabled)then return 0;end if;
 select *into s from app_private.fantasy_api_rating_sources where id=p_source_id;
 if not found then return 0;end if;
 select *into f from app.fixtures where id=s.fixture_id;
 perform g.id from app.fantasy_gameweeks g join app.fantasy_fixture_assignments a on a.gameweek_id=g.id
 where a.fixture_id=f.id and a.superseded_at is null order by g.id for update of g;
 if exists(select 1 from app.fantasy_gameweeks g join app.fantasy_fixture_assignments a on a.gameweek_id=g.id
 where a.fixture_id=f.id and a.superseded_at is null and g.status='finalizing')then
 raise exception using errcode='PT409',message='fantasy_api_ratings_sealed';end if;
 if f.status<>'finished'or f.finalized_at is null or f.finalized_at>statement_timestamp()-interval '24 hours'then return 0;end if;
 if exists(select 1 from app_private.fantasy_api_rating_sources newer where newer.fixture_id=s.fixture_id and newer.id>s.id)then return 0;end if;
 select id,checked_at into second_check,second_at from app_private.fantasy_rating_checks
 where source_id=s.id and checked_at<=statement_timestamp()order by checked_at desc limit 1;
 if second_check is null then return 0;end if;
 for p in select value from jsonb_array_elements(s.players)where value->>'appeared'='true'
  and value->>'uncertain'='false'and value->'rating'='null'::jsonb
  and jsonb_typeof(value->'minutes')='number'and(value->>'minutes')::integer between 1 and 9
 loop
  -- The same player/minutes must be verified in two separate reads >=24h
  -- apart. A conflicting observation in between resets the evidence window.
  select c.id into first_check from app_private.fantasy_rating_checks c
  join app_private.fantasy_api_rating_sources earlier on earlier.id=c.source_id
  where earlier.fixture_id=f.id and c.checked_at>=f.finalized_at
   and c.checked_at<=second_at-interval '24 hours'
   and exists(select 1 from jsonb_array_elements(earlier.players)x
    where x->>'externalId'=p->>'externalId'and x->>'appeared'='true'and x->>'uncertain'='false'
    and x->'rating'='null'::jsonb and x->'minutes'=p->'minutes')
   and not exists(select 1 from app_private.fantasy_rating_checks conflict
    join app_private.fantasy_api_rating_sources conflicting on conflicting.id=conflict.source_id
    where conflicting.fixture_id=f.id and conflict.checked_at>c.checked_at and conflict.checked_at<=second_at
    and not exists(select 1 from jsonb_array_elements(conflicting.players)x
      where x->>'externalId'=p->>'externalId'and x->>'appeared'='true'and x->>'uncertain'='false'
      and x->'rating'='null'::jsonb and x->'minutes'=p->'minutes'))
  order by c.checked_at,c.id limit 1;
  if first_check is not null then
   insert into app_private.fantasy_not_rated_settlements(source_id,api_player_id,minutes,first_check_id,second_check_id)
   values(s.id,p->>'externalId',(p->>'minutes')::integer,first_check,second_check)on conflict do nothing;
   get diagnostics added=row_count;n:=n+added;
  end if;
 end loop;
 -- Readiness changes only when every real appearance is rated or settled.
 update app_private.fantasy_api_rating_sources target set ready=not exists(
  select 1 from jsonb_array_elements(target.players)x where x->>'uncertain'='true'
  or(x->>'appeared'='true'and x->'rating'='null'::jsonb
    and app_private.fantasy_not_rated_evidence(target.id,x->>'externalId')is null))where target.id=s.id;
 if n>0 then
  update app.fantasy_gameweeks g set scoring_input_version=greatest(1,g.scoring_input_version)+1
  where g.status not in('finalizing','finalized','corrected','cancelled')and exists(
   select 1 from app.fantasy_fixture_assignments a where a.gameweek_id=g.id and a.fixture_id=f.id and a.superseded_at is null);
 end if;
 return n;
end $$;
revoke all on function app_private.fantasy_settle_not_rated(bigint)from public,anon,authenticated,service_role;

-- Apply the approved policy only on successful ingestions. Failed fetches and
-- cache-only passes cannot create a check or satisfy the two-read requirement.
do $patch$
declare source text;
begin
 if md5((select prosrc from pg_proc where oid='api.service_record_fantasy_api_ratings(uuid,text,jsonb,timestamptz)'::regprocedure))<>'ee612e7a118c61219c03bbfaad0cf276'then raise exception 'not_rated_recorder_baseline_changed';end if;
 source:=pg_get_functiondef('api.service_record_fantasy_api_ratings(uuid,text,jsonb,timestamptz)'::regprocedure);
 if position('return jsonb_build_object(''sourceId'',v_id,'in source)=0 then raise exception 'not_rated_recorder_anchor_missing';end if;
 source:=replace(source,'return jsonb_build_object(''sourceId'',v_id,',
 'insert into app_private.fantasy_rating_checks(source_id,checked_at,provenance)values(v_id,statement_timestamp(),''live_receipt'')on conflict do nothing;
 perform app_private.fantasy_settle_not_rated(v_id);
 select ready into v_ready from app_private.fantasy_api_rating_sources where id=v_id;
 return jsonb_build_object(''sourceId'',v_id,');
 execute source;
end $patch$;

do $patch$
declare source text;
begin
 if md5((select prosrc from pg_proc where oid='api.fantasy_rules(uuid)'::regprocedure))<>'29eb205eeb83aad2d89ec4bc1d2ad4fd'then raise exception 'not_rated_rules_baseline_changed';end if;
 source:=pg_get_functiondef('api.fantasy_rules(uuid)'::regprocedure);
 if position('''noRatingPoints'',null,''waitForRating'',true)'in source)=0 then raise exception 'not_rated_rules_anchor_missing';end if;
 source:=replace(source,'''noRatingPoints'',null,''waitForRating'',true)',
 '''noRatingPoints'',null,''waitForRating'',true)||case when exists(select 1 from app_private.fantasy_not_rated_policy where id and enabled)then ''{"notRatedPolicyVersion":1}''::jsonb else ''{}''::jsonb end');
 execute source;
end $patch$;

do $patch$
declare source text;
begin
 if md5((select prosrc from pg_proc where oid='app_private.fantasy_api_rating_document(uuid)'::regprocedure))<>'524052a881965687ae692cf8433cc970'then raise exception 'not_rated_document_baseline_changed';end if;
 source:=pg_get_functiondef('app_private.fantasy_api_rating_document(uuid)'::regprocedure);
 if position('jsonb_typeof(raw.entry->''rating'')=''number'')))'in source)=0 then raise exception 'not_rated_document_filter_anchor_missing';end if;
 source:=replace(source,'m.external_id is not null as known',
 'app_private.fantasy_not_rated_evidence(s.id,m.external_id) as not_rated_evidence,m.external_id is not null as known');
 source:=replace(source,'jsonb_typeof(raw.entry->''rating'')=''number'')))',
 'jsonb_typeof(raw.entry->''rating'')=''number''or app_private.fantasy_not_rated_evidence(s.id,m.external_id)is not null)))');
 source:=replace(source,'''apiAppeared'',appeared,''rating'',rating,',
 '''apiAppeared'',appeared,''apiNotRated'',not_rated_evidence is not null,''notRatedEvidence'',not_rated_evidence,''rating'',rating,');
 if position('''apiNotRated'''in source)=0 or position('as not_rated_evidence'in source)=0 then raise exception 'not_rated_document_anchor_missing';end if;
 execute source;
end $patch$;

-- The database checks the ledger proof itself; a flag in JSON alone cannot
-- turn a missing rating into a settled score.
create or replace function app_private.fantasy_actual_ratings_pending(p_document jsonb)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(p_document->>'scoringVersion'='3'and p_document#>>'{ruleset,version}'='3'
 and p_document->>'ratingScoring'='true',false)
 and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(p_document->'playerFixtures')='array'then p_document->'playerFixtures'else '[]'::jsonb end)p
 where(p->>'apiAppeared'='true'or case when jsonb_typeof(p#>'{stats,minutes}')='number'then(p#>>'{stats,minutes}')::numeric>0 else false end)
 and jsonb_typeof(p->'rating')is distinct from 'number'
 and not coalesce(p->>'apiNotRated'='true'and p_document->>'apiNativeRatings'='true'
 and p->>'apiAppeared'='true'and p->>'participationKnown'='true'
 and p#>'{stats,minutes}'=p#>'{notRatedEvidence,minutes}'
 and exists(select 1 from jsonb_array_elements(p_document->'fixtures')f
  where f->>'fixtureId'=p->>'fixtureId'
  and app_private.fantasy_not_rated_evidence((f->>'apiRatingSourceId')::bigint,p->>'providerPlayerId')=p->'notRatedEvidence'),false));
$$;
revoke all on function app_private.fantasy_actual_ratings_pending(jsonb)from public,anon,authenticated,service_role;

do $patch$
declare source text;
begin
 if md5((select prosrc from pg_proc where oid='api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure))<>'8718cbd8ed1dfea8bac371c8f6be1a3b'then raise exception 'not_rated_persist_baseline_changed';end if;
 source:=pg_get_functiondef('api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure);
 if position('where v_rating and v_adaptive'in source)=0 then raise exception 'not_rated_persist_anchor_missing';end if;
 source:=replace(source,'where v_rating and v_adaptive',
 'where v_rating and v_adaptive and coalesce(pf.j->>''apiNotRated'',''false'')<>''true''');
 execute source;
 if md5((select prosrc from pg_proc where oid='app_private.fantasy_publish_rating_recovery(bigint,text,text)'::regprocedure))<>'e1a1d905741d4e5b05248dd4eaf5dca1' then raise exception 'not_rated_publication_baseline_changed';end if;
 source:=pg_get_functiondef('app_private.fantasy_publish_rating_recovery(bigint,text,text)'::regprocedure);
 source:=replace(source,'elsif coalesce((pf->>''apiAppeared'')::boolean,false) then',
 'elsif coalesce((pf->>''apiNotRated'')::boolean,false) then
   if jsonb_array_length(r->''events'')<>0 or app_private.fantasy_not_rated_evidence((select(x->>''apiRatingSourceId'')::bigint from jsonb_array_elements(preview->''fixtures'')x where x->>''fixtureId''=pf->>''fixtureId''),pf->>''providerPlayerId'')is null then raise exception ''rating_publication_not_rated_invalid'';end if;
 elsif coalesce((pf->>''apiAppeared'')::boolean,false) then');
 if position('rating_publication_not_rated_invalid'in source)=0 then raise exception 'not_rated_publication_anchor_missing';end if;
 execute source;
end $patch$;

-- No automatic backfill of settlements here. The separately reviewed rollout
-- reconciles existing proof and versions inputs before publication; new polls
-- use the same helper automatically. Old seals and real ratings are unchanged.

do $patch$
declare source text;
begin
 if md5((select prosrc from pg_proc where oid='api.get_my_fantasy_points(uuid,uuid)'::regprocedure))<>'44936f2b63f40bc3b00c528d96af040f'then raise exception 'not_rated_customer_reader_baseline_changed';end if;
 source:=pg_get_functiondef('api.get_my_fantasy_points(uuid,uuid)'::regprocedure);
 if position('''ratingPending'',coalesce(c.rating_pending,'in source)=0 then raise exception 'not_rated_customer_reader_anchor_missing';end if;
 source:=replace(source,'''ratingPending'',coalesce(c.rating_pending,',
 '''notRated'',exists(select 1 from jsonb_array_elements(doc->''playerFixtures'')nr where nr->>''fantasyPlayerId''=player->>''fantasyPlayerId''and nr->>''apiNotRated''=''true''),
 ''ratingPending'',coalesce(c.rating_pending,');
 execute source;
end $patch$;
