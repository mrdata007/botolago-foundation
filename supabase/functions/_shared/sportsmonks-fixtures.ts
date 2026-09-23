export interface FixtureRpcResult {
  readonly data: unknown;
  readonly error: { readonly message?: string; readonly code?: string } | null;
}

export interface FixtureRpcClient {
  schema(name: "api"): {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<FixtureRpcResult>;
  };
}

type JsonRecord = Record<string, unknown>;
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface FixtureRuntimeDependencies {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly client: FixtureRpcClient;
  readonly fetch?: FetchLike;
  readonly now?: () => Date;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

interface FixtureConfiguration {
  readonly token: string;
  readonly leagueId: number;
  readonly seasonId: number;
  readonly fixtureFrom: string;
  readonly fixtureTo: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
}

interface ParsedRequest {
  readonly pageSize: number;
  readonly maxPages: number;
}

interface FixtureCounts {
  fetched: number;
  validated: number;
  inserted: number;
  updated: number;
  skipped: number;
  rejected: number;
  retries: number;
}

interface NormalizedFixture {
  readonly externalId: string;
  readonly competitionExternalId: string;
  readonly seasonExternalId: string;
  readonly roundExternalId: string | null;
  readonly homeTeamExternalId: string;
  readonly awayTeamExternalId: string;
  readonly kickoffAt: string;
  readonly status: string;
  readonly period: string;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  /** Set only for a match played to its end; see `FINAL_STATES`. */
  readonly finalizedAt: string | null;
  readonly freshness: {
    readonly updatedAt: string;
    readonly sourceSequence: number;
    readonly sourceVersion: string;
  };
}

interface ProviderPage {
  readonly rows: readonly JsonRecord[];
  readonly nextPage: number | null;
}

const OFFICIAL_BASE_URL = "https://api.sportmonks.com/v3/football";
const MAX_REQUEST_BYTES = 4_096;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_FIXTURE_WINDOW_DAYS = 100;

class FixtureRuntimeError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "FixtureRuntimeError";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, code = "invalid_provider_payload"): JsonRecord {
  if (!isRecord(value)) throw new FixtureRuntimeError(code);
  return value;
}

function positiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new FixtureRuntimeError("invalid_provider_payload");
  }
  return value;
}

function nullablePositiveInteger(value: unknown): number | null {
  return value === null || value === undefined ? null : positiveInteger(value);
}

function required(environment: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new FixtureRuntimeError("invalid_runtime_configuration");
  return value;
}

function integerSetting(
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const raw = required(environment, name);
  if (!/^\d+$/.test(raw)) throw new FixtureRuntimeError("invalid_runtime_configuration");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new FixtureRuntimeError("invalid_runtime_configuration");
  }
  return value;
}

function isoDate(value: string, code = "invalid_runtime_configuration"): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new FixtureRuntimeError(code);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new FixtureRuntimeError(code);
  }
  return value;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new FixtureRuntimeError("invalid_provider_payload");
  }
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) throw new FixtureRuntimeError("invalid_provider_payload");
  return parsed.toISOString();
}

function optionalTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return timestamp(value);
}

function hasControlOrWhitespace(value: string): boolean {
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    if (point <= 0x20 || point === 0x7f) return true;
  }
  return false;
}

function configuration(
  environment: Readonly<Record<string, string | undefined>>,
): FixtureConfiguration {
  const token = required(environment, "SPORTSMONKS_API_TOKEN");
  if (token.length < 16 || token.length > 512 || hasControlOrWhitespace(token)) {
    throw new FixtureRuntimeError("invalid_runtime_configuration");
  }
  if (
    required(environment, "FOOTBALL_PROVIDER") !== "sportsmonks" ||
    required(environment, "FOOTBALL_PROVIDER_BASE_URL").replace(/\/$/, "") !== OFFICIAL_BASE_URL
  ) {
    throw new FixtureRuntimeError("invalid_runtime_configuration");
  }
  const fixtureFrom = isoDate(required(environment, "FOOTBALL_SPORTSMONKS_FIXTURE_FROM"));
  const fixtureTo = isoDate(required(environment, "FOOTBALL_SPORTSMONKS_FIXTURE_TO"));
  const fromMs = Date.parse(`${fixtureFrom}T00:00:00.000Z`);
  const toMs = Date.parse(`${fixtureTo}T00:00:00.000Z`);
  const inclusiveDays = Math.floor((toMs - fromMs) / 86_400_000) + 1;
  if (fixtureFrom > fixtureTo || inclusiveDays > MAX_FIXTURE_WINDOW_DAYS) {
    throw new FixtureRuntimeError("invalid_runtime_configuration");
  }
  return {
    token,
    leagueId: integerSetting(environment, "FOOTBALL_SPORTSMONKS_LEAGUE_ID", 1, 1_000_000_000),
    seasonId: integerSetting(environment, "FOOTBALL_SPORTSMONKS_SEASON_ID", 1, 1_000_000_000),
    fixtureFrom,
    fixtureTo,
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

async function parseRequest(request: Request): Promise<ParsedRequest> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new FixtureRuntimeError("request_too_large");
  }
  const source = await request.text();
  if (source.length > MAX_REQUEST_BYTES) throw new FixtureRuntimeError("request_too_large");
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new FixtureRuntimeError("invalid_request");
  }
  const body = record(value, "invalid_request");
  if (body.job !== "fixtures") throw new FixtureRuntimeError("invalid_request");
  const pageSize = body.pageSize ?? 50;
  const maxPages = body.maxPages ?? 1;
  if (
    typeof pageSize !== "number" ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 50 ||
    typeof maxPages !== "number" ||
    !Number.isInteger(maxPages) ||
    maxPages < 1 ||
    maxPages > 3
  ) {
    throw new FixtureRuntimeError("invalid_request");
  }
  return { pageSize, maxPages };
}

async function responseJson(response: Response): Promise<JsonRecord> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new FixtureRuntimeError("provider_response_too_large");
  }
  const source = await response.text();
  if (source.length > MAX_RESPONSE_BYTES) {
    throw new FixtureRuntimeError("provider_response_too_large");
  }
  try {
    return record(JSON.parse(source));
  } catch (error) {
    if (error instanceof FixtureRuntimeError) throw error;
    throw new FixtureRuntimeError("invalid_provider_payload");
  }
}

async function providerRequest(
  path: string,
  query: Readonly<Record<string, string>>,
  config: FixtureConfiguration,
  dependencies: FixtureRuntimeDependencies,
): Promise<JsonRecord> {
  if (!path.startsWith("/") || path.includes("?") || path.includes("#")) {
    throw new FixtureRuntimeError("invalid_provider_path");
  }
  const url = new URL(`${OFFICIAL_BASE_URL}${path}`);
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
  if (url.origin !== "https://api.sportmonks.com" || url.href.includes(config.token)) {
    throw new FixtureRuntimeError("provider_origin_guard_failed");
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
        await sleep(250 * 2 ** attempt);
        continue;
      }
      throw new FixtureRuntimeError(
        response.status === 429 ? "provider_rate_limited" : "provider_unavailable",
      );
    } catch (error) {
      if (error instanceof FixtureRuntimeError) throw error;
      if (attempt < config.maxRetries) {
        await sleep(250 * 2 ** attempt);
        continue;
      }
      throw new FixtureRuntimeError("provider_unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new FixtureRuntimeError("provider_unavailable");
}

function hasMore(value: JsonRecord, count: number, pageSize: number): boolean {
  const root = isRecord(value.pagination) ? value.pagination : null;
  const meta =
    isRecord(value.meta) && isRecord(value.meta.pagination) ? value.meta.pagination : null;
  const pagination = root ?? meta;
  if (pagination) {
    if (typeof pagination.has_more === "boolean") return pagination.has_more;
    if (pagination.next_page !== null && pagination.next_page !== undefined) return true;
  }
  return count === pageSize;
}

async function providerPage(
  page: number,
  pageSize: number,
  config: FixtureConfiguration,
  dependencies: FixtureRuntimeDependencies,
): Promise<ProviderPage> {
  const response = await providerRequest(
    `/fixtures/between/${config.fixtureFrom}/${config.fixtureTo}`,
    {
      filters: `fixtureLeagues:${config.leagueId}`,
      include: "participants;state;scores",
      timezone: "UTC",
      page: String(page),
      per_page: String(pageSize),
    },
    config,
    dependencies,
  );
  if (!Array.isArray(response.data)) throw new FixtureRuntimeError("invalid_provider_payload");
  const rows = response.data.map((value) => record(value));
  return {
    rows,
    nextPage: hasMore(response, rows.length, pageSize) ? page + 1 : null,
  };
}

function participant(raw: JsonRecord, location: "home" | "away"): number {
  if (!Array.isArray(raw.participants)) throw new FixtureRuntimeError("invalid_provider_payload");
  const matches = raw.participants.filter((value) => {
    if (!isRecord(value) || !isRecord(value.meta) || typeof value.meta.location !== "string") {
      return false;
    }
    return value.meta.location.toLowerCase() === location;
  });
  if (matches.length !== 1) throw new FixtureRuntimeError("invalid_provider_payload");
  return positiveInteger((matches[0] as JsonRecord).id);
}

function currentScore(raw: JsonRecord): {
  home: number | null;
  away: number | null;
} {
  if (raw.scores === undefined || raw.scores === null) return { home: null, away: null };
  if (!Array.isArray(raw.scores)) throw new FixtureRuntimeError("invalid_provider_payload");
  const current = raw.scores.filter(
    (value) =>
      isRecord(value) &&
      typeof value.description === "string" &&
      value.description.toUpperCase() === "CURRENT",
  );
  if (current.length === 0) return { home: null, away: null };
  const byParticipant = (location: "home" | "away"): number | null => {
    const matches = current.filter((value) => {
      const score = isRecord((value as JsonRecord).score)
        ? ((value as JsonRecord).score as JsonRecord)
        : null;
      return typeof score?.participant === "string" && score.participant.toLowerCase() === location;
    });
    if (matches.length !== 1) throw new FixtureRuntimeError("invalid_provider_payload");
    const score = record((matches[0] as JsonRecord).score);
    if (typeof score.goals !== "number" || !Number.isInteger(score.goals) || score.goals < 0) {
      throw new FixtureRuntimeError("invalid_provider_payload");
    }
    return score.goals;
  };
  const home = byParticipant("home");
  const away = byParticipant("away");
  if ((home === null) !== (away === null))
    throw new FixtureRuntimeError("invalid_provider_payload");
  return { home, away };
}

/**
 * Provider states that mean the match was played to its end and the result
 * will not move: full time, after extra time, after penalties.
 *
 * These are exactly the states the current-season statistics ingester
 * accepts (`normalizeCurrentFinishedFixture` in
 * scripts/backend/current-season-performances.ts). Finalizing any other state
 * would release a gameweek for scoring against a fixture whose player
 * statistics can never be ingested. The legacy `FTP` spelling still maps to
 * `finished` but is not finalized for the same reason.
 *
 * The Fantasy lifecycle waits (`football_not_final`) until every fixture in a
 * gameweek carries `finalized_at`, and nothing else sets it, so these are the
 * states that let a gameweek be scored.
 *
 * `WO` (walkover) and `AWARDED` also map to `finished`, but deliberately do
 * not finalize: no match was played to completion, so there are no player
 * statistics to score, and whether such a fixture counts for Fantasy is an
 * operator decision (defer it, as the postponed GW1 fixture was), not a
 * mapping rule.
 */
const FINAL_STATES: ReadonlySet<string> = new Set(["FT", "AET", "FT_PEN"]);

function fixtureState(raw: JsonRecord): { status: string; period: string; final: boolean } {
  const state = record(raw.state);
  const source = [state.developer_name, state.state, state.name].find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  if (!source) throw new FixtureRuntimeError("invalid_provider_payload");
  const key = source
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (key === "AWAITING_UPDATES" || key === "PENDING") {
    throw new FixtureRuntimeError("provider_unavailable");
  }
  const mappings: Readonly<Record<string, { status: string; period: string }>> = {
    NS: { status: "not_started", period: "pre_match" },
    TBA: { status: "scheduled", period: "pre_match" },
    TBD: { status: "scheduled", period: "pre_match" },
    INPLAY_1ST_HALF: { status: "live_first_half", period: "first_half" },
    FIRST_HALF: { status: "live_first_half", period: "first_half" },
    HT: { status: "half_time", period: "half_time" },
    HALF_TIME: { status: "half_time", period: "half_time" },
    BREAK: { status: "extra_time", period: "extra_time" },
    INPLAY_2ND_HALF: { status: "live_second_half", period: "second_half" },
    SECOND_HALF: { status: "live_second_half", period: "second_half" },
    INPLAY_ET: { status: "extra_time", period: "extra_time" },
    EXTRA_TIME: { status: "extra_time", period: "extra_time" },
    EXTRA_TIME_BREAK: { status: "extra_time", period: "extra_time" },
    INPLAY_PENALTIES: { status: "penalties", period: "penalties" },
    PEN_LIVE: { status: "penalties", period: "penalties" },
    PEN_BREAK: { status: "penalties", period: "penalties" },
    FT: { status: "finished", period: "post_match" },
    AET: { status: "finished", period: "post_match" },
    FTP: { status: "finished", period: "post_match" },
    FT_PEN: { status: "finished", period: "post_match" },
    WO: { status: "finished", period: "post_match" },
    AWARDED: { status: "finished", period: "post_match" },
    POSTP: { status: "postponed", period: "pre_match" },
    POSTPONED: { status: "postponed", period: "pre_match" },
    CANCL: { status: "cancelled", period: "pre_match" },
    CANCELLED: { status: "cancelled", period: "pre_match" },
    DELETED: { status: "cancelled", period: "pre_match" },
    SUSP: { status: "suspended", period: "pre_match" },
    SUSPENDED: { status: "suspended", period: "pre_match" },
    DELAYED: { status: "delayed", period: "pre_match" },
    ABAN: { status: "abandoned", period: "post_match" },
    ABANDONED: { status: "abandoned", period: "post_match" },
    INTERRUPTED: { status: "suspended", period: "pre_match" },
  };
  const mapped = mappings[key];
  if (!mapped) throw new FixtureRuntimeError("invalid_provider_payload");
  return { ...mapped, final: FINAL_STATES.has(key) };
}

function normalizeFixture(
  raw: JsonRecord,
  config: FixtureConfiguration,
  observedAt: string,
): NormalizedFixture {
  const id = positiveInteger(raw.id);
  const leagueId = positiveInteger(raw.league_id);
  const seasonId = positiveInteger(raw.season_id);
  if (leagueId !== config.leagueId || seasonId !== config.seasonId) {
    throw new FixtureRuntimeError("invalid_provider_payload");
  }
  const state = fixtureState(raw);
  const scores = currentScore(raw);
  if (state.status === "finished" && (scores.home === null || scores.away === null)) {
    throw new FixtureRuntimeError("invalid_provider_payload");
  }
  const updatedAt =
    optionalTimestamp(raw.last_processed_at) ?? optionalTimestamp(raw.updated_at) ?? observedAt;
  const kickoffAt = timestamp(raw.starting_at);
  // The time BotolaGO observed the terminal state. It is never earlier than
  // kickoff for a real result; a feed that reports a final state before its
  // own kickoff is not trusted to finalize anything. The database keeps the
  // first value it stores, so re-observing a finished match changes nothing.
  const finalizedAt =
    state.final && Date.parse(observedAt) >= Date.parse(kickoffAt) ? observedAt : null;
  return {
    externalId: String(id),
    competitionExternalId: String(leagueId),
    seasonExternalId: String(seasonId),
    roundExternalId: nullablePositiveInteger(raw.round_id)?.toString() ?? null,
    homeTeamExternalId: String(participant(raw, "home")),
    awayTeamExternalId: String(participant(raw, "away")),
    kickoffAt,
    status: state.status,
    period: state.period,
    homeScore: scores.home,
    awayScore: scores.away,
    finalizedAt,
    freshness: {
      updatedAt,
      sourceSequence: Math.max(0, Date.parse(updatedAt)),
      sourceVersion: `sportsmonks:${id}:${Date.parse(updatedAt)}`,
    },
  };
}

async function rpc(
  client: FixtureRpcClient,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await client.schema("api").rpc(name, args);
  if (result.error) {
    const code =
      result.error.code === "P0002" || result.error.message === "MAPPING_NOT_FOUND"
        ? "mapping_not_found"
        : "database_unavailable";
    throw new FixtureRuntimeError(code);
  }
  return result.data;
}

async function resolveMapping(
  client: FixtureRpcClient,
  entityType: string,
  externalId: string,
): Promise<string> {
  const value = await rpc(client, "resolve_football_mapping", {
    p_provider_name: "sportsmonks",
    p_entity_type: entityType,
    p_external_id: externalId,
  });
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new FixtureRuntimeError("database_unavailable");
  }
  return value;
}

async function fixtureExists(client: FixtureRpcClient, externalId: string): Promise<boolean> {
  try {
    await resolveMapping(client, "fixture", externalId);
    return true;
  } catch (error) {
    if (error instanceof FixtureRuntimeError && error.code === "mapping_not_found") return false;
    throw error;
  }
}

async function persistFixture(
  client: FixtureRpcClient,
  fixture: NormalizedFixture,
): Promise<"inserted" | "updated"> {
  const existed = await fixtureExists(client, fixture.externalId);
  const [competitionId, seasonId, roundId, homeTeamId, awayTeamId] = await Promise.all([
    resolveMapping(client, "competition", fixture.competitionExternalId),
    resolveMapping(client, "season", fixture.seasonExternalId),
    fixture.roundExternalId
      ? resolveMapping(client, "round", fixture.roundExternalId)
      : Promise.resolve(null),
    resolveMapping(client, "team", fixture.homeTeamExternalId),
    resolveMapping(client, "team", fixture.awayTeamExternalId),
  ]);
  const value = await rpc(client, "ingest_football_fixture", {
    p_provider_name: "sportsmonks",
    p_external_id: fixture.externalId,
    p_fixture: {
      competitionId,
      seasonId,
      roundId,
      homeTeamId,
      awayTeamId,
      venueId: null,
      kickoffAt: fixture.kickoffAt,
      status: fixture.status,
      period: fixture.period,
      minute: null,
      addedTime: null,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
      providerUpdatedAt: fixture.freshness.updatedAt,
      sourceSequence: fixture.freshness.sourceSequence,
      sourceVersion: fixture.freshness.sourceVersion,
      finalizedAt: fixture.finalizedAt,
    },
  });
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new FixtureRuntimeError("database_unavailable");
  }
  return existed ? "updated" : "inserted";
}

function emptyCounts(): FixtureCounts {
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

function externalId(raw: JsonRecord): string {
  return typeof raw.id === "number" && Number.isSafeInteger(raw.id) && raw.id > 0
    ? String(raw.id)
    : "unknown";
}

async function recordRejection(
  client: FixtureRpcClient,
  runId: string,
  raw: JsonRecord,
  error: unknown,
): Promise<void> {
  const code = error instanceof FixtureRuntimeError ? error.code : "fixture_ingestion_failed";
  await rpc(client, "record_football_ingestion_rejection", {
    p_run_id: runId,
    p_entity_type: "fixture",
    p_external_id: externalId(raw),
    p_payload_fingerprint: await fingerprint(raw),
    p_error_code: code,
    p_validation_issues: [{ code }],
  });
}

async function completeRun(
  client: FixtureRpcClient,
  runId: string,
  status: "succeeded" | "partial" | "failed",
  counts: FixtureCounts,
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
    p_error_summary: errorCode ? "The protected historical fixture job did not complete." : null,
  });
}

async function runFixtureJob(
  parsed: ParsedRequest,
  config: FixtureConfiguration,
  dependencies: FixtureRuntimeDependencies,
): Promise<FixtureCounts> {
  const counts = emptyCounts();
  const runId = String(
    await rpc(dependencies.client, "begin_football_ingestion", {
      p_provider_name: "sportsmonks",
      p_job_type: "fixtures",
      p_target_scope: {
        leagueId: config.leagueId,
        seasonId: config.seasonId,
        from: config.fixtureFrom,
        to: config.fixtureTo,
      },
      p_checkpoint: {},
    }),
  );
  let page = 1;
  let finalized = false;
  try {
    for (let pageIndex = 0; pageIndex < parsed.maxPages; pageIndex += 1) {
      const result = await providerPage(page, parsed.pageSize, config, dependencies);
      for (const raw of result.rows) {
        counts.fetched += 1;
        try {
          const fixture = normalizeFixture(
            raw,
            config,
            (dependencies.now ?? (() => new Date()))().toISOString(),
          );
          counts.validated += 1;
          const outcome = await persistFixture(dependencies.client, fixture);
          counts[outcome] += 1;
        } catch (error) {
          counts.rejected += 1;
          await recordRejection(dependencies.client, runId, raw, error);
        }
      }
      if (counts.rejected > 0) {
        await completeRun(
          dependencies.client,
          runId,
          "partial",
          counts,
          { page },
          "fixture_item_rejected",
        );
        finalized = true;
        throw new FixtureRuntimeError("fixture_item_rejected");
      }
      if (result.nextPage === null) {
        await completeRun(dependencies.client, runId, "succeeded", counts, {}, null);
        finalized = true;
        return counts;
      }
      page = result.nextPage;
    }
    await completeRun(
      dependencies.client,
      runId,
      "partial",
      counts,
      { page },
      "page_budget_exhausted",
    );
    finalized = true;
    throw new FixtureRuntimeError("page_budget_exhausted");
  } catch (error) {
    if (!finalized) {
      const code = error instanceof FixtureRuntimeError ? error.code : "fixture_ingestion_failed";
      await completeRun(
        dependencies.client,
        runId,
        counts.validated > 0 ? "partial" : "failed",
        counts,
        { page },
        code,
      );
    }
    throw error;
  }
}

export async function handleSportsMonksFixtureRequest(
  request: Request,
  dependencies: FixtureRuntimeDependencies,
): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const expectedSecret = dependencies.environment.FOOTBALL_INGESTION_TRIGGER_SECRET?.trim() ?? "";
  const receivedSecret = request.headers.get("x-botolago-ingestion-key") ?? "";
  if (expectedSecret.length < 32 || !timingSafeEqual(receivedSecret, expectedSecret)) {
    return json(401, { error: "unauthorized" });
  }
  try {
    const parsed = await parseRequest(request);
    const config = configuration(dependencies.environment);
    const counts = await runFixtureJob(parsed, config, dependencies);
    return json(200, {
      provider: "sportsmonks",
      window: { from: config.fixtureFrom, to: config.fixtureTo },
      jobs: { fixtures: counts },
    });
  } catch (error) {
    const code = error instanceof FixtureRuntimeError ? error.code : "fixture_ingestion_failed";
    const status = code === "invalid_request" ? 400 : code === "request_too_large" ? 413 : 502;
    return json(status, { error: code });
  }
}
