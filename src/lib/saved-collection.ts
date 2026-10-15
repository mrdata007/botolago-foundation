import type { AuthStatus } from "@/services/auth-types";
import type { Article } from "@/types/domain";

/**
 * The reader's saved-articles collection (`/profile/saved`): what one row of it
 * can be, which cache entry holds it, and when it may be fetched.
 *
 * Kept free of React and of the services so the rules -- whose list this is,
 * what an unsave does to it, what a story that is gone looks like -- run in a
 * plain test.
 */

/**
 * One saved story. `unavailable` is a save whose story can no longer be opened
 * (unpublished, withdrawn, or deleted): the reader keeps a row they can remove,
 * instead of the list silently losing it or the page failing.
 */
export type SavedEntry =
  | { kind: "article"; article: Article }
  | { kind: "unavailable"; id: string };

export const savedEntryId = (entry: SavedEntry): string =>
  entry.kind === "article" ? entry.article.id : entry.id;

/**
 * The cache key of the collection. Every key that holds one account's data
 * carries that account's id (`@/auth/account-queries`): `forgetAccount` removes
 * exactly the entries naming the account that leaves, so a second account on
 * the same phone starts from nothing and an answer still in flight for the
 * first is dropped. A reader with no account has no collection to cache, so
 * the key says so rather than sharing an entry.
 */
export function savedCollectionQueryKey(accountId: string | null) {
  return ["news", "saved-collection", accountId ?? "anonymous"] as const;
}

/**
 * Whether the collection may be fetched now.
 *
 *   - supabase mode: only for a signed-in account. The list lives on the
 *     server, per account; a guest or a visitor has none, and an account that
 *     still owes the second factor must not read it.
 *   - mock (preview) mode: the list lives on the device, whoever is signed in.
 */
export function savedCollectionEnabled(
  mode: "mock" | "supabase",
  status: AuthStatus,
  hydrated: boolean,
): boolean {
  if (mode === "mock") return hydrated;
  return status === "authenticated";
}

/**
 * The rows to draw: the fetched entries minus the stories the reader has
 * unsaved since. The collection is fetched in pages and the saved-ids set is
 * updated the instant a toggle is made (optimistically, and rolled back if the
 * server refuses), so filtering by it makes an unsave visible at once, with no
 * second request, and a refused one comes back by itself.
 *
 * Until the ids are known (`idsKnown` false) nothing is hidden: a list that
 * flashed empty while its own count loaded would read as "you saved nothing".
 */
export function visibleSavedEntries(
  entries: readonly SavedEntry[],
  savedIds: readonly string[],
  idsKnown: boolean,
): SavedEntry[] {
  if (!idsKnown) return [...entries];
  const saved = new Set(savedIds);
  return entries.filter((entry) => saved.has(savedEntryId(entry)));
}
