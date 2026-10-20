/** Exact-source schema promotion and separately audited one-time repair. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const version = "20261019194059";
const migrationName = "fantasy_legacy_identity_repair_controls";
const migration = readFileSync(
  join(root, `supabase/migrations/${version}_${migrationName}.sql`),
  "utf8",
);
const manifest = readFileSync(
  join(root, "docs/backend/evidence/legacy-identity-repair-manifest-20261019.json"),
  "utf8",
);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const releaseVersion = "20261020015540";
const releaseName = "fantasy_legacy_hold_release_audit_pairing";
const releaseMigration = readFileSync(
  join(root, `supabase/migrations/${releaseVersion}_${releaseName}.sql`),
  "utf8",
);
if (migration.includes("$legacy_schema$") || manifest.includes("$legacy_manifest$"))
  throw new Error("legacy source quoting collision");

const untouched = [
  ["players", "app.players", "id"],
  ["catalog", "app.fantasy_players", "id"],
  ["teams", "app.fantasy_teams", "id"],
  ["squads", "app.fantasy_squad_memberships", "id"],
  ["lineups", "app.fantasy_lineups", "id"],
  ["lineup_players", "app.fantasy_lineup_players", "lineup_id,fantasy_player_id"],
  ["transfers", "app.fantasy_transfer_batches", "id"],
  ["results", "app.fantasy_team_gameweek_results", "id"],
  ["points", "app.fantasy_player_gameweek_points", "gameweek_id,fantasy_player_id"],
  ["seals", "app_private.fantasy_scoring_snapshots", "gameweek_id,calculation_version"],
  ["aliases", "app_private.sofascore_player_aliases", "id"],
  ["publications", "app_private.fantasy_rating_publications", "id"],
  ["sources", "app_private.fantasy_api_rating_sources", "id"],
]
  .map(
    ([name, table, order]) =>
      // Keep every row and column in the comparison without materializing the
      // million-row staging fixture as one enormous JSON value in memory.
      // PostgreSQL's composite text output includes every field with escaping;
      // avoiding JSONB conversion makes this practical on the retained dataset.
      `select '${name}' name,md5(coalesce(string_agg(md5(t::text),''order by ${order}),''))digest from ${table} t`,
  )
  .join("\nunion all ");
const paused = `if exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled or lifecycle_worker_enabled)
 or exists(select 1 from app_private.notification_email_settings where football_live_refresh_enabled or mode<>'off')
 or exists(select 1 from app_private.fantasy_worker_lease where released_at is null and expires_at>statement_timestamp())
 or exists(select 1 from net.http_request_queue)then raise exception 'legacy_identity_writers_not_drained';end if;`;

export function buildSchema(): string {
  return `-- Staging first, then authorized production. Canonical migration ${version}, SHA256 ${sha(migration)}.
-- Rehearse, independently verify rollback, then change only mode to apply. No identity repair is performed here.
begin;
set local lock_timeout='5s';set local statement_timeout='90s';
select set_config('bg.legacy_identity_schema_mode','rehearsal',true);
select app_private.hold_scheduled_jobs();
do $$begin
 ${paused}
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}')or to_regclass('app_private.fantasy_legacy_identity_repairs')is not null then raise exception 'legacy_identity_schema_already_applied';end if;
end $$;
create temporary table legacy_before on commit drop as ${untouched};
insert into supabase_migrations.schema_migrations(version,name,statements)values('${version}','${migrationName}',array[$legacy_schema$${migration}$legacy_schema$]);
do $$declare source text;begin
 select statements[1]into source from supabase_migrations.schema_migrations where version='${version}';
 if encode(extensions.digest(source,'sha256'),'hex')<>'${sha(migration)}'then raise exception 'legacy_identity_schema_checksum_mismatch';end if;
 execute source;
 if exists(select 1 from app_private.fantasy_legacy_identity_repairs)then raise exception 'legacy_identity_schema_contains_repairs';end if;
 if exists(select 1 from legacy_before b full join(${untouched})a using(name)where a.digest is distinct from b.digest)then raise exception 'legacy_identity_schema_changed_data';end if;
 if current_setting('bg.legacy_identity_schema_mode')='rehearsal'then raise exception 'LEGACY_IDENTITY_SCHEMA_REHEARSAL_PASSED_${version}: all changes rolled back';end if;
 if current_setting('bg.legacy_identity_schema_mode')<>'apply'then raise exception 'legacy_identity_schema_invalid_mode';end if;
end $$;
commit;
select version,name from supabase_migrations.schema_migrations where version='${version}';
`;
}

export function buildRepairs(): string {
  return `-- Production tkewgajrljbwgwedqsxn only. Manifest SHA256 ${sha(manifest)}.
-- Identity adjudication is distinct from disputed bio/registration attributes. All 21 keep a new-purchase hold.
-- Rehearse, independently verify all 21 mappings/holds rolled back, then change only mode to apply.
begin;
set local lock_timeout='5s';set local statement_timeout='90s';
select set_config('bg.legacy_identity_repair_mode','rehearsal',true);
select app_private.hold_scheduled_jobs();
lock table app_private.fantasy_worker_lease in exclusive mode;
lock table app_private.football_provider_mappings,app_private.sofascore_player_aliases,app.players,app.fantasy_players,
 app.fantasy_teams,app.fantasy_squad_memberships,app.fantasy_lineups,app.fantasy_lineup_players,app.fantasy_transfer_batches in share mode;
create temporary table legacy_manifest(source_text text,data jsonb generated always as(source_text::jsonb)stored)on commit drop;
insert into legacy_manifest(source_text)values($legacy_manifest$${manifest}$legacy_manifest$);
create temporary table repair_rows on commit drop as select x.*from legacy_manifest m cross join lateral jsonb_to_recordset(m.data->'repairs')x(
 "footballPlayerId" uuid,"fantasyPlayerId" uuid,"apiPlayerId"text,"expectedFullName"text,"expectedDateOfBirth"text,
 "expectedFootballPosition"text,"legacySportsMonksId"text,evidence jsonb,"holdReason"text);
do $$declare m jsonb;begin
 ${paused}
 if exists(select 1 from app_private.account_deletion_settings where enabled)
 or exists(select 1 from app_private.manager_card_settings where compute_enabled)
 or exists(select 1 from app_private.rivals_settings where enabled)
 or exists(select 1 from app_private.trophy_settings where enabled)
 or exists(select 1 from app.account_deletion_requests where status='processing')then raise exception 'legacy_identity_dependent_writer_active';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='${version}'and encode(extensions.digest(statements[1],'sha256'),'hex')='${sha(migration)}')then raise exception 'legacy_identity_controls_missing';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='${releaseVersion}'and encode(extensions.digest(statements[1],'sha256'),'hex')='${sha(releaseMigration)}')then raise exception 'legacy_identity_release_audit_missing';end if;
 select data into m from legacy_manifest;
 if encode(extensions.digest((select source_text from legacy_manifest),'sha256'),'hex')<>'${sha(manifest)}'
 or m->>'seasonId'<>'5ada3e98-2929-405a-a3f1-a26de8e51933'
 or(select count(*)from repair_rows)<>21 or(select count(distinct "apiPlayerId")from repair_rows)<>21
 or not exists(select 1 from app_private.fantasy_api_rating_seasons where season_id=(m->>'seasonId')::uuid and from_gameweek=4)
 then raise exception 'legacy_identity_manifest_scope_changed';end if;
 if exists(select 1 from repair_rows r left join app.players p on p.id=r."footballPlayerId"
 left join app.fantasy_players fp on fp.id=r."fantasyPlayerId"
 where p.id is null or fp.id is null or fp.football_player_id is distinct from p.id or fp.fantasy_season_id is distinct from(m->>'seasonId')::uuid
 or p.full_name is distinct from r."expectedFullName"or p.date_of_birth::text is distinct from r."expectedDateOfBirth"
 or p.position::text is distinct from r."expectedFootballPosition")then raise exception 'legacy_identity_catalog_baseline_changed';end if;
 if exists(select 1 from repair_rows r where(select p.external_id from app_private.football_provider_mappings p
 where p.provider_name='sportsmonks'and p.entity_type='player'and p.internal_entity_id=r."footballPlayerId")is distinct from r."legacySportsMonksId")then raise exception 'legacy_identity_legacy_provider_changed';end if;
 if exists(select 1 from repair_rows r join app_private.football_provider_mappings p on p.provider_name='sofascore'and p.entity_type='player'
 and(p.internal_entity_id=r."footballPlayerId"or p.external_id=r."apiPlayerId"))
 or exists(select 1 from repair_rows r join app_private.sofascore_player_aliases a on a.player_id=r."footballPlayerId"or a.sofascore_player_id=r."apiPlayerId")
 or exists(select 1 from repair_rows r join app_private.fantasy_legacy_identity_repairs a on a.fantasy_player_id=r."fantasyPlayerId")
 then raise exception 'legacy_identity_existing_mapping_alias_or_repair';end if;
 if(select count(*)from app.fantasy_squad_memberships s join repair_rows r on r."fantasyPlayerId"=s.fantasy_player_id where s.sold_at is null)<>(m->>'expectedOwnedSlots')::integer
 or(select count(distinct s.fantasy_team_id)from app.fantasy_squad_memberships s join repair_rows r on r."fantasyPlayerId"=s.fantasy_player_id where s.sold_at is null)<>(m->>'expectedOwningTeams')::integer then raise exception 'legacy_identity_ownership_scope_changed';end if;
 perform g.id from app.fantasy_gameweeks g where g.fantasy_season_id=(m->>'seasonId')::uuid order by g.id for update;
 if exists(select 1 from app.fantasy_gameweeks where fantasy_season_id=(m->>'seasonId')::uuid and status='finalizing')then raise exception 'legacy_identity_finalization_active';end if;
end $$;
create temporary table legacy_before on commit drop as ${untouched}
union all select 'original_mappings',md5(coalesce(jsonb_agg(to_jsonb(t)order by id)::text,''))from app_private.football_provider_mappings t
union all select 'gameweek_state',md5(coalesce(jsonb_agg(to_jsonb(t)-'scoring_input_version'-'updated_at'order by id)::text,''))from app.fantasy_gameweeks t;
create temporary table legacy_week_versions on commit drop as select id,scoring_input_version,
 (fantasy_season_id='5ada3e98-2929-405a-a3f1-a26de8e51933'and sequence_number>=4
 and status in('scheduled','open','locked','live','provisional'))as should_bump from app.fantasy_gameweeks;
insert into app_private.football_provider_mappings(provider_name,entity_type,external_id,internal_entity_id,source_version,last_seen_at,active)
select 'sofascore','player',"apiPlayerId","footballPlayerId",'reviewed-legacy-identity-20261019',statement_timestamp(),true from repair_rows;
insert into app_private.fantasy_legacy_identity_repairs(fantasy_player_id,football_player_id,api_player_id,owner_approval,identity_evidence,catalog_before,hold_reason)
select r."fantasyPlayerId",r."footballPlayerId",r."apiPlayerId",m.data->>'ownerApproval',r.evidence,to_jsonb(fp),r."holdReason"
from repair_rows r join app.fantasy_players fp on fp.id=r."fantasyPlayerId"cross join legacy_manifest m;
-- Mapping inserts have no input-version trigger. Explicitly invalidate every
-- unfinished native week; preserve all historical sealed inputs and results.
update app.fantasy_gameweeks g set scoring_input_version=greatest(0,g.scoring_input_version)+1
where g.fantasy_season_id='5ada3e98-2929-405a-a3f1-a26de8e51933'and g.sequence_number>=4
and g.status in('scheduled','open','locked','live','provisional');
do $$begin
 if exists(select 1 from legacy_week_versions b join app.fantasy_gameweeks g on g.id=b.id
 where g.scoring_input_version is distinct from case when b.should_bump then greatest(0,b.scoring_input_version)+1 else b.scoring_input_version end)then raise exception 'legacy_identity_input_version_scope_changed';end if;
 if exists(select 1 from legacy_before b full join(${untouched}
 union all select 'original_mappings',md5(coalesce(jsonb_agg(to_jsonb(t)order by id)::text,''))from app_private.football_provider_mappings t
 where not(t.provider_name='sofascore'and t.entity_type='player'and t.internal_entity_id in(select "footballPlayerId"from repair_rows))
 union all select 'gameweek_state',md5(coalesce(jsonb_agg(to_jsonb(t)-'scoring_input_version'-'updated_at'order by id)::text,''))from app.fantasy_gameweeks t
 )a using(name)where a.digest is distinct from b.digest)then raise exception 'legacy_identity_unexpected_state_change';end if;
 if(select count(*)from app_private.fantasy_legacy_identity_repairs x join repair_rows r on r."fantasyPlayerId"=x.fantasy_player_id and r."apiPlayerId"=x.api_player_id)<>21
 or exists(select 1 from repair_rows r where app_private.fantasy_native_player_selectable(r."fantasyPlayerId"))then raise exception 'legacy_identity_new_purchase_hold_missing';end if;
 if current_setting('bg.legacy_identity_repair_mode')='rehearsal'then raise exception 'LEGACY_IDENTITY_REPAIR_REHEARSAL_PASSED: 21 identities, ownership/prices/lineups/seals preserved; all changes rolled back';end if;
 if current_setting('bg.legacy_identity_repair_mode')<>'apply'then raise exception 'legacy_identity_repair_invalid_mode';end if;
end $$;
commit;
select count(*)as repaired_identities,count(*)filter(where released_at is null)as purchase_holds from app_private.fantasy_legacy_identity_repairs;
`;
}

export function buildReleaseAudit(): string {
  return `-- Forward-only audit hardening; exact source SHA256 ${sha(releaseMigration)}.
begin;
set local lock_timeout='5s';set local statement_timeout='90s';
select set_config('bg.legacy_release_audit_mode','rehearsal',true);
select app_private.hold_scheduled_jobs();
do $$begin
 ${paused}
 if not exists(select 1 from supabase_migrations.schema_migrations where version='${version}'and encode(extensions.digest(statements[1],'sha256'),'hex')='${sha(migration)}')then raise exception 'legacy_identity_controls_missing';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='${releaseVersion}')then raise exception 'legacy_release_audit_already_applied';end if;
end $$;
create temporary table release_audit_before on commit drop as select md5(coalesce(string_agg(md5(t::text),''order by fantasy_player_id),''))digest from app_private.fantasy_legacy_identity_repairs t;
insert into supabase_migrations.schema_migrations(version,name,statements)values('${releaseVersion}','${releaseName}',array[$legacy_release_audit$${releaseMigration}$legacy_release_audit$]);
do $$declare source text;begin
 select statements[1]into source from supabase_migrations.schema_migrations where version='${releaseVersion}';
 if encode(extensions.digest(source,'sha256'),'hex')<>'${sha(releaseMigration)}'then raise exception 'legacy_release_audit_source_changed';end if;
 execute source;
 if(select digest from release_audit_before)is distinct from(select md5(coalesce(string_agg(md5(t::text),''order by fantasy_player_id),''))from app_private.fantasy_legacy_identity_repairs t)then raise exception 'legacy_release_audit_changed_evidence';end if;
 if not exists(select 1 from pg_constraint where conrelid='app_private.fantasy_legacy_identity_repairs'::regclass and conname='legacy_identity_release_audit_pairing'and convalidated)then raise exception 'legacy_release_audit_constraint_missing';end if;
 if current_setting('bg.legacy_release_audit_mode')='rehearsal'then raise exception 'LEGACY_RELEASE_AUDIT_REHEARSAL_PASSED: evidence preserved; all changes rolled back';end if;
 if current_setting('bg.legacy_release_audit_mode')<>'apply'then raise exception 'legacy_release_audit_mode_invalid';end if;
end $$;
commit;
select version,name from supabase_migrations.schema_migrations where version='${releaseVersion}';
`;
}

if (import.meta.main) {
  for (const [file, build] of [
    [`apply-${version}-fantasy-legacy-controls.sql`, buildSchema],
    ["apply-fantasy-legacy-identity-repairs.sql", buildRepairs],
    [`apply-${releaseVersion}-fantasy-legacy-release-audit.sql`, buildReleaseAudit],
  ] as const) {
    const path = join(root, "scripts/backend", file);
    const expected = build();
    if (process.argv.includes("--check")) {
      if (readFileSync(path, "utf8") !== expected)
        throw new Error(`legacy promoter drift: ${file}`);
    } else writeFileSync(path, expected);
  }
}
