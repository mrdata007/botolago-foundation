import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  normalizeHistoricalFixture,
  HistoricalPerformanceRuntimeError,
  type HistoricalPlayerPerformanceRow,
} from "../../supabase/functions/_shared/sportsmonks-historical-player-performance";
import {
  requestSportsMonksJson,
  requireSportsMonksToken,
  SportsMonksProbeError,
} from "./sportsmonks-production-probe";

type Row = Record<string, unknown>;
export const CURRENT_PERFORMANCE_TYPES = [
  52, 57, 79, 83, 84, 85, 88, 112, 113, 118, 119, 324,
] as const;
const REQUIRED_TYPES = [52, 79, 83, 84, 85, 88, 112, 119, 324] as const;
const SEASON = 28647;
interface PerformanceRow extends Omit<HistoricalPlayerPerformanceRow, "saves" | "penaltiesSaved"> {
  readonly saves: number | null;
  readonly penaltiesSaved: number | null;
}
interface RpcClient {
  schema(name: "api"): {
    rpc(
      name: string,
      args: Row,
    ): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
  };
}
export class CurrentPerformanceError extends Error {
  constructor(
    readonly code: string,
    readonly diagnostic?: Row,
  ) {
    super(code);
  }
}
function fail(code: string, diagnostic?: Row): never {
  throw new CurrentPerformanceError(code, diagnostic);
}
function row(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid_provider_object");
  return value as Row;
}
function id(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    fail("invalid_provider_id", { field });
  return value;
}
function safeFailure(error: unknown): Row {
  if (error instanceof CurrentPerformanceError)
    return { code: error.code, ...(error.diagnostic ? { diagnostic: error.diagnostic } : {}) };
  if (error instanceof HistoricalPerformanceRuntimeError || error instanceof SportsMonksProbeError)
    return { code: error.code };
  return { code: "current_performance_ingestion_failed" };
}

export async function normalizeCurrentFinishedFixture(payload: unknown, expectedFixtureId: number) {
  const fixture = row(row(payload).data);
  if (
    id(fixture.id, "fixture.id") !== expectedFixtureId ||
    id(fixture.season_id, "fixture.season_id") !== SEASON ||
    id(fixture.league_id, "fixture.league_id") !== 860
  )
    fail("fixture_scope_mismatch");
  const state = row(fixture.state);
  if (
    id(state.id, "state.id") !== id(fixture.state_id, "fixture.state_id") ||
    !["FT", "AET", "FT_PEN"].includes(String(state.developer_name))
  )
    fail("finished_fixture_required");
  if (
    fixture.placeholder === true ||
    !Array.isArray(fixture.participants) ||
    fixture.participants.length !== 2
  )
    fail("fixture_participants_incomplete");
  const participants = fixture.participants.map(row);
  const teamIds = new Set(participants.map((team) => id(team.id, "participant.id")));
  if (
    teamIds.size !== 2 ||
    new Set(participants.map((team) => row(team.meta).location)).size !== 2 ||
    participants.some((team) => !["home", "away"].includes(String(row(team.meta).location)))
  )
    fail("fixture_participants_incomplete");
  if (
    !Array.isArray(fixture.lineups) ||
    fixture.lineups.length < 22 ||
    fixture.lineups.length > 100
  )
    fail("current_lineups_incomplete");
  // SportsMonks sometimes lists a player it has not identified: a lineup row
  // with no player_id. Last season's import accepts up to 4 such starters
  // (BG-0011 option B); this season's accepts none, so the fixture waits.
  // Say that, with the counts, rather than failing on the first missing id.
  const unidentified = fixture.lineups
    .map(row)
    .filter((lineup) => lineup.player_id === null || lineup.player_id === undefined);
  if (unidentified.length)
    fail("current_lineup_unidentified_players", {
      fixtureExternalId: String(expectedFixtureId),
      unidentifiedStarters: unidentified.filter((lineup) => lineup.type_id === 11).length,
      unidentifiedOthers: unidentified.filter((lineup) => lineup.type_id !== 11).length,
    });
  const missingTypes = new Map<number, number>();
  const optionalValues = new Map<string, { saves: number | null; penaltiesSaved: number | null }>();
  const lineupIds = new Set<number>();
  const normalizationLineups: Row[] = [];
  let detailRows = 0;
  for (const raw of fixture.lineups) {
    const lineup = row(raw);
    const lineupId = id(lineup.id, "lineup.id");
    const playerId = id(lineup.player_id, "lineup.player_id");
    const teamId = id(lineup.team_id, "lineup.team_id");
    if (
      id(lineup.fixture_id, "lineup.fixture_id") !== expectedFixtureId ||
      !teamIds.has(teamId) ||
      lineupIds.has(lineupId)
    )
      fail("lineup_identity_mismatch");
    lineupIds.add(lineupId);
    if (!Array.isArray(lineup.details)) fail("current_statistics_incomplete");
    const types = new Set<number>();
    const values = new Map<number, number>();
    const normalizationDetails: Row[] = [];
    for (const rawDetail of lineup.details) {
      detailRows += 1;
      const detail = row(rawDetail);
      const typeId = id(detail.type_id, "detail.type_id");
      if (
        id(detail.fixture_id, "detail.fixture_id") !== expectedFixtureId ||
        id(detail.lineup_id, "detail.lineup_id") !== lineupId ||
        id(detail.player_id, "detail.player_id") !== playerId ||
        id(detail.team_id, "detail.team_id") !== teamId
      )
        fail("detail_identity_mismatch");
      if (types.has(typeId)) fail("duplicate_provider_detail");
      types.add(typeId);
      const value = row(detail.data).value;
      if (value === null && [57, 113, 118].includes(typeId)) continue;
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        (typeId !== 118 && !Number.isSafeInteger(value))
      )
        fail("invalid_provider_detail");
      values.set(typeId, value);
      normalizationDetails.push(detail);
    }
    for (const typeId of REQUIRED_TYPES)
      if (!types.has(typeId)) missingTypes.set(typeId, (missingTypes.get(typeId) ?? 0) + 1);
    optionalValues.set(String(playerId), {
      saves: values.get(57) ?? null,
      penaltiesSaved: values.get(113) ?? null,
    });
    normalizationLineups.push({ ...lineup, details: normalizationDetails });
  }
  if (missingTypes.size)
    fail("current_statistics_incomplete", {
      fixtureExternalId: String(expectedFixtureId),
      missingDetailTypes: [...missingTypes]
        .sort((a, b) => a[0] - b[0])
        .map(([typeId, playerRows]) => ({ typeId, playerRows })),
    });
  const normalized = await normalizeHistoricalFixture(
    { data: { ...fixture, lineups: normalizationLineups } },
    expectedFixtureId,
    SEASON,
  );
  if (
    normalized.coverage.excludedIncompleteRows !== 0 ||
    normalized.coverage.invalidDetailRows !== 0
  )
    fail("current_lineups_incomplete");
  for (const teamId of teamIds)
    if (
      normalized.rows.filter((player) => player.externalTeamId === String(teamId) && player.started)
        .length !== 11
    )
      fail("current_starters_incomplete");
  const rows: PerformanceRow[] = normalized.rows.map((player) => ({
    ...player,
    ...optionalValues.get(player.externalPlayerId)!,
    // Type88 is goals conceded while the player was on the pitch. Type194 is
    // a team/season aggregate and is deliberately not used as player eligibility.
    cleanSheets: player.minutes >= 60 && player.goalsConceded === 0 ? 1 : 0,
  }));
  return {
    fixtureExternalId: String(expectedFixtureId),
    rows,
    coverage: {
      ...normalized.coverage,
      detailRows,
      scoringStatisticsComplete: true,
      missingStatisticRows: 0,
      cleanSheetSource: "official_minutes_and_on_pitch_goals_conceded",
      goalkeeperStatistics: "explicit_value_or_null_canonical_position_checked_in_database",
    },
  };
}

export function currentPerformanceGuard(env: Record<string, string | undefined>): {
  token: string;
  url: string;
  secret: string;
  expectedCommit: string;
} {
  const expectedCommit = env.EXPECTED_COMMIT ?? "";
  if (
    !/^[0-9a-f]{40}$/.test(expectedCommit) ||
    expectedCommit !== env.GITHUB_SHA ||
    env.GITHUB_REPOSITORY !== "mrdata007/botolago-foundation" ||
    env.GITHUB_REF !== "refs/heads/main" ||
    env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    env.GITHUB_ACTOR !== "mrdata007" ||
    env.GITHUB_RUN_ATTEMPT !== "1" ||
    env.CONFIRMATION !== "INGEST_CURRENT_FINISHED_PERFORMANCES" ||
    env.SUPABASE_PRODUCTION_PROJECT_REF !== "tkewgajrljbwgwedqsxn" ||
    env.SUPABASE_PRODUCTION_PROJECT_NAME !== "BotolaGO Production V2" ||
    env.SUPABASE_PRODUCTION_URL?.replace(/\/$/, "") !==
      "https://tkewgajrljbwgwedqsxn.supabase.co" ||
    !env.SUPABASE_SECRET_KEY
  )
    fail("current_performance_dispatch_guard_failed");
  return {
    expectedCommit,
    token: requireSportsMonksToken(env.SPORTSMONKS_API_TOKEN),
    url: env.SUPABASE_PRODUCTION_URL,
    secret: env.SUPABASE_SECRET_KEY,
  };
}

async function rpc(client: RpcClient, name: string, args: Row): Promise<unknown> {
  const result = await client.schema("api").rpc(name, args);
  if (result.error)
    fail("current_performance_rpc_failed", {
      rpcName: name,
      ...(result.error.code && /^[A-Z0-9]{5}$/.test(result.error.code)
        ? { sqlState: result.error.code }
        : {}),
    });
  return result.data;
}

export async function runCurrentPerformanceBatch(
  client: RpcClient,
  token: string,
  afterFixtureExternalId: string | null = null,
  request: typeof requestSportsMonksJson = requestSportsMonksJson,
) {
  if (afterFixtureExternalId !== null && !/^[1-9]\d{0,14}$/.test(afterFixtureExternalId))
    fail("invalid_fixture_cursor");
  const batch = row(
    await rpc(client, "football_current_performance_fixture_batch", {
      p_provider_name: "sportsmonks",
      p_season_external_id: String(SEASON),
      p_after_fixture_external_id: afterFixtureExternalId,
      p_limit: 5,
    }),
  );
  if (
    batch.seasonExternalId !== String(SEASON) ||
    !Array.isArray(batch.items) ||
    batch.items.length > 5 ||
    typeof batch.hasMore !== "boolean" ||
    (batch.hasMore &&
      (typeof batch.nextCursor !== "string" || !/^[1-9]\d{0,14}$/.test(batch.nextCursor))) ||
    (!batch.hasMore && batch.nextCursor !== null)
  )
    fail("invalid_current_fixture_batch");
  if (batch.items.length === 0) {
    if (batch.hasMore) fail("invalid_current_fixture_batch");
    return {
      verdict: "no_finished_fixtures",
      fixturesProcessed: 0,
      hasMore: false,
      nextCursor: null,
    };
  }
  const fixtures: Row[] = [];
  let previous = afterFixtureExternalId === null ? 0 : Number(afterFixtureExternalId);
  // Fetch and validate every provider item before publishing any fixture in this batch.
  const normalized = [];
  for (const raw of batch.items) {
    const item = row(raw);
    if (
      typeof item.externalFixtureId !== "string" ||
      !/^[1-9]\d{0,14}$/.test(item.externalFixtureId) ||
      Number(item.externalFixtureId) <= previous
    )
      fail("invalid_current_fixture_batch");
    previous = Number(item.externalFixtureId);
    const payload = await request(
      `/v3/football/fixtures/${item.externalFixtureId}`,
      {
        include: "lineups.details;state;participants",
        filters: `lineupDetailTypes:${CURRENT_PERFORMANCE_TYPES.join(",")}`,
      },
      token,
    );
    normalized.push(await normalizeCurrentFinishedFixture(payload, Number(item.externalFixtureId)));
  }
  if (batch.hasMore && batch.nextCursor !== String(previous)) fail("invalid_current_fixture_batch");
  const observedAt = new Date().toISOString();
  for (const fixture of normalized) {
    const result = row(
      await rpc(client, "ingest_current_player_fixture_performance", {
        p_provider_name: "sportsmonks",
        p_season_external_id: String(SEASON),
        p_fixture_external_id: fixture.fixtureExternalId,
        p_rows: fixture.rows,
        p_coverage: fixture.coverage,
        p_observed_at: observedAt,
      }),
    );
    if (
      result.active !== fixture.rows.length ||
      result.reconciled !== true ||
      result.scoringStatisticsComplete !== true ||
      typeof result.sourceVersion !== "string" ||
      !/^sportsmonks-current-fixture:[0-9a-f]{64}$/.test(result.sourceVersion)
    )
      fail("current_performance_reconciliation_failed");
    fixtures.push({
      fixtureExternalId: fixture.fixtureExternalId,
      players: result.active,
      sourceVersion: result.sourceVersion,
      coverage: fixture.coverage,
    });
  }
  return {
    verdict: "pass",
    fixturesProcessed: fixtures.length,
    fixtures,
    hasMore: batch.hasMore,
    nextCursor: batch.nextCursor,
  };
}

if (import.meta.main) {
  const config = currentPerformanceGuard(process.env);
  const evidenceDir = process.env.CURRENT_PERFORMANCE_EVIDENCE_DIR;
  if (!evidenceDir) fail("current_performance_evidence_directory_missing");
  await mkdir(evidenceDir, { recursive: true, mode: 0o700 });
  let evidence: Row;
  try {
    const client = createClient(config.url, config.secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    evidence = {
      mode: "manual_finished_fixture_ingestion",
      expectedCommit: config.expectedCommit,
      ...(await runCurrentPerformanceBatch(
        client,
        config.token,
        process.env.AFTER_FIXTURE_EXTERNAL_ID || null,
      )),
    };
  } catch (error) {
    evidence = { verdict: "fail", expectedCommit: config.expectedCommit, ...safeFailure(error) };
    process.exitCode = 1;
  }
  await writeFile(
    resolve(evidenceDir, "current-season-performances.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
    { mode: 0o600 },
  );
  console.log("CURRENT_FINISHED_PERFORMANCE_EVIDENCE_WRITTEN");
}
