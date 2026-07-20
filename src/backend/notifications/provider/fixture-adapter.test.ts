import { describe, expect, test } from "bun:test";
import { FixtureNotificationProvider } from "./fixture-adapter";
import { sendWithNotificationRetry } from "./resilience";

const message = {
  idempotencyKey: "delivery:1",
  channel: "push" as const,
  destination: { reference: "fixture-device-token" },
  language: "fr" as const,
  title: "But !",
  body: "Wydad marque.",
};

describe("notification provider contract", () => {
  test("returns deterministic message IDs", async () => {
    const provider = new FixtureNotificationProvider("push", "success");
    const result = await provider.send(message);
    expect(result.providerMessageId).toBe("fixture:delivery:1");
    expect(result.retryable).toBe(false);
  });

  test("classifies invalid destinations as permanent", async () => {
    const provider = new FixtureNotificationProvider("push", "invalid_destination");
    const result = await provider.send(message);
    expect(result.invalidDestination).toBe(true);
    expect(result.retryable).toBe(false);
  });

  test("uses bounded exponential retry delays", async () => {
    const sleeps: number[] = [];
    const provider = new FixtureNotificationProvider("push", "rate_limited");
    const result = await sendWithNotificationRetry(provider, message, {
      maxAttempts: 3,
      timeoutMs: 100,
      baseDelayMs: 10,
      random: () => 0.5,
      sleep: async (milliseconds) => void sleeps.push(milliseconds),
    });
    expect(result.stableErrorCode).toBe("delivery_rate_limited");
    expect(sleeps).toEqual([10, 20]);
  });
});
