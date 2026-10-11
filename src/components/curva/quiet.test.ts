import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { QUIET, whenQuiet, type QuietEnv } from "./quiet";

/** A browser that hands out frames by hand: `tick(time)` runs the pending callback; `timers` by `fire`. */
function fakeEnv() {
  let pending: ((time: number) => void) | null = null;
  const timers = new Map<number, () => void>();
  let next = 1;
  const env: QuietEnv = {
    raf: (callback) => {
      pending = callback;
      return next++;
    },
    cancelRaf: () => {
      pending = null;
    },
    setTimer: (callback) => {
      const id = next++;
      timers.set(id, callback);
      return id;
    },
    clearTimer: (id) => {
      timers.delete(id);
    },
  };
  return {
    env,
    tick(time: number) {
      const callback = pending;
      pending = null;
      callback?.(time);
    },
    fire() {
      for (const [id, callback] of [...timers]) {
        timers.delete(id);
        callback();
      }
    },
    get hasFrame() {
      return pending !== null;
    },
    get timerCount() {
      return timers.size;
    },
  };
}

describe("waiting for the page to be quiet", () => {
  it("is quiet after the frames in a row that come on time, and stops watching", async () => {
    const f = fakeEnv();
    const quiet = whenQuiet(QUIET, f.env);
    // the first frame only sets the clock; three on-time gaps follow
    for (const t of [100, 117, 134, 151]) f.tick(t);
    expect(await quiet.done).toBe("quiet");
    expect(f.hasFrame).toBe(false);
    expect(f.timerCount).toBe(0);
  });

  it("starts the count again after a frame that came late", async () => {
    const f = fakeEnv();
    const quiet = whenQuiet(QUIET, f.env);
    // two on time, then a 500 ms stall (a long task), then three on time
    for (const t of [0, 17, 34, 534]) f.tick(t);
    expect(f.hasFrame).toBe(true);
    for (const t of [551, 568, 585]) f.tick(t);
    expect(await quiet.done).toBe("quiet");
  });

  it("counts a 30 Hz screen's frames as on time", async () => {
    const f = fakeEnv();
    const quiet = whenQuiet(QUIET, f.env);
    for (const t of [0, 33.3, 66.6, 100]) f.tick(t);
    expect(await quiet.done).toBe("quiet");
  });

  it("gives up after the longest wait, when frames never come (a hidden tab) or never settle", async () => {
    const f = fakeEnv();
    const quiet = whenQuiet(QUIET, f.env);
    f.tick(0);
    f.tick(400);
    f.fire();
    expect(await quiet.done).toBe("late");
    expect(f.hasFrame).toBe(false);
  });

  it("never resolves after it is cancelled", async () => {
    const f = fakeEnv();
    const quiet = whenQuiet(QUIET, f.env);
    quiet.cancel();
    expect(f.hasFrame).toBe(false);
    expect(f.timerCount).toBe(0);
    let resolved = false;
    void quiet.done.then(() => {
      resolved = true;
    });
    f.fire();
    await Promise.resolve();
    expect(resolved).toBe(false);
  });

  it("waits at most 500 ms and asks for 3 frames within 34 ms", () => {
    expect(QUIET).toEqual({ frames: 3, budgetMs: 34, maxWaitMs: 500 });
  });
});

describe("the stage's entrance", () => {
  const source = readFileSync(`${import.meta.dir}/use-stage-entrance.ts`, "utf8");

  it("is hidden at its rest box until the page is quiet, then played", () => {
    expect(source).toContain('lift.style.opacity = "0"');
    const wait = source.indexOf("whenQuiet()");
    expect(wait).toBeGreaterThan(source.indexOf('lift.style.opacity = "0"'));
    // the animation is made after the wait, never at the stage's mount
    expect(source.indexOf("lift.animate(")).toBeGreaterThan(wait);
    expect(source).toContain('lift.style.removeProperty("opacity")');
  });

  it("does nothing when the stage has gone before the page was quiet", () => {
    expect(source).toContain("!mounted.current || !lift.isConnected");
  });
});
