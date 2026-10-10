import { useEffect, useMemo, useRef, useState } from "react";

import type { HistoryRowDto } from "@/backend/manager-card/contracts";
import { prefersReducedMotion } from "@/lib/motion";
import { useMyManagerCardHistory } from "@/services/use-manager-card";

import { ratingChange, shouldPop } from "./rating-change";
import { useLaunchGate } from "./use-launch-gate";

const NO_ROWS: readonly HistoryRowDto[] = [];

/** What `RatingLine` draws for the rating change chip: the signed change, and whether it pops. */
export interface RatingBadge {
  delta: number;
  pop: boolean;
}

/**
 * The rating change chip of the rating line, or null when there is none to draw: no history read
 * yet, no earlier number, no change, or the launch gate (splash, language chooser) still closed.
 * It reads the newest page of the season's stored journées, which the card page reads anyway.
 *
 * The pop is decided once per round on this phone, after the launch gate opens (`shouldPop`); under
 * reduced motion the chip is drawn at once and never pops.
 */
export function useRatingBadge(input: {
  ovr: number | null;
  newSeason: boolean;
  seasonId: string;
}): RatingBadge | null {
  const { ovr, newSeason, seasonId } = input;
  const query = useMyManagerCardHistory(null);
  const rows = query.data?.pages[0]?.items ?? NO_ROWS;
  const change = useMemo(
    () => ratingChange({ rows, ovr, newSeason, seasonId }),
    [rows, ovr, newSeason, seasonId],
  );
  const open = useLaunchGate();
  const [decided, setDecided] = useState<{ round: string; pop: boolean } | null>(null);
  const decidedRound = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !change || decidedRound.current === change.round) return;
    decidedRound.current = change.round;
    const popped = shouldPop(change.round);
    setDecided({ round: change.round, pop: popped && !prefersReducedMotion() });
  }, [open, change]);
  if (!change || !decided || decided.round !== change.round) return null;
  return { delta: change.delta, pop: decided.pop };
}
