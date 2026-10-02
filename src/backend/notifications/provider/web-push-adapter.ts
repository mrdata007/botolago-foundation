import { NEWS_ENABLED } from "@/lib/feature-flags";
import { notificationPath } from "@/lib/notification-link";
import type { NotificationChannel } from "../provider-types";
import type {
  DeliveryMessage,
  DeliveryProviderResult,
  NotificationDeliveryProvider,
} from "./contracts";
import {
  base64UrlDecode,
  createVapidAuthorization,
  encryptWebPushPayload,
  type VapidKeys,
} from "./web-push-crypto";

/**
 * Sends one notification to one browser through its push service (Chrome and
 * Edge, Firefox, Safari): the `web_push` provider the dispatcher looks up as
 * `push:web_push`.
 *
 * The destination of a delivery is the browser's subscription, saved as JSON
 * (`{ endpoint, keys: { p256dh, auth } }`). That text comes from a browser, so
 * the endpoint is checked before anything is sent: only https, and only the
 * hosts the browsers' own push services use. Anything else is refused as an
 * invalid destination, never fetched.
 */

const PUSH_SERVICE_HOSTS: readonly string[] = [
  "fcm.googleapis.com", // Chrome, Edge, Opera, Samsung Internet
  "updates.push.services.mozilla.com", // Firefox
  "push.services.mozilla.com",
  "web.push.apple.com", // Safari
  "push.apple.com",
  "notify.windows.com", // Edge on Windows
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export interface PushDestination {
  readonly endpoint: string;
  readonly userAgentPublicKey: Buffer;
  readonly authSecret: Buffer;
}

/** The subscription a delivery points at, or `null` when it is not a usable one. */
export function parsePushDestination(reference: string): PushDestination | null {
  try {
    const value: unknown = JSON.parse(reference);
    if (typeof value !== "object" || value === null) return null;
    const { endpoint, keys } = value as { endpoint?: unknown; keys?: Record<string, unknown> };
    if (typeof endpoint !== "string" || !isAllowedPushEndpoint(endpoint)) return null;
    if (typeof keys?.p256dh !== "string" || typeof keys.auth !== "string") return null;
    const userAgentPublicKey = base64UrlDecode(keys.p256dh);
    const authSecret = base64UrlDecode(keys.auth);
    if (userAgentPublicKey.length !== 65 || authSecret.length !== 16) return null;
    return { endpoint, userAgentPublicKey, authSecret };
  } catch {
    return null;
  }
}

export interface WebPushPayload {
  readonly v: 1;
  readonly title: string;
  readonly body: string;
  readonly lang: "fr" | "ar";
  readonly dir: "ltr" | "rtl";
  /** The path the service worker opens when the notification is tapped. */
  readonly url: string;
  readonly tag: string;
}

const MAX_TITLE = 120;
const MAX_BODY = 400;

function clip(text: string, max: number): string {
  const chars = [...text];
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("")}…`;
}

export function buildWebPushPayload(
  message: DeliveryMessage,
  newsEnabled = NEWS_ENABLED,
): WebPushPayload {
  const link = message.deepLink ?? { target: "none", entityId: null };
  const path = notificationPath(
    { target: link.target as never, entityId: link.entityId },
    newsEnabled,
  );
  return {
    v: 1,
    title: clip(message.title, MAX_TITLE),
    body: clip(message.body, MAX_BODY),
    lang: message.language,
    dir: message.language === "ar" ? "rtl" : "ltr",
    url: path ?? "/notifications",
    // One notification of a delivery replaces its earlier copy on the phone.
    tag: message.idempotencyKey.split(":")[0] ?? message.idempotencyKey,
  };
}

export interface WebPushProviderConfig {
  readonly keys: VapidKeys;
  /** `mailto:` or `https:` contact the push services can reach us on. */
  readonly subject: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  /** How long a push service keeps a message for a phone that is off. */
  readonly ttlSeconds?: number;
  readonly now?: () => number;
}

const FAILED_BASE = {
  providerMessageId: null,
  delivered: false,
  rateLimit: { remaining: null, resetAt: null },
} as const;

export class WebPushNotificationProvider implements NotificationDeliveryProvider {
  readonly key = "web_push";
  readonly channel: NotificationChannel = "push";

  constructor(private readonly config: WebPushProviderConfig) {}

  async send(message: DeliveryMessage, signal?: AbortSignal): Promise<DeliveryProviderResult> {
    const clock = this.config.now ?? Date.now;
    const started = clock();
    const latency = () => Math.max(0, clock() - started);
    const destination = parsePushDestination(message.destination.reference);
    if (!destination)
      return {
        ...FAILED_BASE,
        retryable: false,
        invalidDestination: true,
        stableErrorCode: "invalid_device",
        latencyMs: latency(),
      };

    const body = encryptWebPushPayload({
      payload: Buffer.from(JSON.stringify(buildWebPushPayload(message)), "utf8"),
      userAgentPublicKey: destination.userAgentPublicKey,
      authSecret: destination.authSecret,
    });
    const authorization = createVapidAuthorization({
      keys: this.config.keys,
      subject: this.config.subject,
      audience: new URL(destination.endpoint).origin,
      nowSeconds: Math.floor(clock() / 1000),
    });
    const timeout = AbortSignal.timeout(this.config.timeoutMs ?? 8000);
    try {
      const response = await (this.config.fetch ?? fetch)(destination.endpoint, {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Encoding": "aes128gcm",
          "Content-Type": "application/octet-stream",
          TTL: String(this.config.ttlSeconds ?? 3600),
          Urgency: "normal",
        },
        body: new Uint8Array(body),
        redirect: "error",
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      return this.fromStatus(response, message, latency());
    } catch (error) {
      if (signal?.aborted) throw error;
      return {
        ...FAILED_BASE,
        retryable: true,
        invalidDestination: false,
        stableErrorCode: "delivery_timeout",
        latencyMs: latency(),
      };
    }
  }

  private fromStatus(
    response: Response,
    message: DeliveryMessage,
    latencyMs: number,
  ): DeliveryProviderResult {
    if (response.status >= 200 && response.status < 300)
      return {
        providerMessageId: `web_push:${message.idempotencyKey}`,
        // The push service accepted it; whether the phone showed it is not known.
        delivered: false,
        retryable: false,
        invalidDestination: false,
        stableErrorCode: null,
        rateLimit: { remaining: null, resetAt: null },
        latencyMs,
      };
    const base = { ...FAILED_BASE, latencyMs };
    // The subscription is gone (the user cleared it, or uninstalled): stop using it.
    if (response.status === 404 || response.status === 410)
      return {
        ...base,
        retryable: false,
        invalidDestination: true,
        stableErrorCode: "invalid_device",
      };
    if (response.status === 429) {
      const wait = Number(response.headers.get("Retry-After"));
      return {
        ...base,
        retryable: true,
        invalidDestination: false,
        stableErrorCode: "delivery_rate_limited",
        rateLimit: {
          remaining: 0,
          resetAt:
            Number.isFinite(wait) && wait > 0
              ? new Date(Date.now() + wait * 1000).toISOString()
              : null,
        },
      };
    }
    if (response.status >= 500)
      return {
        ...base,
        retryable: true,
        invalidDestination: false,
        stableErrorCode: "delivery_provider_error",
      };
    // 400, 401, 403, 413 and the like: sending the same thing again will not help.
    return {
      ...base,
      retryable: false,
      invalidDestination: false,
      stableErrorCode: "delivery_permanently_failed",
    };
  }
}
