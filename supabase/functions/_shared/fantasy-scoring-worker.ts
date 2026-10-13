export interface FantasyScoringRpcResult {
  readonly data: unknown;
  readonly error: { readonly code?: string; readonly message?: string } | null;
}

export interface FantasyScoringRpcClient {
  schema(name: "api"): {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<FantasyScoringRpcResult>;
  };
}

export interface FantasyScoringWorkerDependencies {
  readonly client: FantasyScoringRpcClient;
  readonly expectedTriggerSecret: string;
  readonly maxPagesPerPhase?: number;
}

type JsonRecord = Record<string, unknown>;

export interface CanonicalPointEvent {
  readonly category: string;
  readonly points: number;
}

export interface CanonicalFixturePlayer {
  readonly fantasyPlayerId: string;
  readonly footballTeamId: string;
  readonly started: boolean;
  readonly didPlay: boolean;
  readonly minutesPlayed: number;
  readonly events: readonly CanonicalPointEvent[];
}

export interface CanonicalFixtureSnapshot {
  readonly fixtureId: string;
  readonly footballInputVersion: number;
  readonly players: readonly CanonicalFixturePlayer[];
}

export interface CanonicalScoringManifest {
  readonly schemaVersion: 1;
  readonly seasonId: string;
  readonly gameweekId: string;
  readonly calculationVersion: number;
  readonly fixtures: readonly CanonicalFixtureSnapshot[];
  readonly leagueIds: readonly string[];
}

interface ParsedRequest {
  readonly mode: "validate" | "execute";
  readonly manifest: CanonicalScoringManifest;
  readonly expectedManifestDigest: string;
  readonly confirmation: string | null;
}

interface PhaseResult {
  readonly pages: number;
  readonly processed: number;
}

interface ExecutionSummary {
  readonly alreadyComplete: boolean;
  readonly fixtureSnapshots: number;
  readonly playerFinalization: PhaseResult;
  readonly teamMaterialization: PhaseResult;
  readonly teamFinalization: PhaseResult;
  readonly freeHitRestoration: PhaseResult;
  readonly transferRollover: PhaseResult;
  readonly rankingScopes: number;
  readonly rankingRows: number;
  readonly jobRunId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const CATEGORY = /^[a-z][a-z0-9_]{2,79}$/;
const LAUNCH_SCORING_CATEGORIES = new Set([
  "appearance",
  "goal",
  "assist",
  "clean_sheet",
  "goals_conceded",
  "saves",
  "penalty_save",
  "penalty_miss",
  "yellow_card",
  "red_card",
  "second_yellow_dismissal",
  "own_goal",
]);
const SCORING_GAMEWEEK_STATUSES = new Set([
  "locked",
  "live",
  "provisional",
  "finalizing",
  "finalized",
]);
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_PAGES = 50;

class WorkerError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly stage: string,
  ) {
    super(code);
    this.name = "WorkerError";
  }
}

class RpcError extends WorkerError {
  constructor(
    readonly rpcName: string,
    readonly databaseCode: string | null,
    readonly databaseMessage: string | null,
    stage: string,
  ) {
    super(`rpc_${rpcName}_failed`, rpcStatus(databaseCode), stage);
    this.name = "RpcError";
  }
}

function rpcStatus(code: string | null): number {
  if (code === "PT400") return 400;
  if (code === "PT403") return 403;
  if (code === "PT404") return 404;
  if (code === "PT409") return 409;
  return 502;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, code = "invalid_request"): JsonRecord {
  if (!isRecord(value)) throw new WorkerError(code, 400, "validation");
  return value;
}

function exactKeys(value: JsonRecord, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new WorkerError("invalid_manifest", 400, "validation");
  }
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new WorkerError("invalid_manifest", 400, "validation");
  }
  return value;
}

function integer(value: unknown, minimum: number, maximum: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new WorkerError("invalid_manifest", 400, "validation");
  }
  return value;
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new WorkerError("invalid_manifest", 400, "validation");
  }
  return value;
}

function requireStrictOrder(values: readonly string[]): void {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1] >= values[index]) {
      throw new WorkerError("manifest_not_canonical", 400, "validation");
    }
  }
}

function parseEvent(value: unknown): CanonicalPointEvent {
  const source = record(value, "invalid_manifest");
  exactKeys(source, ["category", "points"]);
  if (
    typeof source.category !== "string" ||
    !CATEGORY.test(source.category) ||
    !LAUNCH_SCORING_CATEGORIES.has(source.category)
  ) {
    throw new WorkerError("invalid_manifest", 400, "validation");
  }
  const points = integer(source.points, -100, 100);
  if (points === 0) throw new WorkerError("invalid_manifest", 400, "validation");
  return {
    category: source.category,
    points,
  };
}

function parsePlayer(value: unknown): CanonicalFixturePlayer {
  const source = record(value, "invalid_manifest");
  exactKeys(source, [
    "fantasyPlayerId",
    "footballTeamId",
    "started",
    "didPlay",
    "minutesPlayed",
    "events",
  ]);
  if (!Array.isArray(source.events) || source.events.length > 32) {
    throw new WorkerError("invalid_manifest", 400, "validation");
  }
  const events = source.events.map(parseEvent);
  requireStrictOrder(events.map((event) => event.category));
  const didPlay = boolean(source.didPlay);
  const minutesPlayed = integer(source.minutesPlayed, 0, 180);
  if (!didPlay && minutesPlayed !== 0) {
    throw new WorkerError("invalid_manifest", 400, "validation");
  }
  return {
    fantasyPlayerId: uuid(source.fantasyPlayerId),
    footballTeamId: uuid(source.footballTeamId),
    started: boolean(source.started),
    didPlay,
    minutesPlayed,
    events,
  };
}

function parseFixture(value: unknown): CanonicalFixtureSnapshot {
  const source = record(value, "invalid_manifest");
  exactKeys(source, ["fixtureId", "footballInputVersion", "players"]);
  if (!Array.isArray(source.players) || source.players.length < 22 || source.players.length > 100) {
    throw new WorkerError("invalid_manifest", 400, "validation");
  }
  const players = source.players.map(parsePlayer);
  requireStrictOrder(players.map((player) => player.fantasyPlayerId));
  const teamIds = [...new Set(players.map((player) => player.footballTeamId))].sort();
  if (teamIds.length !== 2) throw new WorkerError("invalid_manifest", 400, "validation");
  for (const teamId of teamIds) {
    if (
      players.filter((player) => player.footballTeamId === teamId && player.started).length !== 11
    ) {
      throw new WorkerError("invalid_manifest", 400, "validation");
    }
  }
  const eventCount = players.reduce((total, player) => total + player.events.length, 0);
  if (eventCount > 1000) throw new WorkerError("invalid_manifest", 400, "validation");
  return {
    fixtureId: uuid(source.fixtureId),
    footballInputVersion: integer(source.footballInputVersion, 0, Number.MAX_SAFE_INTEGER),
    players,
  };
}

export function validateScoringManifest(value: unknown): CanonicalScoringManifest {
  const source = record(value, "invalid_manifest");
  exactKeys(source, [
    "schemaVersion",
    "seasonId",
    "gameweekId",
    "calculationVersion",
    "fixtures",
    "leagueIds",
  ]);
  if (source.schemaVersion !== 1 || !Array.isArray(source.fixtures)) {
    throw new WorkerError("invalid_manifest", 400, "validation");
  }
  if (
    source.fixtures.length < 1 ||
    source.fixtures.length > 50 ||
    !Array.isArray(source.leagueIds)
  ) {
    throw new WorkerError("invalid_manifest", 400, "validation");
  }
  if (source.leagueIds.length > 10_000) {
    throw new WorkerError("invalid_manifest", 400, "validation");
  }
  const fixtures = source.fixtures.map(parseFixture);
  const leagueIds = source.leagueIds.map(uuid);
  requireStrictOrder(fixtures.map((fixture) => fixture.fixtureId));
  requireStrictOrder(leagueIds);
  return {
    schemaVersion: 1,
    seasonId: uuid(source.seasonId),
    gameweekId: uuid(source.gameweekId),
    calculationVersion: integer(source.calculationVersion, 1, 2_147_483_647),
    fixtures,
    leagueIds,
  };
}

export async function scoringManifestDigest(manifest: CanonicalScoringManifest): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(manifest));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function scoringExecutionConfirmation(
  manifest: CanonicalScoringManifest,
  digest: string,
): string {
  return `FINALIZE:${manifest.gameweekId}:v${manifest.calculationVersion}:${digest.slice(0, 12)}`;
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function json(status: number, body: JsonRecord): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function parseRequest(request: Request): Promise<ParsedRequest> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new WorkerError("request_too_large", 413, "validation");
  }
  const source = await request.text();
  if (new TextEncoder().encode(source).byteLength > MAX_REQUEST_BYTES) {
    throw new WorkerError("request_too_large", 413, "validation");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new WorkerError("invalid_request", 400, "validation");
  }
  const body = record(parsed);
  exactKeys(body, ["mode", "manifest", "expectedManifestDigest", "confirmation"]);
  if (body.mode !== "validate" && body.mode !== "execute") {
    throw new WorkerError("invalid_request", 400, "validation");
  }
  if (
    typeof body.expectedManifestDigest !== "string" ||
    !SHA256.test(body.expectedManifestDigest)
  ) {
    throw new WorkerError("invalid_request", 400, "validation");
  }
  if (body.confirmation !== null && typeof body.confirmation !== "string") {
    throw new WorkerError("invalid_request", 400, "validation");
  }
  return {
    mode: body.mode,
    manifest: validateScoringManifest(body.manifest),
    expectedManifestDigest: body.expectedManifestDigest,
    confirmation: body.confirmation,
  };
}

async function callRpc(
  client: FantasyScoringRpcClient,
  name: string,
  args: Record<string, unknown>,
  stage: string,
): Promise<unknown> {
  const result = await client.schema("api").rpc(name, args);
  if (result.error) {
    throw new RpcError(name, result.error.code ?? null, result.error.message ?? null, stage);
  }
  return result.data;
}

function rpcObject(value: unknown, stage: string): JsonRecord {
  if (!isRecord(value)) throw new WorkerError("invalid_rpc_response", 502, stage);
  return value;
}

function nonnegative(value: unknown, stage: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new WorkerError("invalid_rpc_response", 502, stage);
  }
  return value;
}

function rpcBoolean(value: unknown, stage: string): boolean {
  if (typeof value !== "boolean") throw new WorkerError("invalid_rpc_response", 502, stage);
  return value;
}

function rpcCursor(value: unknown, stage: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new WorkerError("invalid_rpc_response", 502, stage);
  }
  return value;
}

async function pageWithCursor(
  client: FantasyScoringRpcClient,
  name: string,
  manifest: CanonicalScoringManifest,
  cursorArgument: string,
  cursorResult: string,
  countResult: string,
  batchSize: number,
  maxPages: number,
  stage: string,
): Promise<PhaseResult> {
  let cursor: string | null = null;
  let processed = 0;
  for (let page = 1; page <= maxPages; page += 1) {
    const value = rpcObject(
      await callRpc(
        client,
        name,
        {
          p_gameweek_id: manifest.gameweekId,
          p_calculation_version: manifest.calculationVersion,
          [cursorArgument]: cursor,
          p_batch_size: batchSize,
        },
        stage,
      ),
      stage,
    );
    processed += nonnegative(value[countResult], stage);
    const hasMore = rpcBoolean(value.hasMore, stage);
    const nextCursor = rpcCursor(value[cursorResult], stage);
    if (!hasMore) return { pages: page, processed };
    // Canonical UUID text has fixed hyphen positions and lowercase hex, so
    // string order is the same as PostgreSQL's bytewise UUID B-tree order.
    if (nextCursor === null || (cursor !== null && nextCursor <= cursor)) {
      throw new WorkerError("worker_progress_stalled", 502, stage);
    }
    cursor = nextCursor;
  }
  throw new WorkerError("page_budget_exhausted", 503, stage);
}

async function pageWithoutCursor(
  client: FantasyScoringRpcClient,
  name: string,
  gameweekId: string,
  countResult: string,
  batchSize: number,
  maxPages: number,
  stage: string,
): Promise<PhaseResult> {
  let processed = 0;
  for (let page = 1; page <= maxPages; page += 1) {
    const value = rpcObject(
      await callRpc(client, name, { p_gameweek_id: gameweekId, p_batch_size: batchSize }, stage),
      stage,
    );
    const count = nonnegative(value[countResult], stage);
    processed += count;
    const hasMore = rpcBoolean(value.hasMore, stage);
    if (!hasMore) return { pages: page, processed };
    if (count === 0) throw new WorkerError("worker_progress_stalled", 502, stage);
  }
  throw new WorkerError("page_budget_exhausted", 503, stage);
}

function isExpectedIncompletePreflight(error: unknown): boolean {
  return (
    error instanceof RpcError &&
    error.databaseCode === "PT409" &&
    error.databaseMessage === "gameweek_not_finalizable"
  );
}

async function bestEffortCompleteJob(
  client: FantasyScoringRpcClient,
  runId: string,
  status: "succeeded" | "failed",
  processed: number,
  errorCode: string | null,
): Promise<void> {
  try {
    await callRpc(
      client,
      "service_complete_fantasy_job",
      {
        p_run_id: runId,
        p_status: status,
        p_processed: processed,
        p_skipped: 0,
        p_failed: status === "failed" ? 1 : 0,
        p_error_code: errorCode,
        p_error_summary: errorCode,
      },
      "job_ledger",
    );
  } catch {
    if (status === "succeeded") throw new WorkerError("job_ledger_failed", 502, "job_ledger");
  }
}

export async function executeFantasyScoring(
  manifest: CanonicalScoringManifest,
  client: FantasyScoringRpcClient,
  maxPages = DEFAULT_MAX_PAGES,
): Promise<ExecutionSummary> {
  const scope = rpcObject(
    await callRpc(
      client,
      "service_validate_fantasy_scoring_scope",
      {
        p_gameweek_id: manifest.gameweekId,
        p_season_id: manifest.seasonId,
        p_calculation_version: manifest.calculationVersion,
        p_fixture_ids: manifest.fixtures.map((fixture) => fixture.fixtureId),
        p_league_ids: manifest.leagueIds,
      },
      "scope_validation",
    ),
    "scope_validation",
  );
  const scopeStatus = scope.status;
  if (
    scope.stableResult !== true ||
    typeof scopeStatus !== "string" ||
    !SCORING_GAMEWEEK_STATUSES.has(scopeStatus) ||
    nonnegative(scope.fixtureCount, "scope_validation") !== manifest.fixtures.length ||
    nonnegative(scope.leagueCount, "scope_validation") !== manifest.leagueIds.length
  ) {
    throw new WorkerError("invalid_rpc_response", 502, "scope_validation");
  }

  const runIdValue = await callRpc(
    client,
    "service_begin_fantasy_job",
    {
      p_job_type: "finalize_gameweek",
      p_season_id: manifest.seasonId,
      p_gameweek_id: manifest.gameweekId,
      p_calculation_version: manifest.calculationVersion,
    },
    "job_ledger",
  );
  const runId = rpcCursor(runIdValue, "job_ledger");
  if (runId === null) throw new WorkerError("invalid_rpc_response", 502, "job_ledger");
  let processed = 0;
  try {
    for (const fixture of manifest.fixtures) {
      const fixtureResult = rpcObject(
        await callRpc(
          client,
          "service_replace_fantasy_fixture_points",
          {
            p_gameweek_id: manifest.gameweekId,
            p_fixture_id: fixture.fixtureId,
            p_football_input_version: fixture.footballInputVersion,
            p_calculation_version: manifest.calculationVersion,
            p_players: fixture.players.map((player) => ({
              fantasy_player_id: player.fantasyPlayerId,
              football_team_id: player.footballTeamId,
              started: player.started,
              did_play: player.didPlay,
              minutes_played: player.minutesPlayed,
              events: player.events,
            })),
          },
          "fixture_replacement",
        ),
        "fixture_replacement",
      );
      if (
        rpcCursor(fixtureResult.snapshotId, "fixture_replacement") === null ||
        nonnegative(fixtureResult.players, "fixture_replacement") !== fixture.players.length ||
        typeof fixtureResult.stableResult !== "boolean" ||
        ((scopeStatus === "finalizing" || scopeStatus === "finalized") &&
          fixtureResult.stableResult !== true)
      ) {
        throw new WorkerError("invalid_rpc_response", 502, "fixture_replacement");
      }
      processed += 1;
    }

    try {
      const replayCompletion = rpcObject(
        await callRpc(
          client,
          "service_complete_fantasy_gameweek",
          {
            p_gameweek_id: manifest.gameweekId,
            p_calculation_version: manifest.calculationVersion,
          },
          "completion_preflight",
        ),
        "completion_preflight",
      );
      if (
        replayCompletion.finalized !== true ||
        typeof replayCompletion.stableResult !== "boolean" ||
        (scopeStatus === "finalized" && replayCompletion.stableResult !== true)
      ) {
        throw new WorkerError("invalid_rpc_response", 502, "completion_preflight");
      }
      await bestEffortCompleteJob(client, runId, "succeeded", processed, null);
      return {
        alreadyComplete: replayCompletion.stableResult,
        fixtureSnapshots: manifest.fixtures.length,
        playerFinalization: { pages: 0, processed: 0 },
        teamMaterialization: { pages: 0, processed: 0 },
        teamFinalization: { pages: 0, processed: 0 },
        freeHitRestoration: { pages: 0, processed: 0 },
        transferRollover: { pages: 0, processed: 0 },
        rankingScopes: 0,
        rankingRows: 0,
        jobRunId: runId,
      };
    } catch (error) {
      if (!isExpectedIncompletePreflight(error)) throw error;
    }

    const playerFinalization = await pageWithCursor(
      client,
      "service_finalize_fantasy_player_points",
      manifest,
      "p_after_player_id",
      "afterPlayerId",
      "finalized",
      1_000,
      maxPages,
      "player_finalization",
    );
    processed += playerFinalization.processed;

    const teamMaterialization = await pageWithCursor(
      client,
      "service_materialize_fantasy_team_results",
      manifest,
      "p_after_team_id",
      "afterTeamId",
      "materialized",
      250,
      maxPages,
      "team_materialization",
    );
    processed += teamMaterialization.processed;
    const teamFinalization = await pageWithCursor(
      client,
      "service_finalize_fantasy_team_results",
      manifest,
      "p_after_team_id",
      "afterTeamId",
      "finalized",
      500,
      maxPages,
      "team_finalization",
    );
    processed += teamFinalization.processed;
    const freeHitRestoration = await pageWithoutCursor(
      client,
      "service_restore_free_hit",
      manifest.gameweekId,
      "restored",
      250,
      maxPages,
      "free_hit_restoration",
    );
    processed += freeHitRestoration.processed;
    const transferRollover = await pageWithoutCursor(
      client,
      "service_roll_fantasy_free_transfers",
      manifest.gameweekId,
      "updated",
      500,
      maxPages,
      "transfer_rollover",
    );
    processed += transferRollover.processed;

    const scopes: Array<{
      gameweekId: string | null;
      leagueId: string | null;
    }> = [
      { gameweekId: manifest.gameweekId, leagueId: null },
      { gameweekId: null, leagueId: null },
    ];
    for (const leagueId of manifest.leagueIds) {
      scopes.push({ gameweekId: manifest.gameweekId, leagueId });
      scopes.push({ gameweekId: null, leagueId });
    }
    let rankingRows = 0;
    for (const scope of scopes) {
      rankingRows += nonnegative(
        await callRpc(
          client,
          "service_recalculate_fantasy_rankings",
          {
            p_season_id: manifest.seasonId,
            p_gameweek_id: scope.gameweekId,
            p_league_id: scope.leagueId,
            p_calculation_version: manifest.calculationVersion,
          },
          "ranking_recalculation",
        ),
        "ranking_recalculation",
      );
    }
    processed += rankingRows;
    const completion = rpcObject(
      await callRpc(
        client,
        "service_complete_fantasy_gameweek",
        {
          p_gameweek_id: manifest.gameweekId,
          p_calculation_version: manifest.calculationVersion,
        },
        "completion",
      ),
      "completion",
    );
    if (completion.finalized !== true || typeof completion.stableResult !== "boolean") {
      throw new WorkerError("invalid_rpc_response", 502, "completion");
    }
    await bestEffortCompleteJob(client, runId, "succeeded", processed, null);
    return {
      alreadyComplete: false,
      fixtureSnapshots: manifest.fixtures.length,
      playerFinalization,
      teamMaterialization,
      teamFinalization,
      freeHitRestoration,
      transferRollover,
      rankingScopes: scopes.length,
      rankingRows,
      jobRunId: runId,
    };
  } catch (error) {
    const code = error instanceof WorkerError ? error.code : "fantasy_scoring_worker_failed";
    await bestEffortCompleteJob(client, runId, "failed", processed, code);
    throw error;
  }
}

function manifestCounts(manifest: CanonicalScoringManifest): JsonRecord {
  return {
    fixtures: manifest.fixtures.length,
    players: manifest.fixtures.reduce((total, fixture) => total + fixture.players.length, 0),
    pointEvents: manifest.fixtures.reduce(
      (total, fixture) =>
        total + fixture.players.reduce((subtotal, player) => subtotal + player.events.length, 0),
      0,
    ),
    leagueScopes: 2 + manifest.leagueIds.length * 2,
  };
}

export async function handleFantasyScoringRequest(
  request: Request,
  dependencies: FantasyScoringWorkerDependencies,
): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const receivedTriggerSecret = request.headers.get("x-botolago-scoring-key") ?? "";
  if (
    dependencies.expectedTriggerSecret.length < 32 ||
    !timingSafeEqual(receivedTriggerSecret, dependencies.expectedTriggerSecret)
  ) {
    return json(401, { error: "unauthorized" });
  }
  try {
    const parsed = await parseRequest(request);
    const digest = await scoringManifestDigest(parsed.manifest);
    if (!timingSafeEqual(digest, parsed.expectedManifestDigest)) {
      throw new WorkerError("manifest_digest_mismatch", 409, "validation");
    }
    const confirmation = scoringExecutionConfirmation(parsed.manifest, digest);
    if (parsed.mode === "validate") {
      return json(200, {
        valid: true,
        manifestDigest: digest,
        executionConfirmation: confirmation,
        counts: manifestCounts(parsed.manifest),
        recurringScheduleEnabled: false,
      });
    }
    if (parsed.confirmation === null || !timingSafeEqual(parsed.confirmation, confirmation)) {
      throw new WorkerError("execution_confirmation_failed", 409, "validation");
    }
    const maxPages = dependencies.maxPagesPerPhase ?? DEFAULT_MAX_PAGES;
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 500) {
      throw new WorkerError("invalid_runtime_configuration", 500, "configuration");
    }
    const summary = await executeFantasyScoring(parsed.manifest, dependencies.client, maxPages);
    return json(200, {
      completed: true,
      manifestDigest: digest,
      summary: summary as unknown as JsonRecord,
      recurringScheduleEnabled: false,
    });
  } catch (error) {
    const failure =
      error instanceof WorkerError
        ? error
        : new WorkerError("fantasy_scoring_worker_failed", 500, "worker");
    return json(failure.status, {
      error: failure.code,
      stage: failure.stage,
      ...(failure instanceof RpcError && failure.databaseCode
        ? { databaseCode: failure.databaseCode }
        : {}),
    });
  }
}
