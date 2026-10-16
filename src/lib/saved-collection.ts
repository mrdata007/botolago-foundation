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
 * The reader's saved story ids, as the app holds them.
 *
 * The server pages the list at 50 and the app reads at most 2,000 ids
 * (`collectSavedIds`). `complete` says whether `ids` is the whole list. When it
 * is not (the account has more than 2,000 saves), `ids` is only the newest
 * 2,000, and the absence of an id from it proves nothing: the story may well be
 * saved. Everything that reads the set must ask `savedStateOf` rather than
 * `ids.includes`.
 *
 * `removed` (partial sets only) holds the stories the reader has unsaved in
 * this session that the partial set never listed, so they stay unsaved on
 * screen instead of falling back to what the page was loaded with.
 */
export interface SavedIdsSnapshot {
  ids: string[];
  complete: boolean;
  removed: string[];
}

/**
 * Whether one story is saved: `true`, `false`, or `null` when this snapshot
 * cannot tell (the set is partial, the story is not in it, and the caller has
 * no server answer for it). `serverSaved` is the answer that came with the
 * story itself (`isSaved` on a card or the article page), read by the server.
 */
export function savedStateOf(
  snapshot: SavedIdsSnapshot | undefined,
  id: string,
  serverSaved?: boolean,
): boolean | null {
  // No snapshot means the saved ids are not known for this reader (signed out,
  // not read yet, or the read failed). The server's per-story answer in the
  // shared news caches is NOT trusted then: those caches are not kept per
  // account, so it may be another account's answer. Only a partial set of
  // THIS account's ids may fall back to it, below. (On sign-out or a switch
  // the outgoing account's marks are also cleared from those caches:
  // `forgetViewerSavedMarks` in `@/auth/account-queries`.)
  if (!snapshot) return null;
  if (snapshot.ids.includes(id)) return true;
  if (snapshot.complete) return false;
  if (snapshot.removed.includes(id)) return false;
  return serverSaved ?? null;
}

/**
 * What a tap on a story's bookmark does, from what the app knows:
 *
 *   - `unsave` / `save`: the app knows the story's state (the ids are the whole
 *     list, or name the story, or the reader unsaved it this session), so the
 *     tap flips it;
 *   - `ask`: it does not (the reader has more than 2,000 saves and the story is
 *     outside the newest 2,000, or the ids are not read yet). The caller must
 *     ask the server about that story first; guessing "not saved" would send a
 *     save for a story the reader meant to remove.
 */
export function planSavedToggle(
  snapshot: SavedIdsSnapshot | undefined,
  id: string,
): "save" | "unsave" | "ask" {
  if (snapshot?.ids.includes(id)) return "unsave";
  if (snapshot?.complete || snapshot?.removed.includes(id)) return "save";
  return "ask";
}

/**
 * What to do once the server has answered for a story the app could not decide.
 * The reader tapped the bookmark as it was drawn (`shown`), meaning "the
 * opposite of that". If the server already holds the opposite, there is
 * nothing to write: sending the flip of the server's answer would do the
 * reverse of the tap (an "Enregistrer" button on a saved story, tapped, would
 * unsave it). The caller records `serverSaved` so the button shows the truth.
 * Otherwise the write is the flip of the server's answer.
 */
export function resolveAskedToggle(
  shown: boolean,
  serverSaved: boolean,
): { write: false } | { write: true; saved: boolean } {
  if (serverSaved === !shown) return { write: false };
  return { write: true, saved: serverSaved };
}

/** The snapshot after `id` is saved (`nowSaved`) or unsaved. */
export function withSavedState(
  snapshot: SavedIdsSnapshot,
  id: string,
  nowSaved: boolean,
): SavedIdsSnapshot {
  if (nowSaved) {
    return {
      ...snapshot,
      ids: [...new Set([...snapshot.ids, id])],
      removed: snapshot.removed.filter((value) => value !== id),
    };
  }
  return {
    ...snapshot,
    ids: snapshot.ids.filter((value) => value !== id),
    removed: snapshot.complete ? [] : [...new Set([...snapshot.removed, id])],
  };
}

/**
 * A fresh read of the ids, keeping what the reader unsaved this session while
 * the set is still partial (the server agrees by now, but the stories that came
 * with the page still say "saved"). Ids the fresh read lists are dropped from
 * `removed`.
 */
export function mergeSavedSnapshot(
  fresh: { ids: string[]; complete: boolean },
  previous: SavedIdsSnapshot | undefined,
): SavedIdsSnapshot {
  if (fresh.complete) return { ...fresh, removed: [] };
  const listed = new Set(fresh.ids);
  return { ...fresh, removed: (previous?.removed ?? []).filter((id) => !listed.has(id)) };
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
 *
 * A partial id set (`partial`, the account has more than 2,000 saves) never
 * filters a loaded page: a story missing from it may be saved, and the server
 * list this page came from is the truth. Only the stories unsaved here are
 * hidden.
 */
export function visibleSavedEntries(
  entries: readonly SavedEntry[],
  savedIds: readonly string[],
  idsKnown: boolean,
  partial?: { complete: boolean; removed: readonly string[] },
): SavedEntry[] {
  if (!idsKnown) return [...entries];
  if (partial && !partial.complete) {
    const removed = new Set(partial.removed);
    return entries.filter((entry) => !removed.has(savedEntryId(entry)));
  }
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
