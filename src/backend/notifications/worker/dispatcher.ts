import type { NotificationDeliveryProvider } from "../provider/contracts";
import { sendWithNotificationRetry } from "../provider/resilience";
import type { NotificationWorkerGateway } from "./gateway.server";

export interface DispatchResult {
  readonly claimed: number;
  readonly sent: number;
  readonly failed: number;
  readonly invalidatedDevices: number;
}

export async function dispatchNotificationBatch(
  gateway: NotificationWorkerGateway,
  providers: ReadonlyMap<string, NotificationDeliveryProvider>,
  limit = 100,
): Promise<DispatchResult> {
  const deliveries = await gateway.claimDeliveries(limit);
  const result = { claimed: deliveries.length, sent: 0, failed: 0, invalidatedDevices: 0 };
  for (const delivery of deliveries) {
    const provider = providers.get(`${delivery.channel}:${delivery.providerKey}`);
    if (!provider) {
      await gateway.recordDelivery(delivery, {
        delivered: false,
        retryable: false,
        providerMessageId: null,
        stableErrorCode: "delivery_provider_unavailable",
        latencyMs: 0,
        rateLimitRemaining: null,
      });
      result.failed += 1;
      continue;
    }
    const providerResult = await sendWithNotificationRetry(
      provider,
      {
        idempotencyKey: `${delivery.id}:${delivery.attemptNumber}`,
        channel: delivery.channel,
        destination: { reference: delivery.destination },
        language: delivery.language,
        title: delivery.title,
        body: delivery.body,
        deepLink: delivery.deepLink,
      },
      { maxAttempts: 1, timeoutMs: 10_000, baseDelayMs: 250 },
    );
    await gateway.recordDelivery(delivery, {
      delivered: providerResult.delivered,
      retryable: providerResult.retryable,
      providerMessageId: providerResult.providerMessageId,
      stableErrorCode: providerResult.stableErrorCode,
      latencyMs: providerResult.latencyMs,
      rateLimitRemaining: providerResult.rateLimit.remaining,
    });
    if (providerResult.invalidDestination && delivery.deviceRegistrationId) {
      await gateway.invalidateDevice(
        delivery.deviceRegistrationId,
        providerResult.stableErrorCode ?? "invalid_device",
      );
      result.invalidatedDevices += 1;
    }
    if (providerResult.stableErrorCode) result.failed += 1;
    else result.sent += 1;
  }
  return result;
}
