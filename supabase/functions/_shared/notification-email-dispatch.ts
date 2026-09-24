// Sends the product notification emails that the database has queued.
//
// Woken every few minutes by pg_cron (app_private.notification_email_tick)
// through pg_net, with the scheduler token in `x-botolago-scheduler-token`.
// Each pass:
//   1. checks that token with api.service_verify_scheduler_token;
//   2. claims a small batch with api.service_claim_email_deliveries — the
//      database has already decided who gets what, in which language, how
//      much of the plan's daily and monthly quota is left, and has dropped
//      anything no longer wanted or no longer timely;
//   3. renders each email and sends it through Resend's HTTP API with the
//      delivery id as the idempotency key, so a retry after an ambiguous
//      failure can never produce a second email;
//   4. records the outcome with api.service_record_notification_delivery_attempt,
//      which schedules bounded retries and dead-letters permanent failures.
//
// When Resend itself refuses to send — quota exceeded (it counts mail this
// database does not see, such as account emails) or a rejected key — the pass
// stops and sending is paused with api.service_pause_email_provider until the
// quota resets, instead of burning every waiting email's attempts.
//
// No email address, token or provider message is ever logged or returned;
// only Resend's error *name* is read, and the response carries counts only.
//
// Dependency-free so it runs under Bun (tests) and Deno (the Edge Function).

import type {
  ClaimedEmailDelivery,
  EmailLinkContext,
  RenderedEmail,
} from "./notification-email-types.ts";
import { EMAIL_NOTIFICATION_TYPES } from "./notification-email-types.ts";

export interface EmailRpcResult {
  readonly data: unknown;
  readonly error: { readonly code?: string; readonly message: string } | null;
}

export interface EmailRpcClient {
  schema(name: "api"): {
    rpc(name: string, args?: Record<string, unknown>): PromiseLike<EmailRpcResult>;
  };
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface EmailDispatchDependencies {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly client: EmailRpcClient;
  readonly render: (delivery: ClaimedEmailDelivery, links: EmailLinkContext) => RenderedEmail;
  /** The unsubscribe page link shown in the email body. */
  readonly unsubscribeUrl: (delivery: ClaimedEmailDelivery, links: EmailLinkContext) => string;
  readonly fetch?: FetchLike;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export interface EmailDispatchConfiguration {
  readonly apiKey: string;
  readonly from: string;
  readonly replyTo: string | null;
  readonly appUrl: string;
  /**
   * The one-click unsubscribe endpoint (Edge Function
   * notification-email-unsubscribe) that mail providers POST to, RFC 8058.
   * Null when SUPABASE_URL is not an https origin; the header then points at
   * the unsubscribe page and carries no List-Unsubscribe-Post.
   */
  readonly oneClickUnsubscribeEndpoint: string | null;
  readonly batchSize: number;
  readonly budgetMs: number;
  readonly sendIntervalMs: number;
  readonly timeoutMs: number;
}

export interface EmailDispatchSummary {
  readonly claimed: number;
  readonly sent: number;
  readonly retrying: number;
  readonly failed: number;
  /** Set when the provider refused to send and sending was paused. */
  readonly pausedReason?: ProviderPauseReason;
}

export type ProviderPauseReason =
  | "daily_quota_exceeded"
  | "monthly_quota_exceeded"
  | "provider_auth_failed";

/** What one send attempt means for the delivery. */
export interface SendOutcome {
  readonly outcome: "sent" | "retryable_failure" | "permanent_failure";
  readonly providerMessageId: string | null;
  readonly stableErrorCode: string | null;
  readonly retryAfterSeconds: number | null;
  readonly rateLimitRemaining: number | null;
  readonly latencyMs: number;
  /** The provider will refuse everything else too: stop and pause until then. */
  readonly pause: { readonly reason: ProviderPauseReason; readonly until: Date } | null;
}

const RESEND_URL = "https://api.resend.com/emails";
const MAX_ATTEMPTS = 5;
const LEASE_SECONDS = 180;
const MAX_REQUEST_BYTES = 4096;
const MAX_ERROR_BODY_BYTES = 4096;
const AUTH_PAUSE_MS = 30 * 60 * 1000;

/** Resend error names this dispatcher acts on (https://resend.com/docs/api-reference/errors). */
const RESEND_ERROR_NAMES = new Set([
  "validation_error",
  "invalid_idempotency_key",
  "missing_api_key",
  "restricted_api_key",
  "invalid_api_key",
  "suspended_api_key",
  "invalid_permission",
  "invalid_from_address",
  "concurrent_idempotent_requests",
  "invalid_idempotent_request",
  "daily_quota_exceeded",
  "monthly_quota_exceeded",
  "rate_limit_exceeded",
  "application_error",
  "service_unavailable",
]);

export class EmailDispatchError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function hasControlOrWhitespace(value: string): boolean {
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    if (point <= 0x20 || point === 0x7f) return true;
  }
  return false;
}

function integerSetting(
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = environment[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new EmailDispatchError("invalid_runtime_configuration");
  }
  return value;
}

const MAILBOX =
  /^(?:[^<>\r\n]{1,80} <)?[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}>?$/;

function httpsOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function emailDispatchConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): EmailDispatchConfiguration {
  const apiKey = environment.RESEND_API_KEY?.trim() ?? "";
  if (apiKey.length < 16 || apiKey.length > 256 || hasControlOrWhitespace(apiKey)) {
    throw new EmailDispatchError("email_provider_not_configured");
  }
  const from = environment.EMAIL_FROM?.trim() || "BotolaGO <notifications@botolago.com>";
  const replyTo = environment.EMAIL_REPLY_TO?.trim() || "support@botolago.com";
  if (!MAILBOX.test(from) || from.includes("<") !== from.endsWith(">")) {
    throw new EmailDispatchError("invalid_runtime_configuration");
  }
  if (!MAILBOX.test(replyTo) || replyTo.includes("<")) {
    throw new EmailDispatchError("invalid_runtime_configuration");
  }
  const appUrl = (environment.APP_URL?.trim() || "https://botolago.com").replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(appUrl);
  } catch {
    throw new EmailDispatchError("invalid_runtime_configuration");
  }
  if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new EmailDispatchError("invalid_runtime_configuration");
  }
  const functionsOrigin = httpsOrigin(environment.SUPABASE_URL);
  return {
    apiKey,
    from,
    replyTo,
    appUrl: parsed.origin,
    oneClickUnsubscribeEndpoint: functionsOrigin
      ? `${functionsOrigin}/functions/v1/notification-email-unsubscribe`
      : null,
    batchSize: integerSetting(environment, "EMAIL_DISPATCH_BATCH_SIZE", 20, 1, 100),
    budgetMs: integerSetting(environment, "EMAIL_DISPATCH_BUDGET_MS", 40_000, 1_000, 120_000),
    // Resend allows 10 requests per second per account; stay well below.
    sendIntervalMs: integerSetting(environment, "EMAIL_SEND_INTERVAL_MS", 200, 0, 10_000),
    timeoutMs: integerSetting(environment, "EMAIL_PROVIDER_TIMEOUT_MS", 10_000, 1_000, 30_000),
  };
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function rpc(
  client: EmailRpcClient,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await client.schema("api").rpc(name, args);
  if (result.error) throw new EmailDispatchError("database_unavailable");
  return result.data;
}

const TYPES = new Set<string>(EMAIL_NOTIFICATION_TYPES);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The claim RPC's output, checked just enough that a malformed row fails
 * permanently on its own instead of breaking the whole batch. The renderer
 * treats every string as untrusted and escapes it.
 */
export function readClaimedDeliveries(value: unknown): {
  readonly valid: ClaimedEmailDelivery[];
  readonly invalidIds: string[];
} {
  if (!Array.isArray(value)) throw new EmailDispatchError("invalid_claim_payload");
  const valid: ClaimedEmailDelivery[] = [];
  const invalidIds: string[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string" || !UUID.test(item.id)) {
      throw new EmailDispatchError("invalid_claim_payload");
    }
    const recipient = item.recipient;
    const ok =
      typeof item.type === "string" &&
      TYPES.has(item.type) &&
      (item.language === "fr" || item.language === "ar") &&
      typeof item.timezone === "string" &&
      typeof item.unsubscribeToken === "string" &&
      /^[A-Za-z0-9_-]{32}$/.test(item.unsubscribeToken) &&
      typeof item.attemptNumber === "number" &&
      isRecord(recipient) &&
      typeof recipient.email === "string" &&
      recipient.email.length <= 320 &&
      /^[^\s@<>]+@[^\s@<>]+$/.test(recipient.email) &&
      isRecord(item.payload);
    if (ok) valid.push(item as unknown as ClaimedEmailDelivery);
    else invalidIds.push(item.id);
  }
  return { valid, invalidIds };
}

function retryAfterSeconds(response: Response): number | null {
  const raw = response.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(Math.ceil(seconds), 3600);
  return null;
}

function remaining(response: Response): number | null {
  const raw =
    response.headers.get("ratelimit-remaining") ?? response.headers.get("x-ratelimit-remaining");
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * Only the `name` of a Resend error, and only a known one. The message may
 * repeat the address or the domain, so it is never read into anything.
 */
async function resendErrorName(response: Response): Promise<string | null> {
  try {
    const text = (await response.text()).slice(0, MAX_ERROR_BODY_BYTES);
    const body = JSON.parse(text) as unknown;
    if (isRecord(body) && typeof body.name === "string" && RESEND_ERROR_NAMES.has(body.name)) {
      return body.name;
    }
  } catch {
    // Not JSON, or unreadable: classify by status alone.
  }
  return null;
}

/** Midnight UTC after `now`: when Resend's daily quota resets. */
export function nextUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

/** The first instant of the next UTC month. */
export function nextUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

function secondsUntil(target: Date, nowMs: number): number {
  return Math.max(60, Math.ceil((target.getTime() - nowMs) / 1000));
}

/** Where the List-Unsubscribe header points, and whether it is one-click. */
export function listUnsubscribeHeaders(
  delivery: ClaimedEmailDelivery,
  pageUrl: string,
  config: EmailDispatchConfiguration,
): Record<string, string> {
  if (!config.oneClickUnsubscribeEndpoint) return { "List-Unsubscribe": `<${pageUrl}>` };
  const endpoint = `${config.oneClickUnsubscribeEndpoint}?token=${encodeURIComponent(
    delivery.unsubscribeToken,
  )}`;
  return {
    "List-Unsubscribe": `<${endpoint}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/** Sends one email through Resend and classifies the result. */
export async function sendThroughResend(
  delivery: ClaimedEmailDelivery,
  email: RenderedEmail,
  unsubscribePageUrl: string,
  config: EmailDispatchConfiguration,
  fetchImpl: FetchLike,
  now: () => number,
): Promise<SendOutcome> {
  const started = now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const tag = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256);
  const base = { providerMessageId: null, retryAfterSeconds: null, rateLimitRemaining: null };
  let response: Response;
  try {
    response = await fetchImpl(RESEND_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
        // Resend remembers a key for 24 hours; a retried attempt is the
        // same email (same token, same content) and is recognised.
        "idempotency-key": `botolago-email-${delivery.id}`,
      },
      body: JSON.stringify({
        from: config.from,
        to: [delivery.recipient.email],
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(config.replyTo ? { reply_to: config.replyTo } : {}),
        headers: listUnsubscribeHeaders(delivery, unsubscribePageUrl, config),
        tags: [
          { name: "category", value: "notification" },
          { name: "type", value: tag(delivery.type) },
        ],
      }),
    });
  } catch {
    clearTimeout(timer);
    return {
      ...base,
      outcome: "retryable_failure",
      stableErrorCode: controller.signal.aborted ? "delivery_timeout" : "delivery_network_error",
      latencyMs: now() - started,
      pause: null,
    };
  }
  clearTimeout(timer);
  const latencyMs = now() - started;
  const rateLimitRemaining = remaining(response);

  if (response.ok) {
    let id: string | null = null;
    try {
      const body = (await response.json()) as unknown;
      if (isRecord(body) && typeof body.id === "string" && body.id.length <= 200) id = body.id;
    } catch {
      id = null;
    }
    return {
      outcome: "sent",
      providerMessageId: id,
      stableErrorCode: null,
      retryAfterSeconds: null,
      rateLimitRemaining,
      latencyMs,
      pause: null,
    };
  }

  const status = response.status;
  const name = await resendErrorName(response);
  const retry = (code: string, seconds: number | null) => ({
    ...base,
    outcome: "retryable_failure" as const,
    stableErrorCode: code,
    retryAfterSeconds: seconds,
    rateLimitRemaining,
    latencyMs,
    pause: null,
  });
  const pauseUntil = (reason: ProviderPauseReason, until: Date, code: string): SendOutcome => ({
    ...retry(code, secondsUntil(until, now())),
    pause: { reason, until },
  });

  if (name === "daily_quota_exceeded") {
    return pauseUntil(
      "daily_quota_exceeded",
      new Date(nextUtcDay(new Date(now())).getTime() + 60_000),
      "delivery_quota_exceeded",
    );
  }
  if (name === "monthly_quota_exceeded") {
    return pauseUntil(
      "monthly_quota_exceeded",
      new Date(nextUtcMonth(new Date(now())).getTime() + 60_000),
      "delivery_quota_exceeded",
    );
  }
  if (status === 429) return retry("delivery_rate_limited", retryAfterSeconds(response) ?? 60);
  if (status === 401 || status === 403) {
    // A wrong, revoked or suspended key, or an unverified domain: nothing
    // will succeed until someone fixes it. Keep the mail and pause.
    return pauseUntil(
      "provider_auth_failed",
      new Date(now() + AUTH_PAUSE_MS),
      "delivery_provider_unavailable",
    );
  }
  if (name === "invalid_idempotent_request") {
    // This delivery's key was already accepted within the last 24 hours (the
    // earlier attempt went through but its answer was lost). The reader has
    // the email; sending it again is exactly what the key prevents.
    return {
      ...base,
      outcome: "sent",
      stableErrorCode: null,
      rateLimitRemaining,
      latencyMs,
      pause: null,
    };
  }
  if (status === 409) return retry("delivery_in_progress", 120);
  if (status >= 500) return retry("delivery_provider_error", null);
  return {
    ...base,
    outcome: "permanent_failure",
    stableErrorCode:
      status === 422 || name === "validation_error"
        ? "delivery_rejected_invalid"
        : "delivery_permanently_failed",
    rateLimitRemaining,
    latencyMs,
    pause: null,
  };
}

async function record(
  client: EmailRpcClient,
  deliveryId: string,
  outcome: SendOutcome,
): Promise<void> {
  await rpc(client, "service_record_notification_delivery_attempt", {
    p_delivery_id: deliveryId,
    p_outcome: outcome.outcome,
    p_retryable: outcome.outcome === "retryable_failure",
    p_provider_message_id: outcome.providerMessageId,
    p_stable_error_code: outcome.stableErrorCode,
    p_sanitized_summary: null,
    p_provider_latency_ms: Math.max(0, Math.min(Math.round(outcome.latencyMs), 600_000)),
    p_rate_limit_remaining: outcome.rateLimitRemaining,
    p_max_attempts: MAX_ATTEMPTS,
    p_retry_after_seconds: outcome.retryAfterSeconds,
  });
}

const permanent = (code: string): SendOutcome => ({
  outcome: "permanent_failure",
  providerMessageId: null,
  stableErrorCode: code,
  retryAfterSeconds: null,
  rateLimitRemaining: null,
  latencyMs: 0,
  pause: null,
});

/** One dispatch pass: claim, render, send, record — until the budget is spent. */
export async function runEmailDispatch(
  config: EmailDispatchConfiguration,
  dependencies: EmailDispatchDependencies,
): Promise<EmailDispatchSummary> {
  const now = dependencies.now ?? (() => Date.now());
  const sleep =
    dependencies.sleep ??
    ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const fetchImpl = dependencies.fetch ?? fetch;
  const links: EmailLinkContext = { appUrl: config.appUrl };
  const deadline = now() + config.budgetMs;
  const counts = { claimed: 0, sent: 0, retrying: 0, failed: 0 };
  let paused: SendOutcome["pause"] = null;

  while (!paused && now() < deadline) {
    const claimed = readClaimedDeliveries(
      await rpc(dependencies.client, "service_claim_email_deliveries", {
        p_limit: config.batchSize,
        p_lease_seconds: LEASE_SECONDS,
      }),
    );
    const batchSize = claimed.valid.length + claimed.invalidIds.length;
    if (batchSize === 0) break;
    counts.claimed += batchSize;

    for (const id of claimed.invalidIds) {
      await record(dependencies.client, id, permanent("email_payload_invalid"));
      counts.failed += 1;
    }

    let first = true;
    // Claimed but never tried because the provider refused everything: handed
    // back without spending an attempt (api.service_release_email_deliveries).
    const handBack: string[] = [];
    for (const delivery of claimed.valid) {
      if (paused) {
        handBack.push(delivery.id);
        continue;
      }
      if (!first && config.sendIntervalMs > 0) await sleep(config.sendIntervalMs);
      first = false;

      let email: RenderedEmail;
      let pageUrl: string;
      try {
        email = dependencies.render(delivery, links);
        pageUrl = dependencies.unsubscribeUrl(delivery, links);
      } catch {
        await record(dependencies.client, delivery.id, permanent("template_render_failed"));
        counts.failed += 1;
        continue;
      }
      const outcome = await sendThroughResend(delivery, email, pageUrl, config, fetchImpl, now);
      if (outcome.pause) {
        // The refusal was about the account, not this email: it goes back
        // with the rest, and sending pauses until the provider will accept.
        paused = outcome.pause;
        handBack.push(delivery.id);
        await rpc(dependencies.client, "service_pause_email_provider", {
          p_reason: paused.reason,
          p_until: paused.until.toISOString(),
        });
        continue;
      }
      await record(dependencies.client, delivery.id, outcome);
      if (outcome.outcome === "sent") counts.sent += 1;
      else if (outcome.outcome === "retryable_failure") counts.retrying += 1;
      else counts.failed += 1;
    }
    if (handBack.length > 0 && paused) {
      await rpc(dependencies.client, "service_release_email_deliveries", {
        p_delivery_ids: handBack,
        p_retry_at: paused.until.toISOString(),
      });
      counts.retrying += handBack.length;
    }
    if (batchSize < config.batchSize) break;
  }
  return paused ? { ...counts, pausedReason: paused.reason } : counts;
}

export async function handleEmailDispatchRequest(
  request: Request,
  dependencies: EmailDispatchDependencies,
): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    return json(413, { error: "request_too_large" });
  }
  const token = request.headers.get("x-botolago-scheduler-token") ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return json(401, { error: "unauthorized" });
  try {
    const verified = await rpc(dependencies.client, "service_verify_scheduler_token", {
      p_token: token,
    });
    if (verified !== true) return json(401, { error: "unauthorized" });
  } catch {
    return json(503, { error: "database_unavailable" });
  }

  let config: EmailDispatchConfiguration;
  try {
    config = emailDispatchConfiguration(dependencies.environment);
  } catch (error) {
    const code = error instanceof EmailDispatchError ? error.code : "invalid_runtime_configuration";
    // Nothing was claimed, so nothing is lost: the tick wakes us again later.
    return json(503, { error: code });
  }
  try {
    const summary = await runEmailDispatch(config, dependencies);
    return json(200, { ...summary });
  } catch (error) {
    const code = error instanceof EmailDispatchError ? error.code : "email_dispatch_failed";
    return json(502, { error: code });
  }
}
