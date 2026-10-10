import { prefersReducedMotion } from "@/lib/motion";

export type MotionLib = typeof import("./motion-lib");

let loaded: MotionLib | null = null;
let pending: Promise<MotionLib> | null = null;
let failed = false;

/**
 * Fetches Motion (its own chunk) once. Until it has arrived, and always under
 * reduced motion, the exit wrappers draw plain elements: a child that is
 * removed in that time is simply gone, so nothing is ever left stuck on screen.
 */
export function loadMotion(): Promise<MotionLib> {
  pending ??= import("./motion-lib").then((module) => (loaded = module));
  // Offline, or the chunk is gone: stay with plain elements, which still
  // leave at once. Not retried, so a bad network does not loop.
  pending.catch(() => {
    failed = true;
  });
  return pending;
}

export function loadedMotion(): MotionLib | null {
  return loaded;
}

export function motionFailed(): boolean {
  return failed;
}

/** Whether Motion has arrived (so an exit that is about to play will animate). */
export function motionLoaded(): boolean {
  return loaded !== null;
}

// Fetch the chunk early, at low priority, once the page has settled, so it is
// ready well before anyone dismisses or closes anything. Not under reduced
// motion (nothing here animates then) and never on the server.
if (typeof window !== "undefined" && !prefersReducedMotion()) {
  const prefetch = () => void loadMotion().catch(() => undefined);
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(prefetch, { timeout: 4000 });
  } else {
    setTimeout(prefetch, 2000);
  }
}
