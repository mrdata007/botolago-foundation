import { describe, expect, test } from "bun:test";
import { NewsProviderError } from "./contracts";
import { newsBackoffDelay, withNewsProviderResilience } from "./resilience";

describe("news provider resilience", () => {
  test("backoff is deterministic when jitter is injected", () => {
    expect(
      newsBackoffDelay(2, { attempts: 4, timeoutMs: 10, baseDelayMs: 100, maxDelayMs: 1_000 }, 0.5),
    ).toBe(400);
  });

  test("retries only retryable errors", async () => {
    let calls = 0;
    const result = await withNewsProviderResilience(
      async () => {
        calls += 1;
        if (calls === 1) throw new NewsProviderError("provider_rate_limited", "wait", true, 0);
        return "ok";
      },
      { attempts: 2, timeoutMs: 100, baseDelayMs: 1, maxDelayMs: 1 },
      async () => undefined,
    );
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });
});
