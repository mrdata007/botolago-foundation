import {
  calculatePreseasonRatings,
  PRESEASON_RATING_V2,
  type PlayerSeasonStatistics,
  type RatingCandidate,
} from "./sportsmonks-player-ratings.ts";

type JsonRecord = Record<string, unknown>;
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface HistoricalPerformanceRpcResult {
  readonly data: unknown;
  readonly error: { readonly message?: string; readonly code?: string } | null;
}

export interface HistoricalPerformanceRpcClient {
  schema(name: "api"): {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<HistoricalPerformanceRpcResult>;
  };
}

export interface HistoricalPerformanceDependencies {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly client: HistoricalPerformanceRpcClient;
  readonly fetch?: FetchLike;
  readonly now?: () => Date;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

interface Configuration {
  readonly token: string;
  readonly triggerSecret: string;
  readonly seasonId: number;
  readonly timeoutMs: number;
  readonly maxRetries: number;
}

interface RuntimeCounters {
  fetched: number;
  validated: number;
  inserted: number;
  updated: number;
  skipped: number;
  rejected: number;
  retries: number;
}

interface FixtureBatchItem {
  readonly externalFixtureId: string;
  readonly kickoffAt: string;
}

interface FixtureBatch {
  readonly expectedFixtureCount: number;
  readonly items: FixtureBatchItem[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export interface HistoricalPlayerPerformanceRow {
  readonly externalPlayerId: string;
  readonly externalTeamId: string;
  readonly started: boolean;
  readonly appeared: boolean;
  readonly minutes: number;
  readonly goals: number;
  readonly assists: number;
  readonly cleanSheets: number;
  readonly goalsConceded: number;
  readonly saves: number;
  readonly penaltiesSaved: number;
  readonly penaltiesMissed: number;
  readonly yellowCards: number;
  readonly redCards: number;
  readonly secondYellowDismissals: number;
  readonly ownGoals: number;
  readonly providerRating: number | null;
}

export interface NormalizedHistoricalFixture {
  readonly fixtureId: number;
  readonly seasonId: number;
  readonly sourceVersion: string;
  readonly rows: HistoricalPlayerPerformanceRow[];
  readonly coverage: {
    readonly lineupRowsSeen: number;
    readonly validPlayerRows: number;
    readonly excludedIncompleteRows: number;
    /**
     * Identified starters (provider `type_id` 11, `player_id` present). Historically this was
     * required to equal 22. Under BG-0011 option B it may be as low as 18: the provider always
     * reports exactly 22 raw starter rows, but up to 4 of them may be anonymous (see
     * `anonymousStarterRows`). This field name is kept for backward compatibility with existing
     * callers/tests; it is NOT the raw provider starter count.
     */
    readonly starterRows: number;
    /**
     * Raw provider starter rows (`type_id` 11) that carry no `player_id`. These rows are never
     * assigned to any player, never persisted, and never treated as "observed zero" stats for
     * anyone. BG-0011 option B tolerates up to 4 per fixture on the historical ingestion path
     * only; a fixture with more than 4 is quarantined entirely (see
     * `HistoricalPerformanceRuntimeError` code `historical_fixture_anonymous_starters_exceeded`).
     */
    readonly anonymousStarterRows: number;
    readonly teamCount: number;
    readonly detailRows: number;
    readonly invalidDetailRows: number;
  };
}

/** BG-0011 option B: at most this many of the 22 raw provider starter rows may be anonymous
 * (missing `player_id`) before the whole fixture is quarantined. Historical ingestion path only
 * (`api.ingest_historical_player_fixture_performance` / `app_private.historical_performance_fixture_coverage`);
 * the live current-season scoring path (`sportsmonks-current-fixture:` source-version prefix,
 * separate tables in `20260914200726_current_finished_fixture_performances.sql`) is untouched and
 * still requires zero anonymous starters. */
export const MAX_ANONYMOUS_STARTER_ROWS = 4;
const RAW_STARTER_ROW_COUNT = 22;

interface BatchRequest {
  readonly action: "ingest_batch";
  readonly afterFixtureExternalId: string | null;
  readonly batchSize: number;
}

interface DeriveRequest {
  readonly action: "derive_ratings";
}

type HistoricalRequest = BatchRequest | DeriveRequest;

const OFFICIAL_BASE_URL = "https://api.sportmonks.com/v3/football";
const BOTOLA_PRO_LEAGUE_ID = 860;
const MAX_REQUEST_BYTES = 2_048;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_RATING_ROWS = 1_000;

const TYPE = {
  goals: 52,
  saves: 57,
  assists: 79,
  redCards: 83,
  yellowCards: 84,
  secondYellowDismissals: 85,
  goalsConceded: 88,
  penaltiesMissed: 112,
  penaltiesSaved: 113,
  providerRating: 118,
  minutes: 119,
  cleanSheets: 194,
  ownGoals: 324,
} as const;

export const HISTORICAL_PERFORMANCE_DETAIL_TYPE_IDS = Object.values(TYPE).sort(
  (left, right) => left - right,
);
const DETAIL_KEY_BY_ID = new Map<number, keyof typeof TYPE>(
  Object.entries(TYPE).map(([key, id]) => [id, key as keyof typeof TYPE]),
);

export class HistoricalPerformanceRuntimeError extends Error {
  constructor(
    readonly code: string,
    readonly diagnostic?: Readonly<JsonRecord>,
  ) {
    super(code);
    this.name = "HistoricalPerformanceRuntimeError";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, code = "invalid_provider_payload"): JsonRecord {
  if (!isRecord(value)) throw new HistoricalPerformanceRuntimeError(code);
  return value;
}

function required(environment: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new HistoricalPerformanceRuntimeError("invalid_runtime_configuration");
  return value;
}

function integerSetting(
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const raw = required(environment, name);
  if (!/^\d+$/.test(raw)) {
    throw new HistoricalPerformanceRuntimeError("invalid_runtime_configuration");
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new HistoricalPerformanceRuntimeError("invalid_runtime_configuration");
  }
  return value;
}

function hasControlOrWhitespace(value: string): boolean {
  return Array.from(value).some((character) => {
    const point = character.codePointAt(0) ?? 0;
    return point <= 0x20 || point === 0x7f;
  });
}

function configuration(environment: Readonly<Record<string, string | undefined>>): Configuration {
  const token = required(environment, "SPORTSMONKS_API_TOKEN");
  const triggerSecret = required(environment, "FOOTBALL_INGESTION_TRIGGER_SECRET");
  if (
    token.length < 16 ||
    token.length > 512 ||
    triggerSecret.length < 32 ||
    triggerSecret.length > 512 ||
    hasControlOrWhitespace(token) ||
    hasControlOrWhitespace(triggerSecret) ||
    required(environment, "FOOTBALL_PROVIDER") !== "sportsmonks" ||
    required(environment, "FOOTBALL_PROVIDER_BASE_URL").replace(/\/$/, "") !== OFFICIAL_BASE_URL
  ) {
    throw new HistoricalPerformanceRuntimeError("invalid_runtime_configuration");
  }
  return {
    token,
    triggerSecret,
    seasonId: integerSetting(environment, "FOOTBALL_SPORTSMONKS_SEASON_ID", 1, 1_000_000_000),
    timeoutMs: integerSetting(environment, "FOOTBALL_PROVIDER_TIMEOUT_MS", 250, 60_000),
    maxRetries: integerSetting(environment, "FOOTBALL_PROVIDER_MAX_RETRIES", 0, 8),
  };
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

function positiveInteger(value: unknown, code = "invalid_provider_payload"): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new HistoricalPerformanceRuntimeError(code);
  }
  return value;
}

function nonNegativeInteger(value: unknown, code = "invalid_provider_payload"): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new HistoricalPerformanceRuntimeError(code);
  }
  return value;
}

function numericExternalId(value: unknown, code = "invalid_provider_payload"): string {
  if (typeof value === "number") return String(positiveInteger(value, code));
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return value;
  throw new HistoricalPerformanceRuntimeError(code);
}

async function parseRequest(request: Request): Promise<HistoricalRequest> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new HistoricalPerformanceRuntimeError("request_too_large");
  }
  const source = await request.text();
  if (source.length > MAX_REQUEST_BYTES) {
    throw new HistoricalPerformanceRuntimeError("request_too_large");
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new HistoricalPerformanceRuntimeError("invalid_request");
  }
  const body = record(value, "invalid_request");
  if (body.job !== "historical_player_performances") {
    throw new HistoricalPerformanceRuntimeError("invalid_request");
  }
  if (body.action === "derive_ratings") {
    if (Object.keys(body).some((key) => key !== "job" && key !== "action")) {
      throw new HistoricalPerformanceRuntimeError("invalid_request");
    }
    return { action: "derive_ratings" };
  }
  if (body.action !== "ingest_batch") {
    throw new HistoricalPerformanceRuntimeError("invalid_request");
  }
  if (
    Object.keys(body).some(
      (key) =>
        key !== "job" &&
        key !== "action" &&
        key !== "afterFixtureExternalId" &&
        key !== "batchSize",
    ) ||
    (body.afterFixtureExternalId !== null &&
      (typeof body.afterFixtureExternalId !== "string" ||
        !/^[1-9]\d*$/.test(body.afterFixtureExternalId))) ||
    typeof body.batchSize !== "number" ||
    !Number.isSafeInteger(body.batchSize) ||
    body.batchSize < 1 ||
    body.batchSize > 10
  ) {
    throw new HistoricalPerformanceRuntimeError("invalid_request");
  }
  return {
    action: "ingest_batch",
    afterFixtureExternalId: body.afterFixtureExternalId,
    batchSize: body.batchSize,
  };
}

async function responseJson(response: Response): Promise<JsonRecord> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new HistoricalPerformanceRuntimeError("provider_response_too_large");
  }
  const source = await response.text();
  if (source.length > MAX_RESPONSE_BYTES) {
    throw new HistoricalPerformanceRuntimeError("provider_response_too_large");
  }
  try {
    return record(JSON.parse(source));
  } catch (error) {
    if (error instanceof HistoricalPerformanceRuntimeError) throw error;
    throw new HistoricalPerformanceRuntimeError("invalid_provider_payload");
  }
}

async function providerFixtureRequest(
  fixtureId: string,
  config: Configuration,
  dependencies: HistoricalPerformanceDependencies,
  counters: RuntimeCounters,
): Promise<JsonRecord> {
  const url = new URL(`${OFFICIAL_BASE_URL}/fixtures/${fixtureId}`);
  url.searchParams.set("include", "lineups.details");
  url.searchParams.set(
    "filters",
    `lineupDetailTypes:${HISTORICAL_PERFORMANCE_DETAIL_TYPE_IDS.join(",")}`,
  );
  if (url.origin !== "https://api.sportmonks.com" || url.href.includes(config.token)) {
    throw new HistoricalPerformanceRuntimeError("provider_origin_guard_failed");
  }
  const fetcher = dependencies.fetch ?? globalThis.fetch.bind(globalThis);
  const sleep = dependencies.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetcher(url, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: config.token },
        redirect: "error",
        signal: controller.signal,
      });
      if (response.ok) return responseJson(response);
      if ((response.status === 429 || response.status >= 500) && attempt < config.maxRetries) {
        counters.retries += 1;
        await sleep(250 * 2 ** attempt);
        continue;
      }
      throw new HistoricalPerformanceRuntimeError(
        response.status === 429 ? "provider_rate_limited" : "provider_unavailable",
      );
    } catch (error) {
      if (error instanceof HistoricalPerformanceRuntimeError) throw error;
      if (attempt < config.maxRetries) {
        counters.retries += 1;
        await sleep(250 * 2 ** attempt);
        continue;
      }
      throw new HistoricalPerformanceRuntimeError("provider_unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new HistoricalPerformanceRuntimeError("provider_unavailable");
}

function detailNumber(detail: JsonRecord, rating: boolean): number {
  const data = record(detail.data);
  const value = data.value;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new HistoricalPerformanceRuntimeError("invalid_provider_detail");
  }
  if (rating) {
    if (value > 10) throw new HistoricalPerformanceRuntimeError("invalid_provider_detail");
    return value;
  }
  if (!Number.isSafeInteger(value)) {
    throw new HistoricalPerformanceRuntimeError("invalid_provider_detail");
  }
  return value;
}

function emptyPerformance(
  externalPlayerId: string,
  externalTeamId: string,
  started: boolean,
): HistoricalPlayerPerformanceRow {
  return {
    externalPlayerId,
    externalTeamId,
    started,
    appeared: started,
    minutes: 0,
    goals: 0,
    assists: 0,
    cleanSheets: 0,
    goalsConceded: 0,
    saves: 0,
    penaltiesSaved: 0,
    penaltiesMissed: 0,
    yellowCards: 0,
    redCards: 0,
    secondYellowDismissals: 0,
    ownGoals: 0,
    providerRating: null,
  };
}

async function sha256(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function normalizeHistoricalFixture(
  payload: unknown,
  expectedFixtureId: number,
  expectedSeasonId: number,
): Promise<NormalizedHistoricalFixture> {
  const root = record(payload);
  const fixture = record(root.data);
  const fixtureId = positiveInteger(fixture.id);
  const seasonId = positiveInteger(fixture.season_id);
  const leagueId = positiveInteger(fixture.league_id);
  if (
    fixtureId !== expectedFixtureId ||
    seasonId !== expectedSeasonId ||
    leagueId !== BOTOLA_PRO_LEAGUE_ID
  ) {
    throw new HistoricalPerformanceRuntimeError("fixture_scope_mismatch");
  }
  if (!Array.isArray(fixture.lineups)) {
    throw new HistoricalPerformanceRuntimeError("invalid_provider_lineups");
  }

  const rows: HistoricalPlayerPerformanceRow[] = [];
  const playerIds = new Set<string>();
  const teamIds = new Set<string>();
  let excludedIncompleteRows = 0;
  let starterRows = 0;
  let anonymousStarterRows = 0;
  let detailRows = 0;
  let invalidDetailRows = 0;

  for (const value of fixture.lineups) {
    if (!isRecord(value) || value.player_id === null || value.player_id === undefined) {
      excludedIncompleteRows += 1;
      // The provider still reports type_id for anonymous rows. A starter row (type_id 11) that
      // carries no player_id is an anonymous starter (BG-0011 option B); anything else (a missing
      // or non-starter type_id) is just an anonymous/incomplete row, as before.
      if (isRecord(value) && value.type_id === 11) anonymousStarterRows += 1;
      continue;
    }
    let externalPlayerId: string;
    let externalTeamId: string;
    let participationType: number;
    try {
      externalPlayerId = numericExternalId(value.player_id);
      externalTeamId = numericExternalId(value.team_id);
      participationType = positiveInteger(value.type_id);
    } catch {
      throw new HistoricalPerformanceRuntimeError("invalid_provider_lineup");
    }
    if (participationType !== 11 && participationType !== 12) {
      throw new HistoricalPerformanceRuntimeError("invalid_provider_lineup");
    }
    if (playerIds.has(externalPlayerId)) {
      throw new HistoricalPerformanceRuntimeError("duplicate_provider_lineup_player");
    }
    playerIds.add(externalPlayerId);
    teamIds.add(externalTeamId);
    const started = participationType === 11;
    if (started) starterRows += 1;
    const mutable = { ...emptyPerformance(externalPlayerId, externalTeamId, started) };
    const details = value.details ?? [];
    if (!Array.isArray(details)) {
      throw new HistoricalPerformanceRuntimeError("invalid_provider_details");
    }
    const seenTypes = new Set<number>();
    for (const rawDetail of details) {
      detailRows += 1;
      try {
        const detail = record(rawDetail);
        const typeId = positiveInteger(detail.type_id);
        const key = DETAIL_KEY_BY_ID.get(typeId);
        if (!key) continue;
        if (seenTypes.has(typeId)) {
          throw new HistoricalPerformanceRuntimeError("duplicate_provider_detail");
        }
        seenTypes.add(typeId);
        const number = detailNumber(detail, key === "providerRating");
        if (key === "providerRating") mutable.providerRating = number;
        else mutable[key] = number;
      } catch (error) {
        invalidDetailRows += 1;
        if (error instanceof HistoricalPerformanceRuntimeError) throw error;
        throw new HistoricalPerformanceRuntimeError("invalid_provider_detail");
      }
    }
    mutable.appeared = mutable.started || mutable.minutes > 0;
    rows.push(mutable);
  }

  rows.sort((left, right) => Number(left.externalPlayerId) - Number(right.externalPlayerId));
  const coverageFailures: string[] = [];
  if (fixture.lineups.length < 22 || fixture.lineups.length > 100) {
    coverageFailures.push("lineup_rows_out_of_range");
  }
  if (rows.length < 22 || rows.length > 100) {
    coverageFailures.push("valid_player_rows_out_of_range");
  }
  if (excludedIncompleteRows > 20) {
    coverageFailures.push("incomplete_rows_limit_exceeded");
  }
  // The provider always reports exactly 22 raw starter rows (identified + anonymous). That
  // invariant is unrelated to BG-0011 option B and still fails outright if violated.
  if (starterRows + anonymousStarterRows !== RAW_STARTER_ROW_COUNT) {
    coverageFailures.push("raw_starter_rows_mismatch");
  }
  if (teamIds.size !== 2) coverageFailures.push("team_count_mismatch");
  if (invalidDetailRows !== 0) coverageFailures.push("invalid_detail_rows_present");
  if (coverageFailures.length > 0) {
    throw new HistoricalPerformanceRuntimeError("historical_fixture_coverage_incomplete", {
      fixtureId,
      lineupRowsSeen: fixture.lineups.length,
      validPlayerRows: rows.length,
      excludedIncompleteRows,
      starterRows,
      anonymousStarterRows,
      teamCount: teamIds.size,
      invalidDetailRows,
      failures: coverageFailures,
    });
  }
  // Computed here (rather than only on the success path) because the caller needs it either way:
  // on success, to return with the normalized fixture; on quarantine, to record an audit-complete
  // row in app_private.historical_performance_fixture_coverage (BG-0011 option B, single-table
  // design — quarantine is a coverage_outcome, not a separate table).
  const sourceVersion = `sportsmonks-fixture:${await sha256({ fixtureId, seasonId, rows })}`;
  const coverage = {
    lineupRowsSeen: fixture.lineups.length,
    validPlayerRows: rows.length,
    excludedIncompleteRows,
    starterRows,
    anonymousStarterRows,
    teamCount: teamIds.size,
    detailRows,
    invalidDetailRows,
  };
  // BG-0011 option B, historical ingestion path only: up to 4 of the 22 raw starters may be
  // anonymous. More than that and the whole fixture is quarantined — none of its rows (not even
  // the identified ones) are used. This is a distinct, narrower failure from the coverage checks
  // above so the caller can treat it as "quarantine and continue the batch" rather than a hard
  // batch failure. The diagnostic carries the full coverage shape (plus sourceVersion) so the
  // caller can record a complete, audit-able quarantined coverage row without recomputing anything.
  if (anonymousStarterRows > MAX_ANONYMOUS_STARTER_ROWS) {
    throw new HistoricalPerformanceRuntimeError("historical_fixture_anonymous_starters_exceeded", {
      fixtureId,
      sourceVersion,
      anonymousStarterRows,
      identifiedStarterRows: starterRows,
      // The DB quarantine RPC's p_coverage expects identifiedStarterRows (mirroring
      // api.ingest_historical_player_fixture_performance's p_coverage shape exactly); `coverage`
      // (the NormalizedHistoricalFixture shape) instead keeps the established `starterRows` name.
      // Both key names are provided here so this one object serves both call sites.
      coverage: { ...coverage, identifiedStarterRows: starterRows },
    });
  }
  return {
    fixtureId,
    seasonId,
    sourceVersion,
    rows,
    coverage,
  };
}

async function rpc(
  client: HistoricalPerformanceRpcClient,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await client.schema("api").rpc(name, args);
  if (result.error) {
    if (result.error.code === "P0002") {
      const mappingCode: Readonly<Record<string, string>> = {
        SEASON_MAPPING_NOT_FOUND: "season_mapping_not_found",
        FIXTURE_MAPPING_NOT_FOUND: "fixture_mapping_not_found",
        TEAM_MAPPING_NOT_FOUND: "team_mapping_not_found",
      };
      throw new HistoricalPerformanceRuntimeError(
        mappingCode[result.error.message ?? ""] ?? "mapping_not_found",
      );
    }
    if (result.error.code === "22023") {
      const businessCode: Readonly<Record<string, string>> = {
        HISTORICAL_PERFORMANCE_INCOMPLETE: "historical_performance_incomplete",
        HISTORICAL_FIXTURE_ANONYMOUS_STARTERS_EXCEEDED: "historical_fixture_anonymous_starters_exceeded",
      };
      throw new HistoricalPerformanceRuntimeError(
        businessCode[result.error.message ?? ""] ?? "invalid_provider_payload",
      );
    }
    throw new HistoricalPerformanceRuntimeError("database_unavailable");
  }
  return result.data;
}

function fixtureBatch(value: unknown, seasonId: number): FixtureBatch {
  const row = record(value, "invalid_database_response");
  if (numericExternalId(row.seasonExternalId, "invalid_database_response") !== String(seasonId)) {
    throw new HistoricalPerformanceRuntimeError("invalid_database_response");
  }
  const expectedFixtureCount = positiveInteger(
    row.expectedFixtureCount,
    "invalid_database_response",
  );
  if (!Array.isArray(row.items) || row.items.length > 10 || typeof row.hasMore !== "boolean") {
    throw new HistoricalPerformanceRuntimeError("invalid_database_response");
  }
  const items = row.items.map((value) => {
    const item = record(value, "invalid_database_response");
    const externalFixtureId = numericExternalId(
      item.externalFixtureId,
      "invalid_database_response",
    );
    if (typeof item.kickoffAt !== "string" || !Number.isFinite(Date.parse(item.kickoffAt))) {
      throw new HistoricalPerformanceRuntimeError("invalid_database_response");
    }
    return { externalFixtureId, kickoffAt: item.kickoffAt };
  });
  const nextCursor = row.nextCursor === null ? null : numericExternalId(row.nextCursor);
  if (
    new Set(items.map((item) => item.externalFixtureId)).size !== items.length ||
    (row.hasMore && (items.length < 1 || nextCursor !== items.at(-1)?.externalFixtureId)) ||
    (!row.hasMore && nextCursor !== null)
  ) {
    throw new HistoricalPerformanceRuntimeError("invalid_database_response");
  }
  return { expectedFixtureCount, items, nextCursor, hasMore: row.hasMore };
}

function persistedCounts(value: unknown): {
  inserted: number;
  updated: number;
  skipped: number;
  active: number;
} {
  const row = record(value, "invalid_database_response");
  if (row.reconciled !== undefined && row.reconciled !== true) {
    throw new HistoricalPerformanceRuntimeError("invalid_database_response");
  }
  return {
    inserted: nonNegativeInteger(row.inserted, "invalid_database_response"),
    updated: nonNegativeInteger(row.updated, "invalid_database_response"),
    skipped: nonNegativeInteger(row.skipped, "invalid_database_response"),
    active: positiveInteger(row.active, "invalid_database_response"),
  };
}

function performancePersistedCounts(
  value: unknown,
  coverage: NormalizedHistoricalFixture["coverage"],
): ReturnType<typeof persistedCounts> & {
  readonly excludedMappingRows: number;
  readonly excludedIncompleteRows: number;
} {
  const counts = persistedCounts(value);
  const row = record(value, "invalid_database_response");
  const excludedMappingRows = nonNegativeInteger(
    row.excludedMappingRows,
    "invalid_database_response",
  );
  const excludedIncompleteRows = nonNegativeInteger(
    row.excludedIncompleteRows,
    "invalid_database_response",
  );
  if (
    excludedIncompleteRows !== coverage.excludedIncompleteRows + excludedMappingRows ||
    counts.active + excludedIncompleteRows !== coverage.lineupRowsSeen ||
    counts.active !== coverage.validPlayerRows - excludedMappingRows
  ) {
    throw new HistoricalPerformanceRuntimeError("invalid_database_response");
  }
  return { ...counts, excludedMappingRows, excludedIncompleteRows };
}

function ratingInputs(
  value: unknown,
  seasonId: number,
): {
  readonly expectedFixtureCount: number;
  readonly performanceCount: number;
  readonly sourceVersion: string;
  readonly candidates: RatingCandidate[];
  readonly statistics: Map<string, PlayerSeasonStatistics>;
} {
  const root = record(value, "invalid_database_response");
  if (
    numericExternalId(root.seasonExternalId, "invalid_database_response") !== String(seasonId) ||
    !Array.isArray(root.rows) ||
    root.rows.length < 1 ||
    root.rows.length > MAX_RATING_ROWS ||
    typeof root.sourceVersion !== "string" ||
    !/^sportsmonks-season-fixtures:[0-9a-f]{64}$/.test(root.sourceVersion)
  ) {
    throw new HistoricalPerformanceRuntimeError("invalid_database_response");
  }
  const expectedFixtureCount = positiveInteger(
    root.expectedFixtureCount,
    "invalid_database_response",
  );
  if (
    positiveInteger(root.coveredFixtureCount, "invalid_database_response") !== expectedFixtureCount
  ) {
    throw new HistoricalPerformanceRuntimeError("historical_performance_incomplete");
  }
  const performanceCount = positiveInteger(root.performanceCount, "invalid_database_response");
  const candidates: RatingCandidate[] = [];
  const statistics = new Map<string, PlayerSeasonStatistics>();
  for (const value of root.rows) {
    const row = record(value, "invalid_database_response");
    const externalPlayerId = numericExternalId(row.externalPlayerId, "invalid_database_response");
    if (
      row.position !== "GK" &&
      row.position !== "DEF" &&
      row.position !== "MID" &&
      row.position !== "FWD"
    ) {
      throw new HistoricalPerformanceRuntimeError("invalid_database_response");
    }
    const statisticsRow: PlayerSeasonStatistics = {
      externalPlayerId,
      position: row.position,
      appearances: nonNegativeInteger(row.appearances, "invalid_database_response"),
      starts: nonNegativeInteger(row.starts, "invalid_database_response"),
      minutes: nonNegativeInteger(row.minutes, "invalid_database_response"),
      goals: nonNegativeInteger(row.goals, "invalid_database_response"),
      assists: nonNegativeInteger(row.assists, "invalid_database_response"),
      cleanSheets: nonNegativeInteger(row.cleanSheets, "invalid_database_response"),
      goalsConceded: nonNegativeInteger(row.goalsConceded, "invalid_database_response"),
      saves: nonNegativeInteger(row.saves, "invalid_database_response"),
      penaltiesSaved: nonNegativeInteger(row.penaltiesSaved, "invalid_database_response"),
      penaltiesMissed: nonNegativeInteger(row.penaltiesMissed, "invalid_database_response"),
      yellowCards: nonNegativeInteger(row.yellowCards, "invalid_database_response"),
      redCards: nonNegativeInteger(row.redCards, "invalid_database_response"),
      secondYellowDismissals: nonNegativeInteger(
        row.secondYellowDismissals,
        "invalid_database_response",
      ),
      ownGoals: nonNegativeInteger(row.ownGoals, "invalid_database_response"),
      providerRatingWeighted:
        typeof row.providerRatingWeighted === "number" &&
        Number.isFinite(row.providerRatingWeighted) &&
        row.providerRatingWeighted >= 0
          ? row.providerRatingWeighted
          : (() => {
              throw new HistoricalPerformanceRuntimeError("invalid_database_response");
            })(),
      providerRatingMinutes: nonNegativeInteger(
        row.providerRatingMinutes,
        "invalid_database_response",
      ),
    };
    if (
      statistics.has(externalPlayerId) ||
      statisticsRow.starts > statisticsRow.appearances ||
      statisticsRow.minutes > statisticsRow.appearances * 130
    ) {
      throw new HistoricalPerformanceRuntimeError("invalid_database_response");
    }
    candidates.push({ externalPlayerId, position: row.position });
    statistics.set(externalPlayerId, statisticsRow);
  }
  return {
    expectedFixtureCount,
    performanceCount,
    sourceVersion: root.sourceVersion,
    candidates,
    statistics,
  };
}

async function complete(
  client: HistoricalPerformanceRpcClient,
  runId: string,
  status: "succeeded" | "failed",
  counts: RuntimeCounters,
  checkpoint: JsonRecord,
  errorCode: string | null,
): Promise<void> {
  await rpc(client, "complete_football_ingestion", {
    p_run_id: runId,
    p_status: status,
    p_checkpoint: checkpoint,
    p_records_fetched: counts.fetched,
    p_records_validated: counts.validated,
    p_records_inserted: counts.inserted,
    p_records_updated: counts.updated,
    p_records_skipped: counts.skipped,
    p_records_rejected: counts.rejected,
    p_retry_count: counts.retries,
    p_error_code: errorCode,
    p_error_summary: errorCode ? "Historical performance operation failed; inspect logs." : null,
  });
}

async function ingestBatch(
  request: BatchRequest,
  config: Configuration,
  dependencies: HistoricalPerformanceDependencies,
): Promise<JsonRecord> {
  const counts: RuntimeCounters = {
    fetched: 0,
    validated: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    rejected: 0,
    retries: 0,
  };
  let runId: string | null = null;
  try {
    runId = String(
      await rpc(dependencies.client, "begin_historical_performance_ingestion", {
        p_provider_name: "sportsmonks",
        p_season_external_id: String(config.seasonId),
        p_target_scope: {
          seasonId: config.seasonId,
          afterFixtureExternalId: request.afterFixtureExternalId,
          batchSize: request.batchSize,
        },
        p_checkpoint: {},
      }),
    );
    const batch = fixtureBatch(
      await rpc(dependencies.client, "football_historical_performance_fixture_batch", {
        p_provider_name: "sportsmonks",
        p_season_external_id: String(config.seasonId),
        p_after_fixture_external_id: request.afterFixtureExternalId,
        p_limit: request.batchSize,
      }),
      config.seasonId,
    );
    if (batch.items.length < 1) {
      throw new HistoricalPerformanceRuntimeError("historical_fixture_batch_empty");
    }
    let excludedIncompleteRows = 0;
    let excludedMappingRows = 0;
    let performanceRows = 0;
    let quarantinedFixtures = 0;
    let anonymousStarterRowsTotal = 0;
    const quarantinedFixtureIds: string[] = [];
    for (const fixture of batch.items) {
      const payload = await providerFixtureRequest(
        fixture.externalFixtureId,
        config,
        dependencies,
        counts,
      );
      let normalized: NormalizedHistoricalFixture;
      try {
        normalized = await normalizeHistoricalFixture(
          payload,
          Number(fixture.externalFixtureId),
          config.seasonId,
        );
      } catch (error) {
        if (
          error instanceof HistoricalPerformanceRuntimeError &&
          error.code === "historical_fixture_anonymous_starters_exceeded" &&
          error.diagnostic
        ) {
          // BG-0011 option B: this fixture fails the bounded-anonymous rule outright (currently
          // measured: exactly fixtures 19596474 and 19596475). It is quarantined entirely — none
          // of its rows, not even identified ones, are persisted — and the batch continues.
          quarantinedFixtures += 1;
          anonymousStarterRowsTotal += Number(error.diagnostic.anonymousStarterRows ?? 0);
          quarantinedFixtureIds.push(fixture.externalFixtureId);
          await rpc(dependencies.client, "quarantine_historical_player_fixture_performance", {
            p_provider_name: "sportsmonks",
            p_season_external_id: String(config.seasonId),
            p_fixture_external_id: fixture.externalFixtureId,
            p_source_version: error.diagnostic.sourceVersion,
            p_coverage: error.diagnostic.coverage,
            p_observed_at: (dependencies.now?.() ?? new Date()).toISOString(),
          });
          counts.rejected += 1;
          continue;
        }
        throw error;
      }
      counts.fetched += normalized.coverage.lineupRowsSeen;
      anonymousStarterRowsTotal += normalized.coverage.anonymousStarterRows;
      const persisted = performancePersistedCounts(
        await rpc(dependencies.client, "ingest_historical_player_fixture_performance", {
          p_provider_name: "sportsmonks",
          p_season_external_id: String(config.seasonId),
          p_fixture_external_id: fixture.externalFixtureId,
          p_source_version: normalized.sourceVersion,
          p_rows: normalized.rows,
          p_coverage: normalized.coverage,
          p_observed_at: (dependencies.now?.() ?? new Date()).toISOString(),
        }),
        normalized.coverage,
      );
      counts.validated += persisted.active;
      performanceRows += persisted.active;
      excludedIncompleteRows += persisted.excludedIncompleteRows;
      excludedMappingRows += persisted.excludedMappingRows;
      counts.inserted += persisted.inserted;
      counts.updated += persisted.updated;
      counts.skipped += persisted.skipped + persisted.excludedIncompleteRows;
    }
    await complete(
      dependencies.client,
      runId,
      "succeeded",
      counts,
      {
        seasonId: config.seasonId,
        nextCursor: batch.nextCursor,
        hasMore: batch.hasMore,
      },
      null,
    );
    return {
      provider: "sportsmonks",
      seasonId: config.seasonId,
      action: "ingest_batch",
      expectedFixtureCount: batch.expectedFixtureCount,
      fixturesProcessed: batch.items.length,
      acceptedFixtures: batch.items.length - quarantinedFixtures,
      quarantinedFixtures,
      quarantinedFixtureIds,
      anonymousStarterRowsTotal,
      performanceRows,
      excludedIncompleteRows,
      excludedMappingRows,
      nextCursor: batch.nextCursor,
      hasMore: batch.hasMore,
      counters: counts,
    };
  } catch (error) {
    const code =
      error instanceof HistoricalPerformanceRuntimeError
        ? error.code
        : "historical_performance_failed";
    if (runId) {
      try {
        await complete(
          dependencies.client,
          runId,
          "failed",
          counts,
          { seasonId: config.seasonId },
          code,
        );
      } catch {
        // Preserve the original failure.
      }
    }
    throw error;
  }
}

async function deriveRatings(
  config: Configuration,
  dependencies: HistoricalPerformanceDependencies,
): Promise<JsonRecord> {
  const counts: RuntimeCounters = {
    fetched: 0,
    validated: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    rejected: 0,
    retries: 0,
  };
  let runId: string | null = null;
  try {
    runId = String(
      await rpc(dependencies.client, "begin_football_ingestion", {
        p_provider_name: "sportsmonks",
        p_job_type: "player_ratings",
        p_target_scope: {
          seasonId: config.seasonId,
          algorithmVersion: PRESEASON_RATING_V2,
          historicalOnly: true,
        },
        p_checkpoint: {},
      }),
    );
    const inputs = ratingInputs(
      await rpc(dependencies.client, "football_historical_player_rating_inputs", {
        p_provider_name: "sportsmonks",
        p_season_external_id: String(config.seasonId),
      }),
      config.seasonId,
    );
    counts.fetched = inputs.performanceCount;
    const ratings = calculatePreseasonRatings(
      inputs.candidates,
      inputs.statistics,
      PRESEASON_RATING_V2,
    );
    counts.validated = ratings.length;
    const persisted = persistedCounts(
      await rpc(dependencies.client, "ingest_historical_player_season_ratings", {
        p_provider_name: "sportsmonks",
        p_season_external_id: String(config.seasonId),
        p_algorithm_version: PRESEASON_RATING_V2,
        p_rows: ratings,
        p_observed_at: (dependencies.now?.() ?? new Date()).toISOString(),
      }),
    );
    if (persisted.active !== ratings.length) {
      throw new HistoricalPerformanceRuntimeError("rating_reconciliation_failed");
    }
    counts.inserted = persisted.inserted;
    counts.updated = persisted.updated;
    counts.skipped = persisted.skipped;
    const ratingValues = ratings.map((rating) => rating.rating);
    await complete(
      dependencies.client,
      runId,
      "succeeded",
      counts,
      {
        seasonId: config.seasonId,
        algorithmVersion: PRESEASON_RATING_V2,
        sourceVersion: inputs.sourceVersion,
      },
      null,
    );
    return {
      provider: "sportsmonks",
      seasonId: config.seasonId,
      action: "derive_ratings",
      historicalOnly: true,
      algorithmVersion: PRESEASON_RATING_V2,
      expectedFixtureCount: inputs.expectedFixtureCount,
      performanceRows: inputs.performanceCount,
      candidates: ratings.length,
      sourceVersion: inputs.sourceVersion,
      ratingRange: {
        minimum: Math.min(...ratingValues),
        maximum: Math.max(...ratingValues),
      },
      counters: counts,
    };
  } catch (error) {
    const code =
      error instanceof HistoricalPerformanceRuntimeError
        ? error.code
        : "historical_rating_derivation_failed";
    if (runId) {
      try {
        await complete(
          dependencies.client,
          runId,
          "failed",
          counts,
          { seasonId: config.seasonId, algorithmVersion: PRESEASON_RATING_V2 },
          code,
        );
      } catch {
        // Preserve the original failure.
      }
    }
    throw error;
  }
}

export async function handleSportsMonksHistoricalPlayerPerformanceRequest(
  request: Request,
  dependencies: HistoricalPerformanceDependencies,
): Promise<Response> {
  let config: Configuration;
  try {
    config = configuration(dependencies.environment);
  } catch {
    return json(503, { error: "service_unavailable" });
  }
  if (
    request.method !== "POST" ||
    !timingSafeEqual(request.headers.get("x-botolago-ingestion-key") ?? "", config.triggerSecret)
  ) {
    return json(401, { error: "unauthorized" });
  }
  let body: HistoricalRequest;
  try {
    body = await parseRequest(request);
  } catch (error) {
    const code =
      error instanceof HistoricalPerformanceRuntimeError ? error.code : "invalid_request";
    return json(code === "request_too_large" ? 413 : 400, { error: code });
  }
  try {
    return json(
      200,
      body.action === "ingest_batch"
        ? await ingestBatch(body, config, dependencies)
        : await deriveRatings(config, dependencies),
    );
  } catch (error) {
    const code =
      error instanceof HistoricalPerformanceRuntimeError
        ? error.code
        : "historical_performance_failed";
    const status = code === "provider_rate_limited" ? 429 : 503;
    return json(status, {
      error: code,
      ...(error instanceof HistoricalPerformanceRuntimeError && error.diagnostic
        ? { diagnostic: error.diagnostic }
        : {}),
    });
  }
}
