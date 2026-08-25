import { describe, expect, test } from "bun:test";
import { AsyncSessionFence } from "./async-session-fence";

describe("AsyncSessionFence", () => {
  test("rejects an initial session snapshot after a newer auth event", () => {
    const fence = new AsyncSessionFence();
    const initialSnapshot = fence.snapshot();
    const signedOut = fence.begin();

    expect(fence.isCurrent(initialSnapshot)).toBe(false);
    expect(fence.isCurrent(signedOut)).toBe(true);
  });

  test("only the latest overlapping session application may commit", () => {
    const fence = new AsyncSessionFence();
    const userA = fence.begin();
    const userB = fence.begin();

    expect(fence.isCurrent(userA)).toBe(false);
    expect(fence.isCurrent(userB)).toBe(true);
  });

  test("explicit invalidation blocks an in-flight profile resolution", () => {
    const fence = new AsyncSessionFence();
    const profileRead = fence.begin();
    fence.invalidate();

    expect(fence.isCurrent(profileRead)).toBe(false);
  });
});

