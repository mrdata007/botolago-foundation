/**
 * Collects the two inputs of the SofaScore ID bridge. READ ONLY.
 *
 *   RAPIDAPI_KEY=… SUPABASE_ACCESS_TOKEN=… SUPABASE_STAGING_PROJECT_REF=… \
 *     bun scripts/backend/sofascore-id-bridge-fetch.ts --out-dir <dir> \
 *       [--competition-id <uuid> --season-id <uuid>]
 *
 * - Events: every page of tournaments/get-last-matches and get-next-matches for
 *   tournament 937, season 102220 (RapidAPI, header-only key), de-duplicated by
 *   event id and reduced to the fields the bridge reads.
 * - Snapshot: one SELECT on staging through the Supabase Management API
 *   (fixtures, rounds, existing sofascore mappings of the season). With no
 *   ids given, the season is the one labelled 2026/27 of a `botola-pro*`
 *   competition; anything but exactly one match stops the run.
 *
 * Writes `events.json`, `snapshot.json` and `ids.json` into --out-dir. Prints
 * counts and ids only. Refuses the production project.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RapidApiClient } from "../../src/backend/football/provider/rapidapi-client";
import type { SofascoreEvent } from "../../src/backend/football/sofascore-id-bridge";
import {
  PRODUCTION_PROJECT_REF,
  SOFASCORE_COMPETITION_ID,
  SOFASCORE_SEASON_ID,
} from "./sofascore-id-bridge";

const HOST = "sofascore.p.rapidapi.com";
const MAX_PAGES = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Query = (sql: string) => Promise<Array<Record<string, unknown>>>;

export function eventListPath(endpoint: "get-last-matches" | "get-next-matches", page: number) {
  return `tournaments/${endpoint}?tournamentId=${SOFASCORE_COMPETITION_ID}&seasonId=${SOFASCORE_SEASON_ID}&pageIndex=${page}`;
}

/** Keeps the fields the bridge reads; drops events of another tournament or season. */
export function reduceEvents(raw: unknown): { events: SofascoreEvent[]; hasNextPage: boolean } {
  const page = raw as { events?: unknown; hasNextPage?: unknown };
  if (!Array.isArray(page?.events))
    throw new Error("sofascore_fetch_invalid: expected an events array");
  const events: SofascoreEvent[] = [];
  for (const item of page.events) {
    const e = item as {
      id?: number;
      startTimestamp?: number;
      roundInfo?: { round?: number };
      status?: { type?: string };
      homeTeam?: { id?: number };
      awayTeam?: { id?: number };
      tournament?: { uniqueTournament?: { id?: number } };
      season?: { id?: number };
    };
    if (
      e.tournament?.uniqueTournament?.id !== undefined &&
      String(e.tournament.uniqueTournament.id) !== SOFASCORE_COMPETITION_ID
    )
      continue;
    if (e.season?.id !== undefined && String(e.season.id) !== SOFASCORE_SEASON_ID) continue;
    if (
      !Number.isInteger(e.id) ||
      !Number.isInteger(e.startTimestamp) ||
      typeof e.status?.type !== "string" ||
      !Number.isInteger(e.homeTeam?.id) ||
      !Number.isInteger(e.awayTeam?.id)
    )
      throw new Error("sofascore_fetch_invalid: an event is malformed");
    events.push({
      id: e.id!,
      startTimestamp: e.startTimestamp!,
      roundInfo: { round: e.roundInfo?.round ?? null },
      status: { type: e.status.type },
      homeTeam: { id: e.homeTeam!.id! },
      awayTeam: { id: e.awayTeam!.id! },
    });
  }
  return { events, hasNextPage: page.hasNextPage === true };
}

export async function fetchAllEvents(client: Pick<RapidApiClient, "getJson">) {
  const byId = new Map<number, SofascoreEvent>();
  const pages: Record<string, number> = {};
  for (const endpoint of ["get-last-matches", "get-next-matches"] as const) {
    let page = 0;
    for (; page < MAX_PAGES; page += 1) {
      const { events, hasNextPage } = reduceEvents(
        await client.getJson(eventListPath(endpoint, page)),
      );
      for (const e of events) byId.set(e.id, e);
      if (!hasNextPage) break;
    }
    if (page >= MAX_PAGES) throw new Error(`sofascore_fetch_too_many_pages: ${endpoint}`);
    pages[endpoint] = page + 1;
  }
  return { events: [...byId.values()], pages };
}

const RESOLVE_SQL = `select s.id as season_id, c.id as competition_id
from app.seasons s join app.competitions c on c.id = s.competition_id
where c.slug like 'botola-pro%' and s.label in ('2026/27', '2026-27', '2026/2027')`;

export const snapshotSql = (seasonId: string) => {
  if (!UUID.test(seasonId)) throw new Error("sofascore_fetch_invalid: season id is not a uuid");
  return `select jsonb_build_object(
  'fixtures', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'kickoffAt', f.kickoff_at, 'roundNumber', r.round_number,
      'homeTeamId', f.home_team_id, 'awayTeamId', f.away_team_id)), '[]'::jsonb)
    from app.fixtures f left join app.rounds r on r.id = f.round_id
    where f.season_id = '${seasonId}'),
  'rounds', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'roundNumber', round_number)), '[]'::jsonb)
    from app.rounds where season_id = '${seasonId}' and round_number is not null),
  'existing', (select coalesce(jsonb_agg(jsonb_build_object(
      'entityType', entity_type, 'externalId', external_id,
      'internalId', internal_entity_id)), '[]'::jsonb)
    from app_private.football_provider_mappings
    where provider_name = 'sofascore' and active
      and entity_type in ('competition','season','round','team','fixture'))
) as snapshot`;
};

export function managementQuery(ref: string, token: string): Query {
  return async (sql) => {
    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
    if (!response.ok) throw new Error(`sofascore_fetch_management_${response.status}`);
    return (await response.json()) as Array<Record<string, unknown>>;
  };
}

export async function resolveIds(
  query: Query,
  given: { competitionId?: string; seasonId?: string },
): Promise<{ competitionId: string; seasonId: string }> {
  if (given.competitionId && given.seasonId) {
    if (!UUID.test(given.competitionId) || !UUID.test(given.seasonId))
      throw new Error("sofascore_fetch_invalid: ids must be uuids");
    return { competitionId: given.competitionId, seasonId: given.seasonId };
  }
  const rows = await query(RESOLVE_SQL);
  if (rows.length !== 1)
    throw new Error(
      `sofascore_fetch_season_not_unique: ${rows.length} Botola 2026/27 seasons found; pass --competition-id and --season-id`,
    );
  return { competitionId: String(rows[0].competition_id), seasonId: String(rows[0].season_id) };
}

const arg = (name: string) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};

async function main() {
  const outDir = arg("--out-dir");
  const key = process.env.RAPIDAPI_KEY?.trim();
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const ref = process.env.SUPABASE_STAGING_PROJECT_REF?.trim();
  if (!outDir || !key || !token || !ref)
    throw new Error(
      "sofascore_fetch_missing_input: --out-dir, RAPIDAPI_KEY, SUPABASE_ACCESS_TOKEN and SUPABASE_STAGING_PROJECT_REF are required",
    );
  if (ref === PRODUCTION_PROJECT_REF || !/^[a-z0-9]{20}$/.test(ref))
    throw new Error("sofascore_fetch_project_refused: staging only");

  const query = managementQuery(ref, token);
  const ids = await resolveIds(query, {
    competitionId: arg("--competition-id"),
    seasonId: arg("--season-id"),
  });
  const rows = await query(snapshotSql(ids.seasonId));
  const snapshot = rows[0]?.snapshot as
    | { fixtures: unknown[]; rounds: unknown[]; existing: unknown[] }
    | undefined;
  if (!snapshot || !Array.isArray(snapshot.fixtures))
    throw new Error("sofascore_fetch_snapshot_invalid");

  const client = new RapidApiClient({ host: HOST, key });
  const { events, pages } = await fetchAllEvents(client);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "events.json"), JSON.stringify(events));
  writeFileSync(join(outDir, "snapshot.json"), JSON.stringify(snapshot));
  writeFileSync(join(outDir, "ids.json"), JSON.stringify(ids));
  console.log(
    JSON.stringify(
      {
        competitionId: ids.competitionId,
        seasonId: ids.seasonId,
        events: events.length,
        pages,
        rapidApiRequests: client.requestsSent(),
        rapidApiQuota: client.quota(),
        snapshot: {
          fixtures: snapshot.fixtures.length,
          rounds: snapshot.rounds.length,
          existingSofascoreMappings: snapshot.existing.length,
        },
      },
      null,
      2,
    ),
  );
}

if (import.meta.main) await main();
