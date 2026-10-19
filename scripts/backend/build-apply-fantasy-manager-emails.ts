/** Exact-source, rollback-first promoters. Enum must commit before automation. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const stages = [
  ["20261019111026", "fantasy_manager_email_event_type"],
  ["20261019111217", "fantasy_manager_email_automation"],
] as const;

const unchanged = `select 'events' name,md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,'')) digest from app_private.notification_events t
union all select 'notifications',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,''))from app.notifications t
union all select 'deliveries',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,''))from app.notification_deliveries t
union all select 'gameweeks',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,''))from app.fantasy_gameweeks t
union all select 'results',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,''))from app.fantasy_team_gameweek_results t
union all select 'preferences',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.user_id)::text,''))from app.user_preferences t
union all select 'settings',md5(coalesce(jsonb_agg(to_jsonb(t)-'manager_automation_enabled'-'enabled_types')::text,''))from app_private.notification_email_settings t
union all select 'cron',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.jobid)::text,''))from cron.job t`;

export function build(stage: 0 | 1): string {
  const [version, name] = stages[stage];
  const source = readFileSync(join(root, `supabase/migrations/${version}_${name}.sql`), "utf8");
  const digest = createHash("sha256").update(source).digest("hex");
  const tag = `$manager_email_${version}$`;
  if (source.includes(tag)) throw new Error("migration contains its quoting tag");
  return `-- STAGING srdrflfrfpwixsllveid first; PRODUCTION tkewgajrljbwgwedqsxn only.
-- Canonical migration ${version}; SHA256 ${digest}.
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
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}')then raise exception 'manager_email_already_applied';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20261018215311')then raise exception 'manager_email_rating_publication_required';end if;
 if not exists(select 1 from app_private.notification_email_settings where id and mode='off')then raise exception 'manager_email_sending_must_be_off';end if;
 ${
   stage === 0
     ? `if exists(select 1 from pg_enum where enumtypid='app.notification_type'::regtype and enumlabel='gameweek_opened')then raise exception 'manager_email_enum_already_present';end if;`
     : `
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20261019111026')then raise exception 'manager_email_enum_must_be_committed_first';end if;
 if to_regclass('app_private.fantasy_email_openings')is not null or to_regprocedure('api.service_validate_fantasy_email_delivery(uuid,jsonb,text,text)')is not null then raise exception 'manager_email_objects_already_present';end if;
 if md5((select prosrc from pg_proc where oid='app_private.notification_email_event_is_stale(app_private.notification_events,timestamptz)'::regprocedure))<>'831ad6197d5de070836480b58973ffcf'then raise exception 'manager_email_staleness_baseline_changed';end if;
 if exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled)
 or exists(select 1 from app_private.notification_email_settings where football_live_refresh_enabled)then raise exception 'manager_email_pause_relevant_writers_first';end if;
 if exists(select 1 from app_private.fantasy_worker_lease where released_at is null and expires_at>statement_timestamp())then raise exception 'manager_email_scoring_worker_active';end if;
 if exists(select 1 from app.notification_deliveries where status='claimed'and claim_expires_at>statement_timestamp())then raise exception 'manager_email_delivery_worker_active';end if;
 if exists(select 1 from net.http_request_queue)then raise exception 'manager_email_async_queue_active';end if;
 `
 }
end $preflight$;
create temporary table manager_email_before on commit drop as ${unchanged};
insert into supabase_migrations.schema_migrations(version,name,statements)
values('${version}','${name}',array[${tag}${source}${tag}]);
do $install$
declare source text;
begin
 select statements[1]into source from supabase_migrations.schema_migrations where version='${version}';
 if encode(extensions.digest(source,'sha256'),'hex')<>'${digest}'then raise exception 'manager_email_source_checksum_mismatch';end if;
 execute source;
end $install$;
do $postflight$
begin
 if exists(select 1 from manager_email_before b full join(${unchanged})a using(name)where b.digest is distinct from a.digest)then raise exception 'manager_email_unexpected_data_change';end if;
 ${
   stage === 0
     ? `if not exists(select 1 from pg_enum where enumtypid='app.notification_type'::regtype and enumlabel='gameweek_opened')then raise exception 'manager_email_enum_missing';end if;`
     : `
 if not exists(select 1 from app_private.notification_email_settings where id and mode='off'and not manager_automation_enabled)then raise exception 'manager_email_activation_changed';end if;
 if exists(select 1 from app_private.fantasy_email_openings)then raise exception 'manager_email_historical_opening_backfill';end if;
 if not has_function_privilege('service_role','api.service_validate_fantasy_email_delivery(uuid,jsonb,text,text)','execute')
 or has_function_privilege('anon','api.service_validate_fantasy_email_delivery(uuid,jsonb,text,text)','execute')
 or has_function_privilege('authenticated','api.service_validate_fantasy_email_delivery(uuid,jsonb,text,text)','execute')then raise exception 'manager_email_service_grants_invalid';end if;
 if has_table_privilege('service_role','app_private.fantasy_email_openings','select')then raise exception 'manager_email_private_ledger_exposed';end if;
 `
 }
 if current_setting('bg.manager_email_mode')='rehearsal'then raise exception 'MANAGER_EMAIL_REHEARSAL_PASSED_${version}: all changes rolled back';end if;
 if current_setting('bg.manager_email_mode')<>'apply'then raise exception 'manager_email_invalid_promotion_mode';end if;
end $postflight$;
commit;
select version,name from supabase_migrations.schema_migrations where version='${version}';
`;
}

if (import.meta.main) {
  for (const stage of [0, 1] as const) {
    const path = join(root, `scripts/backend/apply-${stages[stage][0]}-fantasy-manager-emails.sql`);
    const expected = build(stage);
    if (process.argv.includes("--check")) {
      if (readFileSync(path, "utf8") !== expected) throw new Error(`promoter drift: ${path}`);
    } else writeFileSync(path, expected);
  }
}
