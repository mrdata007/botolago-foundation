-- Owner-run exact-source promotion. Read AGENTS.md; pause/drain writers first.
-- Default real rehearsal ends with a deliberate rollback. Verify rollback in a
-- separate read, then change only bg.native_email_schema_mode to apply.
-- This applies no scoring/data policy and never requeues/sends a notification.
begin;set local lock_timeout='5s';set local statement_timeout='60s';
select set_config('bg.native_email_schema_mode','rehearsal',true);select app_private.hold_scheduled_jobs();
do $guard$begin
 if exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled or lifecycle_worker_enabled)
 or exists(select 1 from app_private.notification_email_settings where mode<>'off'or football_live_refresh_enabled)
 or exists(select 1 from app_private.fantasy_worker_lease where released_at is null and expires_at>statement_timestamp())or exists(select 1 from net.http_request_queue)
 or exists(select 1 from supabase_migrations.schema_migrations where version='20261020091926')then raise exception 'native_email_schema_baseline_changed';end if;
end $guard$;
-- Native scoring deliberately disables the old category/rating policy. Final
-- manager emails authorize the current native seal, not that obsolete switch.
-- Preserve every recipient, consent, version, selected-player and dedup guard.
do $patch$
declare source text;old_gate text:=$old$  if not exists(select 1 from app_private.fantasy_api_rating_seasons s where s.season_id=g.fantasy_season_id and g.sequence_number>=s.from_gameweek)
   or not exists(select 1 from app_private.fantasy_rating_policy p where p.season_id=g.fantasy_season_id and p.enabled and g.sequence_number>=p.from_gameweek)then return null;end if;$old$;
new_gate text:=$new$  if not exists(select 1 from app_private.fantasy_api_rating_seasons s where s.season_id=g.fantasy_season_id and g.sequence_number>=s.from_gameweek)
   or not exists(select 1 from app_private.fantasy_scoring_snapshots s
    where s.gameweek_id=g.id and s.calculation_version=g.scoring_input_version
    and s.sealed_at is not null and s.players_persisted
    and s.payload->>'apiNativeRatings'='true'and s.payload->>'ratingScoring'='true'
    and s.payload->>'scoringVersion'='3'and s.payload#>>'{ruleset,version}'='3'
    and case when jsonb_typeof(s.payload->'pendingFixtures')='array'then jsonb_array_length(s.payload->'pendingFixtures')end=0
    and case when jsonb_typeof(s.payload->'pendingPlayerIds')='array'then jsonb_array_length(s.payload->'pendingPlayerIds')end=0
    and not app_private.fantasy_actual_ratings_pending(s.payload))then return null;end if;$new$;
begin
 if md5((select prosrc from pg_proc where oid='app_private.fantasy_email_payload(app_private.notification_events,uuid,timestamptz)'::regprocedure))<>'78046004541638577c66200720ed430f'then raise exception 'native_final_email_baseline_changed';end if;
 source:=pg_get_functiondef('app_private.fantasy_email_payload(app_private.notification_events,uuid,timestamptz)'::regprocedure);
 if position(old_gate in source)=0 then raise exception 'native_final_email_gate_anchor_missing';end if;
 execute replace(source,old_gate,new_gate);
end $patch$;

insert into supabase_migrations.schema_migrations(version,name,statements)values('20261020091926','fantasy_native_final_email_gate',array['-- Native scoring deliberately disables the old category/rating policy. Final
-- manager emails authorize the current native seal, not that obsolete switch.
-- Preserve every recipient, consent, version, selected-player and dedup guard.
do $patch$
declare source text;old_gate text:=$old$  if not exists(select 1 from app_private.fantasy_api_rating_seasons s where s.season_id=g.fantasy_season_id and g.sequence_number>=s.from_gameweek)
   or not exists(select 1 from app_private.fantasy_rating_policy p where p.season_id=g.fantasy_season_id and p.enabled and g.sequence_number>=p.from_gameweek)then return null;end if;$old$;
new_gate text:=$new$  if not exists(select 1 from app_private.fantasy_api_rating_seasons s where s.season_id=g.fantasy_season_id and g.sequence_number>=s.from_gameweek)
   or not exists(select 1 from app_private.fantasy_scoring_snapshots s
    where s.gameweek_id=g.id and s.calculation_version=g.scoring_input_version
    and s.sealed_at is not null and s.players_persisted
    and s.payload->>''apiNativeRatings''=''true''and s.payload->>''ratingScoring''=''true''
    and s.payload->>''scoringVersion''=''3''and s.payload#>>''{ruleset,version}''=''3''
    and case when jsonb_typeof(s.payload->''pendingFixtures'')=''array''then jsonb_array_length(s.payload->''pendingFixtures'')end=0
    and case when jsonb_typeof(s.payload->''pendingPlayerIds'')=''array''then jsonb_array_length(s.payload->''pendingPlayerIds'')end=0
    and not app_private.fantasy_actual_ratings_pending(s.payload))then return null;end if;$new$;
begin
 if md5((select prosrc from pg_proc where oid=''app_private.fantasy_email_payload(app_private.notification_events,uuid,timestamptz)''::regprocedure))<>''78046004541638577c66200720ed430f''then raise exception ''native_final_email_baseline_changed'';end if;
 source:=pg_get_functiondef(''app_private.fantasy_email_payload(app_private.notification_events,uuid,timestamptz)''::regprocedure);
 if position(old_gate in source)=0 then raise exception ''native_final_email_gate_anchor_missing'';end if;
 execute replace(source,old_gate,new_gate);
end $patch$;
']);
do $verify$begin
 if md5((select prosrc from pg_proc where oid='app_private.fantasy_email_payload(app_private.notification_events,uuid,timestamptz)'::regprocedure))<>'ab89b10793af5674adb90ccb9e961d4a'then raise exception 'native_email_schema_result_mismatch';end if;
 if current_setting('bg.native_email_schema_mode')='rehearsal'then raise exception 'NATIVE_EMAIL_SCHEMA_REHEARSAL_PASSED: exact function and migration history; rolled back';end if;
 if current_setting('bg.native_email_schema_mode')<>'apply'then raise exception 'native_email_schema_mode_invalid';end if;
end $verify$;commit;
select md5(prosrc)function_md5 from pg_proc where oid='app_private.fantasy_email_payload(app_private.notification_events,uuid,timestamptz)'::regprocedure;
