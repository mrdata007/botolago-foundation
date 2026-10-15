import { describe, expect, test } from "bun:test";

import { dismissOptimistically, restoreHidden, withHidden } from "./notification-dismissal";

describe("an inbox card is hidden at once and brought back if the server refuses (UX-002)", () => {
  test("withHidden / restoreHidden never mutate the set they are given", () => {
    const start: ReadonlySet<string> = new Set(["a"]);
    const hidden = withHidden(start, "b");
    expect([...hidden]).toEqual(["a", "b"]);
    expect([...start]).toEqual(["a"]);
    const back = restoreHidden(hidden, "b");
    expect([...back]).toEqual(["a"]);
    expect([...hidden]).toEqual(["a", "b"]);
    // Restoring a card that was never hidden returns the same set.
    expect(restoreHidden(back, "zzz")).toBe(back);
  });

  test("a rejected dismissal restores the card exactly once and reports the failure", async () => {
    const calls: string[] = [];
    const result = await dismissOptimistically("n1", {
      hide: (id) => calls.push(`hide:${id}`),
      commit: async () => {
        calls.push("commit");
        throw new Error("rpc refused");
      },
      restore: (id) => calls.push(`restore:${id}`),
      onFailure: () => calls.push("notify"),
    });
    expect(result).toBe(false);
    expect(calls).toEqual(["hide:n1", "commit", "restore:n1", "notify"]);
  });

  test("a successful dismissal stays hidden and says nothing", async () => {
    const calls: string[] = [];
    const result = await dismissOptimistically("n1", {
      hide: (id) => calls.push(`hide:${id}`),
      commit: async () => {
        calls.push("commit");
      },
      restore: (id) => calls.push(`restore:${id}`),
      onFailure: () => calls.push("notify"),
    });
    expect(result).toBe(true);
    expect(calls).toEqual(["hide:n1", "commit"]);
  });

  test("a failure of one card does not bring back another that succeeded", async () => {
    let hidden: ReadonlySet<string> = new Set();
    const deps = (fail: boolean) => ({
      hide: (id: string) => {
        hidden = withHidden(hidden, id);
      },
      commit: async () => {
        if (fail) throw new Error("no");
      },
      restore: (id: string) => {
        hidden = restoreHidden(hidden, id);
      },
      onFailure: () => undefined,
    });
    await Promise.all([
      dismissOptimistically("a", deps(true)),
      dismissOptimistically("b", deps(false)),
    ]);
    expect([...hidden]).toEqual(["b"]);
  });
});
