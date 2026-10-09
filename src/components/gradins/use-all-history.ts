import { useEffect } from "react";

import { useMyManagerCardHistory } from "@/services/use-manager-card";

/**
 * Every stored journée of one season, newest first. The history comes 20 a page; a page that
 * wants all of it (the « Revoir » list needs the earliest rows) keeps asking for the next one
 * until there is none. A season has at most a few dozen journées, so this is a handful of reads.
 */
export function useAllHistory(seasonId: string | null) {
  const query = useMyManagerCardHistory(seasonId);
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = query;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage]);
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
  return {
    rows,
    pending: query.isPending || (hasNextPage === true && !isError),
    error: query.isError,
    refetch: () => void query.refetch(),
    query,
  };
}
