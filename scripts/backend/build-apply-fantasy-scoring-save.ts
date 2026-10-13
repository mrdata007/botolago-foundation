import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
export const VERSION = "20261012174642";
export const MIGRATION_PATH = `supabase/migrations/${VERSION}_fantasy_scoring_save_set_based.sql`;
export const SCRIPT_PATH = `scripts/backend/apply-${VERSION}-fantasy-scoring-save.sql`;
export const READBACK_PATH = "scripts/backend/verify-fantasy-scoring-save.sql";
export const BEFORE_BODY_MD5 = "4a38b43093a540caf127f4348311a772";
export const SIGNATURE =
  "api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)";

/** Hash row documents first, so the aggregate string stays bounded by row count. */
export const dataStateSql = `select jsonb_build_object(
  'gameweeks',(select jsonb_build_array(count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by id),''))) from app.fantasy_gameweeks t),
  'events',(select jsonb_build_array(count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by id),''))) from app.fantasy_player_point_events t),
  'points',(select jsonb_build_array(count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by fantasy_player_id,gameweek_id),''))) from app.fantasy_player_gameweek_points t),
  'teams',(select jsonb_build_array(count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by fantasy_team_id,gameweek_id),''))) from app.fantasy_team_gameweek_results t),
  'snapshots',(select jsonb_build_array(count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by gameweek_id,calculation_version),''))) from app_private.fantasy_scoring_snapshots t),
  'substitutions',(select jsonb_build_array(count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by lineup_id,sequence_number),''))) from app.fantasy_auto_substitutions t)
) as state`;

export function buildScoringSaveInstall(migration: string): string {
  const body = migration.match(/as \$\$([\s\S]*?)\$\$;/)?.[1];
  if (!body || migration.includes("$scoring_save_migration$"))
    throw new Error("invalid_scoring_save_migration");
  const after = createHash("md5").update(body).digest("hex");
  const sha = createHash("sha256").update(migration).digest("hex");
  return `-- OWNER-RUN ONLY: BotolaGO Production V2 (tkewgajrljbwgwedqsxn).
-- Draft until the PR's database-quality gate passes and the owner reviews it.
-- Confirm the target project in SQL Editor. This file never scores or finalizes.
-- Check no GitHub production workflow or other operator is writing, then pause
-- and drain ALL writers per AGENTS.md (including dispatched Edge workers).
-- Do not force the old maintenance script if its recorded baseline has changed.
-- Record the independent verification query's output BEFORE running this file.
-- REHEARSE -> independent rollback check -> change ONLY final rollback to commit
-- -> run once -> independent readback -> restore the exact previous switches/jobs.
-- This script embeds the migration byte-for-byte and checks its SHA256.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
select app_private.hold_scheduled_jobs();
do $preflight$
begin
  if exists(select 1 from supabase_migrations.schema_migrations where version='${VERSION}') then
    raise exception 'stop: scoring-save migration already recorded';
  end if;
  if md5((select prosrc from pg_proc where oid='${SIGNATURE}'::regprocedure))
      is distinct from '${BEFORE_BODY_MD5}' then
    raise exception 'stop: scoring persistence is not the reviewed production baseline';
  end if;
  if exists(select 1 from cron.job where active)
    or exists(select 1 from cron.job_run_details where status not in ('succeeded','failed'))
    or exists(select 1 from net.http_request_queue)
    or exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled)
    or exists(select 1 from app_private.notification_email_settings where mode<>'off' or football_live_refresh_enabled)
    or exists(select 1 from app_private.manager_card_settings where compute_enabled)
    or exists(select 1 from app_private.pepites_settings where mode<>'off')
    or exists(select 1 from app_private.prediction_settings where scoring_enabled)
    or exists(select 1 from app_private.account_deletion_settings where enabled)
    or exists(select 1 from app_private.ai_home_story_settings where enabled)
    or exists(select 1 from app_private.ai_content_settings where enabled)
    or exists(select 1 from app_private.ai_home_story_jobs where status='generating')
    or exists(select 1 from pg_stat_activity where pid<>pg_backend_pid()
      and backend_type='client backend' and state in ('active','idle in transaction','idle in transaction (aborted)'))
  then raise exception 'stop: production writers are not paused and drained'; end if;
end $preflight$;

create temporary table scoring_save_before on commit drop as ${dataStateSql};
insert into supabase_migrations.schema_migrations(version,name,statements)
values('${VERSION}','fantasy_scoring_save_set_based',array[$scoring_save_migration$${migration}$scoring_save_migration$]);
do $apply$
declare migration text := (select statements[1] from supabase_migrations.schema_migrations where version='${VERSION}');
begin
  if encode(sha256(convert_to(migration,'UTF8')),'hex') is distinct from '${sha}' then
    raise exception 'stop: embedded migration differs from the reviewed file';
  end if;
  execute migration;
end $apply$;
do $postflight$
declare after_state jsonb;
begin
  if md5((select prosrc from pg_proc where oid='${SIGNATURE}'::regprocedure))
      is distinct from '${after}' then
    raise exception 'stop: installed scoring function is not the reviewed version';
  end if;
  if not (select prosecdef and proconfig=array['search_path=""'] from pg_proc where oid='${SIGNATURE}'::regprocedure)
    or has_function_privilege('anon','${SIGNATURE}','execute')
    or has_function_privilege('authenticated','${SIGNATURE}','execute')
    or not has_function_privilege('service_role','${SIGNATURE}','execute')
    or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where p.oid='${SIGNATURE}'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE')
  then raise exception 'stop: scoring function privileges or search path changed'; end if;
  select state into after_state from (${dataStateSql}) checked;
  if after_state is distinct from (select state from scoring_save_before) then
    raise exception 'stop: scoring data changed during the schema-only install';
  end if;
end $postflight$;
select 'Scoring-save checks passed; data unchanged. Verify transaction outcome independently.' as result;
rollback;
`;
}

export function buildScoringSaveReadback(migration: string): string {
  const body = migration.match(/as \$\$([\s\S]*?)\$\$;/)?.[1];
  if (!body) throw new Error("invalid_scoring_save_migration");
  const after = createHash("md5").update(body).digest("hex");
  return `-- READ ONLY. Run independently before installation, after rehearsal rollback,
-- and after real commit. While writers are paused, data_state must be identical.
-- Rollback: migration_recorded=false, body_md5=${BEFORE_BODY_MD5}.
-- Commit: migration_recorded=true, body_md5=${after}.
select jsonb_build_object(
  'migration_recorded',exists(select 1 from supabase_migrations.schema_migrations where version='${VERSION}'),
  'body_md5',(select md5(prosrc) from pg_proc where oid='${SIGNATURE}'::regprocedure),
  'service_can_execute',has_function_privilege('service_role','${SIGNATURE}','execute'),
  'anon_can_execute',has_function_privilege('anon','${SIGNATURE}','execute'),
  'browser_can_execute',has_function_privilege('authenticated','${SIGNATURE}','execute'),
  'data_state',(select state from (${dataStateSql}) s)
) as scoring_save_readback;
`;
}

if (import.meta.main) {
  const expected = buildScoringSaveInstall(readFileSync(join(root, MIGRATION_PATH), "utf8"));
  const readback = buildScoringSaveReadback(readFileSync(join(root, MIGRATION_PATH), "utf8"));
  if (process.argv.includes("--check")) {
    if (readFileSync(join(root, SCRIPT_PATH), "utf8") !== expected)
      throw new Error("scoring_save_install_drift");
    if (readFileSync(join(root, READBACK_PATH), "utf8") !== readback)
      throw new Error("scoring_save_readback_drift");
  } else {
    writeFileSync(join(root, SCRIPT_PATH), expected);
    writeFileSync(join(root, READBACK_PATH), readback);
  }
}
