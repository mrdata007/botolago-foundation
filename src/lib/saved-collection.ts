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
 * One saved story.
 *
 * `unavailable` (a save whose story can no longer be opened, kept as a row the
 * reader can remove) exists in PREVIEW (mock) mode only, where the device holds
 * the ids and asks for each story. In production it never occurs: the server's
 * `api.news_saved_articles` keeps only stories `news_is_public` accepts, so a
 * withdrawn or deleted story is left out of the list AND of the count, and its
 * `app.saved_articles` row stays orphaned where the reader cannot see or remove
 * it. Showing those rows in production needs a server function that returns
 * them (a migration), recorded as a follow-up.
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

/** Which of its states the collection page is in. */
export type SavedCollectionPhase = "loading" | "signin" | "error" | "ready";

/**
 * The page's state from the facts that decide it. A failed first read is
 * `error` (with a retry), never an empty list; a retry in flight is `loading`
 * again, not a stuck error; a reader with no signed-in account (production) is
 * asked to sign in rather than shown a list that cannot exist.
 */
export function savedCollectionPhase(input: {
  mode: "mock" | "supabase";
  status: AuthStatus;
  isError: boolean;
  hasData: boolean;
  isFetching: boolean;
}): SavedCollectionPhase {
  if (input.mode === "supabase" && input.status === "loading") return "loading";
  if (input.mode === "supabase" && input.status !== "authenticated") return "signin";
  if (input.isError && !input.hasData && !input.isFetching) return "error";
  if (!input.hasData) return "loading";
  return "ready";
}

/** Ids that were in the previous list and are not in the next one. */
export function removedSavedIds(previous: readonly string[], next: readonly string[]): string[] {
  const kept = new Set(next);
  return previous.filter((id) => !kept.has(id));
}

/**
 * Where keyboard focus goes when the row that held it is removed: the next row
 * that survives, else the previous one, else `null` (the caller then focuses
 * the list's container). Without this the removed row's button unmounts and
 * focus falls to the document body.
 */
export function focusTargetAfterRemoval(
  previous: readonly string[],
  next: readonly string[],
  focusedId: string,
): string | null {
  const at = previous.indexOf(focusedId);
  if (at < 0) return null;
  const kept = new Set(next);
  for (let i = at + 1; i < previous.length; i += 1) if (kept.has(previous[i]!)) return previous[i]!;
  for (let i = at - 1; i >= 0; i -= 1) if (kept.has(previous[i]!)) return previous[i]!;
  return null;
}
