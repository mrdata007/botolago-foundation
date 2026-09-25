import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  MAX_ANONYMOUS_STARTER_ROWS,
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
// SportsMonks sends a statistic only when it is not zero: on 2026-09-24's
// first match (fixture 19874708) only the 3 scorers carried goals and only the
// players who came on carried minutes, and last season's accepted fixtures
// average about 2 statistic rows per player out of 13. So an absent statistic
// counts as zero (owner delegated the decision, 2026-09-25), with checks that
// absence cannot hide: every starter carries minutes played, and a substitute
// without minutes never scored, assisted, missed a penalty or put through an
// own goal (none did in last season's 238 matches; a late substitute can
// carry goals conceded without minutes, as 23 did).
//
// Goals conceded, which decide clean sheets, follow the final score instead:
// SportsMonks' own figure is not reliable (last season 40 of the 327
// goalkeepers who played a whole match for a side that conceded carried
// fewer). A starter with 90 minutes conceded what the side did; anyone else
// keeps SportsMonks' figure, since only it knows when they were on the pitch,
// capped at the side's. A substitute can reach 90 after an early goal (16 did
// last season). The one case this counts against a player is a starter
// substituted in stoppage time just before a stoppage-time goal (at most 11 of
// 2,243 last season). The database checks the same against its own final
// score (20260925120000).
const COUNTED_TYPES = [52, 79, 83, 84, 85, 88, 112, 119, 324] as const;
const MINUTES = 119;
/** Goals, assists, penalties missed, own goals: never without minutes played. */
const ON_PITCH_TYPES = [52, 79, 112, 324] as const;
/** SportsMonks stops counting at 90: a starter with 90 minutes was on from kick-off to the 90th. */
const WHOLE_MATCH_MINUTES = 90;
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
  // Each side's final score, read as the fixtures sync reads it for the
  // database: the one CURRENT score of each location.
  const scores = Array.isArray(fixture.scores) ? fixture.scores.map(row) : [];
  const goalsFor = new Map<number, number>();
  for (const team of participants) {
    const location = String(row(team.meta).location);
    const current = scores.filter(
      (score) =>
        String(score.description).toUpperCase() === "CURRENT" &&
        String(row(score.score).participant).toLowerCase() === location,
    );
    const goals = current.length === 1 ? row(current[0]!.score).goals : undefined;
    if (typeof goals !== "number" || !Number.isSafeInteger(goals) || goals < 0)
      fail("current_final_score_missing", { fixtureExternalId: String(expectedFixtureId) });
    goalsFor.set(id(team.id, "participant.id"), goals);
  }
  const totalGoals = [...goalsFor.values()].reduce((sum, goals) => sum + goals, 0);
  if (
    !Array.isArray(fixture.lineups) ||
    fixture.lineups.length < 22 ||
    fixture.lineups.length > 100
  )
    fail("current_lineups_incomplete");
  // SportsMonks sometimes lists a player it has not identified: a lineup row
  // with no player_id. Owner decision 2026-09-25: this season follows last
  // season's rule (BG-0011 option B). Up to 4 of the 22 starters may be
  // unnamed; unnamed rows are skipped, never credited to anyone, and every
  // named player is scored as usual. More than 4 and the fixture waits.
  const isUnidentified = (lineup: Row) =>
    lineup.player_id === null || lineup.player_id === undefined;
  const unidentified = fixture.lineups.map(row).filter(isUnidentified);
  const unidentifiedStarters = unidentified.filter((lineup) => lineup.type_id === 11);
  if (unidentifiedStarters.length > MAX_ANONYMOUS_STARTER_ROWS)
    fail("current_lineup_unidentified_starters_exceeded", {
      fixtureExternalId: String(expectedFixtureId),
      unidentifiedStarters: unidentifiedStarters.length,
      unidentifiedOthers: unidentified.length - unidentifiedStarters.length,
    });
  const optionalValues = new Map<string, { saves: number | null; penaltiesSaved: number | null }>();
  const lineupIds = new Set<number>();
  const normalizationLineups: Row[] = [];
  let detailRows = 0;
  let absentAsZero = 0;
  let startersWithoutMinutes = 0;
  let benchOnPitchWithoutMinutes = 0;
  for (const raw of fixture.lineups) {
    const lineup = row(raw);
    if (isUnidentified(lineup)) {
      // Passed on as a bare row so the shared normalizer counts it (as
      // excluded, and as an unnamed starter when type_id is 11); it carries
      // no statistics to anyone.
      normalizationLineups.push({
        type_id: lineup.type_id,
        team_id: lineup.team_id,
        player_id: null,
      });
      continue;
    }
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
    // A substitute who never came on may come with no statistics at all.
    const details = lineup.details === undefined || lineup.details === null ? [] : lineup.details;
    if (!Array.isArray(details)) fail("current_statistics_incomplete");
    const types = new Set<number>();
    const values = new Map<number, number>();
    const normalizationDetails: Row[] = [];
    for (const rawDetail of details) {
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
    // Minutes played decide, whether SportsMonks left them out or sent 0.
    if (!((values.get(MINUTES) ?? 0) > 0)) {
      if (lineup.type_id === 11) startersWithoutMinutes += 1;
      else if (ON_PITCH_TYPES.some((typeId) => (values.get(typeId) ?? 0) > 0))
        benchOnPitchWithoutMinutes += 1;
    }
    absentAsZero += COUNTED_TYPES.filter((typeId) => !types.has(typeId)).length;
    // Absent is zero; an explicit null stays unknown (and the database refuses
    // an unknown goalkeeper statistic).
    optionalValues.set(String(playerId), {
      saves: types.has(57) ? (values.get(57) ?? null) : 0,
      penaltiesSaved: types.has(113) ? (values.get(113) ?? null) : 0,
    });
    normalizationLineups.push({ ...lineup, details: normalizationDetails });
  }
  if (startersWithoutMinutes)
    fail("current_starter_minutes_missing", {
      fixtureExternalId: String(expectedFixtureId),
      starterRows: startersWithoutMinutes,
    });
  if (benchOnPitchWithoutMinutes)
    fail("current_statistics_inconsistent", {
      fixtureExternalId: String(expectedFixtureId),
      substituteRowsWithoutMinutes: benchOnPitchWithoutMinutes,
    });
  const normalized = await normalizeHistoricalFixture(
    { data: { ...fixture, lineups: normalizationLineups } },
    expectedFixtureId,
    SEASON,
  );
  // Only the unnamed rows may be left out, and the shared normalizer must
  // have seen exactly the unnamed starters counted above.
  if (
    normalized.coverage.excludedIncompleteRows !== unidentified.length ||
    normalized.coverage.anonymousStarterRows !== unidentifiedStarters.length ||
    normalized.coverage.invalidDetailRows !== 0
  )
    fail("current_lineups_incomplete");
  // Each club fields 11 starters: its named ones plus its unnamed ones. An
  // unnamed starter whose club is not given could belong to either side.
  const unplaced = unidentifiedStarters.filter(
    (lineup) => !teamIds.has(lineup.team_id as number),
  ).length;
  for (const teamId of teamIds) {
    const unnamed = unidentifiedStarters.filter((lineup) => lineup.team_id === teamId).length;
    const named = normalized.rows.filter(
      (player) => player.externalTeamId === String(teamId) && player.started,
    ).length;
    if (named > 11 - unnamed || named < 11 - unnamed - unplaced)
      fail("current_starters_incomplete");
  }
  let goalsConcededFromFinalScore = 0;
  const rows: PerformanceRow[] = normalized.rows.map((player) => {
    // Type88 is goals conceded while the player was on the pitch, when
    // SportsMonks has it; the final score bounds it and decides it for a
    // starter with 90 minutes. Type194 is a team/season aggregate and is
    // deliberately not used as player eligibility.
    const conceded = totalGoals - goalsFor.get(Number(player.externalTeamId))!;
    const goalsConceded =
      player.started && player.minutes >= WHOLE_MATCH_MINUTES
        ? conceded
        : Math.min(player.goalsConceded, conceded);
    if (goalsConceded !== player.goalsConceded) goalsConcededFromFinalScore += 1;
    return {
      ...player,
      ...optionalValues.get(player.externalPlayerId)!,
      goalsConceded,
      cleanSheets: player.minutes >= 60 && goalsConceded === 0 ? 1 : 0,
    };
  });
  return {
    fixtureExternalId: String(expectedFixtureId),
    rows,
    coverage: {
      ...normalized.coverage,
      detailRows,
      scoringStatisticsComplete: true,
      // None is missing once an absent statistic counts as zero; how many did
      // is kept for the record.
      missingStatisticRows: 0,
      absentStatisticsCountedAsZero: absentAsZero,
      goalsConcededFromFinalScore,
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
      // The database's own refusal codes (CURRENT_GOALS_CONCEDED_INCOMPLETE,
      // PLAYER_MAPPING_NOT_FOUND, ...) say why; nothing else is kept.
      ...(result.error.message && /^[A-Z][A-Z_]{2,39}$/.test(result.error.message)
        ? { reason: result.error.message }
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
        include: "lineups.details;state;participants;scores",
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
