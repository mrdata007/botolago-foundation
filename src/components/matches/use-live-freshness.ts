import { useEffect, useRef, useState } from "react";
import { liveFreshness, shouldRefetchOnReturn, type LiveFreshness } from "@/lib/match-freshness";
import type { Match } from "@/types/domain";

/** The events that mean the reader is back on the page. */
export const RETURN_EVENTS = {
  document: ["visibilitychange"],
  window: ["pageshow", "focus", "online"],
} as const;

/**
 * Calls `onReturn` whenever the reader comes back to the page (and the page is
 * visible). Returns the function that stops listening.
 */
export function watchReturns(
  win: Pick<EventTarget, "addEventListener" | "removeEventListener">,
  doc: Pick<EventTarget, "addEventListener" | "removeEventListener"> & {
    readonly visibilityState?: string;
  },
  onReturn: () => void,
): () => void {
  const handle = () => {
    if (doc.visibilityState === "hidden") return;
    onReturn();
  };
  for (const name of RETURN_EVENTS.document) doc.addEventListener(name, handle);
  for (const name of RETURN_EVENTS.window) win.addEventListener(name, handle);
  return () => {
    for (const name of RETURN_EVENTS.document) doc.removeEventListener(name, handle);
    for (const name of RETURN_EVENTS.window) win.removeEventListener(name, handle);
  };
}

/** How often the page re-reads the clock to notice a read going stale. */
const FRESHNESS_TICK_MS = 15_000;

/**
 * The live match page's freshness and its self-healing reads.
 *
 * - Re-evaluates `liveFreshness` every 15 seconds while the read says live, so
 *   a read that stops being refreshed turns `stale` on screen by itself.
 * - Refetches when the reader comes back and the read is older than 15
 *   seconds: the tab shown again (`visibilitychange`), the page restored from
 *   the back/forward cache (`pageshow`, which React Query does not hear), the
 *   window focused, the network back (`online`). React Query refetches on the
 *   first and the last too, but only for a query it holds as stale and with
 *   timers a phone may have frozen; asking again here is idempotent (a refetch
 *   already in flight is not cancelled).
 *
 * Until the page has mounted it answers `fresh` (or `not_live`) and
 * `mounted: false`: the server render and the first browser render agree, and
 * the age of the read is only told once the browser's own clock reads it.
 *
 * `refetch` must not throw; React Query's does not.
 */
export function useLiveFreshness({
  match,
  updatedAt,
  refetch,
}: {
  match: Pick<Match, "status" | "kickoff"> | undefined;
  updatedAt: number;
  refetch: () => unknown;
}): { freshness: LiveFreshness; now: number; mounted: boolean } {
  const [now, setNow] = useState(() => Date.now());
  const [mounted, setMounted] = useState(false);
  const live = match?.status === "live";
  // The listeners read the latest values without being re-registered.
  const latest = useRef({ match, updatedAt, refetch });
  latest.current = { match, updatedAt, refetch };

  useEffect(() => {
    if (!live) return;
    setNow(Date.now());
    const tick = window.setInterval(() => setNow(Date.now()), FRESHNESS_TICK_MS);
    const stop = watchReturns(window, document, () => {
      const at = Date.now();
      setNow(at);
      const current = latest.current;
      if (shouldRefetchOnReturn(current.match, current.updatedAt, at)) current.refetch();
    });
    return () => {
      window.clearInterval(tick);
      stop();
    };
  }, [live]);

  // A new read is news at once: no need to wait for the next tick.
  useEffect(() => {
    setNow(Date.now());
    setMounted(true);
  }, [updatedAt]);

  if (!mounted) return { freshness: live ? "fresh" : "not_live", now, mounted };
  return { freshness: liveFreshness(match, updatedAt, now), now, mounted };
}
