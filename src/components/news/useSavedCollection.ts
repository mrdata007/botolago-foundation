import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/provider";
import { NEWS_ENABLED } from "@/lib/feature-flags";
import { useSavedArticles } from "@/lib/saved-articles";
import {
  savedCollectionEnabled,
  savedCollectionPhase,
  savedCollectionQueryKey,
  visibleSavedEntries,
  type SavedEntry,
} from "@/lib/saved-collection";
import { getNewsDataMode, newsService, SAVED_IDS_LIMIT } from "@/services/news";

/**
 * The reader's saved-articles collection, ready for `SavedArticlesView`.
 *
 * Whose list: in production the server keeps it per account and the cache key
 * carries the account id (`savedCollectionQueryKey`), so signing out or
 * switching accounts drops the previous account's entry
 * (`@/auth/account-queries`) and a reader with no account never has a query at
 * all. In preview (mock) mode the list lives on the device, as the save
 * toggles do.
 *
 * Unsaving goes through the same toggle as every bookmark in the app. Its
 * optimistic update changes the saved ids at once, and the rows shown are the
 * fetched ones that are still in that set, so a row disappears the moment it is
 * unsaved and comes back if the server refuses.
 */
export function useSavedCollection() {
  const mode = getNewsDataMode();
  const { user, status } = useAuth();
  const { lang } = useI18n();
  // `fresh`: re-read the saved ids on arrival, so a story saved on another
  // device in the last 30 seconds is not hidden by a cached answer.
  const saved = useSavedArticles({ fresh: true });
  const accountId = user?.id ?? null;

  const enabled = NEWS_ENABLED && savedCollectionEnabled(mode, status, saved.idsKnown);
  const query = useInfiniteQuery({
    queryKey: [...savedCollectionQueryKey(accountId), mode, mode === "mock" ? lang : "account"],
    enabled,
    initialPageParam: null as string | null,
    queryFn: async ({
      pageParam,
    }): Promise<{ entries: SavedEntry[]; nextCursor: string | null }> =>
      mode === "mock"
        ? { entries: await newsService.resolveSavedIds(saved.ids, lang), nextCursor: null }
        : newsService.getSavedEntries(pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 0,
  });

  const fetched = useMemo(
    () => (query.data?.pages ?? []).flatMap((page) => page.entries),
    [query.data],
  );
  const entries = useMemo(
    () =>
      visibleSavedEntries(fetched, saved.ids, saved.idsKnown, {
        complete: saved.complete,
        removed: saved.removed ?? [],
      }),
    [fetched, saved.ids, saved.idsKnown, saved.complete, saved.removed],
  );

  const phase = savedCollectionPhase({
    mode,
    status,
    isError: query.isError,
    hasData: query.data !== undefined,
    isFetching: query.isFetching,
  });

  return {
    phase,
    entries,
    // The account has more saves than the app counts (2,000): the page says
    // so instead of implying the list it shows is all of it.
    overCount:
      saved.idsKnown && !saved.complete ? Math.min(saved.ids.length, SAVED_IDS_LIMIT) : null,
    hasMore: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    moreFailed: query.isFetchNextPageError,
    retry: () => void query.refetch(),
    loadMore: () => void query.fetchNextPage(),
    remove: (id: string) => saved.unsave(id),
  };
}
