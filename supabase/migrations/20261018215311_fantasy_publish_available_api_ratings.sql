-- Visible rating revisions are separate from competition finality. The original
-- final results, sealed inputs, prizes and point ledger are never overwritten.
do $$ begin
 if exists(select 1 from (values
 ('api.get_my_fantasy_points_v1(uuid,uuid)','6750a054faa015a85d4523e6721f3f35'),
 ('api.get_my_fantasy_history(uuid,integer,integer)','b301fe39a0ac7aa7958afefcd443412a'),
 ('api.service_recalculate_fantasy_rankings(uuid,uuid,uuid,bigint)','3ed3f9906f79a9fa3aaf805c0f36a953'),
 ('api.fantasy_player_gameweek_history_v1(uuid)','f767f873c813291ba01fe3749ea7b81d'),
 ('api.fantasy_gameweek_summary(uuid)','96f6cbe0f8fa40c0ff3d440ce1ef2f09'),
 ('api.get_my_fantasy_points_before_staged(uuid,uuid)','1e22a7d2c3df525f7dcecf88f21f5838'),
 ('api.publish_fantasy_gameweek_recap(uuid,uuid,text)','fbe20029611542a9840240351e65bc93'),
 ('api.public_fantasy_gameweek_recap(text)','d27947346f61a3d1460b98921504841b'),
 ('api.get_round_recap(uuid,uuid)','a9d0e8d07521cb4cbd23283acbfe58b0'),
 ('api.get_my_rivals(text)','a308a0b615382f79c3496eff14cb62a6')
 ) expected(signature,digest) join pg_proc p on p.oid=expected.signature::regprocedure where md5(p.prosrc)<>expected.digest) then raise exception 'rating_publication_unexpected_reader_body'; end if;
end $$;

create table app_private.fantasy_rating_publications (
 id bigint generated always as identity primary key,
 gameweek_id uuid not null references app.fantasy_gameweeks(id),
 plan_id bigint not null unique references app_private.fantasy_rating_recovery_plans(id),
 owner_approval text not null check(char_length(owner_approval) between 20 and 1000),
 published_at timestamptz not null default statement_timestamp()
);
create index fantasy_rating_publications_latest on app_private.fantasy_rating_publications(gameweek_id,id desc);
alter table app_private.fantasy_rating_publications enable row level security;
alter table app_private.fantasy_rating_publications force row level security;
revoke all on app_private.fantasy_rating_publications from public,anon,authenticated,service_role;

create view app_private.fantasy_current_rating_publications with (security_invoker=true) as
select distinct on (x.gameweek_id) x.gameweek_id,x.id,x.plan_id,x.published_at,
 p.calculation_version,p.input_digest,p.proposal,p.results,p.complete
from app_private.fantasy_rating_publications x
join app_private.fantasy_rating_recovery_plans p on p.id=x.plan_id
order by x.gameweek_id,x.id desc;
revoke all on app_private.fantasy_current_rating_publications from public,anon,authenticated,service_role;

create function app_private.fantasy_rating_publication_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='fantasy_rating_publications' or exists(select 1 from app_private.fantasy_rating_publications where plan_id=old.id) then
 raise exception 'published_rating_revision_immutable'; end if;
 if tg_op='UPDATE' then return new; end if;
 return old;
end $$;
revoke all on function app_private.fantasy_rating_publication_immutable() from public,anon,authenticated,service_role;
create trigger fantasy_rating_publication_immutable before update or delete on app_private.fantasy_rating_publications
for each row execute function app_private.fantasy_rating_publication_immutable();
create trigger fantasy_rating_plan_immutable before update or delete on app_private.fantasy_rating_recovery_plans
for each row execute function app_private.fantasy_rating_publication_immutable();

-- Read projections, not replacement base tables. Private owner/definer readers
-- can use them; no client receives table access or another manager's lineup.
create view app_private.fantasy_visible_team_results with (security_invoker=true) as
select r.* from app.fantasy_team_gameweek_results r
where not exists(select 1 from app_private.fantasy_current_rating_publications p where p.gameweek_id=r.gameweek_id)
union all
select (jsonb_populate_record(null::app.fantasy_team_gameweek_results,to_jsonb(r)||jsonb_build_object(
 'starting_points',t->'startingPoints','bench_points',t->'benchPoints','captain_points',t->'captainPoints',
 'transfer_hit',t->'transferHit','provisional_score',t->'provisionalScore','final_score',null,
 'state','provisional','finalized_at',null,'calculation_version',p.calculation_version,
 'scoring_details',t,'updated_at',p.published_at,
 'rank',(select k.rank from app.fantasy_rankings k where k.gameweek_id=r.gameweek_id and k.league_id is null and k.fantasy_team_id=r.fantasy_team_id),
 'overall_rank',(select k.rank from app.fantasy_rankings k where k.fantasy_season_id=g.fantasy_season_id and k.gameweek_id is null and k.league_id is null and k.fantasy_team_id=r.fantasy_team_id)
))).*
from app.fantasy_team_gameweek_results r join app.fantasy_gameweeks g on g.id=r.gameweek_id
join app_private.fantasy_current_rating_publications p on p.gameweek_id=r.gameweek_id
cross join lateral jsonb_array_elements(p.results->'teamResults') t
where t->>'teamId'=r.fantasy_team_id::text;

create view app_private.fantasy_visible_player_points with (security_invoker=true) as
select r.* from app.fantasy_player_gameweek_points r
where not exists(select 1 from app_private.fantasy_current_rating_publications p where p.gameweek_id=r.gameweek_id)
union all
select (jsonb_populate_record(null::app.fantasy_player_gameweek_points,jsonb_build_object(
 'fantasy_player_id',pl->'fantasyPlayerId','gameweek_id',p.gameweek_id,
 'provisional_points',case when p.proposal->'pendingPlayerIds' ? (pl->>'fantasyPlayerId') and coalesce(e.n,0)=0 then null else coalesce(e.points,0) end,
 'final_points',null,'minutes_played',coalesce(f.minutes,0),'did_play',coalesce(f.played,false),
 'calculation_version',p.calculation_version,'football_input_version',coalesce(f.sequence,0),
 'finalized_at',null,'created_at',p.published_at,'updated_at',p.published_at
))).*
from app_private.fantasy_current_rating_publications p
cross join lateral jsonb_array_elements(p.proposal->'players') pl
left join lateral(select sum((ev->>'points')::integer)::integer as points,count(*) as n
 from jsonb_array_elements(p.results->'playerResults') pr
 cross join lateral jsonb_array_elements(pr->'events') ev
 where pr->>'fantasyPlayerId'=pl->>'fantasyPlayerId') e on true
left join lateral(select sum(coalesce((pf#>>'{stats,minutes}')::integer,0))::integer as minutes,
 bool_or(coalesce((pf->>'apiAppeared')::boolean,false)) as played,max((pf->>'sourceSequence')::bigint) as sequence
 from jsonb_array_elements(p.proposal->'playerFixtures') pf where pf->>'fantasyPlayerId'=pl->>'fantasyPlayerId') f on true;

create view app_private.fantasy_visible_point_events with (security_invoker=true) as
select r.* from app.fantasy_player_point_events r
where not exists(select 1 from app_private.fantasy_current_rating_publications p where p.gameweek_id=r.gameweek_id)
union all
select (jsonb_populate_record(null::app.fantasy_player_point_events,jsonb_build_object(
 'id',md5(p.id::text||':'||(pr->>'fantasyPlayerId')||':'||(pr->>'fixtureId')||':'||(ev->>'category'))::uuid,
 'fantasy_player_id',pr->'fantasyPlayerId','gameweek_id',p.gameweek_id,'fixture_id',pr->'fixtureId',
 'football_event_id',null,'category',ev->'category','points',ev->'points','state','provisional',
 'scoring_version',3,'source_sequence',p.calculation_version,'source_key',ev->'sourceKey',
 'superseded_at',null,'created_at',p.published_at,'updated_at',p.published_at
))).*
from app_private.fantasy_current_rating_publications p
cross join lateral jsonb_array_elements(p.results->'playerResults') pr
cross join lateral jsonb_array_elements(pr->'events') ev;

create view app_private.fantasy_visible_substitutions with (security_invoker=true) as
select r.* from app.fantasy_auto_substitutions r join app.fantasy_lineups l on l.id=r.lineup_id
where not exists(select 1 from app_private.fantasy_current_rating_publications p where p.gameweek_id=l.gameweek_id)
union all
select (jsonb_populate_record(null::app.fantasy_auto_substitutions,jsonb_build_object(
 'id',md5(p.id::text||':'||(t->>'lineupId')||':'||ord::text)::uuid,'lineup_id',t->'lineupId',
 'player_out_id',s->'playerOutId','player_in_id',s->'playerInId','sequence_number',ord,
 'reason',s->'reason','calculation_version',p.calculation_version,'created_at',p.published_at
))).*
from app_private.fantasy_current_rating_publications p
cross join lateral jsonb_array_elements(p.results->'teamResults') t
cross join lateral jsonb_array_elements(t->'substitutions') with ordinality x(s,ord);
revoke all on app_private.fantasy_visible_team_results,app_private.fantasy_visible_player_points,
app_private.fantasy_visible_point_events,app_private.fantasy_visible_substitutions from public,anon,authenticated,service_role;

-- Explicitly scope the existing customer readers and ranking calculator to
-- the published projection. Their ownership, MFA, paging and grant bodies
-- remain intact. The normal scoring writer and finalization are untouched.
do $$
declare sig text; source text;
begin
 foreach sig in array array[
 'api.get_my_fantasy_points_v1(uuid,uuid)',
 'api.get_my_fantasy_points_before_staged(uuid,uuid)',
 'api.get_my_fantasy_history(uuid,integer,integer)',
 'api.fantasy_gameweek_summary(uuid)',
 'api.service_recalculate_fantasy_rankings(uuid,uuid,uuid,bigint)',
 'api.fantasy_player_gameweek_history_v1(uuid)',
 'api.publish_fantasy_gameweek_recap(uuid,uuid,text)',
 'api.public_fantasy_gameweek_recap(text)',
 'api.get_round_recap(uuid,uuid)',
 'api.get_my_rivals(text)'
 ] loop
 source:=pg_get_functiondef(sig::regprocedure);
 source:=replace(source,'app.fantasy_team_gameweek_results','app_private.fantasy_visible_team_results');
 source:=replace(source,'app.fantasy_player_gameweek_points','app_private.fantasy_visible_player_points');
 source:=replace(source,'app.fantasy_player_point_events','app_private.fantasy_visible_point_events');
 source:=replace(source,'app.fantasy_auto_substitutions','app_private.fantasy_visible_substitutions');
 execute source;
 end loop;
end $$;

create function app_private.fantasy_publish_rating_recovery(p_plan_id bigint,p_expected_digest text,p_owner_approval text)
returns jsonb language plpgsql set search_path='' as $$
declare p app_private.fantasy_rating_recovery_plans%rowtype; preview jsonb; g app.fantasy_gameweeks%rowtype;
 t jsonb; r jsonb; pf jsonb; expected integer; actual integer; league record; old_claims text;
begin
 perform app_private.hold_scheduled_jobs();
 lock table app_private.fantasy_worker_lease in exclusive mode;
 if exists(select 1 from app_private.fantasy_worker_lease where released_at is null and expires_at>statement_timestamp())
 or exists(select 1 from net.http_request_queue)
 or exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled)
 or exists(select 1 from app_private.notification_email_settings where football_live_refresh_enabled)
 or exists(select 1 from app_private.account_deletion_settings where enabled)
 or exists(select 1 from app_private.manager_card_settings where compute_enabled)
 or exists(select 1 from app_private.rivals_settings where enabled)
 or exists(select 1 from app_private.trophy_settings where enabled)
 or exists(select 1 from app.account_deletion_requests where status='processing') then raise exception 'rating_publication_writers_not_drained'; end if;
 if p_owner_approval is null or char_length(p_owner_approval) not between 20 and 1000 then raise exception 'rating_publication_approval_required'; end if;
 select * into p from app_private.fantasy_rating_recovery_plans where id=p_plan_id for update;
 if not found or p.input_digest is distinct from p_expected_digest then raise exception 'rating_publication_plan_mismatch'; end if;
 select * into g from app.fantasy_gameweeks where id=p.gameweek_id for update;
 if g.status not in ('finalized','corrected') then raise exception 'rating_publication_requires_historical_week'; end if;
 if exists(select 1 from app_private.fantasy_rating_publications where plan_id=p.id) then
 return jsonb_build_object('published',true,'alreadyPublished',true,'gameweekId',g.id); end if;
 lock table app_private.fantasy_api_rating_sources,app_private.football_provider_mappings,
 app.fantasy_lineups,app.fantasy_lineup_players,app.fantasy_chip_uses,app.fantasy_transfer_batches in share mode;
 preview:=app_private.fantasy_api_rating_preview(g.id);
 if preview->>'inputDigest' is distinct from p_expected_digest then raise exception 'rating_publication_inputs_changed'; end if;
 if jsonb_array_length(p.results->'playerResults')<>jsonb_array_length(preview->'playerFixtures')
 or jsonb_array_length(p.results->'teamResults')<>jsonb_array_length(preview->'teams') then raise exception 'rating_publication_result_scope'; end if;
 -- Independent rating arithmetic: an appeared player contributes exactly one
 -- rounded real rating; a confirmed unused player contributes no event.
 for r in select value from jsonb_array_elements(p.results->'playerResults') loop
 select value into pf from jsonb_array_elements(preview->'playerFixtures') where value->>'fantasyPlayerId'=r->>'fantasyPlayerId' and value->>'fixtureId'=r->>'fixtureId';
 if pf is null then raise exception 'rating_publication_unknown_player_fixture'; end if;
 if (pf->>'participationKnown')::boolean is not true then
   if jsonb_array_length(r->'events')<>0 then raise exception 'rating_publication_unidentified_points'; end if;
 elsif coalesce((pf->>'apiAppeared')::boolean,false) then
   if jsonb_typeof(pf->'rating') is distinct from 'number' or jsonb_array_length(r->'events')<>1
   or r#>>'{events,0,category}' is distinct from 'rating'
   or (r#>>'{events,0,points}')::numeric is distinct from round((pf->>'rating')::numeric) then raise exception 'rating_publication_rating_mismatch'; end if;
 elsif jsonb_array_length(r->'events')<>0 then raise exception 'rating_publication_unused_points'; end if;
 end loop;
 if (select count(distinct (r->>'fantasyPlayerId',r->>'fixtureId')) from jsonb_array_elements(p.results->'playerResults') r)<>jsonb_array_length(p.results->'playerResults') then raise exception 'rating_publication_duplicate_rows'; end if;
 for t in select value from jsonb_array_elements(p.results->'teamResults') loop
 if not exists(select 1 from app.fantasy_lineups l join app.fantasy_team_gameweek_results b on b.gameweek_id=l.gameweek_id and b.fantasy_team_id=l.fantasy_team_id
 where l.id=(t->>'lineupId')::uuid and l.fantasy_team_id=(t->>'teamId')::uuid and l.gameweek_id=g.id and l.locked_at is not null)
 or (select count(*) from app.fantasy_lineup_players where lineup_id=(t->>'lineupId')::uuid)<>jsonb_array_length(t->'players')
 or exists(select 1 from jsonb_array_elements(t->'players') x where not exists(select 1 from app.fantasy_lineup_players lp where lp.lineup_id=(t->>'lineupId')::uuid and lp.fantasy_player_id=(x->>'fantasyPlayerId')::uuid)
 or (x->>'multiplier')::integer not between 0 and 3)
 or (select count(distinct x->>'fantasyPlayerId') from jsonb_array_elements(t->'players') x)<>jsonb_array_length(t->'players') then raise exception 'rating_publication_lineup_mismatch'; end if;
 select coalesce(sum((ev->>'points')::integer*(lp->>'multiplier')::integer),0)::integer into expected
 from jsonb_array_elements(t->'players') lp join jsonb_array_elements(p.results->'playerResults') pr on pr->>'fantasyPlayerId'=lp->>'fantasyPlayerId'
 cross join lateral jsonb_array_elements(pr->'events') ev;
 select coalesce(sum(b.point_hit),0)::integer into actual from app.fantasy_transfer_batches b where b.fantasy_team_id=(t->>'teamId')::uuid and b.gameweek_id=g.id and b.status='confirmed';
 if (t->>'transferHit')::integer is distinct from actual or (t->>'provisionalScore')::integer is distinct from expected-actual then raise exception 'rating_publication_total_mismatch'; end if;
 end loop;
 if (select count(distinct x->>'teamId') from jsonb_array_elements(p.results->'teamResults') x)<>jsonb_array_length(p.results->'teamResults') then raise exception 'rating_publication_duplicate_teams'; end if;
 insert into app_private.fantasy_rating_publications(gameweek_id,plan_id,owner_approval) values(g.id,p.id,p_owner_approval);
 old_claims:=current_setting('request.jwt.claims',true);
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform api.service_recalculate_fantasy_rankings(g.fantasy_season_id,g.id,null,p.calculation_version);
 perform api.service_recalculate_fantasy_rankings(g.fantasy_season_id,null,null,p.calculation_version);
 for league in select id from app.fantasy_leagues where fantasy_season_id=g.fantasy_season_id and active loop
 perform api.service_recalculate_fantasy_rankings(g.fantasy_season_id,g.id,league.id,p.calculation_version);
 perform api.service_recalculate_fantasy_rankings(g.fantasy_season_id,null,league.id,p.calculation_version);
 end loop;
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 return jsonb_build_object('published',true,'gameweekId',g.id,'revision',p.calculation_version,'finalized',false);
end $$;
revoke all on function app_private.fantasy_publish_rating_recovery(bigint,text,text) from public,anon,authenticated,service_role;

-- Customer metadata comes from the same source as the points: a published
-- historical revision, or the latest persisted native snapshot for live weeks.
create function app_private.fantasy_rating_display_document(p_gameweek_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select proposal from app_private.fantasy_current_rating_publications where gameweek_id=p_gameweek_id),
 (select payload from app_private.fantasy_scoring_snapshots where gameweek_id=p_gameweek_id and payload->>'apiNativeRatings'='true' and players_persisted order by calculation_version desc limit 1));
$$;
revoke all on function app_private.fantasy_rating_display_document(uuid) from public,anon,authenticated,service_role;

alter function api.get_my_fantasy_points(uuid,uuid) rename to get_my_fantasy_points_before_publication;
revoke all on function api.get_my_fantasy_points_before_publication(uuid,uuid) from public,anon,authenticated,service_role;
create function api.get_my_fantasy_points(p_team_id uuid,p_gameweek_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d jsonb; doc jsonb; pending boolean; revision boolean; updated timestamptz;
begin
 perform app_private.assert_mfa_step_up();
 d:=api.get_my_fantasy_points_before_publication(p_team_id,p_gameweek_id);
 doc:=app_private.fantasy_rating_display_document(p_gameweek_id);
 if doc is null then return d; end if;
 pending:=jsonb_array_length(doc->'pendingFixtures')>0 or jsonb_array_length(doc->'pendingPlayerIds')>0;
 select exists(select 1 from app_private.fantasy_current_rating_publications where gameweek_id=p_gameweek_id) into revision;
 select max(captured_at) into updated from app_private.fantasy_api_rating_sources s where exists(select 1 from jsonb_array_elements(doc->'fixtures') f where f->>'apiRatingSourceId'=s.id::text);
 d:=d||jsonb_build_object('ratingPublication',jsonb_build_object('historicalRevision',revision,'pending',pending,
 'pendingFixtures',jsonb_array_length(doc->'pendingFixtures'),'sourceUpdatedAt',updated),
 'pointsState',case when revision or pending then 'provisional' else d->>'pointsState' end,
 'incrementalScoring',true,
 'players',(select jsonb_agg(player||jsonb_build_object(
 'ratingPending',(doc->'pendingPlayerIds' ? (player->>'fantasyPlayerId')),
 'provisionalPoints',case when doc->'pendingPlayerIds' ? (player->>'fantasyPlayerId') and jsonb_array_length(player->'events')=0 then null else player->'provisionalPoints' end,
 'didPlay',case when doc->'pendingPlayerIds' ? (player->>'fantasyPlayerId') and jsonb_array_length(player->'events')=0 then null else player->'didPlay' end
 ) order by ord) from jsonb_array_elements(d->'players') with ordinality x(player,ord)));
 return d;
end $$;
revoke all on function api.get_my_fantasy_points(uuid,uuid) from public,anon;
grant execute on function api.get_my_fantasy_points(uuid,uuid) to authenticated,service_role;

alter function api.fantasy_gameweek_summary(uuid) rename to fantasy_gameweek_summary_before_publication;
revoke all on function api.fantasy_gameweek_summary_before_publication(uuid) from public,anon,authenticated,service_role;
create function api.fantasy_gameweek_summary(p_gameweek_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select api.fantasy_gameweek_summary_before_publication(p_gameweek_id)||case when exists(select 1 from app_private.fantasy_current_rating_publications where gameweek_id=p_gameweek_id)
 then jsonb_build_object('pointsState','provisional') else '{}'::jsonb end;
$$;
revoke all on function api.fantasy_gameweek_summary(uuid) from public;
grant execute on function api.fantasy_gameweek_summary(uuid) to anon,authenticated,service_role;

-- Fair, bounded recent-match polling. Unchanged payloads only update poll
-- freshness, never create a new source or erase a successful score.
create or replace function api.service_fantasy_api_ratings_due(p_limit integer default 3)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare claimed jsonb;
begin
 if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
 if p_limit is null or p_limit not between 0 and 12 then raise exception 'rating_due_limit_invalid'; end if;
 if not pg_try_advisory_xact_lock(hashtextextended('botolago:native-rating-polls',0)) then return '[]'::jsonb; end if;
 with eligible as (
 select distinct f.id,m.external_id,f.kickoff_at,f.finalized_at,poll.last_fetched_at,poll.last_attempt_at,
 case when f.finalized_at>statement_timestamp()-interval '6 hours' then interval '5 minutes'
 when f.finalized_at>statement_timestamp()-interval '2 days' then interval '30 minutes' else interval '2 hours' end as cadence
 from app.fixtures f join app.fantasy_fixture_assignments a on a.fixture_id=f.id and a.superseded_at is null
 join app.fantasy_gameweeks g on g.id=a.gameweek_id and g.status in ('live','provisional')
 join app_private.fantasy_api_rating_seasons p on p.season_id=g.fantasy_season_id and g.sequence_number>=p.from_gameweek
 join app_private.football_provider_mappings m on m.provider_name='sofascore' and m.entity_type='fixture' and m.active and m.internal_entity_id=f.id
 left join app_private.fantasy_api_rating_polls poll on poll.fixture_id=f.id
 where f.status='finished' and f.finalized_at is not null
 ), candidates as materialized (
 select * from eligible where (last_fetched_at is null or last_fetched_at<statement_timestamp()-cadence)
 and (last_attempt_at is null or last_attempt_at<statement_timestamp()-interval '5 minutes')
 order by coalesce(last_attempt_at,'-infinity'::timestamptz),finalized_at desc,id limit p_limit
 ), reserved as (
 insert into app_private.fantasy_api_rating_polls(fixture_id,last_attempt_at) select id,statement_timestamp() from candidates
 on conflict(fixture_id) do update set last_attempt_at=excluded.last_attempt_at returning fixture_id
 ) select coalesce(jsonb_agg(jsonb_build_object('fixtureId',c.id,'eventId',c.external_id)),'[]') into claimed from candidates c join reserved r on r.fixture_id=c.id;
 return claimed;
end $$;
revoke all on function api.service_fantasy_api_ratings_due(integer) from public,anon,authenticated;
grant execute on function api.service_fantasy_api_ratings_due(integer) to service_role;
