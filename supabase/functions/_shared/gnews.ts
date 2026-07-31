export interface NewsRpcResult {
  readonly data: unknown;
  readonly error: { readonly message?: string; readonly code?: string } | null;
}

export interface NewsRpcClient {
  schema(name: "api"): {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<NewsRpcResult>;
  };
}

type JsonRecord = Record<string, unknown>;
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface GnewsRuntimeDependencies {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly client: NewsRpcClient;
  readonly fetch?: FetchLike;
  readonly now?: () => Date;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

interface Configuration {
  readonly apiKey: string;
  readonly triggerSecret: string;
  readonly queryFr: string;
  readonly queryAr: string;
  readonly pageSize: number;
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

interface NormalizedArticle {
  readonly externalId: string;
  readonly canonicalUrl: string;
  readonly contentFingerprint: string;
  readonly language: "fr" | "ar";
  readonly title: string;
  readonly summary: string;
  readonly bodyHtml: string;
  readonly publishedAt: string;
  readonly sourceUpdatedAt: string;
  readonly sourceVersion: string;
  readonly sourceName: string;
  readonly sourceUrl: string;
  readonly readingTimeMinutes: number;
  readonly sanitizerVersion: "gnews-excerpt-v1";
}

const OFFICIAL_ORIGIN = "https://gnews.io";
const SEARCH_PATH = "/api/v4/search";
const MAX_REQUEST_BYTES = 1_024;
const MAX_RESPONSE_BYTES = 1_500_000;
const MAX_ARTICLE_AGE_MS = 45 * 24 * 60 * 60 * 1_000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1_000;

export class GnewsRuntimeError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "GnewsRuntimeError";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, code = "invalid_provider_payload"): JsonRecord {
  if (!isRecord(value)) throw new GnewsRuntimeError(code);
  return value;
}

function required(environment: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new GnewsRuntimeError("invalid_runtime_configuration");
  return value;
}

function integerSetting(
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const raw = required(environment, name);
  if (!/^\d+$/.test(raw)) throw new GnewsRuntimeError("invalid_runtime_configuration");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new GnewsRuntimeError("invalid_runtime_configuration");
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
): Configuration {
  const apiKey = required(environment, "GNEWS_API_KEY");
  const triggerSecret = required(environment, "NEWS_INGESTION_TRIGGER_SECRET");
  if (
    apiKey.length < 16 ||
    apiKey.length > 512 ||
    triggerSecret.length < 32 ||
    triggerSecret.length > 512 ||
    hasControlOrWhitespace(apiKey) ||
    hasControlOrWhitespace(triggerSecret) ||
    required(environment, "GNEWS_API_ORIGIN").replace(/\/$/, "") !== OFFICIAL_ORIGIN
  ) {
    throw new GnewsRuntimeError("invalid_runtime_configuration");
  }
  const queryFr = required(environment, "GNEWS_QUERY_FR");
  const queryAr = required(environment, "GNEWS_QUERY_AR");
  if (queryFr.length > 200 || queryAr.length > 200) {
    throw new GnewsRuntimeError("invalid_runtime_configuration");
  }
  return {
    apiKey,
    triggerSecret,
    queryFr,
    queryAr,
    pageSize: integerSetting(environment, "GNEWS_PAGE_SIZE", 1, 10),
    timeoutMs: integerSetting(environment, "GNEWS_TIMEOUT_MS", 250, 60_000),
    maxRetries: integerSetting(environment, "GNEWS_MAX_RETRIES", 0, 5),
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
    throw new GnewsRuntimeError("request_too_large");
  }
  const source = await request.text();
  if (source.length > MAX_REQUEST_BYTES) throw new GnewsRuntimeError("request_too_large");
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new GnewsRuntimeError("invalid_request");
  }
  const body = record(value, "invalid_request");
  if (body.job !== "gnews" || Object.keys(body).some((key) => key !== "job")) {
    throw new GnewsRuntimeError("invalid_request");
  }
}

async function responseJson(response: Response): Promise<JsonRecord> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new GnewsRuntimeError("provider_response_too_large");
  }
  const source = await response.text();
  if (source.length > MAX_RESPONSE_BYTES) {
    throw new GnewsRuntimeError("provider_response_too_large");
  }
  try {
    return record(JSON.parse(source));
  } catch (error) {
    if (error instanceof GnewsRuntimeError) throw error;
    throw new GnewsRuntimeError("invalid_provider_payload");
  }
}

function retryAfter(response: Response): number | null {
  const value = response.headers.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds * 1_000) : null;
}

async function providerRequest(
  language: "fr" | "ar",
  query: string,
  config: Configuration,
  dependencies: GnewsRuntimeDependencies,
  counters: Counters,
): Promise<JsonRecord> {
  const url = new URL(`${OFFICIAL_ORIGIN}${SEARCH_PATH}`);
  url.searchParams.set("q", query);
  url.searchParams.set("lang", language);
  url.searchParams.set("max", String(config.pageSize));
  url.searchParams.set("sortby", "publishedAt");
  if (url.origin !== OFFICIAL_ORIGIN || url.href.includes(config.apiKey)) {
    throw new GnewsRuntimeError("provider_origin_guard_failed");
  }
  const fetcher = dependencies.fetch ?? globalThis.fetch.bind(globalThis);
  const sleep = dependencies.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetcher(url, {
        method: "GET",
        headers: { Accept: "application/json", "X-Api-Key": config.apiKey },
        redirect: "error",
        signal: controller.signal,
      });
      if (response.ok) return responseJson(response);
      if ((response.status === 429 || response.status >= 500) && attempt < config.maxRetries) {
        counters.retries += 1;
        await sleep(retryAfter(response) ?? 250 * 2 ** attempt);
        continue;
      }
      throw new GnewsRuntimeError(
        response.status === 429 ? "provider_rate_limited" : "provider_unavailable",
      );
    } catch (error) {
      if (error instanceof GnewsRuntimeError) throw error;
      if (attempt < config.maxRetries) {
        counters.retries += 1;
        await sleep(250 * 2 ** attempt);
        continue;
      }
      throw new GnewsRuntimeError("provider_unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new GnewsRuntimeError("provider_unavailable");
}

function nonEmptyString(value: unknown, minimum: number, maximum: number): string {
  if (typeof value !== "string") throw new GnewsRuntimeError("invalid_provider_payload");
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new GnewsRuntimeError("invalid_provider_payload");
  }
  return normalized;
}

function safeHttpsUrl(value: unknown): URL {
  const source = nonEmptyString(value, 8, 2_048);
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new GnewsRuntimeError("invalid_provider_payload");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    Array.from(url.searchParams.keys()).some((key) =>
      /^(access[_-]?token|api[_-]?key|signature|credential)$/i.test(key),
    )
  ) {
    throw new GnewsRuntimeError("invalid_provider_payload");
  }
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  }
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
  url.searchParams.sort();
  return url;
}

function timestamp(value: unknown, now: Date): string {
  if (typeof value !== "string") throw new GnewsRuntimeError("invalid_provider_payload");
  const parsed = new Date(value);
  const time = parsed.getTime();
  if (
    Number.isNaN(time) ||
    time > now.getTime() + FUTURE_TOLERANCE_MS ||
    time < now.getTime() - MAX_ARTICLE_AGE_MS
  ) {
    throw new GnewsRuntimeError("invalid_provider_payload");
  }
  return parsed.toISOString();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function normalizeArticle(
  value: unknown,
  expectedLanguage: "fr" | "ar",
  now: Date,
): Promise<NormalizedArticle> {
  const raw = record(value);
  const language = nonEmptyString(raw.lang, 2, 2);
  if (language !== expectedLanguage) throw new GnewsRuntimeError("unsupported_language");
  const externalId = nonEmptyString(raw.id, 1, 250);
  const canonicalUrl = safeHttpsUrl(raw.url).toString();
  const source = record(raw.source);
  const sourceName = nonEmptyString(source.name, 2, 160);
  const sourceUrl = safeHttpsUrl(source.url).toString();
  const title = nonEmptyString(raw.title, 5, 220);
  const summary = nonEmptyString(raw.description, 10, 1_000);
  const publishedAt = timestamp(raw.publishedAt, now);
  const linkLabel =
    language === "ar"
      ? `اقرأ المقال الأصلي على ${sourceName}`
      : `Lire l’article original sur ${sourceName}`;
  const bodyHtml = `<p>${escapeHtml(summary)}</p><p><a href="${escapeHtml(canonicalUrl)}" rel="nofollow noopener noreferrer">${escapeHtml(linkLabel)}</a></p>`;
  const contentFingerprint = await sha256(
    [language, title.toLowerCase(), summary.toLowerCase(), canonicalUrl].join("\u001f"),
  );
  return {
    externalId,
    canonicalUrl,
    contentFingerprint,
    language,
    title,
    summary,
    bodyHtml,
    publishedAt,
    sourceUpdatedAt: publishedAt,
    sourceVersion: `gnews:${externalId}:${Date.parse(publishedAt)}`.slice(0, 100),
    sourceName,
    sourceUrl,
    readingTimeMinutes: 1,
    sanitizerVersion: "gnews-excerpt-v1",
  };
}

async function rpc(
  client: NewsRpcClient,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await client.schema("api").rpc(name, args);
  if (result.error) {
    if (result.error.code === "23505") throw new GnewsRuntimeError("duplicate_conflict");
    if (result.error.code === "42501") throw new GnewsRuntimeError("source_blocked");
    if (result.error.code === "22023") throw new GnewsRuntimeError("invalid_provider_payload");
    throw new GnewsRuntimeError("database_unavailable");
  }
  return result.data;
}

function counters(): Counters {
  return { fetched: 0, validated: 0, inserted: 0, updated: 0, skipped: 0, rejected: 0, retries: 0 };
}

function objectString(value: unknown, name: string): string {
  const object = record(value, "invalid_database_response");
  return nonEmptyString(object[name], 1, 250);
}

async function reject(
  client: NewsRpcClient,
  runId: string,
  externalId: string | null,
  error: unknown,
): Promise<void> {
  const code = error instanceof GnewsRuntimeError ? error.code : "invalid_provider_payload";
  const reasons = new Set([
    "mapping_collision",
    "duplicate_conflict",
    "unsafe_content",
    "unsupported_language",
    "stale_update",
    "source_blocked",
    "rate_limited",
    "provider_unavailable",
  ]);
  const reason = code === "invalid_provider_payload" ? "invalid_payload" : reasons.has(code) ? code : "invalid_payload";
  await rpc(client, "news_record_ingestion_rejection", {
    p_run_id: runId,
    p_external_id: externalId ?? "",
    p_reason: reason,
    p_error_code: code,
    p_sanitized_summary: "Article rejected; inspect correlated server logs.",
  });
}

async function complete(
  client: NewsRpcClient,
  runId: string,
  status: "succeeded" | "partially_succeeded" | "failed",
  value: Counters,
): Promise<void> {
  await rpc(client, "news_complete_ingestion_run", {
    p_run_id: runId,
    p_status: status,
    p_cursor: "",
    p_fetched: value.fetched,
    p_validated: value.validated,
    p_inserted: value.inserted,
    p_updated: value.updated,
    p_skipped: value.skipped,
    p_rejected: value.rejected,
    p_error_code: status === "failed" ? "news_ingestion_failed" : null,
    p_error_summary: status === "failed" ? "News ingestion failed; inspect correlated server logs." : null,
  });
}

export async function handleGnewsRequest(
  request: Request,
  dependencies: GnewsRuntimeDependencies,
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
    const code = error instanceof GnewsRuntimeError ? error.code : "invalid_request";
    return json(code === "request_too_large" ? 413 : 400, { error: code });
  }

  const value = counters();
  let runId: string | null = null;
  try {
    const begin = await rpc(dependencies.client, "news_begin_provider_ingestion", {
      p_provider_slug: "gnews",
      p_job_type: "latest_articles",
      p_target_scope: "fr,ar",
    });
    runId = objectString(begin, "runId");
    const now = dependencies.now?.() ?? new Date();
    for (const language of ["fr", "ar"] as const) {
      const payload = await providerRequest(
        language,
        language === "fr" ? config.queryFr : config.queryAr,
        config,
        dependencies,
        value,
      );
      if (!Array.isArray(payload.articles)) throw new GnewsRuntimeError("invalid_provider_payload");
      for (const raw of payload.articles) {
        value.fetched += 1;
        let externalId: string | null = null;
        try {
          if (isRecord(raw) && typeof raw.id === "string") externalId = raw.id.slice(0, 250);
          const article = await normalizeArticle(raw, language, now);
          externalId = article.externalId;
          value.validated += 1;
          const result = record(
            await rpc(dependencies.client, "news_ingest_provider_article", {
              p_provider_slug: "gnews",
              p_external_id: article.externalId,
              p_canonical_url: article.canonicalUrl,
              p_content_fingerprint: article.contentFingerprint,
              p_language: article.language,
              p_title: article.title,
              p_summary: article.summary,
              p_body_html: article.bodyHtml,
              p_source_name: article.sourceName,
              p_source_url: article.sourceUrl,
              p_source_version: article.sourceVersion,
              p_source_published_at: article.publishedAt,
              p_source_updated_at: article.sourceUpdatedAt,
              p_reading_time_minutes: article.readingTimeMinutes,
              p_sanitizer_version: article.sanitizerVersion,
            }),
            "invalid_database_response",
          );
          const outcome = result.outcome;
          if (outcome !== "inserted" && outcome !== "updated" && outcome !== "skipped") {
            throw new GnewsRuntimeError("invalid_database_response");
          }
          value[outcome] += 1;
        } catch (error) {
          value.rejected += 1;
          await reject(dependencies.client, runId, externalId, error);
        }
      }
    }
    await complete(
      dependencies.client,
      runId,
      value.rejected > 0 ? "partially_succeeded" : "succeeded",
      value,
    );
    return json(200, { provider: "gnews", languages: ["fr", "ar"], counters: value });
  } catch (error) {
    if (runId) {
      try {
        await complete(dependencies.client, runId, "failed", value);
      } catch {
        // Preserve the original failure without returning database details.
      }
    }
    const code = error instanceof GnewsRuntimeError ? error.code : "news_ingestion_failed";
    const status = code === "provider_rate_limited" ? 429 : 503;
    return json(status, { error: code });
  }
}
