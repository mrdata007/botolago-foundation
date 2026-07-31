export interface ContentRpcResult {
  readonly data: unknown;
  readonly error: { readonly message?: string; readonly code?: string } | null;
}

export interface ContentRpcClient {
  schema(name: "api"): {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<ContentRpcResult>;
  };
}

type JsonRecord = Record<string, unknown>;
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface ContentRuntimeDependencies {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly client: ContentRpcClient;
  readonly fetch?: FetchLike;
  readonly now?: () => Date;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

interface ContentConfiguration {
  readonly token: string;
  readonly seasonId: number;
  readonly teamIds: readonly number[];
  readonly timeoutMs: number;
  readonly maxRetries: number;
}

interface JobCounts {
  fetched: number;
  validated: number;
  inserted: number;
  updated: number;
  skipped: number;
  rejected: number;
  retries: number;
}

interface SquadJobCounts extends JobCounts {
  uniquePlayers: number;
  playersInserted: number;
  playersUpdated: number;
  playersSkipped: number;
}

interface NormalizedMembership {
  readonly externalPlayerId: string;
  readonly fullName: string;
  readonly displayName: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly dateOfBirth: string | null;
  readonly position: "goalkeeper" | "defender" | "midfielder" | "forward";
  readonly preferredFoot: "unknown";
  readonly shirtNumber: number | null;
  readonly freshness: {
    readonly updatedAt: string;
    readonly sourceSequence: number;
    readonly sourceVersion: string;
  };
}

interface NormalizedStanding {
  readonly teamExternalId: string;
  readonly rank: number;
  readonly played: number;
  readonly won: number;
  readonly drawn: number;
  readonly lost: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
  readonly points: number;
  readonly form: null;
}

const OFFICIAL_BASE_URL = "https://api.sportmonks.com/v3/football";
const MAX_REQUEST_BYTES = 2_048;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_TEAMS = 20;

export class ContentRuntimeError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ContentRuntimeError";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, code = "invalid_provider_payload"): JsonRecord {
  if (!isRecord(value)) throw new ContentRuntimeError(code);
  return value;
}

function positiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new ContentRuntimeError("invalid_provider_payload");
  }
  return value;
}

function nullablePositiveInteger(value: unknown): number | null {
  return value === null || value === undefined ? null : positiveInteger(value);
}

function nonNegativeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ContentRuntimeError("invalid_provider_payload");
  }
  return value;
}

function required(environment: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new ContentRuntimeError("invalid_runtime_configuration");
  return value;
}

function integerSetting(
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const raw = required(environment, name);
  if (!/^\d+$/.test(raw)) throw new ContentRuntimeError("invalid_runtime_configuration");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new ContentRuntimeError("invalid_runtime_configuration");
  }
  return value;
}

function hasControlOrWhitespace(value: string): boolean {
  return Array.from(value).some((character) => {
    const point = character.codePointAt(0) ?? 0;
    return point <= 0x20 || point === 0x7f;
  });
}

function configuration(
  environment: Readonly<Record<string, string | undefined>>,
): ContentConfiguration {
  const token = required(environment, "SPORTSMONKS_API_TOKEN");
  if (token.length < 16 || token.length > 512 || hasControlOrWhitespace(token)) {
    throw new ContentRuntimeError("invalid_runtime_configuration");
  }
  if (
    required(environment, "FOOTBALL_PROVIDER") !== "sportsmonks" ||
    required(environment, "FOOTBALL_PROVIDER_BASE_URL").replace(/\/$/, "") !== OFFICIAL_BASE_URL
  ) {
    throw new ContentRuntimeError("invalid_runtime_configuration");
  }
  const teamIds = required(environment, "FOOTBALL_SPORTSMONKS_TEAM_IDS")
    .split(",")
    .map((value) => {
      if (!/^\d+$/.test(value)) throw new ContentRuntimeError("invalid_runtime_configuration");
      const id = Number(value);
      if (!Number.isSafeInteger(id) || id < 1) {
        throw new ContentRuntimeError("invalid_runtime_configuration");
      }
      return id;
    });
  if (
    teamIds.length < 1 ||
    teamIds.length > MAX_TEAMS ||
    new Set(teamIds).size !== teamIds.length
  ) {
    throw new ContentRuntimeError("invalid_runtime_configuration");
  }
  return {
    token,
    seasonId: integerSetting(environment, "FOOTBALL_SPORTSMONKS_SEASON_ID", 1, 1_000_000_000),
    teamIds,
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
    throw new ContentRuntimeError("request_too_large");
  }
  const source = await request.text();
  if (source.length > MAX_REQUEST_BYTES) throw new ContentRuntimeError("request_too_large");
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new ContentRuntimeError("invalid_request");
  }
  const body = record(value, "invalid_request");
  if (body.job !== "historical_content" || Object.keys(body).some((key) => key !== "job")) {
    throw new ContentRuntimeError("invalid_request");
  }
}

async function responseJson(response: Response): Promise<JsonRecord> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new ContentRuntimeError("provider_response_too_large");
  }
  const source = await response.text();
  if (source.length > MAX_RESPONSE_BYTES) {
    throw new ContentRuntimeError("provider_response_too_large");
  }
  try {
    return record(JSON.parse(source));
  } catch (error) {
    if (error instanceof ContentRuntimeError) throw error;
    throw new ContentRuntimeError("invalid_provider_payload");
  }
}

async function providerRequest(
  path: string,
  query: Readonly<Record<string, string>>,
  config: ContentConfiguration,
  dependencies: ContentRuntimeDependencies,
  counts: JobCounts,
): Promise<JsonRecord> {
  if (!path.startsWith("/") || path.includes("?") || path.includes("#")) {
    throw new ContentRuntimeError("invalid_provider_path");
  }
  const url = new URL(`${OFFICIAL_BASE_URL}${path}`);
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
  if (url.origin !== "https://api.sportmonks.com" || url.href.includes(config.token)) {
    throw new ContentRuntimeError("provider_origin_guard_failed");
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
      throw new ContentRuntimeError(
        response.status === 429 ? "provider_rate_limited" : "provider_unavailable",
      );
    } catch (error) {
      if (error instanceof ContentRuntimeError) throw error;
      if (attempt < config.maxRetries) {
        counts.retries += 1;
        await sleep(250 * 2 ** attempt);
        continue;
      }
      throw new ContentRuntimeError("provider_unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new ContentRuntimeError("provider_unavailable");
}

function nonEmptyString(value: unknown, maximum: number): string {
  if (typeof value !== "string") throw new ContentRuntimeError("invalid_provider_payload");
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new ContentRuntimeError("invalid_provider_payload");
  }
  return normalized;
}

function optionalString(value: unknown, maximum: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximum ? normalized : null;
}

function timestamp(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toISOString();
}

function optionalDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return null;
  }
  return value;
}

function optionalShirtNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0 || value > 99) {
    return null;
  }
  return value;
}

function canonicalPosition(value: unknown): NormalizedMembership["position"] | null {
  if (value === null || value === undefined) return null;
  const position = record(value);
  const developerName = nonEmptyString(position.developer_name, 80)
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  const mapping: Readonly<Record<string, NormalizedMembership["position"]>> = {
    GOALKEEPER: "goalkeeper",
    DEFENDER: "defender",
    MIDFIELDER: "midfielder",
    ATTACKER: "forward",
    FORWARD: "forward",
  };
  const normalized = mapping[developerName];
  if (!normalized) throw new ContentRuntimeError("invalid_provider_payload");
  return normalized;
}

function normalizeMembership(
  raw: JsonRecord,
  teamId: number,
  seasonId: number,
  observedAt: string,
): NormalizedMembership | null {
  const playerId = positiveInteger(raw.player_id);
  if (positiveInteger(raw.team_id) !== teamId || positiveInteger(raw.season_id) !== seasonId) {
    throw new ContentRuntimeError("invalid_provider_payload");
  }
  const positionId = nullablePositiveInteger(raw.position_id);
  if (positionId === null) {
    if (raw.position !== null && raw.position !== undefined) {
      throw new ContentRuntimeError("invalid_provider_payload");
    }
    return null;
  }
  const position = record(raw.position);
  if (positiveInteger(position.id) !== positionId) {
    throw new ContentRuntimeError("invalid_provider_payload");
  }
  const player = record(raw.player);
  if (positiveInteger(player.id) !== playerId) {
    throw new ContentRuntimeError("invalid_provider_payload");
  }
  const fullName = nonEmptyString(player.name ?? player.display_name ?? player.common_name, 200);
  const displayName = nonEmptyString(player.display_name ?? player.common_name ?? player.name, 120);
  const shirtNumber = optionalShirtNumber(raw.jersey_number);
  const updatedAt = timestamp(player.last_played_at, timestamp(player.updated_at, observedAt));
  const sourceSequence = Date.parse(updatedAt);
  return {
    externalPlayerId: String(playerId),
    fullName,
    displayName,
    firstName: optionalString(player.firstname, 100),
    lastName: optionalString(player.lastname, 100),
    dateOfBirth: optionalDate(player.date_of_birth),
    position: canonicalPosition(position) as NormalizedMembership["position"],
    preferredFoot: "unknown",
    shirtNumber,
    freshness: {
      updatedAt,
      sourceSequence,
      sourceVersion: `sportsmonks:${playerId}:${sourceSequence}`,
    },
  };
}

function standingDetails(raw: JsonRecord): ReadonlyMap<string, number> {
  if (!Array.isArray(raw.details)) throw new ContentRuntimeError("invalid_provider_payload");
  const details = new Map<string, number>();
  for (const candidate of raw.details) {
    const detail = record(candidate);
    const typeId = positiveInteger(detail.type_id);
    const type = record(detail.type);
    if (positiveInteger(type.id) !== typeId) {
      throw new ContentRuntimeError("invalid_provider_payload");
    }
    const name = nonEmptyString(type.developer_name, 80);
    if (typeof detail.value !== "number" || !Number.isSafeInteger(detail.value)) {
      throw new ContentRuntimeError("invalid_provider_payload");
    }
    if (details.has(name)) throw new ContentRuntimeError("invalid_provider_payload");
    details.set(name, detail.value);
  }
  return details;
}

function requiredMetric(details: ReadonlyMap<string, number>, name: string): number {
  return nonNegativeInteger(details.get(name));
}

function normalizeStanding(raw: JsonRecord, config: ContentConfiguration): NormalizedStanding {
  if (positiveInteger(raw.season_id) !== config.seasonId) {
    throw new ContentRuntimeError("invalid_provider_payload");
  }
  const participantId = positiveInteger(raw.participant_id);
  if (!config.teamIds.includes(participantId)) {
    throw new ContentRuntimeError("invalid_provider_payload");
  }
  const participant = record(raw.participant);
  if (positiveInteger(participant.id) !== participantId) {
    throw new ContentRuntimeError("invalid_provider_payload");
  }
  const details = standingDetails(raw);
  const played = requiredMetric(details, "OVERALL_MATCHES");
  const won = requiredMetric(details, "OVERALL_WINS");
  const drawn = requiredMetric(details, "OVERALL_DRAWS");
  const lost = requiredMetric(details, "OVERALL_LOST");
  const goalsFor = requiredMetric(details, "OVERALL_SCORED");
  const goalsAgainst = requiredMetric(details, "OVERALL_CONCEDED");
  const points = nonNegativeInteger(raw.points);
  if (
    requiredMetric(details, "TOTAL_POINTS") !== points ||
    details.get("OVERALL_GOAL_DIFFERENCE") !== goalsFor - goalsAgainst ||
    won + drawn + lost > played
  ) {
    throw new ContentRuntimeError("invalid_provider_payload");
  }
  return {
    teamExternalId: String(participantId),
    rank: positiveInteger(raw.position),
    played,
    won,
    drawn,
    lost,
    goalsFor,
    goalsAgainst,
    points,
    form: null,
  };
}

async function rpc(
  client: ContentRpcClient,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await client.schema("api").rpc(name, args);
  if (result.error) {
    const code =
      result.error.code === "P0002" || result.error.message === "MAPPING_NOT_FOUND"
        ? "mapping_not_found"
        : "database_unavailable";
    throw new ContentRuntimeError(code);
  }
  return result.data;
}

function emptyCounts(): JobCounts {
  return {
    fetched: 0,
    validated: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    rejected: 0,
    retries: 0,
  };
}

async function fingerprint(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function recordRejection(
  client: ContentRpcClient,
  runId: string,
  entityType: "player" | "team",
  raw: JsonRecord,
  error: unknown,
): Promise<void> {
  const code = error instanceof ContentRuntimeError ? error.code : "content_ingestion_failed";
  const id = raw.player_id ?? raw.participant_id ?? raw.id;
  await rpc(client, "record_football_ingestion_rejection", {
    p_run_id: runId,
    p_entity_type: entityType,
    p_external_id: typeof id === "number" ? String(id) : "unknown",
    p_payload_fingerprint: await fingerprint(raw),
    p_error_code: code,
    p_validation_issues: [{ code }],
  });
}

async function completeRun(
  client: ContentRpcClient,
  runId: string,
  status: "succeeded" | "partial" | "failed",
  counts: JobCounts,
  errorCode: string | null,
): Promise<void> {
  await rpc(client, "complete_football_ingestion", {
    p_run_id: runId,
    p_status: status,
    p_checkpoint: {},
    p_records_fetched: counts.fetched,
    p_records_validated: counts.validated,
    p_records_inserted: counts.inserted,
    p_records_updated: counts.updated,
    p_records_skipped: counts.skipped,
    p_records_rejected: counts.rejected,
    p_retry_count: counts.retries,
    p_error_code: errorCode,
    p_error_summary: errorCode ? "The protected historical content job did not complete." : null,
  });
}

function rpcCounts(value: unknown, fields: readonly string[]): Readonly<Record<string, number>> {
  const result = record(value, "database_unavailable");
  for (const field of fields) {
    if (typeof result[field] !== "number" || !Number.isSafeInteger(result[field])) {
      throw new ContentRuntimeError("database_unavailable");
    }
  }
  return result as Readonly<Record<string, number>>;
}

async function runSquads(
  config: ContentConfiguration,
  dependencies: ContentRuntimeDependencies,
  observedAt: string,
): Promise<SquadJobCounts> {
  const counts: SquadJobCounts = {
    ...emptyCounts(),
    uniquePlayers: 0,
    playersInserted: 0,
    playersUpdated: 0,
    playersSkipped: 0,
  };
  const uniquePlayers = new Set<string>();
  const runId = String(
    await rpc(dependencies.client, "begin_football_ingestion", {
      p_provider_name: "sportsmonks",
      p_job_type: "squads",
      p_target_scope: { seasonId: config.seasonId, teamIds: config.teamIds },
      p_checkpoint: {},
    }),
  );
  let activeRaw: JsonRecord = {};
  try {
    for (const teamId of config.teamIds) {
      const response = await providerRequest(
        `/squads/seasons/${config.seasonId}/teams/${teamId}`,
        { include: "player;position" },
        config,
        dependencies,
        counts,
      );
      if (!Array.isArray(response.data)) {
        throw new ContentRuntimeError("invalid_provider_payload");
      }
      const normalized: NormalizedMembership[] = [];
      for (const candidate of response.data) {
        activeRaw = record(candidate);
        counts.fetched += 1;
        const membership = normalizeMembership(activeRaw, teamId, config.seasonId, observedAt);
        if (membership === null) {
          counts.skipped += 1;
          continue;
        }
        counts.validated += 1;
        normalized.push(membership);
        uniquePlayers.add(membership.externalPlayerId);
      }
      const persisted = rpcCounts(
        await rpc(dependencies.client, "ingest_football_squad", {
          p_provider_name: "sportsmonks",
          p_season_external_id: String(config.seasonId),
          p_team_external_id: String(teamId),
          p_memberships: normalized,
          p_observed_at: observedAt,
          p_source_sequence: Date.parse(observedAt),
        }),
        [
          "playersInserted",
          "playersUpdated",
          "playersSkipped",
          "membershipsInserted",
          "membershipsUpdated",
        ],
      );
      counts.playersInserted += persisted.playersInserted;
      counts.playersUpdated += persisted.playersUpdated;
      counts.playersSkipped += persisted.playersSkipped;
      counts.inserted += persisted.membershipsInserted;
      counts.updated += persisted.membershipsUpdated;
    }
    counts.uniquePlayers = uniquePlayers.size;
    if (counts.inserted + counts.updated !== counts.validated) {
      throw new ContentRuntimeError("database_unavailable");
    }
    await completeRun(dependencies.client, runId, "succeeded", counts, null);
    return counts;
  } catch (error) {
    counts.rejected += 1;
    await recordRejection(dependencies.client, runId, "player", activeRaw, error);
    const code = error instanceof ContentRuntimeError ? error.code : "content_ingestion_failed";
    await completeRun(
      dependencies.client,
      runId,
      counts.validated > 0 ? "partial" : "failed",
      counts,
      code,
    );
    throw error;
  }
}

async function runStandings(
  config: ContentConfiguration,
  dependencies: ContentRuntimeDependencies,
  observedAt: string,
): Promise<JobCounts> {
  const counts = emptyCounts();
  const runId = String(
    await rpc(dependencies.client, "begin_football_ingestion", {
      p_provider_name: "sportsmonks",
      p_job_type: "standings",
      p_target_scope: { seasonId: config.seasonId },
      p_checkpoint: {},
    }),
  );
  let activeRaw: JsonRecord = {};
  try {
    const response = await providerRequest(
      `/standings/seasons/${config.seasonId}`,
      { include: "participant;details.type" },
      config,
      dependencies,
      counts,
    );
    if (!Array.isArray(response.data) || response.data.length !== config.teamIds.length) {
      throw new ContentRuntimeError("invalid_provider_payload");
    }
    const rows: NormalizedStanding[] = [];
    const teamIds = new Set<string>();
    const ranks = new Set<number>();
    for (const candidate of response.data) {
      activeRaw = record(candidate);
      counts.fetched += 1;
      const standing = normalizeStanding(activeRaw, config);
      if (teamIds.has(standing.teamExternalId) || ranks.has(standing.rank)) {
        throw new ContentRuntimeError("invalid_provider_payload");
      }
      teamIds.add(standing.teamExternalId);
      ranks.add(standing.rank);
      rows.push(standing);
      counts.validated += 1;
    }
    const persisted = rpcCounts(
      await rpc(dependencies.client, "ingest_football_standings", {
        p_provider_name: "sportsmonks",
        p_season_external_id: String(config.seasonId),
        p_rows: rows,
        p_observed_at: observedAt,
        p_source_sequence: Date.parse(observedAt),
      }),
      ["inserted", "updated"],
    );
    counts.inserted = persisted.inserted;
    counts.updated = persisted.updated;
    if (counts.inserted + counts.updated !== counts.validated) {
      throw new ContentRuntimeError("database_unavailable");
    }
    await completeRun(dependencies.client, runId, "succeeded", counts, null);
    return counts;
  } catch (error) {
    counts.rejected += 1;
    await recordRejection(dependencies.client, runId, "team", activeRaw, error);
    const code = error instanceof ContentRuntimeError ? error.code : "content_ingestion_failed";
    await completeRun(
      dependencies.client,
      runId,
      counts.validated > 0 ? "partial" : "failed",
      counts,
      code,
    );
    throw error;
  }
}

export async function handleSportsMonksHistoricalContentRequest(
  request: Request,
  dependencies: ContentRuntimeDependencies,
): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const expectedSecret = dependencies.environment.FOOTBALL_INGESTION_TRIGGER_SECRET?.trim() ?? "";
  const receivedSecret = request.headers.get("x-botolago-ingestion-key") ?? "";
  if (expectedSecret.length < 32 || !timingSafeEqual(receivedSecret, expectedSecret)) {
    return json(401, { error: "unauthorized" });
  }
  try {
    await parseRequest(request);
    const config = configuration(dependencies.environment);
    const observedAt = (dependencies.now ?? (() => new Date()))().toISOString();
    const squads = await runSquads(config, dependencies, observedAt);
    const standings = await runStandings(config, dependencies, observedAt);
    return json(200, {
      provider: "sportsmonks",
      seasonId: config.seasonId,
      jobs: { squads, standings },
    });
  } catch (error) {
    const code = error instanceof ContentRuntimeError ? error.code : "content_ingestion_failed";
    const status = code === "invalid_request" ? 400 : code === "request_too_large" ? 413 : 502;
    return json(status, { error: code });
  }
}
