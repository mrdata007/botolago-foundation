import type { GuestPredictionStore } from "@/backend/predictions/guest-store";
import type { AnalyticsEvent } from "@/lib/analytics";

/**
 * What a guest's pick tells the statistics (plan §11), each at most once per
 * journée per phone, remembered in the guest store and nowhere else: the first
 * pick of a journée ("start", plus "start_returning" when this phone also
 * played the journée before), and the pick that leaves no open match without
 * a prediction ("complete"). Call it after the pick is stored.
 */
export function guestRoundEvents(
  store: GuestPredictionStore,
  seasonId: string,
  round: number,
  openFixtureIds: readonly string[],
): AnalyticsEvent[] {
  const events: AnalyticsEvent[] = [];
  if (store.markRoundStarted(seasonId, round)) {
    events.push("pronostics_guest_start");
    if (store.hasStartedRound(seasonId, round - 1)) {
      events.push("pronostics_guest_start_returning");
    }
  }
  const { predictions } = store.read();
  if (
    openFixtureIds.length > 0 &&
    openFixtureIds.every((id) => id in predictions) &&
    store.markRoundCompleted(seasonId, round)
  ) {
    events.push("pronostics_guest_complete");
  }
  return events;
}
