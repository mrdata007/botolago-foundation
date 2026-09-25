import type { QueryClient } from "@tanstack/react-query";
import { GuestPredictionStore } from "@/backend/predictions/guest-store";

/**
 * The two pieces of Pronostics state that live for the whole visit, outside
 * React: the gap between the server's clock and the phone's, and the guest
 * store. Kept free of React and auth imports so the sign-in import
 * (`guest-claim.ts`, called from AuthProvider) can use them without a cycle.
 */

/** The gap between the server's clock and the phone's, from the last answer. */
let serverOffsetMs = 0;

export function noteServerTime(serverTime: string): void {
  const server = Date.parse(serverTime);
  if (Number.isFinite(server)) serverOffsetMs = server - Date.now();
}

/** The server's clock as the page knows it: lock states follow this, never the phone. */
export function serverNow(): number {
  return Date.now() + serverOffsetMs;
}

let guestStore: GuestPredictionStore | null = null;

export function getGuestStore(): GuestPredictionStore {
  guestStore ??= new GuestPredictionStore();
  return guestStore;
}

/**
 * Forgets every Pronostics answer in the cache when account `uid` leaves
 * (sign-out, or another account signing in on the same phone): a private
 * league's members, rankings with "me" in them, the last account's picks. A
 * key that already carries the account keeps them apart; this makes sure none
 * outlives the session that fetched it. The guest store on the phone is not
 * touched.
 *
 * Only `uid`'s own entries are removed. The others carry no account (the
 * journée, a visitor's board) and the render that switched accounts has
 * already built them for the next session and started their reads: removing
 * them, as this did until 2026-09-25, cancelled those reads and left the
 * screens pending for good. They are reset instead: the answer they hold is
 * dropped at once -- one fetched while the session was still being read can
 * hold the last account's line on a board -- the query stays with its
 * observers, and the ones on screen are asked again, with the session current
 * now. Invalidating would keep showing the old answer until the new one came.
 */
export function forgetAccountPredictions(
  queryClient: Pick<QueryClient, "removeQueries" | "resetQueries">,
  uid: string,
): void {
  const namesAccount = (key: readonly unknown[]) => key.includes(uid);
  queryClient.removeQueries({
    queryKey: ["predictions"],
    predicate: (query) => namesAccount(query.queryKey),
  });
  void queryClient.resetQueries({
    queryKey: ["predictions"],
    predicate: (query) => !namesAccount(query.queryKey),
  });
}
