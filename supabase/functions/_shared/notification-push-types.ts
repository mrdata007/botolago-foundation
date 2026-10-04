// Shared shapes for the push dispatcher (Edge Function notification-push-dispatch).
//
// Dependency-free so it runs under Bun (tests) and Deno (the Edge Function).

/** The two real providers: Google's FCM for Android, Apple's APNs for iPhone. */
export type PushProviderKey = "fcm" | "apns";

/**
 * One claimed push delivery, as api.service_claim_push_deliveries returns it.
 * `destination` is the device's raw push token: it is handed to the provider
 * and never logged, stored or returned.
 */
export interface ClaimedPushDelivery {
  readonly id: string;
  readonly notificationId: string;
  readonly attemptNumber: number;
  readonly providerKey: PushProviderKey;
  readonly platform: "android" | "ios" | "web";
  readonly deviceRegistrationId: string;
  readonly type: string;
  readonly language: "fr" | "ar";
  readonly title: string;
  readonly body: string;
  readonly deepLink: {
    readonly target: string;
    readonly entityId: string | null;
  };
  /** How long the provider may hold the message for an offline phone. */
  readonly expiresInSeconds: number;
  readonly destination: string;
}

/**
 * Why a provider refused everything, rather than one device. The pass stops
 * using that provider and hands its claimed pushes back without spending an
 * attempt, instead of burning every waiting push's attempts on our own fault.
 */
export type ProviderRefusal = "credentials_rejected" | "configuration_rejected";

/** What one send came to. Codes are the stable, lower-case kind the database accepts. */
export interface PushSendOutcome {
  readonly outcome: "sent" | "retryable_failure" | "permanent_failure";
  readonly providerMessageId: string | null;
  readonly stableErrorCode: string | null;
  readonly retryAfterSeconds: number | null;
  readonly latencyMs: number;
  /** The provider says this device's token is dead: the device is turned off. */
  readonly invalidDestination: boolean;
  /** The refusal was about us, not this device. */
  readonly refusal: ProviderRefusal | null;
}

export interface PushProvider {
  readonly key: PushProviderKey;
  send(delivery: ClaimedPushDelivery): Promise<PushSendOutcome>;
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** The longest a notification's title and body are sent: phones cut them far sooner. */
export const PUSH_TITLE_MAX = 120;
export const PUSH_BODY_MAX = 400;

export function clip(text: string, max: number): string {
  const characters = Array.from(text);
  return characters.length <= max ? text : `${characters.slice(0, max - 1).join("")}…`;
}

/**
 * The thread a notification belongs to, so a phone groups the alerts of one
 * match together (a goal, then the one that cancels it): the page the alert
 * opens, when it opens one.
 */
export function threadId(delivery: ClaimedPushDelivery): string {
  const { target, entityId } = delivery.deepLink;
  return entityId ? `${target}:${entityId}` : delivery.type;
}

export function outcome(
  kind: PushSendOutcome["outcome"],
  fields: Partial<Omit<PushSendOutcome, "outcome">> = {},
): PushSendOutcome {
  return {
    outcome: kind,
    providerMessageId: null,
    stableErrorCode: null,
    retryAfterSeconds: null,
    latencyMs: 0,
    invalidDestination: false,
    refusal: null,
    ...fields,
  };
}
