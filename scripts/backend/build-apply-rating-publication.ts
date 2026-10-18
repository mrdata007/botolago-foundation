import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20261018215311_fantasy_publish_available_api_ratings.sql",
  "utf8",
);
const digest = createHash("sha256").update(migration).digest("hex");
const fingerprints = `select 'results' as name,md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'')) as digest from app.fantasy_team_gameweek_results t
union all select 'snapshots',md5(coalesce(jsonb_agg(to_jsonb(t) order by t.gameweek_id,t.calculation_version)::text,'')) from app_private.fantasy_scoring_snapshots t
union all select 'events',md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'')) from app.fantasy_player_point_events t
union all select 'points',md5(coalesce(jsonb_agg(to_jsonb(t) order by t.gameweek_id,t.fantasy_player_id)::text,'')) from app.fantasy_player_gameweek_points t
union all select 'rankings',md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'')) from app.fantasy_rankings t
union all select 'mappings',md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'')) from app_private.football_provider_mappings t
union all select 'aliases',md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'')) from app_private.sofascore_player_aliases t
union all select 'gameweeks',md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'')) from app.fantasy_gameweeks t`;
const sql = `-- Production V2 only. Canonical migration SHA256: ${digest}
-- List workflows and scheduled jobs before writing. Stand down relevant
-- writers, drain async requests, rehearse, independently verify rollback,
-- then change ONLY the final rollback to commit. No points are published here.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
select app_private.hold_scheduled_jobs();
lock table app_private.fantasy_worker_lease in exclusive mode;
do $$ begin
 if exists(select 1 from app_private.fantasy_worker_lease where released_at is null and expires_at>statement_timestamp()) then raise exception 'rating_publication_worker_active'; end if;
 if exists(select 1 from net.http_request_queue) then raise exception 'rating_publication_queue_active'; end if;
 if exists(select 1 from app_private.football_refresh_dispatch d where d.request_id is not null and d.dispatched_at>statement_timestamp()-interval '10 minutes'
 and not exists(select 1 from net._http_response r where r.id=d.request_id and not coalesce(r.timed_out,false) and coalesce(r.error_msg,'') not ilike '%timeout%')) then raise exception 'rating_publication_football_running'; end if;
 if exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled) or exists(select 1 from app_private.notification_email_settings where football_live_refresh_enabled) then raise exception 'rating_publication_pause_writers_first'; end if;
 if not exists(select 1 from app.fantasy_seasons where id='5ada3e98-2929-405a-a3f1-a26de8e51933') then raise exception 'wrong_production_season'; end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20261018173321') then raise exception 'native_rating_migration_missing'; end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='20261018215311') or to_regclass('app_private.fantasy_rating_publications') is not null then raise exception 'publication_migration_already_applied'; end if;
end $$;
create temporary table publication_before on commit drop as ${fingerprints};
insert into supabase_migrations.schema_migrations(version,name,statements)
values('20261018215311','fantasy_publish_available_api_ratings',array[$rating_publication_source$${migration}$rating_publication_source$]);
do $$ declare source text; begin
 select statements[1] into source from supabase_migrations.schema_migrations where version='20261018215311';
 if encode(extensions.digest(source,'sha256'),'hex')<>'${digest}' then raise exception 'publication_canonical_source_mismatch'; end if;
 execute source;
end $$;
do $$ begin
 if exists(select 1 from app_private.fantasy_rating_publications) then raise exception 'migration_published_results'; end if;
 if exists(select 1 from publication_before b join (${fingerprints}) a using(name) where b.digest is distinct from a.digest) then raise exception 'publication_migration_changed_data'; end if;
end $$;
rollback;
select exists(select 1 from supabase_migrations.schema_migrations where version='20261018215311') as applied;
`;
writeFileSync("scripts/backend/apply-rating-publication.sql", sql);
console.log(`Wrote canonical rating publication promoter (${digest}).`);
