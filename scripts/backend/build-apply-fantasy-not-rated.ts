/** Canonical-source migration promoter. Policy activation is a separate operation. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const version = "20261019172832";
const name = "fantasy_not_rated_settlement";
const source = readFileSync(join(root, `supabase/migrations/${version}_${name}.sql`), "utf8");
const digest = createHash("sha256").update(source).digest("hex");
const tag = "$not_rated_migration$";
if (source.includes(tag)) throw new Error("migration quoting collision");
const unchanged = `select 'gameweeks' name,md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,'')) digest from app.fantasy_gameweeks t
union all select 'results',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,''))from app.fantasy_team_gameweek_results t
union all select 'sources',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,''))from app_private.fantasy_api_rating_sources t
union all select 'polls',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.fixture_id)::text,''))from app_private.fantasy_api_rating_polls t
union all select 'events',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,''))from app_private.notification_events t
union all select 'deliveries',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,''))from app.notification_deliveries t
union all select 'cron',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.jobid)::text,''))from cron.job t`;

export function build(): string {
  return `-- Sole writer: staging srdrflfrfpwixsllveid first, then authorized production tkewgajrljbwgwedqsxn.
-- Canonical ${version}, SHA256 ${digest}. Policy ships OFF.
-- Rehearse, independently read back the rollback, then change only mode to apply.
-- Record/pause Fantasy and football writers and drain leases/async requests first.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
select set_config('bg.not_rated_mode','rehearsal',true);
select app_private.hold_scheduled_jobs();
do $preflight$
begin
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}')or to_regclass('app_private.fantasy_not_rated_policy')is not null then raise exception 'not_rated_already_applied';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20261018215311')then raise exception 'not_rated_publication_required';end if;
 if exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled or lifecycle_worker_enabled)
 or exists(select 1 from app_private.notification_email_settings where football_live_refresh_enabled or mode<>'off')then raise exception 'not_rated_pause_writers_first';end if;
 if exists(select 1 from app_private.fantasy_worker_lease where released_at is null and expires_at>statement_timestamp())
 or exists(select 1 from net.http_request_queue)
 or exists(select 1 from app.notification_deliveries where status='claimed'and claim_expires_at>statement_timestamp())then raise exception 'not_rated_async_writer_active';end if;
end $preflight$;
create temporary table not_rated_before on commit drop as ${unchanged};
insert into supabase_migrations.schema_migrations(version,name,statements)
values('${version}','${name}',array[${tag}${source}${tag}]);
do $install$
declare migration_source text;
begin
 select statements[1]into migration_source from supabase_migrations.schema_migrations where version='${version}';
 if encode(extensions.digest(migration_source,'sha256'),'hex')<>'${digest}'then raise exception 'not_rated_migration_checksum_mismatch';end if;
 execute migration_source;
end $install$;
do $postflight$
begin
 if exists(select 1 from not_rated_before b full join(${unchanged})a using(name)where b.digest is distinct from a.digest)then raise exception 'not_rated_unexpected_data_change';end if;
 if not exists(select 1 from app_private.fantasy_not_rated_policy where id and not enabled and approved_at is null)
 or exists(select 1 from app_private.fantasy_not_rated_settlements)then raise exception 'not_rated_premature_activation';end if;
 if has_function_privilege('service_role','app_private.fantasy_settle_not_rated(bigint)','execute')
 or has_table_privilege('authenticated','app_private.fantasy_rating_checks','select')
 or has_table_privilege('service_role','app_private.fantasy_not_rated_settlements','insert')then raise exception 'not_rated_private_evidence_exposed';end if;
 if current_setting('bg.not_rated_mode')='rehearsal'then raise exception 'NOT_RATED_REHEARSAL_PASSED_${version}: all changes rolled back';end if;
 if current_setting('bg.not_rated_mode')<>'apply'then raise exception 'not_rated_invalid_mode';end if;
end $postflight$;
commit;
select version,name from supabase_migrations.schema_migrations where version='${version}';
`;
}

if (import.meta.main) {
  const path = join(root, `scripts/backend/apply-${version}-fantasy-not-rated.sql`);
  const expected = build();
  if (process.argv.includes("--check")) {
    if (readFileSync(path, "utf8") !== expected) throw new Error("Not rated promoter drift");
  } else writeFileSync(path, expected);
}
