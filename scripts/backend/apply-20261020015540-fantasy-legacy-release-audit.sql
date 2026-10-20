-- Forward-only audit hardening; exact source SHA256 c6661a418ae9cd4a54b89dc5f25b6ddb077f3b1e72cc31cfccbeb990250ff249.
begin;
set local lock_timeout='5s';set local statement_timeout='90s';
select set_config('bg.legacy_release_audit_mode','rehearsal',true);
select app_private.hold_scheduled_jobs();
do $$begin
 if exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled or lifecycle_worker_enabled)
 or exists(select 1 from app_private.notification_email_settings where football_live_refresh_enabled or mode<>'off')
 or exists(select 1 from app_private.fantasy_worker_lease where released_at is null and expires_at>statement_timestamp())
 or exists(select 1 from net.http_request_queue)then raise exception 'legacy_identity_writers_not_drained';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20261019194059'and encode(extensions.digest(statements[1],'sha256'),'hex')='77b5d042cee91705691423a6c869baad95ed4389cb5c9fd06c5ad8837172cea5')then raise exception 'legacy_identity_controls_missing';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='20261020015540')then raise exception 'legacy_release_audit_already_applied';end if;
end $$;
create temporary table release_audit_before on commit drop as select md5(coalesce(string_agg(md5(t::text),''order by fantasy_player_id),''))digest from app_private.fantasy_legacy_identity_repairs t;
insert into supabase_migrations.schema_migrations(version,name,statements)values('20261020015540','fantasy_legacy_hold_release_audit_pairing',array[$legacy_release_audit$-- Forward-only: the base controls are already applied in staging. SQL CHECK
-- accepts NULL, so the original date/length condition also needs null pairing.
alter table app_private.fantasy_legacy_identity_repairs
 add constraint legacy_identity_release_audit_pairing
 check((released_at is null)=(release_reason is null));
$legacy_release_audit$]);
do $$declare source text;begin
 select statements[1]into source from supabase_migrations.schema_migrations where version='20261020015540';
 if encode(extensions.digest(source,'sha256'),'hex')<>'c6661a418ae9cd4a54b89dc5f25b6ddb077f3b1e72cc31cfccbeb990250ff249'then raise exception 'legacy_release_audit_source_changed';end if;
 execute source;
 if(select digest from release_audit_before)is distinct from(select md5(coalesce(string_agg(md5(t::text),''order by fantasy_player_id),''))from app_private.fantasy_legacy_identity_repairs t)then raise exception 'legacy_release_audit_changed_evidence';end if;
 if not exists(select 1 from pg_constraint where conrelid='app_private.fantasy_legacy_identity_repairs'::regclass and conname='legacy_identity_release_audit_pairing'and convalidated)then raise exception 'legacy_release_audit_constraint_missing';end if;
 if current_setting('bg.legacy_release_audit_mode')='rehearsal'then raise exception 'LEGACY_RELEASE_AUDIT_REHEARSAL_PASSED: evidence preserved; all changes rolled back';end if;
 if current_setting('bg.legacy_release_audit_mode')<>'apply'then raise exception 'legacy_release_audit_mode_invalid';end if;
end $$;
commit;
select version,name from supabase_migrations.schema_migrations where version='20261020015540';
