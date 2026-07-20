import type { NotificationChannel } from "../provider-types";

export interface DeliveryDestination {
  readonly reference: string;
}

export interface DeliveryMessage {
  readonly idempotencyKey: string;
  readonly channel: NotificationChannel;
  readonly destination: DeliveryDestination;
  readonly language: "fr" | "ar";
  readonly title: string;
  readonly body: string;
  readonly deepLink?: { readonly target: string; readonly entityId: string | null };
}

export interface DeliveryRateLimit {
  readonly remaining: number | null;
  readonly resetAt: string | null;
}

export interface DeliveryProviderResult {
  readonly providerMessageId: string | null;
  readonly delivered: boolean;
  readonly retryable: boolean;
  readonly invalidDestination: boolean;
  readonly stableErrorCode: string | null;
  readonly rateLimit: DeliveryRateLimit;
  readonly latencyMs: number;
}

export interface NotificationDeliveryProvider {
  readonly key: string;
  readonly channel: NotificationChannel;
  send(message: DeliveryMessage, signal?: AbortSignal): Promise<DeliveryProviderResult>;
  sendBatch?(
    messages: readonly DeliveryMessage[],
    signal?: AbortSignal,
  ): Promise<readonly DeliveryProviderResult[]>;
}
