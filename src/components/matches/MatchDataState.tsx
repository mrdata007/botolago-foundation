import { EmptyState, UnavailableState } from "@/components/common/States";
import { isDataUnavailable, type MatchDataPhase } from "./match-empty-states";

/**
 * What a match panel (Résumé, Stats, Compos) shows with nothing in it: the
 * empty panel while the data is still expected, the unavailable one once it is
 * not. The words are the panel's (`noStatsMessage` and its siblings); this
 * picks the look that matches them. The match's identity and its tabs stay on
 * the page around it.
 */
export function MatchDataState({ phase, message }: { phase: MatchDataPhase; message: string }) {
  return isDataUnavailable(phase) ? (
    <UnavailableState>{message}</UnavailableState>
  ) : (
    <EmptyState>{message}</EmptyState>
  );
}
