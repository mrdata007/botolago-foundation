export interface ElbotolaRpcResult {
  readonly data: unknown;
  readonly error: { readonly message?: string; readonly code?: string } | null;
}

export interface ElbotolaRpcClient {
  schema(name: "api"): {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<ElbotolaRpcResult>;
  };
}

type JsonRecord = Record<string, unknown>;
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface ElbotolaRuntimeDependencies {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly client: ElbotolaRpcClient;
  readonly fetch?: FetchLike;
  readonly now?: () => Date;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

interface Configuration {
  readonly triggerSecret: string;
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

interface ParsedArticle {
  readonly externalId: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly publishedAt: string;
  readonly heroSourceUrl?: string;
}

interface NormalizedArticle extends ParsedArticle {
  readonly contentFingerprint: string;
  readonly language: "ar";
  readonly summary: string;
  readonly bodyHtml: string;
  readonly sourceUpdatedAt: string;
  readonly sourceVersion: string;
  readonly sourceName: "ElBotola";
  readonly sourceUrl: "https://www.elbotola.com/";
  readonly readingTimeMinutes: 1;
  readonly sanitizerVersion: "elbotola-link-v1";
}

const OFFICIAL_ORIGIN = "https://www.elbotola.com";
const HOMEPAGE_PATH = "/";
const ROBOTS_PATH = "/robots.txt";
const MAX_REQUEST_BYTES = 1_024;
const MAX_HOMEPAGE_BYTES = 2_000_000;
const MAX_ROBOTS_BYTES = 128_000;
const MAX_ARTICLE_AGE_MS = 45 * 24 * 60 * 60 * 1_000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1_000;
const USER_AGENT = "BotolaGO-NewsMetadata/1.0 (+https://botolago.app)";
const ARTICLE_URL =
  /^https:\/\/www\.elbotola\.com\/article\/(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d+)\.html$/u;
const ARTICLE_PATH = /^\/?article\/(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d+)\.html$/u;
const HERO_URL =
  /^https:\/\/images2?\.elbotola\.com\/article\/[a-z0-9/_-]+\.(?:avif|jpe?g|png|webp)$/iu;

export class ElbotolaRuntimeError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ElbotolaRuntimeError";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, code = "invalid_provider_payload"): JsonRecord {
  if (!isRecord(value)) throw new ElbotolaRuntimeError(code);
  return value;
}

function required(environment: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new ElbotolaRuntimeError("invalid_runtime_configuration");
  return value;
}

function integerSetting(
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const raw = required(environment, name);
  if (!/^\d+$/u.test(raw)) throw new ElbotolaRuntimeError("invalid_runtime_configuration");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new ElbotolaRuntimeError("invalid_runtime_configuration");
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
  const triggerSecret = required(environment, "NEWS_INGESTION_TRIGGER_SECRET");
  if (
    environment.ELBOTOLA_SYNDICATION_APPROVED?.trim() !== "true" ||
    required(environment, "ELBOTOLA_ORIGIN").replace(/\/$/u, "") !== OFFICIAL_ORIGIN ||
    triggerSecret.length < 32 ||
    triggerSecret.length > 512 ||
    hasControlOrWhitespace(triggerSecret)
  ) {
    throw new ElbotolaRuntimeError("invalid_runtime_configuration");
  }
  return {
    triggerSecret,
    pageSize: integerSetting(environment, "ELBOTOLA_PAGE_SIZE", 1, 20),
    timeoutMs: integerSetting(environment, "ELBOTOLA_TIMEOUT_MS", 250, 60_000),
    maxRetries: integerSetting(environment, "ELBOTOLA_MAX_RETRIES", 0, 2),
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
    throw new ElbotolaRuntimeError("request_too_large");
  }
  const source = await request.text();
  if (source.length > MAX_REQUEST_BYTES) throw new ElbotolaRuntimeError("request_too_large");
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new ElbotolaRuntimeError("invalid_request");
  }
  const body = record(value, "invalid_request");
  if (body.job !== "elbotola" || Object.keys(body).some((key) => key !== "job")) {
    throw new ElbotolaRuntimeError("invalid_request");
  }
}

function providerErrorCode(status: number): string {
  if (status === 401 || status === 403) return "provider_forbidden";
  if (status === 429) return "provider_rate_limited";
  return "provider_unavailable";
}

async function boundedText(response: Response, maximum: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximum) {
    throw new ElbotolaRuntimeError("provider_response_too_large");
  }
  const source = await response.text();
  if (source.length > maximum) throw new ElbotolaRuntimeError("provider_response_too_large");
  return source;
}

async function providerRequest(
  path: typeof HOMEPAGE_PATH | typeof ROBOTS_PATH,
  config: Configuration,
  dependencies: ElbotolaRuntimeDependencies,
  counters: Counters,
): Promise<Response> {
  const url = new URL(path, OFFICIAL_ORIGIN);
  if (url.origin !== OFFICIAL_ORIGIN || url.username || url.password || url.search || url.hash) {
    throw new ElbotolaRuntimeError("provider_origin_guard_failed");
  }
  const fetcher = dependencies.fetch ?? globalThis.fetch.bind(globalThis);
  const sleep = dependencies.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetcher(url, {
        method: "GET",
        headers: {
          Accept: path === ROBOTS_PATH ? "text/plain" : "text/html",
          "User-Agent": USER_AGENT,
        },
        redirect: "error",
        signal: controller.signal,
      });
      if (response.ok || (path === ROBOTS_PATH && response.status === 404)) return response;
      if ((response.status === 429 || response.status >= 500) && attempt < config.maxRetries) {
        counters.retries += 1;
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw new ElbotolaRuntimeError(providerErrorCode(response.status));
    } catch (error) {
      if (error instanceof ElbotolaRuntimeError) throw error;
      if (attempt < config.maxRetries) {
        counters.retries += 1;
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw new ElbotolaRuntimeError("provider_unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new ElbotolaRuntimeError("provider_unavailable");
}

function robotsAllowsHomepage(source: string): boolean {
  const lines = source
    .split(/\r?\n/u)
    .map((line) => line.replace(/#.*$/u, "").trim())
    .filter(Boolean);
  let applies = false;
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (name === "user-agent") {
      applies = value === "*" || value.toLowerCase() === "botolago-newsmetadata";
      continue;
    }
    if (applies && name === "disallow" && value === "/") return false;
  }
  return true;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/gu, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/giu, (_, hexadecimal: string) =>
      String.fromCodePoint(Number.parseInt(hexadecimal, 16)),
    )
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&amp;/giu, "&")
    .replace(/&nbsp;/giu, " ");
}

function title(value: string): string {
  const normalized = decodeHtml(value.replace(/<[^>]*>/gu, " "))
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ");
  if (normalized.length < 5 || normalized.length > 220 || /[<>]/u.test(normalized)) {
    throw new ElbotolaRuntimeError("invalid_provider_payload");
  }
  return normalized;
}

function publishedTimestamp(value: string, now: Date): string {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))? ([+-])(\d{2})(\d{2})$/u.exec(
    value.trim(),
  );
  if (!match) throw new ElbotolaRuntimeError("invalid_provider_payload");
  const [, year, month, day, hour, minute, second = "00", sign, offsetHour, offsetMinute] = match;
  const source = `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${offsetHour}:${offsetMinute}`;
  const parsed = new Date(source);
  const time = parsed.getTime();
  if (
    Number.isNaN(time) ||
    time > now.getTime() + FUTURE_TOLERANCE_MS ||
    time < now.getTime() - MAX_ARTICLE_AGE_MS
  ) {
    throw new ElbotolaRuntimeError("invalid_provider_payload");
  }
  return parsed.toISOString();
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}=(['"])([^'"]{1,1000})\\1`, "iu").exec(tag);
  return match ? decodeHtml(match[2]) : null;
}

function articleExternalId(value: string): string | null {
  try {
    const url = new URL(value, OFFICIAL_ORIGIN);
    if (url.origin !== OFFICIAL_ORIGIN || url.username || url.password || url.search || url.hash) {
      return null;
    }
    return ARTICLE_PATH.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

function heroSourceUrl(value: string): string | null {
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    if (
      !HERO_URL.test(url.href) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      /(?:access[_-]?token|api[_-]?key|signature|credential)=/iu.test(url.href)
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function homepageHeroImages(source: string): ReadonlyMap<string, string> {
  const images = new Map<string, string>();
  for (const anchor of source.matchAll(/<a\b([^>]{0,1000})>([\s\S]{0,2000}?)<\/a>/giu)) {
    const href = attribute(anchor[1], "href");
    const externalId = href ? articleExternalId(href) : null;
    if (!externalId || images.has(externalId)) continue;
    const imageTag = /<img\b[^>]{0,1500}>/iu.exec(anchor[2])?.[0];
    if (!imageTag) continue;
    const sourceUrl = attribute(imageTag, "data-original") ?? attribute(imageTag, "src");
    const safeUrl = sourceUrl ? heroSourceUrl(sourceUrl) : null;
    if (safeUrl) images.set(externalId, safeUrl);
  }
  return images;
}

export function parseElbotolaHomepage(
  source: string,
  limit: number,
  now: Date,
): {
  readonly items: readonly ParsedArticle[];
  readonly rejectedExternalIds: readonly string[];
} {
  if (source.length > MAX_HOMEPAGE_BYTES) {
    throw new ElbotolaRuntimeError("provider_response_too_large");
  }
  const heroImages = homepageHeroImages(source);
  const candidates = source.matchAll(
    /<a\b[^>]{0,1000}\bhref=(['"])(https:\/\/www\.elbotola\.com\/article\/\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d+\.html)\1[^>]*>([\s\S]{0,3000}?)<\/a>/giu,
  );
  const seen = new Set<string>();
  const items: ParsedArticle[] = [];
  const rejectedExternalIds: string[] = [];
  for (const candidate of candidates) {
    const canonicalUrl = candidate[2];
    const contents = candidate[3];
    const urlMatch = ARTICLE_URL.exec(canonicalUrl);
    if (!urlMatch || seen.has(urlMatch[1])) continue;
    seen.add(urlMatch[1]);
    try {
      const timeMatch = /<time\b[^>]{0,1000}\bdata-value=(['"])([^'"]{1,64})\1[^>]*>/iu.exec(
        contents,
      );
      const headingMatch = /<h3\b[^>]{0,500}>([\s\S]{1,1000}?)<\/h3>/iu.exec(contents);
      if (!timeMatch || !headingMatch) throw new ElbotolaRuntimeError("invalid_provider_payload");
      items.push({
        externalId: urlMatch[1],
        canonicalUrl,
        title: title(headingMatch[1]),
        publishedAt: publishedTimestamp(timeMatch[2], now),
        heroSourceUrl: heroImages.get(urlMatch[1]),
      });
      if (items.length >= limit) break;
    } catch {
      rejectedExternalIds.push(urlMatch[1]);
    }
  }
  if (items.length === 0) throw new ElbotolaRuntimeError("invalid_provider_payload");
  return { items, rejectedExternalIds };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function normalizeArticle(value: ParsedArticle): Promise<NormalizedArticle> {
  const summary = "خبر منشور على موقع البطولة. افتح المصدر الأصلي لقراءة التفاصيل.";
  const bodyHtml = `<p>${summary}</p><p><a href="${escapeHtml(value.canonicalUrl)}" rel="nofollow noopener noreferrer">اقرأ المقال الأصلي على البطولة</a></p>`;
  return {
    ...value,
    contentFingerprint: await sha256(
      ["ar", value.title.toLowerCase(), value.canonicalUrl].join("\u001f"),
    ),
    language: "ar",
    summary,
    bodyHtml,
    sourceUpdatedAt: value.publishedAt,
    sourceVersion: `elbotola:${value.externalId}:${Date.parse(value.publishedAt)}`.slice(0, 100),
    sourceName: "ElBotola",
    sourceUrl: "https://www.elbotola.com/",
    readingTimeMinutes: 1,
    sanitizerVersion: "elbotola-link-v1",
  };
}

async function rpc(
  client: ElbotolaRpcClient,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await client.schema("api").rpc(name, args);
  if (result.error) {
    if (result.error.code === "23505") throw new ElbotolaRuntimeError("duplicate_conflict");
    if (result.error.code === "42501") throw new ElbotolaRuntimeError("source_blocked");
    if (result.error.code === "22023") {
      throw new ElbotolaRuntimeError("invalid_provider_payload");
    }
    throw new ElbotolaRuntimeError("database_unavailable");
  }
  return result.data;
}

function counters(): Counters {
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

function objectString(value: unknown, name: string): string {
  const object = record(value, "invalid_database_response");
  const item = object[name];
  if (typeof item !== "string" || item.length < 1 || item.length > 250) {
    throw new ElbotolaRuntimeError("invalid_database_response");
  }
  return item;
}

async function reject(
  client: ElbotolaRpcClient,
  runId: string,
  externalId: string | null,
  error: unknown,
): Promise<void> {
  const code = error instanceof ElbotolaRuntimeError ? error.code : "invalid_provider_payload";
  const reasons = new Set([
    "mapping_collision",
    "duplicate_conflict",
    "unsafe_content",
    "unsupported_language",
    "stale_update",
    "source_blocked",
    "provider_unavailable",
  ]);
  await rpc(client, "news_record_ingestion_rejection", {
    p_run_id: runId,
    p_external_id: externalId ?? "",
    p_reason:
      code === "invalid_provider_payload"
        ? "invalid_payload"
        : reasons.has(code)
          ? code
          : "invalid_payload",
    p_error_code: code,
    p_sanitized_summary: "Article metadata rejected; inspect correlated server logs.",
  });
}

async function complete(
  client: ElbotolaRpcClient,
  runId: string,
  status: "succeeded" | "partially_succeeded" | "failed",
  value: Counters,
  errorCode: string | null = null,
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
    p_error_code: status === "failed" ? (errorCode ?? "news_ingestion_failed") : null,
    p_error_summary:
      status === "failed" ? "News ingestion failed; inspect correlated server logs." : null,
  });
}

export async function handleElbotolaRequest(
  request: Request,
  dependencies: ElbotolaRuntimeDependencies,
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
    const code = error instanceof ElbotolaRuntimeError ? error.code : "invalid_request";
    return json(code === "request_too_large" ? 413 : 400, { error: code });
  }

  const value = counters();
  let runId: string | null = null;
  try {
    const begin = await rpc(dependencies.client, "news_begin_provider_ingestion", {
      p_provider_slug: "elbotola",
      p_job_type: "latest_article_links",
      p_target_scope: "ar",
    });
    runId = objectString(begin, "runId");

    const robots = await providerRequest(ROBOTS_PATH, config, dependencies, value);
    if (robots.status !== 404) {
      const robotsSource = await boundedText(robots, MAX_ROBOTS_BYTES);
      if (!robotsAllowsHomepage(robotsSource)) {
        throw new ElbotolaRuntimeError("source_crawling_disallowed");
      }
    }

    const homepageResponse = await providerRequest(HOMEPAGE_PATH, config, dependencies, value);
    const contentType = homepageResponse.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("text/html")) {
      throw new ElbotolaRuntimeError("invalid_provider_payload");
    }
    const homepage = await boundedText(homepageResponse, MAX_HOMEPAGE_BYTES);
    const parsed = parseElbotolaHomepage(
      homepage,
      config.pageSize,
      dependencies.now?.() ?? new Date(),
    );
    value.fetched += parsed.items.length + parsed.rejectedExternalIds.length;
    for (const externalId of parsed.rejectedExternalIds) {
      value.rejected += 1;
      await reject(
        dependencies.client,
        runId,
        externalId,
        new ElbotolaRuntimeError("invalid_provider_payload"),
      );
    }

    for (const item of parsed.items) {
      try {
        const article = await normalizeArticle(item);
        value.validated += 1;
        const result = record(
          await rpc(dependencies.client, "news_ingest_provider_article", {
            p_provider_slug: "elbotola",
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
          throw new ElbotolaRuntimeError("invalid_database_response");
        }
        if (article.heroSourceUrl) {
          await rpc(dependencies.client, "news_attach_elbotola_hero", {
            p_external_id: article.externalId,
            p_source_url: article.heroSourceUrl,
            p_alt_text: article.title,
          });
        }
        value[outcome] += 1;
      } catch (error) {
        value.rejected += 1;
        await reject(dependencies.client, runId, item.externalId, error);
      }
    }

    await complete(
      dependencies.client,
      runId,
      value.rejected > 0 ? "partially_succeeded" : "succeeded",
      value,
    );
    return json(200, { provider: "elbotola", languages: ["ar"], counters: value });
  } catch (error) {
    const code = error instanceof ElbotolaRuntimeError ? error.code : "news_ingestion_failed";
    if (runId) {
      try {
        await complete(dependencies.client, runId, "failed", value, code);
      } catch {
        // Preserve the original sanitized failure.
      }
    }
    return json(code === "provider_rate_limited" ? 429 : 503, { error: code });
  }
}
