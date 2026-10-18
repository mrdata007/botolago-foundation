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

-- Prevent a new unidentified selection without altering the reviewed
-- create/transfer/deadline RPC bodies or any existing squad membership.
create function app_private.fantasy_native_player_selectable(p_player_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from app.fantasy_players fp join app_private.fantasy_api_rating_seasons s on s.season_id=fp.fantasy_season_id where fp.id=p_player_id)
 or exists(select 1 from app.fantasy_players fp join app_private.football_provider_mappings m on m.internal_entity_id=fp.football_player_id
 and m.provider_name='sofascore' and m.entity_type='player' and m.active and m.external_id ~ '^[0-9]{1,12}$' where fp.id=p_player_id);
$$;
revoke all on function app_private.fantasy_native_player_selectable(uuid) from public,anon,authenticated,service_role;
create function app_private.fantasy_rating_new_member_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.fantasy_player_id=old.fantasy_player_id and new.fantasy_team_id=old.fantasy_team_id then return new; end if;
 if not app_private.fantasy_native_player_selectable(new.fantasy_player_id) then
 -- The trusted free-hit restoration may return an already owned legacy
 -- selection, using the exact original acquisition stored in its snapshot.
 if app_private.is_service_request() and exists(select 1 from app.fantasy_free_hit_snapshots s
 join app.fantasy_free_hit_snapshot_players p on p.snapshot_id=s.id
 where s.fantasy_team_id=new.fantasy_team_id and s.restored_at is null
 and p.fantasy_player_id=new.fantasy_player_id and p.acquired_gameweek_id=new.acquired_gameweek_id) then return new; end if;
 raise exception using errcode='PT400',message='player_not_eligible';
 end if;
 return new;
end $$;
revoke all on function app_private.fantasy_rating_new_member_guard() from public,anon,authenticated,service_role;
create trigger fantasy_rating_new_member_guard before insert or update of fantasy_player_id,fantasy_team_id on app.fantasy_squad_memberships
for each row execute function app_private.fantasy_rating_new_member_guard();
do $$ declare source text; begin
 if md5((select prosrc from pg_proc where oid='api.fantasy_player_pool(uuid,text,uuid,numeric,text,numeric,uuid,integer)'::regprocedure))<>'36dfa9ccf4ed6e085f3825694621f820' then raise exception 'rating_publication_unexpected_pool_body'; end if;
 source:=pg_get_functiondef('api.fantasy_player_pool(uuid,text,uuid,numeric,text,numeric,uuid,integer)'::regprocedure);
 source:=replace(source,'and fantasy_player.active and fantasy_player.eligible',
 'and fantasy_player.active and fantasy_player.eligible and (app_private.fantasy_native_player_selectable(fantasy_player.id)
 or exists(select 1 from app.fantasy_squad_memberships owned join app.fantasy_teams owner_team on owner_team.id=owned.fantasy_team_id
 where owned.fantasy_player_id=fantasy_player.id and owned.sold_at is null and owner_team.user_id=(select auth.uid())))');
 execute source;
end $$;
create index fantasy_rating_publications_latest on app_private.fantasy_rating_publications(gameweek_id,id desc);
alter table app_private.fantasy_rating_publications enable row level security;
alter table app_private.fantasy_rating_publications force row level security;
revoke all on app_private.fantasy_rating_publications from public,anon,authenticated,service_role;

-- Flatten the reviewed immutable revision once at publication. Customer reads
-- use indexed rows instead of repeatedly expanding the full source document.
create table app_private.fantasy_published_rating_players (
 publication_id bigint not null references app_private.fantasy_rating_publications(id),
 fantasy_player_id uuid not null references app.fantasy_players(id),
 gameweek_id uuid not null references app.fantasy_gameweeks(id),
 provisional_points integer,
 minutes_played integer not null,
 did_play boolean not null,
 football_input_version bigint not null,
 rating_pending boolean not null,
 events jsonb not null check(jsonb_typeof(events)='array'),
 primary key(publication_id,fantasy_player_id)
);
create index fantasy_published_rating_players_lookup on app_private.fantasy_published_rating_players(gameweek_id,fantasy_player_id,publication_id);
alter table app_private.fantasy_published_rating_players enable row level security;
alter table app_private.fantasy_published_rating_players force row level security;
revoke all on app_private.fantasy_published_rating_players from public,anon,authenticated,service_role;

create view app_private.fantasy_current_rating_publications with (security_invoker=true) as
select distinct on (x.gameweek_id) x.gameweek_id,x.id,x.plan_id,x.published_at,
 p.calculation_version,p.input_digest,p.proposal,p.results,p.complete
from app_private.fantasy_rating_publications x
join app_private.fantasy_rating_recovery_plans p on p.id=x.plan_id
order by x.gameweek_id,x.id desc;
revoke all on app_private.fantasy_current_rating_publications from public,anon,authenticated,service_role;

-- Finalization deliberately waits for a whole fixture. Display certainty is
-- per player: a confirmed unused bench player still has a real zero even
-- while somebody else's rating is missing. This never changes seal readiness.
create function app_private.fantasy_player_rating_pending(p_doc jsonb,p_player_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare player jsonb; fixture jsonb;
begin
 if not (p_doc->'pendingPlayerIds' ? p_player_id::text) then return false; end if;
 if exists(select 1 from jsonb_array_elements(p_doc->'playerFixtures') f where f->>'fantasyPlayerId'=p_player_id::text
 and (f->>'participationKnown')::boolean is not true) then return true; end if;
 select value into player from jsonb_array_elements(p_doc->'players') where value->>'fantasyPlayerId'=p_player_id::text;
 for fixture in select value from jsonb_array_elements(p_doc->'pendingFixtures') loop
 if player->>'teamId' in (fixture->>'homeTeamId',fixture->>'awayTeamId')
 or exists(select 1 from app.fixtures fi join app.team_memberships tm on tm.season_id=fi.season_id
 and tm.team_id in(fi.home_team_id,fi.away_team_id) and tm.player_id=(player->>'playerId')::uuid
 and tm.valid_from<=fi.kickoff_at::date and (tm.valid_to is null or tm.valid_to>=fi.kickoff_at::date)
 where fi.id=(fixture->>'fixtureId')::uuid) then
 if not exists(select 1 from jsonb_array_elements(p_doc->'playerFixtures') f where f->>'fantasyPlayerId'=p_player_id::text
 and f->>'fixtureId'=fixture->>'fixtureId' and (f->>'participationKnown')::boolean is true) then return true; end if;
 end if;
 end loop;
 return not exists(select 1 from jsonb_array_elements(p_doc->'playerFixtures') f where f->>'fantasyPlayerId'=p_player_id::text and (f->>'participationKnown')::boolean is true);
end $$;
revoke all on function app_private.fantasy_player_rating_pending(jsonb,uuid) from public,anon,authenticated,service_role;

create function app_private.fantasy_rating_publication_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='fantasy_rating_recovery_plans' then
 if exists(select 1 from app_private.fantasy_rating_publications where plan_id=old.id) then raise exception 'published_rating_revision_immutable'; end if;
 else raise exception 'published_rating_revision_immutable'; end if;
 if tg_op='UPDATE' then return new; end if;
 return old;
end $$;
revoke all on function app_private.fantasy_rating_publication_immutable() from public,anon,authenticated,service_role;
create trigger fantasy_rating_publication_immutable before update or delete on app_private.fantasy_rating_publications
for each row execute function app_private.fantasy_rating_publication_immutable();
create trigger fantasy_rating_plan_immutable before update or delete on app_private.fantasy_rating_recovery_plans
for each row execute function app_private.fantasy_rating_publication_immutable();
create trigger fantasy_rating_player_projection_immutable before update or delete on app_private.fantasy_published_rating_players
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
select c.fantasy_player_id,c.gameweek_id,c.provisional_points,null::integer,c.minutes_played,c.did_play,
 p.calculation_version,c.football_input_version,null::timestamptz,p.published_at,p.published_at
from app_private.fantasy_published_rating_players c
join app_private.fantasy_current_rating_publications p on p.id=c.publication_id;

create view app_private.fantasy_visible_point_events with (security_invoker=true) as
select r.* from app.fantasy_player_point_events r
where not exists(select 1 from app_private.fantasy_current_rating_publications p where p.gameweek_id=r.gameweek_id)
union all
select md5(p.id::text||':'||c.fantasy_player_id::text||':'||(ev->>'fixtureId')||':'||(ev->>'category'))::uuid,
 c.fantasy_player_id,c.gameweek_id,(ev->>'fixtureId')::uuid,null::uuid,ev->>'category',(ev->>'points')::integer,
 'provisional'::app.fantasy_points_state,3,p.calculation_version,ev->>'sourceKey',null::timestamptz,p.published_at,p.published_at
from app_private.fantasy_published_rating_players c
join app_private.fantasy_current_rating_publications p on p.id=c.publication_id
cross join lateral jsonb_array_elements(c.events) ev;

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
 'api.get_round_recap(uuid,uuid)'
 ] loop
 source:=pg_get_functiondef(sig::regprocedure);
 source:=replace(source,'app.fantasy_team_gameweek_results','app_private.fantasy_visible_team_results');
 source:=replace(source,'app.fantasy_player_gameweek_points','app_private.fantasy_visible_player_points');
 source:=replace(source,'app.fantasy_player_point_events','app_private.fantasy_visible_point_events');
 source:=replace(source,'app.fantasy_auto_substitutions','app_private.fantasy_visible_substitutions');
 if sig='api.get_round_recap(uuid,uuid)' then
 source:=replace(source,'v_final := v_gw.points_state = ''final'';',
 'v_final := v_gw.points_state = ''final'' and v_res.state = ''final'';');
 end if;
 execute source;
 end loop;
end $$;

create function app_private.fantasy_publish_rating_recovery(p_plan_id bigint,p_expected_digest text,p_owner_approval text)
returns jsonb language plpgsql set search_path='' as $$
declare p app_private.fantasy_rating_recovery_plans%rowtype; preview jsonb; g app.fantasy_gameweeks%rowtype;
 t jsonb; r jsonb; pf jsonb; expected integer; actual integer; league record; components record; old_claims text; published_id bigint;
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
 if exists(select 1 from app.fantasy_prize_winners w where w.fantasy_season_id=g.fantasy_season_id
 and g.sequence_number between w.first_gameweek_number and w.last_gameweek_number and w.status in ('verified','paid')) then
 raise exception 'rating_publication_settled_prize_requires_review'; end if;
 if exists(select 1 from app_private.fantasy_rating_publications where plan_id=p.id) then
 return jsonb_build_object('published',true,'alreadyPublished',true,'gameweekId',g.id); end if;
 lock table app_private.fantasy_api_rating_sources,app_private.football_provider_mappings,
 app.fantasy_lineups,app.fantasy_lineup_players,app.fantasy_chip_uses,app.fantasy_transfer_batches in share mode;
 preview:=app_private.fantasy_api_rating_preview(g.id);
 if preview->>'inputDigest' is distinct from p_expected_digest then raise exception 'rating_publication_inputs_changed'; end if;
 if encode(extensions.digest(p.proposal::text,'sha256'),'hex') is distinct from p_expected_digest then raise exception 'rating_publication_proposal_mismatch'; end if;
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
 if (select count(distinct (entry.value->>'fantasyPlayerId',entry.value->>'fixtureId')) from jsonb_array_elements(p.results->'playerResults') entry)<>jsonb_array_length(p.results->'playerResults') then raise exception 'rating_publication_duplicate_rows'; end if;
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
 with raw_points as (
 select pr->>'fantasyPlayerId' as pid,coalesce(sum((ev->>'points')::integer),0)::integer as points
 from jsonb_array_elements(p.results->'playerResults') pr left join lateral jsonb_array_elements(pr->'events') ev on true group by 1
 ), members as (
 select lp.fantasy_player_id,lp.captain,lp.vice_captain,lp.slot,coalesce(rp.points,0) as points,
 (lp.slot='starter' and not exists(select 1 from jsonb_array_elements(t->'substitutions') s where s->>'playerOutId'=lp.fantasy_player_id::text))
 or exists(select 1 from jsonb_array_elements(t->'substitutions') s where s->>'playerInId'=lp.fantasy_player_id::text) as selected,
 (x->>'multiplier')::integer as multiplier,
 (select chip_type from app.fantasy_chip_uses c where c.fantasy_team_id=(t->>'teamId')::uuid and c.gameweek_id=g.id and c.cancelled_at is null) as chip
 from app.fantasy_lineup_players lp join jsonb_array_elements(t->'players') x on x->>'fantasyPlayerId'=lp.fantasy_player_id::text
 left join raw_points rp on rp.pid=lp.fantasy_player_id::text where lp.lineup_id=(t->>'lineupId')::uuid
 ) select coalesce(sum(points) filter(where selected),0)::integer as starting,
 coalesce(sum(points) filter(where not selected and slot='bench'),0)::integer as bench,
 coalesce(sum(points*(multiplier-1)) filter(where multiplier>1),0)::integer as captain,
 bool_or(multiplier is distinct from case when selected or chip='bench_boost' then
 case when fantasy_player_id::text=t->>'effectiveCaptainId' then case when chip='triple_captain' then 3 else 2 end else 1 end else 0 end) as invalid_multiplier,
 bool_or(fantasy_player_id::text=t->>'effectiveCaptainId' and not(captain or vice_captain)) as invalid_captain,
 bool_or(p.proposal->'pendingPlayerIds' ? fantasy_player_id::text) as has_pending
 into components from members;
 if components.starting is distinct from (t->>'startingPoints')::integer or components.bench is distinct from (t->>'benchPoints')::integer
 or components.captain is distinct from (t->>'captainPoints')::integer or components.invalid_multiplier or components.invalid_captain
 or (components.has_pending and jsonb_array_length(t->'substitutions')<>0) then raise exception 'rating_publication_components_mismatch'; end if;
 end loop;
 if (select count(distinct x->>'teamId') from jsonb_array_elements(p.results->'teamResults') x)<>jsonb_array_length(p.results->'teamResults') then raise exception 'rating_publication_duplicate_teams'; end if;
 insert into app_private.fantasy_rating_publications(gameweek_id,plan_id,owner_approval) values(g.id,p.id,p_owner_approval) returning id into published_id;
 insert into app_private.fantasy_published_rating_players(publication_id,fantasy_player_id,gameweek_id,provisional_points,
 minutes_played,did_play,football_input_version,rating_pending,events)
 with point_rows as (
 select pr->>'fantasyPlayerId' as pid,coalesce(sum((ev->>'points')::integer),0)::integer as points,count(ev) as n,
 coalesce(jsonb_agg(ev||jsonb_build_object('fixtureId',pr->'fixtureId') order by pr->>'fixtureId',ev->>'category') filter(where ev is not null),'[]') as events
 from jsonb_array_elements(p.results->'playerResults') pr left join lateral jsonb_array_elements(pr->'events') ev on true group by 1
 ), appearances as (
 select f->>'fantasyPlayerId' as pid,sum(coalesce((f#>>'{stats,minutes}')::integer,0))::integer as minutes,
 bool_or(coalesce((f->>'apiAppeared')::boolean,false)) as played,max((f->>'sourceSequence')::bigint) as sequence
 from jsonb_array_elements(p.proposal->'playerFixtures') f group by 1
 ), selected as materialized (
 select pl,app_private.fantasy_player_rating_pending(p.proposal,(pl->>'fantasyPlayerId')::uuid) as pending
 from jsonb_array_elements(p.proposal->'players') pl
 ) select published_id,(s.pl->>'fantasyPlayerId')::uuid,g.id,
 case when s.pending and coalesce(e.n,0)=0 then null else coalesce(e.points,0) end,
 coalesce(a.minutes,0),coalesce(a.played,false),coalesce(a.sequence,0),s.pending,coalesce(e.events,'[]')
 from selected s left join point_rows e on e.pid=s.pl->>'fantasyPlayerId' left join appearances a on a.pid=s.pl->>'fantasyPlayerId';
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
declare d jsonb; doc jsonb; pending boolean; revision boolean; updated timestamptz; display_publication_id bigint;
begin
 perform app_private.assert_mfa_step_up();
 d:=api.get_my_fantasy_points_before_publication(p_team_id,p_gameweek_id);
 doc:=app_private.fantasy_rating_display_document(p_gameweek_id);
 if doc is null then return d; end if;
 pending:=jsonb_array_length(doc->'pendingFixtures')>0 or jsonb_array_length(doc->'pendingPlayerIds')>0;
 select id into display_publication_id from app_private.fantasy_current_rating_publications where gameweek_id=p_gameweek_id;
 revision:=display_publication_id is not null;
 select max(captured_at) into updated from app_private.fantasy_api_rating_sources s where exists(select 1 from jsonb_array_elements(doc->'fixtures') f where f->>'apiRatingSourceId'=s.id::text);
 d:=d||jsonb_build_object('ratingPublication',jsonb_build_object('historicalRevision',revision,'pending',pending,
 'pendingFixtures',jsonb_array_length(doc->'pendingFixtures'),'sourceUpdatedAt',updated),
 'pointsState',case when revision or pending then 'provisional' else d->>'pointsState' end,
 'incrementalScoring',true,
 'players',(select jsonb_agg(player||jsonb_build_object(
 'ratingPending',coalesce(c.rating_pending,app_private.fantasy_player_rating_pending(doc,(player->>'fantasyPlayerId')::uuid)),
 'provisionalPoints',case when coalesce(c.rating_pending,app_private.fantasy_player_rating_pending(doc,(player->>'fantasyPlayerId')::uuid)) and jsonb_array_length(player->'events')=0 then null else player->'provisionalPoints' end,
 'didPlay',case when coalesce(c.rating_pending,app_private.fantasy_player_rating_pending(doc,(player->>'fantasyPlayerId')::uuid)) and jsonb_array_length(player->'events')=0 then null else player->'didPlay' end
 ) order by ord) from jsonb_array_elements(d->'players') with ordinality x(player,ord)
 left join app_private.fantasy_published_rating_players c on c.publication_id=display_publication_id and c.fantasy_player_id=(player->>'fantasyPlayerId')::uuid));
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

-- The rules card follows the visible scale once every earlier existing round
-- has an approved rating publication; raw historical policy/seals stay intact.
create or replace function api.fantasy_rules(p_season_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select api.fantasy_rules_before_api_ratings(p_season_id)||coalesce((select jsonb_build_object('ratingScoring',
 jsonb_build_object('fromGameweek',case when not exists(select 1 from app.fantasy_gameweeks g
 where g.fantasy_season_id=p.season_id and g.sequence_number<p.from_gameweek
 and not exists(select 1 from app_private.fantasy_current_rating_publications x where x.gameweek_id=g.id))
 then least(p.from_gameweek,coalesce((select min(g.sequence_number) from app_private.fantasy_current_rating_publications x
 join app.fantasy_gameweeks g on g.id=x.gameweek_id where g.fantasy_season_id=p.season_id),p.from_gameweek)) else p.from_gameweek end,
 'noRatingPoints',null,'waitForRating',true)) from app_private.fantasy_api_rating_seasons p where p.season_id=p_season_id),'{}');
$$;
revoke all on function api.fantasy_rules(uuid) from public;
grant execute on function api.fantasy_rules(uuid) to anon,authenticated,service_role;

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

-- A visible incomplete revision is never a new prize entitlement. Existing
-- prize records remain untouched and no verification/payment can use it.
create function app_private.fantasy_rating_prize_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('verified','paid') and exists(
 select 1 from app_private.fantasy_current_rating_publications p join app.fantasy_gameweeks g on g.id=p.gameweek_id
 where g.fantasy_season_id=new.fantasy_season_id and g.sequence_number between new.first_gameweek_number and new.last_gameweek_number
 ) then raise exception using errcode='PT409',message='fantasy_ratings_pending'; end if;
 return new;
end $$;
revoke all on function app_private.fantasy_rating_prize_guard() from public,anon,authenticated,service_role;
create trigger fantasy_rating_prize_guard before insert or update on app.fantasy_prize_winners
for each row execute function app_private.fantasy_rating_prize_guard();

alter function app_private.fantasy_prize_award(uuid,app.fantasy_prize_tier,text,integer,integer,uuid,integer,uuid)
rename to fantasy_prize_award_before_rating_publication;
revoke all on function app_private.fantasy_prize_award_before_rating_publication(uuid,app.fantasy_prize_tier,text,integer,integer,uuid,integer,uuid) from public,anon,authenticated,service_role;
create function app_private.fantasy_prize_award(p_season_id uuid,p_tier app.fantasy_prize_tier,p_period_key text,
 p_first integer,p_last integer,p_gameweek_id uuid,p_block_number integer,p_league_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from app_private.fantasy_current_rating_publications p join app.fantasy_gameweeks g on g.id=p.gameweek_id
 where g.fantasy_season_id=p_season_id and g.sequence_number between p_first and p_last) then
 return jsonb_build_object('awarded',false,'reason','fantasy_ratings_pending'); end if;
 return app_private.fantasy_prize_award_before_rating_publication(p_season_id,p_tier,p_period_key,p_first,p_last,p_gameweek_id,p_block_number,p_league_id);
end $$;
revoke all on function app_private.fantasy_prize_award(uuid,app.fantasy_prize_tier,text,integer,integer,uuid,integer,uuid) from public,anon,authenticated,service_role;
