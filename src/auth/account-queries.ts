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
 *
 * Like `forgetAccountQueries`, it removes only what names `uid`. Until
 * 2026-09-25 the Fantasy and Pronostics steps removed every owned-Fantasy
 * entry and every Pronostics entry, the incoming session's included, and
 * those screens stayed on their loading placeholders. The Pronostics entries
 * that name no account are reset rather than kept as they are: see
 * `forgetAccountPredictions`.
 */
export function forgetAccount(queryClient: QueryClient, uid: string): void {
  cleanupOwnedFantasyOnSignOut({ qc: queryClient, uid });
  forgetAccountPredictions(queryClient, uid);
  forgetAccountQueries(queryClient, uid);
  forgetViewerSavedMarks(queryClient);
}

/** The News entries that are keyed by an account and so are removed, not rewritten. */
const ACCOUNT_KEYED_NEWS = new Set(["saved-collection", "saved-article-ids"]);

/** `value` with every `isSaved: true` set to false; the same object if there is none. */
function withoutSavedMarks(value: unknown): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const rewritten = withoutSavedMarks(item);
      if (rewritten !== item) changed = true;
      return rewritten;
    });
    return changed ? next : value;
  }
  if (value === null || typeof value !== "object") return value;
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const rewritten = key === "isSaved" && item === true ? false : withoutSavedMarks(item);
    if (rewritten !== item) changed = true;
    next[key] = rewritten;
  }
  return changed ? next : value;
}

/**
 * The public News caches (`["news", "feed-v2", ...]`, the article page, home
 * modules, related, club and edition reads) name no account, yet in the
 * browser each answer was read with the signed-in reader's session, so every
 * article in it carries THAT reader's `isSaved`. Left in place after a
 * sign-out or a switch, the previous account's bookmarks were served to the
 * next reader of the same browser (`savedStateOf` falls back to the story's
 * own answer for an account with more than 2,000 saves).
 *
 * The outgoing account's marks are set back to "not saved", which is what a
 * visitor with no account is given. The entries stay where they are, so a
 * mounted screen keeps its articles (nothing refetches, nothing blinks) and
 * an entry with no mark in it is not touched at all. The data keeps its age.
 * An answer for the outgoing account that is still in flight when it leaves
 * is not caught here.
 */
export function forgetViewerSavedMarks(queryClient: QueryClient): void {
  for (const query of queryClient.getQueryCache().findAll({ queryKey: ["news"] })) {
    if (ACCOUNT_KEYED_NEWS.has(String(query.queryKey[1]))) continue;
    const data = query.state.data;
    if (data === undefined) continue;
    const cleaned = withoutSavedMarks(data);
    if (cleaned === data) continue;
    queryClient.setQueryData(query.queryKey, cleaned, { updatedAt: query.state.dataUpdatedAt });
  }
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
