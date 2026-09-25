import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useI18n } from "@/i18n/provider";
import { liveStripRefetchInterval } from "@/lib/match-refresh";
import { footballService } from "@/services/football";
import type { Match } from "@/types/domain";

/**
 * The matches in play, at the live strip's pace (`liveStripRefetchInterval`:
 * every 30 seconds while one is live, a slow watch otherwise, never from a
 * hidden tab). One query, shared by the strip and by what has to react to a
 * match finishing.
 */
export function useLiveMatches() {
  const { lang } = useI18n();
  return useQuery({
    queryKey: ["football", "live-matches", lang],
    queryFn: () => footballService.getLiveMatches(lang),
    // Scores and minutes move while a match is on; with nothing live it keeps
    // a slow watch, so a match that kicks off brings the strip up.
    refetchInterval: (query) => liveStripRefetchInterval(query.state.data?.matches.length ?? 0),
    refetchIntervalInBackground: false,
  });
}

/** The matches in `before` that `after` no longer has: they stopped being in play. */
export function endedMatchIds(before: ReadonlySet<string>, after: ReadonlySet<string>): string[] {
  return [...before].filter((id) => !after.has(id));
}

/** The live list as read at one moment: its query's `dataUpdatedAt`. */
export interface LiveReading {
  readonly matches: readonly Match[];
  readonly updatedAt: number;
}

const idsOf = (matches: readonly Match[]): ReadonlySet<string> =>
  new Set(matches.map((match) => match.id));

/**
 * Calls `onEnd` when a match that was in play leaves the live list — it has
 * finished (or stopped) — so a table worked out from the results takes the
 * result in while the page stays open, instead of waiting for a focus or a
 * route change. It rides the live strip's polling: no request of its own.
 * `ended` names the matches that left, for a page that only has to react
 * when one of them is on it (the Matches calendar's day); `lastReading` is
 * the list's reading from just before they left, the last word the strip
 * had on them.
 */
export function useOnLiveMatchEnd(
  onEnd: (ended: readonly string[], lastReading: LiveReading) => void,
) {
  const { data, dataUpdatedAt } = useLiveMatches();
  const latest = useRef(onEnd);
  useEffect(() => {
    latest.current = onEnd;
  });
  const seen = useRef<LiveReading | null>(null);
  useEffect(() => {
    if (!data) return;
    const before = seen.current;
    seen.current = { matches: data.matches, updatedAt: dataUpdatedAt };
    if (!before) return;
    const ended = endedMatchIds(idsOf(before.matches), idsOf(data.matches));
    if (ended.length > 0) latest.current(ended, before);
  }, [data, dataUpdatedAt]);
}
