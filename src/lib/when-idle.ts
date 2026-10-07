/**
 * Runs `task` once, when the browser has a moment to spare after the work in
 * hand (and within `timeout` milliseconds at the latest), so it does not
 * compete with the page's first render and its first requests. Where
 * `requestIdleCallback` is missing (Safari) it runs after a short delay.
 * Returns a function that cancels it. Does nothing on the server.
 */
export function whenIdle(task: () => void, timeout = 2000): () => void {
  if (typeof window === "undefined") return () => {};
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(task, { timeout });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(task, 200);
  return () => window.clearTimeout(handle);
}
