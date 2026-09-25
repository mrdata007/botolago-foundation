// Forgetting the outgoing account's cached answers.
//
// Every query that holds one account's data puts that account's id in its key:
// Fantasy (`owned-fantasy`, source, uid, …), Pronostics (`mine`, uid, …),
// notification preferences, saved articles and followed clubs. That keeps two
// accounts' answers apart in the cache, but it does not remove the first one's
// when the second signs in on the same phone, and an answer still in flight
// for the first account would land after the switch.
//
// Followed clubs used to be keyed by the auth STATUS instead (the key ended in
// `authenticated` rather than an account id), so account A and account B
// shared one entry: after A signed out and B signed in, B saw A's
// clubs -- and the follow button, reading them, chose "unfollow" for a club B
// had never followed (audit 2026-09-25, A06).

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { forgetAccountPredictions } from "@/components/predictions/predictions-runtime";
import type { AuthSession } from "@/services/auth-types";
import { cleanupOwnedFantasyOnSignOut } from "@/services/fantasy-signout-cleanup";
import { sessionAccountId } from "./second-factor";

/**
 * True when a cache key names account `uid`. Keys are shallow arrays and an
 * account id is a UUID, which no public key contains, so "the id is one of the
 * key's parts" is exactly "this entry belongs to that account".
 */
export function queryKeyNamesAccount(key: QueryKey, uid: string): boolean {
  return Array.isArray(key) && key.includes(uid);
}

/**
 * Cancel and remove every query that belongs to `uid`, and nothing else.
 *
 * Removing a query also cancels its fetch (TanStack Query destroys it), so a
 * response for the outgoing account that arrives late is dropped rather than
 * written back into the cache. The explicit cancel says so where it is read.
 *
 * Only the outgoing account's keys go. The incoming account's queries were
 * created by the very render that switched accounts; removing those would
 * strand their observers on a query that no longer exists (the Fantasy screens
 * sat on their loading placeholders that way, see `clearOtherOwnersFantasyCache`).
 */
export function forgetAccountQueries(queryClient: QueryClient, uid: string): void {
  const predicate = (query: { queryKey: QueryKey }) => queryKeyNamesAccount(query.queryKey, uid);
  void queryClient.cancelQueries({ predicate });
  queryClient.removeQueries({ predicate });
}

/**
 * Everything this device holds for account `uid` and nobody else may see: its
 * owned Fantasy cache and drafts, its Pronostics, and every other query keyed
 * by it (followed clubs, notification preferences, saved articles), in flight
 * or not. Public caches and a guest's local prototype data stay.
 */
export function forgetAccount(queryClient: QueryClient, uid: string): void {
  cleanupOwnedFantasyOnSignOut({ qc: queryClient, uid });
  forgetAccountPredictions(queryClient);
  forgetAccountQueries(queryClient, uid);
}

/**
 * Follows the published sessions and calls `onLeave(uid)` once each time the
 * device stops holding account `uid`: a sign-out, or another account signing
 * in. AuthProvider feeds it every session it receives.
 *
 * Owing the second factor is not leaving. A session that reaches
 * `mfa_required` still belongs to the same account (`sessionAccountId`), and
 * the commonest way there is a save the server refused for want of the code:
 * forgetting the account at that point deleted the Fantasy draft that save had
 * just kept, so the manager came back from the code to nothing. A sign-out or
 * a different account from that state is still a leave.
 */
export function watchAccountSwitch(onLeave: (uid: string) => void): (session: AuthSession) => void {
  let current: string | null = null;
  return (session) => {
    const next = sessionAccountId(session);
    if (current && current !== next) onLeave(current);
    current = next;
  };
}
