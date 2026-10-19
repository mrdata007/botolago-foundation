-- Staging first, then authorized production. Canonical migration 20261019194059, SHA256 77b5d042cee91705691423a6c869baad95ed4389cb5c9fd06c5ad8837172cea5.
-- Rehearse, independently verify rollback, then change only mode to apply. No identity repair is performed here.
begin;
set local lock_timeout='5s';set local statement_timeout='90s';
select set_config('bg.legacy_identity_schema_mode','rehearsal',true);
select app_private.hold_scheduled_jobs();
do $$begin
 if exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled or lifecycle_worker_enabled)
 or exists(select 1 from app_private.notification_email_settings where football_live_refresh_enabled or mode<>'off')
 or exists(select 1 from app_private.fantasy_worker_lease where released_at is null and expires_at>statement_timestamp())
 or exists(select 1 from net.http_request_queue)then raise exception 'legacy_identity_writers_not_drained';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='20261019194059')or to_regclass('app_private.fantasy_legacy_identity_repairs')is not null then raise exception 'legacy_identity_schema_already_applied';end if;
end $$;
create temporary table legacy_before on commit drop as select 'players' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.players t
union all select 'catalog' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.fantasy_players t
union all select 'teams' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.fantasy_teams t
union all select 'squads' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.fantasy_squad_memberships t
union all select 'lineups' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.fantasy_lineups t
union all select 'lineup_players' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by lineup_id,fantasy_player_id),''))digest from app.fantasy_lineup_players t
union all select 'transfers' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.fantasy_transfer_batches t
union all select 'results' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.fantasy_team_gameweek_results t
union all select 'points' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by gameweek_id,fantasy_player_id),''))digest from app.fantasy_player_gameweek_points t
union all select 'seals' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by gameweek_id,calculation_version),''))digest from app_private.fantasy_scoring_snapshots t
union all select 'aliases' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app_private.sofascore_player_aliases t
union all select 'publications' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app_private.fantasy_rating_publications t
union all select 'sources' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app_private.fantasy_api_rating_sources t;
insert into supabase_migrations.schema_migrations(version,name,statements)values('20261019194059','fantasy_legacy_identity_repair_controls',array[$legacy_schema$-- A one-time legacy ID repair must not silently make a stale club/position
-- listing purchasable. Owned selections remain readable through the existing
-- owner exception; locked lineups, price and transfer allowance do not change.
do $$begin
 if md5((select prosrc from pg_proc where oid='app_private.fantasy_native_player_selectable(uuid)'::regprocedure))<>'6f82af5254519bd098126c3f17939d22'then raise exception 'legacy_identity_selectability_baseline_changed';end if;
end $$;
create table app_private.fantasy_legacy_identity_repairs(
 fantasy_player_id uuid primary key references app.fantasy_players(id),
 football_player_id uuid not null unique references app.players(id),
 api_player_id text not null unique check(api_player_id~'^[0-9]{1,12}$'),
 reviewed_at timestamptz not null default statement_timestamp(),
 owner_approval text not null check(char_length(owner_approval)between 20 and 1000),
 identity_evidence jsonb not null check(jsonb_typeof(identity_evidence)='object'and identity_evidence<>'{}'::jsonb),
 catalog_before jsonb not null check(jsonb_typeof(catalog_before)='object'),
 hold_reason text not null check(char_length(hold_reason)between 20 and 1000),
 released_at timestamptz,
 release_reason text,
 check((released_at is null and release_reason is null)or(released_at>=reviewed_at and char_length(release_reason)between 20 and 1000))
);
alter table app_private.fantasy_legacy_identity_repairs enable row level security;
alter table app_private.fantasy_legacy_identity_repairs force row level security;
revoke all on app_private.fantasy_legacy_identity_repairs from public,anon,authenticated,service_role;

create function app_private.fantasy_legacy_identity_evidence_immutable()
returns trigger language plpgsql set search_path=''as $$
begin
 if tg_op='INSERT'then
  if not exists(select 1 from app.fantasy_players fp join app_private.football_provider_mappings m
   on m.internal_entity_id=fp.football_player_id and m.provider_name='sofascore'and m.entity_type='player'and m.active
   where fp.id=new.fantasy_player_id and fp.football_player_id=new.football_player_id and m.external_id=new.api_player_id)
  then raise exception 'legacy_identity_mapping_mismatch';end if;
  return new;
 end if;
 if tg_op='DELETE'then raise exception 'legacy_identity_evidence_immutable';end if;
 if(to_jsonb(new)-'released_at'-'release_reason')is distinct from(to_jsonb(old)-'released_at'-'release_reason')
 or old.released_at is not null or new.released_at is null then raise exception 'legacy_identity_evidence_immutable';end if;
 return new;
end $$;
revoke all on function app_private.fantasy_legacy_identity_evidence_immutable()from public,anon,authenticated,service_role;
create trigger fantasy_legacy_identity_evidence_immutable before insert or update or delete on app_private.fantasy_legacy_identity_repairs
for each row execute function app_private.fantasy_legacy_identity_evidence_immutable();

create or replace function app_private.fantasy_native_player_selectable(p_player_id uuid)
returns boolean language sql stable security definer set search_path=''as $$
 select not exists(select 1 from app_private.fantasy_legacy_identity_repairs repair
 where repair.fantasy_player_id=p_player_id and repair.released_at is null)
 and(not exists(select 1 from app.fantasy_players fp join app_private.fantasy_api_rating_seasons s on s.season_id=fp.fantasy_season_id where fp.id=p_player_id)
 or exists(select 1 from app.fantasy_players fp join app_private.football_provider_mappings m on m.internal_entity_id=fp.football_player_id
 and m.provider_name='sofascore'and m.entity_type='player'and m.active and m.external_id~'^[0-9]{1,12}$'where fp.id=p_player_id));
$$;
revoke all on function app_private.fantasy_native_player_selectable(uuid)from public,anon,authenticated,service_role;

-- No production identity, registration, selection, price or hold is inserted
-- by this migration. A separately guarded evidence manifest performs repairs.
$legacy_schema$]);
do $$declare source text;begin
 select statements[1]into source from supabase_migrations.schema_migrations where version='20261019194059';
 if encode(extensions.digest(source,'sha256'),'hex')<>'77b5d042cee91705691423a6c869baad95ed4389cb5c9fd06c5ad8837172cea5'then raise exception 'legacy_identity_schema_checksum_mismatch';end if;
 execute source;
 if exists(select 1 from app_private.fantasy_legacy_identity_repairs)then raise exception 'legacy_identity_schema_contains_repairs';end if;
 if exists(select 1 from legacy_before b full join(select 'players' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.players t
union all select 'catalog' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.fantasy_players t
union all select 'teams' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.fantasy_teams t
union all select 'squads' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.fantasy_squad_memberships t
union all select 'lineups' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.fantasy_lineups t
union all select 'lineup_players' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by lineup_id,fantasy_player_id),''))digest from app.fantasy_lineup_players t
union all select 'transfers' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.fantasy_transfer_batches t
union all select 'results' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.fantasy_team_gameweek_results t
union all select 'points' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by gameweek_id,fantasy_player_id),''))digest from app.fantasy_player_gameweek_points t
union all select 'seals' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by gameweek_id,calculation_version),''))digest from app_private.fantasy_scoring_snapshots t
union all select 'aliases' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app_private.sofascore_player_aliases t
union all select 'publications' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app_private.fantasy_rating_publications t
union all select 'sources' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app_private.fantasy_api_rating_sources t)a using(name)where a.digest is distinct from b.digest)then raise exception 'legacy_identity_schema_changed_data';end if;
 if current_setting('bg.legacy_identity_schema_mode')='rehearsal'then raise exception 'LEGACY_IDENTITY_SCHEMA_REHEARSAL_PASSED_20261019194059: all changes rolled back';end if;
 if current_setting('bg.legacy_identity_schema_mode')<>'apply'then raise exception 'legacy_identity_schema_invalid_mode';end if;
end $$;
commit;
select version,name from supabase_migrations.schema_migrations where version='20261019194059';
