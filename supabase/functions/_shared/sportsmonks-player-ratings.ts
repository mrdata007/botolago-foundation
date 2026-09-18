export type RatingPosition = "GK" | "DEF" | "MID" | "FWD";

export interface RatingCandidate {
  readonly externalPlayerId: string;
  readonly position: RatingPosition;
}

export interface PlayerSeasonStatistics extends RatingCandidate {
  appearances: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  goalsConceded: number;
  saves: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  yellowCards: number;
  redCards: number;
  secondYellowDismissals: number;
  ownGoals: number;
  providerRatingWeighted: number;
  providerRatingMinutes: number;
}

export interface CalculatedPlayerRating {
  readonly externalPlayerId: string;
  readonly position: RatingPosition;
  readonly appearances: number;
  readonly starts: number;
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
  readonly fantasyEquivalentPoints: number;
  readonly pointsPer90: number;
  readonly confidence: number;
  readonly rating: number;
  readonly algorithmVersion:
    | "botolago-preseason-rating-v1"
    | "botolago-preseason-rating-v2-fixture-performance";
}

export interface RatingsRpcResult {
  readonly data: unknown;
  readonly error: { readonly message?: string; readonly code?: string } | null;
}

export interface RatingsRpcClient {
  schema(name: "api"): {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<RatingsRpcResult>;
  };
}

type JsonRecord = Record<string, unknown>;
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface RatingsRuntimeDependencies {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly client: RatingsRpcClient;
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

interface Counters {
  fetched: number;
  validated: number;
  inserted: number;
  updated: number;
  skipped: number;
  rejected: number;
  retries: number;
}

const OFFICIAL_BASE_URL = "https://api.sportmonks.com/v3/football";
export const PRESEASON_RATING_V1 = "botolago-preseason-rating-v1" as const;
export const PRESEASON_RATING_V2 = "botolago-preseason-rating-v2-fixture-performance" as const;
type PreseasonRatingAlgorithm = typeof PRESEASON_RATING_V1 | typeof PRESEASON_RATING_V2;
const ALGORITHM_VERSION = PRESEASON_RATING_V1;
const MAX_REQUEST_BYTES = 1_024;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_PAGES = 20;
const PAGE_SIZE = 50;

/**
 * Minimum share of the rating candidate set that the provider season
 * statistics must cover before any rating may be persisted.
 *
 * A candidate counts as covered when at least one accepted provider season
 * statistics record was matched to it. Below this share the run fails closed:
 * the rating formula shrinks an unmatched candidate to the neutral 6.0 with
 * confidence 0, so a thin or empty provider response would otherwise be
 * written to the database as if it were real history (see BG-0011: five runs
 * reported "succeeded" with records_fetched = 0 and wrote 1188 neutral rows).
 */
export const MIN_STATISTICS_COVERAGE = 0.5;

/** No provider season statistics record was returned at all (records_fetched = 0). */
export const PLAYER_STATISTICS_UNAVAILABLE = "player_statistics_unavailable" as const;

/** Statistics were returned but cover less than MIN_STATISTICS_COVERAGE of the candidates. */
export const PLAYER_STATISTICS_COVERAGE_INSUFFICIENT =
  "player_statistics_coverage_insufficient" as const;

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
  appearances: 321,
  starts: 322,
  ownGoals: 324,
} as const;

export class RatingsRuntimeError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "RatingsRuntimeError";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, code = "invalid_provider_payload"): JsonRecord {
  if (!isRecord(value)) throw new RatingsRuntimeError(code);
  return value;
}

function required(environment: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new RatingsRuntimeError("invalid_runtime_configuration");
  return value;
}

function integerSetting(
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const raw = required(environment, name);
  if (!/^\d+$/.test(raw)) throw new RatingsRuntimeError("invalid_runtime_configuration");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RatingsRuntimeError("invalid_runtime_configuration");
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
    throw new RatingsRuntimeError("invalid_runtime_configuration");
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

async function parseRequest(request: Request): Promise<void> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new RatingsRuntimeError("request_too_large");
  }
  const source = await request.text();
  if (source.length > MAX_REQUEST_BYTES) throw new RatingsRuntimeError("request_too_large");
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new RatingsRuntimeError("invalid_request");
  }
  const body = record(value, "invalid_request");
  if (body.job !== "preseason_ratings" || Object.keys(body).some((key) => key !== "job")) {
    throw new RatingsRuntimeError("invalid_request");
  }
}

async function responseJson(response: Response): Promise<JsonRecord> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new RatingsRuntimeError("provider_response_too_large");
  }
  const source = await response.text();
  if (source.length > MAX_RESPONSE_BYTES)
    throw new RatingsRuntimeError("provider_response_too_large");
  try {
    return record(JSON.parse(source));
  } catch (error) {
    if (error instanceof RatingsRuntimeError) throw error;
    throw new RatingsRuntimeError("invalid_provider_payload");
  }
}

async function providerRequest(
  page: number,
  config: Configuration,
  dependencies: RatingsRuntimeDependencies,
  counts: Counters,
): Promise<JsonRecord> {
  const url = new URL(`${OFFICIAL_BASE_URL}/statistics/seasons/players/${config.seasonId}`);
  url.searchParams.set("include", "details");
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(PAGE_SIZE));
  if (url.origin !== "https://api.sportmonks.com" || url.href.includes(config.token)) {
    throw new RatingsRuntimeError("provider_origin_guard_failed");
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
        counts.retries += 1;
        await sleep(250 * 2 ** attempt);
        continue;
      }
      throw new RatingsRuntimeError(
        response.status === 429 ? "provider_rate_limited" : "provider_unavailable",
      );
    } catch (error) {
      if (error instanceof RatingsRuntimeError) throw error;
      if (attempt < config.maxRetries) {
        counts.retries += 1;
        await sleep(250 * 2 ** attempt);
        continue;
      }
      throw new RatingsRuntimeError("provider_unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new RatingsRuntimeError("provider_unavailable");
}

function positiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new RatingsRuntimeError("invalid_provider_payload");
  }
  return value;
}

function nonNegativeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new RatingsRuntimeError("invalid_provider_payload");
  }
  return value;
}

function positionFromId(value: unknown): RatingPosition {
  const id = positiveInteger(value);
  const positions: Readonly<Record<number, RatingPosition>> = {
    24: "GK",
    25: "DEF",
    26: "MID",
    27: "FWD",
  };
  const position = positions[id];
  if (!position) throw new RatingsRuntimeError("invalid_provider_payload");
  return position;
}

function detailNumber(detail: JsonRecord, rating: boolean): number {
  const value = detail.value;
  let candidate: unknown = value;
  if (isRecord(value)) {
    candidate = rating ? (value.average ?? value.total) : (value.total ?? value.count);
  }
  if (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate < 0) {
    throw new RatingsRuntimeError("invalid_provider_payload");
  }
  if (!rating && !Number.isSafeInteger(candidate)) {
    throw new RatingsRuntimeError("invalid_provider_payload");
  }
  if (rating && candidate > 10) throw new RatingsRuntimeError("invalid_provider_payload");
  return candidate;
}

function emptyStatistics(candidate: RatingCandidate): PlayerSeasonStatistics {
  return {
    ...candidate,
    appearances: 0,
    starts: 0,
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
    providerRatingWeighted: 0,
    providerRatingMinutes: 0,
  };
}

interface NormalizedProviderRecord {
  readonly statistics: PlayerSeasonStatistics;
  /**
   * False when the provider flagged the record with `has_values: false`, i.e.
   * it carries no statistics at all. Such a record must not count as
   * statistics coverage: a full page of them would otherwise pass the
   * coverage floor and persist only neutral 6.0 / confidence 0 ratings.
   */
  readonly hasValues: boolean;
}

function normalizedStatistics(value: unknown, seasonId: number): NormalizedProviderRecord {
  const raw = record(value);
  if (positiveInteger(raw.season_id) !== seasonId) {
    throw new RatingsRuntimeError("invalid_provider_payload");
  }
  const candidate: RatingCandidate = {
    externalPlayerId: String(positiveInteger(raw.player_id)),
    position: positionFromId(raw.position_id),
  };
  const metrics = emptyStatistics(candidate);
  if (raw.has_values === false) return { statistics: metrics, hasValues: false };
  if (!Array.isArray(raw.details)) throw new RatingsRuntimeError("invalid_provider_payload");
  const seen = new Set<number>();
  let providerRating: number | null = null;
  for (const item of raw.details) {
    const detail = record(item);
    const typeId = positiveInteger(detail.type_id);
    if (seen.has(typeId)) throw new RatingsRuntimeError("invalid_provider_payload");
    seen.add(typeId);
    const key = (Object.entries(TYPE) as Array<[keyof typeof TYPE, number]>).find(
      (entry) => entry[1] === typeId,
    )?.[0];
    if (!key) continue;
    const number = detailNumber(detail, key === "providerRating");
    if (key === "providerRating") providerRating = number;
    else metrics[key] = number;
  }
  if (metrics.starts > metrics.appearances || metrics.minutes > metrics.appearances * 130) {
    throw new RatingsRuntimeError("invalid_provider_payload");
  }
  if (providerRating !== null) {
    const weight = Math.max(1, metrics.minutes);
    metrics.providerRatingWeighted = providerRating * weight;
    metrics.providerRatingMinutes = weight;
  }
  return { statistics: metrics, hasValues: true };
}

function mergeStatistics(target: PlayerSeasonStatistics, source: PlayerSeasonStatistics): void {
  if (target.externalPlayerId !== source.externalPlayerId || target.position !== source.position) {
    throw new RatingsRuntimeError("invalid_provider_payload");
  }
  for (const key of [
    "appearances",
    "starts",
    "minutes",
    "goals",
    "assists",
    "cleanSheets",
    "goalsConceded",
    "saves",
    "penaltiesSaved",
    "penaltiesMissed",
    "yellowCards",
    "redCards",
    "secondYellowDismissals",
    "ownGoals",
    "providerRatingWeighted",
    "providerRatingMinutes",
  ] as const) {
    target[key] += source[key];
  }
}

function fantasyEquivalentPoints(stats: PlayerSeasonStatistics): number {
  const goalPoints: Readonly<Record<RatingPosition, number>> = {
    GK: 10,
    DEF: 6,
    MID: 5,
    FWD: 4,
  };
  const cleanSheetPoints: Readonly<Record<RatingPosition, number>> = {
    GK: 4,
    DEF: 4,
    MID: 1,
    FWD: 0,
  };
  const fullAppearances = Math.min(stats.appearances, Math.floor(stats.minutes / 60));
  const appearancePoints = stats.appearances + fullAppearances;
  const conceded =
    stats.position === "GK" || stats.position === "DEF" ? -Math.floor(stats.goalsConceded / 2) : 0;
  const saves = stats.position === "GK" ? Math.floor(stats.saves / 3) : 0;
  return (
    appearancePoints +
    stats.goals * goalPoints[stats.position] +
    stats.assists * 3 +
    stats.cleanSheets * cleanSheetPoints[stats.position] +
    saves +
    stats.penaltiesSaved * 5 +
    conceded -
    stats.penaltiesMissed * 2 -
    stats.yellowCards -
    stats.redCards * 3 -
    stats.secondYellowDismissals * 3 -
    stats.ownGoals * 2
  );
}

function percentRanks(values: readonly number[]): readonly number[] {
  if (values.length <= 1) return values.map(() => 0.5);
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value || a.index - b.index);
  const output = Array<number>(values.length);
  let index = 0;
  while (index < sorted.length) {
    let end = index + 1;
    while (end < sorted.length && sorted[end].value === sorted[index].value) end += 1;
    // Equal values share their average percentile rank. Using the first tied
    // index would systematically underrate every player in a tied group.
    const rank = (index + end - 1) / 2 / (sorted.length - 1);
    for (let cursor = index; cursor < end; cursor += 1) output[sorted[cursor].index] = rank;
    index = end;
  }
  return output;
}

function rounded(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Versioned preseason rating. It uses the immutable BotolaGO v1 scoring table
 * for fantasy-equivalent points, then compares players only inside their
 * position: 50% official provider rating, 30% total points and 20% points/90.
 * Fewer than 900 minutes shrinks the result toward neutral 6.0.
 */
export function calculatePreseasonRatings(
  candidates: readonly RatingCandidate[],
  statistics: ReadonlyMap<string, PlayerSeasonStatistics>,
  algorithmVersion: PreseasonRatingAlgorithm = PRESEASON_RATING_V1,
): readonly CalculatedPlayerRating[] {
  if (
    new Set(candidates.map((candidate) => candidate.externalPlayerId)).size !== candidates.length
  ) {
    throw new RatingsRuntimeError("duplicate_rating_candidate");
  }
  const base = candidates.map((candidate) => {
    const stats = statistics.get(candidate.externalPlayerId) ?? emptyStatistics(candidate);
    if (stats.position !== candidate.position) throw new RatingsRuntimeError("position_mismatch");
    const points = fantasyEquivalentPoints(stats);
    const pointsPer90 = stats.minutes > 0 ? (points * 90) / stats.minutes : 0;
    const providerRating =
      stats.providerRatingMinutes > 0
        ? stats.providerRatingWeighted / stats.providerRatingMinutes
        : null;
    return { candidate, stats, points, pointsPer90, providerRating };
  });

  const output = Array<CalculatedPlayerRating>(base.length);
  for (const position of ["GK", "DEF", "MID", "FWD"] as const) {
    const group = base
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.candidate.position === position);
    const totalRanks = percentRanks(group.map(({ row }) => row.points));
    const rateRanks = percentRanks(group.map(({ row }) => row.pointsPer90));
    const rated = group.filter(({ row }) => row.providerRating !== null);
    const providerRanks = percentRanks(rated.map(({ row }) => row.providerRating as number));
    const providerByIndex = new Map(
      rated.map(({ index }, cursor) => [index, providerRanks[cursor]]),
    );
    group.forEach(({ row, index }, cursor) => {
      const providerRank = providerByIndex.get(index) ?? 0.5;
      const performance = providerRank * 0.5 + totalRanks[cursor] * 0.3 + rateRanks[cursor] * 0.2;
      const confidence = Math.min(1, row.stats.minutes / 900);
      const unshrunk = 4 + 6 * performance;
      const rating = Math.min(10, Math.max(4, 6 + confidence * (unshrunk - 6)));
      output[index] = {
        externalPlayerId: row.candidate.externalPlayerId,
        position,
        appearances: row.stats.appearances,
        starts: row.stats.starts,
        minutes: row.stats.minutes,
        goals: row.stats.goals,
        assists: row.stats.assists,
        cleanSheets: row.stats.cleanSheets,
        goalsConceded: row.stats.goalsConceded,
        saves: row.stats.saves,
        penaltiesSaved: row.stats.penaltiesSaved,
        penaltiesMissed: row.stats.penaltiesMissed,
        yellowCards: row.stats.yellowCards,
        redCards: row.stats.redCards,
        secondYellowDismissals: row.stats.secondYellowDismissals,
        ownGoals: row.stats.ownGoals,
        providerRating: row.providerRating === null ? null : rounded(row.providerRating, 2),
        fantasyEquivalentPoints: row.points,
        pointsPer90: rounded(row.pointsPer90, 3),
        confidence: rounded(confidence, 3),
        rating: rounded(rating, 1),
        algorithmVersion,
      };
    });
  }
  return output;
}

async function rpc(
  client: RatingsRpcClient,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await client.schema("api").rpc(name, args);
  if (result.error) {
    if (result.error.code === "P0002") throw new RatingsRuntimeError("mapping_not_found");
    if (result.error.code === "22023") throw new RatingsRuntimeError("invalid_provider_payload");
    throw new RatingsRuntimeError("database_unavailable");
  }
  return result.data;
}

function candidateRows(value: unknown): RatingCandidate[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 1_000) {
    throw new RatingsRuntimeError("invalid_database_response");
  }
  return value.map((item) => {
    const row = record(item, "invalid_database_response");
    const externalPlayerId = typeof row.externalPlayerId === "string" ? row.externalPlayerId : "";
    if (!/^\d+$/.test(externalPlayerId)) throw new RatingsRuntimeError("invalid_database_response");
    if (
      row.position !== "GK" &&
      row.position !== "DEF" &&
      row.position !== "MID" &&
      row.position !== "FWD"
    ) {
      throw new RatingsRuntimeError("invalid_database_response");
    }
    return { externalPlayerId, position: row.position };
  });
}

function resultCounts(value: unknown): {
  inserted: number;
  updated: number;
  skipped: number;
} {
  const row = record(value, "invalid_database_response");
  return {
    inserted: nonNegativeInteger(row.inserted),
    updated: nonNegativeInteger(row.updated),
    skipped: nonNegativeInteger(row.skipped),
  };
}

function hasMore(payload: JsonRecord, rowCount: number): boolean {
  const pagination = isRecord(payload.pagination)
    ? payload.pagination
    : isRecord(payload.meta) && isRecord(payload.meta.pagination)
      ? payload.meta.pagination
      : null;
  if (pagination && typeof pagination.has_more === "boolean") return pagination.has_more;
  return rowCount === PAGE_SIZE;
}

async function sha256(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function recordRejection(
  client: RatingsRpcClient,
  runId: string,
  raw: unknown,
  error: unknown,
): Promise<void> {
  const row = isRecord(raw) ? raw : {};
  const externalId = typeof row.player_id === "number" ? String(row.player_id) : "";
  await rpc(client, "record_football_ingestion_rejection", {
    p_run_id: runId,
    p_entity_type: "player",
    p_external_id: externalId,
    p_payload_fingerprint: await sha256(raw),
    p_error_code: error instanceof RatingsRuntimeError ? error.code : "invalid_provider_payload",
    p_validation_issues: [],
  });
}

async function complete(
  client: RatingsRpcClient,
  runId: string,
  status: "succeeded" | "partial" | "failed",
  counts: Counters,
  seasonId: number,
  errorCode = "player_ratings_failed",
): Promise<void> {
  await rpc(client, "complete_football_ingestion", {
    p_run_id: runId,
    p_status: status,
    p_checkpoint: { seasonId, algorithmVersion: ALGORITHM_VERSION },
    p_records_fetched: counts.fetched,
    p_records_validated: counts.validated,
    p_records_inserted: counts.inserted,
    p_records_updated: counts.updated,
    p_records_skipped: counts.skipped,
    p_records_rejected: counts.rejected,
    p_retry_count: counts.retries,
    p_error_code: status === "failed" ? errorCode : null,
    p_error_summary:
      status === "failed" ? "Player ratings failed; inspect correlated server logs." : null,
  });
}

export async function handleSportsMonksPlayerRatingsRequest(
  request: Request,
  dependencies: RatingsRuntimeDependencies,
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
  try {
    await parseRequest(request);
  } catch (error) {
    const code = error instanceof RatingsRuntimeError ? error.code : "invalid_request";
    return json(code === "request_too_large" ? 413 : 400, { error: code });
  }

  const counts: Counters = {
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
          algorithmVersion: ALGORITHM_VERSION,
        },
        p_checkpoint: {},
      }),
    );
    const candidates = candidateRows(
      await rpc(dependencies.client, "football_player_rating_candidates", {
        p_provider_name: "sportsmonks",
        p_season_external_id: String(config.seasonId),
      }),
    );
    const byId = new Map(
      candidates.map((candidate) => [candidate.externalPlayerId, emptyStatistics(candidate)]),
    );
    const covered = new Set<string>();
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const payload = await providerRequest(page, config, dependencies, counts);
      if (!Array.isArray(payload.data)) throw new RatingsRuntimeError("invalid_provider_payload");
      for (const raw of payload.data) {
        counts.fetched += 1;
        try {
          const normalized = normalizedStatistics(raw, config.seasonId);
          const target = byId.get(normalized.statistics.externalPlayerId);
          if (!target) {
            counts.skipped += 1;
            continue;
          }
          mergeStatistics(target, normalized.statistics);
          // Only a record that actually carries statistics counts as coverage.
          // A `has_values: false` record still maps to the candidate (who then
          // legitimately rates 6.0 / 0 like any unused squad player) but it is
          // empty provider evidence, not coverage.
          if (normalized.hasValues) covered.add(normalized.statistics.externalPlayerId);
        } catch (error) {
          counts.rejected += 1;
          await recordRejection(dependencies.client, runId, raw, error);
        }
      }
      if (!hasMore(payload, payload.data.length)) break;
      if (page === MAX_PAGES) throw new RatingsRuntimeError("provider_page_limit_exceeded");
    }
    // Fail closed before any write: without real provider statistics every
    // rating collapses to the neutral 6.0 / confidence 0 fallback, which is
    // indistinguishable from history once persisted.
    if (counts.fetched === 0) {
      throw new RatingsRuntimeError(PLAYER_STATISTICS_UNAVAILABLE);
    }
    if (covered.size / candidates.length < MIN_STATISTICS_COVERAGE) {
      throw new RatingsRuntimeError(PLAYER_STATISTICS_COVERAGE_INSUFFICIENT);
    }

    const ratings = calculatePreseasonRatings(candidates, byId);
    counts.validated = ratings.length;
    const observedAt = (dependencies.now?.() ?? new Date()).toISOString();
    for (let offset = 0; offset < ratings.length; offset += PAGE_SIZE) {
      const batch = ratings.slice(offset, offset + PAGE_SIZE);
      const persisted = resultCounts(
        await rpc(dependencies.client, "ingest_player_season_ratings", {
          p_provider_name: "sportsmonks",
          p_season_external_id: String(config.seasonId),
          p_algorithm_version: ALGORITHM_VERSION,
          p_rows: batch,
          p_observed_at: observedAt,
        }),
      );
      counts.inserted += persisted.inserted;
      counts.updated += persisted.updated;
      counts.skipped += persisted.skipped;
    }
    await complete(
      dependencies.client,
      runId,
      counts.rejected > 0 ? "partial" : "succeeded",
      counts,
      config.seasonId,
    );
    const ratingValues = ratings.map((rating) => rating.rating);
    return json(200, {
      provider: "sportsmonks",
      seasonId: config.seasonId,
      algorithmVersion: ALGORITHM_VERSION,
      candidates: candidates.length,
      ratingRange: {
        minimum: Math.min(...ratingValues),
        maximum: Math.max(...ratingValues),
      },
      counters: counts,
    });
  } catch (error) {
    const code = error instanceof RatingsRuntimeError ? error.code : "player_ratings_failed";
    if (runId) {
      try {
        await complete(dependencies.client, runId, "failed", counts, config.seasonId, code);
      } catch {
        // Preserve the original failure without returning database details.
      }
    }
    return json(code === "provider_rate_limited" ? 429 : 503, { error: code });
  }
}
