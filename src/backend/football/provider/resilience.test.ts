import { describe, expect, test } from "bun:test";
import { FootballError } from "../errors";
import {
  ProviderCircuitBreaker,
  withProviderResilience,
  type ProviderResiliencePolicy,
} from "./resilience";

const policy: ProviderResiliencePolicy = {
  timeoutMs: 1_000,
  maxRetries: 2,
  retryBaseMs: 100,
  retryMaxMs: 1_000,
  circuitFailureThreshold: 2,
  circuitResetMs: 5_000,
};

describe("provider resilience", () => {
  test("uses bounded exponential backoff with deterministic jitter", async () => {
    let attempts = 0;
    const sleeps: number[] = [];
    const breaker = new ProviderCircuitBreaker(2, 5_000);
    const result = await withProviderResilience(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new FootballError("provider_rate_limited", "limited");
        return "ok";
      },
      breaker,
      policy,
      { sleep: async (ms) => void sleeps.push(ms), random: () => 0 },
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
    expect(sleeps).toEqual([100, 200]);
    expect(breaker.state()).toBe("closed");
  });

  test("opens a temporary circuit after the failure budget", async () => {
    let now = 1_000;
    const breaker = new ProviderCircuitBreaker(1, 5_000, () => now);
    await expect(
      withProviderResilience(
        async () => {
          throw new FootballError("provider_unavailable", "down");
        },
        breaker,
        { ...policy, maxRetries: 0 },
      ),
    ).rejects.toBeInstanceOf(FootballError);
    expect(breaker.state()).toBe("open");
    expect(() => breaker.assertAvailable()).toThrow(FootballError);
    now += 5_001;
    expect(() => breaker.assertAvailable()).not.toThrow();
  });
});
