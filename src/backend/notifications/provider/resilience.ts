import { NotificationError } from "../errors";
import type {
  DeliveryMessage,
  DeliveryProviderResult,
  NotificationDeliveryProvider,
} from "./contracts";

export interface DeliveryRetryOptions {
  readonly maxAttempts: number;
  readonly timeoutMs: number;
  readonly baseDelayMs: number;
  readonly random?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export async function sendWithNotificationRetry(
  provider: NotificationDeliveryProvider,
  message: DeliveryMessage,
  options: DeliveryRetryOptions,
): Promise<DeliveryProviderResult> {
  const random = options.random ?? Math.random;
  const sleep =
    options.sleep ??
    ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let last: DeliveryProviderResult | null = null;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error("delivery_timeout")),
      options.timeoutMs,
    );
    try {
      last = await provider.send(message, controller.signal);
    } catch (error) {
      last = {
        providerMessageId: null,
        delivered: false,
        retryable: true,
        invalidDestination: false,
        stableErrorCode: "delivery_timeout",
        rateLimit: { remaining: null, resetAt: null },
        latencyMs: options.timeoutMs,
      };
      if (attempt === options.maxAttempts)
        throw new NotificationError(
          "delivery_provider_unavailable",
          "Delivery provider timed out.",
          error,
        );
    } finally {
      clearTimeout(timeout);
    }
    if (!last.retryable || attempt === options.maxAttempts) return last;
    const exponential = options.baseDelayMs * 2 ** (attempt - 1);
    const jittered = Math.round(exponential * (0.75 + random() * 0.5));
    await sleep(jittered);
  }
  throw new NotificationError("delivery_provider_unavailable", "Delivery provider is unavailable.");
}
