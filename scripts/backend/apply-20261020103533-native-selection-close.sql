-- Owner-approved native selection carry-over. Default: real-path rollback rehearsal.
-- Exact migration SHA256: f873e94a16948b32937791cc66325785bc05c96a2d123c772ee6ed0a1cd454ee
begin;
set local lock_timeout='5s';set local statement_timeout='90s';
select set_config('bg.selection_release_mode','rehearsal',true);
select app_private.hold_scheduled_jobs();
lock table app_private.fantasy_worker_lease in exclusive mode;
do $baseline$begin
 if exists(select 1 from app_private.notification_email_settings where mode<>'off'or football_live_refresh_enabled)
 or exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled or lifecycle_worker_enabled)
 or exists(select 1 from app_private.manager_card_settings where compute_enabled)
 or exists(select 1 from app_private.account_deletion_settings where enabled)
 or exists(select 1 from app_private.rivals_settings where enabled)
 or exists(select 1 from app_private.trophy_settings where enabled)
 or exists(select 1 from app_private.pepites_settings where mode<>'off')
 or exists(select 1 from cron.job where jobname='notification-push-tick'and active)
 or exists(select 1 from net.http_request_queue)
 or exists(select 1 from app.notification_deliveries where status='claimed'and claim_expires_at>statement_timestamp())
 or exists(select 1 from app_private.fantasy_worker_lease where released_at is null and expires_at>statement_timestamp())
 then raise exception 'selection_release_writers_not_drained';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='20261020103533')
 or to_regprocedure('api.service_begin_fantasy_selection_close(uuid,bigint)')is not null
 or exists(select 1 from information_schema.columns where table_schema='app_private'and table_name='fantasy_gameweek_close'and column_name='close_kind')
 then raise exception 'selection_release_already_present';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20261020091926')then raise exception 'selection_release_native_email_predecessor_missing';end if;
 if md5((select prosrc from pg_proc where oid='api.service_fantasy_lifecycle_state(uuid)'::regprocedure))is distinct from 'eb8e5036e7dd481d9c1935accf818ff1'then raise exception 'selection_release_state_baseline_changed';end if;
 if md5((select prosrc from pg_proc where oid='app_private.notification_email_plan(timestamptz)'::regprocedure))is distinct from 'b686fb3d2000279349c4d1afbb9f7edf'then raise exception 'selection_release_planner_baseline_changed';end if;
 if md5((select prosrc from pg_proc where oid='app_private.fantasy_rating_display_document(uuid)'::regprocedure))is distinct from '170b50ccb53c653bad1eaaddcd054a79'then raise exception 'selection_release_display_baseline_changed';end if;
end $baseline$;
create temporary table protected_selection_release on commit drop as select 'app.fixtures' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fixtures t
union all select 'app.rounds' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.rounds t
union all select 'app.seasons' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.seasons t
union all select 'app.fantasy_gameweeks' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_gameweeks t
union all select 'app.fantasy_fixture_assignments' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_fixture_assignments t
union all select 'app.fantasy_players' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_players t
union all select 'app.fantasy_teams' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_teams t
union all select 'app.fantasy_squad_memberships' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_squad_memberships t
union all select 'app.fantasy_lineups' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_lineups t
union all select 'app.fantasy_lineup_players' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_lineup_players t
union all select 'app.fantasy_transfer_batches' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_transfer_batches t
union all select 'app.fantasy_transfers' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_transfers t
union all select 'app.fantasy_player_point_events' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_player_point_events t
union all select 'app.fantasy_player_gameweek_points' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_player_gameweek_points t
union all select 'app.fantasy_team_gameweek_results' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_team_gameweek_results t
union all select 'app_private.fantasy_scoring_snapshots' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_scoring_snapshots t
union all select 'app_private.fantasy_rating_publications' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_rating_publications t
union all select 'app_private.fantasy_published_rating_players' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_published_rating_players t
union all select 'app_private.fantasy_rating_recovery_plans' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_rating_recovery_plans t
union all select 'app_private.fantasy_api_rating_sources' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_api_rating_sources t
union all select 'app_private.fantasy_api_rating_polls' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_api_rating_polls t
union all select 'app_private.fantasy_not_rated_settlements' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_not_rated_settlements t
union all select 'app_private.fantasy_rating_checks' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_rating_checks t
union all select 'app_private.fantasy_legacy_identity_repairs' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_legacy_identity_repairs t
union all select 'app_private.football_provider_mappings' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.football_provider_mappings t
union all select 'app_private.sofascore_player_aliases' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.sofascore_player_aliases t
union all select 'app_private.notification_events' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.notification_events t
union all select 'app.notifications' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.notifications t
union all select 'app.notification_deliveries' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.notification_deliveries t
union all select 'app_private.fantasy_free_transfer_rollovers' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_free_transfer_rollovers t
union all select 'app_private.fantasy_gameweek_progressions' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_gameweek_progressions t
union all select 'app_private.fantasy_gameweek_postwork' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_gameweek_postwork t
union all select 'app_private.fantasy_gameweek_close' name,count(*)n,md5(coalesce(string_agg(((to_jsonb(t)-'close_kind'))::text,E'\n' order by ((to_jsonb(t)-'close_kind'))::text),''))digest from app_private.fantasy_gameweek_close t
union all select 'app.fantasy_free_hit_snapshots' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_free_hit_snapshots t
union all select 'app.fantasy_free_hit_snapshot_players' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_free_hit_snapshot_players t
union all select 'app_private.fantasy_free_hit_lineup_snapshots' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_free_hit_lineup_snapshots t
union all select 'app.fantasy_player_price_history' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_player_price_history t
union all select 'app.fantasy_prize_winners' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_prize_winners t
union all select 'app_private.fantasy_api_rating_seasons' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_api_rating_seasons t
union all select 'app_private.fantasy_not_rated_policy' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_not_rated_policy t
union all select 'app_private.fantasy_staged_stats_policy' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_staged_stats_policy t
union all select 'app_private.fantasy_rating_policy' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_rating_policy t
union all select 'scoring_and_economic_guards',count(*),md5(string_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),p.prosrc,p.prosecdef,p.proconfig,p.proacl)::text,E'\n'order by p.oid))from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('api','app_private')and p.proname in('service_begin_fantasy_close','service_begin_fantasy_finalization','service_complete_fantasy_gameweek','service_persist_fantasy_scoring_results','fantasy_validate_scoring_document','fantasy_api_rating_document','fantasy_actual_ratings_pending','fantasy_email_payload','service_prepare_next_fantasy_gameweek','service_run_fantasy_close_price_batch','service_restore_free_hit','service_roll_fantasy_free_transfers','service_apply_fantasy_price_changes','service_adopt_fantasy_close_prices');
-- Selection carry-over does not require a rating or a published score.
-- The original complete-scoring close and all finalization guards stay intact.
alter table app_private.fantasy_gameweek_close
  add column close_kind text not null default 'scoring_complete'
  check (close_kind in ('scoring_complete', 'selection_only'));

comment on column app_private.fantasy_gameweek_close.close_kind is
  'selection_only is an administrative native-rating close; its version/digest identify the carry-over receipt, never a published scoring snapshot.';

create function app_private.fantasy_selection_ratings_pending(p_gameweek_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare d jsonb;
begin
 d:=app_private.fantasy_scoring_input_document(p_gameweek_id);
 return d->>'apiNativeRatings' is distinct from 'true'
   or coalesce(app_private.fantasy_actual_ratings_pending(d),true)
   or jsonb_array_length(coalesce(d->'pendingFixtures','[]'::jsonb))>0
   or jsonb_array_length(coalesce(d->'pendingPlayerIds','[]'::jsonb))>0;
end $$;
revoke all on function app_private.fantasy_selection_ratings_pending(uuid) from public,anon,authenticated,service_role;

-- A selection-only close intentionally has no persisted scoring calculation.
-- Preserve existing published/sealed display precedence, but expose pending
-- flags from the native document while this closed round awaits its first score.
create or replace function app_private.fantasy_rating_display_document(p_gameweek_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select proposal from app_private.fantasy_current_rating_publications where gameweek_id=p_gameweek_id),
 (select payload from app_private.fantasy_scoring_snapshots where gameweek_id=p_gameweek_id
   and payload->>'apiNativeRatings'='true'and players_persisted order by calculation_version desc limit 1),
 (select app_private.fantasy_scoring_input_document(g.id)from app.fantasy_gameweeks g
   join app_private.fantasy_api_rating_seasons p on p.season_id=g.fantasy_season_id
   where g.id=p_gameweek_id and g.status='provisional'and g.closed_at is not null
     and g.sequence_number>=p.from_gameweek));
$$;

create function api.service_begin_fantasy_selection_close(p_gameweek_id uuid,p_expected_lock_version bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g app.fantasy_gameweeks%rowtype;s app.fantasy_seasons%rowtype;
 c app_private.fantasy_gameweek_close%rowtype;d jsonb;v bigint;pending boolean;
begin
 if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden';end if;
 if p_gameweek_id is null or p_expected_lock_version is null or p_expected_lock_version<1 then
   raise exception using errcode='PT400',message='validation_failed';end if;
 select *into g from app.fantasy_gameweeks where id=p_gameweek_id for update;
 if not found then raise exception using errcode='PT404',message='fantasy_gameweek_not_found';end if;
 select *into s from app.fantasy_seasons where id=g.fantasy_season_id;
 if s.status not in('registration_open','active') or g.status<>'provisional' or g.deadline_at>statement_timestamp()
   or not exists(select 1 from app_private.fantasy_api_rating_seasons p
     where p.season_id=s.id and g.sequence_number>=p.from_gameweek) then
   raise exception using errcode='PT409',message='fantasy_selection_close_not_allowed';end if;
 if g.closed_at is not null then
   select *into c from app_private.fantasy_gameweek_close where gameweek_id=g.id;
   if not found or c.calculation_version is distinct from g.closed_calculation_version then
     raise exception using errcode='PT409',message='fantasy_close_receipt_missing';end if;
   return jsonb_build_object('closed',true,'closeVersion',c.calculation_version,
     'ratingsPending',app_private.fantasy_selection_ratings_pending(g.id),'stableResult',true);
 end if;
 if g.lock_version<>p_expected_lock_version then
   raise exception using errcode='PT409',message='stale_update';end if;
 -- Serialize the genuine match-end facts and frozen assignment checks with ingestion.
 perform a.id from app.fantasy_fixture_assignments a join app.fixtures f on f.id=a.fixture_id
 where a.gameweek_id=g.id and a.superseded_at is null order by f.id,a.id for share of a,f;
 if not exists(select 1 from app.fantasy_fixture_assignments where gameweek_id=g.id
     and superseded_at is null and counts_points)
   or exists(select 1 from app.fantasy_fixture_assignments a join app.fixtures f on f.id=a.fixture_id
     where a.gameweek_id=g.id and a.superseded_at is null and(
       not a.counts_points or a.frozen_at is null or a.fantasy_season_id<>s.id
       or a.assignment_status not in('assigned','confirmed','reassigned')
       or f.season_id<>s.football_season_id or f.kickoff_at is distinct from a.assigned_kickoff_at
       or not app_private.fantasy_kickoff_confirmed(f.kickoff_at)
       or f.status<>'finished' or f.finalized_at is null or f.finalized_at>statement_timestamp()
       or f.kickoff_at>statement_timestamp() or f.finalized_at<f.kickoff_at
       or f.home_score is null or f.away_score is null))then
   raise exception using errcode='PT409',message='fantasy_selection_matches_unfinished';end if;
 if exists(select 1 from app.fantasy_lineups where gameweek_id=g.id and locked_at is null)
   or exists(select 1 from app.fantasy_teams t where t.fantasy_season_id=s.id and t.status='active'
     and t.current_gameweek_id=g.id and not exists(select 1 from app.fantasy_lineups l
       where l.fantasy_team_id=t.id and l.gameweek_id=g.id and l.locked_at is not null))then
   raise exception using errcode='PT409',message='fantasy_selection_lineups_unlocked';end if;
 d:=app_private.fantasy_scoring_input_document(g.id);
 if d->>'apiNativeRatings' is distinct from 'true' or d->>'scoringVersion' is distinct from '3' then
   raise exception using errcode='PT409',message='fantasy_selection_native_document_required';end if;
 pending:=app_private.fantasy_selection_ratings_pending(g.id);
 -- This is a carry-over version, not a synthesized scoring calculation.
 -- In particular, no scoring_input_version, score, snapshot or rating is written.
 v:=greatest(g.scoring_input_version,1);
 insert into app_private.fantasy_gameweek_close(gameweek_id,calculation_version,input_digest,
   price_source_version,price_player_ids,close_kind)
 values(g.id,v,encode(extensions.digest(d::text,'sha256'),'hex'),g.sequence_number::bigint+1,
   (select coalesce(array_agg(id order by id),'{}'::uuid[])from app.fantasy_players where fantasy_season_id=s.id),
   'selection_only');
 update app.fantasy_gameweeks set closed_at=statement_timestamp(),closed_calculation_version=v,
   lock_version=lock_version+1 where id=g.id;
 return jsonb_build_object('closed',true,'closeVersion',v,'ratingsPending',pending,'stableResult',false);
end $$;
revoke all on function api.service_begin_fantasy_selection_close(uuid,bigint) from public,anon,authenticated;
grant execute on function api.service_begin_fantasy_selection_close(uuid,bigint) to service_role;

create or replace function api.service_fantasy_lifecycle_state(p_gameweek_id uuid)
returns jsonb language sql security definer set search_path='' as $$
 select app_private.fantasy_lifecycle_state_before_api_ratings(p_gameweek_id)
 ||case when exists(select 1 from app.fantasy_gameweeks g join app_private.fantasy_api_rating_seasons p
   on p.season_id=g.fantasy_season_id where g.id=p_gameweek_id and g.sequence_number>=p.from_gameweek)
 then jsonb_build_object('adaptiveScoringEnabled',false,'apiNativeRatings',true,
   'selectionCloseEnabled',true,'selectionRatingsPending',case when exists(select 1 from app.fantasy_gameweeks
     where id=p_gameweek_id and status='provisional')then app_private.fantasy_selection_ratings_pending(p_gameweek_id)else false end)
 else '{}'::jsonb end;
$$;

-- A successor may open inside its last 24 hours. Do not consume its reminder
-- deduplication key while it is still scheduled and cannot accept selections.
do $patch$ declare original text;changed text;
begin
 original:=pg_get_functiondef('app_private.notification_email_plan(timestamptz)'::regprocedure);
 changed:=replace(original,$old$      and gameweek.status in ('scheduled', 'open')$old$,
 $new$      and gameweek.status in ('scheduled', 'open')
      and (not app_private.notification_manager_emails_enabled() or gameweek.status='open')$new$);
 if changed=original then raise exception 'selection_close_reminder_patch_mismatch';end if;
 execute changed;
end $patch$;

insert into supabase_migrations.schema_migrations(version,name,statements)values('20261020103533','fantasy_native_selection_close',array[$selection_source$-- Selection carry-over does not require a rating or a published score.
-- The original complete-scoring close and all finalization guards stay intact.
alter table app_private.fantasy_gameweek_close
  add column close_kind text not null default 'scoring_complete'
  check (close_kind in ('scoring_complete', 'selection_only'));

comment on column app_private.fantasy_gameweek_close.close_kind is
  'selection_only is an administrative native-rating close; its version/digest identify the carry-over receipt, never a published scoring snapshot.';

create function app_private.fantasy_selection_ratings_pending(p_gameweek_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare d jsonb;
begin
 d:=app_private.fantasy_scoring_input_document(p_gameweek_id);
 return d->>'apiNativeRatings' is distinct from 'true'
   or coalesce(app_private.fantasy_actual_ratings_pending(d),true)
   or jsonb_array_length(coalesce(d->'pendingFixtures','[]'::jsonb))>0
   or jsonb_array_length(coalesce(d->'pendingPlayerIds','[]'::jsonb))>0;
end $$;
revoke all on function app_private.fantasy_selection_ratings_pending(uuid) from public,anon,authenticated,service_role;

-- A selection-only close intentionally has no persisted scoring calculation.
-- Preserve existing published/sealed display precedence, but expose pending
-- flags from the native document while this closed round awaits its first score.
create or replace function app_private.fantasy_rating_display_document(p_gameweek_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select proposal from app_private.fantasy_current_rating_publications where gameweek_id=p_gameweek_id),
 (select payload from app_private.fantasy_scoring_snapshots where gameweek_id=p_gameweek_id
   and payload->>'apiNativeRatings'='true'and players_persisted order by calculation_version desc limit 1),
 (select app_private.fantasy_scoring_input_document(g.id)from app.fantasy_gameweeks g
   join app_private.fantasy_api_rating_seasons p on p.season_id=g.fantasy_season_id
   where g.id=p_gameweek_id and g.status='provisional'and g.closed_at is not null
     and g.sequence_number>=p.from_gameweek));
$$;

create function api.service_begin_fantasy_selection_close(p_gameweek_id uuid,p_expected_lock_version bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g app.fantasy_gameweeks%rowtype;s app.fantasy_seasons%rowtype;
 c app_private.fantasy_gameweek_close%rowtype;d jsonb;v bigint;pending boolean;
begin
 if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden';end if;
 if p_gameweek_id is null or p_expected_lock_version is null or p_expected_lock_version<1 then
   raise exception using errcode='PT400',message='validation_failed';end if;
 select *into g from app.fantasy_gameweeks where id=p_gameweek_id for update;
 if not found then raise exception using errcode='PT404',message='fantasy_gameweek_not_found';end if;
 select *into s from app.fantasy_seasons where id=g.fantasy_season_id;
 if s.status not in('registration_open','active') or g.status<>'provisional' or g.deadline_at>statement_timestamp()
   or not exists(select 1 from app_private.fantasy_api_rating_seasons p
     where p.season_id=s.id and g.sequence_number>=p.from_gameweek) then
   raise exception using errcode='PT409',message='fantasy_selection_close_not_allowed';end if;
 if g.closed_at is not null then
   select *into c from app_private.fantasy_gameweek_close where gameweek_id=g.id;
   if not found or c.calculation_version is distinct from g.closed_calculation_version then
     raise exception using errcode='PT409',message='fantasy_close_receipt_missing';end if;
   return jsonb_build_object('closed',true,'closeVersion',c.calculation_version,
     'ratingsPending',app_private.fantasy_selection_ratings_pending(g.id),'stableResult',true);
 end if;
 if g.lock_version<>p_expected_lock_version then
   raise exception using errcode='PT409',message='stale_update';end if;
 -- Serialize the genuine match-end facts and frozen assignment checks with ingestion.
 perform a.id from app.fantasy_fixture_assignments a join app.fixtures f on f.id=a.fixture_id
 where a.gameweek_id=g.id and a.superseded_at is null order by f.id,a.id for share of a,f;
 if not exists(select 1 from app.fantasy_fixture_assignments where gameweek_id=g.id
     and superseded_at is null and counts_points)
   or exists(select 1 from app.fantasy_fixture_assignments a join app.fixtures f on f.id=a.fixture_id
     where a.gameweek_id=g.id and a.superseded_at is null and(
       not a.counts_points or a.frozen_at is null or a.fantasy_season_id<>s.id
       or a.assignment_status not in('assigned','confirmed','reassigned')
       or f.season_id<>s.football_season_id or f.kickoff_at is distinct from a.assigned_kickoff_at
       or not app_private.fantasy_kickoff_confirmed(f.kickoff_at)
       or f.status<>'finished' or f.finalized_at is null or f.finalized_at>statement_timestamp()
       or f.kickoff_at>statement_timestamp() or f.finalized_at<f.kickoff_at
       or f.home_score is null or f.away_score is null))then
   raise exception using errcode='PT409',message='fantasy_selection_matches_unfinished';end if;
 if exists(select 1 from app.fantasy_lineups where gameweek_id=g.id and locked_at is null)
   or exists(select 1 from app.fantasy_teams t where t.fantasy_season_id=s.id and t.status='active'
     and t.current_gameweek_id=g.id and not exists(select 1 from app.fantasy_lineups l
       where l.fantasy_team_id=t.id and l.gameweek_id=g.id and l.locked_at is not null))then
   raise exception using errcode='PT409',message='fantasy_selection_lineups_unlocked';end if;
 d:=app_private.fantasy_scoring_input_document(g.id);
 if d->>'apiNativeRatings' is distinct from 'true' or d->>'scoringVersion' is distinct from '3' then
   raise exception using errcode='PT409',message='fantasy_selection_native_document_required';end if;
 pending:=app_private.fantasy_selection_ratings_pending(g.id);
 -- This is a carry-over version, not a synthesized scoring calculation.
 -- In particular, no scoring_input_version, score, snapshot or rating is written.
 v:=greatest(g.scoring_input_version,1);
 insert into app_private.fantasy_gameweek_close(gameweek_id,calculation_version,input_digest,
   price_source_version,price_player_ids,close_kind)
 values(g.id,v,encode(extensions.digest(d::text,'sha256'),'hex'),g.sequence_number::bigint+1,
   (select coalesce(array_agg(id order by id),'{}'::uuid[])from app.fantasy_players where fantasy_season_id=s.id),
   'selection_only');
 update app.fantasy_gameweeks set closed_at=statement_timestamp(),closed_calculation_version=v,
   lock_version=lock_version+1 where id=g.id;
 return jsonb_build_object('closed',true,'closeVersion',v,'ratingsPending',pending,'stableResult',false);
end $$;
revoke all on function api.service_begin_fantasy_selection_close(uuid,bigint) from public,anon,authenticated;
grant execute on function api.service_begin_fantasy_selection_close(uuid,bigint) to service_role;

create or replace function api.service_fantasy_lifecycle_state(p_gameweek_id uuid)
returns jsonb language sql security definer set search_path='' as $$
 select app_private.fantasy_lifecycle_state_before_api_ratings(p_gameweek_id)
 ||case when exists(select 1 from app.fantasy_gameweeks g join app_private.fantasy_api_rating_seasons p
   on p.season_id=g.fantasy_season_id where g.id=p_gameweek_id and g.sequence_number>=p.from_gameweek)
 then jsonb_build_object('adaptiveScoringEnabled',false,'apiNativeRatings',true,
   'selectionCloseEnabled',true,'selectionRatingsPending',case when exists(select 1 from app.fantasy_gameweeks
     where id=p_gameweek_id and status='provisional')then app_private.fantasy_selection_ratings_pending(p_gameweek_id)else false end)
 else '{}'::jsonb end;
$$;

-- A successor may open inside its last 24 hours. Do not consume its reminder
-- deduplication key while it is still scheduled and cannot accept selections.
do $patch$ declare original text;changed text;
begin
 original:=pg_get_functiondef('app_private.notification_email_plan(timestamptz)'::regprocedure);
 changed:=replace(original,$old$      and gameweek.status in ('scheduled', 'open')$old$,
 $new$      and gameweek.status in ('scheduled', 'open')
      and (not app_private.notification_manager_emails_enabled() or gameweek.status='open')$new$);
 if changed=original then raise exception 'selection_close_reminder_patch_mismatch';end if;
 execute changed;
end $patch$;
$selection_source$]);
do $verify$begin
 if md5((select prosrc from pg_proc where oid='app_private.fantasy_selection_ratings_pending(uuid)'::regprocedure))is distinct from '2e1f79db1a709a0a16c511086416e39e'then raise exception 'selection_release_new_function_mismatch:app_private.fantasy_selection_ratings_pending';end if;
 if md5((select prosrc from pg_proc where oid='app_private.fantasy_rating_display_document(uuid)'::regprocedure))is distinct from '4777ea9ccf0c436e7561c60398b56e31'then raise exception 'selection_release_new_function_mismatch:app_private.fantasy_rating_display_document';end if;
 if md5((select prosrc from pg_proc where oid='api.service_begin_fantasy_selection_close(uuid,bigint)'::regprocedure))is distinct from 'a8ff68656a09cf6a52c30197f42c6cc8'then raise exception 'selection_release_new_function_mismatch:api.service_begin_fantasy_selection_close';end if;
 if md5((select prosrc from pg_proc where oid='api.service_fantasy_lifecycle_state(uuid)'::regprocedure))is distinct from '8e9a265974f70ad129c7019a63bccd2b'then raise exception 'selection_release_new_function_mismatch:api.service_fantasy_lifecycle_state';end if;
 if md5((select prosrc from pg_proc where oid='app_private.notification_email_plan(timestamptz)'::regprocedure))<>'32a1b9efafe7ea0308390e2bb6de3e5f'then raise exception 'selection_release_new_planner_mismatch';end if;
 if exists(select 1 from protected_selection_release b full join(select 'app.fixtures' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fixtures t
union all select 'app.rounds' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.rounds t
union all select 'app.seasons' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.seasons t
union all select 'app.fantasy_gameweeks' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_gameweeks t
union all select 'app.fantasy_fixture_assignments' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_fixture_assignments t
union all select 'app.fantasy_players' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_players t
union all select 'app.fantasy_teams' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_teams t
union all select 'app.fantasy_squad_memberships' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_squad_memberships t
union all select 'app.fantasy_lineups' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_lineups t
union all select 'app.fantasy_lineup_players' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_lineup_players t
union all select 'app.fantasy_transfer_batches' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_transfer_batches t
union all select 'app.fantasy_transfers' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_transfers t
union all select 'app.fantasy_player_point_events' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_player_point_events t
union all select 'app.fantasy_player_gameweek_points' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_player_gameweek_points t
union all select 'app.fantasy_team_gameweek_results' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_team_gameweek_results t
union all select 'app_private.fantasy_scoring_snapshots' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_scoring_snapshots t
union all select 'app_private.fantasy_rating_publications' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_rating_publications t
union all select 'app_private.fantasy_published_rating_players' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_published_rating_players t
union all select 'app_private.fantasy_rating_recovery_plans' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_rating_recovery_plans t
union all select 'app_private.fantasy_api_rating_sources' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_api_rating_sources t
union all select 'app_private.fantasy_api_rating_polls' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_api_rating_polls t
union all select 'app_private.fantasy_not_rated_settlements' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_not_rated_settlements t
union all select 'app_private.fantasy_rating_checks' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_rating_checks t
union all select 'app_private.fantasy_legacy_identity_repairs' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_legacy_identity_repairs t
union all select 'app_private.football_provider_mappings' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.football_provider_mappings t
union all select 'app_private.sofascore_player_aliases' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.sofascore_player_aliases t
union all select 'app_private.notification_events' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.notification_events t
union all select 'app.notifications' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.notifications t
union all select 'app.notification_deliveries' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.notification_deliveries t
union all select 'app_private.fantasy_free_transfer_rollovers' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_free_transfer_rollovers t
union all select 'app_private.fantasy_gameweek_progressions' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_gameweek_progressions t
union all select 'app_private.fantasy_gameweek_postwork' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_gameweek_postwork t
union all select 'app_private.fantasy_gameweek_close' name,count(*)n,md5(coalesce(string_agg(((to_jsonb(t)-'close_kind'))::text,E'\n' order by ((to_jsonb(t)-'close_kind'))::text),''))digest from app_private.fantasy_gameweek_close t
union all select 'app.fantasy_free_hit_snapshots' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_free_hit_snapshots t
union all select 'app.fantasy_free_hit_snapshot_players' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_free_hit_snapshot_players t
union all select 'app_private.fantasy_free_hit_lineup_snapshots' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_free_hit_lineup_snapshots t
union all select 'app.fantasy_player_price_history' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_player_price_history t
union all select 'app.fantasy_prize_winners' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app.fantasy_prize_winners t
union all select 'app_private.fantasy_api_rating_seasons' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_api_rating_seasons t
union all select 'app_private.fantasy_not_rated_policy' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_not_rated_policy t
union all select 'app_private.fantasy_staged_stats_policy' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_staged_stats_policy t
union all select 'app_private.fantasy_rating_policy' name,count(*)n,md5(coalesce(string_agg((to_jsonb(t))::text,E'\n' order by (to_jsonb(t))::text),''))digest from app_private.fantasy_rating_policy t
union all select 'scoring_and_economic_guards',count(*),md5(string_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),p.prosrc,p.prosecdef,p.proconfig,p.proacl)::text,E'\n'order by p.oid))from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('api','app_private')and p.proname in('service_begin_fantasy_close','service_begin_fantasy_finalization','service_complete_fantasy_gameweek','service_persist_fantasy_scoring_results','fantasy_validate_scoring_document','fantasy_api_rating_document','fantasy_actual_ratings_pending','fantasy_email_payload','service_prepare_next_fantasy_gameweek','service_run_fantasy_close_price_batch','service_restore_free_hit','service_roll_fantasy_free_transfers','service_apply_fantasy_price_changes','service_adopt_fantasy_close_prices'))a using(name)where a.n is distinct from b.n or a.digest is distinct from b.digest)then raise exception 'selection_release_protected_data_changed';end if;
 if exists(select 1 from app_private.fantasy_gameweek_close where close_kind<>'scoring_complete')
 or has_function_privilege('anon','api.service_begin_fantasy_selection_close(uuid,bigint)','execute')
 or has_function_privilege('authenticated','api.service_begin_fantasy_selection_close(uuid,bigint)','execute')
 or not has_function_privilege('service_role','api.service_begin_fantasy_selection_close(uuid,bigint)','execute')then
 raise exception 'selection_release_receipt_or_permissions_invalid';end if;
 if(select encode(extensions.digest(statements[1],'sha256'),'hex')from supabase_migrations.schema_migrations where version='20261020103533')is distinct from 'f873e94a16948b32937791cc66325785bc05c96a2d123c772ee6ed0a1cd454ee'then raise exception 'selection_release_history_mismatch';end if;
 if current_setting('bg.selection_release_mode')='rehearsal'then raise exception 'SELECTION_RELEASE_REHEARSAL_PASSED: exact migration/history/functions, all 43 protected sets and scoring safeguards unchanged; rolled back';end if;
 if current_setting('bg.selection_release_mode')<>'apply'then raise exception 'selection_release_mode_invalid';end if;
end $verify$;
commit;
select version,name,encode(extensions.digest(statements[1],'sha256'),'hex')source_sha256 from supabase_migrations.schema_migrations where version='20261020103533';
