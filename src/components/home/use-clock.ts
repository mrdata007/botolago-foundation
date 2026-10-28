import { useSyncExternalStore } from "react";

/** How often the cards re-read the clock. The countdown is to the minute. */
export const CLOCK_TICK_MS = 15_000;

/**
 * The browser's clock, to the tick: a moment that is the same for every call
 * inside one tick, so every card on Home reads the same "now" and React sees a
 * stable snapshot between ticks.
 */
export function clockNow(at: number = Date.now()): number {
  return Math.floor(at / CLOCK_TICK_MS) * CLOCK_TICK_MS;
}

/**
 * One timer for every subscriber, started with the first and stopped with the
 * last. It also reads the clock again when the tab is shown, because a phone
 * freezes timers in the background and would otherwise show a stale countdown
 * until the next tick.
 */
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

const notify = () => {
  for (const listener of listeners) listener();
};
const onVisible = () => {
  if (document.visibilityState === "visible") notify();
};

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    timer = setInterval(notify, CLOCK_TICK_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", notify);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", notify);
    }
  };
}

/**
 * The time now, following the clock without a reload. `null` on the server and
 * on the first browser render, so both agree (no hydration mismatch) and the
 * caller draws only what does not depend on the time, holding the room for the
 * rest.
 */
export function useClock(): number | null {
  return useSyncExternalStore(subscribe, clockNow, () => null);
}
