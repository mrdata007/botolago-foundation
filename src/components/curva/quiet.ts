/**
 * Waiting for the page to be quiet before a motion starts.
 *
 * A transform-and-opacity animation is the compositor's, and plays at 60 frames a second on a
 * loaded page (measured: 33 frames in 525 ms at CPU x4, none over 33 ms). Started at the moment a
 * stage mounts, it competes with whatever React is still rendering and the first raster of the
 * card, and arrives as three frames in a second after an empty wait. So the entrance is held at its
 * first frame (invisible, nothing flashes) until a few frames in a row come on time, or until
 * `QUIET.maxWaitMs` has passed, whichever is first.
 */
export const QUIET = {
  /** Consecutive frames that must come on time. */
  frames: 3,
  /** The longest gap between two frames that counts as on time: two frames at 60 Hz, a frame at 30 Hz. */
  budgetMs: 34,
  /** Never wait longer than this for it. */
  maxWaitMs: 500,
} as const;

/** What `whenQuiet` needs from the browser, so a test can drive it. */
export interface QuietEnv {
  raf: (callback: (time: number) => void) => number;
  cancelRaf: (id: number) => void;
  setTimer: (callback: () => void, ms: number) => number;
  clearTimer: (id: number) => void;
}

const browserEnv = (): QuietEnv => ({
  raf: (callback) => window.requestAnimationFrame(callback),
  cancelRaf: (id) => window.cancelAnimationFrame(id),
  setTimer: (callback, ms) => window.setTimeout(callback, ms),
  clearTimer: (id) => window.clearTimeout(id),
});

export interface Quiet {
  /** "quiet" once the frames came on time, "late" when the longest wait ran out first. */
  done: Promise<"quiet" | "late">;
  /** Stops watching; `done` never resolves after it. */
  cancel: () => void;
}

/** Resolves when `frames` consecutive frames are no more than `budgetMs` apart, or after `maxWaitMs`. */
export function whenQuiet(
  options: { frames: number; budgetMs: number; maxWaitMs: number } = QUIET,
  env: QuietEnv = browserEnv(),
): Quiet {
  let finished = false;
  let rafId = 0;
  let timerId = 0;
  let resolve: (value: "quiet" | "late") => void = () => undefined;
  const done = new Promise<"quiet" | "late">((r) => {
    resolve = r;
  });
  const finish = (value: "quiet" | "late"): void => {
    if (finished) return;
    finished = true;
    env.cancelRaf(rafId);
    env.clearTimer(timerId);
    resolve(value);
  };
  let last: number | null = null;
  let streak = 0;
  const frame = (time: number): void => {
    if (finished) return;
    if (last !== null && time - last <= options.budgetMs) streak += 1;
    else streak = 0;
    last = time;
    if (streak >= options.frames) finish("quiet");
    else rafId = env.raf(frame);
  };
  rafId = env.raf(frame);
  // frames do not come in a hidden tab: the timer is what ends the wait there
  timerId = env.setTimer(() => finish("late"), options.maxWaitMs);
  return {
    done,
    cancel: () => {
      if (finished) return;
      finished = true;
      env.cancelRaf(rafId);
      env.clearTimer(timerId);
    },
  };
}
