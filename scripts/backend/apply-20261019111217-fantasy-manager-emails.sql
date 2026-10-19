-- STAGING srdrflfrfpwixsllveid first; PRODUCTION tkewgajrljbwgwedqsxn only.
-- Canonical migration 20261019111217; SHA256 e3077f8856621e0283fbdea5e7c53486a8ba009f5d5372e5a743165a8b5d7959.
-- Reviewed exact main SHA, one operator, no competing workflow/schema writer.
-- Enum and automation are SEPARATE committed transactions. Never combine them.
-- This script never enables email or sends a message. Rehearse first, then
-- independently verify rollback. Change only bg.manager_email_mode to apply.
-- Before stage 1: record/pause relevant cron and worker switches, drain Edge
-- leases/requests, and restore the recorded switches promptly after completion.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
select set_config('bg.manager_email_mode','rehearsal',true);
select app_private.hold_scheduled_jobs();
do $preflight$
begin
 if not exists(select 1 from app.fantasy_seasons where id in('5ada3e98-2929-405a-a3f1-a26de8e51933','f9700000-0000-4000-8000-000000000005'))then
  raise exception 'manager_email_target_season_missing';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='20261019111217')then raise exception 'manager_email_already_applied';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20261018215311')then raise exception 'manager_email_rating_publication_required';end if;
 if not exists(select 1 from app_private.notification_email_settings where id and mode='off')then raise exception 'manager_email_sending_must_be_off';end if;
 
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20261019111026')then raise exception 'manager_email_enum_must_be_committed_first';end if;
 if to_regclass('app_private.fantasy_email_openings')is not null or to_regprocedure('api.service_validate_fantasy_email_delivery(uuid,jsonb,text,text)')is not null then raise exception 'manager_email_objects_already_present';end if;
 if md5((select prosrc from pg_proc where oid='app_private.notification_email_event_is_stale(app_private.notification_events,timestamptz)'::regprocedure))<>'831ad6197d5de070836480b58973ffcf'then raise exception 'manager_email_staleness_baseline_changed';end if;
 if exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled)
 or exists(select 1 from app_private.notification_email_settings where football_live_refresh_enabled)then raise exception 'manager_email_pause_relevant_writers_first';end if;
 if exists(select 1 from app_private.fantasy_worker_lease where released_at is null and expires_at>statement_timestamp())then raise exception 'manager_email_scoring_worker_active';end if;
 if exists(select 1 from app.notification_deliveries where status='claimed'and claim_expires_at>statement_timestamp())then raise exception 'manager_email_delivery_worker_active';end if;
 if exists(select 1 from net.http_request_queue)then raise exception 'manager_email_async_queue_active';end if;
 
end $preflight$;
create temporary table manager_email_before on commit drop as select 'events' name,md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,'')) digest from app_private.notification_events t
union all select 'notifications',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,''))from app.notifications t
union all select 'deliveries',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,''))from app.notification_deliveries t
union all select 'gameweeks',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,''))from app.fantasy_gameweeks t
union all select 'results',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,''))from app.fantasy_team_gameweek_results t
union all select 'preferences',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.user_id)::text,''))from app.user_preferences t
union all select 'settings',md5(coalesce(jsonb_agg(to_jsonb(t)-'manager_automation_enabled'-'enabled_types')::text,''))from app_private.notification_email_settings t
union all select 'cron',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.jobid)::text,''))from cron.job t;
insert into supabase_migrations.schema_migrations(version,name,statements)
values('20261019111217','fantasy_manager_email_automation',array[$manager_email_20261019111217$-- Adds future-only manager emails to the existing leased/quota-aware pipeline.
-- No mail activation, historical backfill, player linking or scoring change.
alter table app_private.notification_email_settings add column manager_automation_enabled boolean not null default false;
alter table app_private.notification_email_settings add column enabled_types text[] not null
 default array['matchday_preview','matchday_results','round_preview','match_starting','deadline_24h','gameweek_finalized','pepites_weekly'];
alter table app_private.notification_email_settings add constraint notification_email_enabled_types_check
 check(enabled_types <@ array['matchday_preview','matchday_results','round_preview','match_starting','deadline_24h','gameweek_finalized','pepites_weekly','gameweek_opened']::text[]);

create function app_private.notification_email_type_enabled(p_type text)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select p_type=any(enabled_types) from app_private.notification_email_settings where id),false);
$$;
revoke all on function app_private.notification_email_type_enabled(text) from public,anon,authenticated,service_role;

create function app_private.notification_manager_emails_enabled()
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select manager_automation_enabled from app_private.notification_email_settings where id),false);
$$;
revoke all on function app_private.notification_manager_emails_enabled()from public,anon,authenticated,service_role;

create table app_private.fantasy_email_openings(
 gameweek_id uuid primary key references app.fantasy_gameweeks(id) on delete cascade,
 opened_at timestamptz not null default statement_timestamp()
);
alter table app_private.fantasy_email_openings enable row level security;
alter table app_private.fantasy_email_openings force row level security;
revoke all on app_private.fantasy_email_openings from public,anon,authenticated,service_role;

create function app_private.fantasy_record_email_opening()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='open' and (tg_op='INSERT' or old.status is distinct from new.status) then
  insert into app_private.fantasy_email_openings(gameweek_id)values(new.id)on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function app_private.fantasy_record_email_opening()from public,anon,authenticated,service_role;
create trigger fantasy_record_email_opening after insert or update of status on app.fantasy_gameweeks
for each row execute function app_private.fantasy_record_email_opening();

-- Canonical payload: derives readiness from the CURRENT visible result, never
-- from the old sealed/category score or a queue's assertion of finality.
create function app_private.fantasy_email_payload(
 p_event app_private.notification_events,p_user_id uuid,p_now timestamptz
)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 g app.fantasy_gameweeks%rowtype;
 r app.fantasy_team_gameweek_results%rowtype;
 first_kickoff timestamptz;
 opened timestamptz;
 season_complete boolean;
 total_points bigint;
begin
 select * into g from app.fantasy_gameweeks where id=p_event.source_entity_id;
 if not found then return null; end if;
 if p_user_id is not null and not exists(select 1 from app.fantasy_teams t
  where t.user_id=p_user_id and t.fantasy_season_id=g.fantasy_season_id and t.status='active')then return null;end if;
 if p_event.event_type in('gameweek_opened','deadline_24h')then
  select min(f.kickoff_at)into first_kickoff from app.fantasy_fixture_assignments a
  join app.fixtures f on f.id=a.fixture_id where a.gameweek_id=g.id and a.superseded_at is null
  and f.status not in('postponed','cancelled','abandoned');
  if g.status<>'open' or g.deadline_at<=p_now+interval '30 minutes'
   or first_kickoff is null or not app_private.fantasy_kickoff_confirmed(first_kickoff)
   or g.deadline_at>=first_kickoff then return null;end if;
  if p_event.event_type='deadline_24h' and g.deadline_at>p_now+interval '24 hours'then return null;end if;
  -- Replanning a deadline creates a new event. An old event must never mail
  -- the superseded date, even if it is still in the future.
  if (p_event.safe_payload->>'deadlineAt')::timestamptz is distinct from g.deadline_at then return null;end if;
  select coalesce(o.opened_at,g.created_at)into opened from(select 1)q
  left join app_private.fantasy_email_openings o on o.gameweek_id=g.id;
  if opened>p_now then return null;end if;
  return jsonb_build_object('automationVersion',1,'gameweek',jsonb_build_object('id',g.id,'sequence',g.sequence_number,'name',g.name),
   'opensAt',opened,'deadlineAt',g.deadline_at,'selectionState','open','deadlineConfirmed',true);
 elsif p_event.event_type='gameweek_finalized'then
  if g.status not in('finalized','corrected')or g.points_state<>'final'or g.finalized_at is null
   or p_user_id is null or p_event.target_user_id is distinct from p_user_id then return null;end if;
  if not exists(select 1 from app_private.fantasy_api_rating_seasons s where s.season_id=g.fantasy_season_id and g.sequence_number>=s.from_gameweek)
   or not exists(select 1 from app_private.fantasy_rating_policy p where p.season_id=g.fantasy_season_id and p.enabled and g.sequence_number>=p.from_gameweek)then return null;end if;
  select v.*into r from app_private.fantasy_visible_team_results v
  join app.fantasy_teams t on t.id=v.fantasy_team_id
  where v.gameweek_id=g.id and t.user_id=p_user_id;
  if not found or r.state<>'final'or r.final_score is null or r.finalized_at is null
   or r.calculation_version<>g.scoring_input_version
   or r.final_score is distinct from (p_event.safe_payload->>'points')::integer then return null;end if;
  if not exists(select 1 from app.fantasy_lineups l where l.gameweek_id=g.id
   and l.fantasy_team_id=r.fantasy_team_id and l.locked_at is not null and l.finalized_at is not null)then return null;end if;
  -- A final native rating result must not contain a missing selected player's
  -- final value. Historical published revisions are deliberately provisional.
  if exists(select 1 from app.fantasy_lineups l join app.fantasy_lineup_players lp on lp.lineup_id=l.id
   left join app_private.fantasy_visible_player_points pp on pp.gameweek_id=l.gameweek_id and pp.fantasy_player_id=lp.fantasy_player_id
   where l.gameweek_id=g.id and l.fantasy_team_id=r.fantasy_team_id and pp.final_points is null)then return null;end if;
  select bool_and(v.state='final'and v.final_score is not null),sum(v.final_score)
  into season_complete,total_points from app_private.fantasy_visible_team_results v where v.fantasy_team_id=r.fantasy_team_id;
  return jsonb_build_object('automationVersion',1,'state','finalized','pendingPlayers',0,'gameweek',g.sequence_number,
   'calculationVersion',r.calculation_version,'points',r.final_score,
   'totalPoints',case when season_complete then total_points end,
   'overallRank',case when season_complete then r.overall_rank end);
 end if;
 return null;
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then return null;
end $$;
revoke all on function app_private.fantasy_email_payload(app_private.notification_events,uuid,timestamptz)from public,anon,authenticated,service_role;

create function app_private.notification_email_plan_openings(p_now timestamptz)
returns integer language plpgsql security definer set search_path='' as $$
declare candidate record;n integer:=0;activation timestamptz;
begin
 if not app_private.notification_manager_emails_enabled()or not app_private.notification_email_type_enabled('gameweek_opened')then return 0;end if;
 select activated_at into activation from app_private.notification_email_settings where id and mode in('test','live');
 if activation is null then return 0;end if;
 for candidate in select g.*,o.opened_at from app.fantasy_gameweeks g
  join app_private.fantasy_email_openings o on o.gameweek_id=g.id
  where g.status='open'and g.deadline_at>p_now+interval '30 minutes'and o.opened_at>=activation
  and exists(select 1 from app.fantasy_fixture_assignments a join app.fixtures f on f.id=a.fixture_id
   where a.gameweek_id=g.id and a.superseded_at is null and app_private.fantasy_kickoff_confirmed(f.kickoff_at))
 loop
  if app_private.notification_email_enqueue('gameweek_opened','fantasy',candidate.id,
   'email:gameweek_opened:'||candidate.id::text,
   jsonb_build_object('gameweek',jsonb_build_object('id',candidate.id,'sequence',candidate.sequence_number,'name',candidate.name),
    'opensAt',candidate.opened_at,'deadlineAt',candidate.deadline_at),p_now)then n:=n+1;end if;
 end loop;
 return n;
end $$;
revoke all on function app_private.notification_email_plan_openings(timestamptz)from public,anon,authenticated,service_role;

insert into app.notification_templates(template_key,notification_type,category,channel,language,version,
 title_template,body_template,required_variables,max_title_length,max_body_length,active,activated_at)values
('gameweek_opened','gameweek_opened','fantasy','in_app','fr',1,'Journée {{gameweek}} : à toi de jouer !',
 'Choisis ton équipe avant le {{deadline}}.',array['gameweek','deadline'],120,300,true,statement_timestamp()),
('gameweek_opened','gameweek_opened','fantasy','in_app','ar',1,'الجولة {{gameweek}}: حان دورك!',
 'اختر تشكيلتك قبل {{deadline}}.',array['gameweek','deadline'],120,300,true,statement_timestamp());

create or replace function app_private.notification_email_event_is_stale(p_event app_private.notification_events,p_now timestamptz)
returns boolean language sql stable security definer set search_path='' as $$
 select case p_event.event_type::text
 when 'gameweek_opened'then not app_private.notification_manager_emails_enabled()or app_private.fantasy_email_payload(p_event,null,p_now)is null
 when 'deadline_24h'then case when app_private.notification_manager_emails_enabled()then app_private.fantasy_email_payload(p_event,null,p_now)is null
  else coalesce((p_event.safe_payload->>'deadlineAt')::timestamptz<=p_now+interval '30 minutes',true)end
 when 'gameweek_finalized'then p_event.received_at<p_now-interval '72 hours'
  or(app_private.notification_manager_emails_enabled()and app_private.fantasy_email_payload(p_event,p_event.target_user_id,p_now)is null)
 when 'matchday_preview'then p_event.occurred_at<p_now-interval '12 hours'
 when 'matchday_results'then p_event.occurred_at<p_now-interval '18 hours'
 when 'round_preview'then p_event.occurred_at<p_now-interval '36 hours'
 when 'match_starting'then coalesce((p_event.safe_payload->'fixture'->>'kickoffAt')::timestamptz<=p_now,true)
 when 'pepites_weekly'then p_event.occurred_at<p_now-interval '36 hours'
 else true end;
$$;

-- Send-boundary read: no claim, queue mutation or provider call. Unknown or
-- stale state fails closed; the dispatcher cancels without exposing addresses.
create function api.service_validate_fantasy_email_delivery(
 p_delivery_id uuid,p_expected_payload jsonb,p_recipient_email text,p_time_zone text
)returns boolean language plpgsql stable security definer set search_path='' as $$
declare ok boolean;
begin
 if not app_private.is_service_request()then raise exception using errcode='PT403',message='notification_access_denied';end if;
 select exists(select 1 from app.notification_deliveries d
 join app.notifications n on n.id=d.notification_id
 join app_private.notification_events ev on ev.id=n.event_id
 join app.user_preferences p on p.user_id=n.user_id
 join app.profiles profile on profile.id=n.user_id
 join auth.users u on u.id=n.user_id
 cross join app_private.notification_email_settings s
 where d.id=p_delivery_id and d.channel='email'and d.provider_key='resend'and d.status='claimed'and d.claim_expires_at>statement_timestamp()
 and s.id and s.manager_automation_enabled and s.mode in('test','live')and(s.mode='live'or n.user_id=any(s.test_user_ids))
 and ev.received_at>=s.activated_at and app_private.notification_email_type_enabled(n.notification_type::text)
 and n.notification_type in('gameweek_opened','deadline_24h','gameweek_finalized')
 and p.notifications_enabled and p.email_notifications_enabled and p.fantasy_deadline_reminders
 and p.notification_timezone=p_time_zone and profile.deleted_at is null
 and u.deleted_at is null and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
 and(u.banned_until is null or u.banned_until<statement_timestamp())and u.email=p_recipient_email
 and not app_private.notification_email_event_is_stale(ev,statement_timestamp())
 and app_private.fantasy_email_payload(ev,n.user_id,statement_timestamp())=p_expected_payload
 )into ok;
 return ok;
end $$;
revoke all on function api.service_validate_fantasy_email_delivery(uuid,jsonb,text,text)from public,anon,authenticated;
grant execute on function api.service_validate_fantasy_email_delivery(uuid,jsonb,text,text)to service_role;

-- Keep the existing bounded fanout, provider quotas, recipient checks, leases,
-- unsubscribe tokens and 23-hour ambiguous-send window. Pinned source edits
-- below add the new moment and trusted payloads without replacing those guards.
-- BEGIN PINNED PIPELINE UPDATES

-- notification_email_fanout: preserve the existing pipeline and privileges.
do $rewrite$
declare source text;
begin
 if md5((select prosrc from pg_proc where oid='app_private.notification_email_fanout(timestamptz,text,uuid[],timestamptz,integer)'::regprocedure))<>'93eafdf20ad7fde193a4f4745a201342' then raise exception 'email_automation_unexpected_notification_email_fanout';end if;
 source:=pg_get_functiondef('app_private.notification_email_fanout(timestamptz,text,uuid[],timestamptz,integer)'::regprocedure);
 if position($old$email_types constant app.notification_type[]$old$ in source)=0 then raise exception 'email_automation_anchor_missing';end if;
source:=replace(source,$old$email_types constant app.notification_type[]$old$,$new$email_types app.notification_type[]$new$);
 if position($old$'match_starting', 'deadline_24h', 'gameweek_finalized', 'pepites_weekly'$old$ in source)=0 then raise exception 'email_automation_anchor_missing';end if;
source:=replace(source,$old$'match_starting', 'deadline_24h', 'gameweek_finalized', 'pepites_weekly'$old$,$new$'match_starting', 'deadline_24h', 'gameweek_finalized', 'pepites_weekly', 'gameweek_opened'$new$);
 if position($old$begin
  if p_mode$old$ in source)=0 then raise exception 'email_automation_anchor_missing';end if;
source:=replace(source,$old$begin
  if p_mode$old$,$new$begin
  email_types:=array(select x from unnest(email_types)x where app_private.notification_email_type_enabled(x::text));
  if p_mode$new$);
 if position($old$when 'deadline_24h' then preference.fantasy_deadline_reminders$old$ in source)=0 then raise exception 'email_automation_anchor_missing';end if;
source:=replace(source,$old$when 'deadline_24h' then preference.fantasy_deadline_reminders$old$,$new$when 'gameweek_opened' then app_private.notification_manager_emails_enabled() and preference.fantasy_deadline_reminders and exists(select 1 from app.fantasy_teams ft join app.fantasy_gameweeks gw on gw.fantasy_season_id=ft.fantasy_season_id where ft.user_id=profile.id and ft.status='active' and gw.id=target.source_entity_id) and not exists(select 1 from app.notifications earlier where earlier.user_id=profile.id and earlier.notification_type=target.event_type and earlier.source_entity_id=target.source_entity_id and earlier.event_id<>target.id)
          when 'deadline_24h' then preference.fantasy_deadline_reminders and (not app_private.notification_manager_emails_enabled() or (exists(select 1 from app.fantasy_teams ft join app.fantasy_gameweeks gw on gw.fantasy_season_id=ft.fantasy_season_id where ft.user_id=profile.id and ft.status='active' and gw.id=target.source_entity_id) and not exists(select 1 from app.notifications earlier where earlier.user_id=profile.id and earlier.notification_type=target.event_type and earlier.source_entity_id=target.source_entity_id and earlier.event_id<>target.id)))$new$);
 if position($old$when 'deadline_24h' then jsonb_build_object($old$ in source)=0 then raise exception 'email_automation_anchor_missing';end if;
source:=replace(source,$old$when 'deadline_24h' then jsonb_build_object($old$,$new$when 'gameweek_opened' then jsonb_build_object('gameweek',target.safe_payload->'gameweek'->>'sequence','deadline',to_char(app_private.zone_local((target.safe_payload->>'deadlineAt')::timestamptz,audience.timezone),'DD/MM HH24:MI'))
          when 'deadline_24h' then jsonb_build_object($new$);
 if position($old$when 'deadline_24h' then 'fantasy_transfers'$old$ in source)=0 then raise exception 'email_automation_anchor_missing';end if;
source:=replace(source,$old$when 'deadline_24h' then 'fantasy_transfers'$old$,$new$when 'gameweek_opened' then 'fantasy_team'
          when 'deadline_24h' then 'fantasy_team'$new$);
 execute source;
end $rewrite$;

-- service_claim_email_deliveries: preserve the existing pipeline and privileges.
do $rewrite$
declare source text;
begin
 if md5((select prosrc from pg_proc where oid='api.service_claim_email_deliveries(integer,integer)'::regprocedure))<>'d8f58643501628c18e796beca75d322e' then raise exception 'email_automation_unexpected_service_claim_email_deliveries';end if;
 source:=pg_get_functiondef('api.service_claim_email_deliveries(integer,integer)'::regprocedure);
 if position($old$notification.notification_type in ('deadline_24h', 'gameweek_finalized')$old$ in source)=0 then raise exception 'email_automation_anchor_missing';end if;
source:=replace(source,$old$notification.notification_type in ('deadline_24h', 'gameweek_finalized')$old$,$new$notification.notification_type in ('deadline_24h', 'gameweek_finalized', 'gameweek_opened')$new$);
 if position($old$      or app_private.notification_email_event_is_stale(event, statement_timestamp())$old$ in source)=0 then raise exception 'email_automation_anchor_missing';end if;
source:=replace(source,$old$      or app_private.notification_email_event_is_stale(event, statement_timestamp())$old$,$new$      or event.received_at<settings.activated_at
      or not app_private.notification_email_type_enabled(notification.notification_type::text)
      or (settings.manager_automation_enabled and notification.notification_type in('gameweek_opened','deadline_24h','gameweek_finalized') and app_private.fantasy_email_payload(event,notification.user_id,statement_timestamp()) is null)
      or app_private.notification_email_event_is_stale(event, statement_timestamp())$new$);
 if position($old$      and (settings.mode = 'live' or notification.user_id = any(settings.test_user_ids))$old$ in source)=0 then raise exception 'email_automation_anchor_missing';end if;
source:=replace(source,$old$      and (settings.mode = 'live' or notification.user_id = any(settings.test_user_ids))$old$,$new$      and app_private.notification_email_type_enabled(notification.notification_type::text)
      and (settings.mode = 'live' or notification.user_id = any(settings.test_user_ids))$new$);
 if position($old$        when 'deadline_24h' then 2$old$ in source)=0 then raise exception 'email_automation_anchor_missing';end if;
source:=replace(source,$old$        when 'deadline_24h' then 2$old$,$new$        when 'deadline_24h' then 2
        when 'gameweek_opened' then 6$new$);
 if position($old$        when notification.notification_type = 'gameweek_finalized' then event.safe_payload || coalesce((
          select jsonb_build_object(
            'overallRank', result.overall_rank,
            'totalPoints', (
              select sum(season_result.final_score)
              from app.fantasy_team_gameweek_results season_result
              where season_result.fantasy_team_id = result.fantasy_team_id
                and season_result.state = 'final'
            )
          )
          from app.fantasy_team_gameweek_results result
          join app.fantasy_teams team on team.id = result.fantasy_team_id
          where team.user_id = tokened.user_id and result.gameweek_id = event.source_entity_id
          limit 1
        ), jsonb_build_object('overallRank', null, 'totalPoints', null))
$old$ in source)=0 then raise exception 'email_automation_anchor_missing';end if;
source:=replace(source,$old$        when notification.notification_type = 'gameweek_finalized' then event.safe_payload || coalesce((
          select jsonb_build_object(
            'overallRank', result.overall_rank,
            'totalPoints', (
              select sum(season_result.final_score)
              from app.fantasy_team_gameweek_results season_result
              where season_result.fantasy_team_id = result.fantasy_team_id
                and season_result.state = 'final'
            )
          )
          from app.fantasy_team_gameweek_results result
          join app.fantasy_teams team on team.id = result.fantasy_team_id
          where team.user_id = tokened.user_id and result.gameweek_id = event.source_entity_id
          limit 1
        ), jsonb_build_object('overallRank', null, 'totalPoints', null))
$old$,$new$        when settings.manager_automation_enabled and notification.notification_type in('gameweek_opened','deadline_24h','gameweek_finalized') then app_private.fantasy_email_payload(event,tokened.user_id,statement_timestamp())
        when notification.notification_type = 'gameweek_finalized' then event.safe_payload || coalesce((
          select jsonb_build_object(
            'overallRank', result.overall_rank,
            'totalPoints', (
              select sum(season_result.final_score)
              from app.fantasy_team_gameweek_results season_result
              where season_result.fantasy_team_id = result.fantasy_team_id
                and season_result.state = 'final'
            )
          )
          from app.fantasy_team_gameweek_results result
          join app.fantasy_teams team on team.id = result.fantasy_team_id
          where team.user_id = tokened.user_id and result.gameweek_id = event.source_entity_id
          limit 1
        ), jsonb_build_object('overallRank', null, 'totalPoints', null))
$new$);
 execute source;
end $rewrite$;

-- notification_email_tick: preserve the existing pipeline and privileges.
do $rewrite$
declare source text;
begin
 if md5((select prosrc from pg_proc where oid='app_private.notification_email_tick()'::regprocedure))<>'7688953ab3ac5e6dc28e8ff20b230c97' then raise exception 'email_automation_unexpected_notification_email_tick';end if;
 source:=pg_get_functiondef('app_private.notification_email_tick()'::regprocedure);
 if position($old$plan_result := app_private.notification_email_plan(run_started);$old$ in source)=0 then raise exception 'email_automation_anchor_missing';end if;
source:=replace(source,$old$plan_result := app_private.notification_email_plan(run_started);$old$,$new$plan_result := app_private.notification_email_plan(run_started) || jsonb_build_object('managerOpenings',app_private.notification_email_plan_openings(run_started));$new$);
 execute source;
end $rewrite$;
$manager_email_20261019111217$]);
do $install$
declare source text;
begin
 select statements[1]into source from supabase_migrations.schema_migrations where version='20261019111217';
 if encode(extensions.digest(source,'sha256'),'hex')<>'e3077f8856621e0283fbdea5e7c53486a8ba009f5d5372e5a743165a8b5d7959'then raise exception 'manager_email_source_checksum_mismatch';end if;
 execute source;
end $install$;
do $postflight$
begin
 if exists(select 1 from manager_email_before b full join(select 'events' name,md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,'')) digest from app_private.notification_events t
union all select 'notifications',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,''))from app.notifications t
union all select 'deliveries',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,''))from app.notification_deliveries t
union all select 'gameweeks',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,''))from app.fantasy_gameweeks t
union all select 'results',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,''))from app.fantasy_team_gameweek_results t
union all select 'preferences',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.user_id)::text,''))from app.user_preferences t
union all select 'settings',md5(coalesce(jsonb_agg(to_jsonb(t)-'manager_automation_enabled'-'enabled_types')::text,''))from app_private.notification_email_settings t
union all select 'cron',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.jobid)::text,''))from cron.job t)a using(name)where b.digest is distinct from a.digest)then raise exception 'manager_email_unexpected_data_change';end if;
 
 if not exists(select 1 from app_private.notification_email_settings where id and mode='off'and not manager_automation_enabled)then raise exception 'manager_email_activation_changed';end if;
 if exists(select 1 from app_private.fantasy_email_openings)then raise exception 'manager_email_historical_opening_backfill';end if;
 if not has_function_privilege('service_role','api.service_validate_fantasy_email_delivery(uuid,jsonb,text,text)','execute')
 or has_function_privilege('anon','api.service_validate_fantasy_email_delivery(uuid,jsonb,text,text)','execute')
 or has_function_privilege('authenticated','api.service_validate_fantasy_email_delivery(uuid,jsonb,text,text)','execute')then raise exception 'manager_email_service_grants_invalid';end if;
 if has_table_privilege('service_role','app_private.fantasy_email_openings','select')then raise exception 'manager_email_private_ledger_exposed';end if;
 
 if current_setting('bg.manager_email_mode')='rehearsal'then raise exception 'MANAGER_EMAIL_REHEARSAL_PASSED_20261019111217: all changes rolled back';end if;
 if current_setting('bg.manager_email_mode')<>'apply'then raise exception 'manager_email_invalid_promotion_mode';end if;
end $postflight$;
commit;
select version,name from supabase_migrations.schema_migrations where version='20261019111217';
