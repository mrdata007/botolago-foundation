// The two push providers the dispatcher sends through: Google's FCM (Android)
// and Apple's APNs (iPhone). Each takes one claimed delivery and answers with
// what it came to: sent, to be retried, or failed for good, and whether the
// device's token is dead or the refusal was about us (our key, our setup)
// rather than the device.
//
// Everything a provider says is read for its *name* only (FCM's error code,
// APNs' reason); no message text, token or key is logged or returned.
//
// Dependency-free so it runs under Bun (tests) and Deno (the Edge Function).

import { importSigningKey, signJwt } from "./notification-push-jwt.ts";
import {
  clip,
  outcome,
  PUSH_BODY_MAX,
  PUSH_TITLE_MAX,
  threadId,
  type ClaimedPushDelivery,
  type FetchLike,
  type PushProvider,
  type PushSendOutcome,
} from "./notification-push-types.ts";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRY_AFTER_SECONDS = 3_600;

function retryAfter(response: Response): number | null {
  const value = Number(response.headers.get("retry-after"));
  return Number.isFinite(value) && value > 0
    ? Math.min(Math.ceil(value), MAX_RETRY_AFTER_SECONDS)
    : null;
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const text = await response.text();
    if (text.length === 0 || text.length > 20_000) return null;
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `BadDeviceToken` → `bad_device_token`, kept to what the database accepts as an error code. */
function snake(prefix: string, name: string | null, fallback: string): string {
  const text = (name ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return text.length >= 2 && text.length <= 60 ? `${prefix}_${text}` : `${prefix}_${fallback}`;
}

function timeout(): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
    ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    : undefined;
}

// ---------------------------------------------------------------------------
// FCM (Android)
// ---------------------------------------------------------------------------

export interface FcmCredentials {
  readonly projectId: string;
  readonly clientEmail: string;
  readonly privateKey: string;
}

/** The service-account JSON from the FCM_SERVICE_ACCOUNT_JSON secret, checked for what it must hold. */
export function parseFcmCredentials(raw: string): FcmCredentials {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("fcm_credentials_unreadable");
  }
  if (!isRecord(parsed)) throw new Error("fcm_credentials_unreadable");
  const projectId = parsed.project_id;
  const clientEmail = parsed.client_email;
  const privateKey = parsed.private_key;
  if (
    typeof projectId !== "string" ||
    !/^[a-z][a-z0-9-]{4,29}$/.test(projectId) ||
    typeof clientEmail !== "string" ||
    !/^[^\s@]+@[^\s@]+$/.test(clientEmail) ||
    typeof privateKey !== "string" ||
    !privateKey.includes("PRIVATE KEY")
  ) {
    throw new Error("fcm_credentials_unreadable");
  }
  return { projectId, clientEmail, privateKey };
}

// The addresses are fixed here, never taken from the secret, so a changed
// secret cannot point the private key's signature at another host.
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_REFRESH_MARGIN_MS = 120_000;

type AccessToken =
  | { readonly ok: true; readonly token: string }
  | { readonly ok: false; readonly result: PushSendOutcome };

export class FcmProvider implements PushProvider {
  readonly key = "fcm" as const;
  private cached: { readonly token: string; readonly expiresAt: number } | null = null;
  private signingKey: Promise<CryptoKey> | null = null;

  constructor(
    private readonly credentials: FcmCredentials,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private async accessToken(forceRefresh: boolean): Promise<AccessToken> {
    if (
      !forceRefresh &&
      this.cached &&
      this.cached.expiresAt - TOKEN_REFRESH_MARGIN_MS > this.now()
    ) {
      return { ok: true, token: this.cached.token };
    }
    this.cached = null;
    let assertion: string;
    try {
      this.signingKey ??= importSigningKey(this.credentials.privateKey, "RS256");
      const issuedAt = Math.floor(this.now() / 1000);
      assertion = await signJwt(
        "RS256",
        {},
        {
          iss: this.credentials.clientEmail,
          scope: FCM_SCOPE,
          aud: GOOGLE_TOKEN_URL,
          iat: issuedAt,
          exp: issuedAt + 3_600,
        },
        await this.signingKey,
      );
    } catch {
      this.signingKey = null;
      return {
        ok: false,
        result: outcome("retryable_failure", {
          stableErrorCode: "fcm_key_unreadable",
          refusal: "credentials_rejected",
        }),
      };
    }
    let response: Response;
    try {
      response = await this.fetchImpl(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion,
        }),
        signal: timeout(),
      });
    } catch {
      return {
        ok: false,
        result: outcome("retryable_failure", { stableErrorCode: "fcm_token_network_error" }),
      };
    }
    if (!response.ok) {
      // A key Google will not accept is our problem, not a device's; a Google
      // that is down is neither.
      const ours = response.status === 400 || response.status === 401 || response.status === 403;
      return {
        ok: false,
        result: outcome("retryable_failure", {
          stableErrorCode: ours ? "fcm_credentials_rejected" : "fcm_token_unavailable",
          retryAfterSeconds: retryAfter(response),
          refusal: ours ? "credentials_rejected" : null,
        }),
      };
    }
    const body = await readJson(response);
    const token = body?.access_token;
    const lifetime = typeof body?.expires_in === "number" ? body.expires_in : 3_600;
    if (typeof token !== "string" || token.length < 20) {
      return {
        ok: false,
        result: outcome("retryable_failure", { stableErrorCode: "fcm_token_unavailable" }),
      };
    }
    this.cached = { token, expiresAt: this.now() + Math.max(60, lifetime) * 1000 };
    return { ok: true, token };
  }

  async send(delivery: ClaimedPushDelivery): Promise<PushSendOutcome> {
    const started = this.now();
    const latency = () => Math.max(0, this.now() - started);
    const message = {
      message: {
        token: delivery.destination,
        notification: {
          title: clip(delivery.title, PUSH_TITLE_MAX),
          body: clip(delivery.body, PUSH_BODY_MAX),
        },
        data: {
          deliveryId: delivery.id,
          type: delivery.type,
          target: delivery.deepLink.target,
          entityId: delivery.deepLink.entityId ?? "",
          threadId: threadId(delivery),
        },
        android: {
          priority: "HIGH",
          ttl: `${Math.max(1, Math.floor(delivery.expiresInSeconds))}s`,
        },
      },
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const auth = await this.accessToken(attempt > 0);
      if (!auth.ok) return { ...auth.result, latencyMs: latency() };
      let response: Response;
      try {
        response = await this.fetchImpl(
          `https://fcm.googleapis.com/v1/projects/${this.credentials.projectId}/messages:send`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${auth.token}`,
              "content-type": "application/json; charset=utf-8",
            },
            body: JSON.stringify(message),
            signal: timeout(),
          },
        );
      } catch {
        return outcome("retryable_failure", {
          stableErrorCode: "fcm_network_error",
          latencyMs: latency(),
        });
      }
      // The login we hold may have just been revoked: get a fresh one once.
      if (response.status === 401 && attempt === 0) {
        this.cached = null;
        continue;
      }
      return this.interpret(response, latency());
    }
    return outcome("retryable_failure", {
      stableErrorCode: "fcm_credentials_rejected",
      refusal: "credentials_rejected",
      latencyMs: latency(),
    });
  }

  private async interpret(response: Response, latencyMs: number): Promise<PushSendOutcome> {
    const body = await readJson(response);
    if (response.ok) {
      const name = typeof body?.name === "string" ? body.name.slice(0, 200) : null;
      return outcome("sent", { providerMessageId: name, latencyMs });
    }
    const error = isRecord(body?.error) ? body.error : {};
    const details = Array.isArray(error.details) ? error.details : [];
    const detailCode = details
      .map((detail) => (isRecord(detail) ? detail.errorCode : undefined))
      .find((code): code is string => typeof code === "string");
    const status = typeof error.status === "string" ? error.status : null;
    const code = detailCode ?? status;
    const message = typeof error.message === "string" ? error.message.toLowerCase() : "";

    if (code === "UNREGISTERED") {
      return outcome("permanent_failure", {
        stableErrorCode: "fcm_unregistered",
        invalidDestination: true,
        latencyMs,
      });
    }
    if (code === "SENDER_ID_MISMATCH") {
      return outcome("permanent_failure", {
        stableErrorCode: "fcm_sender_mismatch",
        invalidDestination: true,
        latencyMs,
      });
    }
    if (code === "INVALID_ARGUMENT") {
      const tokenProblem = message.includes("registration token");
      return outcome("permanent_failure", {
        stableErrorCode: tokenProblem ? "fcm_token_invalid" : "fcm_invalid_argument",
        invalidDestination: tokenProblem,
        latencyMs,
      });
    }
    if (code === "UNAUTHENTICATED" || response.status === 401) {
      return outcome("retryable_failure", {
        stableErrorCode: "fcm_credentials_rejected",
        refusal: "credentials_rejected",
        latencyMs,
      });
    }
    if (code === "PERMISSION_DENIED" || code === "NOT_FOUND" || response.status === 403) {
      // The project, its messaging API or the service account's right to send
      // is wrong: ours to fix, and the same for every device.
      return outcome("retryable_failure", {
        stableErrorCode: "fcm_configuration_rejected",
        refusal: "configuration_rejected",
        latencyMs,
      });
    }
    if (response.status === 429 || code === "QUOTA_EXCEEDED") {
      return outcome("retryable_failure", {
        stableErrorCode: "fcm_rate_limited",
        retryAfterSeconds: retryAfter(response),
        latencyMs,
      });
    }
    if (response.status >= 500 || code === "UNAVAILABLE" || code === "INTERNAL") {
      return outcome("retryable_failure", {
        stableErrorCode: "fcm_unavailable",
        retryAfterSeconds: retryAfter(response),
        latencyMs,
      });
    }
    return outcome("permanent_failure", {
      stableErrorCode: `fcm_http_${response.status}`,
      latencyMs,
    });
  }
}

// ---------------------------------------------------------------------------
// APNs (iPhone)
// ---------------------------------------------------------------------------

export interface ApnsCredentials {
  readonly keyId: string;
  readonly teamId: string;
  readonly bundleId: string;
  readonly privateKey: string;
  readonly environment: "production" | "sandbox";
}

/** Apple: refresh the provider token no more than every 20 minutes and no less than every 60. */
const APNS_TOKEN_LIFETIME_MS = 50 * 60_000;
const APNS_TOKEN_MIN_AGE_MS = 20 * 60_000;
const APNS_DEVICE_TOKEN = /^[0-9a-fA-F]{32,200}$/;

export function parseApnsCredentials(
  environment: Readonly<Record<string, string | undefined>>,
): ApnsCredentials {
  const keyId = environment.APNS_KEY_ID?.trim() ?? "";
  const teamId = environment.APNS_TEAM_ID?.trim() ?? "";
  const bundleId = environment.APNS_BUNDLE_ID?.trim() ?? "";
  const privateKey = environment.APNS_KEY_P8 ?? "";
  const mode = (environment.APNS_ENVIRONMENT ?? "production").trim().toLowerCase();
  if (
    !/^[A-Z0-9]{10}$/.test(keyId) ||
    !/^[A-Z0-9]{10}$/.test(teamId) ||
    !/^[A-Za-z0-9.-]{3,155}$/.test(bundleId) ||
    !privateKey.includes("PRIVATE KEY") ||
    (mode !== "production" && mode !== "sandbox")
  ) {
    throw new Error("apns_credentials_unreadable");
  }
  return { keyId, teamId, bundleId, privateKey, environment: mode };
}

export class ApnsProvider implements PushProvider {
  readonly key = "apns" as const;
  private cached: { readonly token: string; readonly issuedAt: number } | null = null;
  private signingKey: Promise<CryptoKey> | null = null;

  constructor(
    private readonly credentials: ApnsCredentials,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private async providerToken(forceRefresh: boolean): Promise<string> {
    const fresh =
      this.cached !== null && this.now() - this.cached.issuedAt < APNS_TOKEN_LIFETIME_MS;
    if (fresh && !forceRefresh && this.cached) return this.cached.token;
    this.signingKey ??= importSigningKey(this.credentials.privateKey, "ES256");
    const issuedAt = this.now();
    const token = await signJwt(
      "ES256",
      { kid: this.credentials.keyId },
      { iss: this.credentials.teamId, iat: Math.floor(issuedAt / 1000) },
      await this.signingKey,
    );
    this.cached = { token, issuedAt };
    return token;
  }

  async send(delivery: ClaimedPushDelivery): Promise<PushSendOutcome> {
    const started = this.now();
    const latency = () => Math.max(0, this.now() - started);
    // The token goes into the address, so it must be only what Apple issues.
    if (!APNS_DEVICE_TOKEN.test(delivery.destination)) {
      return outcome("permanent_failure", {
        stableErrorCode: "apns_token_malformed",
        invalidDestination: true,
      });
    }
    const host =
      this.credentials.environment === "sandbox"
        ? "https://api.sandbox.push.apple.com"
        : "https://api.push.apple.com";
    const lifetime = Math.max(1, Math.floor(delivery.expiresInSeconds));
    const body = JSON.stringify({
      aps: {
        alert: {
          title: clip(delivery.title, PUSH_TITLE_MAX),
          body: clip(delivery.body, PUSH_BODY_MAX),
        },
        sound: "default",
        "thread-id": threadId(delivery),
      },
      deliveryId: delivery.id,
      type: delivery.type,
      target: delivery.deepLink.target,
      entityId: delivery.deepLink.entityId,
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      let token: string;
      try {
        token = await this.providerToken(attempt > 0);
      } catch {
        this.signingKey = null;
        return outcome("retryable_failure", {
          stableErrorCode: "apns_key_unreadable",
          refusal: "credentials_rejected",
          latencyMs: latency(),
        });
      }
      let response: Response;
      try {
        response = await this.fetchImpl(`${host}/3/device/${delivery.destination}`, {
          method: "POST",
          headers: {
            authorization: `bearer ${token}`,
            "apns-topic": this.credentials.bundleId,
            "apns-push-type": "alert",
            "apns-priority": "10",
            // After this the network drops the message instead of showing it late.
            "apns-expiration": String(Math.floor(this.now() / 1000) + lifetime),
            "apns-id": delivery.id,
            "content-type": "application/json",
          },
          body,
          signal: timeout(),
        });
      } catch {
        return outcome("retryable_failure", {
          stableErrorCode: "apns_network_error",
          latencyMs: latency(),
        });
      }
      const reply = response.ok ? null : await readJson(response);
      const reason = typeof reply?.reason === "string" ? reply.reason : null;

      if (response.ok) {
        const id = response.headers.get("apns-id");
        return outcome("sent", {
          providerMessageId: id ? id.slice(0, 200) : null,
          latencyMs: latency(),
        });
      }
      if (
        response.status === 403 &&
        (reason === "ExpiredProviderToken" ||
          reason === "InvalidProviderToken" ||
          reason === "MissingProviderToken")
      ) {
        // An old token is replaced once. A token Apple refuses straight after
        // it was made means the key itself is wrong.
        const age = this.cached ? this.now() - this.cached.issuedAt : Infinity;
        if (attempt === 0 && age >= APNS_TOKEN_MIN_AGE_MS) continue;
        return outcome("retryable_failure", {
          stableErrorCode: "apns_credentials_rejected",
          refusal: "credentials_rejected",
          latencyMs: latency(),
        });
      }
      return this.interpret(response, reason, latency());
    }
    return outcome("retryable_failure", {
      stableErrorCode: "apns_credentials_rejected",
      refusal: "credentials_rejected",
      latencyMs: latency(),
    });
  }

  private interpret(response: Response, reason: string | null, latencyMs: number): PushSendOutcome {
    if (response.status === 410 || reason === "Unregistered") {
      return outcome("permanent_failure", {
        stableErrorCode: "apns_unregistered",
        invalidDestination: true,
        latencyMs,
      });
    }
    if (reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic") {
      return outcome("permanent_failure", {
        stableErrorCode: snake("apns", reason, "bad_device_token"),
        invalidDestination: true,
        latencyMs,
      });
    }
    if (
      reason === "BadTopic" ||
      reason === "TopicDisallowed" ||
      reason === "BadCertificateEnvironment"
    ) {
      return outcome("retryable_failure", {
        stableErrorCode: "apns_configuration_rejected",
        refusal: "configuration_rejected",
        latencyMs,
      });
    }
    if (response.status === 429 || reason === "TooManyRequests") {
      return outcome("retryable_failure", {
        stableErrorCode: "apns_rate_limited",
        retryAfterSeconds: retryAfter(response),
        latencyMs,
      });
    }
    if (response.status >= 500 || reason === "ServiceUnavailable" || reason === "Shutdown") {
      return outcome("retryable_failure", {
        stableErrorCode: "apns_unavailable",
        retryAfterSeconds: retryAfter(response),
        latencyMs,
      });
    }
    return outcome("permanent_failure", {
      stableErrorCode: snake("apns", reason, `http_${response.status}`),
      latencyMs,
    });
  }
}
