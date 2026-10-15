import { afterEach, describe, expect, test } from "bun:test";

import { signalWithDeadline } from "./abort-deadline";

// SEC-05: older embedded browsers lack AbortSignal.any (and some AbortSignal.timeout). The deadline
// and the caller's own cancellation must both survive.

const realAny = AbortSignal.any;
const realTimeout = AbortSignal.timeout;
const mutable = AbortSignal as unknown as { any?: unknown; timeout?: unknown };

function without(...names: Array<"any" | "timeout">) {
  for (const name of names) delete mutable[name];
}

afterEach(() => {
  mutable.any = realAny;
  mutable.timeout = realTimeout;
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("signalWithDeadline", () => {
  test("a modern runtime uses the platform's own signals", () => {
    const caller = new AbortController();
    const { signal } = signalWithDeadline(caller.signal, 1_000);
    expect(signal).toBeInstanceOf(AbortSignal);
    caller.abort();
    expect(signal?.aborted).toBe(true);
  });

  test("without AbortSignal.any, the deadline still fires", async () => {
    without("any");
    const caller = new AbortController();
    const { signal } = signalWithDeadline(caller.signal, 30);
    expect(signal).not.toBe(caller.signal);
    expect(signal?.aborted).toBe(false);
    await wait(70);
    expect(signal?.aborted).toBe(true);
    expect((signal?.reason as Error).name).toBe("TimeoutError");
    expect(caller.signal.aborted).toBe(false);
  });

  test("without AbortSignal.any, the caller's cancel still reaches the request", () => {
    without("any");
    const caller = new AbortController();
    const reason = new Error("navigated away");
    const { signal } = signalWithDeadline(caller.signal, 1_000);
    caller.abort(reason);
    expect(signal?.aborted).toBe(true);
    expect(signal?.reason).toBe(reason);
  });

  test("without AbortSignal.any, a caller that has already cancelled is honoured at once", () => {
    without("any");
    const caller = new AbortController();
    caller.abort();
    const { signal } = signalWithDeadline(caller.signal, 1_000);
    expect(signal?.aborted).toBe(true);
  });

  test("without AbortSignal.timeout either, a deadline is still added, with or without a caller", async () => {
    without("any", "timeout");
    const alone = signalWithDeadline(undefined, 30);
    const caller = new AbortController();
    const withCaller = signalWithDeadline(caller.signal, 30);
    expect(alone.signal?.aborted).toBe(false);
    await wait(70);
    expect(alone.signal?.aborted).toBe(true);
    expect(withCaller.signal?.aborted).toBe(true);
    expect((alone.signal?.reason as Error).name).toBe("TimeoutError");
  });

  test("without AbortSignal.timeout, the caller can still cancel before the deadline", () => {
    without("timeout");
    const caller = new AbortController();
    const { signal } = signalWithDeadline(caller.signal, 1_000);
    caller.abort();
    expect(signal?.aborted).toBe(true);
    expect((signal?.reason as Error).name).toBe("AbortError");
  });

  /** Runs `body` while counting the timers it starts and has not cleared. */
  function countingTimers<T>(body: () => T): { result: T; live: () => number } {
    const live = new Set<unknown>();
    const realSet = globalThis.setTimeout;
    const realClear = globalThis.clearTimeout;
    globalThis.setTimeout = ((handler: () => void, ms?: number) => {
      const handle = realSet(handler, ms);
      live.add(handle);
      return handle;
    }) as unknown as typeof setTimeout;
    globalThis.clearTimeout = ((handle: Parameters<typeof clearTimeout>[0]) => {
      live.delete(handle);
      realClear(handle);
    }) as typeof clearTimeout;
    try {
      const result = body();
      return { result, live: () => live.size };
    } finally {
      globalThis.setTimeout = realSet;
      globalThis.clearTimeout = realClear;
    }
  }

  test("a cancelled request clears its timer, and a released one clears its timer and listener", () => {
    without("any", "timeout");
    const caller = new AbortController();
    const pending = countingTimers(() => signalWithDeadline(caller.signal, 1_000));
    // The deadline timer is running until something settles the request.
    expect(pending.live()).toBe(1);
    const cancelled = countingTimers(() => {
      const one = signalWithDeadline(caller.signal, 1_000);
      caller.abort();
      return one;
    });
    expect(cancelled.live()).toBe(0);

    const other = new AbortController();
    const released = countingTimers(() => {
      const one = signalWithDeadline(other.signal, 1_000);
      one.release();
      return one;
    });
    expect(released.live()).toBe(0);
    // The caller's listener is gone too: a later cancel does not reach the released signal.
    other.abort();
    expect(released.result.signal?.aborted).toBe(false);
    pending.result.release();
  });
});
