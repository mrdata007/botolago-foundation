-- READ ONLY. Run independently before installation, after rehearsal rollback,
-- and after real commit. While writers are paused, data_state must be identical.
-- Rollback: migration_recorded=false, body_md5=4a38b43093a540caf127f4348311a772.
-- Commit: migration_recorded=true, body_md5=2ab3a3d0095400a423691162cfbb07c2.
select jsonb_build_object(
  'migration_recorded',exists(select 1 from supabase_migrations.schema_migrations where version='20261012174642'),
  'body_md5',(select md5(prosrc) from pg_proc where oid='api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure),
  'service_can_execute',has_function_privilege('service_role','api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)','execute'),
  'anon_can_execute',has_function_privilege('anon','api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)','execute'),
  'browser_can_execute',has_function_privilege('authenticated','api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)','execute'),
  'data_state',(select state from (select jsonb_build_object(
  'gameweeks',(select jsonb_build_array(count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by id),''))) from app.fantasy_gameweeks t),
  'events',(select jsonb_build_array(count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by id),''))) from app.fantasy_player_point_events t),
  'points',(select jsonb_build_array(count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by fantasy_player_id,gameweek_id),''))) from app.fantasy_player_gameweek_points t),
  'teams',(select jsonb_build_array(count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by fantasy_team_id,gameweek_id),''))) from app.fantasy_team_gameweek_results t),
  'snapshots',(select jsonb_build_array(count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by gameweek_id,calculation_version),''))) from app_private.fantasy_scoring_snapshots t),
  'substitutions',(select jsonb_build_array(count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by lineup_id,sequence_number),''))) from app.fantasy_auto_substitutions t)
) as state) s)
) as scoring_save_readback;
