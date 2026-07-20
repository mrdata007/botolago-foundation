import type {
  DeliveryMessage,
  DeliveryProviderResult,
  NotificationDeliveryProvider,
} from "./contracts";
import type { NotificationChannel } from "../provider-types";

export type FixtureDeliveryBehavior =
  | "success"
  | "delivered"
  | "rate_limited"
  | "timeout"
  | "invalid_destination"
  | "permanent_failure";

export class FixtureNotificationProvider implements NotificationDeliveryProvider {
  readonly key = "fixture";

  constructor(
    readonly channel: NotificationChannel,
    private readonly behavior: FixtureDeliveryBehavior = "success",
  ) {}

  async send(message: DeliveryMessage, signal?: AbortSignal): Promise<DeliveryProviderResult> {
    if (signal?.aborted) throw signal.reason;
    const base = {
      providerMessageId: `fixture:${message.idempotencyKey}`,
      rateLimit: { remaining: 999, resetAt: null },
      latencyMs: 5,
    } as const;
    switch (this.behavior) {
      case "success":
        return {
          ...base,
          delivered: false,
          retryable: false,
          invalidDestination: false,
          stableErrorCode: null,
        };
      case "delivered":
        return {
          ...base,
          delivered: true,
          retryable: false,
          invalidDestination: false,
          stableErrorCode: null,
        };
      case "rate_limited":
        return {
          ...base,
          providerMessageId: null,
          delivered: false,
          retryable: true,
          invalidDestination: false,
          stableErrorCode: "delivery_rate_limited",
          rateLimit: { remaining: 0, resetAt: "2030-01-01T00:01:00.000Z" },
        };
      case "timeout":
        return {
          ...base,
          providerMessageId: null,
          delivered: false,
          retryable: true,
          invalidDestination: false,
          stableErrorCode: "delivery_timeout",
        };
      case "invalid_destination":
        return {
          ...base,
          providerMessageId: null,
          delivered: false,
          retryable: false,
          invalidDestination: true,
          stableErrorCode: "invalid_device",
        };
      case "permanent_failure":
        return {
          ...base,
          providerMessageId: null,
          delivered: false,
          retryable: false,
          invalidDestination: false,
          stableErrorCode: "delivery_permanently_failed",
        };
    }
  }
}
