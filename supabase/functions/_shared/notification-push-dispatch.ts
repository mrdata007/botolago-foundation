// Sends the push notifications that the database has queued.
//
// Woken by pg_cron through pg_net with the scheduler token in
// `x-botolago-scheduler-token`, as the email dispatcher is. Each pass:
//   1. checks that token in-process against BOTOLAGO_SCHEDULER_TOKEN, before
//      any database call (scheduler-token.ts);
//   2. claims a batch with api.service_claim_push_deliveries — the database has
//      already decided who gets what, and has cancelled anything the reader
//      switched off, anything for a device that is gone, and anything whose
//      moment has passed. It hands back nothing at all while push is switched
//      off;
//   3. sends each one through its provider (Google's FCM for Android, Apple's
//      APNs for iPhone), a few at a time;
//   4. records every outcome with api.service_record_notification_delivery_attempt,
//      which schedules bounded retries and dead-letters permanent failures, and
//      turns off a device whose token the provider says is dead with
//      api.service_invalidate_notification_device.
//
// When a provider refuses everything for a reason that is ours — a key it will
// not accept, a project that is not set up — or has no credentials at all, the
// pass stops using it and hands its claimed pushes back with
// api.service_release_push_deliveries, without spending an attempt, instead of
// burning every waiting push on our own fault.
//
// No device token, key, title or body is ever logged or returned: the response
// carries counts only.
//
// Dependency-free so it runs under Bun (tests) and Deno (the Edge Function).

import {
  ApnsProvider,
  FcmProvider,
  parseApnsCredentials,
  parseFcmCredentials,
} from "./notification-push-providers.ts";
import {
  outcome,
  type ClaimedPushDelivery,
  type FetchLike,
  type ProviderRefusal,
  type PushProvider,
  type PushProviderKey,
  type PushSendOutcome,
} from "./notification-push-types.ts";
import { schedulerTokenRefusal } from "./scheduler-token.ts";

export interface PushRpcResult {
  readonly data: unknown;
  readonly error: { readonly code?: string; readonly message: string } | null;
}

export interface PushRpcClient {
  schema(name: "api"): {
    rpc(name: string, args?: Record<string, unknown>): PromiseLike<PushRpcResult>;
  };
}

export interface PushDispatchDependencies {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly client: PushRpcClient;
  /** Replaces the providers built from the secrets (tests). */
  readonly providers?: Partial<Record<PushProviderKey, PushProvider>>;
  readonly fetch?: FetchLike;
  readonly now?: () => number;
}

export interface PushDispatchConfiguration {
  readonly batchSize: number;
  readonly budgetMs: number;
  readonly concurrency: number;
}

export interface PushDispatchSummary {
  readonly claimed: number;
  readonly sent: number;
  readonly retrying: number;
  readonly failed: number;
  readonly devicesTurnedOff: number;
  readonly handedBack: number;
  /** Providers without usable credentials, by name. */
  readonly unconfigured: readonly PushProviderKey[];
  /** Providers that refused everything this pass, by name and reason. */
  readonly refused: Readonly<Partial<Record<PushProviderKey, ProviderRefusal>>>;
}

export class PushDispatchError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const LEASE_SECONDS = 120;
const MAX_ATTEMPTS = 4;
const MAX_REQUEST_BYTES = 4_096;
/** How long a provider's pushes wait when we could not use it. */
const HAND_BACK_SECONDS: Readonly<Record<"unconfigured" | ProviderRefusal, number>> = {
  unconfigured: 600,
  credentials_rejected: 900,
  configuration_rejected: 1_800,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function integerSetting(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new PushDispatchError("invalid_runtime_configuration");
  }
  return parsed;
}

export function pushDispatchConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): PushDispatchConfiguration {
  return {
    batchSize: integerSetting(environment.PUSH_BATCH_SIZE, 50, 1, 200),
    budgetMs: integerSetting(environment.PUSH_BUDGET_MS, 100_000, 5_000, 140_000),
    concurrency: integerSetting(environment.PUSH_CONCURRENCY, 8, 1, 20),
  };
}

/**
 * The providers the secrets allow. One without usable credentials is simply
 * absent: its pushes are handed back, and the response names it.
 */
export function buildProviders(
  environment: Readonly<Record<string, string | undefined>>,
  fetchImpl: FetchLike,
  now: () => number,
): { providers: Partial<Record<PushProviderKey, PushProvider>>; unconfigured: PushProviderKey[] } {
  const providers: Partial<Record<PushProviderKey, PushProvider>> = {};
  const unconfigured: PushProviderKey[] = [];
  try {
    providers.fcm = new FcmProvider(
      parseFcmCredentials(environment.FCM_SERVICE_ACCOUNT_JSON ?? ""),
      fetchImpl,
      now,
    );
  } catch {
    unconfigured.push("fcm");
  }
  try {
    providers.apns = new ApnsProvider(parseApnsCredentials(environment), fetchImpl, now);
  } catch {
    unconfigured.push("apns");
  }
  return { providers, unconfigured };
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
  client: PushRpcClient,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await client.schema("api").rpc(name, args);
  if (result.error) throw new PushDispatchError("database_unavailable");
  return result.data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The claim RPC's output, checked just enough that a malformed row fails
 * permanently on its own instead of breaking the whole batch.
 */
export function readClaimedPushDeliveries(value: unknown): {
  readonly valid: ClaimedPushDelivery[];
  readonly invalidIds: string[];
} {
  if (!Array.isArray(value)) throw new PushDispatchError("invalid_claim_payload");
  const valid: ClaimedPushDelivery[] = [];
  const invalidIds: string[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string" || !UUID.test(item.id)) {
      throw new PushDispatchError("invalid_claim_payload");
    }
    const deepLink = item.deepLink;
    const ok =
      (item.providerKey === "fcm" || item.providerKey === "apns") &&
      (item.platform === "android" || item.platform === "ios" || item.platform === "web") &&
      typeof item.deviceRegistrationId === "string" &&
      UUID.test(item.deviceRegistrationId) &&
      typeof item.notificationId === "string" &&
      typeof item.attemptNumber === "number" &&
      typeof item.type === "string" &&
      (item.language === "fr" || item.language === "ar") &&
      typeof item.title === "string" &&
      item.title.length > 0 &&
      typeof item.body === "string" &&
      item.body.length > 0 &&
      isRecord(deepLink) &&
      typeof deepLink.target === "string" &&
      (deepLink.entityId === null ||
        (typeof deepLink.entityId === "string" && UUID.test(deepLink.entityId))) &&
      typeof item.expiresInSeconds === "number" &&
      Number.isFinite(item.expiresInSeconds) &&
      item.expiresInSeconds >= 1 &&
      typeof item.destination === "string" &&
      item.destination.length >= 16 &&
      item.destination.length <= 4096;
    if (ok) valid.push(item as unknown as ClaimedPushDelivery);
    else invalidIds.push(item.id);
  }
  return { valid, invalidIds };
}

async function record(
  client: PushRpcClient,
  deliveryId: string,
  result: PushSendOutcome,
): Promise<void> {
  await rpc(client, "service_record_notification_delivery_attempt", {
    p_delivery_id: deliveryId,
    p_outcome: result.outcome,
    p_retryable: result.outcome === "retryable_failure",
    p_provider_message_id: result.providerMessageId,
    p_stable_error_code: result.stableErrorCode,
    p_sanitized_summary: null,
    p_provider_latency_ms: Math.max(0, Math.min(Math.round(result.latencyMs), 600_000)),
    p_rate_limit_remaining: null,
    p_max_attempts: MAX_ATTEMPTS,
    p_retry_after_seconds: result.retryAfterSeconds,
  });
}

/** One dispatch pass: claim, send, record — until the budget is spent or nothing is left. */
export async function runPushDispatch(
  config: PushDispatchConfiguration,
  dependencies: PushDispatchDependencies,
): Promise<PushDispatchSummary> {
  const now = dependencies.now ?? (() => Date.now());
  const built = dependencies.providers
    ? {
        providers: dependencies.providers,
        unconfigured: (["fcm", "apns"] as const).filter((key) => !dependencies.providers?.[key]),
      }
    : buildProviders(dependencies.environment, dependencies.fetch ?? fetch, now);
  const { providers, unconfigured } = built;
  const deadline = now() + config.budgetMs;
  const counts = {
    claimed: 0,
    sent: 0,
    retrying: 0,
    failed: 0,
    devicesTurnedOff: 0,
    handedBack: 0,
  };
  const refused: Partial<Record<PushProviderKey, ProviderRefusal>> = {};

  while (now() < deadline) {
    const claimed = readClaimedPushDeliveries(
      await rpc(dependencies.client, "service_claim_push_deliveries", {
        p_limit: config.batchSize,
        p_lease_seconds: LEASE_SECONDS,
      }),
    );
    const batchSize = claimed.valid.length + claimed.invalidIds.length;
    if (batchSize === 0) break;
    counts.claimed += batchSize;

    for (const id of claimed.invalidIds) {
      await record(
        dependencies.client,
        id,
        outcome("permanent_failure", { stableErrorCode: "push_payload_invalid" }),
      );
      counts.failed += 1;
    }

    // Pushes this pass could not use a provider for, by how long they wait.
    const handBack = new Map<number, string[]>();
    const holdBack = (id: string, seconds: number) => {
      handBack.set(seconds, [...(handBack.get(seconds) ?? []), id]);
    };

    const handle = async (delivery: ClaimedPushDelivery): Promise<void> => {
      const provider = providers[delivery.providerKey];
      if (!provider) {
        holdBack(delivery.id, HAND_BACK_SECONDS.unconfigured);
        return;
      }
      const earlier = refused[delivery.providerKey];
      if (earlier) {
        holdBack(delivery.id, HAND_BACK_SECONDS[earlier]);
        return;
      }
      let result: PushSendOutcome;
      try {
        result = await provider.send(delivery);
      } catch {
        result = outcome("retryable_failure", { stableErrorCode: "push_send_failed" });
      }
      if (result.refusal) {
        // About us, not this device: it goes back with the rest, and this
        // provider is left alone for the rest of the pass.
        refused[delivery.providerKey] = result.refusal;
        holdBack(delivery.id, HAND_BACK_SECONDS[result.refusal]);
        return;
      }
      await record(dependencies.client, delivery.id, result);
      if (result.outcome === "sent") counts.sent += 1;
      else if (result.outcome === "retryable_failure") counts.retrying += 1;
      else counts.failed += 1;
      if (result.invalidDestination) {
        await rpc(dependencies.client, "service_invalidate_notification_device", {
          p_device_registration_id: delivery.deviceRegistrationId,
          p_reason_code: "push_token_rejected",
        });
        counts.devicesTurnedOff += 1;
      }
    };

    // A few at a time: providers answer in tens of milliseconds, and a goal's
    // alert should not wait behind a hundred others.
    const queue = [...claimed.valid];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) await handle(next);
    };
    await Promise.all(
      Array.from({ length: Math.min(config.concurrency, queue.length) }, () => worker()),
    );

    let handedBackNow = 0;
    for (const [seconds, ids] of handBack) {
      await rpc(dependencies.client, "service_release_push_deliveries", {
        p_delivery_ids: ids,
        p_retry_at: new Date(now() + seconds * 1000).toISOString(),
      });
      handedBackNow += ids.length;
    }
    counts.handedBack += handedBackNow;
    // Handing a whole batch back and claiming the next would only churn.
    if (handedBackNow > 0) break;
    if (batchSize < config.batchSize) break;
  }
  return { ...counts, unconfigured, refused };
}

export async function handlePushDispatchRequest(
  request: Request,
  dependencies: PushDispatchDependencies,
): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    return json(413, { error: "request_too_large" });
  }
  // Checked in-process, before any database call (scheduler-token.ts).
  const refusal = schedulerTokenRefusal(request, dependencies.environment);
  if (refusal) return refusal;

  let config: PushDispatchConfiguration;
  try {
    config = pushDispatchConfiguration(dependencies.environment);
  } catch (error) {
    const code = error instanceof PushDispatchError ? error.code : "invalid_runtime_configuration";
    // Nothing was claimed, so nothing is lost: the next tick wakes us again.
    return json(503, { error: code });
  }
  try {
    const summary = await runPushDispatch(config, dependencies);
    return json(200, { ...summary });
  } catch (error) {
    const code = error instanceof PushDispatchError ? error.code : "push_dispatch_failed";
    return json(502, { error: code });
  }
}
