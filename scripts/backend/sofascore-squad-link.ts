/**
 * One-time bulk link of the existing player catalog to SofaScore, from the club squads.
 * READ ONLY: this script sends single SELECT statements and RapidAPI GETs (about one
 * `teams/get-squad` per club, 16 for the Botola), and writes only local files. It never writes a
 * mapping; the apply script it can generate is TEXT for the owner to read and run.
 *
 *   RAPIDAPI_KEY=… SUPABASE_ACCESS_TOKEN=… SUPABASE_PRODUCTION_PROJECT_REF=… \
 *     bun scripts/backend/sofascore-squad-link.ts --read-production --out-dir <dir> \
 *       [--show-names] [--max-requests 40] [--emit-sql] [--owner-auth-user-id <uuid>] \
 *       [--competition-id <uuid> --season-id <uuid>]
 *
 *   bun scripts/backend/sofascore-squad-link.ts --from-report report.json --emit-sql \
 *       --out-dir <dir> [--owner-auth-user-id <uuid>]
 *
 * Nothing decides by name: players match on club, shirt number and position
 * (src/backend/football/sofascore-squad-link.ts). `--show-names` only copies names into the
 * report for staff to read (it adds them to the SELECTs and to the squad rows); without it names
 * never leave the database or SofaScore's reply. It reuses the read and guard code of the catalog
 * ID mapping lane (sofascore-id-bridge-fetch.ts: assertReadOnly, managementQuery, resolveIds) and
 * the squad parser of the weekly catalog job (supabase/functions/_shared/sofascore-catalog.ts).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RapidApiClient } from "../../src/backend/football/provider/rapidapi-client";
import {
  buildReport,
  classifySquads,
  renderApplySql,
  renderMarkdown,
  type CatalogMember,
  type Pos,
  type SquadClub,
  type SquadEntry,
  type SquadLinkReport,
} from "../../src/backend/football/sofascore-squad-link";
import { parseSquad, squadPath } from "../../supabase/functions/_shared/sofascore-catalog";
import { PRODUCTION_PROJECT_REF } from "./sofascore-id-bridge";
import {
  assertReadOnly,
  managementQuery,
  resolveIds,
  type Query,
} from "./sofascore-id-bridge-fetch";

const HOST = "sofascore.p.rapidapi.com";
const UUID_OK = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DEFAULT_MAX_REQUESTS = 40;

const POSITION: Record<string, Pos> = {
  goalkeeper: "G",
  defender: "D",
  midfielder: "M",
  forward: "F",
};
const POS_OF_SQUAD: Record<string, Pos> = {
  goalkeeper: "G",
  defender: "D",
  midfielder: "M",
  forward: "F",
};

/** Catalog clubs with an active SofaScore team mapping and a squad this season. */
export const clubsSql = (seasonId: string, showNames: boolean) => {
  if (!UUID_OK.test(seasonId)) throw new Error("squad_link_invalid: season id is not a uuid");
  return `select jsonb_agg(jsonb_build_object(
    'internalId', t.id, 'sofascoreId', m.external_id,
    'displayName', ${showNames ? "t.name" : "null"})) as data
  from app.teams t
  join app_private.football_provider_mappings m on m.provider_name = 'sofascore'
    and m.entity_type = 'team' and m.internal_entity_id = t.id and m.active
  where exists (select 1 from app.team_memberships mem
    where mem.team_id = t.id and mem.season_id = '${seasonId}' and mem.active)`;
};

/** Current-season active members of those clubs, with the state of any SofaScore mapping they have. */
export const membersSql = (seasonId: string, showNames: boolean) => {
  if (!UUID_OK.test(seasonId)) throw new Error("squad_link_invalid: season id is not a uuid");
  return `select jsonb_agg(jsonb_build_object(
    'playerId', p.id, 'teamId', mem.team_id, 'shirt', mem.shirt_number,
    'position', p.position::text,
    'mapping', case when mx.id is null then 'none' when mx.active then 'active' else 'inactive' end,
    'displayName', ${showNames ? "p.display_name" : "null"})) as data
  from app.team_memberships mem
  join app.players p on p.id = mem.player_id and p.active
  join app_private.football_provider_mappings mt on mt.provider_name = 'sofascore'
    and mt.entity_type = 'team' and mt.internal_entity_id = mem.team_id and mt.active
  left join app_private.football_provider_mappings mx on mx.provider_name = 'sofascore'
    and mx.entity_type = 'player' and mx.internal_entity_id = p.id
  where mem.season_id = '${seasonId}' and mem.active`;
};

/**
 * Every SofaScore player id that is linked already: a mapping row (active or not: either blocks an
 * insert) or a second id of a player (migration 20261014170000), which is the same player.
 */
export const mappedIdsSql = () => `select jsonb_agg(id) as data from (
  select external_id as id from app_private.football_provider_mappings
  where provider_name = 'sofascore' and entity_type = 'player'
  union
  select sofascore_player_id from app_private.sofascore_player_aliases) ids`;

type Rows = Array<Record<string, unknown>>;
const data = (rows: Rows): unknown[] => {
  const d = rows[0]?.data;
  return Array.isArray(d) ? d : [];
};
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const shirtOf = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : null);

export interface Collected {
  readonly clubs: Array<Record<string, unknown>>;
  readonly members: Array<Record<string, unknown>>;
  readonly mappedIds: string[];
}

export async function collect(
  query: Query,
  seasonId: string,
  showNames: boolean,
): Promise<Collected> {
  return {
    clubs: data(await query(clubsSql(seasonId, showNames))) as Array<Record<string, unknown>>,
    members: data(await query(membersSql(seasonId, showNames))) as Array<Record<string, unknown>>,
    mappedIds: data(await query(mappedIdsSql())).map(String),
  };
}

/** One `teams/get-squad` request per club (names only on request). */
export async function fetchSquads(
  client: Pick<RapidApiClient, "getJson" | "requestsSent">,
  clubs: readonly SquadClub[],
  opts: { readonly showNames: boolean; readonly maxRequests: number },
) {
  const entries: SquadEntry[] = [];
  const failed: string[] = [];
  for (const club of clubs) {
    if (client.requestsSent() >= opts.maxRequests)
      throw new Error(
        `squad_link_request_cap: stopped at ${opts.maxRequests} requests; raise --max-requests`,
      );
    try {
      const squad = parseSquad(await client.getJson(squadPath(club.sofascoreTeamId)));
      if (squad === null) {
        failed.push(club.sofascoreTeamId);
        continue;
      }
      for (const p of squad)
        entries.push({
          sofascoreTeamId: club.sofascoreTeamId,
          sofascorePlayerId: p.sofascoreId,
          shirt: p.shirtNumber,
          position: p.position ? (POS_OF_SQUAD[p.position] ?? null) : null,
          displayName: opts.showNames ? p.name : null,
        });
    } catch {
      failed.push(club.sofascoreTeamId); // reported; that club simply has no squad entries
    }
  }
  return { entries, failed };
}

/** Turns collected rows plus the squads into the report. Pure. */
export function analyse(args: {
  readonly collected: Collected;
  readonly squads: readonly SquadEntry[];
  readonly failedSquads: readonly string[];
  readonly showNames: boolean;
  readonly sofascoreRequests: number;
  readonly generatedAt: string;
}): SquadLinkReport {
  const clubs: SquadClub[] = args.collected.clubs.map((c) => ({
    internalTeamId: String(c.internalId),
    sofascoreTeamId: String(c.sofascoreId),
    displayName: str(c.displayName),
  }));
  const members: CatalogMember[] = args.collected.members.map((m) => ({
    playerId: String(m.playerId),
    teamId: String(m.teamId),
    shirt: shirtOf(m.shirt),
    position: typeof m.position === "string" ? (POSITION[m.position] ?? null) : null,
    mapping: m.mapping === "active" ? "active" : m.mapping === "inactive" ? "inactive" : "none",
    displayName: str(m.displayName),
  }));
  const result = classifySquads({
    clubs,
    squads: args.squads,
    members,
    mappedSofascoreIds: new Set(args.collected.mappedIds),
  });
  return buildReport({
    generatedAt: args.generatedAt,
    namesShown: args.showNames,
    existingSofascorePlayerMappings: args.collected.mappedIds.length,
    sofascoreRequests: args.sofascoreRequests,
    failedSquads: args.failedSquads,
    result,
  });
}

const arg = (name: string) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(name);

async function main() {
  const outDir = arg("--out-dir");
  if (!outDir) throw new Error("squad_link_missing_input: --out-dir is required");
  mkdirSync(outDir, { recursive: true });
  const applyOptions = { ownerAuthUserId: arg("--owner-auth-user-id") };

  let report: SquadLinkReport;
  const fromReport = arg("--from-report");
  if (fromReport) {
    report = JSON.parse(readFileSync(fromReport, "utf8")) as SquadLinkReport;
    if (report.kind !== "sofascore-squad-link")
      throw new Error("squad_link_invalid: not a squad link report");
  } else {
    const showNames = flag("--show-names");
    const key = process.env.RAPIDAPI_KEY?.trim();
    const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
    const readProduction = flag("--read-production");
    const ref = (
      readProduction
        ? process.env.SUPABASE_PRODUCTION_PROJECT_REF
        : process.env.SUPABASE_STAGING_PROJECT_REF
    )?.trim();
    if (!key || !token || !ref)
      throw new Error(
        "squad_link_missing_input: RAPIDAPI_KEY, SUPABASE_ACCESS_TOKEN and the project ref are required",
      );
    if (!/^[a-z0-9]{20}$/.test(ref) || (ref === PRODUCTION_PROJECT_REF) !== readProduction)
      throw new Error("squad_link_project_refused: the ref does not match the chosen target");
    const maxRequests = Number(arg("--max-requests") ?? DEFAULT_MAX_REQUESTS);
    if (!Number.isInteger(maxRequests) || maxRequests < 1)
      throw new Error("squad_link_invalid: --max-requests must be a positive integer");

    const rawQuery = managementQuery(ref, token);
    const query: Query = async (sql) => {
      assertReadOnly(sql); // single SELECT only
      return rawQuery(sql);
    };
    const ids = await resolveIds(query, {
      competitionId: arg("--competition-id"),
      seasonId: arg("--season-id"),
    });
    const collected = await collect(query, ids.seasonId, showNames);
    const clubs: SquadClub[] = collected.clubs.map((c) => ({
      internalTeamId: String(c.internalId),
      sofascoreTeamId: String(c.sofascoreId),
    }));
    const client = new RapidApiClient({ host: HOST, key });
    const { entries, failed } = await fetchSquads(client, clubs, { showNames, maxRequests });
    report = analyse({
      collected,
      squads: entries,
      failedSquads: failed,
      showNames,
      sofascoreRequests: client.requestsSent(),
      generatedAt: new Date().toISOString(),
    });
  }

  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
  writeFileSync(join(outDir, "report.md"), renderMarkdown(report));
  // The step summary gets a size-limited copy; the full tables are in report.md / report.json.
  writeFileSync(join(outDir, "summary.md"), renderMarkdown(report, { maxRows: 40 }));
  if (flag("--emit-sql"))
    writeFileSync(join(outDir, "apply.sql"), renderApplySql(report, applyOptions));
  console.log(
    JSON.stringify(
      { counts: report.result.counts, inputs: report.inputs, digest: report.proposalDigest },
      null,
      2,
    ),
  );
}

if (import.meta.main) await main();
