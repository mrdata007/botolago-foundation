export const CATALOG_JOBS = ["competitions", "seasons", "rounds", "teams"] as const;
export type CatalogJob = (typeof CATALOG_JOBS)[number];
export type CatalogRequestJob = CatalogJob | "catalog";

type JsonRecord = Record<string, unknown>;
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface RpcResult {
  readonly data: unknown;
  readonly error: { readonly message?: string; readonly code?: string } | null;
}

export interface CatalogRpcClient {
  schema(name: "api"): {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
  };
}

export interface CatalogRuntimeDependencies {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly client: CatalogRpcClient;
  readonly fetch?: FetchLike;
  readonly now?: () => Date;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

interface CatalogCounts {
  fetched: number;
  validated: number;
  inserted: number;
  updated: number;
  skipped: number;
  rejected: number;
  retries: number;
}

interface CatalogConfiguration {
  readonly token: string;
  readonly leagueId: number;
  readonly seasonId: number;
  readonly countryCode: string;
  readonly competitionType: "league";
  readonly seasonStart: string;
  readonly seasonEnd: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
}

interface ParsedRequest {
  readonly job: CatalogRequestJob;
  readonly pageSize: number;
  readonly maxPages: number;
}

interface ProviderPage {
  readonly items: readonly JsonRecord[];
  readonly nextPage: number | null;
}

const OFFICIAL_BASE_URL = "https://api.sportmonks.com/v3/football";
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_REQUEST_BYTES = 4_096;

class CatalogRuntimeError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CatalogRuntimeError";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, code = "invalid_provider_payload"): JsonRecord {
  if (!isRecord(value)) throw new CatalogRuntimeError(code);
  return value;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new CatalogRuntimeError("invalid_provider_payload");
  return value;
}

function text(value: unknown, minimum: number, maximum: number): string {
  if (typeof value !== "string") throw new CatalogRuntimeError("invalid_provider_payload");
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new CatalogRuntimeError("invalid_provider_payload");
  }
  return normalized;
}

function positiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new CatalogRuntimeError("invalid_provider_payload");
  }
  return value;
}

function isoDate(value: unknown): string {
  const date = text(value, 10, 10);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime())) {
    throw new CatalogRuntimeError("invalid_provider_payload");
  }
  return date;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function required(environment: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new CatalogRuntimeError("invalid_runtime_configuration");
  return value;
}

function hasControlOrWhitespace(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x20 || codePoint === 0x7f) return true;
  }
  return false;
}

function integerSetting(
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const raw = required(environment, name);
  if (!/^\d+$/.test(raw)) throw new CatalogRuntimeError("invalid_runtime_configuration");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new CatalogRuntimeError("invalid_runtime_configuration");
  }
  return value;
}

function configuration(
  environment: Readonly<Record<string, string | undefined>>,
): CatalogConfiguration {
  const token = required(environment, "SPORTSMONKS_API_TOKEN");
  if (token.length < 16 || token.length > 512 || hasControlOrWhitespace(token)) {
    throw new CatalogRuntimeError("invalid_runtime_configuration");
  }
  if (
    required(environment, "FOOTBALL_PROVIDER") !== "sportsmonks" ||
    required(environment, "FOOTBALL_PROVIDER_BASE_URL").replace(/\/$/, "") !== OFFICIAL_BASE_URL ||
    required(environment, "FOOTBALL_SPORTSMONKS_COMPETITION_TYPE") !== "league"
  ) {
    throw new CatalogRuntimeError("invalid_runtime_configuration");
  }
  const countryCode = required(environment, "FOOTBALL_SPORTSMONKS_COUNTRY_CODE").toUpperCase();
  if (countryCode !== "MA") throw new CatalogRuntimeError("invalid_runtime_configuration");
  return {
    token,
    leagueId: integerSetting(environment, "FOOTBALL_SPORTSMONKS_LEAGUE_ID", 1, 1_000_000_000),
    seasonId: integerSetting(environment, "FOOTBALL_SPORTSMONKS_SEASON_ID", 1, 1_000_000_000),
    countryCode,
    competitionType: "league",
    seasonStart: isoDate(required(environment, "FOOTBALL_SPORTSMONKS_SEASON_START")),
    seasonEnd: isoDate(required(environment, "FOOTBALL_SPORTSMONKS_SEASON_END")),
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
    throw new CatalogRuntimeError("request_too_large");
  }
  const source = await request.text();
  if (source.length > MAX_REQUEST_BYTES) throw new CatalogRuntimeError("request_too_large");
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new CatalogRuntimeError("invalid_request");
  }
  const body = record(value, "invalid_request");
  const job = body.job;
  if (job !== "catalog" && !CATALOG_JOBS.includes(job as CatalogJob)) {
    throw new CatalogRuntimeError("invalid_request");
  }
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
    maxPages > 20
  ) {
    throw new CatalogRuntimeError("invalid_request");
  }
  return { job: job as CatalogRequestJob, pageSize, maxPages };
}

async function responseJson(response: Response): Promise<JsonRecord> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new CatalogRuntimeError("provider_response_too_large");
  }
  const source = await response.text();
  if (source.length > MAX_RESPONSE_BYTES) {
    throw new CatalogRuntimeError("provider_response_too_large");
  }
  try {
    return record(JSON.parse(source));
  } catch (error) {
    if (error instanceof CatalogRuntimeError) throw error;
    throw new CatalogRuntimeError("invalid_provider_payload");
  }
}

async function providerRequest(
  path: string,
  query: Readonly<Record<string, string>>,
  config: CatalogConfiguration,
  dependencies: CatalogRuntimeDependencies,
): Promise<JsonRecord> {
  if (!path.startsWith("/") || path.includes("?") || path.includes("#")) {
    throw new CatalogRuntimeError("invalid_provider_path");
  }
  const url = new URL(`${OFFICIAL_BASE_URL}${path}`);
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
  if (url.origin !== "https://api.sportmonks.com" || url.href.includes(config.token)) {
    throw new CatalogRuntimeError("provider_origin_guard_failed");
  }
  const fetcher = dependencies.fetch ?? globalThis.fetch.bind(globalThis);
  const sleep =
    dependencies.sleep ??
    ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));

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
      throw new CatalogRuntimeError(
        response.status === 429 ? "provider_rate_limited" : "provider_unavailable",
      );
    } catch (error) {
      if (error instanceof CatalogRuntimeError) throw error;
      if (attempt < config.maxRetries) {
        await sleep(250 * 2 ** attempt);
        continue;
      }
      throw new CatalogRuntimeError("provider_unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new CatalogRuntimeError("provider_unavailable");
}

function freshness(raw: JsonRecord, observedAt: string): JsonRecord {
  const updatedAt =
    timestamp(raw.last_processed_at) ??
    timestamp(raw.updated_at) ??
    timestamp(raw.last_played_at) ??
    observedAt;
  return {
    updatedAt,
    sourceSequence: Math.max(0, Date.parse(updatedAt)),
    sourceVersion: `sportsmonks:${String(raw.id ?? "unknown")}:${Date.parse(updatedAt)}`,
    provisional: false,
  };
}

function oneData(value: JsonRecord): JsonRecord {
  const data = value.data;
  const candidate = Array.isArray(data) ? data[0] : data;
  return record(candidate);
}

function rows(value: JsonRecord): JsonRecord[] {
  return array(value.data).map((item) => record(item));
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

function teamCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z0-9]{2,8}$/.test(code) ? code : null;
}

function roundNumber(raw: JsonRecord, name: string): number | null {
  if (
    typeof raw.number === "number" &&
    Number.isInteger(raw.number) &&
    raw.number >= 1 &&
    raw.number <= 1000
  ) {
    return raw.number;
  }
  const match = /^(?:ROUND\s+)?(\d{1,3})$/i.exec(name);
  return match ? Number(match[1]) : null;
}

async function providerPage(
  job: CatalogJob,
  page: number,
  pageSize: number,
  config: CatalogConfiguration,
  dependencies: CatalogRuntimeDependencies,
  observedAt: string,
): Promise<ProviderPage> {
  if (job === "competitions") {
    const raw = oneData(
      await providerRequest(`/leagues/${config.leagueId}`, {}, config, dependencies),
    );
    if (positiveInteger(raw.id) !== config.leagueId)
      throw new CatalogRuntimeError("invalid_provider_payload");
    return {
      items: [
        {
          externalId: String(raw.id),
          name: text(raw.name, 2, 160),
          shortName: raw.short_code == null ? null : text(raw.short_code, 1, 40),
          type: config.competitionType,
          countryCode: config.countryCode,
          freshness: freshness(raw, observedAt),
        },
      ],
      nextPage: null,
    };
  }
  if (job === "seasons") {
    const raw = oneData(
      await providerRequest(`/seasons/${config.seasonId}`, {}, config, dependencies),
    );
    if (
      positiveInteger(raw.id) !== config.seasonId ||
      positiveInteger(raw.league_id) !== config.leagueId
    ) {
      throw new CatalogRuntimeError("invalid_provider_payload");
    }
    const startsOn = raw.starting_at == null ? config.seasonStart : isoDate(raw.starting_at);
    const endsOn = raw.ending_at == null ? config.seasonEnd : isoDate(raw.ending_at);
    if (startsOn > endsOn) throw new CatalogRuntimeError("invalid_provider_payload");
    return {
      items: [
        {
          externalId: String(raw.id),
          competitionExternalId: String(raw.league_id),
          label: text(raw.name, 2, 40),
          startsOn,
          endsOn,
          current: raw.is_current === true,
          freshness: freshness(raw, observedAt),
        },
      ],
      nextPage: null,
    };
  }
  if (job === "rounds") {
    const response = await providerRequest(
      `/rounds/seasons/${config.seasonId}`,
      {},
      config,
      dependencies,
    );
    const items = rows(response).map((raw) => {
      if (positiveInteger(raw.season_id) !== config.seasonId) {
        throw new CatalogRuntimeError("invalid_provider_payload");
      }
      const name = text(String(raw.name), 1, 120);
      return {
        externalId: String(positiveInteger(raw.id)),
        seasonExternalId: String(raw.season_id),
        number: roundNumber(raw, name),
        name,
        freshness: freshness(raw, observedAt),
      };
    });
    return { items, nextPage: null };
  }

  const response = await providerRequest(
    `/teams/seasons/${config.seasonId}`,
    { page: String(page), per_page: String(pageSize) },
    config,
    dependencies,
  );
  const sourceRows = rows(response);
  const items = sourceRows.map((raw) => {
    const name = text(raw.name, 2, 160);
    const shortName = raw.short_code == null ? name.slice(0, 40) : text(raw.short_code, 1, 40);
    return {
      externalId: String(positiveInteger(raw.id)),
      name,
      shortName,
      code: teamCode(raw.short_code),
      countryCode: config.countryCode,
      freshness: freshness(raw, observedAt),
    };
  });
  return {
    items,
    nextPage: hasMore(response, sourceRows.length, pageSize) ? page + 1 : null,
  };
}

async function rpc(
  client: CatalogRpcClient,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await client.schema("api").rpc(name, args);
  if (result.error) throw new CatalogRuntimeError("database_unavailable");
  return result.data;
}

function emptyCounts(): CatalogCounts {
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

function entityType(job: CatalogJob): string {
  return job === "competitions"
    ? "competition"
    : job === "seasons"
      ? "season"
      : job === "rounds"
        ? "round"
        : "team";
}

function externalId(item: JsonRecord): string {
  return text(item.externalId, 1, 200);
}

function ingestOutcome(value: unknown): "inserted" | "updated" | "skipped" {
  const outcome = record(value, "database_unavailable").outcome;
  if (outcome !== "inserted" && outcome !== "updated" && outcome !== "skipped") {
    throw new CatalogRuntimeError("database_unavailable");
  }
  return outcome;
}

async function completeRun(
  client: CatalogRpcClient,
  runId: string,
  status: "succeeded" | "partial" | "failed",
  counts: CatalogCounts,
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
    p_error_summary: errorCode ? "The protected catalog ingestion job did not complete." : null,
  });
}

async function runJob(
  job: CatalogJob,
  parsed: ParsedRequest,
  config: CatalogConfiguration,
  dependencies: CatalogRuntimeDependencies,
): Promise<CatalogCounts> {
  const counts = emptyCounts();
  const runId = String(
    await rpc(dependencies.client, "begin_football_ingestion", {
      p_provider_name: "sportsmonks",
      p_job_type: job,
      p_target_scope: { leagueId: config.leagueId, seasonId: config.seasonId },
      p_checkpoint: {},
    }),
  );
  let page = 1;
  try {
    for (let pageIndex = 0; pageIndex < parsed.maxPages; pageIndex += 1) {
      const result = await providerPage(
        job,
        page,
        parsed.pageSize,
        config,
        dependencies,
        (dependencies.now ?? (() => new Date()))().toISOString(),
      );
      counts.fetched += result.items.length;
      for (const item of result.items) {
        counts.validated += 1;
        try {
          const outcome = ingestOutcome(
            await rpc(dependencies.client, "ingest_football_catalog_entity", {
              p_provider_name: "sportsmonks",
              p_entity_type: entityType(job),
              p_external_id: externalId(item),
              p_entity: item,
            }),
          );
          counts[outcome] += 1;
        } catch (error) {
          counts.rejected += 1;
          const code = error instanceof CatalogRuntimeError ? error.code : "database_unavailable";
          await rpc(dependencies.client, "record_football_ingestion_rejection", {
            p_run_id: runId,
            p_entity_type: entityType(job),
            p_external_id: externalId(item),
            p_payload_fingerprint: await fingerprint(item),
            p_error_code: code,
            p_validation_issues: [{ code }],
          });
        }
      }
      if (counts.rejected > 0) {
        await completeRun(
          dependencies.client,
          runId,
          "partial",
          counts,
          { page },
          "catalog_item_rejected",
        );
        throw new CatalogRuntimeError("catalog_item_rejected");
      }
      if (result.nextPage === null) {
        await completeRun(dependencies.client, runId, "succeeded", counts, {}, null);
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
    throw new CatalogRuntimeError("page_budget_exhausted");
  } catch (error) {
    const code = error instanceof CatalogRuntimeError ? error.code : "catalog_ingestion_failed";
    if (code !== "catalog_item_rejected" && code !== "page_budget_exhausted") {
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

export async function handleSportsMonksCatalogRequest(
  request: Request,
  dependencies: CatalogRuntimeDependencies,
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
    const jobs = parsed.job === "catalog" ? CATALOG_JOBS : [parsed.job];
    const result: Record<string, CatalogCounts> = {};
    for (const job of jobs) result[job] = await runJob(job, parsed, config, dependencies);
    return json(200, { provider: "sportsmonks", jobs: result });
  } catch (error) {
    const code = error instanceof CatalogRuntimeError ? error.code : "catalog_ingestion_failed";
    const status = code === "invalid_request" ? 400 : code === "request_too_large" ? 413 : 502;
    return json(status, { error: code });
  }
}
