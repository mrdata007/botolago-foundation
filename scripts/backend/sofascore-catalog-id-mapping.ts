/**
 * One-time SportsMonks to SofaScore mapping of the club and player catalog.
 * READ ONLY: this script sends single SELECT statements and RapidAPI GETs, and
 * writes only local files. It never writes a mapping; the optional apply script
 * it can generate is TEXT for the owner to read and run.
 *
 *   RAPIDAPI_KEY=… SUPABASE_ACCESS_TOKEN=… SUPABASE_PRODUCTION_PROJECT_REF=… \
 *     bun scripts/backend/sofascore-catalog-id-mapping.ts --read-production \
 *       --out-dir <dir> [--show-names] [--max-lineup-requests 300] \
 *       [--emit-sql] [--include-single-match] [--owner-auth-user-id <uuid>] \
 *       [--competition-id <uuid> --season-id <uuid>]
 *
 *   bun scripts/backend/sofascore-catalog-id-mapping.ts --from-report report.json \
 *       --emit-sql --out-dir <dir> [--include-single-match] [--owner-auth-user-id <uuid>]
 *
 * Nothing decides by name. `--show-names` only copies names into the report for
 * the owner to read (it adds them to the SELECTs and to the lineup rows); without
 * it names never leave the database. Doc: docs/backend/SOFASCORE_CATALOG_ID_MAPPING.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RapidApiClient } from "../../src/backend/football/provider/rapidapi-client";
import { parseSofascoreLineups } from "../../src/backend/football/provider/sofascore-adapter";
import {
  mapClubs,
  mapPlayers,
  type CatalogClub,
  type CatalogPlayer,
  type MappedFixture,
  type Pos,
  type Side,
  type SofascoreLineupEntry,
  type SportsmonksLineupEntry,
} from "../../src/backend/football/sofascore-catalog-mapping";
import {
  buildReport,
  renderApplySql,
  renderMarkdown,
  type CatalogReport,
} from "../../src/backend/football/sofascore-catalog-mapping-output";
import { PRODUCTION_PROJECT_REF } from "./sofascore-id-bridge";
import {
  assertReadOnly,
  fetchAllEvents,
  managementQuery,
  resolveIds,
  type Query,
} from "./sofascore-id-bridge-fetch";

const HOST = "sofascore.p.rapidapi.com";
const UUID_OK = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DEFAULT_MAX_LINEUP_REQUESTS = 300;

const POSITION: Record<string, Pos> = {
  goalkeeper: "G",
  defender: "D",
  midfielder: "M",
  forward: "F",
};

/** The fixtures mapped on both providers, finished, with the SportsMonks team ids of each side. */
export const fixturesSql = (seasonId: string) => {
  if (!UUID_OK.test(seasonId)) throw new Error("catalog_mapping_invalid: season id is not a uuid");
  return `select jsonb_agg(jsonb_build_object(
    'fixtureId', f.id, 'sofascoreEventId', mf.external_id,
    'homeTeamId', f.home_team_id, 'awayTeamId', f.away_team_id,
    'smHomeTeamId', th.external_id, 'smAwayTeamId', ta.external_id)) as data
  from app.fixtures f
  join app_private.football_provider_mappings ms on ms.provider_name = 'sportsmonks'
    and ms.entity_type = 'fixture' and ms.internal_entity_id = f.id and ms.active
  join app_private.football_provider_mappings mf on mf.provider_name = 'sofascore'
    and mf.entity_type = 'fixture' and mf.internal_entity_id = f.id and mf.active
  left join app_private.football_provider_mappings th on th.provider_name = 'sportsmonks'
    and th.entity_type = 'team' and th.internal_entity_id = f.home_team_id and th.active
  left join app_private.football_provider_mappings ta on ta.provider_name = 'sportsmonks'
    and ta.entity_type = 'team' and ta.internal_entity_id = f.away_team_id and ta.active
  where f.season_id = '${seasonId}' and f.status = 'finished'`;
};

/** The SportsMonks lineups stored for those fixtures (app.lineups, app.lineup_players). */
export const smLineupsSql = (seasonId: string) => {
  if (!UUID_OK.test(seasonId)) throw new Error("catalog_mapping_invalid: season id is not a uuid");
  return `select jsonb_agg(jsonb_build_object(
    'fixtureId', l.fixture_id, 'teamId', l.team_id, 'playerId', lp.player_id,
    'shirt', lp.shirt_number, 'position', coalesce(lp.position, pl.position)::text)) as data
  from app.lineups l
  join app.lineup_players lp on lp.lineup_id = l.id
  join app.players pl on pl.id = lp.player_id
  join app.fixtures f on f.id = l.fixture_id
  where f.season_id = '${seasonId}' and f.status = 'finished'
    and exists (select 1 from app_private.football_provider_mappings mf
      where mf.provider_name = 'sofascore' and mf.entity_type = 'fixture'
        and mf.internal_entity_id = f.id and mf.active)`;
};

/** Catalog clubs: every team with an active SportsMonks mapping. Name only on request. */
export const clubsSql = (showNames: boolean) => `select jsonb_agg(jsonb_build_object(
    'internalId', t.id, 'sportsmonksId', ms.external_id,
    'sofascoreId', mx.external_id, 'sofascoreActive', mx.active,
    'displayName', ${showNames ? "t.name" : "null"})) as data
  from app.teams t
  join app_private.football_provider_mappings ms on ms.provider_name = 'sportsmonks'
    and ms.entity_type = 'team' and ms.internal_entity_id = t.id and ms.active
  left join app_private.football_provider_mappings mx on mx.provider_name = 'sofascore'
    and mx.entity_type = 'team' and mx.internal_entity_id = t.id`;

export const playersSql = (showNames: boolean) => `select jsonb_agg(jsonb_build_object(
    'internalId', p.id, 'sportsmonksId', ms.external_id,
    'sofascoreId', mx.external_id, 'sofascoreActive', mx.active,
    'displayName', ${showNames ? "p.display_name" : "null"})) as data
  from app.players p
  join app_private.football_provider_mappings ms on ms.provider_name = 'sportsmonks'
    and ms.entity_type = 'player' and ms.internal_entity_id = p.id and ms.active
  left join app_private.football_provider_mappings mx on mx.provider_name = 'sofascore'
    and mx.entity_type = 'player' and mx.internal_entity_id = p.id`;

/** Every SofaScore team and player mapping row, active or not (unique keys ignore active). */
export const existingSql = () => `select jsonb_agg(jsonb_build_object(
    'entityType', entity_type::text, 'externalId', external_id,
    'internalId', internal_entity_id, 'active', active)) as data
  from app_private.football_provider_mappings
  where provider_name = 'sofascore' and entity_type in ('team', 'player')`;

type Rows = Array<Record<string, unknown>>;
const data = (rows: Rows): Array<Record<string, unknown>> => {
  const d = rows[0]?.data;
  return Array.isArray(d) ? (d as Array<Record<string, unknown>>) : [];
};
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const posOf = (v: unknown): Pos | null => (typeof v === "string" ? (POSITION[v] ?? null) : null);

export interface Collected {
  readonly fixtures: Array<Record<string, unknown>>;
  readonly smLineups: Array<Record<string, unknown>>;
  readonly clubs: Array<Record<string, unknown>>;
  readonly players: Array<Record<string, unknown>>;
  readonly existing: Array<Record<string, unknown>>;
}

export async function collect(
  query: Query,
  seasonId: string,
  showNames: boolean,
): Promise<Collected> {
  return {
    fixtures: data(await query(fixturesSql(seasonId))),
    smLineups: data(await query(smLineupsSql(seasonId))),
    clubs: data(await query(clubsSql(showNames))),
    players: data(await query(playersSql(showNames))),
    existing: data(await query(existingSql())),
  };
}

export interface EventSides {
  readonly homeTeamId: number;
  readonly awayTeamId: number;
}

/** Turns collected rows plus SofaScore lineups into the report. Pure. */
export function analyse(args: {
  readonly collected: Collected;
  readonly events: ReadonlyMap<string, EventSides>;
  readonly sofaLineups: ReadonlyMap<string, readonly Omit<SofascoreLineupEntry, "fixtureId">[]>;
  readonly showNames: boolean;
  readonly sofascoreRequests: number;
  readonly generatedAt: string;
}): CatalogReport {
  const { collected, events, sofaLineups } = args;

  const fixtures: MappedFixture[] = [];
  const homeOf = new Map<string, string>();
  const eventOfFixture = new Map<string, string>();
  for (const f of collected.fixtures) {
    const event = events.get(String(f.sofascoreEventId));
    if (!event) continue; // the event list does not hold it: no club evidence from this fixture
    const fixtureId = String(f.fixtureId);
    fixtures.push({
      fixtureId,
      smHomeTeamId: str(f.smHomeTeamId),
      smAwayTeamId: str(f.smAwayTeamId),
      sofaHomeTeamId: String(event.homeTeamId),
      sofaAwayTeamId: String(event.awayTeamId),
    });
    homeOf.set(fixtureId, String(f.homeTeamId));
    eventOfFixture.set(fixtureId, String(f.sofascoreEventId));
  }

  const existingSofaPlayers = new Map<string, string>();
  let existingTeamRows = 0;
  let existingPlayerRows = 0;
  for (const e of collected.existing) {
    if (e.entityType === "team") existingTeamRows += 1;
    if (e.entityType === "player") {
      existingPlayerRows += 1;
      existingSofaPlayers.set(String(e.externalId), String(e.internalId));
    }
  }

  // An inactive row still blocks an insert, so it is carried as an id no proposal can equal.
  const existingId = (id: unknown, active: unknown) =>
    id === null || id === undefined
      ? null
      : active === true
        ? String(id)
        : `inactive:${String(id)}`;
  const clubs: CatalogClub[] = collected.clubs.map((c) => ({
    internalId: String(c.internalId),
    sportsmonksId: str(c.sportsmonksId),
    existingSofascoreId: existingId(c.sofascoreId, c.sofascoreActive),
    displayName: str(c.displayName),
  }));
  const clubResult = mapClubs(clubs, fixtures);

  const smLineups: SportsmonksLineupEntry[] = [];
  const withSofa = new Set<string>();
  const sofaEntries: SofascoreLineupEntry[] = [];
  for (const [fixtureId, eventId] of eventOfFixture) {
    const rows = sofaLineups.get(eventId);
    if (!rows) continue;
    withSofa.add(fixtureId);
    for (const r of rows) sofaEntries.push({ ...r, fixtureId });
  }
  const smSeen = new Set<string>();
  for (const l of collected.smLineups) {
    const fixtureId = String(l.fixtureId);
    if (!withSofa.has(fixtureId)) continue;
    const side: Side = String(l.teamId) === homeOf.get(fixtureId) ? "home" : "away";
    smSeen.add(fixtureId);
    smLineups.push({
      fixtureId,
      side,
      internalTeamId: String(l.teamId),
      internalPlayerId: String(l.playerId),
      shirt: typeof l.shirt === "number" ? l.shirt : null,
      position: posOf(l.position),
    });
  }

  const players: CatalogPlayer[] = collected.players.map((p) => ({
    internalId: String(p.internalId),
    sportsmonksId: str(p.sportsmonksId),
    existingSofascoreId: existingId(p.sofascoreId, p.sofascoreActive),
    displayName: str(p.displayName),
  }));
  const playerResult = mapPlayers({
    players,
    fixtures,
    smLineups,
    sofaLineups: sofaEntries,
    resolvedClubs: clubResult.resolved,
    existingSofaOwners: existingSofaPlayers,
  });

  return buildReport({
    generatedAt: args.generatedAt,
    namesShown: args.showNames,
    inputs: {
      fixturesMappedOnBothProviders: fixtures.length,
      fixturesWithBothLineups: smSeen.size,
      catalogClubs: clubs.length,
      catalogPlayers: players.length,
      existingSofascoreClubMappings: existingTeamRows,
      existingSofascorePlayerMappings: existingPlayerRows,
      sofascoreRequests: args.sofascoreRequests,
    },
    clubs: clubResult,
    players: playerResult,
  });
}

/** One matches/get-lineups request per fixture; ids, shirts and positions (names only on request). */
export async function fetchSofaLineups(
  client: Pick<RapidApiClient, "getJson" | "requestsSent">,
  eventIds: readonly string[],
  opts: { readonly showNames: boolean; readonly maxRequests: number },
) {
  const out = new Map<string, Omit<SofascoreLineupEntry, "fixtureId">[]>();
  const failed: string[] = [];
  for (const id of eventIds) {
    if (client.requestsSent() >= opts.maxRequests)
      throw new Error(
        `catalog_mapping_request_cap: stopped at ${opts.maxRequests} requests; raise --max-lineup-requests`,
      );
    try {
      const lineups = parseSofascoreLineups(
        await client.getJson(`matches/get-lineups?matchId=${id}`),
      );
      out.set(
        id,
        lineups.players.map((p) => ({
          side: p.side,
          sofascorePlayerId: p.externalId,
          shirt: p.shirtNumber,
          position: p.position,
          displayName: opts.showNames ? p.name : null,
        })),
      );
    } catch {
      failed.push(id); // reported by count; the fixture simply gives no evidence
    }
  }
  return { lineups: out, failed };
}

const arg = (name: string) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(name);

async function main() {
  const outDir = arg("--out-dir");
  if (!outDir) throw new Error("catalog_mapping_missing_input: --out-dir is required");
  mkdirSync(outDir, { recursive: true });
  const opts = {
    includeSingleMatch: flag("--include-single-match"),
    ownerAuthUserId: arg("--owner-auth-user-id"),
  };

  let report: CatalogReport;
  const fromReport = arg("--from-report");
  if (fromReport) {
    report = JSON.parse(readFileSync(fromReport, "utf8")) as CatalogReport;
    if (report.kind !== "sofascore-catalog-id-mapping")
      throw new Error("catalog_mapping_invalid: not a catalog mapping report");
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
        "catalog_mapping_missing_input: RAPIDAPI_KEY, SUPABASE_ACCESS_TOKEN and the project ref are required",
      );
    if (!/^[a-z0-9]{20}$/.test(ref) || (ref === PRODUCTION_PROJECT_REF) !== readProduction)
      throw new Error("catalog_mapping_project_refused: the ref does not match the chosen target");
    const maxRequests = Number(arg("--max-lineup-requests") ?? DEFAULT_MAX_LINEUP_REQUESTS);
    if (!Number.isInteger(maxRequests) || maxRequests < 1)
      throw new Error("catalog_mapping_invalid: --max-lineup-requests must be a positive integer");

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

    const client = new RapidApiClient({ host: HOST, key });
    const { events } = await fetchAllEvents(client);
    const bySofaId = new Map<string, EventSides>(
      events.map((e) => [String(e.id), { homeTeamId: e.homeTeam.id, awayTeamId: e.awayTeam.id }]),
    );
    const wanted = [
      ...new Set(
        collected.fixtures.map((f) => String(f.sofascoreEventId)).filter((id) => bySofaId.has(id)),
      ),
    ];
    const { lineups, failed } = await fetchSofaLineups(client, wanted, { showNames, maxRequests });
    report = analyse({
      collected,
      events: bySofaId,
      sofaLineups: lineups,
      showNames,
      sofascoreRequests: client.requestsSent(),
      generatedAt: new Date().toISOString(),
    });
    console.log(
      JSON.stringify({ lineupFetchFailures: failed.length, failedEventIds: failed.slice(0, 50) }),
    );
  }

  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
  writeFileSync(join(outDir, "report.md"), renderMarkdown(report));
  // The step summary gets a size-limited copy; the full tables are in report.md / report.json.
  writeFileSync(join(outDir, "summary.md"), renderMarkdown(report, { maxRows: 60 }));
  if (flag("--emit-sql")) writeFileSync(join(outDir, "apply.sql"), renderApplySql(report, opts));
  console.log(
    JSON.stringify(
      { summary: report.summary, inputs: report.inputs, digest: report.proposalDigest },
      null,
      2,
    ),
  );
}

if (import.meta.main) await main();
