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

  test("a cancelled or finished request leaves no timer behind to fire", async () => {
    without("any", "timeout");
    const caller = new AbortController();
    const cancelled = signalWithDeadline(caller.signal, 30);
    caller.abort();
    const released = signalWithDeadline(undefined, 30);
    released.release();
    let fired = 0;
    cancelled.signal?.addEventListener("abort", () => (fired += 1));
    released.signal?.addEventListener("abort", () => (fired += 1));
    await wait(70);
    // Neither was aborted a second time by a late deadline, and the released one never was.
    expect(fired).toBe(0);
    expect(released.signal?.aborted).toBe(false);
  });
});
