-- Forward correction; first selection-close migration is immutable on staging.
-- Exact source SHA256: afa1e73aa814468ac62fbd6b91c5b0c5eba499b815899726b6e625fac1b80070
begin;set local lock_timeout='5s';set local statement_timeout='90s';set local work_mem='16MB';
select set_config('bg.actionable_reminder_mode','rehearsal',true);
select app_private.hold_scheduled_jobs();
do $$begin
 if exists(select 1 from app_private.notification_email_settings where mode<>'off'or football_live_refresh_enabled)
 or exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled or lifecycle_worker_enabled)
 or exists(select 1 from cron.job where jobname='notification-push-tick'and active)
 or exists(select 1 from app_private.rivals_settings where enabled)
 or exists(select 1 from app_private.pepites_settings where mode<>'off')
 or exists(select 1 from app_private.fantasy_worker_lease where released_at is null and expires_at>statement_timestamp())
 or exists(select 1 from net.http_request_queue)then raise exception 'actionable_reminder_writers_not_drained';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20261020103533'and encode(extensions.digest(statements[1],'sha256'),'hex')='f873e94a16948b32937791cc66325785bc05c96a2d123c772ee6ed0a1cd454ee')
 or exists(select 1 from supabase_migrations.schema_migrations where version='20261020114031')
 or md5((select prosrc from pg_proc where oid='app_private.notification_email_plan(timestamptz)'::regprocedure))<>'32a1b9efafe7ea0308390e2bb6de3e5f'
 then raise exception 'actionable_reminder_baseline_changed';end if;
end $$;
create temporary table actionable_protected on commit drop as select 'app.fixtures' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fixtures t
union all select 'app.rounds' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.rounds t
union all select 'app.seasons' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.seasons t
union all select 'app.fantasy_gameweeks' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_gameweeks t
union all select 'app.fantasy_fixture_assignments' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_fixture_assignments t
union all select 'app.fantasy_players' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_players t
union all select 'app.fantasy_teams' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_teams t
union all select 'app.fantasy_squad_memberships' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_squad_memberships t
union all select 'app.fantasy_lineups' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_lineups t
union all select 'app.fantasy_lineup_players' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by lineup_id,fantasy_player_id),''))digest from app.fantasy_lineup_players t
union all select 'app.fantasy_transfer_batches' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_transfer_batches t
union all select 'app.fantasy_transfers' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_transfers t
union all select 'app.fantasy_player_point_events' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_player_point_events t
union all select 'app.fantasy_player_gameweek_points' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by gameweek_id,fantasy_player_id),''))digest from app.fantasy_player_gameweek_points t
union all select 'app.fantasy_team_gameweek_results' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_team_gameweek_results t
union all select 'app_private.fantasy_scoring_snapshots' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by gameweek_id,calculation_version),''))digest from app_private.fantasy_scoring_snapshots t
union all select 'app_private.fantasy_rating_publications' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app_private.fantasy_rating_publications t
union all select 'app_private.fantasy_published_rating_players' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by publication_id,fantasy_player_id),''))digest from app_private.fantasy_published_rating_players t
union all select 'app_private.fantasy_rating_recovery_plans' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app_private.fantasy_rating_recovery_plans t
union all select 'app_private.fantasy_api_rating_sources' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app_private.fantasy_api_rating_sources t
union all select 'app_private.fantasy_api_rating_polls' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by fixture_id),''))digest from app_private.fantasy_api_rating_polls t
union all select 'app_private.fantasy_not_rated_settlements' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by source_id,api_player_id),''))digest from app_private.fantasy_not_rated_settlements t
union all select 'app_private.fantasy_rating_checks' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app_private.fantasy_rating_checks t
union all select 'app_private.fantasy_legacy_identity_repairs' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by fantasy_player_id),''))digest from app_private.fantasy_legacy_identity_repairs t
union all select 'app_private.football_provider_mappings' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app_private.football_provider_mappings t
union all select 'app_private.sofascore_player_aliases' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app_private.sofascore_player_aliases t
union all select 'app_private.notification_events' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app_private.notification_events t
union all select 'app.notifications' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.notifications t
union all select 'app.notification_deliveries' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.notification_deliveries t
union all select 'app_private.fantasy_free_transfer_rollovers' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by gameweek_id,fantasy_team_id),''))digest from app_private.fantasy_free_transfer_rollovers t
union all select 'app_private.fantasy_gameweek_progressions' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by previous_gameweek_id),''))digest from app_private.fantasy_gameweek_progressions t
union all select 'app_private.fantasy_gameweek_postwork' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by gameweek_id,calculation_version),''))digest from app_private.fantasy_gameweek_postwork t
union all select 'app_private.fantasy_gameweek_close' name,count(*)n,md5(coalesce(string_agg(md5((to_jsonb(t)-'close_kind')::text),'' order by gameweek_id),''))digest from app_private.fantasy_gameweek_close t
union all select 'app.fantasy_free_hit_snapshots' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_free_hit_snapshots t
union all select 'app.fantasy_free_hit_snapshot_players' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by snapshot_id,fantasy_player_id),''))digest from app.fantasy_free_hit_snapshot_players t
union all select 'app_private.fantasy_free_hit_lineup_snapshots' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by snapshot_id),''))digest from app_private.fantasy_free_hit_lineup_snapshots t
union all select 'app.fantasy_player_price_history' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_player_price_history t
union all select 'app.fantasy_prize_winners' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_prize_winners t
union all select 'app_private.fantasy_api_rating_seasons' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by season_id),''))digest from app_private.fantasy_api_rating_seasons t
union all select 'app_private.fantasy_not_rated_policy' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app_private.fantasy_not_rated_policy t
union all select 'app_private.fantasy_staged_stats_policy' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by season_id),''))digest from app_private.fantasy_staged_stats_policy t
union all select 'app_private.fantasy_rating_policy' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by season_id),''))digest from app_private.fantasy_rating_policy t
union all select 'scoring_and_economic_guards',count(*),md5(string_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),p.prosrc,p.prosecdef,p.proconfig,p.proacl)::text,E'\n'order by p.oid))from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('api','app_private')and p.proname in('service_begin_fantasy_close','service_begin_fantasy_finalization','service_complete_fantasy_gameweek','service_persist_fantasy_scoring_results','fantasy_validate_scoring_document','fantasy_api_rating_document','fantasy_actual_ratings_pending','fantasy_email_payload','service_prepare_next_fantasy_gameweek','service_run_fantasy_close_price_batch','service_restore_free_hit','service_roll_fantasy_free_transfers','service_apply_fantasy_price_changes','service_adopt_fantasy_close_prices');
-- Forward correction: a scheduled selection window cannot accept action,
-- regardless of the manager-email switch. Preserve its dedup key until open.
do $patch$ declare original text;changed text;
begin
 original:=pg_get_functiondef('app_private.notification_email_plan(timestamptz)'::regprocedure);
 changed:=replace(original,$old$      and gameweek.status in ('scheduled', 'open')
      and (not app_private.notification_manager_emails_enabled() or gameweek.status='open')$old$,
 $new$      and gameweek.status='open'$new$);
 if changed=original then raise exception 'actionable_deadline_planner_patch_mismatch';end if;
 execute changed;
end $patch$;

insert into supabase_migrations.schema_migrations(version,name,statements)values('20261020114031','fantasy_actionable_deadline_reminders',array[$reminder_source$-- Forward correction: a scheduled selection window cannot accept action,
-- regardless of the manager-email switch. Preserve its dedup key until open.
do $patch$ declare original text;changed text;
begin
 original:=pg_get_functiondef('app_private.notification_email_plan(timestamptz)'::regprocedure);
 changed:=replace(original,$old$      and gameweek.status in ('scheduled', 'open')
      and (not app_private.notification_manager_emails_enabled() or gameweek.status='open')$old$,
 $new$      and gameweek.status='open'$new$);
 if changed=original then raise exception 'actionable_deadline_planner_patch_mismatch';end if;
 execute changed;
end $patch$;
$reminder_source$]);
do $$begin
 if md5((select prosrc from pg_proc where oid='app_private.notification_email_plan(timestamptz)'::regprocedure))<>'7d537202e655b1a217c707a154abc614'
 or(select encode(extensions.digest(statements[1],'sha256'),'hex')from supabase_migrations.schema_migrations where version='20261020114031')is distinct from 'afa1e73aa814468ac62fbd6b91c5b0c5eba499b815899726b6e625fac1b80070'
 then raise exception 'actionable_reminder_source_or_function_mismatch';end if;
 if exists(select 1 from actionable_protected b full join(select 'app.fixtures' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fixtures t
union all select 'app.rounds' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.rounds t
union all select 'app.seasons' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.seasons t
union all select 'app.fantasy_gameweeks' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_gameweeks t
union all select 'app.fantasy_fixture_assignments' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_fixture_assignments t
union all select 'app.fantasy_players' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_players t
union all select 'app.fantasy_teams' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_teams t
union all select 'app.fantasy_squad_memberships' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_squad_memberships t
union all select 'app.fantasy_lineups' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_lineups t
union all select 'app.fantasy_lineup_players' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by lineup_id,fantasy_player_id),''))digest from app.fantasy_lineup_players t
union all select 'app.fantasy_transfer_batches' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_transfer_batches t
union all select 'app.fantasy_transfers' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_transfers t
union all select 'app.fantasy_player_point_events' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_player_point_events t
union all select 'app.fantasy_player_gameweek_points' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by gameweek_id,fantasy_player_id),''))digest from app.fantasy_player_gameweek_points t
union all select 'app.fantasy_team_gameweek_results' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_team_gameweek_results t
union all select 'app_private.fantasy_scoring_snapshots' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by gameweek_id,calculation_version),''))digest from app_private.fantasy_scoring_snapshots t
union all select 'app_private.fantasy_rating_publications' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app_private.fantasy_rating_publications t
union all select 'app_private.fantasy_published_rating_players' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by publication_id,fantasy_player_id),''))digest from app_private.fantasy_published_rating_players t
union all select 'app_private.fantasy_rating_recovery_plans' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app_private.fantasy_rating_recovery_plans t
union all select 'app_private.fantasy_api_rating_sources' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app_private.fantasy_api_rating_sources t
union all select 'app_private.fantasy_api_rating_polls' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by fixture_id),''))digest from app_private.fantasy_api_rating_polls t
union all select 'app_private.fantasy_not_rated_settlements' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by source_id,api_player_id),''))digest from app_private.fantasy_not_rated_settlements t
union all select 'app_private.fantasy_rating_checks' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app_private.fantasy_rating_checks t
union all select 'app_private.fantasy_legacy_identity_repairs' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by fantasy_player_id),''))digest from app_private.fantasy_legacy_identity_repairs t
union all select 'app_private.football_provider_mappings' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app_private.football_provider_mappings t
union all select 'app_private.sofascore_player_aliases' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app_private.sofascore_player_aliases t
union all select 'app_private.notification_events' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app_private.notification_events t
union all select 'app.notifications' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.notifications t
union all select 'app.notification_deliveries' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.notification_deliveries t
union all select 'app_private.fantasy_free_transfer_rollovers' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by gameweek_id,fantasy_team_id),''))digest from app_private.fantasy_free_transfer_rollovers t
union all select 'app_private.fantasy_gameweek_progressions' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by previous_gameweek_id),''))digest from app_private.fantasy_gameweek_progressions t
union all select 'app_private.fantasy_gameweek_postwork' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by gameweek_id,calculation_version),''))digest from app_private.fantasy_gameweek_postwork t
union all select 'app_private.fantasy_gameweek_close' name,count(*)n,md5(coalesce(string_agg(md5((to_jsonb(t)-'close_kind')::text),'' order by gameweek_id),''))digest from app_private.fantasy_gameweek_close t
union all select 'app.fantasy_free_hit_snapshots' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_free_hit_snapshots t
union all select 'app.fantasy_free_hit_snapshot_players' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by snapshot_id,fantasy_player_id),''))digest from app.fantasy_free_hit_snapshot_players t
union all select 'app_private.fantasy_free_hit_lineup_snapshots' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by snapshot_id),''))digest from app_private.fantasy_free_hit_lineup_snapshots t
union all select 'app.fantasy_player_price_history' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_player_price_history t
union all select 'app.fantasy_prize_winners' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app.fantasy_prize_winners t
union all select 'app_private.fantasy_api_rating_seasons' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by season_id),''))digest from app_private.fantasy_api_rating_seasons t
union all select 'app_private.fantasy_not_rated_policy' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by id),''))digest from app_private.fantasy_not_rated_policy t
union all select 'app_private.fantasy_staged_stats_policy' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by season_id),''))digest from app_private.fantasy_staged_stats_policy t
union all select 'app_private.fantasy_rating_policy' name,count(*)n,md5(coalesce(string_agg(md5(t::text),'' order by season_id),''))digest from app_private.fantasy_rating_policy t
union all select 'scoring_and_economic_guards',count(*),md5(string_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),p.prosrc,p.prosecdef,p.proconfig,p.proacl)::text,E'\n'order by p.oid))from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('api','app_private')and p.proname in('service_begin_fantasy_close','service_begin_fantasy_finalization','service_complete_fantasy_gameweek','service_persist_fantasy_scoring_results','fantasy_validate_scoring_document','fantasy_api_rating_document','fantasy_actual_ratings_pending','fantasy_email_payload','service_prepare_next_fantasy_gameweek','service_run_fantasy_close_price_batch','service_restore_free_hit','service_roll_fantasy_free_transfers','service_apply_fantasy_price_changes','service_adopt_fantasy_close_prices'))a using(name)where a.n is distinct from b.n or a.digest is distinct from b.digest)then raise exception 'actionable_reminder_protected_data_changed';end if;
 if current_setting('bg.actionable_reminder_mode')='rehearsal'then raise exception 'ACTIONABLE_REMINDER_REHEARSAL_PASSED: mode-independent actionable window, exact history/function, all 43 protected sets unchanged; rolled back';end if;
 if current_setting('bg.actionable_reminder_mode')<>'apply'then raise exception 'actionable_reminder_mode_invalid';end if;
end $$;commit;
select version,name,encode(extensions.digest(statements[1],'sha256'),'hex')source_sha256 from supabase_migrations.schema_migrations where version='20261020114031';
