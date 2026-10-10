// Loading a page ahead, from a control that is not a link.
//
// A `<Link>` starts loading its page when the reader shows they are about to
// follow it (`defaultPreload: "intent"`, src/router.tsx). The Matches tabs,
// the header search's results and the top players' rows are buttons that
// navigate on click, so they had none of that: the page started loading only
// once the click landed. These handlers give such a control what a link has,
// on the same rules -- a pointer resting on it for the router's preload delay,
// a finger touching it at once, a pointer leaving it before the delay calls it
// off -- and the same loader, which reads through the query cache, so a page
// whose data is already fresh costs nothing. A route that opts out of
// preloading (`preload: false`, the Admin routes) is left alone by the router.
//
// Not on focus: a tab reached with the arrow keys is chosen at once (UiTabs),
// so there is nothing to get ahead of.

import { useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";

/** What a control spreads onto itself to load its page ahead. */
export type IntentHandlers = {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onTouchStart: () => void;
};

type Timers = {
  set: (run: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

const browserTimers: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * The timing on its own, without React or the router, so it can be tested
 * step by step. One pending preload at a time: a pointer moving from one
 * control to the next calls off the first.
 */
export function createIntentPreloader<Target>(
  preload: (target: Target) => void,
  delayMs: number,
  timers: Timers = browserTimers,
) {
  let pending: unknown;
  let waiting = false;
  const cancel = () => {
    if (!waiting) return;
    timers.clear(pending);
    waiting = false;
  };
  const handlers = (target: Target): IntentHandlers => ({
    onMouseEnter: () => {
      cancel();
      if (delayMs <= 0) {
        preload(target);
        return;
      }
      waiting = true;
      pending = timers.set(() => {
        waiting = false;
        preload(target);
      }, delayMs);
    },
    onMouseLeave: cancel,
    onTouchStart: () => {
      cancel();
      preload(target);
    },
  });
  return { handlers, cancel };
}

/** A page to load, as a `<Link>` names it. */
export type PreloadTarget = {
  to: string;
  params?: object;
  search?: object;
};

/**
 * `handlers(target)` for each control (or `undefined` when the router does
 * not preload on intent), and `cancel()` for a control that stays on screen
 * after it navigates (the header search). Anything pending is called off when
 * the component goes.
 */
export function useIntentPreload() {
  const router = useRouter();
  const preloader = useRef<ReturnType<typeof createIntentPreloader<PreloadTarget>> | null>(null);
  if (preloader.current === null) {
    preloader.current = createIntentPreloader<PreloadTarget>((target) => {
      // A failed preload is not the reader's problem: the click loads the
      // page as it always did. `as never`: the router's own type wants each
      // destination spelled out literally, which a shared helper cannot do.
      router.preloadRoute(target as never).catch(() => {});
    }, router.options.defaultPreloadDelay ?? 50);
  }
  useEffect(() => () => preloader.current?.cancel(), []);
  const onIntent = router.options.defaultPreload === "intent";
  return useMemo(() => {
    const { handlers, cancel } = preloader.current!;
    return {
      handlers: (target: PreloadTarget): IntentHandlers | undefined =>
        onIntent ? handlers(target) : undefined,
      cancel,
    };
  }, [onIntent]);
}
