import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/provider";
import { NEWS_ENABLED } from "@/lib/feature-flags";
import { useSavedArticles } from "@/lib/saved-articles";
import {
  savedCollectionEnabled,
  savedCollectionQueryKey,
  visibleSavedEntries,
  type SavedEntry,
} from "@/lib/saved-collection";
import { getNewsDataMode, newsService } from "@/services/news";
import type { SavedArticlesPhase } from "./SavedArticlesView";

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
  const saved = useSavedArticles();
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
    () => visibleSavedEntries(fetched, saved.ids, saved.idsKnown),
    [fetched, saved.ids, saved.idsKnown],
  );

  let phase: SavedArticlesPhase;
  if (mode === "supabase" && status === "loading") phase = "loading";
  else if (mode === "supabase" && status !== "authenticated") phase = "signin";
  else if (query.isError && !query.data && !query.isFetching) phase = "error";
  else if (!query.data) phase = "loading";
  else phase = "ready";

  return {
    phase,
    entries,
    hasMore: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    moreFailed: query.isFetchNextPageError,
    retry: () => void query.refetch(),
    loadMore: () => void query.fetchNextPage(),
    remove: (id: string) => saved.toggle(id),
  };
}
